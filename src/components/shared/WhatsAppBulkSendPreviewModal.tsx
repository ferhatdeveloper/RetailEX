import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Languages,
  Loader2,
  Pause,
  Play,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PercentBodyModal, PercentBodyModalScrollBody } from './PercentBodyModal';
import { WhatsAppQrConnectPanel } from './WhatsAppQrConnectPanel';
import { useLanguage } from '../../contexts/LanguageContext';
import { messagingService } from '../../services/messaging/messagingService';
import {
  WHATSAPP_MESSAGE_LANG_OPTIONS,
  normalizeWhatsAppMessageLang,
  type WhatsAppMessageLang,
} from '../../services/messaging/whatsappMessageLang';
import {
  DEFAULT_WHATSAPP_BULK_INTERVAL_MS,
  WHATSAPP_BULK_INTERVAL_OPTIONS_MS,
  estimateBulkDurationSec,
  type WhatsAppBulkPreviewItem,
  type WhatsAppBulkSendProgress,
  runWhatsAppBulkCampaign,
} from '../../utils/whatsappBulkSend';

type BulkModalTab = 'send' | 'connection';

type Props = {
  open: boolean;
  items: WhatsAppBulkPreviewItem[];
  title?: string;
  onClose: () => void;
  onComplete?: (result: { queued: number; sent: number; errors: string[] }) => void;
  onRebuildItems?: (lang: WhatsAppMessageLang) => Promise<WhatsAppBulkPreviewItem[]>;
  initialMessageLang?: WhatsAppMessageLang;
};

type WaConnectionState = {
  provider: string;
  status: string;
  connected: boolean;
  baseUrl: string;
  token: string | null;
};

