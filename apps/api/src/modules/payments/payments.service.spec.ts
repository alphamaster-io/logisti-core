import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const user = { id: 'u1', tenantId: 't1' } as never;
  const prisma = {
    serviceOrder: { findFirst: jest.fn(), update: jest.fn() },
    box: { findFirst: jest.fn(), findMany: jest.fn() },
    agent: { findFirst: jest.fn() },
    paymentLine: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    serviceOrderEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as ConstructorParameters<typeof PaymentsService>[0];
  const svc = new PaymentsService(prisma);
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) drains the mockResolvedValueOnce
    // queue too, so leftover stubs from one test can't leak into the next.
    jest.resetAllMocks();
    // Default: run the tx callback against the same mock prisma so tests can
    // observe and stub the same call sites whether they run inside a tx or not.
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb(prisma),
    );
  });

  const order = { id: 'o1', status: 'DRAFT', tenantId: 't1' };

  it('records a positive charge with the stored sign positive', async () => {
    (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(order);
    (prisma.paymentLine.create as jest.Mock).mockImplementation(({ data }) => ({
      id: 'p1',
      ...data,
    }));
    const out = await svc.recordCharge(user, 'o1', {
      kind: 'BOX_BALANCE',
      amountMinor: 103500,
      currencyCode: 'php',
      reason: 'balance',
    });
    const call = (prisma.paymentLine.create as jest.Mock).mock.calls[0]![0];
    expect(call.data.amount).toBe(103500n);
    expect(call.data.currencyCode).toBe('PHP');
    expect(out.amount).toBe('103500');
  });

  it('stores RECEIVED as a negative amount', async () => {
    (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(order);
    (prisma.paymentLine.create as jest.Mock).mockImplementation(({ data }) => ({
      id: 'p1',
      ...data,
    }));
    // No charges → balance stays 0 → still triggers commission scan, but no
    // agent-tied boxes → no emission.
    (prisma.paymentLine.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.box.findMany as jest.Mock).mockResolvedValue([]);
    await svc.recordPayment(user, 'o1', { amountMinor: 500, currencyCode: 'HKD', reason: 'cash' });
    const call = (prisma.paymentLine.create as jest.Mock).mock.calls[0]![0];
    expect(call.data.kind).toBe('RECEIVED');
    expect(call.data.amount).toBe(-500n);
  });

  it('rejects a non-positive charge magnitude', async () => {
    (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(order);
    await expect(
      svc.recordCharge(user, 'o1', {
        kind: 'BOX_BALANCE',
        amountMinor: 0,
        currencyCode: 'PHP',
        reason: 'x',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('computes balance grouped by currency, excluding AGENT_COMMISSION', async () => {
    (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(order);
    (prisma.paymentLine.findMany as jest.Mock).mockResolvedValue([
      { kind: 'BOX_BALANCE', amount: 103500n, currencyCode: 'PHP' },
      { kind: 'RECEIVED', amount: -50000n, currencyCode: 'PHP' },
      { kind: 'BOX_DEPOSIT', amount: 5000n, currencyCode: 'HKD' },
    ]);
    const out = await svc.balance(user, 'o1');
    // The where-clause must exclude AGENT_COMMISSION so operator-payable
    // commission lines never bleed into customer-facing balance.
    const where = (prisma.paymentLine.findMany as jest.Mock).mock.calls[0]![0].where;
    expect(where.kind).toEqual({ not: 'AGENT_COMMISSION' });
    const php = out.find((b) => b.currencyCode === 'PHP')!;
    expect(php.totalCharges).toBe('103500');
    expect(php.totalReceipts).toBe('50000');
    expect(php.balanceDue).toBe('53500');
    const hkd = out.find((b) => b.currencyCode === 'HKD')!;
    expect(hkd.balanceDue).toBe('5000');
  });

  it('correction reverses the original amount', async () => {
    (prisma.paymentLine.findFirst as jest.Mock).mockResolvedValue({
      id: 'p1',
      serviceOrderId: 'o1',
      boxId: null,
      kind: 'BOX_BALANCE',
      amount: 103500n,
      currencyCode: 'PHP',
    });
    (prisma.paymentLine.create as jest.Mock).mockImplementation(({ data }) => ({
      id: 'c1',
      ...data,
    }));
    await svc.correct(user, 'p1', 'wrong price');
    const call = (prisma.paymentLine.create as jest.Mock).mock.calls[0]![0];
    expect(call.data.kind).toBe('CORRECTION');
    expect(call.data.amount).toBe(-103500n);
    expect(call.data.relatedLineId).toBe('p1');
  });

  it('refuses to bounce a non-RECEIVED line', async () => {
    (prisma.paymentLine.findFirst as jest.Mock).mockResolvedValue({
      id: 'p1',
      kind: 'BOX_BALANCE',
      amount: 100n,
      currencyCode: 'PHP',
      serviceOrderId: 'o1',
    });
    await expect(svc.bounce(user, 'p1', 'nsf')).rejects.toThrow(ConflictException);
  });

  it('404s when the order is missing', async () => {
    (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(svc.listForOrder(user, 'nope')).rejects.toThrow(NotFoundException);
  });

  describe('AGENT_COMMISSION emission', () => {
    // Stubs balance lines (read inside computeBalance) followed by boxes,
    // then (optionally) per-agent existence check, agent record, and
    // revenue lines.
    function stubReadsForCommissionScan(opts: {
      balanceLines: Array<{ kind: string; amount: bigint; currencyCode: string }>;
      boxes?: Array<{ id: string; agentId: string | null }>;
      existing?: { id: string } | null;
      agent?: {
        commissionPercent: { toString: () => string } | null;
        commissionPerBoxMinor: bigint | null;
        commissionCurrency: string | null;
      } | null;
      revenueLines?: Array<{ amount: bigint }>;
    }) {
      (prisma.paymentLine.findMany as jest.Mock)
        .mockResolvedValueOnce(opts.balanceLines)
        .mockResolvedValueOnce(opts.revenueLines ?? []);
      (prisma.box.findMany as jest.Mock).mockResolvedValue(opts.boxes ?? []);
      if (opts.existing !== undefined) {
        (prisma.paymentLine.findFirst as jest.Mock).mockResolvedValue(opts.existing);
      }
      if (opts.agent !== undefined) {
        (prisma.agent.findFirst as jest.Mock).mockResolvedValue(opts.agent);
      }
    }

    it('emits a per-box commission when the order is paid in full', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.paymentLine.create as jest.Mock).mockImplementation(({ data }) => ({
        id: 'p1',
        ...data,
      }));
      stubReadsForCommissionScan({
        // After the RECEIVED line: charges 1000 HKD, receipts 1000 HKD.
        balanceLines: [
          { kind: 'BOX_BALANCE', amount: 1000n, currencyCode: 'HKD' },
          { kind: 'RECEIVED', amount: -1000n, currencyCode: 'HKD' },
        ],
        boxes: [
          { id: 'bx1', agentId: 'a1' },
          { id: 'bx2', agentId: 'a1' },
        ],
        existing: null,
        agent: {
          commissionPercent: null,
          commissionPerBoxMinor: 500n,
          commissionCurrency: 'HKD',
        },
      });
      await svc.recordPayment(user, 'o1', {
        amountMinor: 1000,
        currencyCode: 'HKD',
        reason: 'cash',
      });
      const createCalls = (prisma.paymentLine.create as jest.Mock).mock.calls;
      const commission = createCalls.find((c) => c[0].data.kind === 'AGENT_COMMISSION');
      expect(commission).toBeDefined();
      expect(commission![0].data.amount).toBe(-1000n); // 500 × 2 boxes, stored negative
      expect(commission![0].data.agentId).toBe('a1');
      expect(commission![0].data.currencyCode).toBe('HKD');
    });

    it('emits a percent commission against gross revenue on the agent boxes', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.paymentLine.create as jest.Mock).mockImplementation(({ data }) => ({
        id: 'p1',
        ...data,
      }));
      stubReadsForCommissionScan({
        balanceLines: [
          { kind: 'BOX_BALANCE', amount: 10000n, currencyCode: 'HKD' },
          { kind: 'RECEIVED', amount: -10000n, currencyCode: 'HKD' },
        ],
        boxes: [{ id: 'bx1', agentId: 'a1' }],
        existing: null,
        agent: {
          commissionPercent: { toString: () => '7.50' },
          commissionPerBoxMinor: null,
          commissionCurrency: 'HKD',
        },
        revenueLines: [{ amount: 8000n }, { amount: 2000n }], // gross box-tied revenue
      });
      await svc.recordPayment(user, 'o1', {
        amountMinor: 10000,
        currencyCode: 'HKD',
        reason: 'card',
      });
      const commission = (prisma.paymentLine.create as jest.Mock).mock.calls.find(
        (c) => c[0].data.kind === 'AGENT_COMMISSION',
      );
      expect(commission).toBeDefined();
      expect(commission![0].data.amount).toBe(-750n); // 7.50% of 10000
    });

    it('does not emit when the order is still partially paid', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.paymentLine.create as jest.Mock).mockImplementation(({ data }) => ({
        id: 'p1',
        ...data,
      }));
      // Charges 1000, only 600 received.
      (prisma.paymentLine.findMany as jest.Mock).mockResolvedValueOnce([
        { kind: 'BOX_BALANCE', amount: 1000n, currencyCode: 'HKD' },
        { kind: 'RECEIVED', amount: -600n, currencyCode: 'HKD' },
      ]);
      await svc.recordPayment(user, 'o1', {
        amountMinor: 600,
        currencyCode: 'HKD',
        reason: 'cash',
      });
      expect(prisma.box.findMany).not.toHaveBeenCalled();
      const createCalls = (prisma.paymentLine.create as jest.Mock).mock.calls;
      expect(createCalls.every((c) => c[0].data.kind !== 'AGENT_COMMISSION')).toBe(true);
    });

    it('is idempotent — does not double-emit if a commission already exists for the agent', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.paymentLine.create as jest.Mock).mockImplementation(({ data }) => ({
        id: 'p1',
        ...data,
      }));
      stubReadsForCommissionScan({
        balanceLines: [
          { kind: 'BOX_BALANCE', amount: 1000n, currencyCode: 'HKD' },
          { kind: 'RECEIVED', amount: -1000n, currencyCode: 'HKD' },
        ],
        boxes: [{ id: 'bx1', agentId: 'a1' }],
        existing: { id: 'pc-existing' },
      });
      await svc.recordPayment(user, 'o1', {
        amountMinor: 1000,
        currencyCode: 'HKD',
        reason: 'cash',
      });
      // No new AGENT_COMMISSION line should be created.
      const createCalls = (prisma.paymentLine.create as jest.Mock).mock.calls;
      expect(createCalls.every((c) => c[0].data.kind !== 'AGENT_COMMISSION')).toBe(true);
      expect(prisma.agent.findFirst).not.toHaveBeenCalled();
    });

    it('skips agents without commission config', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.paymentLine.create as jest.Mock).mockImplementation(({ data }) => ({
        id: 'p1',
        ...data,
      }));
      stubReadsForCommissionScan({
        balanceLines: [
          { kind: 'BOX_BALANCE', amount: 1000n, currencyCode: 'HKD' },
          { kind: 'RECEIVED', amount: -1000n, currencyCode: 'HKD' },
        ],
        boxes: [{ id: 'bx1', agentId: 'a1' }],
        existing: null,
        agent: { commissionPercent: null, commissionPerBoxMinor: null, commissionCurrency: null },
      });
      await svc.recordPayment(user, 'o1', {
        amountMinor: 1000,
        currencyCode: 'HKD',
        reason: 'cash',
      });
      const createCalls = (prisma.paymentLine.create as jest.Mock).mock.calls;
      expect(createCalls.every((c) => c[0].data.kind !== 'AGENT_COMMISSION')).toBe(true);
    });
  });
});
