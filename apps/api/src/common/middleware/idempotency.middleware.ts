import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { type RedisService } from '../../redis/redis.service';

const TTL_SECONDS = 24 * 60 * 60;
const KEY_HEADER = 'idempotency-key';
const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Idempotency-Key middleware skeleton.
 *
 * - Looks up `Idempotency-Key` header on mutating requests.
 * - If we've seen the key before, replays the stored response.
 * - Otherwise, captures the response and stores it for 24h.
 *
 * Phase 1: registered globally as a skeleton. Phase 2+ intake flows will mandate it.
 */
@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(private readonly redis: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!MUTATING.has(req.method)) return next();
    const key = req.header(KEY_HEADER);
    if (!key) return next();

    const cacheKey = `idem:${key}`;
    const cached = await this.redis.client.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        const { status, body } = JSON.parse(cached) as { status: number; body: unknown };
        res.status(status).json(body);
        return;
      } catch {
        // fall through and overwrite stale cache
      }
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      void this.redis.client
        .set(cacheKey, JSON.stringify({ status: res.statusCode, body }), 'EX', TTL_SECONDS)
        .catch(() => undefined);
      return originalJson(body);
    };
    next();
  }
}
