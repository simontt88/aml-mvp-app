import React, { createContext, useContext, useState, useEffect } from 'react';
import { Operator } from '../types';
import { authApi, setAuthToken, getAuthToken } from '../services/api';

interface AuthContextType {
  isAuthenticated: boolean;
  operator: Operator | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const currentUser = await authApi.getCurrentUser();
          setOperator(currentUser);
          setIsAuthenticated(true);
        } catch (error) {
          localStorage.removeItem('access_token');
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const tokenResponse = await authApi.login({ email, password });
      setAuthToken(tokenResponse.access_token);
      
      const currentUser = await authApi.getCurrentUser();
      setOperator(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    authApi.logout();
    setOperator(null);
    setIsAuthenticated(false);
  };

  const value = {
    isAuthenticated,
    operator,
    login,
    logout,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};