import { X, Check, Globe } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { translations } from '../../locales/translations';

interface LanguageSelectionModalProps {
  onClose: () => void;
  rtlMode: boolean;
  setRtlMode: (value: boolean) => void;
}

type LanguageOption = {
  code: 'tr' | 'en' | 'ar' | 'ku';
  flag: string;
  name: string;
  localName: string;
  defaultRtl: boolean;
};

const languages: LanguageOption[] = [
  { code: 'tr', flag: 'TR', name: 'Türkçe', localName: 'TR', defaultRtl: false },
  { code: 'en', flag: 'EN', name: 'English', localName: 'EN', defaultRtl: false },
  { code: 'ar', flag: 'AR', name: 'العربية', localName: 'AR', defaultRtl: true },
  { code: 'ku', flag: 'KU', name: 'کوردی', localName: 'KU', defaultRtl: true },
];

export function LanguageSelectionModal({ onClose, rtlMode, setRtlMode }: LanguageSelectionModalProps) {
  const { language, setLanguage } = useLanguage();
  const { darkMode } = useTheme();
  const t = translations[language];

  const handleLanguageChange = (code: 'tr' | 'en' | 'ar' | 'ku', defaultRtl: boolean) => {
    setLanguage(code);
    setRtlMode(defaultRtl);
    localStorage.setItem('retailos_language', code);
    localStorage.setItem('retailos_rtl_mode', defaultRtl.toString());
    document.documentElement.dir = defaultRtl ? 'rtl' : 'ltr';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`rounded-lg sm:rounded-xl w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-2xl transition-all ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'
        } ${rtlMode ? 'rtl' : 'ltr'}`}>
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-between sticky top-0 z-10">
          <h3 className="text-base font-semibold flex items-center gap-2 text-white">
            <Globe className="w-4 h-4" />
            {t.languageSelectionTitle}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors text-white/90 hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Language Options */}
        <div className="p-3 space-y-2">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code, lang.defaultRtl)}
              className={`w-full px-3 py-2.5 rounded-lg transition-all flex items-center gap-3 hover:bg-gray-50 group border ${language === lang.code
                  ? 'bg-blue-50/50 border-blue-200'
                  : 'bg-white border-transparent hover:border-gray-200'
                }`}
            >
              {/* Language Code Badge or Flag */}
              <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center overflow-hidden border border-gray-200 shadow-sm">
                {lang.code === 'tr' ? (
                  <svg className="w-full h-full object-cover" viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg" aria-label="Türkiye bayrağı">
                    <rect width="3" height="2" fill="#E30A17" />
                    <circle cx="1.2" cy="1" r="0.5" fill="#FFFFFF" />
                    <circle cx="1.28" cy="1" r="0.4" fill="#E30A17" />
                    <path d="M1.55 0.7 L1.62 0.9 L1.83 0.9 L1.67 1.02 L1.74 1.22 L1.55 1.1 L1.36 1.22 L1.43 1.02 L1.27 0.9 L1.48 0.9 Z" fill="#FFFFFF" />
                  </svg>
                ) : lang.code === 'en' ? (
                  <svg className="w-full h-full object-cover" viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg" aria-label="United Kingdom bayrağı">
                    <clipPath id="uk-c"><path d="M0,0 v30 h60 v-30 z"/></clipPath>
                    <path d="M0,0 v30 h60 v-30 z" fill="#012169"/>
                    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6"/>
                    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" clipPath="url(#uk-c)"/>
                    <path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" strokeWidth="10"/>
                    <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6"/>
                  </svg>
                ) : lang.code === 'ar' ? (
                  <svg className="w-full h-full object-cover" viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg" aria-label="Irak bayrağı">
                    <rect width="3" height="0.667" y="0" fill="#CE1126" />
                    <rect width="3" height="0.667" y="0.667" fill="#FFFFFF" />
                    <rect width="3" height="0.666" y="1.334" fill="#000000" />
                    <text x="1.5" y="1.18" textAnchor="middle" fontFamily="'Amiri','Traditional Arabic',serif" fontSize="0.32" fontWeight="700" fill="#007A3D">الله أكبر</text>
                  </svg>
                ) : lang.code === 'ku' ? (
                  <svg className="w-full h-full" viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg" aria-label="Kürdistan bayrağı">
                    <rect width="3" height="0.67" y="0" fill="#E31837" />
                    <rect width="3" height="0.67" y="0.67" fill="#FFFFFF" />
                    <circle cx="1.5" cy="1" r="0.2" fill="#FCD116" />
                    <rect width="3" height="0.66" y="1.34" fill="#00A651" />
                  </svg>
                ) : (
                  <div className={`w-full h-full flex items-center justify-center text-xs font-bold ${language === lang.code ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}>
                    {lang.localName}
                  </div>
                )}
              </div>

              {/* Language Name */}
              <div className="flex-1 text-left">
                <div className={`font-medium text-sm transition-colors ${language === lang.code ? 'text-blue-700' : 'text-gray-700 group-hover:text-gray-900'
                  }`}>
                  {lang.name}
                </div>
                <div className="text-xs text-gray-400">
                  {lang.localName}
                </div>
              </div>

              {/* Check Mark */}
              {language === lang.code && (
                <Check className="w-4 h-4 text-blue-600" />
              )}
            </button>
          ))}
        </div>

        {/* Info Message */}
        <div className={`px-3 pb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          <div className={`p-2.5 rounded-md text-xs flex gap-2 ${darkMode ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700'
            }`}>
            <div className="shrink-0 mt-0.5">ℹ️</div>
            <div>{t.languageChangeInfo}</div>
          </div>
        </div>

        {/* RTL Toggle Section */}
        <div className={`px-3 pb-3 pt-2 border-t mt-1 ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}>
          <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t.textDirectionOptional}
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setRtlMode(false);
                localStorage.setItem('retailos_rtl_mode', 'false');
                document.documentElement.dir = 'ltr';
              }}
              className={`flex-1 py-1.5 px-3 rounded text-center border transition-all flex items-center justify-center gap-2 ${!rtlMode
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : darkMode ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
            >
              <div className="text-sm">→</div>
              <div className="text-xs font-medium">LTR</div>
            </button>
            <button
              onClick={() => {
                setRtlMode(true);
                localStorage.setItem('retailos_rtl_mode', 'true');
                document.documentElement.dir = 'rtl';
              }}
              className={`flex-1 py-1.5 px-3 rounded text-center border transition-all flex items-center justify-center gap-2 ${rtlMode
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : darkMode ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
            >
              <div className="text-sm">←</div>
              <div className="text-xs font-medium">RTL</div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-4 py-3 border-t ${darkMode ? 'border-gray-800 bg-gray-800/50' : 'border-gray-100 bg-gray-50/50'}`}>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium shadow-sm hover:shadow"
          >
            {t.close || 'Kapat'}
          </button>
        </div>
      </div>
    </div>
  );
}
