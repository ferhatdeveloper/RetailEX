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
      <div className="text-center py-16 space-y-3">
        <Bell className="w-12 h-12 text-amber-400 mx-auto" />
        <p className="text-lg font-semibold text-slate-100">{t('thanks')}</p>
      </div>
    );
  }

  const options: { id: CallType; label: string; icon: React.ReactNode }[] = [
    { id: 'waiter', label: t('callWaiter'), icon: <Bell className="w-5 h-5" /> },
    { id: 'bill', label: t('requestBill'), icon: <Receipt className="w-5 h-5" /> },
    { id: 'help', label: t('help'), icon: <HelpCircle className="w-5 h-5" /> },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-amber-400">{t('waiter')}</h2>
      <div className="grid gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setType(o.id)}
            className={
              type === o.id
                ? 'flex items-center gap-3 rounded-2xl border border-amber-500/60 bg-amber-500/15 px-4 py-3 text-amber-300'
                : 'flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-300'
            }
          >
            {o.icon}
            <span className="font-semibold">{o.label}</span>
          </button>
        ))}
      </div>
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
