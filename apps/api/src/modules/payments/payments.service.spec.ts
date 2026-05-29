import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const user = { id: 'u1', tenantId: 't1' } as never;
  const prisma = {
    serviceOrder: { findFirst: jest.fn(), update: jest.fn() },
    box: { findFirst: jest.fn(), findMany: jest.fn() },
    paymentLine: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    serviceOrderEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as ConstructorParameters<typeof PaymentsService>[0];
  const svc = new PaymentsService(prisma);
  beforeEach(() => jest.clearAllMocks());

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

  it('computes balance grouped by currency', async () => {
    (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(order);
    (prisma.paymentLine.findMany as jest.Mock).mockResolvedValue([
      { kind: 'BOX_BALANCE', amount: 103500n, currencyCode: 'PHP' },
      { kind: 'RECEIVED', amount: -50000n, currencyCode: 'PHP' },
      { kind: 'BOX_DEPOSIT', amount: 5000n, currencyCode: 'HKD' },
    ]);
    const out = await svc.balance(user, 'o1');
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
});
