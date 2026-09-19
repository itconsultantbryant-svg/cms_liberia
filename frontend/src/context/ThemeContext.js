import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { assetUrl } from '../config/api';

const ThemeContext = createContext({
  primaryColor: '#2c3e50',
  secondaryColor: '#3498db',
  logoUrl: null,
  faviconUrl: null,
  loginBackgroundUrl: null,
  churchName: null
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  const { user } = useAuth();
  const church = user?.church;

  const theme = useMemo(
    () => ({
      primaryColor: church?.primaryColor || '#2c3e50',
      secondaryColor: church?.secondaryColor || '#3498db',
      logoUrl: assetUrl(church?.logoUrl),
      faviconUrl: assetUrl(church?.faviconUrl),
      loginBackgroundUrl: assetUrl(church?.loginBackgroundUrl),
      churchName: church?.shortName || church?.name || null
    }),
    [church]
  );

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--church-primary', theme.primaryColor);
    root.style.setProperty('--church-secondary', theme.secondaryColor);
    root.style.setProperty('--church-primary-contrast', '#ffffff');

    if (theme.faviconUrl) {
      let link = document.querySelector("link[rel='icon'][data-church-brand]");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.setAttribute('data-church-brand', '1');
        document.head.appendChild(link);
      }
      link.href = theme.faviconUrl;
    }

    if (theme.churchName) {
      document.title = `${theme.churchName} · CMS`;
    }
  }, [theme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};
