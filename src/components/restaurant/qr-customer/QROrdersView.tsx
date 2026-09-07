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

function statusColor(status?: string) {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'cooking') return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
  if (s === 'ready') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (s === 'served') return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
  if (s === 'awaiting_ack' || s === 'awaiting_approval') {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  }
  return 'bg-slate-700/50 text-slate-300 border-slate-600/40';
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
          className="flex items-start justify-between gap-3 text-sm border-b border-slate-800/80 pb-2 last:border-0"
        >
          <div className="min-w-0 flex-1">
            <p className="text-slate-100 font-medium">
              {i.qty}× {i.name}
            </p>
            {i.note && <p className="text-xs text-slate-500 mt-0.5">{i.note}</p>}
            <span
              className={`inline-flex mt-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusColor(forceStatus || i.status)}`}
            >
              {itemStatusLabel(t, forceStatus || i.status)}
            </span>
          </div>
          <span className="text-slate-400 shrink-0 tabular-nums">
            {(i.subtotal ?? i.qty * i.price).toLocaleString()}
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
        <h2 className="text-xl font-bold text-amber-400">{t('orders')}</h2>
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
          {t('noTable')}
        </p>
      )}

      {err && (
        <p className="text-sm text-rose-300 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2">
          {err}
        </p>
      )}

      {hasPending && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-500/90">
            {t('pendingOrders')}
          </p>
          {pending.map((p) => (
            <div
              key={p.requestId}
              className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-slate-900 to-amber-950/40 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-bold text-white">
                  {t('phaseAwaitingApproval')}
                </p>
                {p.createdAt && (
                  <span className="text-[10px] text-slate-500">
                    {new Date(p.createdAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
              {p.note && <p className="text-xs text-slate-400">{p.note}</p>}
              <ItemRows items={p.items} t={t} forceStatus="awaiting_approval" />
            </div>
          ))}
        </div>
      )}

      {hasLive ? (
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-slate-900 to-amber-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-amber-400/80 font-semibold">
                {t('liveOrder')}
              </p>
              <p className="text-lg font-bold text-white mt-0.5">
                {phaseLabel(t, live!.guestPhase)}
              </p>
            </div>
            {live!.orderNo && (
              <span className="text-xs font-mono text-slate-500">{live!.orderNo}</span>
            )}
          </div>
          <ItemRows items={live!.items} t={t} />
          <div className="flex justify-between pt-2 border-t border-slate-800 font-bold">
            <span className="text-slate-300">{t('total')}</span>
            <span className="text-amber-400 tabular-nums">
              {live!.totalAmount.toLocaleString()}
            </span>
          </div>
          {tick > 0 && (
            <p className="text-[10px] text-slate-600 text-center">{t('refreshing')}</p>
          )}
        </div>
      ) : tableToken && !hasPending ? (
        <p className="text-slate-500 text-center py-8">{t('noLiveOrder')}</p>
      ) : null}

      {local.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('orders')}
          </p>
          <ul className="space-y-3">
            {local.map((o, idx) => (
              <li
                key={`${o.at}-${idx}`}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
              >
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span>{new Date(o.at).toLocaleString()}</span>
                  {o.orderId ? (
                    <span className="font-mono text-amber-500/80 truncate max-w-[40%]">
                      #{String(o.orderId).slice(0, 8)}
                    </span>
                  ) : (
                    <span className="text-amber-400/80">{t('statusAwaiting')}</span>
                  )}
                </div>
                <ul className="space-y-1">
                  {o.items.map((i) => (
                    <li key={i.productId} className="flex justify-between text-sm">
                      <span className="text-slate-200">
                        {i.qty}× {i.name}
                      </span>
                      <span className="text-slate-400">
                        {(i.qty * i.price).toLocaleString()}
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
