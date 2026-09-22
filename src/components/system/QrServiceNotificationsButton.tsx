/**
 * MainLayout mavi çubuk — QR / garson / vale bildirim merkezi (PercentBodyModal).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/components/ui/utils';
import { QrMenuService, type ServiceRequestRow } from '../../services/qrMenuService';
import { useRestaurantStore } from '../restaurant/store/useRestaurantStore';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';

function typeLabelKey(t: string): string {
  return (
    {
      qr_order: 'qrNotifyTypeQrOrder',
      waiter: 'qrNotifyTypeWaiter',
      bill: 'qrNotifyTypeBill',
      help: 'qrNotifyTypeHelp',
      valet: 'qrNotifyTypeValet',
    }[t] || ''
  );
}

export function QrServiceNotificationsButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ServiceRequestRow[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const sendToKitchen = useRestaurantStore((s) => s.sendToKitchen);
  const { tm } = useLanguage();
  const { darkMode } = useTheme();

  const labelForType = useCallback(
    (t: string) => {
      const key = typeLabelKey(t);
      return key ? tm(key) : t;
    },
    [tm]
  );

  const load = useCallback(async () => {
    try {
      const list = await QrMenuService.listPendingNotifications();
      for (const r of list) {
        if (!seen.current.has(r.id)) {
          seen.current.add(r.id);
          const plate =
            r.request_type === 'valet' && r.payload && typeof r.payload === 'object'
              ? String((r.payload as { plateNumber?: string }).plateNumber || '')
              : '';
          toast.info(
            `${labelForType(r.request_type)}${r.table_number ? ` · ${tm('qrNotifyTable')} ${r.table_number}` : ''}${
              plate ? ` · ${plate}` : ''
            }`
          );
        }
      }
      // seen temizliği: yalnızca mevcut pending id'leri tut
      const ids = new Set(list.map((x) => x.id));
      for (const id of [...seen.current]) {
        if (!ids.has(id)) seen.current.delete(id);
      }
      setRows(list);
    } catch {
      /* QR tabloları yoksa sessiz */
    }
  }, [labelForType, tm]);

  const first = useRef(true);
  useEffect(() => {
    void (async () => {
      try {
        const list = await QrMenuService.listPendingNotifications();
        for (const r of list) seen.current.add(r.id);
        setRows(list);
        first.current = false;
      } catch {
        /* ignore */
      }
    })();
    const id = window.setInterval(() => {
      if (first.current) return;
      void load();
    }, 3000);
    return () => clearInterval(id);
  }, [load]);

  const pending = rows.filter((r) => r.status === 'pending');
  const hasUnread = pending.length > 0;

  const title = tm('notifications');
  const emptyText = tm('qrNotifyEmpty');
  const cardBorder = darkMode ? 'border-gray-700' : 'border-slate-200';
  const cardBg = darkMode ? 'bg-gray-800/80' : 'bg-white';
  const cardTitle = darkMode ? 'text-white' : 'text-slate-900';
  const cardMuted = darkMode ? 'text-gray-400' : 'text-slate-500';
  const bodyBg = darkMode ? 'bg-gray-900' : 'bg-slate-50/80';
  const footerBorder = darkMode ? 'border-gray-700' : 'border-slate-100';
  const footerBg = darkMode ? 'bg-gray-800/60' : 'bg-slate-50/60';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'relative flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 touch-manipulation transition-colors',
          compact ? 'h-8 w-8' : 'h-9 w-9'
        )}
        title={title}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell
          className={cn(
            compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
            hasUnread && 'rex-bell-nudge'
          )}
        />
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-amber-400 text-[10px] font-bold text-slate-900 flex items-center justify-center rex-badge-pulse">
            {pending.length > 9 ? '9+' : pending.length}
          </span>
        )}
      </button>

      {open && (
        <PercentBodyModal
          onClose={() => setOpen(false)}
          size="list"
          ariaLabel={title}
          shellClassName={cn(
            'animate-in fade-in zoom-in-95 duration-200',
            darkMode ? 'bg-gray-900 text-gray-100' : ''
          )}
        >
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white shrink-0 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <Bell className={cn('w-5 h-5', hasUnread && 'rex-bell-nudge')} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-black uppercase tracking-tight">{title}</h3>
              <p className="text-[10px] text-blue-100 font-bold uppercase tracking-widest mt-1 opacity-90">
                {hasUnread
                  ? tm('qrNotifyPendingCount').replace('{count}', String(pending.length))
                  : emptyText}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={tm('close')}
              className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <PercentBodyModalScrollBody className={cn('p-4 space-y-2', bodyBg)}>
            {pending.length === 0 ? (
              <div
                className={cn(
                  'text-center py-12 animate-in fade-in duration-300',
                  cardMuted
                )}
              >
                <Bell className="w-10 h-10 mx-auto mb-3 opacity-35" />
                <p className="text-sm font-semibold">{emptyText}</p>
              </div>
            ) : (
              pending.map((r, index) => (
                <div
                  key={r.id}
                  className={cn(
                    'rounded-xl border p-3 space-y-2 shadow-sm animate-in fade-in slide-in-from-bottom-2',
                    cardBorder,
                    cardBg
                  )}
                  style={{
                    animationDelay: `${Math.min(index, 8) * 45}ms`,
                    animationDuration: '280ms',
                    animationFillMode: 'both',
                  }}
                >
                  <div className={cn('font-semibold text-sm', cardTitle)}>
                    {labelForType(r.request_type)}
                    {r.table_number ? ` · ${tm('qrNotifyTable')} ${r.table_number}` : ''}
                    {r.request_type === 'qr_order' && !r.order_id
                      ? ` · ${tm('qrNotifyApproval')}`
                      : ''}
                  </div>
                  {r.request_type === 'qr_order' &&
                    r.payload &&
                    typeof r.payload === 'object' &&
                    Array.isArray((r.payload as { items?: unknown[] }).items) && (
                      <p className={cn('text-xs line-clamp-2', cardMuted)}>
                        {(
                          (r.payload as { items: Array<{ name?: string; quantity?: number }> })
                            .items
                        )
                          .slice(0, 4)
                          .map(
                            (it) =>
                              `${Number(it.quantity) || 1}× ${it.name || tm('qrNotifyProduct')}`
                          )
                          .join(' · ')}
                      </p>
                    )}
                  <div className="flex flex-wrap gap-1.5">
                    {r.request_type === 'qr_order' && r.table_id && (
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-amber-400 text-slate-900 text-[11px] font-bold hover:bg-amber-300 active:scale-[0.98] transition-transform"
                        onClick={() =>
                          void (async () => {
                            const result = await QrMenuService.approveQrOrderRequest(r.id);
                            if (result.sendKitchen) {
                              await sendToKitchen(result.tableId);
                              toast.success(tm('qrNotifyAddedKitchen'));
                            } else {
                              toast.success(tm('qrNotifyAdded'));
                            }
                            await useRestaurantStore.getState().loadTables();
                            await load();
                          })().catch((e: unknown) =>
                            toast.error(e instanceof Error ? e.message : String(e))
                          )
                        }
                      >
                        {tm('qrNotifyApprove')}
                      </button>
                    )}
                    <button
                      type="button"
                      className={cn(
                        'px-2.5 py-1.5 rounded-lg text-[11px] font-bold active:scale-[0.98] transition-transform',
                        darkMode
                          ? 'bg-white/15 text-white hover:bg-white/25'
                          : 'bg-slate-200/80 text-slate-800 hover:bg-slate-300/80'
                      )}
                      onClick={() =>
                        void QrMenuService.updateServiceRequestStatus(r.id, 'acked').then(load)
                      }
                    >
                      {tm('qrNotifyAck')}
                    </button>
                    <button
                      type="button"
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 active:scale-[0.98] transition-transform"
                      onClick={() =>
                        void QrMenuService.updateServiceRequestStatus(r.id, 'done').then(load)
                      }
                    >
                      {tm('qrNotifyDone')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </PercentBodyModalScrollBody>

          <div className={cn('px-4 py-3 border-t shrink-0 flex justify-end', footerBorder, footerBg)}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cn(
                'rounded-2xl border-2 font-bold uppercase text-sm tracking-wider px-5 py-2.5 active:scale-[0.98] transition-transform',
                darkMode
                  ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100'
              )}
            >
              {tm('close')}
            </button>
          </div>
        </PercentBodyModal>
      )}
    </>
  );
}
