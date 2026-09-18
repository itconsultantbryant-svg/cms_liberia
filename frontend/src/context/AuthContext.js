import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data.user);
      return response.data.user;
    } catch (error) {
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [fetchUser]);

  const login = async (email, password) => {
    try {
      const response = await axios.post('/api/auth/login', { email, password });
      const { token, user } = response.data;
      if (!token || !user) {
        throw new Error('Invalid response from server');
      }
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(user);
      return user;
    } catch (error) {
      console.error('Login error:', error);
      const raw = error.response?.data?.error ?? error.response?.data?.message ?? error.message ?? 'Login failed';
      const errorMessage = typeof raw === 'string' ? raw : (raw?.message || JSON.stringify(raw));
      throw new Error(errorMessage);
    }
  };

  const register = async (data) => {
    const response = await axios.post('/api/auth/register', data);
    return response.data;
  };

  const changePassword = async (currentPassword, newPassword) => {
    const response = await axios.post('/api/auth/change-password', {
      currentPassword,
      newPassword
    });
    const { token } = response.data;
    if (token) {
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    return response.data;
  };

  const applyChurchBranding = (branding) => {
    if (!branding) return;
    setUser((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        church: {
          ...(prev.church || {}),
          ...branding,
          id: branding.id || prev.church?.id,
          name: branding.name || prev.church?.name,
          shortName: branding.shortName || prev.church?.shortName,
          logoUrl: branding.logoUrl ?? prev.church?.logoUrl,
          faviconUrl: branding.faviconUrl ?? prev.church?.faviconUrl,
          primaryColor: branding.primaryColor || prev.church?.primaryColor,
          secondaryColor: branding.secondaryColor || prev.church?.secondaryColor
        }
      };
    });
  };

  const selectBranch = async (branchId) => {
    const response = await axios.post('/api/branches/select', { branchId });
    const { token, activeBranchId, branch } = response.data;
    if (token) {
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    setUser((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        activeBranchId,
        branchId: activeBranchId,
        activeBranch: branch
      };
    });
    return response.data;
  };

  const enterSupportAccess = async (churchId, reason) => {
    const response = await axios.post(`/api/superadmin/churches/${churchId}/support-access`, {
      reason
    });
    const { token, user: nextUser } = response.data;
    if (!token || !nextUser) throw new Error('Invalid support access response');
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(nextUser);
    return response.data;
  };

  const endSupportAccess = async () => {
    const response = await axios.post('/api/superadmin/support-access/end');
    const { token, user: nextUser } = response.data;
    if (token) {
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    if (nextUser) setUser(nextUser);
    else await fetchUser();
    return response.data;
  };

  const logout = async () => {
    try {
      if (user?.supportMode) {
        await axios.post('/api/superadmin/support-access/end').catch(() => {});
      }
      await axios.post('/api/auth/logout');
    } catch (_) {
      // ignore
    }
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const value = {
    user,
    login,
    register,
    changePassword,
    logout,
    loading,
    fetchUser,
    applyChurchBranding,
    selectBranch,
    enterSupportAccess,
    endSupportAccess,
    setUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
