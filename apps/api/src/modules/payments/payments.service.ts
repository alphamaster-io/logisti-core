import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PaymentLine, PaymentLineKind, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';

// Subset of PrismaService usable inside an interactive transaction. We use it
// to share the commission-emission helper between the tx and non-tx paths.
type Tx = Prisma.TransactionClient | PrismaService;

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
  private readonly logger = new Logger(PaymentsService.name);
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
    await this.assertOrder(user, serviceOrderId);
    const magnitude = BigInt(dto.amountMinor);
    if (magnitude <= 0n) {
      throw new BadRequestException('amountMinor must be a positive magnitude');
    }
    // Wrap the RECEIVED + commission emission in one tx so a commission
    // failure rolls back the payment too — operators won't see "payment
    // recorded but no commission" inconsistencies.
    const line = await this.prisma.$transaction(async (tx) => {
      const received = await tx.paymentLine.create({
        data: {
          tenantId: user.tenantId,
          serviceOrderId,
          boxId: null,
          kind: 'RECEIVED',
          amount: -magnitude,
          currencyCode: dto.currencyCode.toUpperCase(),
          reason: dto.reason,
          recordedBy: user.id,
        },
      });
      await this.maybeEmitCommissions(tx, user, serviceOrderId);
      return received;
    });
    return this.normalize(line);
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
    return this.computeBalance(this.prisma, user, serviceOrderId);
  }

  // AGENT_COMMISSION is an operator-payable to the partner, not a
  // customer-facing line — it's excluded from the customer balance.
  // BOUNCED on the other hand is part of the customer-facing balance:
  // when a cheque bounces the customer owes the money again.
  private async computeBalance(tx: Tx, user: AuthenticatedUser, serviceOrderId: string) {
    const lines = await tx.paymentLine.findMany({
      where: { tenantId: user.tenantId, serviceOrderId, kind: { not: 'AGENT_COMMISSION' } },
      select: { kind: true, amount: true, currencyCode: true },
    });
    const byCcy = new Map<string, { charges: bigint; receipts: bigint }>();
    for (const l of lines) {
      const acc = byCcy.get(l.currencyCode) ?? { charges: 0n, receipts: 0n };
      if (l.kind === 'RECEIVED') {
        acc.receipts += -l.amount; // stored negative → positive magnitude
      } else {
        acc.charges += l.amount; // includes negative discounts; BOUNCED is positive
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

  /**
   * Emit AGENT_COMMISSION lines (one per agent, idempotent) when every
   * currency on the order has been paid in full. Skips agents already
   * commissioned on this order, agents without commission policy, and
   * agents who happen to have no boxes on the order.
   *
   * Calculation:
   * - per-box flat → commissionPerBoxMinor × (# agent-tied boxes on order)
   * - percent      → commissionPercent% × (sum of POSITIVE charge lines
   *                   attributable to the agent's boxes on the order)
   * The commission is always denominated in the agent's commissionCurrency,
   * which may differ from the customer-facing currency.
   */
  private async maybeEmitCommissions(
    tx: Tx,
    user: AuthenticatedUser,
    serviceOrderId: string,
  ): Promise<void> {
    const balances = await this.computeBalance(tx, user, serviceOrderId);
    if (balances.length === 0) return;
    if (balances.some((b) => BigInt(b.balanceDue) > 0n)) return;

    // Distinct agents on this order. We do this in two queries (boxes by
    // order, then their agents) so a tenant-cross-check on agent stays in
    // the WHERE clause.
    const boxes = await tx.box.findMany({
      where: {
        serviceOrderId,
        tenantId: user.tenantId,
        deletedAt: null,
        agentId: { not: null },
      },
      select: { id: true, agentId: true },
    });
    if (boxes.length === 0) return;

    const boxesByAgent = new Map<string, string[]>();
    for (const b of boxes) {
      if (!b.agentId) continue;
      const list = boxesByAgent.get(b.agentId) ?? [];
      list.push(b.id);
      boxesByAgent.set(b.agentId, list);
    }

    for (const [agentId, boxIds] of boxesByAgent) {
      const existing = await tx.paymentLine.findFirst({
        where: { serviceOrderId, agentId, kind: 'AGENT_COMMISSION' },
        select: { id: true },
      });
      if (existing) continue;

      const agent = await tx.agent.findFirst({
        where: { id: agentId, tenantId: user.tenantId },
        select: {
          commissionPercent: true,
          commissionPerBoxMinor: true,
          commissionCurrency: true,
        },
      });
      if (!agent || !agent.commissionCurrency) continue;

      let magnitude: bigint;
      if (agent.commissionPerBoxMinor !== null) {
        magnitude = agent.commissionPerBoxMinor * BigInt(boxIds.length);
      } else if (agent.commissionPercent !== null) {
        // Sum POSITIVE charges (revenue) on the agent's boxes. Discounts
        // and corrections aren't included — commission is on gross revenue
        // attributed to those boxes.
        const lines = await tx.paymentLine.findMany({
          where: {
            tenantId: user.tenantId,
            serviceOrderId,
            boxId: { in: boxIds },
            amount: { gt: 0 },
            kind: { notIn: ['AGENT_COMMISSION', 'BOUNCED', 'CORRECTION', 'RECEIVED'] },
          },
          select: { amount: true },
        });
        const revenue = lines.reduce((sum, l) => sum + l.amount, 0n);
        // Decimal × bigint: convert percent (0..100, two-decimal) to basis
        // points so we stay in integer math: bps = round(percent * 100).
        const bps = BigInt(Math.round(Number(agent.commissionPercent.toString()) * 100));
        magnitude = (revenue * bps) / 10_000n;
      } else {
        continue;
      }
      if (magnitude <= 0n) continue;

      await tx.paymentLine.create({
        data: {
          tenantId: user.tenantId,
          serviceOrderId,
          boxId: null,
          agentId,
          kind: 'AGENT_COMMISSION',
          amount: -magnitude, // negative per NEGATIVE_KINDS convention
          currencyCode: agent.commissionCurrency.toUpperCase(),
          reason: `commission on ${boxIds.length} box${boxIds.length === 1 ? '' : 'es'}`,
          recordedBy: user.id,
        },
      });
      this.logger.log(
        `emitted AGENT_COMMISSION for agent ${agentId} on order ${serviceOrderId}: ` +
          `${magnitude} ${agent.commissionCurrency}`,
      );
    }
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
