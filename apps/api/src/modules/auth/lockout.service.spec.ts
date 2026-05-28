import { LockoutService } from './lockout.service';

describe('LockoutService', () => {
  const fakeRedis = (() => {
    const store = new Map<string, string>();
    const ttls = new Map<string, number>();
    return {
      client: {
        incr: jest.fn(async (k: string) => {
          const v = (parseInt(store.get(k) ?? '0', 10) || 0) + 1;
          store.set(k, String(v));
          return v;
        }),
        expire: jest.fn(async (k: string, s: number) => {
          ttls.set(k, s);
          return 1;
        }),
        get: jest.fn(async (k: string) => store.get(k) ?? null),
        del: jest.fn(async (k: string) => {
          const had = store.delete(k);
          ttls.delete(k);
          return had ? 1 : 0;
        }),
      },
      _store: store,
      _ttls: ttls,
    };
  })();

  const config = {
    loginMaxAttempts: 5,
    loginLockoutMinutes: 15,
  } as unknown as ConstructorParameters<typeof LockoutService>[1];

  const service = new LockoutService(fakeRedis as never, config);

  beforeEach(() => {
    fakeRedis._store.clear();
    fakeRedis._ttls.clear();
    jest.clearAllMocks();
  });

  it('reports not-locked initially', async () => {
    expect(await service.isLocked('a@b.test')).toBe(false);
  });

  it('locks after max attempts', async () => {
    let result = { locked: false, attempts: 0 };
    for (let i = 0; i < 5; i += 1) {
      result = await service.recordFailure('a@b.test');
    }
    expect(result.locked).toBe(true);
    expect(await service.isLocked('a@b.test')).toBe(true);
  });

  it('sets ttl on first failure only', async () => {
    await service.recordFailure('a@b.test');
    await service.recordFailure('a@b.test');
    expect(fakeRedis.client.expire).toHaveBeenCalledTimes(1);
    expect(fakeRedis._ttls.get('lockout:login:a@b.test')).toBe(900);
  });

  it('clears lockout', async () => {
    await service.recordFailure('a@b.test');
    await service.clear('a@b.test');
    expect(await service.isLocked('a@b.test')).toBe(false);
  });
});
