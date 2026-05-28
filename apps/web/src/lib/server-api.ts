/**
 * Server-only helpers for proxying requests from Next.js API routes to the
 * NestJS backend. Reads the access/refresh tokens from httpOnly cookies and
 * forwards them as bearer tokens.
 */
import { cookies } from 'next/headers';

export const ACCESS_COOKIE = 'lc_access';
export const REFRESH_COOKIE = 'lc_refresh';

export function backendUrl(path: string): string {
  const base =
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:4000/api/v1';
  if (path.startsWith('/')) return `${base}${path}`;
  return `${base}/${path}`;
}

export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value;
}

export interface BackendFetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  bearer?: string | undefined;
}

export async function backendFetch(
  path: string,
  opts: BackendFetchOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.headers ?? {}),
  };
  if (opts.bearer) {
    headers['Authorization'] = `Bearer ${opts.bearer}`;
  }
  return fetch(backendUrl(path), {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    cache: 'no-store',
  });
}

const isProd = process.env.NODE_ENV === 'production';

export function accessCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function refreshCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/api/auth',
    maxAge: maxAgeSeconds,
  };
}
