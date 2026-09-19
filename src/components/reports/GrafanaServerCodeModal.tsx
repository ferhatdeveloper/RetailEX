import { useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import { connectGrafanaWithServerCode } from '../../services/grafanaDatasourceService';

type Props = {
  open: boolean;
  reason?: string | null;
  onClose: () => void;
  onConnected: (info: { serverCode: string; database: string }) => void;
};

/**
 * Server kodu çözülemediğinde Grafana DB bağlantısı için sorulur.
 * “Kiracı” ifadesi kullanılmaz — “Server kodu”.
 */
export function GrafanaServerCodeModal({ open, reason, onClose, onConnected }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await connectGrafanaWithServerCode(code);
    setBusy(false);
    if (result.ok) {
      onConnected({ serverCode: result.serverCode, database: result.database });
      onClose();
      return;
    }
    setError(result.reason);
  };

  return (
    <PercentBodyModal onClose={onClose} size="compact" ariaLabel="Server kodu">
      <div className="bg-gradient-to-r from-teal-600 to-cyan-700 px-6 py-5 text-white shrink-0">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 shrink-0" />
          <div>
            <h2 className="text-lg font-bold">Server kodu gerekli</h2>
            <p className="text-sm text-teal-100 mt-0.5">
              Grafana raporları için veritabanı bağlantısı
            </p>
          </div>
        </div>
      </div>
      <PercentBodyModalScrollBody className="p-6 space-y-4">
        {reason && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            {reason}
          </p>
        )}
        <div>
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
            Server kodu
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="örn. guzel"
            autoFocus
            className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:border-teal-400 outline-none text-slate-800 font-medium"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </PercentBodyModalScrollBody>
      <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex gap-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider py-3 hover:bg-slate-100"
        >
          İptal
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !code.trim()}
          className="flex-1 rounded-2xl bg-teal-600 text-white font-bold uppercase text-sm tracking-wider py-3 shadow-lg shadow-teal-200/50 hover:bg-teal-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Bağlan
        </button>
      </div>
    </PercentBodyModal>
  );
}
