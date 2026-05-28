'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, Boxes, Building2, Users } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/auth-store';
import type { PaginatedResponse, UserResponse } from '@logisti-core/shared';

interface Counted {
  total: number;
  loading: boolean;
}

function useCount(path: string): Counted {
  const q = useQuery({
    queryKey: ['count', path],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<unknown> | unknown[]>(
        `/api/proxy/${path}?limit=1`,
      );
      if (Array.isArray(res)) return res.length;
      return res.data?.length ?? 0;
    },
    retry: false,
  });
  return { total: q.data ?? 0, loading: q.isPending };
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const users = useCount('users');
  const branches = useCount('branches');
  const warehouses = useCount('warehouses');
  const audit = useCount('audit-logs');

  // demo: latest user names (small list call)
  const usersList = useQuery({
    queryKey: ['users', 'latest'],
    queryFn: () => api.get<PaginatedResponse<UserResponse>>('/api/proxy/users?limit=5'),
    retry: false,
  });

  const cards = [
    { title: 'Users', value: users, icon: Users },
    { title: 'Branches', value: branches, icon: Building2 },
    { title: 'Warehouses', value: warehouses, icon: Boxes },
    { title: 'Audit events', value: audit, icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back{user ? `, ${user.name}` : ''}. Phase 1 — auth, users, RBAC, warehouse
          hierarchy.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{c.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {c.value.loading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{c.value.total}</div>
                )}
                <p className="text-xs text-muted-foreground">Page sample</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Your active context</CardDescription>
        </CardHeader>
        <CardContent>
          {user ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{user.name}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{user.email}</dd>
              <dt className="text-muted-foreground">Roles</dt>
              <dd>{user.roles.join(', ') || '—'}</dd>
              <dt className="text-muted-foreground">Active role</dt>
              <dd>{user.activeRoleKey ?? 'all'}</dd>
              <dt className="text-muted-foreground">Branch</dt>
              <dd>{user.branchName ?? user.branchId ?? 'all'}</dd>
              <dt className="text-muted-foreground">Tenant</dt>
              <dd>{user.tenantId}</dd>
            </dl>
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest users</CardTitle>
        </CardHeader>
        <CardContent>
          {usersList.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : usersList.data?.data?.length ? (
            <ul className="divide-y text-sm">
              {usersList.data.data.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2">
                  <span>{u.name}</span>
                  <span className="text-muted-foreground">{u.email}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No users to display.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
