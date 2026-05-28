'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { ImpersonationBanner } from '@/components/auth/impersonation-banner';
import { useAuthStore, type AuthUser } from '@/store/auth-store';
import { Skeleton } from '@/components/ui/skeleton';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<AuthUser>('/api/auth/me'),
    retry: false,
  });

  React.useEffect(() => {
    if (meQuery.data) setUser(meQuery.data);
  }, [meQuery.data, setUser]);

  React.useEffect(() => {
    if (meQuery.isError) router.push('/login');
  }, [meQuery.isError, router]);

  if (meQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Topbar />
          <ImpersonationBanner />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
