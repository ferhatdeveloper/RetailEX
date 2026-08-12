import { Globe } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Language } from '../../locales/translations';

const LANG_OPTIONS: { code: Language; label: string }[] = [
  { code: 'tr', label: 'TR' },
  { code: 'en', label: 'EN' },
  { code: 'ar', label: 'AR' },
  { code: 'ku', label: 'KU' },
];

type InlineLanguageSwitcherVariant = 'light' | 'onColor';

interface InlineLanguageSwitcherProps {
  variant?: InlineLanguageSwitcherVariant;
  className?: string;
  showIcon?: boolean;
}

export function InlineLanguageSwitcher({
  variant = 'light',
  className = '',
  showIcon = true,
}: InlineLanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage();

  const handleChange = (code: Language) => {
    setLanguage(code);
    const rtl = code === 'ar' || code === 'ku';
    localStorage.setItem('retailos_rtl_mode', String(rtl));
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  };

  const onColor = variant === 'onColor';

  return (
    <div
      className={`inline-flex items-center gap-2 ${className}`}
      role="group"
      aria-label="Language"
    >
      {showIcon ? (
        <Globe
          className={`w-4 h-4 shrink-0 ${onColor ? 'text-white/80' : 'text-slate-500'}`}
          aria-hidden
        />
      ) : null}
      <div
        className={`inline-flex rounded-xl p-0.5 gap-0.5 ${
          onColor ? 'bg-white/15' : 'bg-slate-100 border border-slate-200'
        }`}
      >
        {LANG_OPTIONS.map(opt => {
          const active = language === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => handleChange(opt.code)}
              className={`min-w-[2.5rem] px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                active
                  ? onColor
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'bg-white text-slate-800 shadow-sm border border-slate-200'
                  : onColor
                    ? 'text-white/85 hover:bg-white/10'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
              }`}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
