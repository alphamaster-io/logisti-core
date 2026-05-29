import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyGuard } from './idempotency.guard';

function makeCtx(header: string | undefined) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => (name === 'idempotency-key' ? header : undefined),
      }),
    }),
  } as never;
}

describe('IdempotencyGuard', () => {
  it('passes when the handler is not marked', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new IdempotencyGuard(reflector);
    expect(guard.canActivate(makeCtx(undefined))).toBe(true);
  });

  it('passes when the handler is marked and the header is present', () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    const guard = new IdempotencyGuard(reflector);
    expect(guard.canActivate(makeCtx('a1b2-c3d4'))).toBe(true);
  });

  it('throws when the handler is marked but the header is missing', () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    const guard = new IdempotencyGuard(reflector);
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(BadRequestException);
  });

  it('throws when the handler is marked but the header is empty / whitespace', () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    const guard = new IdempotencyGuard(reflector);
    expect(() => guard.canActivate(makeCtx('   '))).toThrow(BadRequestException);
  });
});
