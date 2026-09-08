import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, Search, ShoppingCart, X, ImageIcon } from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';
import { qrPublicApi, type QrPublicMenuItem } from './qrPublicApi';

const CAT_EMOJI: Record<string, string> = {
  default: '🍽️',
  yemek: '🍲',
  ana: '🍖',
  çorba: '🥣',
  corba: '🥣',
  salata: '🥗',
  tatlı: '🍰',
  tatli: '🍰',
  içecek: '🥤',
  icecek: '🥤',
  kahve: '☕',
  pizza: '🍕',
  burger: '🍔',
  atış: '🍟',
  atis: '🍟',
};

function catEmoji(name: string) {
  const n = name.toLocaleLowerCase('tr');
  for (const [k, v] of Object.entries(CAT_EMOJI)) {
    if (k !== 'default' && n.includes(k)) return v;
  }
  return CAT_EMOJI.default;
}

/**
 * Qrmenusystemsaas QRMenuView düzeni:
 * X + sepet, arama, büyük kategori kartları, görsel ürün grid, alt floating sepet.
 */
export function QRMenuView() {
  const { tenantCode, cart, t, settings, basePath } = useQrCustomer();
  const navigate = useNavigate();
  const [items, setItems] = useState<QrPublicMenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const data = await qrPublicApi.getMenu(tenantCode);
        if (cancelled) return;
        setItems(data.items || []);
        const cats =
          data.categories?.length
            ? data.categories
            : Array.from(new Set((data.items || []).map((i) => i.category || 'Genel')));
        setCategories(cats);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantCode]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    let list = items.filter((i) => {
      if (cat !== 'all' && i.category !== cat) return false;
      if (!needle) return true;
      return (
        i.name.toLocaleLowerCase('tr').includes(needle) ||
        String(i.description || '')
          .toLocaleLowerCase('tr')
          .includes(needle)
      );
    });
    list = [...list].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
    return list;
  }, [items, cat, q]);

  const canOrder = settings?.ordering_enabled !== false;
  const title = cat === 'all' ? t('allStatus') : cat;

  if (busy) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500" />
          <p className="text-white text-lg">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">
      <div className="fixed top-4 left-4 z-50">
        <button
          type="button"
          onClick={() => navigate(basePath)}
          className="w-10 h-10 p-0 rounded-full bg-slate-800/80 backdrop-blur-md text-white hover:bg-slate-700 border border-slate-700/50 flex items-center justify-center"
          aria-label={t('home')}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {canOrder && (
        <div className="fixed top-4 right-4 z-50">
          <button
            type="button"
            onClick={() => navigate(`${basePath}/cart`)}
            className="relative gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg rounded-full h-10 px-4 inline-flex items-center text-slate-950 font-bold"
          >
            <ShoppingCart className="w-4 h-4" />
            {cart.count > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white px-2 min-w-[24px] h-6 rounded-full text-xs font-bold flex items-center justify-center border-2 border-slate-900 shadow-lg">
                {cart.count}
              </span>
            )}
          </button>
        </div>
      )}

      <div className="pt-20 px-4 pb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchProduct')}
            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-800/80 backdrop-blur-md border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {err && (
        <p className="mx-4 mb-2 text-sm text-rose-300 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2">
          {err}
        </p>
      )}

      <div className="py-4 px-4 bg-slate-900/50 overflow-x-auto">
        <div className="flex gap-2 min-w-min">
          <button
            type="button"
            onClick={() => setCat('all')}
            className={`w-[7.5rem] shrink-0 flex flex-col items-center gap-2 p-4 rounded-xl transition-all ${
              cat === 'all'
                ? 'bg-amber-500 shadow-lg shadow-amber-500/50'
                : 'bg-slate-800/80 hover:bg-slate-700'
            }`}
          >
            <div
              className={`w-20 h-20 rounded-lg flex items-center justify-center text-4xl ${
                cat === 'all' ? 'bg-white/20' : 'bg-slate-700'
              }`}
            >
              🍽️
            </div>
            <span className="text-[11px] font-semibold text-white text-center leading-tight min-h-[28px] flex items-center justify-center">
              {t('allStatus')}
            </span>
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`w-[7.5rem] shrink-0 flex flex-col items-center gap-2 p-4 rounded-xl transition-all ${
                cat === c
                  ? 'bg-amber-500 shadow-lg shadow-amber-500/50'
                  : 'bg-slate-800/80 hover:bg-slate-700'
              }`}
            >
              <div
                className={`w-20 h-20 rounded-lg flex items-center justify-center text-4xl ${
                  cat === c ? 'bg-white/20' : 'bg-slate-700'
                }`}
              >
                {catEmoji(c)}
              </div>
              <span className="text-[11px] font-semibold text-white text-center leading-tight min-h-[28px] flex items-center justify-center px-1 line-clamp-2">
                {c}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 pb-3">
        <h2 className="text-2xl font-bold text-white">{title}</h2>
      </div>

      <div className="px-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.map((item) => {
          const inCart = cart.items.find((c) => c.productId === item.id);
          return (
            <div
              key={item.id}
              className="group relative rounded-2xl overflow-hidden bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 hover:border-amber-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-amber-500/20"
            >
              <div className="relative h-48 overflow-hidden bg-slate-700">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    onError={(e) => {
                      e.currentTarget.src =
                        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                    <div className="text-center text-slate-500">
                      <ImageIcon className="w-16 h-16 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Resim Yok</p>
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex items-end justify-between">
                  <div className="flex-1 pr-2 min-w-0">
                    <h3 className="text-white font-bold text-lg line-clamp-1 mb-1">{item.name}</h3>
                    <div className="text-amber-400 font-bold text-xl tabular-nums">
                      {Number(item.price).toLocaleString('tr-TR')}
                    </div>
                  </div>
                  {canOrder &&
                    (inCart ? (
                      <div className="flex items-center gap-2 bg-slate-800/90 backdrop-blur-md rounded-full px-2 py-1.5 border border-slate-600">
                        <button
                          type="button"
                          onClick={() => cart.setQty(item.id, inCart.qty - 1)}
                          className="h-7 w-7 p-0 hover:bg-red-500/20 hover:text-red-400 text-white rounded-full flex items-center justify-center"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-bold text-white w-6 text-center">{inCart.qty}</span>
                        <button
                          type="button"
                          onClick={() => cart.setQty(item.id, inCart.qty + 1)}
                          className="h-7 w-7 p-0 bg-amber-500 hover:bg-amber-600 rounded-full flex items-center justify-center text-slate-950"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          cart.addItem({
                            productId: item.id,
                            name: item.name,
                            price: Number(item.price),
                          })
                        }
                        className="w-10 h-10 p-0 rounded-full bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/50 transition-all hover:scale-110 flex items-center justify-center text-slate-950"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="px-4 py-12 text-center space-y-3">
          <div className="text-6xl">🔍</div>
          <p className="text-lg font-medium text-white">{t('noResults')}</p>
        </div>
      )}

      {canOrder && cart.count > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-30">
          <button
            type="button"
            onClick={() => navigate(`${basePath}/cart`)}
            className="w-full text-left bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-2xl p-4 shadow-2xl shadow-amber-500/50 border border-amber-400/30"
          >
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-lg">
                    {cart.count} {t('items')}
                  </div>
                  <div className="text-sm opacity-90">{cart.total.toLocaleString('tr-TR')}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md rounded-full px-4 py-2">
                <span className="font-bold">{t('viewCart')}</span>
                <ShoppingCart className="w-5 h-5" />
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
