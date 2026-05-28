import { NextResponse } from 'next/server';
import { backendFetch, getAccessToken } from '@/lib/server-api';

export async function GET() {
  const access = await getAccessToken();
  if (!access) {
    return NextResponse.json({ title: 'Unauthorized', status: 401 }, { status: 401 });
  }
  const res = await backendFetch('/users/me', { bearer: access });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    return NextResponse.json(data ?? { title: 'Failed to load profile', status: res.status }, {
      status: res.status,
    });
  }
  return NextResponse.json(data);
}
