import { SetMetadata } from '@nestjs/common';

export const REQUIRE_IDEMPOTENCY_KEY = 'requireIdempotency';

/**
 * Mark a handler (or controller) as requiring an Idempotency-Key header on
 * every request. The IdempotencyGuard enforces this; the existing
 * IdempotencyMiddleware handles the actual replay cache. Both must be wired
 * for the requirement to take effect.
 */
export const RequireIdempotency = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_IDEMPOTENCY_KEY, true);
