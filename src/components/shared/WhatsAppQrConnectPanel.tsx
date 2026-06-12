/**
 * Baileys köprüsü — WhatsApp QR ile cihaz bağlama paneli (backoffice / klinik).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCheck, Loader2, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { getEmbeddedBridgeStatus, type EmbeddedBridgeStatus } from '../../services/messaging/whatsappEmbeddedBridge';

export interface WhatsAppQrConnectPanelProps {
  baseUrl: string;
  token?: string | null;
  /** Köprü yoklanmasını aç/kapat */
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
      setError('Köprü URL girin (ör. http://127.0.0.1:3000 veya /__wa_bridge).');
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
    const id = window.setInterval(tick, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, baseUrl, token, pollIntervalMs, refresh]);

  const connected = status === 'connected';
  const scanning = status === 'scanning' || (!connected && !!qrImg);

  return (
    <div
      className={`rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white">
        <QrCode className="w-5 h-5 shrink-0" />
        <div>
          <p className="font-semibold text-sm">QR ile WhatsApp bağlantısı</p>
          <p className="text-[11px] text-emerald-100">Telefondan okutun — Baileys köprüsü</p>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-[1fr,min(280px,100%)] sm:items-start">
        <div className="space-y-3 text-sm text-gray-700">
          <p className="font-medium text-emerald-900">Bağlantı adımları</p>
          <ol className="space-y-2 list-none">
            <li className="flex gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                1
              </span>
              <span>
                Telefonda <strong>WhatsApp</strong> uygulamasını açın
              </span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                2
              </span>
              <span>
                <strong>Ayarlar → Bağlı cihazlar → Cihaz bağla</strong>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                3
              </span>
              <span>Sağdaki <strong>QR kodu telefon kamerasıyla okutun</strong></span>
            </li>
          </ol>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-gray-500">Durum:</span>
            <StatusBadge status={status} connected={connected} polling={polling} />
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={polling || !baseUrl.trim()}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
            >
              {polling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              QR yenile
            </button>
          </div>
          {error && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2">{error}</p>
          )}
          <p className="text-[11px] text-gray-500">
            Köprü: <code className="bg-gray-100 px-1 rounded">npm run whatsapp:bridge</code>
            {' · '}
            Canlıda aynı sunucuda köprü için URL: <code className="bg-gray-100 px-1 rounded">/__wa_bridge</code>
          </p>
        </div>

        <div className="flex flex-col items-center justify-center mx-auto w-full max-w-[300px]">
          <div
            className={`relative flex aspect-square w-full max-w-[280px] items-center justify-center rounded-2xl border-2 border-dashed p-3 shadow-inner ${
              connected
                ? 'border-green-400 bg-green-50'
                : scanning && qrImg
                  ? 'border-emerald-300 bg-white'
                  : 'border-gray-300 bg-gray-50'
            }`}
          >
            {connected ? (
              <div className="flex flex-col items-center gap-2 text-center px-4">
                <CheckCheck className="w-14 h-14 text-green-600" />
                <p className="font-semibold text-green-800">Bağlandı</p>
                <p className="text-xs text-green-700">WhatsApp oturumu aktif</p>
              </div>
            ) : qrImg ? (
              <img
                src={qrImg}
                alt="WhatsApp bağlantı QR kodu"
                className="w-full h-full object-contain rounded-lg"
              />
            ) : polling ? (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
                <p className="text-xs">QR hazırlanıyor…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center text-gray-400 px-3">
                <Smartphone className="w-12 h-12 opacity-50" />
                <p className="text-xs">
                  {error ? 'Köprüye ulaşılamadı' : 'QR bekleniyor — köprüyü başlatın'}
                </p>
              </div>
            )}
          </div>
          {!connected && qrImg && (
            <p className="mt-2 text-center text-[11px] text-gray-500 max-w-[280px]">
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
}: {
  status: string;
  connected: boolean;
  polling: boolean;
}) {
  if (polling && !status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        <Loader2 className="w-3 h-3 animate-spin" />
        Kontrol…
      </span>
    );
  }
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
        <CheckCheck className="w-3 h-3" />
        Bağlı
      </span>
    );
  }
  if (status === 'scanning') {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
        QR okutun
      </span>
    );
  }
  if (status === 'disconnected') {
    return (
      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
        Bağlı değil
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      {status || '—'}
    </span>
  );
}
