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
    return (
      <p className="py-12 text-center" style={{ color: 'var(--qr-muted)' }}>
        {t('error')}
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between gap-2">
        <h2 className="rex-qr-display text-2xl font-semibold" style={{ color: 'var(--qr-gold-bright)' }}>
          {t('yourBill')}
        </h2>
        {tableToken && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="rex-qr-press rounded-xl p-2"
            style={{ border: '1px solid var(--qr-line)', color: 'var(--qr-muted)' }}
            aria-label={t('refreshing')}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>

      {!tableToken && (
        <p
          className="rounded-2xl px-4 py-3 text-sm"
          style={{
            background: 'var(--qr-bg-elevated)',
            border: '1px solid var(--qr-line)',
            color: 'var(--qr-muted)',
          }}
        >
          {t('requestBillHint')}
        </p>
      )}

      {err && (
        <p
          className="rounded-2xl px-4 py-3 text-sm"
          style={{
            background: 'rgba(224,122,106,0.12)',
            border: '1px solid rgba(224,122,106,0.3)',
            color: '#f0c4bc',
          }}
        >
          {err}
        </p>
      )}

      {tableToken && bill && bill.items.length > 0 ? (
        <div
          className="space-y-3 rounded-2xl p-4"
          style={{
            background: 'var(--qr-bg-elevated)',
            border: '1px solid var(--qr-line)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: 'rgba(212,165,116,0.18)' }}
            >
              <Receipt className="h-5 w-5" style={{ color: 'var(--qr-gold)' }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--qr-muted)' }}>
                {t('table')} {bill.tableNumber}
              </p>
              <p className="font-semibold">{phaseLabel(t, bill.guestPhase)}</p>
            </div>
          </div>

          <ul className="space-y-2">
            {bill.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p>
                    {i.qty}× {i.name}
                  </p>
                  <p
                    className="text-[10px] uppercase tracking-wide"
                    style={{ color: 'var(--qr-muted)' }}
                  >
                    {itemStatusLabel(t, i.status)}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums" style={{ color: 'var(--qr-muted)' }}>
                  {(i.subtotal ?? i.qty * i.price).toLocaleString('tr-TR')}
                </span>
              </li>
            ))}
          </ul>

          {bill.discountAmount > 0 && (
            <div className="flex justify-between text-sm" style={{ color: 'var(--qr-ok)' }}>
              <span>{t('discount')}</span>
              <span className="tabular-nums">-{bill.discountAmount.toLocaleString('tr-TR')}</span>
            </div>
          )}

          <div
            className="flex justify-between pt-3 text-lg font-bold"
            style={{ borderTop: '1px solid var(--qr-line)' }}
          >
            <span>{t('total')}</span>
            <span className="tabular-nums" style={{ color: 'var(--qr-gold-bright)' }}>
              {bill.totalAmount.toLocaleString('tr-TR')}
            </span>
          </div>
        </div>
      ) : tableToken ? (
        <p className="py-8 text-center" style={{ color: 'var(--qr-muted)' }}>
          {t('noLiveOrder')}
        </p>
      ) : null}

      {done ? (
        <div
          className="space-y-2 rounded-2xl py-6 text-center"
          style={{
            background: 'rgba(124,184,154,0.12)',
            border: '1px solid rgba(124,184,154,0.35)',
          }}
        >
          <Receipt className="mx-auto h-10 w-10" style={{ color: 'var(--qr-ok)' }} />
          <p className="font-semibold" style={{ color: 'var(--qr-ok)' }}>
            {t('billRequested')}
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy || !tableToken}
          onClick={() => void requestBill()}
          className="rex-qr-press w-full rounded-2xl py-3.5 font-bold disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, var(--qr-gold) 0%, var(--qr-copper) 100%)',
            color: '#1a120c',
          }}
        >
          {busy ? t('loading') : t('requestBill')}
        </button>
      )}
    </div>
  );
}
