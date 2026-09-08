import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, Search, ShoppingBag, X } from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';
import { qrPublicApi, type QrPublicMenuItem } from './qrPublicApi';
import { QrProductThumb } from './QrProductThumb';

/** Premium menü — kompakt satır, küçük görsel, resim yok placeholder */
export function QRMenuViewPremium() {
  const { tenantCode, cart, t, settings, basePath } = useQrCustomer();
  const navigate = useNavigate();
  const [items, setItems] = useState<QrPublicMenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

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
    return items
      .filter((i) => {
        if (cat !== 'all' && i.category !== cat) return false;
        if (!needle) return true;
        return (
          i.name.toLocaleLowerCase('tr').includes(needle) ||
          String(i.description || '')
            .toLocaleLowerCase('tr')
            .includes(needle)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [items, cat, q]);

  const canOrder = settings?.ordering_enabled !== false;
  const title = cat === 'all' ? t('allStatus') : cat;

  return (
    <div
      className="relative min-h-[100dvh] min-h-[100svh] pb-28"
      style={{ background: 'var(--qr-bg)' }}
    >
      <div
        className="sticky top-0 z-40 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3"
        style={{
          background: 'linear-gradient(180deg, var(--qr-bg) 70%, transparent)',
        }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(basePath)}
            className="rex-qr-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{
              background: 'var(--qr-bg-elevated)',
              border: '1px solid var(--qr-line)',
            }}
            aria-label={t('home')}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: 'var(--qr-muted)' }}
            />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('searchProduct')}
              className="w-full rounded-full py-3 pl-10 pr-4 text-sm outline-none"
              style={{
                background: 'var(--qr-bg-elevated)',
                border: '1px solid var(--qr-line)',
                color: 'var(--qr-text)',
              }}
            />
          </div>
          {canOrder && (
            <button
              type="button"
              onClick={() => navigate(`${basePath}/cart`)}
              className="rex-qr-press relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{
                background: 'var(--qr-gold)',
                color: '#1a120c',
              }}
              aria-label={t('cart')}
            >
              <ShoppingBag className="h-5 w-5" />
              {cart.count > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                  style={{ background: 'var(--qr-danger)', color: '#fff' }}
                >
                  {cart.count > 9 ? '9+' : cart.count}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {busy ? (
        <div className="flex justify-center py-24">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--qr-gold)', borderTopColor: 'transparent' }}
          />
        </div>
      ) : (
        <>
          {err && (
            <p
              className="mx-4 mb-3 rounded-xl px-3 py-2 text-sm"
              style={{
                background: 'rgba(224,122,106,0.12)',
                color: '#f0c4bc',
                border: '1px solid rgba(224,122,106,0.3)',
              }}
            >
              {err}
            </p>
          )}

          <div className="px-4 pb-2">
            <div className="rex-qr-scroll-x mx-auto max-w-lg">
              <CatChip active={cat === 'all'} label={t('allStatus')} onClick={() => setCat('all')} />
              {categories.map((c) => (
                <CatChip key={c} active={cat === c} label={c} onClick={() => setCat(c)} />
              ))}
            </div>
          </div>

          <div className="mx-auto max-w-lg px-4 pt-3 pb-2">
            <h2 className="rex-qr-display text-2xl font-semibold" style={{ color: 'var(--qr-text)' }}>
              {title}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--qr-muted)' }}>
              {filtered.length} {t('items')}
            </p>
          </div>

          <ul className="mx-auto max-w-lg space-y-2.5 px-4">
            {filtered.map((item, idx) => {
              const inCart = cart.items.find((c) => c.productId === item.id);
              return (
                <li
                  key={item.id}
                  className="rex-qr-rise flex items-center gap-3 rounded-2xl p-2.5"
                  style={{
                    background: 'var(--qr-bg-elevated)',
                    border: '1px solid var(--qr-line)',
                    animationDelay: `${Math.min(idx, 8) * 0.04}s`,
                  }}
                >
                  <QrProductThumb src={item.image} label={t('noImage')} size={56} />
                  <div className="flex min-w-0 flex-1 flex-col py-0.5">
                    <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug">{item.name}</h3>
                    {item.description ? (
                      <p
                        className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed"
                        style={{ color: 'var(--qr-muted)' }}
                      >
                        {item.description}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span
                        className="rex-qr-display text-base font-semibold tabular-nums"
                        style={{ color: 'var(--qr-gold-bright)' }}
                      >
                        {Number(item.price).toLocaleString('tr-TR')}
                      </span>
                      {canOrder &&
                        (inCart ? (
                          <div
                            className="flex items-center gap-1 rounded-full px-1 py-0.5"
                            style={{
                              background: 'var(--qr-bg)',
                              border: '1px solid var(--qr-line)',
                            }}
                          >
                            <button
                              type="button"
                              className="rex-qr-press flex h-7 w-7 items-center justify-center rounded-full"
                              style={{ color: 'var(--qr-text)' }}
                              onClick={() => cart.setQty(item.id, inCart.qty - 1)}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-5 text-center text-sm font-bold">{inCart.qty}</span>
                            <button
                              type="button"
                              className="rex-qr-press flex h-7 w-7 items-center justify-center rounded-full"
                              style={{ background: 'var(--qr-gold)', color: '#1a120c' }}
                              onClick={() => cart.setQty(item.id, inCart.qty + 1)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="rex-qr-press flex h-8 w-8 items-center justify-center rounded-full"
                            style={{ background: 'var(--qr-gold)', color: '#1a120c' }}
                            onClick={() =>
                              cart.addItem({
                                productId: item.id,
                                name: item.name,
                                price: Number(item.price),
                                image: item.image,
                              })
                            }
                            aria-label={t('add')}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {filtered.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="rex-qr-display text-xl" style={{ color: 'var(--qr-text)' }}>
                {t('noResults')}
              </p>
            </div>
          )}
        </>
      )}

      {canOrder && cart.count > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            onClick={() => navigate(`${basePath}/cart`)}
            className="rex-qr-press mx-auto flex w-full max-w-lg items-center justify-between rounded-2xl px-5 py-4 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, var(--qr-gold) 0%, var(--qr-copper) 100%)',
              color: '#1a120c',
            }}
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/15">
                <ShoppingBag className="h-5 w-5" />
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold">
                  {cart.count} {t('items')}
                </span>
                <span className="block text-[11px] font-medium opacity-80">{t('viewCart')}</span>
              </span>
            </span>
            <span className="rex-qr-display text-lg font-semibold tabular-nums">
              {cart.total.toLocaleString('tr-TR')}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function CatChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rex-qr-press shrink-0 rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap"
      style={
        active
          ? { background: 'var(--qr-gold)', color: '#1a120c' }
          : {
              background: 'var(--qr-bg-elevated)',
              color: 'var(--qr-muted)',
              border: '1px solid var(--qr-line)',
            }
      }
    >
      {label}
    </button>
  );
}
