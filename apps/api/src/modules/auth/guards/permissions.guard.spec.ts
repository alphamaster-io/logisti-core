import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

const makeCtx = (user: { permissions: string[] } | undefined): ExecutionContext =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  }) as unknown as ExecutionContext;

describe('PermissionsGuard', () => {
  it('allows when public flag is set', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true);
    const guard = new PermissionsGuard(reflector);
    expect(guard.canActivate(makeCtx(undefined))).toBe(true);
  });

  it('allows when no permissions are required', () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined as unknown as string[]);
    const guard = new PermissionsGuard(reflector);
    expect(guard.canActivate(makeCtx({ permissions: [] }))).toBe(true);
  });

  it('forbids when user lacks permission', () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['users.create']);
    const guard = new PermissionsGuard(reflector);
    expect(() => guard.canActivate(makeCtx({ permissions: ['users.read'] }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows when user has all permissions', () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['users.create']);
    const guard = new PermissionsGuard(reflector);
    expect(guard.canActivate(makeCtx({ permissions: ['users.create', 'users.read'] }))).toBe(true);
  });
});
