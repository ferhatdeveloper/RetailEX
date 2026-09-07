/**
 * MainLayout mavi çubuk — QR / garson / vale bildirim merkezi.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/components/ui/utils';
import { QrMenuService, type ServiceRequestRow } from '../../services/qrMenuService';
import { useRestaurantStore } from '../restaurant/store/useRestaurantStore';

function typeLabel(t: string) {
  return (
    {
      qr_order: 'QR sipariş',
      waiter: 'Garson',
      bill: 'Hesap',
      help: 'Yardım',
      valet: 'Vale',
    }[t] || t
  );
}

export function QrServiceNotificationsButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ServiceRequestRow[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);
  const sendToKitchen = useRestaurantStore((s) => s.sendToKitchen);

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
            `${typeLabel(r.request_type)}${r.table_number ? ` · Masa ${r.table_number}` : ''}${
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
      // İlk yüklemede toast spam olmasın: ilk poll'da seen doldur, toast yok
      setRows(list);
    } catch {
      /* QR tabloları yoksa sessiz */
    }
  }, []);

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

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pending = rows.filter((r) => r.status === 'pending');

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 touch-manipulation',
          compact ? 'h-8 w-8' : 'h-9 w-9'
        )}
        title="Bildirimler"
        aria-label="Bildirimler"
      >
        <Bell className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        {pending.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-amber-400 text-[10px] font-bold text-slate-900 flex items-center justify-center">
            {pending.length > 9 ? '9+' : pending.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[20050] w-[min(20rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-y-auto rounded-xl border border-white/20 bg-blue-800 py-2 text-sm shadow-2xl">
          <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-blue-200">
            Bildirimler
          </div>
          {pending.length === 0 ? (
            <p className="px-3 py-4 text-blue-100/70 text-xs">Bekleyen yok</p>
          ) : (
            pending.map((r) => (
              <div key={r.id} className="px-3 py-2 border-t border-white/10 space-y-2">
                <div className="text-white font-semibold text-xs">
                  {typeLabel(r.request_type)}
                  {r.table_number ? ` · Masa ${r.table_number}` : ''}
                  {r.request_type === 'qr_order' && !r.order_id ? ' · Onay' : ''}
                </div>
                {r.request_type === 'qr_order' &&
                  r.payload &&
                  typeof r.payload === 'object' &&
                  Array.isArray((r.payload as { items?: unknown[] }).items) && (
                    <p className="text-[10px] text-blue-100/80 line-clamp-2">
                      {((r.payload as { items: Array<{ name?: string; quantity?: number }> }).items)
                        .slice(0, 4)
                        .map((it) => `${Number(it.quantity) || 1}× ${it.name || 'Ürün'}`)
                        .join(' · ')}
                    </p>
                  )}
                <div className="flex flex-wrap gap-1.5">
                  {r.request_type === 'qr_order' && r.table_id && (
                    <button
                      type="button"
                      className="px-2 py-1 rounded-lg bg-amber-400 text-slate-900 text-[10px] font-bold"
                      onClick={() =>
                        void (async () => {
                          const result = await QrMenuService.approveQrOrderRequest(r.id);
                          if (result.sendKitchen) {
                            await sendToKitchen(result.tableId);
                            toast.success('Adisyona eklendi · mutfak');
                          } else {
                            toast.success('Adisyona eklendi');
                          }
                          await useRestaurantStore.getState().loadTables();
                          await load();
                        })().catch((e: unknown) =>
                          toast.error(e instanceof Error ? e.message : String(e))
                        )
                      }
                    >
                      Onayla / Adisyon
                    </button>
                  )}
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-white/15 text-white text-[10px] font-bold"
                    onClick={() =>
                      void QrMenuService.updateServiceRequestStatus(r.id, 'acked').then(load)
                    }
                  >
                    Kabul
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-emerald-500/90 text-white text-[10px] font-bold"
                    onClick={() =>
                      void QrMenuService.updateServiceRequestStatus(r.id, 'done').then(load)
                    }
                  >
                    Tamamla
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
