import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { type PrismaService } from '../../prisma/prisma.service';
import { type TokenService } from './token.service';
import { type LockoutService } from './lockout.service';
import type { AuthenticatedUser } from './types/authenticated-user';

interface LoginContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly lockout: LockoutService,
  ) {}

  async login(email: string, password: string, ctx: LoginContext) {
    const emailNormalized = email.trim().toLowerCase();

    if (await this.lockout.isLocked(emailNormalized)) {
      throw new ForbiddenException('Account temporarily locked. Try again later.');
    }

    const user = await this.prisma.user.findFirst({
      where: { emailNormalized, isActive: true },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
        branch: true,
      },
    });

    // Constant-time-ish failure: still hash to dodge user-enumeration via timing.
    if (!user) {
      await argon2
        .hash('dummy-to-equalize-timing', { type: argon2.argon2id })
        .catch(() => undefined);
      await this.lockout.recordFailure(emailNormalized);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Account locked. Contact your administrator.');
    }

    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const { locked } = await this.lockout.recordFailure(emailNormalized);
      if (locked) {
        throw new ForbiddenException('Too many failed attempts. Account locked.');
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.lockout.clear(emailNormalized);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0 },
    });

    const accessToken = this.tokens.signAccess({ sub: user.id, tenantId: user.tenantId });
    const refreshToken = await this.tokens.issueRefresh(user.id, ctx);
    const ttl = this.tokens.accessTtlSeconds();

    const auth = await this.buildAuthenticatedUser(user.id);

    return {
      accessToken,
      refreshToken,
      expiresIn: ttl,
      user: {
        id: auth.id,
        email: auth.email,
        name: auth.name,
        roles: auth.roles,
        permissions: auth.permissions,
        tenantId: auth.tenantId,
        isMaster: auth.isMaster,
        branchId: auth.branchId,
        activeRoleKey: auth.activeRoleKey,
        activeBranchId: auth.activeBranchId,
      },
    };
  }

  async refresh(refreshToken: string, ctx: LoginContext) {
    const record = await this.tokens.findActiveRefresh(refreshToken);
    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: record.userId, isActive: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not active');
    }
    const newRefresh = await this.tokens.rotateRefresh(refreshToken, user.id, ctx);
    const accessToken = this.tokens.signAccess({ sub: user.id, tenantId: user.tenantId });
    return {
      accessToken,
      refreshToken: newRefresh,
      expiresIn: this.tokens.accessTtlSeconds(),
    };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.tokens.revokeRefresh(refreshToken);
  }

  async requestPasswordReset(email: string) {
    // Always return success — don't leak user existence.
    const emailNormalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { emailNormalized, isActive: true },
    });
    if (!user) return { ok: true };
    // Production: send email here. Phase 1 returns token in response for dev convenience.
    const { randomBytes, createHash } = await import('node:crypto');
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return { ok: true, devToken: process.env['NODE_ENV'] === 'production' ? undefined : raw };
  }

  async confirmPasswordReset(token: string, newPassword: string) {
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const rec = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: rec.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: rec.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: rec.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  async switchRole(userId: string, roleKey: string | null) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user.isMaster) {
      throw new ForbiddenException('Only master users can impersonate roles');
    }
    if (roleKey !== null) {
      const owned = user.roles.some((ur) => ur.role.key === roleKey);
      if (!owned) {
        throw new BadRequestException('User does not have that role');
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { activeRoleKey: roleKey },
    });
    return this.buildAuthenticatedUser(userId);
  }

  async switchBranch(userId: string, branchId: string | null) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (branchId !== null) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId: user.tenantId },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found in tenant');
      }
      if (!user.isMaster && branch.id !== user.branchId) {
        throw new ForbiddenException('You may only switch within your own branch');
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { activeBranchId: branchId },
    });
    return this.buildAuthenticatedUser(userId);
  }

  async buildAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    const allRoleKeys = user.roles.map((ur) => ur.role.key);

    // Effective permission set:
    //   - If activeRoleKey is set, restrict to that role's permissions only
    //   - Otherwise union of all role permissions
    const effectiveRoles =
      user.activeRoleKey != null
        ? user.roles.filter((ur) => ur.role.key === user.activeRoleKey)
        : user.roles;

    const permSet = new Set<string>();
    for (const ur of effectiveRoles) {
      for (const rp of ur.role.permissions) {
        permSet.add(rp.permission.key);
      }
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      roles: allRoleKeys,
      permissions: Array.from(permSet),
      activeRoleKey: user.activeRoleKey,
      activeBranchId: user.activeBranchId,
      branchId: user.branchId,
      isMaster: user.isMaster,
    };
  }
}
