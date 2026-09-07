/**
 * QR Menü backoffice — ayarlar, masa QR, çağrılar, feedback.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { QrCode, Settings, Bell, Star, RefreshCw, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { cn } from '@/components/ui/utils';
import { QrMenuService, type QrSettings, type ServiceRequestRow, type QrFeedbackRow, type QrFeedbackQuestion } from '../../../../services/qrMenuService';
import { useRestaurantStore } from '../../store/useRestaurantStore';

type Tab = 'settings' | 'tables' | 'requests' | 'feedback';

const TEMPLATES = [
  { id: 'stand', name: 'Masa üstü stand', size: '10×15 cm' },
  { id: 'card', name: 'Masa kartı', size: '9×5 cm' },
  { id: 'poster', name: 'Dikey poster', size: 'A4' },
  { id: 'tent', name: 'Çadır kart', size: '10×15 cm' },
  { id: 'premium', name: 'Premium stand', size: '10×15 cm' },
];

export function QRMenuAdminPanel() {
  const [tab, setTab] = useState<Tab>('settings');
  const sendToKitchen = useRestaurantStore((s) => s.sendToKitchen);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col min-h-[32rem]">
      <div className="flex flex-wrap gap-2 p-4 border-b border-slate-100 bg-slate-50/80">
        {(
          [
            ['settings', 'Ayarlar', Settings],
            ['tables', 'Masa QR', QrCode],
            ['requests', 'Çağrılar / Sipariş', Bell],
            ['feedback', 'Geri bildirim', Star],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
              tab === id ? 'bg-amber-500 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {tab === 'settings' && <QRSettingsForm />}
        {tab === 'tables' && <QRTableCodesPanel />}
        {tab === 'requests' && <QRRequestsPanel sendToKitchen={sendToKitchen} />}
        {tab === 'feedback' && <QRFeedbackAdminPanel />}
      </div>
    </div>
  );
}

function QRSettingsForm() {
  const [s, setS] = useState<QrSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
      void QrMenuService.getSettings().then(setS).catch((e: unknown) => toast.error(String((e as Error)?.message || e)));
  }, []);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      const next = await QrMenuService.upsertSettings(s);
      setS(next);
      toast.success('QR ayarları kaydedildi');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!s) return <p className="text-slate-400 text-sm">Yükleniyor…</p>;

  const field = (label: string, key: keyof QrSettings, type: 'text' | 'color' = 'text') => (
    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
      {label}
      <input
        type={type}
        value={String(s[key] ?? '')}
        onChange={(e) => setS({ ...s, [key]: e.target.value })}
        className="mt-1.5 w-full px-4 py-3 border border-slate-200 rounded-2xl text-slate-800 font-medium"
      />
    </label>
  );

  const toggle = (label: string, key: keyof QrSettings) => (
    <label className="flex items-center justify-between gap-3 py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={!!s[key]}
        onChange={(e) => setS({ ...s, [key]: e.target.checked })}
        className="h-5 w-5 rounded border-slate-300 text-amber-500"
      />
    </label>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('Restoran adı', 'restaurant_name')}
        {field('Ana renk', 'primary_color', 'color')}
        {field('Logo URL', 'logo_url')}
        {field('Kapak URL', 'cover_image_url')}
        {field('WiFi SSID', 'wifi_ssid')}
        {field('WiFi şifre', 'wifi_password')}
        {field('Public base URL', 'public_base_url')}
        {field('Varsayılan dil', 'default_language')}
      </div>
      <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50/50">
        {toggle('Online sipariş', 'ordering_enabled')}
        {toggle('Garson çağır', 'call_waiter_enabled')}
        {toggle('Hesap iste', 'request_bill_enabled')}
        {toggle('Vale', 'valet_enabled')}
        {toggle('Geri bildirim', 'feedback_enabled')}
        {toggle('WiFi bilgisi', 'wifi_enabled')}
        {toggle('QR sipariş otomatik mutfağa gitsin', 'auto_send_kitchen')}
        <label className="flex flex-col gap-2 py-3 border-b border-slate-100 last:border-0">
          <span className="text-sm font-medium text-slate-700">Sipariş onaylama</span>
          <select
            value={s.order_approval_mode === 'auto' ? 'auto' : 'manual'}
            onChange={(e) =>
              setS({
                ...s,
                order_approval_mode: e.target.value === 'auto' ? 'auto' : 'manual',
              })
            }
            className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-slate-800 font-medium bg-white"
          >
            <option value="manual">Manuel — onaylanınca adisyona ekle</option>
            <option value="auto">Otomatik — hemen adisyona yaz</option>
          </select>
          <span className="text-xs text-slate-500">
            Manuelde misafir siparişi bildirime düşer; personel onaylayınca masaya yazılır.
          </span>
        </label>
        {toggle('QR menü aktif', 'is_active')}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="px-6 py-3 rounded-2xl bg-amber-500 text-white font-bold disabled:opacity-50"
      >
        Kaydet
      </button>
    </div>
  );
}

function QRTableCodesPanel() {
  const [rows, setRows] = useState<
    Array<{ id: string; number: string; seats: number; status: string; qr_token: string | null }>
  >([]);
  const [dataUrls, setDataUrls] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const tenant = QrMenuService.tenantCodeHint();

  const load = useCallback(async () => {
    const list = await QrMenuService.listTablesWithQr();
    setRows(list);
    const settings = await QrMenuService.getSettings().catch(() => ({} as QrSettings));
    const base = settings.public_base_url || (typeof window !== 'undefined' ? window.location.origin : '');
    const map: Record<string, string> = {};
    for (const t of list) {
      if (!t.qr_token) continue;
      const url = QrMenuService.getPublicQrUrl(tenant, t.qr_token, base || undefined);
      try {
        map[t.id] = await QRCode.toDataURL(url, { width: 200, margin: 1 });
      } catch {
        /* ignore */
      }
    }
    setDataUrls(map);
  }, [tenant]);

  useEffect(() => {
    void load().catch((e) => toast.error(String(e?.message || e)));
  }, [load]);

  const copyUrl = async (tableId: string, token: string) => {
    const settings = await QrMenuService.getSettings().catch(() => ({} as QrSettings));
    const url = QrMenuService.getPublicQrUrl(
      tenant,
      token,
      settings.public_base_url || window.location.origin
    );
    await navigator.clipboard.writeText(url);
    setCopied(tableId);
    toast.success('URL kopyalandı');
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        {TEMPLATES.map((t) => (
          <span key={t.id} className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-100">
            {t.name} · {t.size}
          </span>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((t) => (
          <div key={t.id} className="rounded-2xl border border-slate-200 p-4 flex flex-col items-center gap-3">
            <div className="text-lg font-bold text-slate-800">Masa {t.number}</div>
            {dataUrls[t.id] ? (
              <img src={dataUrls[t.id]} alt={`QR ${t.number}`} className="w-40 h-40 rounded-xl border border-slate-100" />
            ) : (
              <div className="w-40 h-40 rounded-xl bg-slate-100 animate-pulse" />
            )}
            <div className="flex gap-2 w-full">
              <button
                type="button"
                className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                onClick={() => t.qr_token && void copyUrl(t.id, t.qr_token)}
              >
                {copied === t.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                URL
              </button>
              <button
                type="button"
                className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold"
                onClick={() =>
                  void QrMenuService.regenerateTableQrToken(t.id)
                    .then(() => load())
                    .then(() => toast.success('Token yenilendi'))
                }
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Yenile
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QRRequestsPanel({
  sendToKitchen,
}: {
  sendToKitchen: (tableId: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<ServiceRequestRow[]>([]);

  const load = useCallback(async () => {
    setRows(await QrMenuService.listServiceRequests());
  }, []);

  useEffect(() => {
    void load().catch(() => {});
    const id = window.setInterval(() => void load().catch(() => {}), 4000);
    return () => clearInterval(id);
  }, [load]);

  const typeLabel = (t: string) =>
    ({
      qr_order: 'QR sipariş',
      waiter: 'Garson',
      bill: 'Hesap',
      help: 'Yardım',
      valet: 'Vale',
    }[t] || t);

  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-slate-400 text-sm">Kayıt yok</p>}
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50/50"
        >
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800 text-sm">
              {typeLabel(r.request_type)}
              {r.table_number ? ` · Masa ${r.table_number}` : ''}
              {r.request_type === 'qr_order' &&
              !(r.order_id) &&
              (typeof r.payload === 'object' && r.payload && (r.payload as { awaitingApproval?: boolean }).awaitingApproval !== false)
                ? ' · Onay bekliyor'
                : ''}
            </div>
            <div className="text-xs text-slate-500">
              {r.status} · {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
              {r.request_type === 'valet' && r.payload && typeof r.payload === 'object'
                ? ` · ${(r.payload as { plateNumber?: string }).plateNumber || ''}`
                : ''}
            </div>
            {r.request_type === 'qr_order' &&
              r.payload &&
              typeof r.payload === 'object' &&
              Array.isArray((r.payload as { items?: unknown[] }).items) && (
                <ul className="mt-1.5 text-xs text-slate-600 space-y-0.5">
                  {((r.payload as { items: Array<{ name?: string; quantity?: number; unitPrice?: number }> }).items)
                    .slice(0, 6)
                    .map((it, idx) => (
                      <li key={idx}>
                        {Number(it.quantity) || 1}× {String(it.name || 'Ürün')}
                        {it.unitPrice != null
                          ? ` · ${Number(it.unitPrice).toLocaleString()}`
                          : ''}
                      </li>
                    ))}
                </ul>
              )}
          </div>
          {r.status === 'pending' && (
            <>
              {r.request_type === 'qr_order' && r.table_id && (
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold"
                  onClick={() =>
                    void (async () => {
                      const result = await QrMenuService.approveQrOrderRequest(r.id);
                      if (result.sendKitchen) {
                        await sendToKitchen(result.tableId);
                        toast.success('Adisyona eklendi ve mutfağa gönderildi');
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
                  Onayla / Adisyona ekle
                </button>
              )}
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold"
                onClick={() =>
                  void QrMenuService.updateServiceRequestStatus(r.id, 'acked', 'Personel').then(load)
                }
              >
                Kabul
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                onClick={() =>
                  void QrMenuService.updateServiceRequestStatus(r.id, 'done').then(load)
                }
              >
                Tamamla
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function QRFeedbackAdminPanel() {
  const [questions, setQuestions] = useState<QrFeedbackQuestion[]>([]);
  const [feedback, setFeedback] = useState<QrFeedbackRow[]>([]);

  useEffect(() => {
    void (async () => {
      setQuestions(await QrMenuService.listFeedbackQuestions());
      setFeedback(await QrMenuService.listFeedback());
    })().catch((e) => toast.error(String(e?.message || e)));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-bold text-slate-800 mb-3">Sorular (DB)</h3>
        <ul className="space-y-1">
          {questions.map((q) => (
            <li key={q.id} className="text-sm text-slate-700 flex gap-2">
              <span className="font-mono text-xs text-amber-700">{q.code}</span>
              {q.name_tr}
              {!q.is_active && <span className="text-slate-400">(pasif)</span>}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-bold text-slate-800 mb-3">Gelen yanıtlar</h3>
        <div className="space-y-2">
          {feedback.length === 0 && <p className="text-slate-400 text-sm">Henüz yok</p>}
          {feedback.map((f) => (
            <div key={f.id} className="p-3 rounded-2xl border border-slate-200 text-sm">
              <div className="font-semibold">
                {f.question_code} · {f.rating}/5
                {f.table_number ? ` · Masa ${f.table_number}` : ''}
              </div>
              <div className="text-slate-500 text-xs">
                {[f.first_name, f.last_name].filter(Boolean).join(' ')} {f.phone || ''}
              </div>
              {f.comment && <p className="mt-1 text-slate-700">{f.comment}</p>}
              <button
                type="button"
                className="mt-2 text-xs font-bold text-amber-700"
                onClick={() =>
                  void QrMenuService.updateFeedbackStatus(f.id, 'reviewed').then(async () =>
                    setFeedback(await QrMenuService.listFeedback())
                  )
                }
              >
                İncelendi işaretle
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default QRMenuAdminPanel;
