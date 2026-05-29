import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Agent, BoxNumberBatch, Prisma } from '@prisma/client';
import { Prisma as PrismaNS } from '@prisma/client';
import { formatBoxNumber, type CreateAgentDto, type UpdateAgentDto } from '@logisti-core/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Decimal serialisation: same pattern as BoxesService.
  private normalize<T extends { commissionPercent?: unknown }>(a: T): T {
    if (a.commissionPercent instanceof PrismaNS.Decimal) {
      return { ...a, commissionPercent: a.commissionPercent.toString() } as T;
    }
    return a;
  }

  async create(user: AuthenticatedUser, dto: CreateAgentDto): Promise<Agent> {
    if (dto.branchId) {
      const b = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId: user.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!b) throw new NotFoundException(`branch ${dto.branchId} not found`);
    }
    try {
      const agent = await this.prisma.agent.create({
        data: {
          tenantId: user.tenantId,
          code: dto.code,
          name: dto.name,
          branchId: dto.branchId ?? null,
          commissionPercent:
            dto.commissionPercent !== undefined
              ? new PrismaNS.Decimal(dto.commissionPercent.toFixed(2))
              : null,
          commissionPerBoxMinor: dto.commissionPerBoxMinor ?? null,
          commissionCurrency: dto.commissionCurrency ?? null,
          contactInfo:
            dto.contactInfo === undefined ? undefined : (dto.contactInfo as Prisma.InputJsonValue),
          createdBy: user.id,
        },
      });
      return this.normalize(agent);
    } catch (e) {
      if (
        (e as { code?: string }).code === 'P2002' &&
        ((e as { meta?: { target?: string[] } }).meta?.target ?? []).includes('code')
      ) {
        throw new ConflictException(`agent with code ${dto.code} already exists`);
      }
      throw e;
    }
  }

  async list(user: AuthenticatedUser, args: { branchId?: string; active?: boolean }) {
    const agents = await this.prisma.agent.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(args.branchId ? { branchId: args.branchId } : {}),
        ...(args.active !== undefined ? { isActive: args.active } : {}),
      },
      orderBy: { code: 'asc' },
    });
    return agents.map((a) => this.normalize(a));
  }

  async getById(user: AuthenticatedUser, id: string): Promise<Agent> {
    const a = await this.prisma.agent.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!a) throw new NotFoundException(`agent ${id} not found`);
    return this.normalize(a);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateAgentDto): Promise<Agent> {
    await this.getById(user, id);
    const updated = await this.prisma.agent.update({
      where: { id },
      data: {
        name: dto.name === undefined ? undefined : dto.name,
        branchId: dto.branchId === undefined ? undefined : dto.branchId,
        commissionPercent:
          dto.commissionPercent === undefined
            ? undefined
            : dto.commissionPercent === null
              ? null
              : new PrismaNS.Decimal(dto.commissionPercent.toFixed(2)),
        commissionPerBoxMinor:
          dto.commissionPerBoxMinor === undefined ? undefined : dto.commissionPerBoxMinor,
        commissionCurrency:
          dto.commissionCurrency === undefined ? undefined : dto.commissionCurrency,
        contactInfo:
          dto.contactInfo === undefined ? undefined : (dto.contactInfo as Prisma.InputJsonValue),
        isActive: dto.isActive === undefined ? undefined : dto.isActive,
      },
    });
    return this.normalize(updated);
  }

  async issueBatch(
    user: AuthenticatedUser,
    agentId: string,
    dto: { prefix: string; startSeq: number; count: number; notes?: string },
  ): Promise<BoxNumberBatch> {
    const agent = await this.getById(user, agentId);
    if (!agent.isActive) {
      throw new ConflictException('cannot issue a batch to an inactive agent');
    }
    const endSeq = dto.startSeq + dto.count - 1;
    // Overlap detection: any existing ACTIVE/EXHAUSTED batch on this agent with
    // the same prefix whose [start,end] intersects [dto.startSeq, endSeq].
    const overlap = await this.prisma.boxNumberBatch.findFirst({
      where: {
        tenantId: user.tenantId,
        agentId,
        prefix: dto.prefix,
        status: { in: ['ACTIVE', 'EXHAUSTED'] },
        startSeq: { lte: endSeq },
        endSeq: { gte: dto.startSeq },
      },
      select: { id: true, startSeq: true, endSeq: true },
    });
    if (overlap) {
      throw new ConflictException(
        `batch range [${dto.startSeq}, ${endSeq}] overlaps an existing batch ` +
          `[${overlap.startSeq}, ${overlap.endSeq}]`,
      );
    }
    return this.prisma.boxNumberBatch.create({
      data: {
        tenantId: user.tenantId,
        agentId,
        prefix: dto.prefix,
        startSeq: dto.startSeq,
        endSeq,
        nextSeq: dto.startSeq,
        notes: dto.notes ?? null,
        issuedBy: user.id,
      },
    });
  }

  listBatches(user: AuthenticatedUser, agentId: string): Promise<BoxNumberBatch[]> {
    return this.prisma.boxNumberBatch.findMany({
      where: { tenantId: user.tenantId, agentId },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async voidBatch(user: AuthenticatedUser, batchId: string): Promise<BoxNumberBatch> {
    const b = await this.prisma.boxNumberBatch.findFirst({
      where: { id: batchId, tenantId: user.tenantId },
    });
    if (!b) throw new NotFoundException(`batch ${batchId} not found`);
    if (b.status === 'VOIDED') return b;
    return this.prisma.boxNumberBatch.update({
      where: { id: batchId },
      data: { status: 'VOIDED' },
    });
  }

  /**
   * Atomically allocate the next number from a batch. Uses a conditional
   * UPDATE so two concurrent allocations can't both win — Postgres rejects
   * the second one because the WHERE clause no longer matches.
   */
  async allocateNextNumber(
    user: AuthenticatedUser,
    batchId: string,
  ): Promise<{ number: string; seq: number; batchExhausted: boolean }> {
    const batch = await this.prisma.boxNumberBatch.findFirst({
      where: { id: batchId, tenantId: user.tenantId },
    });
    if (!batch) throw new NotFoundException(`batch ${batchId} not found`);
    if (batch.status !== 'ACTIVE') {
      throw new ConflictException(`batch is ${batch.status}, cannot allocate`);
    }
    // updateMany returns affected count without throwing; we use it as a CAS
    // (compare-and-swap on nextSeq). If a concurrent caller incremented
    // first, count is 0 and we recurse with fresh state.
    const claimed = await this.prisma.boxNumberBatch.updateMany({
      where: { id: batchId, nextSeq: batch.nextSeq },
      data: { nextSeq: batch.nextSeq + 1 },
    });
    if (claimed.count !== 1) {
      // someone else beat us; recurse once with the freshest state.
      return this.allocateNextNumber(user, batchId);
    }
    const seq = batch.nextSeq;
    const number = formatBoxNumber(batch.prefix, seq);
    let batchExhausted = false;
    if (seq + 1 > batch.endSeq) {
      await this.prisma.boxNumberBatch.update({
        where: { id: batchId },
        data: { status: 'EXHAUSTED' },
      });
      batchExhausted = true;
    }
    if (seq > batch.endSeq) {
      // Should be unreachable thanks to the status check, but be defensive.
      throw new BadRequestException('batch range exhausted');
    }
    return { number, seq, batchExhausted };
  }
}
