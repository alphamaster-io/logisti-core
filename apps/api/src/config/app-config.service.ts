import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // PORT is Cloud Run / generic PaaS convention; API_PORT is the local-dev override.
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_GLOBAL_PREFIX: z.string().default('api'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().url(),
  // Optional — if empty/unset, an in-memory fallback is used (single-instance only).
  REDIS_URL: z.string().optional().default(''),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
});

type EnvConfig = z.infer<typeof envSchema>;

@Injectable()
export class AppConfigService {
  private readonly env: EnvConfig;

  constructor(config: ConfigService) {
    const parsed = envSchema.safeParse({
      NODE_ENV: config.get<string>('NODE_ENV'),
      PORT: config.get<string>('PORT'),
      API_PORT: config.get<string>('API_PORT'),
      API_GLOBAL_PREFIX: config.get<string>('API_GLOBAL_PREFIX'),
      APP_URL: config.get<string>('APP_URL'),
      ALLOWED_ORIGINS: config.get<string>('ALLOWED_ORIGINS'),
      DATABASE_URL: config.get<string>('DATABASE_URL'),
      REDIS_URL: config.get<string>('REDIS_URL'),
      JWT_ACCESS_SECRET: config.get<string>('JWT_ACCESS_SECRET'),
      JWT_REFRESH_SECRET: config.get<string>('JWT_REFRESH_SECRET'),
      JWT_ACCESS_TTL: config.get<string>('JWT_ACCESS_TTL'),
      JWT_REFRESH_TTL: config.get<string>('JWT_REFRESH_TTL'),
      LOGIN_MAX_ATTEMPTS: config.get<string>('LOGIN_MAX_ATTEMPTS'),
      LOGIN_LOCKOUT_MINUTES: config.get<string>('LOGIN_LOCKOUT_MINUTES'),
    });
    if (!parsed.success) {
      throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
    }
    this.env = parsed.data;
  }

  get nodeEnv() {
    return this.env.NODE_ENV;
  }
  get isProd() {
    return this.env.NODE_ENV === 'production';
  }
  get port() {
    return this.env.PORT ?? this.env.API_PORT;
  }
  get globalPrefix() {
    return this.env.API_GLOBAL_PREFIX;
  }
  get allowedOrigins() {
    return this.env.ALLOWED_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  get databaseUrl() {
    return this.env.DATABASE_URL;
  }
  get redisUrl() {
    return this.env.REDIS_URL;
  }
  get jwtAccessSecret() {
    return this.env.JWT_ACCESS_SECRET;
  }
  get jwtRefreshSecret() {
    return this.env.JWT_REFRESH_SECRET;
  }
  get jwtAccessTtl() {
    return this.env.JWT_ACCESS_TTL;
  }
  get jwtRefreshTtl() {
    return this.env.JWT_REFRESH_TTL;
  }
  get loginMaxAttempts() {
    return this.env.LOGIN_MAX_ATTEMPTS;
  }
  get loginLockoutMinutes() {
    return this.env.LOGIN_LOCKOUT_MINUTES;
  }
}
