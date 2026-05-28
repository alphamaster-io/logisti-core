'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAuthStore, type AuthUser } from '@/store/auth-store';

interface Branch {
  id: string;
  name: string;
}

export function BranchSwitcher() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const res = await api.get<{ data: Branch[] } | Branch[]>('/api/proxy/branches');
      return Array.isArray(res) ? res : (res.data ?? []);
    },
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async (branchId: string | null) =>
      api.post<AuthUser>('/api/auth/switch-branch', { branchId }),
    onSuccess: (next) => {
      setUser(next);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(next.activeBranchId ? 'Branch switched' : 'Cleared branch filter');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to switch branch'),
  });

  if (!user) return null;
  const branches = branchesQuery.data ?? [];
  const hasMultiple = branches.length > 1;
  if (!user.isMaster && !hasMultiple) return null;

  const currentBranch =
    branches.find((b) => b.id === user.activeBranchId)?.name ??
    branches.find((b) => b.id === user.branchId)?.name ??
    'All branches';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" aria-label="Switch branch">
          <Building2 className="h-4 w-4" />
          {currentBranch}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Branch</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.isMaster && (
          <DropdownMenuItem onSelect={() => mutation.mutate(null)}>All branches</DropdownMenuItem>
        )}
        {branches.map((b) => (
          <DropdownMenuItem key={b.id} onSelect={() => mutation.mutate(b.id)}>
            {b.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
