'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ALL_ROLES, ROLE_DESCRIPTIONS } from '@logisti-core/shared';
import { Shield } from 'lucide-react';
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

export function RoleSwitcher() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (roleKey: string | null) =>
      api.post<AuthUser>('/api/auth/switch-role', { roleKey }),
    onSuccess: (next) => {
      setUser(next);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(next.activeRoleKey ? `Acting as ${next.activeRoleKey}` : 'Reverted to all roles');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to switch role'),
  });

  if (!user?.isMaster) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" aria-label="Switch role">
          <Shield className="h-4 w-4" />
          {user.activeRoleKey ?? 'All roles'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Act as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => mutation.mutate(null)}>
          <span className="font-medium">All roles (revert)</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {ALL_ROLES.map((role) => (
          <DropdownMenuItem key={role} onSelect={() => mutation.mutate(role)}>
            <div className="flex flex-col">
              <span className="font-medium">{role}</span>
              <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
