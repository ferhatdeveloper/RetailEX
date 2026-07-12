/**
 * Baileys köprüsü — WhatsApp QR ile cihaz bağlama paneli (backoffice / klinik).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCheck, Loader2, QrCode, RefreshCw, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { getEmbeddedBridgeStatus, type EmbeddedBridgeStatus } from '../../services/messaging/whatsappEmbeddedBridge';
import { useTheme } from '../../contexts/ThemeContext';
import { WhatsAppSessionResetButton } from './WhatsAppSessionResetButton';

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

  const applyResetResult = useCallback(
    async (result: { status?: string; qr?: string | null }) => {
      setError(null);
      if (result.status) {
        setStatus(result.status);
        onStatusChangeRef.current?.(result.status, result.status === 'connected');
      }
      if (result.qr) {
        if (result.qr.startsWith('data:')) setQrImg(result.qr);
        else {
          try {
            const QRCode = (await import('qrcode')).default;
            setQrImg(await QRCode.toDataURL(result.qr, { margin: 2, width: 280 }));
          } catch {
            setQrImg(null);
          }
        }
      } else {
        setQrImg(null);
        await refresh();
      }
    },
    [refresh]
  );

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

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const heading = darkMode ? 'text-white' : 'text-gray-900';

  return (
    <div className={`overflow-hidden rounded-xl border ${cardBg} ${className}`}>
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 ${
          darkMode ? 'border-gray-700' : 'border-gray-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              darkMode ? 'bg-gray-900 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            <QrCode className="h-4 w-4" />
          </div>
          <div>
            <p className={`text-sm font-semibold ${heading}`}>Telefon ile bağlan</p>
            <p className={`text-xs ${muted}`}>WhatsApp → Bağlı cihazlar → QR okut</p>
          </div>
        </div>
        <StatusBadge status={status} connected={connected} polling={polling} darkMode={darkMode} />
      </div>

      <div className="grid gap-6 p-4 lg:grid-cols-[1fr_280px] lg:items-center">
        <div className="space-y-4">
          <ol className="grid gap-2 sm:grid-cols-3 text-sm">
            {[
              'WhatsApp uygulamasını açın',
              'Ayarlar → Bağlı cihazlar',
              'QR kodu kamerayla okutun',
            ].map((step, i) => (
              <li
                key={step}
                className={`flex gap-2 rounded-lg border p-3 ${
                  darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                    darkMode ? 'bg-emerald-900/50 text-emerald-300' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
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
              disabled={polling || !baseUrl.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {polling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              QR yenile
            </button>
            <WhatsAppSessionResetButton
              baseUrl={baseUrl}
              token={token}
              variant="destructive"
              disabled={!enabled || polling || !baseUrl.trim()}
              onResetComplete={(r) => void applyResetResult(r)}
            />
            {baseUrl.trim() && (
              <span className={`text-xs ${muted}`}>
                Köprü: <code className={`rounded px-1.5 py-0.5 font-mono ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>{baseUrl}</code>
              </span>
            )}
          </div>

          {error && (
            <div
              className={`flex gap-2 rounded-lg border p-3 text-sm ${
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

        <div className="flex flex-col items-center mx-auto w-full max-w-[280px]">
          <div
            className={`relative flex aspect-square w-full items-center justify-center rounded-xl border p-4 transition-colors ${
              connected
                ? darkMode
                  ? 'border-emerald-700 bg-emerald-950/30'
                  : 'border-emerald-300 bg-emerald-50'
                : qrImg
                  ? darkMode
                    ? 'border-gray-600 bg-gray-900'
                    : 'border-gray-200 bg-white'
                  : darkMode
                    ? 'border-dashed border-gray-600 bg-gray-900/50'
                    : 'border-dashed border-gray-300 bg-gray-50'
            }`}
          >
            {connected ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${
                    darkMode ? 'bg-emerald-900/50' : 'bg-emerald-100'
                  }`}
                >
                  <CheckCheck className="h-8 w-8 text-emerald-600" />
                </div>
                <p className={`font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>Bağlandı</p>
                <p className={`text-xs ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>Mesaj göndermeye hazır</p>
              </div>
            ) : qrImg ? (
              <img src={qrImg} alt="WhatsApp QR" className="h-full w-full rounded-lg object-contain" />
            ) : polling ? (
              <div className={`flex flex-col items-center gap-3 ${muted}`}>
                <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                <p className="text-sm font-medium">QR hazırlanıyor…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 px-2 text-center">
                <Smartphone className={`h-12 w-12 ${muted}`} />
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
  const base = 'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold';
  if (polling && !status) {
    return (
      <span
        className={`${base} ${
          darkMode ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-200 bg-gray-100 text-gray-700'
        }`}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Kontrol ediliyor…
      </span>
    );
  }
  if (connected) {
    return (
      <span
        className={`${base} ${
          darkMode
            ? 'border-emerald-800 bg-emerald-900/50 text-emerald-300'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}
      >
        <Wifi className="h-3.5 w-3.5" />
        Bağlı
      </span>
    );
  }
  if (status === 'scanning') {
    return (
      <span
        className={`${base} ${
          darkMode
            ? 'border-amber-800 bg-amber-900/40 text-amber-200'
            : 'border-amber-200 bg-amber-50 text-amber-900'
        }`}
      >
        <QrCode className="h-3.5 w-3.5" />
        QR bekleniyor
      </span>
    );
  }
  if (status === 'disconnected') {
    return (
      <span
        className={`${base} ${
          darkMode ? 'border-gray-600 bg-gray-700 text-gray-300' : 'border-gray-200 bg-gray-100 text-gray-600'
        }`}
      >
        <WifiOff className="h-3.5 w-3.5" />
        Bağlı değil
      </span>
    );
  }
  return (
    <span
      className={`${base} ${
        darkMode ? 'border-gray-600 bg-gray-700 text-gray-300' : 'border-gray-200 bg-gray-100 text-gray-600'
      }`}
    >
      {status || '—'}
    </span>
  );
}
