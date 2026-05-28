'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { useAuthStore, type AuthUser } from '@/store/auth-store';
import { Button } from '@/components/ui/button';

export function ImpersonationBanner() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  const revert = useMutation({
    mutationFn: async () => api.post<AuthUser>('/api/auth/switch-role', { roleKey: null }),
    onSuccess: (next) => {
      setUser(next);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Reverted to all roles');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to revert role'),
  });

  if (!user?.activeRoleKey) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-b border-warning/30 bg-warning/15 px-4 py-2 text-sm">
      <span>
        Acting as <strong>{user.activeRoleKey}</strong>. Effective permissions are restricted.
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => revert.mutate()}
        disabled={revert.isPending}
      >
        Revert
      </Button>
    </div>
  );
}
