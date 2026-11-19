import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PublicMember } from '../../types/index.ts';
import { apiFetch } from '../lib/api.ts';

interface AuthContextValue {
  user: PublicMember | null;
  loading: boolean;
  unreadCount: number;
  login: (email: string, password: string, rememberMe: boolean) => Promise<PublicMember>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const data = await apiFetch<{ unread_count: number }>('/api/notifications');
      setUnreadCount(data.unread_count);
    } catch {
      // Ignore if unauthenticated
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const startedAt = Date.now();
    try {
      const data = await apiFetch<{ user: PublicMember }>('/api/auth/me');
      setUser(data.user);
      await refreshUnreadCount();
    } catch {
      setUser(null);
      setUnreadCount(0);
    } finally {
      const remaining = 5000 - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }
      setLoading(false);
    }
  }, [refreshUnreadCount]);

  useEffect(() => {
    refreshUser();
    const interval = window.setInterval(refreshUnreadCount, 10000);
    return () => window.clearInterval(interval);
  }, [refreshUser, refreshUnreadCount]);

  const login = async (email: string, password: string, rememberMe: boolean) => {
    const data = await apiFetch<{ user: PublicMember }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, rememberMe }),
    });
    setUser(data.user);
    await refreshUnreadCount();
    return data.user;
  };

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setUnreadCount(0);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        unreadCount,
        login,
        logout,
        refreshUser,
        refreshUnreadCount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
