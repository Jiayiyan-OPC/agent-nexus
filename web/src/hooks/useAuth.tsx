import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const TOKEN_KEY = 'agent-nexus-token';

interface User {
  id: string;
  provider: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
}

interface AuthContext {
  user: User | null;
  loading: boolean;
  token: string | null;
  loginWithGoogle: () => void;
  loginWithMicrosoft: () => void;
  signOut: () => void;
}

const AuthCtx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async (jwt: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        setToken(jwt);
        localStorage.setItem(TOKEN_KEY, jwt);
      } else {
        // Token invalid, clear it
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
        setToken(null);
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      setToken(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Check for token in URL (OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      fetchUser(urlToken);
      return;
    }

    // Check localStorage
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      fetchUser(stored);
    } else {
      setLoading(false);
    }
  }, [fetchUser]);

  const loginWithGoogle = () => {
    window.location.href = `${API_URL}/api/auth/login/google`;
  };

  const loginWithMicrosoft = () => {
    window.location.href = `${API_URL}/api/auth/login/microsoft`;
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setToken(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, token, loginWithGoogle, loginWithMicrosoft, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
