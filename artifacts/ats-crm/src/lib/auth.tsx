import { createContext, useContext, useState } from "react";
import { useLocation } from "wouter";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

interface AuthContextType {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Configure API client immediately, before any React component/query can run.
setBaseUrl("https://healthrecruit-api.onrender.com");
setAuthTokenGetter(() => localStorage.getItem("ats_token"));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("ats_token"));
  const [, setLocation] = useLocation();

  const login = (newToken: string) => {
    localStorage.setItem("ats_token", newToken);
    setToken(newToken);
    setLocation("/dashboard");
  };

  const logout = () => {
    localStorage.removeItem("ats_token");
    setToken(null);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
