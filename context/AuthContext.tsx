import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, saveToken, clearToken, loginRequest, registerRequest } from '../services/auth';

type AuthContextValue = {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getToken().then((stored) => {
      setToken(stored);
      setIsLoading(false);
    });
  }, []);

  const login = async (email: string, password: string) => {
    const t = await loginRequest(email, password);
    await saveToken(t);
    setToken(t);
  };

  const register = async (email: string, password: string) => {
    const t = await registerRequest(email, password);
    await saveToken(t);
    setToken(t);
  };

  const logout = async () => {
    await clearToken();
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
