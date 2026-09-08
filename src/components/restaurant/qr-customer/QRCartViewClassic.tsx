import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useQrCustomer, pushLocalOrder } from './QRCustomerLayout';
import { qrPublicApi } from './qrPublicApi';

export function QRCartViewClassic() {
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
      setTimeout(() => navigate(`${basePath}/orders`), 800);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <h2 className="text-xl font-bold text-amber-400">{t('cart')}</h2>
      {!tableToken && (
        <p className="text-sm text-slate-400 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
          {t('noTable')}
        </p>
      )}
      {cart.items.length === 0 ? (
        <p className="text-slate-500 py-8 text-center">{t('emptyCart')}</p>
      ) : (
        <ul className="space-y-2">
          {cart.items.map((item) => (
            <li
              key={item.productId}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {item.qty} × {Number(item.price).toLocaleString()}
                </p>
              </div>
              <p className="font-bold text-amber-400 shrink-0">
                {(item.qty * item.price).toLocaleString()}
              </p>
              <button
                type="button"
                className="p-2 text-slate-500 hover:text-rose-400"
                onClick={() => cart.removeItem(item.productId)}
                aria-label="remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {cart.items.length > 0 && (
        <>
          <label className="block text-xs text-slate-400">
            {t('note')}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <div className="flex items-center justify-between text-lg font-bold">
            <span>{t('total')}</span>
            <span className="text-amber-400">{cart.total.toLocaleString()}</span>
          </div>
          {msg && <p className="text-emerald-400 text-sm">{msg}</p>}
          {err && <p className="text-rose-400 text-sm">{err}</p>}
          <button
            type="button"
            disabled={!canOrder || busy}
            onClick={() => void submit()}
            className="w-full py-3 rounded-2xl bg-amber-500 text-slate-950 font-bold disabled:opacity-40 active:scale-[0.99]"
          >
            {busy ? t('loading') : t('sendOrder')}
          </button>
        </>
      )}
    </div>
  );
}
