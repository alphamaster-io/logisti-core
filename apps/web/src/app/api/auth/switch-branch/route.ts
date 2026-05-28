import { NextResponse } from 'next/server';
import { backendFetch, getAccessToken } from '@/lib/server-api';

export async function POST(req: Request) {
  const access = await getAccessToken();
  if (!access) {
    return NextResponse.json({ title: 'Unauthorized', status: 401 }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const res = await backendFetch('/auth/switch-branch', {
    method: 'POST',
    body,
    bearer: access,
  });
  const data = await res.json().catch(() => null);
  return NextResponse.json(data ?? {}, { status: res.status });
}
