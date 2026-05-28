import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, backendFetch, getRefreshToken } from '@/lib/server-api';

export async function POST() {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      await backendFetch('/auth/logout', {
        method: 'POST',
        body: { refreshToken },
      });
    } catch {
      // ignore
    }
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, '', { path: '/api/auth', maxAge: 0 });
  return response;
}
