'use client';

import { RoleSwitcher } from '@/components/auth/role-switcher';
import { BranchSwitcher } from '@/components/auth/branch-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';

export function Topbar() {
  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4">
      <div className="text-sm font-semibold">LogistiCore</div>
      <div className="flex items-center gap-2">
        <RoleSwitcher />
        <BranchSwitcher />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
