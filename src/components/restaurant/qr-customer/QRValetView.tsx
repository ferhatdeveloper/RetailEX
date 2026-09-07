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
    return <p className="text-slate-500 text-center py-12">{t('error')}</p>;
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
      <div className="text-center py-16 space-y-3">
        <Car className="w-12 h-12 text-amber-400 mx-auto" />
        <p className="text-lg font-semibold">{t('thanks')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-amber-400">{t('valet')}</h2>
      <label className="block text-xs text-slate-400">
        {t('plate')}
        <input
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-lg font-bold tracking-widest uppercase"
          placeholder="34 ABC 123"
        />
      </label>
      <label className="block text-xs text-slate-400">
        {t('note')}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
        />
      </label>
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="w-full py-3 rounded-2xl bg-amber-500 text-slate-950 font-bold disabled:opacity-40"
      >
        {busy ? t('loading') : t('submit')}
      </button>
    </div>
  );
}
