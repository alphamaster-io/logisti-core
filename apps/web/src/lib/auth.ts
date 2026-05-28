import { api } from './api-client';
import type { AuthUser } from '@/store/auth-store';

export async function getCurrentUserClient(): Promise<AuthUser | null> {
  try {
    return await api.get<AuthUser>('/api/auth/me');
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    await api.post('/api/auth/logout');
  } catch {
    // ignore
  }
}
