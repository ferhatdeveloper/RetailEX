import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, Search, ShoppingCart } from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';
import { qrPublicApi, type QrPublicMenuItem } from './qrPublicApi';

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
    return items.filter((i) => {
      if (cat !== 'all' && i.category !== cat) return false;
      if (!needle) return true;
      return (
        i.name.toLocaleLowerCase('tr').includes(needle) ||
        String(i.description || '')
          .toLocaleLowerCase('tr')
          .includes(needle)
      );
    });
  }, [items, cat, q]);

  const canOrder = settings?.ordering_enabled !== false;

  return (
    <div className="space-y-4 pb-24 relative">
      {canOrder && (
        <button
          type="button"
          onClick={() => navigate(`${basePath}/cart`)}
          className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-3 text-sm font-bold text-slate-950 shadow-xl"
        >
          <ShoppingCart className="w-4 h-4" />
          {t('cart')}
          {cart.count > 0 && (
            <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] flex items-center justify-center">
              {cart.count}
            </span>
          )}
        </button>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('menu')}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 pl-10 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
        />
      </div>

      {err && (
        <p className="text-sm text-rose-300 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2">
          {err}
        </p>
      )}
      {busy ? (
        <p className="text-slate-400 animate-pulse text-center py-10">{t('loading')}</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            <Chip active={cat === 'all'} onClick={() => setCat('all')} label={t('menu')} />
            {categories.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)} label={c} />
            ))}
          </div>
          <ul className="space-y-3">
            {filtered.map((item) => {
              const inCart = cart.items.find((c) => c.productId === item.id);
              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-slate-700/50 bg-slate-900/60 overflow-hidden flex gap-0 shadow-sm"
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt=""
                      className="w-24 h-24 object-cover bg-slate-800 shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-gradient-to-br from-slate-800 to-slate-900 shrink-0 flex items-center justify-center text-slate-600 text-xs">
                      —
                    </div>
                  )}
                  <div className="flex-1 min-w-0 p-3 flex flex-col">
                    <p className="font-semibold text-slate-100 leading-snug">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                        {item.description}
                      </p>
                    )}
                    <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                      <p className="text-amber-400 font-bold tabular-nums">
                        {Number(item.price).toLocaleString()}
                      </p>
                      {canOrder &&
                        (inCart ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="p-1.5 rounded-lg bg-slate-800 text-amber-400"
                              onClick={() => cart.setQty(item.id, inCart.qty - 1)}
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-6 text-center text-sm font-bold">{inCart.qty}</span>
                            <button
                              type="button"
                              className="p-1.5 rounded-lg bg-amber-500 text-slate-950"
                              onClick={() => cart.setQty(item.id, inCart.qty + 1)}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 text-xs font-bold"
                            onClick={() =>
                              cart.addItem({
                                productId: item.id,
                                name: item.name,
                                price: Number(item.price),
                              })
                            }
                          >
                            {t('add')}
                          </button>
                        ))}
                    </div>
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-slate-500 py-8 text-sm">{t('emptyCart')}</p>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'shrink-0 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 text-xs font-bold shadow'
          : 'shrink-0 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 text-xs font-medium'
      }
    >
      {label}
    </button>
  );
}
