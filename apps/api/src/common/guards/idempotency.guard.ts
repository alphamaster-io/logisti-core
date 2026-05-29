import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_IDEMPOTENCY_KEY } from '../decorators/require-idempotency.decorator';

interface ReqWithHeader {
  header(name: string): string | undefined;
}

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<boolean>(REQUIRE_IDEMPOTENCY_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? false;
    if (!required) return true;
    const req = ctx.switchToHttp().getRequest<ReqWithHeader>();
    const key = req.header('idempotency-key');
    if (!key || key.trim().length === 0) {
      throw new BadRequestException(
        'Idempotency-Key header is required on this endpoint. Provide a unique value (e.g. a UUID) on retries.',
      );
    }
    return true;
  }
}
