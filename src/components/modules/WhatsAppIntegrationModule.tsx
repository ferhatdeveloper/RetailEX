/**
 * WhatsApp Entegrasyonu — Baileys köprüsü, Evolution, Meta; bildirim kuyruğu.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Phone, Send, MessageSquare, CheckCheck, RefreshCw, Loader2, QrCode, Save, Play,
  Copy, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
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

const DEFAULT_INVOICE_TEMPLATE =
  'Sayın {customer_name}, {date} tarihli {fiche_no} numaralı {category} faturanız: {amount} {currency}. RetailEX';

export function WhatsAppIntegrationModule() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [settings, setSettings] = useState<MessagingSettings | null>(null);

  const [waProvider, setWaProvider] = useState('NONE');
  const [waBaseUrl, setWaBaseUrl] = useState('http://127.0.0.1:3000');
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

  const [embedStatus, setEmbedStatus] = useState('');

  const [stats, setStats] = useState({ pending: 0, sent: 0, failed: 0 });
  const [queue, setQueue] = useState<NotificationQueueRow[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const s = await messagingService.getSettings();
      setSettings(s);
      if (s) {
        setWaProvider((s.whatsapp_provider || 'NONE').toString());
        setWaBaseUrl(s.whatsapp_base_url || 'http://127.0.0.1:3000');
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
  }, []);

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

  const connected = waProvider !== 'NONE' && (embedStatus === 'connected' || waProvider !== 'EMBEDDED');

  const selectedMetaInvoiceTpl =
    META_INVOICE_TEMPLATES.find((t) => t.id === metaInvoiceTplId) || META_INVOICE_TEMPLATES[0];
  const selectedMetaAppointmentTpl =
    META_APPOINTMENT_TEMPLATES.find((t) => t.id === metaAppointmentTplId) ||
    META_APPOINTMENT_TEMPLATES[0];

  const copyMetaTemplateBody = async (tpl: MetaWhatsAppTemplateDef) => {
    const lines = metaTemplateSetupSteps(tpl);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success('Meta kurulum metni kopyalandı');
    } catch {
      toast.error('Kopyalanamadı');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-2 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Yükleniyor…</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Phone className="w-7 h-7 text-green-600" />
          WhatsApp Entegrasyonu
        </h1>
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 ${
              connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            <CheckCheck className="w-4 h-4" />
            {waProvider === 'EMBEDDED'
              ? embedStatus === 'connected'
                ? 'Bağlı (Baileys)'
                : embedStatus === 'scanning'
                  ? 'QR bekleniyor'
                  : 'Bağlı değil'
              : waProvider === 'NONE'
                ? 'Kapalı'
                : waProvider}
          </span>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            title="Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
          <p className="text-xs text-amber-800">Bekleyen</p>
          <p className="text-2xl font-bold text-amber-900">{stats.pending}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
          <p className="text-xs text-green-800">Gönderildi</p>
          <p className="text-2xl font-bold text-green-900">{stats.sent}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3 border border-red-200">
          <p className="text-xs text-red-800">Hatalı</p>
          <p className="text-2xl font-bold text-red-900">{stats.failed}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <h2 className="font-semibold text-emerald-900 flex items-center gap-2">
          <QrCode className="w-5 h-5" />
          Bağlantı (Powered by Baileys Engine)
        </h2>
        <p className="text-xs text-gray-600">
          Yerel köprü: terminalde <code className="bg-gray-100 px-1 rounded">npm run whatsapp:bridge</code> çalıştırın.
          Geliştirmede <code className="bg-gray-100 px-1 rounded">http://127.0.0.1:3000</code> Vite proxy ile otomatik yönlendirilir.
        </p>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Sağlayıcı</label>
          <select
            className="mt-1 w-full border rounded-lg p-2 text-sm"
            value={waProvider}
            onChange={(e) => setWaProvider(e.target.value)}
          >
            <option value="NONE">Kapalı</option>
            <option value="EMBEDDED">Doğrudan (Baileys QR köprüsü)</option>
            <option value="EVOLUTION">Evolution API</option>
            <option value="META">Meta Cloud API</option>
          </select>
        </div>

        {waProvider === 'EMBEDDED' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500">Köprü URL</label>
                <input
                  className="mt-1 w-full border rounded-lg p-2 text-sm"
                  value={waBaseUrl}
                  onChange={(e) => setWaBaseUrl(e.target.value)}
                  placeholder="http://127.0.0.1:3000 veya /__wa_bridge"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500">Bearer token (isteğe bağlı)</label>
                <input
                  type="password"
                  className="mt-1 w-full border rounded-lg p-2 text-sm"
                  value={waToken}
                  onChange={(e) => setWaToken(e.target.value)}
                />
              </div>
            </div>
            <WhatsAppQrConnectPanel
              baseUrl={waBaseUrl}
              token={waToken.trim() || null}
              enabled={waProvider === 'EMBEDDED'}
              onStatusChange={(s) => setEmbedStatus(s)}
            />
          </>
        )}

        {waProvider !== 'EMBEDDED' && waProvider !== 'NONE' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500">API base URL</label>
              <input className="mt-1 w-full border rounded-lg p-2 text-sm" value={waBaseUrl} onChange={(e) => setWaBaseUrl(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Token</label>
              <input type="password" className="mt-1 w-full border rounded-lg p-2 text-sm" value={waToken} onChange={(e) => setWaToken(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Instance</label>
              <input className="mt-1 w-full border rounded-lg p-2 text-sm" value={waInstance} onChange={(e) => setWaInstance(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Meta Phone ID</label>
              <input className="mt-1 w-full border rounded-lg p-2 text-sm" value={waPhoneId} onChange={(e) => setWaPhoneId(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          Otomatik bildirimler
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notifyInvoice} onChange={(e) => setNotifyInvoice(e.target.checked)} />
          Fatura kaydı sonrası WhatsApp bildirimi (müşteri telefonu gerekli)
        </label>
        <div>
          <label className="text-xs text-gray-500">Bildirim gönderilecek kategoriler (virgülle)</label>
          <input
            className="mt-1 w-full border rounded-lg p-2 text-sm"
            value={notifyCategories}
            onChange={(e) => setNotifyCategories(e.target.value)}
            placeholder="Satis,Hizmet"
          />
        </div>
        {waProvider === 'META' ? (
          <div className="space-y-4 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
            <p className="text-xs text-indigo-900">
              Meta Cloud API proaktif bildirimler için <strong>onaylı şablon</strong> zorunludur.
              Aşağıdaki şablonları Meta Business Manager&apos;da aynı ad ve dil ile oluşturup onaylatın.
            </p>

            <div>
              <label className="text-xs font-semibold text-indigo-800 uppercase">Fatura şablonu (Meta)</label>
              <select
                className="mt-1 w-full border rounded-lg p-2 text-sm bg-white"
                value={metaInvoiceTplId}
                onChange={(e) => setMetaInvoiceTplId(e.target.value)}
              >
                {META_INVOICE_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {t.metaName} ({t.language})
                  </option>
                ))}
              </select>
              {selectedMetaInvoiceTpl && (
                <MetaTemplateCard
                  template={selectedMetaInvoiceTpl}
                  onCopy={() => void copyMetaTemplateBody(selectedMetaInvoiceTpl)}
                />
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-indigo-800 uppercase">Randevu şablonu (Meta)</label>
              <select
                className="mt-1 w-full border rounded-lg p-2 text-sm bg-white"
                value={metaAppointmentTplId}
                onChange={(e) => setMetaAppointmentTplId(e.target.value)}
              >
                {META_APPOINTMENT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {t.metaName} ({t.language})
                  </option>
                ))}
              </select>
              {selectedMetaAppointmentTpl && (
                <MetaTemplateCard
                  template={selectedMetaAppointmentTpl}
                  onCopy={() => void copyMetaTemplateBody(selectedMetaAppointmentTpl)}
                />
              )}
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs text-gray-500">
                Fatura şablonu — {'{customer_name}'} {'{fiche_no}'} {'{date}'} {'{amount}'} {'{currency}'} {'{category}'}
              </label>
              <textarea
                className="mt-1 w-full min-h-[72px] border rounded-lg p-2 text-sm"
                value={invoiceTemplate}
                onChange={(e) => setInvoiceTemplate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Randevu şablonu — {'{name}'} {'{date}'} {'{time}'} {'{service}'}</label>
              <textarea
                className="mt-1 w-full min-h-[56px] border rounded-lg p-2 text-sm"
                value={waTemplate}
                onChange={(e) => setWaTemplate(e.target.value)}
                placeholder="Merhaba {name}, {date} {time} — {service} randevu hatırlatması."
              />
            </div>
          </>
        )}
        <p className="text-[11px] text-gray-500">
          Güzellik randevu hatırlatmaları Güzellik → Operasyon ayarlarından da yönetilir;
          Meta seçiliyken randevu şablonu buradan okunur.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <h2 className="font-semibold">Test ve kuyruk</h2>
        <input
          className="w-full border rounded-lg p-2 text-sm"
          placeholder="905551234567"
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!testPhone.trim() || waProvider === 'NONE'}
            onClick={async () => {
              await handleSave();
              const r = await messagingService.sendTestWhatsApp(testPhone.trim());
              if (r.success) toast.success('Test WhatsApp gönderildi');
              else toast.error(r.error || 'Gönderilemedi');
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-40"
          >
            <Send className="w-4 h-4 inline mr-1" />
            Test gönder
          </button>
          <button
            type="button"
            disabled={processing || stats.pending === 0}
            onClick={() => void handleProcessQueue()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Kuyruğu işle ({stats.pending})
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Kaydet
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="p-4 border-b border-gray-200 font-semibold">Son bildirimler</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Tarih</th>
                <th className="px-3 py-2">Olay</th>
                <th className="px-3 py-2">Alıcı</th>
                <th className="px-3 py-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-gray-400">Kayıt yok</td>
                </tr>
              ) : (
                queue.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {row.created_at ? String(row.created_at).split('T')[0] : '—'}
                    </td>
                    <td className="px-3 py-2">{row.event_type}</td>
                    <td className="px-3 py-2">
                      <div className="truncate max-w-[180px]">{row.recipient_name || row.recipient_phone}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          row.status === 'sent'
                            ? 'bg-green-100 text-green-700'
                            : row.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <strong>Not:</strong> Baileys resmi WhatsApp API değildir; üretimde Meta Cloud API veya onaylı BSP önerilir.
        Meta şablonları UTILITY kategorisinde oluşturulmalı; onay süreci 24–48 saat sürebilir.
      </div>
    </div>
  );
}

function MetaTemplateCard({
  template,
  onCopy,
}: {
  template: MetaWhatsAppTemplateDef;
  onCopy: () => void;
}) {
  const preview = previewMetaTemplateBody(template, template.sampleValues);
  return (
    <div className="mt-2 rounded-lg border border-indigo-100 bg-white p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-indigo-700">{template.metaName}</span>
        <span className="text-gray-500">{template.category} · {template.language}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 px-2 py-1 border border-indigo-200 rounded text-indigo-800 hover:bg-indigo-50"
        >
          <Copy className="w-3 h-3" />
          Meta kurulum metnini kopyala
        </button>
      </div>
      {template.headerForMetaConsole && (
        <p><FileText className="w-3 h-3 inline mr-1 text-gray-400" />Header: {template.headerForMetaConsole}</p>
      )}
      <p className="text-gray-600 font-mono whitespace-pre-wrap break-words">{template.bodyForMetaConsole}</p>
      <p className="text-gray-500">
        Parametreler: {template.parameterLabels.map((l, i) => `{{${i + 1}}} ${l}`).join(' · ')}
      </p>
      <p className="text-emerald-800 bg-emerald-50 rounded p-2">Önizleme: {preview}</p>
    </div>
  );
}
