import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UtensilsCrossed,
  ShoppingCart,
  Bell,
  Receipt,
  Car,
  Wifi,
  Star,
} from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80';
const DEFAULT_VIDEO =
  'https://r2.mynu.site/images/676ab181fc92f8671caef847/items/108044672.mp4';

const LANGS = [
  { code: 'tr' as const, name: 'Türkçe', flag: '🇹🇷' },
  { code: 'en' as const, name: 'English', flag: '🇬🇧' },
  { code: 'ar' as const, name: 'العربية', flag: '🇸🇦' },
  { code: 'ku' as const, name: 'کوردی', flag: '🇮🇶' },
];

/**
 * Qrmenusystemsaas QRMenuHome ile aynı düzen:
 * tam ekran medya + sağ üst dil + altta 4 kolon renkli aksiyon grid.
 */
export function QRMenuHomeClassic() {
  const { basePath, settings, t, lang, setLang, error } = useQrCustomer();
  const navigate = useNavigate();
  const [langOpen, setLangOpen] = useState(false);
  const [videoOk, setVideoOk] = useState(true);

  const cover = settings?.cover_image_url?.trim() || '';
  const isVideo = cover ? /\.(mp4|webm|ogg)(\?|$)/i.test(cover) : true;
  const phone = (settings as { phone?: string | null })?.phone?.trim() || '';

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('.language-selector') && langOpen) setLangOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [langOpen]);

  const actions = [
    {
      path: 'menu',
      label: t('viewMenu'),
      icon: UtensilsCrossed,
      color: 'bg-orange-500',
      show: true,
    },
    {
      path: 'orders',
      label: t('myOrders'),
      icon: ShoppingCart,
      color: 'bg-blue-500',
      show: settings?.ordering_enabled !== false,
    },
    {
      path: 'call-waiter',
      label: t('callWaiter'),
      icon: Bell,
      color: 'bg-green-500',
      show: settings?.call_waiter_enabled !== false,
    },
    {
      path: 'request-bill',
      label: t('requestBill'),
      icon: Receipt,
      color: 'bg-red-500',
      show: settings?.request_bill_enabled !== false,
    },
    {
      path: 'valet',
      label: t('valetService'),
      icon: Car,
      color: 'bg-purple-600',
      show: !!settings?.valet_enabled,
    },
    {
      path: 'wifi',
      label: t('wifiInfo'),
      icon: Wifi,
      color: 'bg-cyan-500',
      show: settings?.wifi_enabled !== false,
    },
    {
      path: 'feedback',
      label: t('feedback'),
      icon: Star,
      color: 'bg-yellow-500',
      show: settings?.feedback_enabled !== false,
    },
  ].filter((a) => a.show);

  const currentLang = LANGS.find((l) => l.code === lang) || LANGS[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90">
      <div className="relative h-screen w-full overflow-hidden">
        <div className="absolute top-4 right-4 z-30 flex items-center gap-3">
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-2 bg-slate-800/50 backdrop-blur-md border border-slate-700/40 rounded-full px-4 py-2.5 text-white hover:bg-slate-700/60 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
              <span className="font-medium text-sm">{phone}</span>
            </a>
          ) : null}

          <div className="relative language-selector">
            <button
              type="button"
              className="flex items-center gap-2 bg-slate-800/50 backdrop-blur-md border border-slate-700/40 rounded-full px-4 py-2.5 text-white hover:bg-slate-700/60 transition-all"
              onClick={() => setLangOpen((o) => !o)}
            >
              <span className="text-lg">{currentLang.flag}</span>
              <span className="font-medium text-sm">{currentLang.name}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div
              className={`absolute top-full right-0 mt-2 bg-slate-800/80 backdrop-blur-md border border-slate-700/40 rounded-2xl overflow-hidden shadow-2xl transition-all duration-200 min-w-[180px] ${
                langOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
              }`}
            >
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    setLang(l.code);
                    setLangOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-slate-700/60 transition-all ${
                    lang === l.code ? 'bg-amber-500/20' : ''
                  }`}
                >
                  <span className="text-xl">{l.flag}</span>
                  <span className="font-medium text-sm">{l.name}</span>
                  {lang === l.code && (
                    <svg className="w-4 h-4 ml-auto text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative h-screen w-full">
          {isVideo && videoOk ? (
            <video
              src={cover || DEFAULT_VIDEO}
              poster={DEFAULT_COVER}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setVideoOk(false)}
            />
          ) : (
            <img
              src={cover && !isVideo ? cover : DEFAULT_COVER}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        </div>

        {error && (
          <div className="absolute top-20 left-4 right-4 z-30 rounded-xl border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-xs text-amber-100 text-center">
            {error}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 z-20 bg-slate-900/60 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 py-5">
            <div className="grid grid-cols-4 gap-3">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.path}
                    type="button"
                    onClick={() => navigate(`${basePath}/${action.path}`)}
                    className="w-full flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-700/20 hover:border-slate-600/50 bg-slate-800/30 hover:bg-slate-800/50 transition-all group"
                  >
                    <div
                      className={`w-11 h-11 rounded-full ${action.color} flex items-center justify-center shadow-md group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xs font-medium text-white text-center leading-tight">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
