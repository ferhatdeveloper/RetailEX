import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UtensilsCrossed,
  ClipboardList,
  Bell,
  Receipt,
  Car,
  Wifi,
  Star,
  ChevronRight,
} from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';

const HERO_POSTER =
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1600&q=80';

/** Varsayılan kapak videosu (ayar boşsa) */
const DEFAULT_VIDEO =
  'https://filesamples.com/samples/video/mp4/sample_1920x1080.mp4';

const LANGS = [
  { code: 'tr' as const, label: 'TR' },
  { code: 'en' as const, label: 'EN' },
  { code: 'ar' as const, label: 'AR' },
  { code: 'ku' as const, label: 'KU' },
];

function isVideoUrl(url: string) {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
}

/** Premium QR ana sayfa — tam ekran video/görsel + alt dock */
export function QRMenuHomePremium() {
  const { basePath, settings, t, lang, setLang, error, tableNumber } = useQrCustomer();
  const navigate = useNavigate();
  const [langOpen, setLangOpen] = useState(false);
  const [videoOk, setVideoOk] = useState(true);

  const coverRaw = settings?.cover_image_url?.trim() || '';
  const cover = coverRaw || DEFAULT_VIDEO;
  const useVideo = (!coverRaw || isVideoUrl(cover)) && videoOk;
  const logo = settings?.logo_url?.trim() || null;
  const name = settings?.restaurant_name?.trim() || 'RetailEX';

  useEffect(() => {
    setVideoOk(true);
  }, [cover]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-qr-lang]')) setLangOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const services = [
    {
      path: 'orders',
      label: t('orders'),
      icon: ClipboardList,
      show: settings?.ordering_enabled !== false,
    },
    {
      path: 'call-waiter',
      label: t('waiter'),
      icon: Bell,
      show: settings?.call_waiter_enabled !== false,
    },
    {
      path: 'request-bill',
      label: t('bill'),
      icon: Receipt,
      show: settings?.request_bill_enabled !== false,
    },
    {
      path: 'wifi',
      label: t('wifi'),
      icon: Wifi,
      show: settings?.wifi_enabled !== false,
    },
    {
      path: 'valet',
      label: t('valet'),
      icon: Car,
      show: !!settings?.valet_enabled,
    },
    {
      path: 'feedback',
      label: t('feedback'),
      icon: Star,
      show: settings?.feedback_enabled !== false,
    },
  ].filter((s) => s.show);

  return (
    <div
      className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden"
      style={{ background: '#0c0b0a' }}
    >
      {/* Tam ekran medya — boş alt şerit yok */}
      <div className="absolute inset-0 z-0">
        {useVideo ? (
          <video
            key={cover}
            src={cover}
            poster={HERO_POSTER}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover rex-qr-fade"
            onError={() => setVideoOk(false)}
          />
        ) : (
          <img
            src={coverRaw && !isVideoUrl(coverRaw) ? coverRaw : HERO_POSTER}
            alt=""
            className="h-full w-full object-cover rex-qr-fade"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(12,11,10,0.45) 0%, rgba(12,11,10,0.25) 28%, rgba(12,11,10,0.55) 58%, rgba(12,11,10,0.88) 100%)',
          }}
        />
        <div className="rex-qr-grain" />
      </div>

      {/* Üst bar */}
      <div className="relative z-20 flex shrink-0 items-start justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        {tableNumber ? (
          <span
            className="rex-qr-rise inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{
              background: 'rgba(12,11,10,0.55)',
              border: '1px solid var(--qr-line)',
              color: 'var(--qr-gold-bright)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {t('table')} {tableNumber}
          </span>
        ) : (
          <span />
        )}

        <div className="relative" data-qr-lang>
          <button
            type="button"
            onClick={() => setLangOpen((v) => !v)}
            className="rex-qr-press rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wider"
            style={{
              background: 'rgba(12,11,10,0.55)',
              border: '1px solid var(--qr-line)',
              color: 'var(--qr-text)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {lang.toUpperCase()}
          </button>
          {langOpen && (
            <div
              className="absolute right-0 mt-2 min-w-[4.5rem] overflow-hidden rounded-2xl shadow-2xl"
              style={{
                background: 'var(--qr-bg-elevated)',
                border: '1px solid var(--qr-line)',
              }}
            >
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    setLang(l.code);
                    setLangOpen(false);
                  }}
                  className="block w-full px-4 py-2.5 text-left text-xs font-semibold"
                  style={{
                    color: lang === l.code ? 'var(--qr-gold)' : 'var(--qr-text)',
                    background: lang === l.code ? 'rgba(212,165,116,0.12)' : 'transparent',
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Marka — medya üzerinde ortalanmış */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        {logo ? (
          <img
            src={logo}
            alt=""
            className="rex-qr-rise mb-5 h-16 w-16 rounded-2xl object-cover shadow-xl"
            style={{ border: '1px solid var(--qr-line)' }}
          />
        ) : null}
        <p
          className="rex-qr-rise rex-qr-rise-delay-1 mb-2 text-[11px] font-semibold uppercase tracking-[0.28em]"
          style={{ color: 'var(--qr-gold)' }}
        >
          QR Menü
        </p>
        <h1
          className="rex-qr-display rex-qr-rise rex-qr-rise-delay-2 max-w-[16ch] text-[2.65rem] font-semibold leading-[1.05] sm:text-5xl"
          style={{ color: 'var(--qr-text)', textShadow: '0 2px 24px rgba(0,0,0,0.45)' }}
        >
          {name}
        </h1>
        <p
          className="rex-qr-rise rex-qr-rise-delay-3 mt-3 max-w-xs text-sm leading-relaxed"
          style={{ color: 'rgba(247,241,232,0.82)' }}
        >
          {t('homeTagline')}
        </p>
        {error && (
          <p
            className="mt-4 max-w-sm rounded-xl px-3 py-2 text-xs"
            style={{
              background: 'rgba(224,122,106,0.15)',
              border: '1px solid rgba(224,122,106,0.35)',
              color: '#f0c4bc',
            }}
          >
            {error}
          </p>
        )}
      </div>

      {/* Alt dock — medyanın üstünde, boşluk bırakmadan */}
      <div
        className="relative z-20 shrink-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(12,11,10,0.55) 35%, rgba(12,11,10,0.78) 100%)',
          backdropFilter: 'blur(2px)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate(`${basePath}/menu`)}
          className="rex-qr-press rex-qr-rise mx-auto mb-3 flex w-full max-w-lg items-center justify-between rounded-2xl px-5 py-4 shadow-lg"
          style={{
            background: 'linear-gradient(135deg, var(--qr-gold) 0%, var(--qr-copper) 100%)',
            color: '#1a120c',
          }}
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/15">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <span className="text-left">
              <span className="block text-base font-bold leading-tight">{t('viewMenu')}</span>
              <span className="block text-[11px] font-medium opacity-80">{t('menu')}</span>
            </span>
          </span>
          <ChevronRight className="h-5 w-5 opacity-70" />
        </button>

        <div className="mx-auto grid max-w-lg grid-cols-3 gap-2">
          {services.map((s, i) => {
            const Icon = s.icon;
            return (
              <button
                key={s.path}
                type="button"
                onClick={() => navigate(`${basePath}/${s.path}`)}
                className="rex-qr-press rex-qr-rise flex flex-col items-center gap-2 rounded-2xl px-2 py-3.5 transition-colors"
                style={{
                  background: 'rgba(22,20,18,0.72)',
                  border: '1px solid var(--qr-line)',
                  backdropFilter: 'blur(12px)',
                  animationDelay: `${0.2 + i * 0.04}s`,
                }}
              >
                <Icon className="h-5 w-5" style={{ color: 'var(--qr-gold)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'rgba(247,241,232,0.85)' }}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
