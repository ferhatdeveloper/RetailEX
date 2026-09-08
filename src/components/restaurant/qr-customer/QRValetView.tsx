import React, { useState } from 'react';
import { Car } from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';
import { qrPublicApi } from './qrPublicApi';

export function QRValetView() {
  const { tenantCode, tableToken, t, settings } = useQrCustomer();
  const [plate, setPlate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (settings?.valet_enabled === false) {
    return (
      <p className="py-12 text-center" style={{ color: 'var(--qr-muted)' }}>
        {t('error')}
      </p>
    );
  }

  const submit = async () => {
    if (!tableToken) {
      setErr(t('noTable'));
      return;
    }
    if (!plate.trim()) {
      setErr(t('plate'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await qrPublicApi.createRequest(tenantCode, {
        tableToken,
        type: 'valet',
        note: note.trim() || undefined,
        plateNumber: plate.trim().toLocaleUpperCase('tr-TR'),
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
        <Car className="mx-auto h-12 w-12" style={{ color: 'var(--qr-gold)' }} />
        <p className="rex-qr-display text-xl font-semibold">{t('thanks')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="rex-qr-display text-2xl font-semibold" style={{ color: 'var(--qr-gold-bright)' }}>
        {t('valet')}
      </h2>
      <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--qr-muted)' }}>
        {t('plate')}
        <input
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          className="mt-2 w-full rounded-2xl px-4 py-3.5 text-lg font-bold uppercase tracking-widest outline-none"
          style={{
            background: 'var(--qr-bg-elevated)',
            border: '1px solid var(--qr-line)',
            color: 'var(--qr-text)',
          }}
          placeholder="34 ABC 123"
        />
      </label>
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
        className="rex-qr-press w-full rounded-2xl py-3.5 font-bold disabled:opacity-40"
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
