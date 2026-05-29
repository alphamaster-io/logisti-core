import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma, ServiceOrder, ServiceOrderStatus as PrismaStatus } from '@prisma/client';
import {
  canTransitionServiceOrder,
  type CreateServiceOrderDto,
  type UpdateServiceOrderDto,
} from '@logisti-core/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { generateOrderNumber } from './order-number';
import { validateModeRequiredFields } from './mode-validation';

type ListFilters = {
  status?: PrismaStatus;
  mode?: import('@prisma/client').ServiceMode;
  branchId?: string;
  cursor?: string;
  limit?: number;
};

@Injectable()
export class ServiceOrdersService {
  private readonly logger = new Logger(ServiceOrdersService.name);
  // small bound on number-collision retries; 80 bits of entropy means
  // collisions are vanishingly rare, but we still protect against the
  // theoretical case.
  private static readonly NUMBER_RETRY_BUDGET = 5;

  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreateServiceOrderDto): Promise<ServiceOrder> {
    validateModeRequiredFields(dto);

    // Confirm the branch belongs to the same tenant.
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException(`branch ${dto.branchId} not found`);

    let lastErr: unknown;
    for (let attempt = 0; attempt < ServiceOrdersService.NUMBER_RETRY_BUDGET; attempt += 1) {
      const number = generateOrderNumber();
      try {
        const order = await this.prisma.serviceOrder.create({
          data: {
            tenantId: user.tenantId,
            number,
            mode: dto.mode,
            branchId: dto.branchId,
            customerSnapshot: dto.customerSnapshot as Prisma.InputJsonValue,
            consigneeSnapshot: dto.consigneeSnapshot as Prisma.InputJsonValue,
            pickupAddress: dto.pickupAddress as Prisma.InputJsonValue | undefined,
            scheduledPickupAt: dto.scheduledPickupAt,
            notes: dto.notes,
            createdBy: user.id,
          },
        });
        await this.recordEvent(user, order.id, null, 'DRAFT', 'order created');
        return order;
      } catch (e) {
        const isUniqueViolation =
          (e as { code?: string }).code === 'P2002' &&
          ((e as { meta?: { target?: string[] } }).meta?.target ?? []).includes('number');
        if (!isUniqueViolation) throw e;
        this.logger.warn(`order number collision (attempt ${attempt + 1}); retrying`);
        lastErr = e;
      }
    }
    throw lastErr ?? new Error('failed to allocate a service order number');
  }

  async list(
    user: AuthenticatedUser,
    filters: ListFilters,
  ): Promise<{ data: ServiceOrder[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = Math.min(filters.limit ?? 50, 200);
    const where: Prisma.ServiceOrderWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.mode ? { mode: filters.mode } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
    };
    const data = await this.prisma.serviceOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
    const hasMore = data.length > limit;
    if (hasMore) data.pop();
    return { data, nextCursor: hasMore ? (data[data.length - 1]?.id ?? null) : null, hasMore };
  }

  async getById(user: AuthenticatedUser, id: string): Promise<ServiceOrder> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!order) throw new NotFoundException(`service order ${id} not found`);
    return order;
  }

  async getByNumber(user: AuthenticatedUser, number: string): Promise<ServiceOrder> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { number, tenantId: user.tenantId, deletedAt: null },
    });
    if (!order) throw new NotFoundException(`service order ${number} not found`);
    return order;
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateServiceOrderDto,
  ): Promise<ServiceOrder> {
    const order = await this.getById(user, id);
    if (order.status !== 'DRAFT') {
      throw new ConflictException(
        `cannot edit service order in status ${order.status}; only DRAFT is editable`,
      );
    }
    return this.prisma.serviceOrder.update({
      where: { id },
      data: {
        customerSnapshot: dto.customerSnapshot as Prisma.InputJsonValue | undefined,
        consigneeSnapshot: dto.consigneeSnapshot as Prisma.InputJsonValue | undefined,
        pickupAddress: dto.pickupAddress as Prisma.InputJsonValue | undefined,
        scheduledPickupAt: dto.scheduledPickupAt === undefined ? undefined : dto.scheduledPickupAt,
        notes: dto.notes === undefined ? undefined : dto.notes,
      },
    });
  }

  async cancel(user: AuthenticatedUser, id: string, reason: string): Promise<ServiceOrder> {
    const order = await this.getById(user, id);
    if (!canTransitionServiceOrder(order.status, 'CANCELLED')) {
      throw new ConflictException(
        `cannot cancel from status ${order.status}; legal next states: ${this.legalNexts(order.status).join(', ')}`,
      );
    }
    const updated = await this.prisma.serviceOrder.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await this.recordEvent(user, id, order.status, 'CANCELLED', reason);
    return updated;
  }

  private legalNexts(status: PrismaStatus): readonly PrismaStatus[] {
    // imported lazily to keep dep direction clean
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SERVICE_ORDER_TRANSITIONS } = require('@logisti-core/shared') as {
      SERVICE_ORDER_TRANSITIONS: Record<PrismaStatus, readonly PrismaStatus[]>;
    };
    return SERVICE_ORDER_TRANSITIONS[status];
  }

  private async recordEvent(
    user: AuthenticatedUser,
    serviceOrderId: string,
    from: PrismaStatus | null,
    to: PrismaStatus,
    reason: string,
  ): Promise<void> {
    await this.prisma.serviceOrderEvent.create({
      data: {
        tenantId: user.tenantId,
        serviceOrderId,
        fromStatus: from,
        toStatus: to,
        reason,
        recordedBy: user.id,
      },
    });
  }
}