export function WhatsAppBulkSendPreviewModal({
  open,
  items,
  title,
  onClose,
  onComplete,
  onRebuildItems,
  initialMessageLang,
}: Props) {
  const { tm, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<BulkModalTab>('send');
  const [messageLang, setMessageLang] = useState<WhatsAppMessageLang>(
    initialMessageLang ?? normalizeWhatsAppMessageLang(language),
  );
  const [localItems, setLocalItems] = useState<WhatsAppBulkPreviewItem[]>(items);
  const [rebuilding, setRebuilding] = useState(false);
  const [intervalMs, setIntervalMs] = useState(DEFAULT_WHATSAPP_BULK_INTERVAL_MS);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<WhatsAppBulkSendProgress | null>(null);
  const [waConn, setWaConn] = useState<WaConnectionState>({
    provider: 'NONE',
    status: '',
    connected: false,
    baseUrl: '',
    token: null,
  });
  const [waLoading, setWaLoading] = useState(false);
  const abortRef = useRef(false);

  const refreshConnection = useCallback(async () => {
    setWaLoading(true);
    try {
      const settings = await messagingService.getSettings();
      const provider = (settings?.whatsapp_provider || 'NONE').toString().toUpperCase();
      const baseUrl = String(settings?.whatsapp_base_url ?? '').trim();
      const token = settings?.whatsapp_token ?? null;

      if (provider === 'EMBEDDED') {
        const st = await messagingService.getEmbeddedStatus({
          whatsapp_base_url: baseUrl || null,
          whatsapp_token: token,
        });
        const status = String(st.status ?? '');
        setWaConn({
          provider,
          status,
          connected: status === 'connected',
          baseUrl,
          token,
        });
        return;
      }

      if (provider === 'META') {
        const hasPhone = Boolean(String(settings?.whatsapp_phone_id ?? '').trim());
        setWaConn({
          provider,
          status: hasPhone ? 'configured' : 'missing_config',
          connected: hasPhone,
          baseUrl,
          token,
        });
        return;
      }

      if (provider === 'EVOLUTION') {
        const hasInstance = Boolean(String(settings?.whatsapp_instance_id ?? '').trim());
        setWaConn({
          provider,
          status: hasInstance ? 'configured' : 'missing_config',
          connected: hasInstance,
          baseUrl,
          token,
        });
        return;
      }

      setWaConn({
        provider,
        status: 'off',
        connected: false,
        baseUrl,
        token,
      });
    } finally {
      setWaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      abortRef.current = false;
      setRunning(false);
      setProgress(null);
      setActiveTab('send');
      return;
    }
    setLocalItems(items);
    setMessageLang(initialMessageLang ?? normalizeWhatsAppMessageLang(language));
    void refreshConnection();
  }, [open, items, initialMessageLang, language, refreshConnection]);

  const handleLangChange = async (lang: WhatsAppMessageLang) => {
    setMessageLang(lang);
    if (!onRebuildItems) return;
    setRebuilding(true);
    try {
      const next = await onRebuildItems(lang);
      setLocalItems(next);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRebuilding(false);
    }
  };

  const estSec = useMemo(
    () => estimateBulkDurationSec(localItems.length, intervalMs),
    [localItems.length, intervalMs],
  );

  const connectionBadge = useMemo(() => {
    if (waConn.provider === 'NONE') {
      return { tone: 'off' as const, label: tm('msgNotifyBulkWaOff') };
    }
    if (waConn.connected) {
      return { tone: 'ok' as const, label: tm('msgNotifyBulkWaConnected') };
    }
    if (waConn.status === 'scanning' || waConn.status === 'disconnected') {
      return { tone: 'warn' as const, label: tm('msgNotifyBulkWaScanning') };
    }
    return { tone: 'err' as const, label: tm('msgNotifyBulkWaDisconnected') };
  }, [waConn, tm]);

  const handleEnqueueOnly = async () => {
    if (!localItems.length || running) return;
    setRunning(true);
    abortRef.current = false;
    try {
      const result = await runWhatsAppBulkCampaign(localItems, {
        enqueueOnly: true,
        onProgress: setProgress,
      });
      if (result.queued > 0) {
        toast.success(tm('msgNotifyBulkQueuedOnly').replace('{n}', String(result.queued)));
      }
      if (result.errors.length) toast.error(result.errors.slice(0, 2).join(' · '));
      onComplete?.({ queued: result.queued, sent: 0, errors: result.errors });
      onClose();
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const handleAutoSend = async () => {
    if (!localItems.length || running) return;
    if (!waConn.connected && waConn.provider === 'EMBEDDED') {
      toast.error(tm('msgNotifyBulkWaNeedQr'));
      setActiveTab('connection');
      return;
    }
    setRunning(true);
    abortRef.current = false;
    try {
      const result = await runWhatsAppBulkCampaign(localItems, {
        intervalMs,
        shouldAbort: () => abortRef.current,
        onProgress: setProgress,
      });
      if (result.sent > 0) {
        toast.success(
          tm('msgNotifySentSummary')
            .replace('{queued}', String(result.queued))
            .replace('{sent}', String(result.sent)),
        );
      }
      if (result.errors.length) toast.error(result.errors.slice(0, 3).join('\n'));
      onComplete?.({ queued: result.queued, sent: result.sent, errors: result.errors });
      if (!abortRef.current) onClose();
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const handleAbort = () => {
    abortRef.current = true;
  };

  if (!open) return null;

  const progressPct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const badgeCls =
    connectionBadge.tone === 'ok'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : connectionBadge.tone === 'warn'
        ? 'bg-amber-100 text-amber-900 border-amber-200'
        : connectionBadge.tone === 'off'
          ? 'bg-gray-100 text-gray-600 border-gray-200'
          : 'bg-red-100 text-red-800 border-red-200';

  return (
    <PercentBodyModal
      onClose={running ? undefined : onClose}
      size="wide"
      ariaLabel={title ?? tm('msgNotifyBulkPreviewTitle')}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0 bg-gradient-to-r from-emerald-50 to-white">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.16em]">
            {tm('msgNotifyBulkPreviewTitle')}
          </p>
          <h2 className="text-sm font-black text-gray-900 mt-1 truncate">
            {title ?? tm('msgNotifyBulkPreviewSubtitle')}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-xs text-gray-500">
              {tm('msgNotifyBulkPreviewCount').replace('{n}', String(localItems.length))}
            </p>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeCls}`}
            >
              {waLoading ? (
                <Loader2 size={10} className="animate-spin" />
              ) : connectionBadge.tone === 'ok' ? (
                <Wifi size={10} />
              ) : (
                <WifiOff size={10} />
              )}
              {tm('msgNotifyProviderActive').replace('{provider}', waConn.provider)}
              {' · '}
              {connectionBadge.label}
            </span>
          </div>
        </div>
        {!running && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-800 flex items-center justify-center"
            aria-label={tm('close')}
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex border-b border-gray-100 shrink-0 px-5 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('send')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors ${
            activeTab === 'send'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {tm('msgNotifyBulkTabSend')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('connection')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors ${
            activeTab === 'connection'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {tm('msgNotifyBulkTabConnection')}
        </button>
      </div>

      {activeTab === 'connection' ? (
        <PercentBodyModalScrollBody className="p-5 space-y-4">
          {waConn.provider === 'EMBEDDED' ? (
            <>
              <p className="text-sm text-gray-600">{tm('msgNotifyBulkWaQrHint')}</p>
              <WhatsAppQrConnectPanel
                baseUrl={waConn.baseUrl}
                token={waConn.token}
                enabled={open && activeTab === 'connection'}
                onStatusChange={(status, connected) => {
                  setWaConn((prev) => ({ ...prev, status, connected }));
                }}
              />
            </>
          ) : waConn.provider === 'META' ? (
            <div className="rounded-xl border border-[var(--asin-accent-muted,#D5F0EE)] bg-[var(--asin-accent-muted,#D5F0EE)]/80 p-4 flex gap-3">
              <CheckCircle2 className="text-[var(--asin-accent,#1FA8A0)] shrink-0" size={20} />
              <div className="text-sm text-[var(--asin-primary,#0E2433)] space-y-1">
                <p className="font-bold">{tm('msgNotifyBulkWaMetaTitle')}</p>
                <p>{tm('msgNotifyBulkWaMetaHint')}</p>
                <p className="text-xs text-[var(--asin-accent,#1FA8A0)]">
                  {waConn.connected
                    ? tm('msgNotifyBulkWaMetaOk')
                    : tm('msgNotifyBulkWaMetaMissing')}
                </p>
              </div>
            </div>
          ) : waConn.provider === 'EVOLUTION' ? (
            <div className="rounded-xl border border-[var(--asin-accent-muted,#D5F0EE)] bg-[var(--asin-accent-muted,#D5F0EE)]/80 p-4 flex gap-3">
              <CheckCircle2 className="text-[var(--asin-accent,#1FA8A0)] shrink-0" size={20} />
              <div className="text-sm text-[var(--asin-primary,#0E2433)] space-y-1">
                <p className="font-bold">{tm('msgNotifyBulkWaEvolutionTitle')}</p>
                <p>{tm('msgNotifyBulkWaEvolutionHint')}</p>
                <p className="text-xs text-[var(--asin-accent,#1FA8A0)]">
                  {waConn.connected
                    ? tm('msgNotifyBulkWaEvolutionOk')
                    : tm('msgNotifyBulkWaEvolutionMissing')}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
              <AlertTriangle className="text-amber-600 shrink-0" size={20} />
              <p className="text-sm text-amber-900">{tm('msgNotifyProviderOff')}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => void refreshConnection()}
            disabled={waLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700"
          >
            {waLoading ? <Loader2 size={14} className="animate-spin" /> : null}
            {tm('msgNotifyRefresh')}
          </button>
        </PercentBodyModalScrollBody>
      ) : (
        <>
          <div className="px-5 py-3 border-b border-gray-100 shrink-0 space-y-3 bg-amber-50/60">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                <Languages size={14} className="text-gray-500" />
                {tm('msgNotifyBulkLang')}
                <select
                  value={messageLang}
                  disabled={running || rebuilding || !onRebuildItems}
                  onChange={(e) => void handleLangChange(e.target.value as WhatsAppMessageLang)}
                  className="h-8 rounded-lg border border-gray-200 px-2 text-xs font-bold bg-white"
                >
                  {WHATSAPP_MESSAGE_LANG_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {tm(opt.labelKey)}
                    </option>
                  ))}
                </select>
                {rebuilding ? <Loader2 size={14} className="animate-spin text-gray-400" /> : null}
              </label>
            </div>
            <div className="flex items-start gap-2 text-xs text-amber-900">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p>{tm('msgNotifyBulkSafeHint')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                <Clock size={14} className="text-gray-500" />
                {tm('msgNotifyBulkInterval')}
                <select
                  value={intervalMs}
                  disabled={running}
                  onChange={(e) => setIntervalMs(Number(e.target.value))}
                  className="h-8 rounded-lg border border-gray-200 px-2 text-xs font-bold bg-white"
                >
                  {WHATSAPP_BULK_INTERVAL_OPTIONS_MS.map((ms) => (
                    <option key={ms} value={ms}>
                      {ms / 1000}s
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-[11px] text-gray-500">
                {tm('msgNotifyBulkEstDuration').replace('{sec}', String(estSec))}
              </span>
            </div>
            {running && progress ? (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-semibold text-gray-600">
                  <span>
                    {progress.phase === 'enqueue'
                      ? tm('msgNotifyBulkPhaseEnqueue')
                      : tm('msgNotifyBulkPhaseSend')}
                    {progress.currentName ? ` · ${progress.currentName}` : ''}
                  </span>
                  <span>
                    {progress.done}/{progress.total}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <PercentBodyModalScrollBody className="p-0">
            {localItems.length === 0 ? (
              <p className="text-sm text-gray-500 py-12 text-center px-5">
                {tm('msgNotifyNoRecipients')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/90 text-left text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100 sticky top-0 z-10">
                      <th className="py-2.5 px-3 w-8">#</th>
                      <th className="py-2.5 px-3">{tm('customer')}</th>
                      <th className="py-2.5 px-3">{tm('msgNotifyBulkPhone')}</th>
                      <th className="py-2.5 px-3">{tm('msgNotifyBulkContext')}</th>
                      <th className="py-2.5 px-3">{tm('msgNotifyPreview')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localItems.map((item, idx) => (
                      <tr
                        key={item.id}
                        className="border-b border-gray-50 align-top hover:bg-emerald-50/20"
                      >
                        <td className="py-2.5 px-3 text-gray-400 tabular-nums">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-medium text-gray-800 whitespace-nowrap">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap font-mono text-[11px]">
                          {item.phone}
                        </td>
                        <td className="py-2.5 px-3 text-gray-500 max-w-[8rem] truncate">
                          {item.contextLine ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700 max-w-md">
                          <p className="line-clamp-3 leading-snug">{item.messageText}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PercentBodyModalScrollBody>
        </>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0 bg-gray-50/80">
        {activeTab === 'send' && (
          <>
            {running ? (
              <button
                type="button"
                onClick={handleAbort}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 font-bold px-4 py-2.5 text-sm"
              >
                <Pause size={16} />
                {tm('msgNotifyBulkAbort')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!localItems.length || rebuilding}
                  onClick={() => void handleEnqueueOnly()}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white text-gray-700 font-bold px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  {tm('msgNotifyBulkQueueOnly')}
                </button>
                <button
                  type="button"
                  disabled={!localItems.length || rebuilding}
                  onClick={() => void handleAutoSend()}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  <Play size={16} />
                  {tm('msgNotifyBulkAutoSend')}
                </button>
              </>
            )}
            {running && (
              <span className="inline-flex items-center gap-2 text-sm text-gray-500 ml-2">
                <Loader2 size={16} className="animate-spin" />
                {tm('msgNotifyBulkSending')}
              </span>
            )}
          </>
        )}
        {activeTab === 'connection' && !running && (
          <button
            type="button"
            onClick={() => setActiveTab('send')}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 text-sm"
          >
            {tm('msgNotifyBulkTabBackSend')}
          </button>
        )}
      </div>
    </PercentBodyModal>
  );
}
