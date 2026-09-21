import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import * as authApi from "../api/auth";
import { setOnSessionExpired } from "../api/client";
import type { Me } from "../types/api";
import { tokenStorage } from "./tokenStorage";

interface AuthContextValue {
  user: Me | null;
  isAuthenticated: boolean;
  /** True while the initial session bootstrap (checking stored tokens) runs. */
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setOnSessionExpired(clearSession);
  }, [clearSession]);

  useEffect(() => {
    async function bootstrap() {
      if (!tokenStorage.getAccessToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await authApi.getMe();
        setUser(me);
      } catch {
        clearSession();
      } finally {
        setIsLoading(false);
      }
    }
    void bootstrap();
  }, [clearSession]);

  const login = useCallback(async (username: string, password: string) => {
    const { access, refresh } = await authApi.login(username, password);
    tokenStorage.setTokens(access, refresh);
    const me = await authApi.getMe();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Best-effort: even if blacklisting fails server-side, clear local session.
      }
    }
    clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const me = await authApi.getMe();
    setUser(me);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
