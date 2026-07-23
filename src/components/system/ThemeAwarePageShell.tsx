import { useTheme } from '../../contexts/ThemeContext';

export function ThemeAwarePageShell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { darkMode } = useTheme();

  return (
    <div
      className={`h-screen w-full overflow-hidden ${darkMode ? 'bg-[var(--asin-primary,#0E2433)] text-gray-100' : 'bg-[var(--asin-surface,#F3F5F7)] text-gray-900'} ${className}`}
    >
      {children}
    </div>
  );
}
