import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Box, BoxTypeCode } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CreateBoxDto, UpdateBoxDto } from '@logisti-core/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { generateBoxNumber } from './box-number';
import { AgentsService } from '../agents/agents.service';

@Injectable()
export class BoxesService {
  private readonly logger = new Logger(BoxesService.name);
  private static readonly NUMBER_RETRY_BUDGET = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: AgentsService,
  ) {}

  // Convert Prisma's Decimal to its canonical string form. NestJS's
  // ClassSerializerInterceptor enumerates class instances and would otherwise
  // leak Decimal's internal { s, e, d } representation on the wire.
  private normalize(box: Box): Box {
    if (box.weightKg instanceof Prisma.Decimal) {
      return { ...box, weightKg: box.weightKg.toString() as unknown as Prisma.Decimal };
    }
    return box;
  }

  async addToOrder(
    user: AuthenticatedUser,
    serviceOrderId: string,
    dto: CreateBoxDto,
  ): Promise<Box> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: serviceOrderId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!order) throw new NotFoundException(`service order ${serviceOrderId} not found`);

    // Boxes can be added only while the order is being assembled — DRAFT or
    // DEPOSIT_COLLECTED. Once PACKED, the box list is frozen.
    if (order.status !== 'DRAFT' && order.status !== 'DEPOSIT_COLLECTED') {
      throw new ConflictException(
        `cannot add a box to order in status ${order.status}; only DRAFT or DEPOSIT_COLLECTED`,
      );
    }

    // BoxType must exist and be active. Cheap denormalisation: we store the
    // code on the Box, not a relation, since BoxTypeCode is an enum.
    const boxType = await this.prisma.boxType.findUnique({
      where: { code: dto.boxTypeCode satisfies BoxTypeCode },
    });
    if (!boxType || !boxType.isActive || boxType.deletedAt) {
      throw new NotFoundException(`box type ${dto.boxTypeCode} is not available`);
    }

    // Agent-allocated path: number comes from an agent's batch, and we
    // record agentId + batchId on the Box for reporting + commission.
    if (dto.batchId) {
      const batch = await this.prisma.boxNumberBatch.findFirst({
        where: { id: dto.batchId, tenantId: user.tenantId },
        select: { id: true, agentId: true, status: true },
      });
      if (!batch) throw new NotFoundException(`batch ${dto.batchId} not found`);
      // allocateNextNumber bumps the batch's nextSeq atomically. If the Box
      // insert below throws, the allocated number is "burned" but unused —
      // benign (gaps in the batch); we don't try to roll back the counter.
      const { number } = await this.agents.allocateNextNumber(user, batch.id);
      const created = await this.prisma.box.create({
        data: {
          tenantId: user.tenantId,
          number,
          serviceOrderId,
          boxTypeCode: dto.boxTypeCode,
          agentId: batch.agentId,
          boxNumberBatchId: batch.id,
          oversizeInches: dto.oversizeInches ?? null,
          weightKg: dto.weightKg ?? null,
          notes: dto.notes ?? null,
          createdBy: user.id,
        },
      });
      return this.normalize(created);
    }

    // System-generated path: opaque 16-char URL-safe number with a small
    // retry budget for the theoretical collision case.
    let lastErr: unknown;
    for (let attempt = 0; attempt < BoxesService.NUMBER_RETRY_BUDGET; attempt += 1) {
      const number = generateBoxNumber();
      try {
        const created = await this.prisma.box.create({
          data: {
            tenantId: user.tenantId,
            number,
            serviceOrderId,
            boxTypeCode: dto.boxTypeCode,
            oversizeInches: dto.oversizeInches ?? null,
            weightKg: dto.weightKg ?? null,
            notes: dto.notes ?? null,
            createdBy: user.id,
          },
        });
        return this.normalize(created);
      } catch (e) {
        const isUniqueViolation =
          (e as { code?: string }).code === 'P2002' &&
          ((e as { meta?: { target?: string[] } }).meta?.target ?? []).includes('number');
        if (!isUniqueViolation) throw e;
        this.logger.warn(`box number collision (attempt ${attempt + 1}); retrying`);
        lastErr = e;
      }
    }
    throw lastErr ?? new Error('failed to allocate a box number');
  }

  async listForOrder(user: AuthenticatedUser, serviceOrderId: string): Promise<Box[]> {
    // Verify order ownership first so a 404 is returned for cross-tenant probes.
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: serviceOrderId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!order) throw new NotFoundException(`service order ${serviceOrderId} not found`);
    const boxes = await this.prisma.box.findMany({
      where: { serviceOrderId, tenantId: user.tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return boxes.map((b) => this.normalize(b));
  }

  async getByNumber(user: AuthenticatedUser, number: string): Promise<Box> {
    const box = await this.prisma.box.findFirst({
      where: { number, tenantId: user.tenantId, deletedAt: null },
    });
    if (!box) throw new NotFoundException(`box ${number} not found`);
    return this.normalize(box);
  }

  async getById(user: AuthenticatedUser, id: string): Promise<Box> {
    const box = await this.prisma.box.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!box) throw new NotFoundException(`box ${id} not found`);
    return this.normalize(box);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateBoxDto): Promise<Box> {
    const box = await this.getById(user, id);
    // Edits allowed up to PACKED. After PACKED the declaration is signed and
    // the box is sealed in the operator's hands.
    if (box.status !== 'CREATED' && box.status !== 'RECEIVED') {
      throw new ConflictException(
        `cannot edit box in status ${box.status}; only CREATED or RECEIVED`,
      );
    }
    const updated = await this.prisma.box.update({
      where: { id },
      data: {
        oversizeInches: dto.oversizeInches === undefined ? undefined : dto.oversizeInches,
        weightKg:
          dto.weightKg === undefined ? undefined : (dto.weightKg as Prisma.Decimal | number | null),
        notes: dto.notes === undefined ? undefined : dto.notes,
      },
    });
    return this.normalize(updated);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const box = await this.getById(user, id);
    if (box.status !== 'CREATED') {
      throw new ConflictException(
        `cannot remove a box in status ${box.status}; only CREATED is removable`,
      );
    }
    const order = await this.prisma.serviceOrder.findUniqueOrThrow({
      where: { id: box.serviceOrderId },
      select: { status: true },
    });
    if (order.status !== 'DRAFT' && order.status !== 'DEPOSIT_COLLECTED') {
      throw new ConflictException(`cannot remove a box from order in status ${order.status}`);
    }
    await this.prisma.box.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
