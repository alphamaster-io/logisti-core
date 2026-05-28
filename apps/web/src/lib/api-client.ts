import type { ProblemDetails } from '@logisti-core/shared';

export class ApiError extends Error {
  status: number;
  problem?: ProblemDetails;

  constructor(message: string, status: number, problem?: ProblemDetails) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

type FetchInit = RequestInit & { json?: unknown };

/**
 * Client-side fetcher. All browser code calls Next.js `/api/*` routes which
 * inject the bearer token from httpOnly cookies. On 401 the client transparently
 * attempts a refresh once and replays the original request.
 */
export async function apiFetch<T>(path: string, init: FetchInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const finalInit: RequestInit = {
    ...rest,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers ?? {}),
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  };

  let res = await fetch(path, finalInit);
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (refreshed.ok) {
      res = await fetch(path, finalInit);
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    let problem: ProblemDetails | undefined;
    let message = `Request failed: ${res.status}`;
    if (contentType.includes('application/json') || contentType.includes('problem+json')) {
      try {
        problem = (await res.json()) as ProblemDetails;
        message = problem.detail ?? problem.title ?? message;
      } catch {
        // ignore JSON parse failure
      }
    } else {
      try {
        message = (await res.text()) || message;
      } catch {
        // ignore
      }
    }
    throw new ApiError(message, res.status, problem);
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', json: body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', json: body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', json: body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
