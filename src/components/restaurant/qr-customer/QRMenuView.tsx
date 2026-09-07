import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';
import { qrPublicApi, type QrPublicMenuItem } from './qrPublicApi';

export function QRMenuView() {
  const { tenantCode, cart, t, settings } = useQrCustomer();
  const [items, setItems] = useState<QrPublicMenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cat, setCat] = useState<string>('all');
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

  const filtered = useMemo(
    () => (cat === 'all' ? items : items.filter((i) => i.category === cat)),
    [items, cat]
  );

  const canOrder = settings?.ordering_enabled !== false;

  return (
    <div className="space-y-4 pb-8">
      <h2 className="text-xl font-bold text-amber-400">{t('menu')}</h2>
      {err && (
        <p className="text-sm text-rose-300 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2">
          {err}
        </p>
      )}
      {busy ? (
        <p className="text-slate-400 animate-pulse">{t('loading')}</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <Chip active={cat === 'all'} onClick={() => setCat('all')} label="All" />
            {categories.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)} label={c} />
            ))}
          </div>
          <ul className="space-y-2">
            {filtered.map((item) => {
              const inCart = cart.items.find((c) => c.productId === item.id);
              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 flex gap-3"
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt=""
                      className="w-16 h-16 rounded-xl object-cover bg-slate-800 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-slate-800 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-100 truncate">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                        {item.description}
                      </p>
                    )}
                    <p className="text-amber-400 font-bold mt-1">
                      {Number(item.price).toLocaleString()}
                    </p>
                  </div>
                  {canOrder && (
                    <div className="flex flex-col items-center justify-center gap-1 shrink-0">
                      {inCart ? (
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
                          className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
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
                      )}
                    </div>
                  )}
                </li>
              );
            })}
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
          ? 'shrink-0 px-3 py-1.5 rounded-full bg-amber-500 text-slate-950 text-xs font-bold'
          : 'shrink-0 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 text-xs font-medium'
      }
    >
      {label}
    </button>
  );
}
