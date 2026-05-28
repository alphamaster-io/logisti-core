// Minimal in-memory adapter exposing just the ioredis methods this app uses.
// Used when REDIS_URL is empty (e.g. single-instance Cloud Run, dev, tests).
// Loses state on restart and does not share across instances — only safe when
// max-instances=1.

type Entry = { value: string; expiresAt: number | null };

export class MemoryKv {
  private readonly store = new Map<string, Entry>();

  private isExpired(e: Entry): boolean {
    return e.expiresAt !== null && Date.now() >= e.expiresAt;
  }

  private read(key: string): Entry | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (this.isExpired(e)) {
      this.store.delete(key);
      return null;
    }
    return e;
  }

  async get(key: string): Promise<string | null> {
    return this.read(key)?.value ?? null;
  }

  async set(key: string, value: string, mode?: string, ttlSeconds?: number): Promise<'OK'> {
    const expiresAt = mode === 'EX' && ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    const e = this.read(key);
    const next = (e ? parseInt(e.value, 10) || 0 : 0) + 1;
    this.store.set(key, { value: String(next), expiresAt: e?.expiresAt ?? null });
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    const e = this.read(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, e);
    return 1;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  async connect(): Promise<void> {
    return undefined;
  }

  async quit(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }
}
