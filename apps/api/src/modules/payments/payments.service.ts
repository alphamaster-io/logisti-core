import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaymentLine, PaymentLineKind } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';

// Kinds whose natural sign is negative (reduce balance): discounts, receipts,
// commissions, redemptions. Charges are positive. The service normalises the
// stored sign so callers can always pass a positive magnitude.
const NEGATIVE_KINDS: ReadonlySet<PaymentLineKind> = new Set<PaymentLineKind>([
  'INSTANT_PACK_DISCOUNT',
  'TAKE_OUT_BOX_DISCOUNT',
  'LOYALTY_REDEMPTION',
  'AGENT_COMMISSION',
  'RECEIVED',
]);

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalize(line: PaymentLine): PaymentLine & { amount: string } {
    return { ...line, amount: line.amount.toString() as unknown as bigint } as PaymentLine & {
      amount: string;
    };
  }

  private async assertOrder(user: AuthenticatedUser, serviceOrderId: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: serviceOrderId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!order) throw new NotFoundException(`service order ${serviceOrderId} not found`);
    return order;
  }

  async recordCharge(
    user: AuthenticatedUser,
    serviceOrderId: string,
    dto: {
      kind: PaymentLineKind;
      amountMinor: number | string;
      currencyCode: string;
      reason: string;
      boxId?: string;
    },
  ): Promise<PaymentLine> {
    await this.assertOrder(user, serviceOrderId);
    const magnitude = BigInt(dto.amountMinor);
    if (magnitude <= 0n) {
      throw new BadRequestException('amountMinor must be a positive magnitude');
    }
    if (dto.boxId) {
      const box = await this.prisma.box.findFirst({
        where: { id: dto.boxId, serviceOrderId, tenantId: user.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!box) throw new NotFoundException(`box ${dto.boxId} not on this order`);
    }
    const signed = NEGATIVE_KINDS.has(dto.kind) ? -magnitude : magnitude;
    const line = await this.prisma.paymentLine.create({
      data: {
        tenantId: user.tenantId,
        serviceOrderId,
        boxId: dto.boxId ?? null,
        kind: dto.kind,
        amount: signed,
        currencyCode: dto.currencyCode.toUpperCase(),
        reason: dto.reason,
        recordedBy: user.id,
      },
    });
    return this.normalize(line);
  }

  async recordPayment(
    user: AuthenticatedUser,
    serviceOrderId: string,
    dto: { amountMinor: number | string; currencyCode: string; reason: string },
  ): Promise<PaymentLine> {
    return this.recordCharge(user, serviceOrderId, {
      kind: 'RECEIVED',
      amountMinor: dto.amountMinor,
      currencyCode: dto.currencyCode,
      reason: dto.reason,
    });
  }

  async listForOrder(user: AuthenticatedUser, serviceOrderId: string): Promise<PaymentLine[]> {
    await this.assertOrder(user, serviceOrderId);
    const lines = await this.prisma.paymentLine.findMany({
      where: { tenantId: user.tenantId, serviceOrderId },
      orderBy: { createdAt: 'asc' },
    });
    return lines.map((l) => this.normalize(l));
  }

  async balance(user: AuthenticatedUser, serviceOrderId: string) {
    await this.assertOrder(user, serviceOrderId);
    const lines = await this.prisma.paymentLine.findMany({
      where: { tenantId: user.tenantId, serviceOrderId },
      select: { kind: true, amount: true, currencyCode: true },
    });
    // Group by currency. Charges = positive lines that aren't receipts;
    // receipts = RECEIVED (stored negative). balanceDue = charges + receipts
    // (since receipts are negative) — but report charges and receipts as
    // positive magnitudes for readability.
    const byCcy = new Map<string, { charges: bigint; receipts: bigint }>();
    for (const l of lines) {
      const acc = byCcy.get(l.currencyCode) ?? { charges: 0n, receipts: 0n };
      if (l.kind === 'RECEIVED') {
        acc.receipts += -l.amount; // stored negative → positive magnitude
      } else {
        acc.charges += l.amount; // includes negative discounts/commissions
      }
      byCcy.set(l.currencyCode, acc);
    }
    return [...byCcy.entries()]
      .map(([currencyCode, { charges, receipts }]) => ({
        currencyCode,
        totalCharges: charges.toString(),
        totalReceipts: receipts.toString(),
        balanceDue: (charges - receipts).toString(),
      }))
      .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  }

  // Append-only correction: a new line reversing the original. Requires the
  // more-privileged payments.adjust permission (checked at the controller).
  async correct(user: AuthenticatedUser, lineId: string, reason: string): Promise<PaymentLine> {
    const original = await this.prisma.paymentLine.findFirst({
      where: { id: lineId, tenantId: user.tenantId },
    });
    if (!original) throw new NotFoundException(`payment line ${lineId} not found`);
    if (original.kind === 'CORRECTION') {
      throw new ConflictException('cannot correct a correction line directly');
    }
    const line = await this.prisma.paymentLine.create({
      data: {
        tenantId: user.tenantId,
        serviceOrderId: original.serviceOrderId,
        boxId: original.boxId,
        kind: 'CORRECTION',
        amount: -original.amount,
        currencyCode: original.currencyCode,
        reason,
        relatedLineId: original.id,
        recordedBy: user.id,
      },
    });
    return this.normalize(line);
  }

  // A bounced cheque reverses a prior RECEIVED line.
  async bounce(user: AuthenticatedUser, lineId: string, reason: string): Promise<PaymentLine> {
    const original = await this.prisma.paymentLine.findFirst({
      where: { id: lineId, tenantId: user.tenantId },
    });
    if (!original) throw new NotFoundException(`payment line ${lineId} not found`);
    if (original.kind !== 'RECEIVED') {
      throw new ConflictException('only a RECEIVED line can bounce');
    }
    const line = await this.prisma.paymentLine.create({
      data: {
        tenantId: user.tenantId,
        serviceOrderId: original.serviceOrderId,
        boxId: original.boxId,
        kind: 'BOUNCED',
        amount: -original.amount, // original RECEIVED is negative → this is positive (re-adds debt)
        currencyCode: original.currencyCode,
        reason,
        relatedLineId: original.id,
        recordedBy: user.id,
      },
    });
    return this.normalize(line);
  }

  // Convenience: collect deposits on every box without one, then move the
  // order DRAFT → DEPOSIT_COLLECTED. Returns the created deposit lines.
  async collectDeposit(
    user: AuthenticatedUser,
    serviceOrderId: string,
    perBoxMinor: number | string,
    currencyCode: string,
  ): Promise<PaymentLine[]> {
    const order = await this.assertOrder(user, serviceOrderId);
    if (order.status !== 'DRAFT' && order.status !== 'DEPOSIT_COLLECTED') {
      throw new ConflictException(`cannot collect deposit on order in status ${order.status}`);
    }
    const boxes = await this.prisma.box.findMany({
      where: { serviceOrderId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (boxes.length === 0) {
      throw new ConflictException('order has no boxes to collect a deposit for');
    }
    const magnitude = BigInt(perBoxMinor);
    const created = await this.prisma.$transaction(async (tx) => {
      const lines: PaymentLine[] = [];
      for (const box of boxes) {
        const existing = await tx.paymentLine.findFirst({
          where: { serviceOrderId, boxId: box.id, kind: 'BOX_DEPOSIT' },
          select: { id: true },
        });
        if (existing) continue;
        lines.push(
          await tx.paymentLine.create({
            data: {
              tenantId: user.tenantId,
              serviceOrderId,
              boxId: box.id,
              kind: 'BOX_DEPOSIT',
              amount: magnitude,
              currencyCode: currencyCode.toUpperCase(),
              reason: 'box deposit',
              recordedBy: user.id,
            },
          }),
        );
      }
      if (order.status === 'DRAFT') {
        await tx.serviceOrder.update({
          where: { id: serviceOrderId },
          data: { status: 'DEPOSIT_COLLECTED', paymentStatus: 'DEPOSIT_COLLECTED' },
        });
        await tx.serviceOrderEvent.create({
          data: {
            tenantId: user.tenantId,
            serviceOrderId,
            fromStatus: 'DRAFT',
            toStatus: 'DEPOSIT_COLLECTED',
            reason: 'deposit collected',
            recordedBy: user.id,
          },
        });
      }
      return lines;
    });
    return created.map((l) => this.normalize(l));
  }
}
