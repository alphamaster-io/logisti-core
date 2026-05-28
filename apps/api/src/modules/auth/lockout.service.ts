import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class LockoutService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  private key(emailNormalized: string) {
    return `lockout:login:${emailNormalized}`;
  }

  async recordFailure(emailNormalized: string): Promise<{ locked: boolean; attempts: number }> {
    const k = this.key(emailNormalized);
    const attempts = await this.redis.client.incr(k);
    if (attempts === 1) {
      await this.redis.client.expire(k, this.config.loginLockoutMinutes * 60);
    }
    return {
      locked: attempts >= this.config.loginMaxAttempts,
      attempts,
    };
  }

  async isLocked(emailNormalized: string): Promise<boolean> {
    const v = await this.redis.client.get(this.key(emailNormalized));
    if (!v) return false;
    return parseInt(v, 10) >= this.config.loginMaxAttempts;
  }

  async clear(emailNormalized: string): Promise<void> {
    await this.redis.client.del(this.key(emailNormalized));
  }
}
