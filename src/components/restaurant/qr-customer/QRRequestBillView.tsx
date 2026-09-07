import React, { useCallback, useEffect, useState } from 'react';
import { Receipt, RefreshCw } from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';
import { qrPublicApi, type QrLiveBill } from './qrPublicApi';

function phaseLabel(t: (k: string) => string, phase?: string) {
  switch (phase) {
    case 'empty':
      return t('phaseEmpty');
    case 'received':
      return t('phaseReceived');
    case 'preparing':
      return t('phasePreparing');
    case 'served':
      return t('phaseServed');
    case 'billing':
      return t('phaseBilling');
    default:
      return t('phaseOpen');
  }
}

function itemStatusLabel(t: (k: string) => string, status?: string) {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'cooking') return t('statusCooking');
  if (s === 'ready') return t('statusReady');
  if (s === 'served') return t('statusServed');
  if (s === 'awaiting_ack') return t('statusAwaiting');
  return t('statusPending');
}

/** Hesap: canlı adisyon + hesap iste */
export function QRRequestBillView() {
  const { tenantCode, tableToken, t, settings } = useQrCustomer();
  const [bill, setBill] = useState<QrLiveBill | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const refresh = useCallback(async () => {
    if (!tableToken) {
      setBill(null);
      return;
    }
    try {
      const info = await qrPublicApi.getTable(tenantCode, tableToken);
      setBill(info.bill);
      setErr(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [tenantCode, tableToken]);

  useEffect(() => {
    void refresh();
    if (!tableToken) return;
    const id = window.setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [refresh, tableToken]);

  const requestBill = async () => {
    if (!tableToken) {
      setErr(t('noTable'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await qrPublicApi.createRequest(tenantCode, {
        tableToken,
        type: 'bill',
      });
      setDone(true);
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (settings?.request_bill_enabled === false) {
    return <p className="text-slate-500 text-center py-12">{t('error')}</p>;
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-amber-400">{t('yourBill')}</h2>
        {tableToken && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-amber-400"
            aria-label={t('refreshing')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {!tableToken && (
        <p className="text-sm text-slate-400 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
          {t('requestBillHint')}
        </p>
      )}

      {err && (
        <p className="text-sm text-rose-300 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2">
          {err}
        </p>
      )}

      {tableToken && bill && bill.items.length > 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500">
                {t('table')} {bill.tableNumber}
              </p>
              <p className="font-semibold text-slate-100">
                {phaseLabel(t, bill.guestPhase)}
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {bill.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-slate-200">
                    {i.qty}× {i.name}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                    {itemStatusLabel(t, i.status)}
                  </p>
                </div>
                <span className="text-slate-400 tabular-nums shrink-0">
                  {(i.subtotal ?? i.qty * i.price).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>

          {bill.discountAmount > 0 && (
            <div className="flex justify-between text-sm text-emerald-400">
              <span>{t('discount')}</span>
              <span className="tabular-nums">-{bill.discountAmount.toLocaleString()}</span>
            </div>
          )}

          <div className="flex justify-between pt-3 border-t border-slate-800 text-lg font-bold">
            <span className="text-slate-200">{t('total')}</span>
            <span className="text-amber-400 tabular-nums">
              {bill.totalAmount.toLocaleString()}
            </span>
          </div>
        </div>
      ) : tableToken ? (
        <p className="text-slate-500 text-center py-8">{t('noLiveOrder')}</p>
      ) : null}

      {done ? (
        <div className="text-center py-6 space-y-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
          <Receipt className="w-10 h-10 text-emerald-400 mx-auto" />
          <p className="font-semibold text-emerald-200">{t('billRequested')}</p>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy || !tableToken}
          onClick={() => void requestBill()}
          className="w-full py-3.5 rounded-2xl bg-amber-500 text-slate-950 font-bold disabled:opacity-40"
        >
          {busy ? t('loading') : t('requestBill')}
        </button>
      )}
    </div>
  );
}
