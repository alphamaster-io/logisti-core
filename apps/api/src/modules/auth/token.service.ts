import { Injectable } from '@nestjs/common';
import { type JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { type AppConfigService } from '../../config/app-config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from './types/authenticated-user';

interface RefreshContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  signAccess(payload: { sub: string; tenantId: string }): string {
    const body: JwtAccessPayload = { ...payload, type: 'access' };
    return this.jwt.sign(body, {
      secret: this.config.jwtAccessSecret,
      expiresIn: this.config.jwtAccessTtl,
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseDurationToMs(input: string): number {
    const m = /^(\d+)([smhd])$/.exec(input);
    if (!m) return 7 * 24 * 60 * 60 * 1000;
    const n = parseInt(m[1]!, 10);
    const unit = m[2]!;
    const mult =
      unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return n * mult;
  }

  async issueRefresh(userId: string, ctx: RefreshContext = {}): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    const tokenHash = this.hash(token);
    const ttlMs = this.parseDurationToMs(this.config.jwtRefreshTtl);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlMs),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
    return token;
  }

  async rotateRefresh(oldToken: string, userId: string, ctx: RefreshContext = {}): Promise<string> {
    const oldHash = this.hash(oldToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash: oldHash } });
    if (
      !existing ||
      existing.userId !== userId ||
      existing.revokedAt ||
      existing.expiresAt < new Date()
    ) {
      throw new Error('refresh_invalid');
    }
    const newToken = randomBytes(48).toString('base64url');
    const newHash = this.hash(newToken);
    const ttlMs = this.parseDurationToMs(this.config.jwtRefreshTtl);
    const created = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: newHash,
        expiresAt: new Date(Date.now() + ttlMs),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: created.id },
    });
    return newToken;
  }

  async revokeRefresh(token: string): Promise<void> {
    const h = this.hash(token);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: h, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async findActiveRefresh(token: string) {
    const h = this.hash(token);
    return this.prisma.refreshToken.findFirst({
      where: { tokenHash: h, revokedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  accessTtlSeconds(): number {
    return Math.floor(this.parseDurationToMs(this.config.jwtAccessTtl) / 1000);
  }
}
