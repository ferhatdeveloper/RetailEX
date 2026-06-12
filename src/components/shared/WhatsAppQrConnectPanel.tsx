/**
 * Baileys köprüsü — WhatsApp QR ile cihaz bağlama paneli (backoffice / klinik).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCheck, Loader2, QrCode, RefreshCw, Smartphone, Wifi, WifiOff } from 'lucide-react';
import {
  getEmbeddedBridgeStatus,
  resetEmbeddedBridgeSession,
  type EmbeddedBridgeStatus,
} from '../../services/messaging/whatsappEmbeddedBridge';
import { useTheme } from '../../contexts/ThemeContext';

export interface WhatsAppQrConnectPanelProps {
  baseUrl: string;
  token?: string | null;
  enabled?: boolean;
  pollIntervalMs?: number;
  className?: string;
  onStatusChange?: (status: string, connected: boolean) => void;
}

export function WhatsAppQrConnectPanel({
  baseUrl,
  token,
  enabled = true,
  pollIntervalMs = 4000,
  className = '',
  onStatusChange,
}: WhatsAppQrConnectPanelProps) {
  const { darkMode } = useTheme();
  const [status, setStatus] = useState<EmbeddedBridgeStatus | ''>('');
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const refresh = useCallback(async () => {
    const url = baseUrl.trim();
    if (!url) {
      setStatus('');
      setQrImg(null);
      setError('Köprü URL girin (canlıda /__wa_bridge).');
      return;
    }
    setPolling(true);
    try {
      const r = await getEmbeddedBridgeStatus({
        whatsapp_base_url: url,
        whatsapp_token: token ?? null,
      });
      if (r.ok) {
        const nextStatus = String(r.status ?? '');
        setStatus(nextStatus);
        onStatusChangeRef.current?.(nextStatus, nextStatus === 'connected');
        setError(null);
        const qr = r.qr ?? null;
        if (!qr) {
          setQrImg(null);
          return;
        }
        if (qr.startsWith('data:')) {
          setQrImg(qr);
          return;
        }
        try {
          const QRCode = (await import('qrcode')).default;
          setQrImg(await QRCode.toDataURL(qr, { margin: 2, width: 280 }));
        } catch {
          setQrImg(null);
        }
      } else {
        setError(r.error ?? 'Köprü yanıt vermedi');
        setQrImg(null);
      }
    } finally {
      setPolling(false);
    }
  }, [baseUrl, token]);

  const handleReset = useCallback(async () => {
    const url = baseUrl.trim();
    if (!url) return;
    setResetting(true);
    try {
      const r = await resetEmbeddedBridgeSession({
        whatsapp_base_url: url,
        whatsapp_token: token ?? null,
      });
      if (r.ok) {
        setError(null);
        if (r.status) {
          setStatus(r.status);
          onStatusChangeRef.current?.(r.status, r.status === 'connected');
        }
        if (r.qr) {
          if (r.qr.startsWith('data:')) setQrImg(r.qr);
          else {
            try {
              const QRCode = (await import('qrcode')).default;
              setQrImg(await QRCode.toDataURL(r.qr, { margin: 2, width: 280 }));
            } catch {
              setQrImg(null);
            }
          }
        } else {
          await refresh();
        }
      } else {
        setError(r.error ?? 'Oturum sıfırlanamadı');
      }
    } finally {
      setResetting(false);
    }
  }, [baseUrl, token, refresh]);

  useEffect(() => {
    if (!enabled || !baseUrl.trim()) {
      setStatus('');
      setQrImg(null);
      setError(enabled ? 'Köprü URL girin.' : null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refresh();
    };
    void tick();
    const interval = status === 'connected' ? pollIntervalMs : Math.min(pollIntervalMs, 2500);
    const id = window.setInterval(tick, interval);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, baseUrl, token, pollIntervalMs, refresh, status]);

  const connected = status === 'connected';
  const scanning = status === 'scanning' || (!connected && !!qrImg);
  const waitingQr = status === 'disconnected' && !qrImg && !error;

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-emerald-100';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${cardBg} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-gradient-to-r from-[#075E54] to-[#128C7E] text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold">Telefon ile bağlan</p>
            <p className="text-xs text-emerald-100/90">WhatsApp → Bağlı cihazlar → QR okut</p>
          </div>
        </div>
        <StatusBadge status={status} connected={connected} polling={polling} darkMode={darkMode} />
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_300px] lg:items-center">
        <div className="space-y-4">
          <ol className="grid gap-3 sm:grid-cols-3 text-sm">
            {[
              'WhatsApp uygulamasını açın',
              'Ayarlar → Bağlı cihazlar',
              'QR kodu kamerayla okutun',
            ].map((step, i) => (
              <li
                key={step}
                className={`flex gap-2 rounded-xl border p-3 ${
                  darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-gray-100 bg-gray-50'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#25D366] text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className={darkMode ? 'text-gray-200' : 'text-gray-700'}>{step}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={polling || resetting || !baseUrl.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#1da851] disabled:opacity-50"
            >
              {polling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              QR yenile
            </button>
            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={polling || resetting || !baseUrl.trim()}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                darkMode
                  ? 'border-gray-600 text-gray-200 hover:bg-gray-800'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              Yeni QR oluştur
            </button>
            {baseUrl.trim() && (
              <span className={`text-xs ${muted}`}>
                Köprü: <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono">{baseUrl}</code>
              </span>
            )}
          </div>

          {error && (
            <div
              className={`flex gap-2 rounded-xl border p-3 text-sm ${
                darkMode ? 'border-amber-800 bg-amber-950/40 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Bağlantı kurulamadı</p>
                <p className="text-xs mt-1 opacity-90">{error}</p>
                {(error.includes('fetch') || baseUrl.includes('trycloudflare') || baseUrl.startsWith('http')) && (
                  <p className="text-xs mt-2">
                    Canlı ortamda köprü URL olarak <strong>/__wa_bridge</strong> kullanın ve üstteki{' '}
                    <strong>Kaydet</strong> butonuna basın.
                  </p>
                )}
              </div>
            </div>
          )}

          {waitingQr && !polling && (
            <p className={`text-sm ${muted}`}>
              Köprü hazır — QR kod birkaç saniye içinde görünecek. Görünmezse <strong>QR yenile</strong>ye basın.
            </p>
          )}
        </div>

        <div className="flex flex-col items-center mx-auto w-full max-w-[300px]">
          <div
            className={`relative flex aspect-square w-full items-center justify-center rounded-2xl border-2 p-4 transition-colors ${
              connected
                ? 'border-green-400 bg-green-50 dark:bg-green-950/30'
                : qrImg
                  ? 'border-[#25D366] bg-white dark:bg-gray-900'
                  : darkMode
                    ? 'border-gray-600 border-dashed bg-gray-900/50'
                    : 'border-gray-200 border-dashed bg-gray-50'
            }`}
          >
            {connected ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                  <CheckCheck className="w-9 h-9 text-green-600" />
                </div>
                <p className="font-semibold text-green-800 dark:text-green-300">Bağlandı</p>
                <p className="text-xs text-green-700 dark:text-green-400">Mesaj göndermeye hazır</p>
              </div>
            ) : qrImg ? (
              <img src={qrImg} alt="WhatsApp QR" className="w-full h-full object-contain rounded-lg" />
            ) : polling ? (
              <div className="flex flex-col items-center gap-3 text-gray-500">
                <Loader2 className="w-12 h-12 animate-spin text-[#25D366]" />
                <p className="text-sm font-medium">QR hazırlanıyor…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center px-2">
                <Smartphone className={`w-14 h-14 ${muted}`} />
                <p className={`text-sm ${muted}`}>
                  {error ? 'Önce köprü ayarını düzeltin' : 'QR kod burada görünecek'}
                </p>
              </div>
            )}
          </div>
          {scanning && qrImg && (
            <p className={`mt-3 text-center text-xs ${muted}`}>
              QR süresi dolarsa <strong>QR yenile</strong> ile güncelleyin
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  connected,
  polling,
  darkMode,
}: {
  status: string;
  connected: boolean;
  polling: boolean;
  darkMode: boolean;
}) {
  if (polling && !status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Kontrol ediliyor…
      </span>
    );
  }
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
        <Wifi className="w-3.5 h-3.5" />
        Bağlı
      </span>
    );
  }
  if (status === 'scanning') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/90 px-3 py-1 text-xs font-bold text-amber-950">
        <QrCode className="w-3.5 h-3.5" />
        QR bekleniyor
      </span>
    );
  }
  if (status === 'disconnected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
        <WifiOff className="w-3.5 h-3.5" />
        Bağlı değil
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${darkMode ? 'bg-gray-700' : 'bg-white/15'}`}>
      {status || '—'}
    </span>
  );
}
