'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContextValue | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const toggle = React.useCallback(() => setCollapsed((c) => !c), []);
  return (
    <SidebarContext.Provider value={{ collapsed, toggle, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}

export function SidebarRoot({ className, children }: { className?: string; children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'flex h-full flex-col border-r bg-background transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64',
        className,
      )}
    >
      {children}
    </aside>
  );
}
