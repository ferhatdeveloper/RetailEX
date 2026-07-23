import { Delete, Lock } from 'lucide-react';
import { cn } from '../ui/utils';
import { useTheme } from '../../contexts/ThemeContext';

export interface PinNumpadInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  /** Görünen nokta sayısı (PIN hissi); değer daha uzun olabilir */
  dotSlots?: number;
  disabled?: boolean;
  label?: string;
  hint?: string;
  error?: boolean;
  errorText?: string;
  /** Form içi daha kompakt tuşlar */
  compact?: boolean;
  darkMode?: boolean;
  /** Klavye ile serbest giriş (harf/rakam) */
  allowKeyboard?: boolean;
  keyboardPlaceholder?: string;
  /** false: numpad gizlenir (yalnızca klavye) */
  showNumpad?: boolean;
  className?: string;
}

export function PinNumpadInput({
  value,
  onChange,
  maxLength = 8,
  dotSlots = 4,
  disabled = false,
  label,
  hint,
  error = false,
  errorText,
  compact = false,
  darkMode: darkModeProp,
  allowKeyboard = false,
  keyboardPlaceholder = '••••••••',
  showNumpad = true,
  className,
}: PinNumpadInputProps) {
  const { darkMode: themeDarkMode } = useTheme();
  const darkMode = darkModeProp ?? themeDarkMode;

  const addDigit = (digit: string) => {
    if (disabled || value.length >= maxLength) return;
    onChange(value + digit);
  };

  const clearAll = () => {
    if (disabled) return;
    onChange('');
  };

  const backspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const btnH = compact ? 'h-11' : 'h-12';
  const btnText = compact ? 'text-lg' : 'text-xl';

  return (
    <div className={cn(
      'rounded-xl border p-3',
      darkMode ? 'border-gray-700 bg-gray-800/90' : 'border-slate-200 bg-white',
      error && (darkMode ? 'border-red-500/50 bg-red-950/20' : 'border-red-300 bg-red-50/30'),
      className,
    )}>
      {(label || hint) && (
        <div className="mb-3">
          {label && <p className={cn('text-xs font-semibold', darkMode ? 'text-gray-200' : 'text-slate-700')}>{label}</p>}
          {hint && <p className={cn('text-[11px] mt-0.5', darkMode ? 'text-gray-500' : 'text-slate-500')}>{hint}</p>}
        </div>
      )}

      {allowKeyboard && (
        <div className="relative mb-3 group">
          <Lock
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors',
              darkMode ? 'text-gray-500 group-focus-within:text-[var(--asin-accent,#1FA8A0)]' : 'text-slate-400 group-focus-within:text-[var(--asin-accent,#1FA8A0)]',
            )}
          />
          <input
            type="password"
            value={value}
            disabled={disabled}
            maxLength={maxLength}
            placeholder={keyboardPlaceholder}
            onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
            className={cn(
              'w-full pl-10 pr-4 py-3 border-2 rounded-lg font-bold text-sm outline-none transition-all focus:border-[var(--asin-accent,#1FA8A0)]',
              darkMode
                ? 'bg-gray-900/80 border-gray-600 text-white placeholder-gray-600'
                : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400',
            )}
            autoComplete="current-password"
          />
        </div>
      )}

      {(showNumpad || !allowKeyboard) && (
        <>
      <div className="flex justify-center gap-2 mb-3">
        {Array.from({ length: dotSlots }, (_, i) => {
          const filled = value.length > i;
          return (
            <div
              key={i}
              className={cn(
                'rounded-full transition-all',
                compact ? 'w-2.5 h-2.5' : 'w-3 h-3',
                filled ? 'bg-[var(--asin-accent,#1FA8A0)] scale-110' : darkMode ? 'bg-gray-600' : 'bg-slate-200',
              )}
            />
          );
        })}
      </div>

      {value.length > dotSlots && (
        <p className="text-center text-[10px] font-bold text-[var(--asin-accent,#1FA8A0)] mb-2 tabular-nums">
          {value.length}/{maxLength}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => addDigit(String(num))}
            disabled={disabled}
            className={cn(
              btnH,
              btnText,
              'rounded-lg font-semibold active:scale-95 disabled:opacity-40',
              darkMode
                ? 'bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white'
                : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800',
            )}
          >
            {num}
          </button>
        ))}
        <button
          type="button"
          onClick={clearAll}
          disabled={disabled}
          className={cn(
            btnH,
            'rounded-lg bg-red-50 hover:bg-red-100 border border-red-100 flex items-center justify-center text-red-500 disabled:opacity-40',
          )}
          title="Temizle"
        >
          <Delete className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => addDigit('0')}
          disabled={disabled}
          className={cn(
            btnH,
            btnText,
            'rounded-lg font-semibold active:scale-95 disabled:opacity-40',
            darkMode
              ? 'bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white'
              : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800',
          )}
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={disabled}
          className={cn(
            btnH,
            'rounded-lg text-sm font-bold active:scale-95 disabled:opacity-40',
            darkMode
              ? 'bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300'
              : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500',
          )}
        >
          ←
        </button>
      </div>

      {error && errorText && (
        <p className="text-center text-xs font-semibold text-red-600 mt-2">{errorText}</p>
      )}
        </>
      )}
    </div>
  );
}
