import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useQrCustomer, readLocalOrders } from './QRCustomerLayout';
import {
  qrPublicApi,
  type QrLiveOrder,
  type QrLiveOrderItem,
  type QrPublicTableInfo,
} from './qrPublicApi';

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
    case 'awaiting_approval':
      return t('phaseAwaitingApproval');
    default:
      return t('phaseOpen');
  }
}

function itemStatusLabel(t: (k: string) => string, status?: string) {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'cooking') return t('statusCooking');
  if (s === 'ready') return t('statusReady');
  if (s === 'served') return t('statusServed');
  if (s === 'awaiting_ack' || s === 'awaiting_approval') return t('statusAwaiting');
  return t('statusPending');
}

function statusStyle(status?: string): React.CSSProperties {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'cooking') return { background: 'rgba(196,122,74,0.2)', color: '#e8b88a', borderColor: 'rgba(196,122,74,0.35)' };
  if (s === 'ready') return { background: 'rgba(124,184,154,0.2)', color: '#a8d4c0', borderColor: 'rgba(124,184,154,0.35)' };
  if (s === 'served') return { background: 'rgba(120,160,200,0.2)', color: '#a8c4e0', borderColor: 'rgba(120,160,200,0.35)' };
  if (s === 'awaiting_ack' || s === 'awaiting_approval') {
    return { background: 'rgba(212,165,116,0.18)', color: 'var(--qr-gold-bright)', borderColor: 'rgba(212,165,116,0.4)' };
  }
  return { background: 'var(--qr-bg-soft)', color: 'var(--qr-muted)', borderColor: 'var(--qr-line)' };
}

function ItemRows({
  items,
  t,
  forceStatus,
}: {
  items: QrLiveOrderItem[];
  t: (k: string) => string;
  forceStatus?: string;
}) {
  return (
    <ul className="space-y-2">
      {items.map((i, idx) => (
        <li
          key={i.id || `${i.name}-${idx}`}
          className="flex items-start justify-between gap-3 pb-2 text-sm"
          style={{ borderBottom: '1px solid var(--qr-line)' }}
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium" style={{ color: 'var(--qr-text)' }}>
              {i.qty}× {i.name}
            </p>
            {i.note && (
              <p className="mt-0.5 text-xs" style={{ color: 'var(--qr-muted)' }}>
                {i.note}
              </p>
            )}
            <span
              className="mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={statusStyle(forceStatus || i.status)}
            >
              {itemStatusLabel(t, forceStatus || i.status)}
            </span>
          </div>
          <span className="shrink-0 tabular-nums" style={{ color: 'var(--qr-muted)' }}>
            {(i.subtotal ?? i.qty * i.price).toLocaleString('tr-TR')}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function QROrdersView() {
  const { tenantCode, tableToken, t } = useQrCustomer();
  const [live, setLive] = useState<QrLiveOrder | null>(null);
  const [pending, setPending] = useState<NonNullable<QrPublicTableInfo['pendingOrders']>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const local = readLocalOrders(tenantCode, tableToken);

  const refresh = useCallback(async () => {
    if (!tableToken) {
      setLive(null);
      setPending([]);
      return;
    }
    try {
      const info = await qrPublicApi.getTable(tenantCode, tableToken);
      setLive(info.order);
      setPending((info.pendingOrders || []).filter((p) => p.awaitingApproval !== false));
      setErr(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTick((n) => n + 1);
    }
  }, [tenantCode, tableToken]);

  useEffect(() => {
    void refresh();
    if (!tableToken) return;
    const id = window.setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [refresh, tableToken]);

  const hasLive = !!(live && live.items.length > 0);
  const hasPending = pending.length > 0;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h2 className="rex-qr-display text-2xl font-semibold" style={{ color: 'var(--qr-gold-bright)' }}>
          {t('orders')}
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
          {t('noTable')}
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

      {hasPending && (
        <div className="space-y-3">
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--qr-gold)' }}
          >
            {t('pendingOrders')}
          </p>
          {pending.map((p) => (
            <div
              key={p.requestId}
              className="space-y-3 rounded-2xl p-4"
              style={{
                background: 'var(--qr-bg-elevated)',
                border: '1px solid rgba(212,165,116,0.35)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="rex-qr-display text-lg font-semibold">{t('phaseAwaitingApproval')}</p>
                {p.createdAt && (
                  <span className="text-[10px]" style={{ color: 'var(--qr-muted)' }}>
                    {new Date(p.createdAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
              {p.note && (
                <p className="text-xs" style={{ color: 'var(--qr-muted)' }}>
                  {p.note}
                </p>
              )}
              <ItemRows items={p.items} t={t} forceStatus="awaiting_approval" />
            </div>
          ))}
        </div>
      )}

      {hasLive ? (
        <div
          className="space-y-3 rounded-2xl p-4"
          style={{
            background: 'var(--qr-bg-elevated)',
            border: '1px solid var(--qr-line)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--qr-gold)' }}
              >
                {t('liveOrder')}
              </p>
              <p className="rex-qr-display mt-0.5 text-lg font-semibold">
                {phaseLabel(t, live!.guestPhase)}
              </p>
            </div>
            {live!.orderNo && (
              <span className="font-mono text-xs" style={{ color: 'var(--qr-muted)' }}>
                {live!.orderNo}
              </span>
            )}
          </div>
          <ItemRows items={live!.items} t={t} />
          <div
            className="flex justify-between pt-2 font-bold"
            style={{ borderTop: '1px solid var(--qr-line)' }}
          >
            <span style={{ color: 'var(--qr-muted)' }}>{t('total')}</span>
            <span className="tabular-nums" style={{ color: 'var(--qr-gold-bright)' }}>
              {live!.totalAmount.toLocaleString('tr-TR')}
            </span>
          </div>
          {tick > 0 && (
            <p className="text-center text-[10px]" style={{ color: 'var(--qr-muted)' }}>
              {t('refreshing')}
            </p>
          )}
        </div>
      ) : tableToken && !hasPending ? (
        <p className="py-8 text-center" style={{ color: 'var(--qr-muted)' }}>
          {t('noLiveOrder')}
        </p>
      ) : null}

      {local.length > 0 && (
        <div className="space-y-2">
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--qr-muted)' }}
          >
            {t('orders')}
          </p>
          <ul className="space-y-3">
            {local.map((o, idx) => (
              <li
                key={`${o.at}-${idx}`}
                className="rounded-2xl p-4"
                style={{
                  background: 'var(--qr-bg-elevated)',
                  border: '1px solid var(--qr-line)',
                }}
              >
                <div
                  className="mb-2 flex justify-between text-xs"
                  style={{ color: 'var(--qr-muted)' }}
                >
                  <span>{new Date(o.at).toLocaleString()}</span>
                  {o.orderId ? (
                    <span className="max-w-[40%] truncate font-mono" style={{ color: 'var(--qr-gold)' }}>
                      #{String(o.orderId).slice(0, 8)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--qr-gold)' }}>{t('statusAwaiting')}</span>
                  )}
                </div>
                <ul className="space-y-1">
                  {o.items.map((i) => (
                    <li key={i.productId} className="flex justify-between text-sm">
                      <span>
                        {i.qty}× {i.name}
                      </span>
                      <span style={{ color: 'var(--qr-muted)' }}>
                        {(i.qty * i.price).toLocaleString('tr-TR')}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
