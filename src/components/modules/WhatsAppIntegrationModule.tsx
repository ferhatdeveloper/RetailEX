/**
 * WhatsApp Entegrasyonu — Baileys köprüsü, Evolution, Meta; bildirim kuyruğu.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Phone,
  Send,
  MessageSquare,
  CheckCheck,
  RefreshCw,
  Loader2,
  QrCode,
  Save,
  Play,
  Copy,
  FileText,
  Bell,
  Inbox,
  Cloud,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { normalizePhoneDigits } from '../../services/messaging/clinicMessaging';
import { messagingService } from '../../services/messaging/messagingService';
import type { MessagingSettings, NotificationQueueRow } from '../../services/messaging/messagingTypes';
import {
  META_APPOINTMENT_TEMPLATES,
  META_INVOICE_TEMPLATES,
  metaTemplateSetupSteps,
  previewMetaTemplateBody,
  type MetaWhatsAppTemplateDef,
} from '../../services/messaging/metaWhatsAppTemplates';
import { WhatsAppQrConnectPanel } from '../shared/WhatsAppQrConnectPanel';
import { WhatsAppSessionResetButton } from '../shared/WhatsAppSessionResetButton';
import { WhatsAppTestSendCard } from '../shared/WhatsAppTestSendCard';
import { isStaleEmbeddedBridgeUrl } from '../../services/messaging/whatsappEmbeddedBridge';

const DEFAULT_INVOICE_TEMPLATE =
  'Sayın {customer_name}, {date} tarihli {fiche_no} numaralı {category} faturanız: {amount} {currency}. RetailEX';

const PROVIDERS = [
  { id: 'NONE', label: 'Kapalı', icon: Zap, desc: 'WhatsApp bildirimleri devre dışı' },
  { id: 'EMBEDDED', label: 'QR Bağlantı', icon: QrCode, desc: 'Telefonla QR okutarak bağlanın' },
  { id: 'EVOLUTION', label: 'Evolution API', icon: Cloud, desc: 'Evolution sunucusu üzerinden' },
  { id: 'META', label: 'Meta Cloud', icon: MessageSquare, desc: 'Resmi WhatsApp Business API' },
] as const;

const QUEUE_STATUS_TR: Record<string, string> = {
  pending: 'Bekliyor',
  sent: 'Gönderildi',
  failed: 'Hatalı',
  processing: 'İşleniyor',
};

function isStaleBridgeUrl(url: string): boolean {
  return isStaleEmbeddedBridgeUrl(url);
}

export function WhatsAppIntegrationModule() {
  const { darkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);

  const defaultBridgeUrl = import.meta.env.DEV ? 'http://127.0.0.1:3000' : '/__wa_bridge';

  const [waProvider, setWaProvider] = useState('NONE');
  const [waBaseUrl, setWaBaseUrl] = useState(defaultBridgeUrl);
  const [waToken, setWaToken] = useState('');
  const [waInstance, setWaInstance] = useState('');
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waTemplate, setWaTemplate] = useState('');
  const [invoiceTemplate, setInvoiceTemplate] = useState(DEFAULT_INVOICE_TEMPLATE);
  const [notifyInvoice, setNotifyInvoice] = useState(false);
  const [notifyCategories, setNotifyCategories] = useState('Satis,Hizmet');
  const [metaInvoiceTplId, setMetaInvoiceTplId] = useState('retailex_invoice_tr');
  const [metaAppointmentTplId, setMetaAppointmentTplId] = useState('retailex_appointment_tr');
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('RetailEX — WhatsApp test mesajı. Bağlantınız çalışıyor.');
  const [testSending, setTestSending] = useState(false);
  const [embedStatus, setEmbedStatus] = useState('');
  const [stats, setStats] = useState({ pending: 0, sent: 0, failed: 0 });
  const [queue, setQueue] = useState<NotificationQueueRow[]>([]);

  const panel = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const inputCls = darkMode
    ? 'w-full rounded-lg border border-gray-600 bg-gray-900 text-gray-100 p-2.5 text-sm focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500'
    : 'w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';
  const labelCls = darkMode ? 'text-xs font-medium text-gray-400' : 'text-xs font-medium text-gray-500';
  const headingCls = darkMode ? 'text-white' : 'text-gray-900';

  const staleUrlWarning = useMemo(
    () => waProvider === 'EMBEDDED' && isStaleBridgeUrl(waBaseUrl),
    [waProvider, waBaseUrl]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const s = await messagingService.getSettings();
      setSettings(s);
      if (s) {
        setWaProvider((s.whatsapp_provider || 'NONE').toString());
        let loadedUrl = s.whatsapp_base_url || defaultBridgeUrl;
        if (isStaleBridgeUrl(loadedUrl)) {
          loadedUrl = defaultBridgeUrl;
          setWaProvider('EMBEDDED');
          try {
            await messagingService.updateSettings({
              whatsapp_provider: 'EMBEDDED',
              whatsapp_base_url: defaultBridgeUrl,
            });
            toast.info('Köprü adresi /__wa_bridge olarak güncellendi');
          } catch {
            toast.warning('Köprü URL eski — Kaydet ile /__wa_bridge kullanın');
          }
        }
        setWaBaseUrl(loadedUrl);
        setWaToken(s.whatsapp_token || '');
        setWaInstance(s.whatsapp_instance_id || '');
        setWaPhoneId(s.whatsapp_phone_id || '');
        setWaTemplate(s.whatsapp_template || '');
        setInvoiceTemplate(s.invoice_whatsapp_template || DEFAULT_INVOICE_TEMPLATE);
        setNotifyInvoice(s.notify_invoice_whatsapp === true);
        setNotifyCategories(s.notify_sale_categories || 'Satis,Hizmet');
        setMetaInvoiceTplId(s.meta_invoice_template_name || 'retailex_invoice_tr');
        setMetaAppointmentTplId(s.meta_appointment_template_name || 'retailex_appointment_tr');
      }
      setStats(await messagingService.getQueueStats());
      setQueue(await messagingService.listQueue(25));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ayarlar yüklenemedi';
      toast.error(msg, { duration: msg.includes('migration') ? 12000 : 5000 });
    } finally {
      setLoading(false);
    }
  }, [defaultBridgeUrl]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await messagingService.updateSettings({
        whatsapp_provider: waProvider,
        whatsapp_base_url: waBaseUrl || null,
        whatsapp_token: waToken || null,
        whatsapp_instance_id: waInstance || null,
        whatsapp_phone_id: waPhoneId || null,
        whatsapp_template: waTemplate || null,
        invoice_whatsapp_template: invoiceTemplate || null,
        notify_invoice_whatsapp: notifyInvoice,
        notify_sale_categories: notifyCategories || 'Satis,Hizmet',
        meta_invoice_template_name: metaInvoiceTplId || 'retailex_invoice_tr',
        meta_invoice_template_language:
          META_INVOICE_TEMPLATES.find((t) => t.id === metaInvoiceTplId)?.language || 'tr',
        meta_appointment_template_name: metaAppointmentTplId || 'retailex_appointment_tr',
        meta_appointment_template_language:
          META_APPOINTMENT_TEMPLATES.find((t) => t.id === metaAppointmentTplId)?.language || 'tr',
      });
      toast.success('WhatsApp ayarları kaydedildi');
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    const phone = testPhone.trim();
    if (!phone) {
      toast.error('Telefon numarası girin');
      return;
    }
    const digits = normalizePhoneDigits(phone);
    if (digits.length < 10) {
      toast.error('Geçerli numara girin (ör. 905551234567 veya 05551234567)');
      return;
    }
    if (!testMessage.trim()) {
      toast.error('Test mesajı metnini girin');
      return;
    }
    if (waProvider === 'EMBEDDED' && embedStatus !== 'connected') {
      toast.error('Önce QR ile WhatsApp bağlantısı kurun');
      return;
    }
    setTestSending(true);
    try {
      await handleSave();
      const r = await messagingService.sendTestWhatsApp(phone, {
        message: testMessage.trim(),
        provider: waProvider,
        whatsapp_base_url: waBaseUrl || null,
        whatsapp_token: waToken.trim() || null,
        whatsapp_instance_id: waInstance.trim() || null,
        whatsapp_phone_id: waPhoneId.trim() || null,
      });
      if (r.success) toast.success(`Test mesajı gönderildi (${digits})`);
      else toast.error(r.error || 'Gönderilemedi');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setTestSending(false);
    }
  };

  const handleProcessQueue = async () => {
    setProcessing(true);
    try {
      const r = await messagingService.processPendingQueue(30);
      toast.success(`${r.processed} bildirim gönderildi`);
      if (r.errors.length) toast.error(r.errors.slice(0, 2).join('; '));
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Kuyruk işlenemedi');
    } finally {
      setProcessing(false);
    }
  };

  const connectionLabel =
    waProvider === 'EMBEDDED'
      ? embedStatus === 'connected'
        ? 'Bağlı'
        : embedStatus === 'scanning'
          ? 'QR bekleniyor'
          : 'Bağlı değil'
      : waProvider === 'NONE'
        ? 'Kapalı'
        : waProvider;

  const connectionOk = waProvider !== 'NONE' && (embedStatus === 'connected' || waProvider !== 'EMBEDDED');

  const selectedMetaInvoiceTpl =
    META_INVOICE_TEMPLATES.find((t) => t.id === metaInvoiceTplId) || META_INVOICE_TEMPLATES[0];
  const selectedMetaAppointmentTpl =
    META_APPOINTMENT_TEMPLATES.find((t) => t.id === metaAppointmentTplId) ||
    META_APPOINTMENT_TEMPLATES[0];

  const copyMetaTemplateBody = async (tpl: MetaWhatsAppTemplateDef) => {
    try {
      await navigator.clipboard.writeText(metaTemplateSetupSteps(tpl).join('\n'));
      toast.success('Meta kurulum metni kopyalandı');
    } catch {
      toast.error('Kopyalanamadı');
    }
  };

  if (loading) {
    return (
      <div className={`flex min-h-[50vh] flex-col items-center justify-center gap-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        <Loader2 className="h-8 w-8 animate-spin text-[#25D366]" />
        <span className="text-sm">WhatsApp ayarları yükleniyor…</span>
      </div>
    );
  }

  return (
    <div
      className={`h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain ${
        darkMode ? 'bg-gray-900' : 'bg-gray-50'
      }`}
    >
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-8 sm:p-6 sm:pb-10">
      {/* Üst başlık */}
      <div className="overflow-hidden rounded-2xl border border-emerald-200/60 shadow-sm dark:border-emerald-900/50">
        <div className="bg-gradient-to-r from-[#075E54] via-[#128C7E] to-[#25D366] px-5 py-6 text-white sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                <Phone className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-xl font-bold sm:text-2xl">WhatsApp Entegrasyonu</h1>
                <p className="mt-1 max-w-xl text-sm text-emerald-50/90">
                  Müşterilere fatura ve randevu bildirimleri gönderin. QR ile bağlanın veya Meta / Evolution kullanın.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                  connectionOk ? 'bg-white/20 text-white' : 'bg-black/20 text-emerald-100'
                }`}
              >
                <CheckCheck className="h-4 w-4" />
                {connectionLabel}
              </span>
              <button
                type="button"
                onClick={() => void loadAll()}
                className="rounded-lg bg-white/15 p-2.5 hover:bg-white/25"
                title="Yenile"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              {waProvider === 'EMBEDDED' && (
                <WhatsAppSessionResetButton
                  baseUrl={waBaseUrl}
                  token={waToken.trim() || null}
                  variant="header"
                  onResetComplete={() => void loadAll()}
                />
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-[#075E54] shadow hover:bg-emerald-50 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Kaydet
              </button>
            </div>
          </div>
        </div>

        {/* İstatistikler */}
        <div className={`grid grid-cols-3 divide-x ${darkMode ? 'divide-gray-700 bg-gray-800' : 'divide-gray-100 bg-white'}`}>
          {[
            { key: 'pending', label: 'Bekleyen', value: stats.pending, color: 'text-amber-600' },
            { key: 'sent', label: 'Gönderildi', value: stats.sent, color: 'text-emerald-600' },
            { key: 'failed', label: 'Hatalı', value: stats.failed, color: 'text-red-600' },
          ].map((s) => (
            <div key={s.key} className="px-4 py-4 text-center sm:px-6">
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className={`mt-0.5 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sağlayıcı seçimi */}
      <section className={`rounded-2xl border p-5 shadow-sm ${panel}`}>
        <h2 className={`mb-4 flex items-center gap-2 text-base font-semibold ${headingCls}`}>
          <QrCode className="h-5 w-5 text-[#25D366]" />
          Bağlantı yöntemi
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROVIDERS.map((p) => {
            const Icon = p.icon;
            const active = waProvider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setWaProvider(p.id)}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  active
                    ? 'border-[#25D366] bg-emerald-50/80 shadow-sm dark:bg-emerald-950/30'
                    : darkMode
                      ? 'border-gray-700 bg-gray-900/40 hover:border-gray-600'
                      : 'border-gray-100 bg-gray-50/80 hover:border-gray-200'
                }`}
              >
                <Icon className={`mb-2 h-5 w-5 ${active ? 'text-[#128C7E]' : darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                <p className={`text-sm font-semibold ${headingCls}`}>{p.label}</p>
                <p className={`mt-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{p.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* EMBEDDED bağlantı */}
      {waProvider === 'EMBEDDED' && (
        <section className="space-y-4">
          <div className={`rounded-2xl border p-5 shadow-sm ${panel}`}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className={labelCls}>Köprü adresi</label>
                <input
                  className={`${inputCls} mt-1 font-mono text-sm`}
                  value={waBaseUrl}
                  onChange={(e) => setWaBaseUrl(e.target.value)}
                  placeholder="/__wa_bridge"
                />
              </div>
              {!import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={() => setWaBaseUrl('/__wa_bridge')}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                  Önerilen: /__wa_bridge
                </button>
              )}
            </div>

            {staleUrlWarning && (
              <div
                className={`mt-4 flex gap-3 rounded-xl border p-4 text-sm ${
                  darkMode ? 'border-amber-800 bg-amber-950/30 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Köprü adresi güncellenmeli</p>
                  <p className="mt-1 text-xs opacity-90">
                    Geçici veya harici URL kullanılıyor. Canlıda <strong>/__wa_bridge</strong> yazıp{' '}
                    <strong>Kaydet</strong>e basın.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className={`mt-4 flex items-center gap-1 text-xs font-medium ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Gelişmiş ayarlar
            </button>
            {showAdvanced && (
              <div className="mt-3">
                <label className={labelCls}>Bearer token (isteğe bağlı)</label>
                <input
                  type="password"
                  className={`${inputCls} mt-1`}
                  value={waToken}
                  onChange={(e) => setWaToken(e.target.value)}
                  placeholder="Köprü korumalıysa token girin"
                />
              </div>
            )}
          </div>

          <WhatsAppQrConnectPanel
            baseUrl={waBaseUrl}
            token={waToken.trim() || null}
            enabled={waProvider === 'EMBEDDED'}
            onStatusChange={(s) => setEmbedStatus(s)}
          />

          <WhatsAppTestSendCard
            provider={waProvider}
            embedConnected={embedStatus === 'connected'}
            testPhone={testPhone}
            testMessage={testMessage}
            testSending={testSending}
            onPhoneChange={setTestPhone}
            onMessageChange={setTestMessage}
            onSend={() => void handleTestSend()}
          />
        </section>
      )}

      {/* Evolution / Meta API alanları */}
      {waProvider !== 'EMBEDDED' && waProvider !== 'NONE' && (
        <section className={`rounded-2xl border p-5 shadow-sm space-y-4 ${panel}`}>
          <h2 className={`text-base font-semibold ${headingCls}`}>API ayarları</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>API adresi</label>
              <input className={`${inputCls} mt-1`} value={waBaseUrl} onChange={(e) => setWaBaseUrl(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Token</label>
              <input type="password" className={`${inputCls} mt-1`} value={waToken} onChange={(e) => setWaToken(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Instance ID</label>
              <input className={`${inputCls} mt-1`} value={waInstance} onChange={(e) => setWaInstance(e.target.value)} />
            </div>
            {waProvider === 'META' && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Meta Phone ID</label>
                <input className={`${inputCls} mt-1`} value={waPhoneId} onChange={(e) => setWaPhoneId(e.target.value)} />
              </div>
            )}
          </div>
          <WhatsAppTestSendCard
            provider={waProvider}
            embedConnected={embedStatus === 'connected'}
            testPhone={testPhone}
            testMessage={testMessage}
            testSending={testSending}
            onPhoneChange={setTestPhone}
            onMessageChange={setTestMessage}
            onSend={() => void handleTestSend()}
            className="mt-4"
          />
        </section>
      )}

      {waProvider === 'NONE' && (
        <>
          <div className={`rounded-2xl border border-dashed p-8 text-center ${darkMode ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
            <Phone className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">WhatsApp kapalı. Bildirim göndermek için yukarıdan bir bağlantı yöntemi seçin.</p>
          </div>
          <WhatsAppTestSendCard
            provider={waProvider}
            embedConnected={false}
            testPhone={testPhone}
            testMessage={testMessage}
            testSending={testSending}
            onPhoneChange={setTestPhone}
            onMessageChange={setTestMessage}
            onSend={() => void handleTestSend()}
          />
        </>
      )}

      {/* Bildirimler */}
      {waProvider !== 'NONE' && (
        <section className={`rounded-2xl border shadow-sm ${panel}`}>
          <button
            type="button"
            onClick={() => setShowTemplates((v) => !v)}
            className={`flex w-full items-center justify-between px-5 py-4 text-left ${headingCls}`}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Bell className="h-5 w-5 text-blue-500" />
              Otomatik bildirimler
            </span>
            {showTemplates ? <ChevronUp className="h-5 w-5 opacity-50" /> : <ChevronDown className="h-5 w-5 opacity-50" />}
          </button>
          {showTemplates && (
            <div className="space-y-4 border-t px-5 py-4 dark:border-gray-700">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-100 bg-gray-50'}`}>
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={notifyInvoice}
                  onChange={(e) => setNotifyInvoice(e.target.checked)}
                />
                <div>
                  <p className={`text-sm font-medium ${headingCls}`}>Fatura sonrası WhatsApp bildirimi</p>
                  <p className={`mt-0.5 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Müşteri kartında telefon numarası olmalı
                  </p>
                </div>
              </label>
              <div>
                <label className={labelCls}>Bildirim kategorileri (virgülle)</label>
                <input
                  className={`${inputCls} mt-1`}
                  value={notifyCategories}
                  onChange={(e) => setNotifyCategories(e.target.value)}
                  placeholder="Satis,Hizmet"
                />
              </div>
              {waProvider === 'META' ? (
                <div className={`space-y-4 rounded-xl border p-4 ${darkMode ? 'border-indigo-900 bg-indigo-950/30' : 'border-indigo-100 bg-indigo-50/50'}`}>
                  <p className="text-xs text-indigo-800 dark:text-indigo-200">
                    Meta proaktif bildirimler için onaylı şablon zorunludur.
                  </p>
                  <div>
                    <label className={labelCls}>Fatura şablonu (Meta)</label>
                    <select className={`${inputCls} mt-1`} value={metaInvoiceTplId} onChange={(e) => setMetaInvoiceTplId(e.target.value)}>
                      {META_INVOICE_TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label} — {t.metaName}
                        </option>
                      ))}
                    </select>
                    <MetaTemplateCard template={selectedMetaInvoiceTpl} onCopy={() => void copyMetaTemplateBody(selectedMetaInvoiceTpl)} darkMode={darkMode} />
                  </div>
                  <div>
                    <label className={labelCls}>Randevu şablonu (Meta)</label>
                    <select className={`${inputCls} mt-1`} value={metaAppointmentTplId} onChange={(e) => setMetaAppointmentTplId(e.target.value)}>
                      {META_APPOINTMENT_TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label} — {t.metaName}
                        </option>
                      ))}
                    </select>
                    <MetaTemplateCard template={selectedMetaAppointmentTpl} onCopy={() => void copyMetaTemplateBody(selectedMetaAppointmentTpl)} darkMode={darkMode} />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <label className={labelCls}>
                      Fatura metni — {'{customer_name}'} {'{fiche_no}'} {'{date}'} {'{amount}'} {'{currency}'}
                    </label>
                    <textarea className={`${inputCls} mt-1 min-h-[88px]`} value={invoiceTemplate} onChange={(e) => setInvoiceTemplate(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Randevu metni — {'{name}'} {'{date}'} {'{time}'} {'{service}'}</label>
                    <textarea
                      className={`${inputCls} mt-1 min-h-[88px]`}
                      value={waTemplate}
                      onChange={(e) => setWaTemplate(e.target.value)}
                      placeholder="Merhaba {name}, {date} {time} — {service} randevu hatırlatması."
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Kuyruk */}
      {waProvider !== 'NONE' && (
        <section className={`rounded-2xl border p-5 shadow-sm ${panel}`}>
          <h2 className={`mb-4 flex items-center gap-2 text-base font-semibold ${headingCls}`}>
            <Inbox className="h-5 w-5 text-blue-500" />
            Bildirim kuyruğu
          </h2>
          <button
            type="button"
            disabled={processing || stats.pending === 0}
            onClick={() => void handleProcessQueue()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Bekleyenleri gönder ({stats.pending})
          </button>
        </section>
      )}

      {/* Son bildirimler */}
      <section className={`overflow-hidden rounded-2xl border shadow-sm ${panel}`}>
        <div className={`flex items-center gap-2 border-b px-5 py-4 font-semibold dark:border-gray-700 ${headingCls}`}>
          <Inbox className="h-5 w-5 text-gray-400" />
          Son bildirimler
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={darkMode ? 'bg-gray-900/60 text-left text-xs uppercase text-gray-500' : 'bg-gray-50 text-left text-xs uppercase text-gray-500'}>
              <tr>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Olay</th>
                <th className="px-4 py-3">Alıcı</th>
                <th className="px-4 py-3">Durum</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr>
                  <td colSpan={4} className={`px-4 py-10 text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Henüz bildirim kaydı yok
                  </td>
                </tr>
              ) : (
                queue.map((row) => (
                  <tr key={row.id} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      {row.created_at ? String(row.created_at).split('T')[0] : '—'}
                    </td>
                    <td className="px-4 py-3">{row.event_type}</td>
                    <td className="px-4 py-3">
                      <div className="max-w-[200px] truncate">{row.recipient_name || row.recipient_phone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          row.status === 'sent'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : row.status === 'failed'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                        }`}
                      >
                        {QUEUE_STATUS_TR[row.status || ''] || row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className={`text-center text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        Baileys resmi WhatsApp API değildir. Üretimde Meta Cloud API önerilir.
        {settings?.updated_at ? ` · Son güncelleme: ${String(settings.updated_at).split('T')[0]}` : ''}
      </p>
    </div>
    </div>
  );
}

function MetaTemplateCard({
  template,
  onCopy,
  darkMode,
}: {
  template: MetaWhatsAppTemplateDef;
  onCopy: () => void;
  darkMode: boolean;
}) {
  const preview = previewMetaTemplateBody(template, template.sampleValues);
  return (
    <div className={`mt-2 space-y-2 rounded-xl border p-3 text-xs ${darkMode ? 'border-indigo-900 bg-gray-900/50' : 'border-indigo-100 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-indigo-700 dark:text-indigo-300">{template.metaName}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-indigo-800 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-200 dark:hover:bg-indigo-950"
        >
          <Copy className="h-3 w-3" />
          Kopyala
        </button>
      </div>
      {template.headerForMetaConsole && (
        <p className="text-gray-500">
          <FileText className="mr-1 inline h-3 w-3" />
          {template.headerForMetaConsole}
        </p>
      )}
      <p className="whitespace-pre-wrap break-words font-mono text-gray-600 dark:text-gray-400">{template.bodyForMetaConsole}</p>
      <p className="rounded-lg bg-emerald-50 p-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Önizleme: {preview}</p>
    </div>
  );
}
