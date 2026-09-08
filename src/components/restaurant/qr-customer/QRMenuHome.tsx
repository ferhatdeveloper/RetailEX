import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UtensilsCrossed,
  ShoppingCart,
  ClipboardList,
  Bell,
  Receipt,
  Car,
  Wifi,
  Star,
} from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';

type Tile = {
  key: string;
  labelKey: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  flag?: boolean;
  badge?: number;
};

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80';

export function QRMenuHome() {
  const { basePath, settings, cart, t, error, tableNumber } = useQrCustomer();
  const navigate = useNavigate();

  const cover = settings?.cover_image_url?.trim() || DEFAULT_COVER;
  const logo = settings?.logo_url?.trim() || null;
  const name = settings?.restaurant_name?.trim() || 'QR Menü';

  const tiles: Tile[] = [
    {
      key: 'menu',
      labelKey: 'menu',
      path: 'menu',
      icon: UtensilsCrossed,
      color: 'bg-orange-500',
      flag: true,
    },
    {
      key: 'cart',
      labelKey: 'cart',
      path: 'cart',
      icon: ShoppingCart,
      color: 'bg-amber-500',
      flag: settings?.ordering_enabled !== false,
      badge: cart.count || undefined,
    },
    {
      key: 'orders',
      labelKey: 'orders',
      path: 'orders',
      icon: ClipboardList,
      color: 'bg-blue-500',
      flag: settings?.ordering_enabled !== false,
    },
    {
      key: 'waiter',
      labelKey: 'waiter',
      path: 'call-waiter',
      icon: Bell,
      color: 'bg-emerald-500',
      flag: settings?.call_waiter_enabled !== false,
    },
    {
      key: 'bill',
      labelKey: 'bill',
      path: 'request-bill',
      icon: Receipt,
      color: 'bg-rose-500',
      flag: settings?.request_bill_enabled !== false,
    },
    {
      key: 'valet',
      labelKey: 'valet',
      path: 'valet',
      icon: Car,
      color: 'bg-violet-600',
      flag: !!settings?.valet_enabled,
    },
    {
      key: 'wifi',
      labelKey: 'wifi',
      path: 'wifi',
      icon: Wifi,
      color: 'bg-cyan-500',
      flag: settings?.wifi_enabled !== false,
    },
    {
      key: 'feedback',
      labelKey: 'feedback',
      path: 'feedback',
      icon: Star,
      color: 'bg-yellow-500',
      flag: settings?.feedback_enabled !== false,
    },
  ].filter((x) => x.flag !== false);

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-slate-950">
      <div className="absolute inset-0">
        <img src={cover} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
      </div>

      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8 text-center">
          {logo ? (
            <img
              src={logo}
              alt=""
              className="mb-4 h-20 w-20 rounded-full object-cover border-2 border-white/40 shadow-xl"
            />
          ) : (
            <div
              className="mb-4 flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white shadow-xl border border-white/20"
              style={{
                background: `linear-gradient(135deg, ${settings?.primary_color || '#f59e0b'}, #ea580c)`,
              }}
            >
              {name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/90 mb-2">
            QR Menü
          </p>
          <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-lg">{name}</h1>
          {tableNumber && (
            <p className="mt-2 text-sm text-white/80">
              {t('table')} {tableNumber}
            </p>
          )}
          {error && (
            <p className="mt-4 max-w-sm rounded-xl border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-xs text-amber-100">
              {error}
            </p>
          )}
        </div>

        <div className="relative z-20 bg-slate-950/70 backdrop-blur-md border-t border-white/10">
          <div className="mx-auto max-w-lg px-3 py-4">
            <div className="grid grid-cols-4 gap-2">
              {tiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <button
                    key={tile.key}
                    type="button"
                    onClick={() => navigate(`${basePath}/${tile.path}`)}
                    className="relative flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-2.5 hover:bg-white/10 active:scale-[0.97] transition"
                  >
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-full ${tile.color} shadow-md`}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </span>
                    <span className="text-[10px] font-medium text-white text-center leading-tight">
                      {t(tile.labelKey)}
                    </span>
                    {tile.badge != null && tile.badge > 0 && (
                      <span className="absolute top-1 right-1 min-w-[1.1rem] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">
                        {tile.badge > 9 ? '9+' : tile.badge}
                      </span>
                    )}
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
