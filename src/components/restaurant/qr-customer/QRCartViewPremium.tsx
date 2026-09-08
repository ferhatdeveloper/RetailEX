import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2, X, Send } from 'lucide-react';
import { useQrCustomer, pushLocalOrder } from './QRCustomerLayout';
import { qrPublicApi } from './qrPublicApi';
import { QrProductThumb } from './QrProductThumb';

export function QRCartViewPremium() {
  const { tenantCode, tableToken, cart, t, basePath, settings } = useQrCustomer();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canOrder = settings?.ordering_enabled !== false && !!tableToken;

  const submit = async () => {
    if (!tableToken || cart.items.length === 0) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await qrPublicApi.placeOrder(tenantCode, {
        tableToken,
        items: cart.items,
        note: note.trim() || undefined,
      });
      pushLocalOrder(tenantCode, tableToken, {
        items: cart.items,
        orderId: res.orderId || undefined,
      });
      cart.clear();
      setMsg(res.pendingApproval ? t('orderPendingApproval') : t('orderSent'));
      setTimeout(() => navigate(`${basePath}/orders`), 900);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="relative min-h-[100dvh] min-h-[100svh] pb-8"
      style={{ background: 'var(--qr-bg)' }}
    >
      <div className="mx-auto max-w-lg px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`${basePath}/menu`)}
            className="rex-qr-press flex h-11 w-11 items-center justify-center rounded-full"
            style={{
              background: 'var(--qr-bg-elevated)',
              border: '1px solid var(--qr-line)',
            }}
            aria-label={t('back')}
          >
            <X className="h-5 w-5" />
          </button>
          <div>
            <h1 className="rex-qr-display text-2xl font-semibold">{t('cart')}</h1>
            <p className="text-xs" style={{ color: 'var(--qr-muted)' }}>
              {cart.count} {t('items')}
            </p>
          </div>
        </div>

        {!tableToken && (
          <p
            className="mb-4 rounded-2xl px-4 py-3 text-sm"
            style={{
              background: 'rgba(212,165,116,0.1)',
              border: '1px solid var(--qr-line)',
              color: 'var(--qr-gold-bright)',
            }}
          >
            {t('noTable')}
          </p>
        )}

        {cart.items.length === 0 ? (
          <div className="py-20 text-center">
            <p className="rex-qr-display text-xl">{t('emptyCart')}</p>
            <button
              type="button"
              onClick={() => navigate(`${basePath}/menu`)}
              className="rex-qr-press mt-6 rounded-full px-6 py-3 text-sm font-bold"
              style={{ background: 'var(--qr-gold)', color: '#1a120c' }}
            >
              {t('viewMenu')}
            </button>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {cart.items.map((item) => (
                <li
                  key={item.productId}
                  className="flex items-center gap-2.5 rounded-2xl p-2.5"
                  style={{
                    background: 'var(--qr-bg-elevated)',
                    border: '1px solid var(--qr-line)',
                  }}
                >
                  <QrProductThumb src={item.image} label={t('noImage')} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums" style={{ color: 'var(--qr-muted)' }}>
                      {item.qty} × {Number(item.price).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <p
                    className="rex-qr-display shrink-0 text-sm font-semibold tabular-nums"
                    style={{ color: 'var(--qr-gold-bright)' }}
                  >
                    {(item.qty * item.price).toLocaleString('tr-TR')}
                  </p>
                  <div
                    className="flex items-center gap-0.5 rounded-full p-0.5"
                    style={{ background: 'var(--qr-bg)', border: '1px solid var(--qr-line)' }}
                  >
                    <button
                      type="button"
                      className="rex-qr-press flex h-8 w-8 items-center justify-center rounded-full"
                      onClick={() => cart.setQty(item.productId, item.qty - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rex-qr-press flex h-8 w-8 items-center justify-center rounded-full"
                      onClick={() => cart.setQty(item.productId, item.qty + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="rex-qr-press p-2"
                    style={{ color: 'var(--qr-danger)' }}
                    onClick={() => cart.removeItem(item.productId)}
                    aria-label="remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>

            <label
              className="mt-5 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--qr-muted)' }}
            >
              {t('note')}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-2 w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none"
                style={{
                  background: 'var(--qr-bg-elevated)',
                  border: '1px solid var(--qr-line)',
                  color: 'var(--qr-text)',
                }}
              />
            </label>

            <div
              className="mt-5 flex items-center justify-between rounded-2xl px-4 py-4"
              style={{
                background: 'var(--qr-bg-elevated)',
                border: '1px solid var(--qr-line)',
              }}
            >
              <span className="text-sm font-medium" style={{ color: 'var(--qr-muted)' }}>
                {t('total')}
              </span>
              <span
                className="rex-qr-display text-2xl font-semibold tabular-nums"
                style={{ color: 'var(--qr-gold-bright)' }}
              >
                {cart.total.toLocaleString('tr-TR')}
              </span>
            </div>

            {msg && (
              <p className="mt-3 text-sm" style={{ color: 'var(--qr-ok)' }}>
                {msg}
              </p>
            )}
            {err && (
              <p className="mt-3 text-sm" style={{ color: 'var(--qr-danger)' }}>
                {err}
              </p>
            )}

            <button
              type="button"
              disabled={!canOrder || busy}
              onClick={() => void submit()}
              className="rex-qr-press mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, var(--qr-gold) 0%, var(--qr-copper) 100%)',
                color: '#1a120c',
              }}
            >
              <Send className="h-4 w-4" />
              {busy ? t('loading') : t('sendOrder')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
