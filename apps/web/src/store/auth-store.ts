import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  tenantId: string;
  branchId?: string | null;
  branchName?: string | null;
  isMaster?: boolean;
  activeRoleKey?: string | null;
  activeBranchId?: string | null;
  availableBranches?: Array<{ id: string; name: string }>;
  availableRoles?: string[];
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clear: () => set({ user: null }),
}));
