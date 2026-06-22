import { useMemo } from 'react';
import { ConfigProvider } from 'antd';
import { useTheme } from '../contexts/ThemeContext';
import { getRetailexAntdTheme } from './retailexAntdTheme';

export function AntDesignThemeProvider({ children }: { children: React.ReactNode }) {
  const { darkMode } = useTheme();
  const themeConfig = useMemo(() => getRetailexAntdTheme(darkMode), [darkMode]);

  return <ConfigProvider theme={themeConfig}>{children}</ConfigProvider>;
}
