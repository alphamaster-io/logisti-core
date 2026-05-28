import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CreateUserDto, ListUsersQueryDto, UpdateMeDto, UpdateUserDto } from './dto/users.dto';

function parseSort(sort: string | undefined): {
  field: 'createdAt' | 'email';
  direction: 'asc' | 'desc';
} {
  if (!sort) return { field: 'createdAt', direction: 'desc' };
  const [f, d] = sort.split(':');
  const field = f === 'email' ? 'email' : 'createdAt';
  const direction = d === 'asc' ? 'asc' : 'desc';
  return { field, direction };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(u: Awaited<ReturnType<UsersService['findRaw']>>) {
    const roleKeys = u.roles.map((ur) => ur.role.key);
    const permSet = new Set<string>();
    for (const ur of u.roles) {
      for (const rp of ur.role.permissions) {
        permSet.add(rp.permission.key);
      }
    }
    return {
      id: u.id,
      tenantId: u.tenantId,
      email: u.email,
      name: u.name,
      roles: roleKeys,
      permissions: Array.from(permSet),
      branchId: u.branchId,
      branchName: u.branch?.name ?? null,
      isActive: u.isActive,
      isMaster: u.isMaster,
      activeRoleKey: u.activeRoleKey,
      activeBranchId: u.activeBranchId,
      mfaEnabled: u.mfaEnabled,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    };
  }

  private findRaw(id: string, tenantId: string) {
    return this.prisma.user.findFirstOrThrow({
      where: { id, tenantId },
      include: {
        branch: true,
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
  }

  async list(actor: AuthenticatedUser, q: ListUsersQueryDto) {
    const limit = Math.min(Math.max(parseInt(q.limit ?? '20', 10) || 20, 1), 100);
    const { field, direction } = parseSort(q.sort);

    const where: Record<string, unknown> = { tenantId: actor.tenantId };
    if (q.q) {
      where['OR'] = [
        { email: { contains: q.q, mode: 'insensitive' } },
        { name: { contains: q.q, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.user.findMany({
      where,
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: { [field]: direction },
      include: {
        branch: true,
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    const hasMore = items.length > limit;
    const data = (hasMore ? items.slice(0, limit) : items).map((u) => this.serialize(u));
    const nextCursor = hasMore ? items[limit - 1]?.id ?? null : null;

    return { data, hasMore, nextCursor };
  }

  async me(actor: AuthenticatedUser) {
    const u = await this.findRaw(actor.id, actor.tenantId);
    return this.serialize(u);
  }

  async findOne(actor: AuthenticatedUser, id: string) {
    try {
      const u = await this.findRaw(id, actor.tenantId);
      return this.serialize(u);
    } catch {
      throw new NotFoundException('User not found');
    }
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto) {
    const emailNormalized = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { tenantId: actor.tenantId, emailNormalized },
    });
    if (existing) throw new ConflictException('Email already in use');

    const roles = await this.prisma.role.findMany({ where: { key: { in: dto.roles } } });
    if (roles.length !== dto.roles.length) {
      throw new BadRequestException('One or more role keys are invalid');
    }

    if (dto.branchId) {
      const b = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId: actor.tenantId },
      });
      if (!b) throw new BadRequestException('Branch not found in tenant');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const created = await this.prisma.user.create({
      data: {
        tenantId: actor.tenantId,
        email: dto.email,
        emailNormalized,
        name: dto.name,
        passwordHash,
        branchId: dto.branchId ?? null,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
    });
    return this.findOne(actor, created.id);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findFirstOrThrow({
      where: { id, tenantId: actor.tenantId },
    });
    if (target.isMaster && actor.id !== target.id && !actor.isMaster) {
      throw new ForbiddenException('Cannot modify master user');
    }
    if (dto.branchId !== undefined && dto.branchId !== null) {
      const b = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId: actor.tenantId },
      });
      if (!b) throw new BadRequestException('Branch not found in tenant');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        isActive: dto.isActive,
        branchId: dto.branchId === undefined ? undefined : dto.branchId,
      },
    });

    if (dto.roles) {
      const roles = await this.prisma.role.findMany({ where: { key: { in: dto.roles } } });
      if (roles.length !== dto.roles.length) {
        throw new BadRequestException('One or more role keys are invalid');
      }
      await this.prisma.$transaction([
        this.prisma.userRole.deleteMany({ where: { userId: id } }),
        this.prisma.userRole.createMany({
          data: roles.map((r) => ({ userId: id, roleId: r.id })),
        }),
      ]);
    }

    return this.findOne(actor, id);
  }

  async updateMe(actor: AuthenticatedUser, dto: UpdateMeDto) {
    await this.prisma.user.update({
      where: { id: actor.id },
      data: { name: dto.name },
    });
    return this.me(actor);
  }

  async disable(actor: AuthenticatedUser, id: string) {
    const target = await this.prisma.user.findFirstOrThrow({
      where: { id, tenantId: actor.tenantId },
    });
    if (target.isMaster) {
      throw new ForbiddenException('Cannot disable master user');
    }
    if (target.id === actor.id) {
      throw new BadRequestException('Cannot disable yourself');
    }
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { ok: true };
  }

  async enable(actor: AuthenticatedUser, id: string) {
    await this.prisma.user.findFirstOrThrow({
      where: { id, tenantId: actor.tenantId },
    });
    await this.prisma.user.update({ where: { id }, data: { isActive: true } });
    return { ok: true };
  }

  async softDelete(actor: AuthenticatedUser, id: string) {
    const target = await this.prisma.user.findFirstOrThrow({
      where: { id, tenantId: actor.tenantId },
    });
    if (target.isMaster) {
      throw new ForbiddenException('Cannot delete master user');
    }
    if (target.id === actor.id) {
      throw new BadRequestException('Cannot delete yourself');
    }
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  async assignRole(actor: AuthenticatedUser, userId: string, roleKey: string) {
    const target = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, tenantId: actor.tenantId },
    });
    if (target.isMaster && !actor.isMaster) {
      throw new ForbiddenException('Cannot modify master user');
    }
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) throw new BadRequestException('Unknown role');
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });
    return this.findOne(actor, userId);
  }

  async revokeRole(actor: AuthenticatedUser, userId: string, roleKey: string) {
    const target = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, tenantId: actor.tenantId },
    });
    if (target.isMaster && !actor.isMaster) {
      throw new ForbiddenException('Cannot modify master user');
    }
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) throw new BadRequestException('Unknown role');
    const userRoles = await this.prisma.userRole.findMany({ where: { userId } });
    if (userRoles.length <= 1) {
      throw new BadRequestException('User must retain at least one role');
    }
    await this.prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId: role.id } },
    });
    return this.findOne(actor, userId);
  }
}
