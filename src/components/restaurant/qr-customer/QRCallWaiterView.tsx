import React, { useState } from 'react';
import { Bell, HelpCircle, Receipt } from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';
import { qrPublicApi } from './qrPublicApi';

type CallType = 'waiter' | 'bill' | 'help';

export function QRCallWaiterView({ defaultType = 'waiter' as CallType }) {
  const { tenantCode, tableToken, t } = useQrCustomer();
  const [type, setType] = useState<CallType>(defaultType);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!tableToken) {
      setErr(t('noTable'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await qrPublicApi.createRequest(tenantCode, {
        tableToken,
        type,
        note: note.trim() || undefined,
      });
      setDone(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-3 py-16 text-center">
        <Bell className="mx-auto h-12 w-12" style={{ color: 'var(--qr-gold)' }} />
        <p className="rex-qr-display text-xl font-semibold">{t('thanks')}</p>
      </div>
    );
  }

  const options: { id: CallType; label: string; icon: React.ReactNode }[] = [
    { id: 'waiter', label: t('callWaiter'), icon: <Bell className="h-5 w-5" /> },
    { id: 'bill', label: t('requestBill'), icon: <Receipt className="h-5 w-5" /> },
    { id: 'help', label: t('help'), icon: <HelpCircle className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-4">
      <h2 className="rex-qr-display text-2xl font-semibold" style={{ color: 'var(--qr-gold-bright)' }}>
        {t('waiter')}
      </h2>
      <div className="grid gap-2">
        {options.map((o) => {
          const active = type === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setType(o.id)}
              className="rex-qr-press flex items-center gap-3 rounded-2xl px-4 py-3.5"
              style={
                active
                  ? {
                      background: 'rgba(212,165,116,0.15)',
                      border: '1px solid rgba(212,165,116,0.5)',
                      color: 'var(--qr-gold-bright)',
                    }
                  : {
                      background: 'var(--qr-bg-elevated)',
                      border: '1px solid var(--qr-line)',
                      color: 'var(--qr-muted)',
                    }
              }
            >
              {o.icon}
              <span className="font-semibold">{o.label}</span>
            </button>
          );
        })}
      </div>
      <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--qr-muted)' }}>
        {t('note')}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mt-2 w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none"
          style={{
            background: 'var(--qr-bg-elevated)',
            border: '1px solid var(--qr-line)',
            color: 'var(--qr-text)',
          }}
        />
      </label>
      {err && (
        <p className="text-sm" style={{ color: 'var(--qr-danger)' }}>
          {err}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="rex-qr-press w-full rounded-2xl py-3.5 text-base font-bold disabled:opacity-40"
        style={{
          background: 'linear-gradient(135deg, var(--qr-gold) 0%, var(--qr-copper) 100%)',
          color: '#1a120c',
        }}
      >
        {busy ? t('loading') : t('submit')}
      </button>
    </div>
  );
}
