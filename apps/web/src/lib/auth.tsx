import type { Role } from '@nishkarsh/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokenStore } from './api';
import type { SessionUser } from './types';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  demoLogin: (role: Role, email?: string) => Promise<SessionUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tokenStore.get()) return setLoading(false);
    api<SessionUser>('/auth/me')
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const start = useCallback(
    (session: { token: string; user: SessionUser }) => {
      tokenStore.set(session.token);
      // never show one role's cached data to another (the public demo-user list is safe to keep)
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'demo-users' });
      setUser(session.user);
      return session.user;
    },
    [queryClient],
  );

  const value: AuthState = {
    user,
    loading,
    login: async (email, password) => start(await api('/auth/login', { body: { email, password } })),
    demoLogin: async (role, email) => start(await api('/auth/demo-login', { body: { role, email } })),
    logout: () => {
      tokenStore.clear();
      queryClient.clear();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const HOME_BY_ROLE: Record<Role, string> = {
  DEPT_OFFICER: '/officer',
  STARTUP: '/startup',
  FINANCE: '/finance',
  EVALUATOR: '/evaluator',
  FIELD_STAFF: '/pilots',
  VALIDATOR: '/pilots',
  ADMIN: '/coming-soon',
};

