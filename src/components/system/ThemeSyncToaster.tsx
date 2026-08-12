import { Toaster } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';

export function ThemeSyncToaster() {
  const { darkMode } = useTheme();

  return (
    <Toaster
      richColors
      theme={darkMode ? 'dark' : 'light'}
      position="bottom-right"
      expand
      visibleToasts={5}
      toastOptions={{
        style: {
          marginBottom: '8px',
        },
        className: 'toast-item',
      }}
    />
  );
}
