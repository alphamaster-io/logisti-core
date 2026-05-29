import { NextResponse } from 'next/server';
import { backendFetch, getAccessToken } from '@/lib/server-api';

async function handle(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
  method: string,
): Promise<Response> {
  const access = await getAccessToken();
  if (!access) {
    return NextResponse.json({ title: 'Unauthorized', status: 401 }, { status: 401 });
  }
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const search = url.searchParams.toString();
  const target = `/${path.join('/')}${search ? `?${search}` : ''}`;

  let body: unknown = undefined;
  if (method !== 'GET' && method !== 'DELETE') {
    try {
      body = await req.json();
    } catch {
      body = undefined;
    }
  }
  // Forward client-supplied passthrough headers (e.g. Idempotency-Key for the
  // payments endpoints that mandate it). Auth + content-type are set by
  // backendFetch.
  const forwarded: Record<string, string> = {};
  const idemKey = req.headers.get('idempotency-key');
  if (idemKey) forwarded['idempotency-key'] = idemKey;

  const res = await backendFetch(target, {
    method,
    body,
    headers: forwarded,
    bearer: access,
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  if (contentType.includes('application/json') || contentType.includes('problem+json')) {
    const data = await res.json().catch(() => null);
    return NextResponse.json(data ?? {}, { status: res.status });
  }
  const text = await res.text().catch(() => '');
  return new NextResponse(text, { status: res.status });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx, 'GET');
}
export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx, 'POST');
}
export async function PATCH(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx, 'PATCH');
}
export async function PUT(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx, 'PUT');
}
export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx, 'DELETE');
}
