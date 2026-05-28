import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type PrismaService } from '../../prisma/prisma.service';

export interface AuditRecord {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(rec: AuditRecord): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: rec.tenantId ?? null,
        userId: rec.userId ?? null,
        action: rec.action,
        entityType: rec.entityType,
        entityId: rec.entityId ?? null,
        before: rec.before ?? Prisma.JsonNull,
        after: rec.after ?? Prisma.JsonNull,
        ip: rec.ip ?? null,
        userAgent: rec.userAgent ?? null,
        requestId: rec.requestId ?? null,
      },
    });
  }

  async listForTenant(tenantId: string, limit = 50, cursor?: string) {
    const items = await this.prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    return {
      data: hasMore ? items.slice(0, limit) : items,
      nextCursor: hasMore ? (items[limit - 1]?.id ?? null) : null,
      hasMore,
    };
  }
}
