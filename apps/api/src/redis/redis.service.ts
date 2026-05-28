import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';
import { MemoryKv } from './memory-kv';

// The subset of ioredis the rest of the app uses. MemoryKv satisfies the same shape.
type KvClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttlSeconds?: number): Promise<'OK' | string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<number>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
  connect?(): Promise<void>;
  quit(): Promise<'OK' | string>;
};

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: KvClient;
  readonly inMemory: boolean;

  constructor(config: AppConfigService) {
    const url = config.redisUrl.trim();
    if (!url) {
      this.client = new MemoryKv();
      this.inMemory = true;
    } else {
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      }) as unknown as KvClient;
      this.inMemory = false;
    }
  }

  async onModuleInit() {
    if (this.inMemory) {
      this.logger.warn('REDIS_URL not set — using in-memory store (single-instance only).');
      return;
    }
    try {
      await this.client.connect?.();
      this.logger.log('Redis connected');
    } catch (e) {
      this.logger.warn(
        `Redis not reachable at startup; will retry lazily. ${(e as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }

  async ping(): Promise<boolean> {
    try {
      const r = await this.client.ping();
      return r === 'PONG';
    } catch {
      return false;
    }
  }
}
