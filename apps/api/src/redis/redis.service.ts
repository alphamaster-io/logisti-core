import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { type AppConfigService } from '../config/app-config.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: AppConfigService) {
    this.client = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
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
