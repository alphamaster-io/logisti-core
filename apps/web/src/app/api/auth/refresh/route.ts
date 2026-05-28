import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  backendFetch,
  getRefreshToken,
  refreshCookieOptions,
} from '@/lib/server-api';

export async function POST() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return NextResponse.json({ title: 'No refresh token', status: 401 }, { status: 401 });
  }
  const res = await backendFetch('/auth/refresh', { method: 'POST', body: { refreshToken } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const response = NextResponse.json(data ?? { title: 'Refresh failed', status: res.status }, {
      status: res.status,
    });
    response.cookies.set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
    response.cookies.set(REFRESH_COOKIE, '', { path: '/api/auth', maxAge: 0 });
    return response;
  }
  const { accessToken, refreshToken: newRefresh, expiresIn } = data as {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions(expiresIn ?? 900));
  response.cookies.set(REFRESH_COOKIE, newRefresh, refreshCookieOptions(60 * 60 * 24 * 7));
  return response;
}
