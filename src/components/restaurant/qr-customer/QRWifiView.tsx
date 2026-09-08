import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';

export function QRWifiView() {
  const { settings, t } = useQrCustomer();
  const [copied, setCopied] = useState<'ssid' | 'pass' | null>(null);

  const ssid = settings?.wifi_ssid || '—';
  const password = settings?.wifi_password || '—';

  const copy = async (kind: 'ssid' | 'pass', value: string) => {
    if (!value || value === '—') return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="rex-qr-display text-2xl font-semibold" style={{ color: 'var(--qr-gold-bright)' }}>
        {t('wifi')}
      </h2>
      <div
        className="space-y-4 rounded-3xl p-5"
        style={{
          background: 'var(--qr-bg-elevated)',
          border: '1px solid var(--qr-line)',
        }}
      >
        <Row
          label={t('ssid')}
          value={ssid}
          onCopy={() => void copy('ssid', ssid)}
          copied={copied === 'ssid'}
          copyLabel={t('copy')}
        />
        <Row
          label={t('password')}
          value={password}
          onCopy={() => void copy('pass', password)}
          copied={copied === 'pass'}
          copyLabel={t('copy')}
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  onCopy,
  copied,
  copyLabel,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  copyLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--qr-muted)' }}>
          {label}
        </p>
        <p className="truncate font-mono text-lg" style={{ color: 'var(--qr-text)' }}>
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="rex-qr-press flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
        style={{
          background: 'var(--qr-bg)',
          border: '1px solid var(--qr-line)',
          color: 'var(--qr-gold)',
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copyLabel}
      </button>
    </div>
  );
}
