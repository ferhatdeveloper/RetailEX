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
      <h2 className="text-xl font-bold text-amber-400">{t('wifi')}</h2>
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
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
        <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="font-mono text-lg text-slate-100 truncate">{value}</p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-amber-400"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copyLabel}
      </button>
    </div>
  );
}
