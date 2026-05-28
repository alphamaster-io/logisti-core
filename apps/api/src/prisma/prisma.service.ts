import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

// Tables that support soft delete (have a `deletedAt` column).
const SOFT_DELETE_MODELS = new Set<string>([
  'Tenant',
  'User',
  'Branch',
  'Warehouse',
  'WarehouseZone',
  'Rack',
  'Bin',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    this.$use(this.softDeleteMiddleware());
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private softDeleteMiddleware(): Prisma.Middleware {
    return async (params, next) => {
      if (!params.model || !SOFT_DELETE_MODELS.has(params.model)) {
        return next(params);
      }

      // Convert delete to update with deletedAt set.
      if (params.action === 'delete') {
        params.action = 'update';
        params.args = {
          ...params.args,
          data: { deletedAt: new Date() },
        };
      }
      if (params.action === 'deleteMany') {
        params.action = 'updateMany';
        params.args = {
          ...params.args,
          data: { ...(params.args?.data ?? {}), deletedAt: new Date() },
        };
      }

      // Filter out soft-deleted rows from finds, unless caller opts in.
      const findActions: Prisma.PrismaAction[] = [
        'findFirst',
        'findFirstOrThrow',
        'findMany',
        'findUnique',
        'findUniqueOrThrow',
        'count',
        'aggregate',
        'groupBy',
      ];
      if (findActions.includes(params.action)) {
        const args = (params.args ?? {}) as Record<string, unknown>;
        const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
        const includesDeletedFlag =
          Object.prototype.hasOwnProperty.call(where, 'deletedAt') ||
          (args['_includeDeleted'] as boolean | undefined) === true;
        if (!includesDeletedFlag) {
          args['where'] = { ...where, deletedAt: null };
          params.args = args;
        }
        if ('_includeDeleted' in args) {
          delete args['_includeDeleted'];
        }
      }

      return next(params);
    };
  }
}
