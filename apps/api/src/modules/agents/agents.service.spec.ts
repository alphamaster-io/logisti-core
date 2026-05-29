import { ConflictException, NotFoundException } from '@nestjs/common';
import { AgentsService } from './agents.service';

describe('AgentsService', () => {
  const user = { id: 'u1', tenantId: 't1' } as never;
  const prisma = {
    branch: { findFirst: jest.fn() },
    agent: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    boxNumberBatch: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as ConstructorParameters<typeof AgentsService>[0];
  const svc = new AgentsService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('rejects an agent with an invalid branch', async () => {
    (prisma.branch.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      svc.create(user, { code: 'AG-001', name: 'a', branchId: 'b1' } as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('translates unique-code violation to 409', async () => {
    (prisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: 'b1' });
    (prisma.agent.create as jest.Mock).mockRejectedValue({
      code: 'P2002',
      meta: { target: ['tenantId', 'code'] },
    });
    await expect(svc.create(user, { code: 'AG-001', name: 'a' } as never)).rejects.toThrow(
      ConflictException,
    );
  });

  it('issues a batch with computed endSeq + nextSeq', async () => {
    (prisma.agent.findFirst as jest.Mock).mockResolvedValue({
      id: 'a1',
      isActive: true,
      deletedAt: null,
    });
    (prisma.boxNumberBatch.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.boxNumberBatch.create as jest.Mock).mockImplementation(({ data }) => ({
      id: 'b1',
      ...data,
    }));
    const out = await svc.issueBatch(user, 'a1', {
      prefix: 'EX-AG-001-',
      startSeq: 1,
      count: 100,
    });
    expect(out).toMatchObject({ id: 'b1', startSeq: 1, endSeq: 100, nextSeq: 1 });
    const call = (prisma.boxNumberBatch.create as jest.Mock).mock.calls[0]![0];
    expect(call.data.endSeq).toBe(100);
    expect(call.data.nextSeq).toBe(1);
  });

  it('refuses overlapping batch ranges on the same agent + prefix', async () => {
    (prisma.agent.findFirst as jest.Mock).mockResolvedValue({
      id: 'a1',
      isActive: true,
      deletedAt: null,
    });
    (prisma.boxNumberBatch.findFirst as jest.Mock).mockResolvedValue({
      id: 'b0',
      startSeq: 80,
      endSeq: 120,
    });
    await expect(
      svc.issueBatch(user, 'a1', { prefix: 'EX-AG-001-', startSeq: 100, count: 50 }),
    ).rejects.toThrow(ConflictException);
  });

  it('allocates next number atomically + formats it with 6-digit padding', async () => {
    (prisma.boxNumberBatch.findFirst as jest.Mock).mockResolvedValue({
      id: 'b1',
      status: 'ACTIVE',
      prefix: 'EX-AG-001-',
      startSeq: 1,
      endSeq: 100,
      nextSeq: 42,
    });
    (prisma.boxNumberBatch.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const out = await svc.allocateNextNumber(user, 'b1');
    expect(out.number).toBe('EX-AG-001-000042');
    expect(out.seq).toBe(42);
    expect(out.batchExhausted).toBe(false);
    expect(prisma.boxNumberBatch.update).not.toHaveBeenCalled();
  });

  it('marks the batch EXHAUSTED when the final number is allocated', async () => {
    (prisma.boxNumberBatch.findFirst as jest.Mock).mockResolvedValue({
      id: 'b1',
      status: 'ACTIVE',
      prefix: 'X-',
      startSeq: 1,
      endSeq: 5,
      nextSeq: 5,
    });
    (prisma.boxNumberBatch.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const out = await svc.allocateNextNumber(user, 'b1');
    expect(out.number).toBe('X-000005');
    expect(out.batchExhausted).toBe(true);
    const upd = (prisma.boxNumberBatch.update as jest.Mock).mock.calls[0]![0];
    expect(upd.data.status).toBe('EXHAUSTED');
  });

  it('retries on CAS conflict', async () => {
    const states = [
      { id: 'b1', status: 'ACTIVE', prefix: 'Y-', startSeq: 1, endSeq: 10, nextSeq: 3 },
      { id: 'b1', status: 'ACTIVE', prefix: 'Y-', startSeq: 1, endSeq: 10, nextSeq: 4 },
    ];
    (prisma.boxNumberBatch.findFirst as jest.Mock)
      .mockResolvedValueOnce(states[0])
      .mockResolvedValueOnce(states[1]);
    (prisma.boxNumberBatch.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 0 }) // lost the race
      .mockResolvedValueOnce({ count: 1 }); // won
    const out = await svc.allocateNextNumber(user, 'b1');
    expect(out.seq).toBe(4);
    expect(out.number).toBe('Y-000004');
  });

  it('lists ACTIVE batches with agent + remaining for the picker', async () => {
    (prisma.boxNumberBatch.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'b1',
        tenantId: 't1',
        agentId: 'a1',
        prefix: 'EX-AG-001-',
        startSeq: 1,
        endSeq: 100,
        nextSeq: 42,
        status: 'ACTIVE',
        agent: { code: 'AG-001', name: 'Agent 1', isActive: true },
      },
      {
        id: 'b2',
        tenantId: 't1',
        agentId: 'a2',
        prefix: 'EX-AG-002-',
        startSeq: 1,
        endSeq: 50,
        nextSeq: 1,
        status: 'ACTIVE',
        agent: { code: 'AG-002', name: 'Agent 2', isActive: false },
      },
    ]);
    const out = await svc.listActiveBatchesForPicker(user);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'b1',
      agentCode: 'AG-001',
      agentName: 'Agent 1',
      remaining: 59,
    });
    expect(out[0]).not.toHaveProperty('agent');
  });

  it('refuses allocation on a VOIDED batch', async () => {
    (prisma.boxNumberBatch.findFirst as jest.Mock).mockResolvedValue({
      id: 'b1',
      status: 'VOIDED',
      prefix: 'V-',
      startSeq: 1,
      endSeq: 5,
      nextSeq: 1,
    });
    await expect(svc.allocateNextNumber(user, 'b1')).rejects.toThrow(ConflictException);
  });
});
