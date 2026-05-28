'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  LayoutDashboard,
  ScrollText,
  Users,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { PERMISSIONS } from '@logisti-core/shared';
import { SidebarRoot, useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { hasPermission } from '@/lib/permissions';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users, permission: PERMISSIONS.USERS_READ },
  {
    href: '/warehouses',
    label: 'Warehouses',
    icon: Boxes,
    permission: PERMISSIONS.WAREHOUSES_READ,
  },
  { href: '/audit', label: 'Audit Log', icon: ScrollText, permission: PERMISSIONS.AUDIT_READ },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { collapsed, toggle } = useSidebar();

  return (
    <SidebarRoot>
      <div className="flex h-14 items-center justify-between border-b px-3">
        {!collapsed && <span className="font-bold tracking-tight">LogistiCore</span>}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.filter((item) => !item.permission || hasPermission(user, item.permission)).map(
          (item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  collapsed && 'justify-center px-2',
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          },
        )}
      </nav>
    </SidebarRoot>
  );
}
