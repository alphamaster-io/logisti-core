import { NextResponse } from 'next/server';
import { loginRequestSchema } from '@logisti-core/shared';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  backendFetch,
  refreshCookieOptions,
} from '@/lib/server-api';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { title: 'Invalid login payload', status: 400, errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const res = await backendFetch('/auth/login', { method: 'POST', body: parsed.data });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    return NextResponse.json(data ?? { title: 'Login failed', status: res.status }, {
      status: res.status,
    });
  }

  const { accessToken, refreshToken, expiresIn, user } = data as {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: unknown;
  };

  const response = NextResponse.json({ user });
  response.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions(expiresIn ?? 900));
  response.cookies.set(REFRESH_COOKIE, refreshToken, refreshCookieOptions(60 * 60 * 24 * 7));
  return response;
}
