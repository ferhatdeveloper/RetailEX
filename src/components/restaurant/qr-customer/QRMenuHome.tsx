import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
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
  icon: React.ReactNode;
  flag?: boolean;
  badge?: number;
};

export function QRMenuHome() {
  const { basePath, settings, cart, t, error } = useQrCustomer();
  const navigate = useNavigate();

  const tiles: Tile[] = [
    {
      key: 'menu',
      labelKey: 'menu',
      path: 'menu',
      icon: <BookOpen className="w-7 h-7" />,
      flag: true,
    },
    {
      key: 'cart',
      labelKey: 'cart',
      path: 'cart',
      icon: <ShoppingCart className="w-7 h-7" />,
      flag: settings?.ordering_enabled !== false,
      badge: cart.count || undefined,
    },
    {
      key: 'orders',
      labelKey: 'orders',
      path: 'orders',
      icon: <ClipboardList className="w-7 h-7" />,
      flag: settings?.ordering_enabled !== false,
    },
    {
      key: 'waiter',
      labelKey: 'waiter',
      path: 'call-waiter',
      icon: <Bell className="w-7 h-7" />,
      flag: settings?.call_waiter_enabled !== false,
    },
    {
      key: 'bill',
      labelKey: 'bill',
      path: 'request-bill',
      icon: <Receipt className="w-7 h-7" />,
      flag: settings?.request_bill_enabled !== false,
    },
    {
      key: 'valet',
      labelKey: 'valet',
      path: 'valet',
      icon: <Car className="w-7 h-7" />,
      flag: !!settings?.valet_enabled,
    },
    {
      key: 'wifi',
      labelKey: 'wifi',
      path: 'wifi',
      icon: <Wifi className="w-7 h-7" />,
      flag: settings?.wifi_enabled !== false,
    },
    {
      key: 'feedback',
      labelKey: 'feedback',
      path: 'feedback',
      icon: <Star className="w-7 h-7" />,
      flag: settings?.feedback_enabled !== false,
    },
  ].filter((x) => x.flag !== false);

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}
      <div className="rounded-3xl overflow-hidden border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 p-6">
        <p className="text-amber-400/80 text-xs font-semibold tracking-widest uppercase mb-1">
          QR Menü
        </p>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {settings?.restaurant_name || 'Hoş geldiniz'}
        </h2>
        <p className="text-slate-400 text-sm mt-2">
          {t('menu')} · {t('cart')} · {t('waiter')}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => navigate(`${basePath}/${tile.path}`)}
            className="relative flex flex-col items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-left hover:border-amber-500/50 hover:bg-slate-900 transition-colors active:scale-[0.98]"
          >
            <span className="text-amber-400">{tile.icon}</span>
            <span className="font-semibold text-slate-100">{t(tile.labelKey)}</span>
            {tile.badge != null && tile.badge > 0 && (
              <span className="absolute top-3 right-3 min-w-[1.25rem] h-5 px-1 rounded-full bg-amber-500 text-slate-950 text-[11px] font-bold flex items-center justify-center">
                {tile.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
