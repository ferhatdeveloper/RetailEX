import React from 'react';
import { Languages } from 'lucide-react';
import { useLanguage, Language } from '../utils/i18n/LanguageContext';

interface LanguageSelectorProps {
  darkMode?: boolean;
}

const languageOptions: { value: Language; label: string; flag: string }[] = [
  { value: 'tr', label: 'Türkçe', flag: 'ğŸ‡¹ğŸ‡·' },
  { value: 'en', label: 'English', flag: 'ğŸ‡¬ğŸ‡§' },
  { value: 'ar', label: 'العربية', flag: 'ğŸ‡®ğŸ‡¶' },
  { value: 'ckb', label: 'کوردی', flag: 'ğŸŸ¥ğŸŸ©' },
];

export function LanguageSelector({ darkMode = false }: LanguageSelectorProps) {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = React.useState(false);

  const currentLanguage = languageOptions.find(opt => opt.value === language);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg transition-all
          ${darkMode 
            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' 
            : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
          }
        `}
        title="Change Language"
      >
        <Languages className="w-4 h-4" />
        <span className="text-xl">{currentLanguage?.flag}</span>
        <span className="hidden sm:inline text-sm">{currentLanguage?.label}</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className={`
            absolute right-0 mt-2 w-48 rounded-lg shadow-lg z-40
            ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'}
          `}>
            <div className="py-1">
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setLanguage(option.value);
                    setIsOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors
                    ${language === option.value
                      ? darkMode
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-50 text-blue-600'
                      : darkMode
                        ? 'text-slate-200 hover:bg-slate-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  <span className="text-xl">{option.flag}</span>
                  <span className="flex-1 text-left">{option.label}</span>
                  {language === option.value && (
                    <span className="text-xs">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
