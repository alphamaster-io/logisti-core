'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { PaginatedResponse, UserResponse } from '@logisti-core/shared';
import { api, ApiError } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { CreateUserDialog } from '@/components/users/create-user-dialog';
import { EditUserDialog } from '@/components/users/edit-user-dialog';
import { formatDate } from '@/lib/utils';

type SortKey = 'createdAt:desc' | 'createdAt:asc' | 'email:asc' | 'email:desc';

export default function UsersPage() {
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [sort, setSort] = React.useState<SortKey>('createdAt:desc');
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = React.useState<UserResponse[]>([]);
  const [editTarget, setEditTarget] = React.useState<UserResponse | null>(null);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // reset cursor when filters change
  React.useEffect(() => {
    setCursor(undefined);
    setAccumulated([]);
  }, [debouncedSearch, sort]);

  const params = new URLSearchParams();
  params.set('limit', '20');
  params.set('sort', sort);
  if (debouncedSearch) params.set('q', debouncedSearch);
  if (cursor) params.set('cursor', cursor);

  const query = useQuery({
    queryKey: ['users', debouncedSearch, sort, cursor ?? ''],
    queryFn: () =>
      api.get<PaginatedResponse<UserResponse>>(`/api/proxy/users?${params.toString()}`),
    retry: false,
  });

  React.useEffect(() => {
    if (!query.data) return;
    setAccumulated((prev) => {
      const merged = cursor ? [...prev, ...query.data.data] : query.data.data;
      // de-dup by id
      const seen = new Set<string>();
      return merged.filter((u) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      });
    });
  }, [query.data, cursor]);

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/api/proxy/users/${id}/${active ? 'enable' : 'disable'}`),
    onSuccess: (_d, vars) => {
      toast.success(vars.active ? 'User enabled' : 'User disabled');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setAccumulated([]);
      setCursor(undefined);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Action failed'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/proxy/users/${id}`),
    onSuccess: () => {
      toast.success('User deleted');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setAccumulated([]);
      setCursor(undefined);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Delete failed'),
  });

  const columns: DataTableColumn<UserResponse>[] = [
    { key: 'email', header: 'Email', cell: (r) => <span className="font-medium">{r.email}</span> },
    { key: 'name', header: 'Name', cell: (r) => r.name },
    {
      key: 'roles',
      header: 'Roles',
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.roles.map((role) => (
            <Badge key={role} variant="secondary">
              {role}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: 'branch', header: 'Branch', cell: (r) => r.branchName ?? '—' },
    {
      key: 'status',
      header: 'Status',
      cell: (r) =>
        r.isActive ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="destructive">Disabled</Badge>
        ),
    },
    { key: 'lastLogin', header: 'Last login', cell: (r) => formatDate(r.lastLoginAt) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${r.email}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditTarget(r)}>Edit</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => toggleActive.mutate({ id: r.id, active: !r.isActive })}
            >
              {r.isActive ? 'Disable' : 'Enable'}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => {
                if (typeof window !== 'undefined' && window.confirm(`Delete ${r.email}?`)) {
                  remove.mutate(r.id);
                }
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: 'w-16',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">Manage members of your tenant.</p>
        </div>
        <CreateUserDialog />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-56" aria-label="Sort users">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt:desc">Newest first</SelectItem>
            <SelectItem value="createdAt:asc">Oldest first</SelectItem>
            <SelectItem value="email:asc">Email A → Z</SelectItem>
            <SelectItem value="email:desc">Email Z → A</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={accumulated}
        rowKey={(r) => r.id}
        loading={query.isPending && accumulated.length === 0}
        emptyMessage="No users found"
        hasMore={!!query.data?.hasMore}
        loadingMore={query.isFetching && !!cursor}
        onLoadMore={() => {
          if (query.data?.nextCursor) setCursor(query.data.nextCursor);
        }}
      />

      <EditUserDialog
        user={editTarget}
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      />
    </div>
  );
}
