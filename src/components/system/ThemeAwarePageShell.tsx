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
      className={`h-screen w-full overflow-hidden ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'} ${className}`}
    >
      {children}
    </div>
  );
}
