/**
 * WhatsApp test mesajı — numara + metin + gönder.
 */
import React from 'react';
import { Loader2, Phone, Send } from 'lucide-react';
import { normalizePhoneDigits } from '../../services/messaging/clinicMessaging';
import { useTheme } from '../../contexts/ThemeContext';

export interface WhatsAppTestSendCardProps {
  provider: string;
  embedConnected: boolean;
  testPhone: string;
  testMessage: string;
  testSending: boolean;
  onPhoneChange: (v: string) => void;
  onMessageChange: (v: string) => void;
  onSend: () => void;
  className?: string;
}

export function WhatsAppTestSendCard({
  provider,
  embedConnected,
  testPhone,
  testMessage,
  testSending,
  onPhoneChange,
  onMessageChange,
  onSend,
  className = '',
}: WhatsAppTestSendCardProps) {
  const { darkMode } = useTheme();
  const panel = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const inputCls = darkMode
    ? 'w-full rounded-lg border border-gray-600 bg-gray-900 text-gray-100 p-2.5 text-sm focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500'
    : 'w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';
  const labelCls = darkMode ? 'text-xs font-medium text-gray-400' : 'text-xs font-medium text-gray-500';

  const providerActive = provider !== 'NONE';
  const needsQr = provider === 'EMBEDDED' && !embedConnected;
  const canSend = providerActive && testPhone.trim() && testMessage.trim() && !testSending;

  return (
    <section className={`rounded-xl border p-4 ${panel} ${className}`}>
      <h2 className={`mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
        <Send className="h-4 w-4 text-emerald-600" />
        Test mesajı
      </h2>
      <p className={`mb-4 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        {!providerActive
          ? 'Önce yukarıdan bir bağlantı yöntemi seçin (ör. QR Bağlantı).'
          : needsQr
            ? 'Numarayı yazabilirsiniz; göndermek için önce QR ile WhatsApp bağlantısı kurun.'
            : 'Numara ve mesajı yazıp test gönderin.'}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(200px,1fr)_1fr_auto] lg:items-end">
        <div>
          <label className={labelCls}>Alıcı telefon</label>
          <div className="relative mt-1">
            <Phone className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              className={`${inputCls} pl-10 font-mono`}
              placeholder="905551234567"
              value={testPhone}
              onChange={(e) => onPhoneChange(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              disabled={!providerActive}
            />
          </div>
          {testPhone.trim() && (
            <p className={`mt-1 text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {normalizePhoneDigits(testPhone)}
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Mesaj</label>
          <input
            className={`${inputCls} mt-1`}
            value={testMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="Test mesajınız…"
            disabled={!providerActive}
          />
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="inline-flex h-[42px] min-w-[11rem] shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {testSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Gönder
        </button>
      </div>
    </section>
  );
}
