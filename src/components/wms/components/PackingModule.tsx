import { useState, useEffect, useCallback } from 'react';
import { PackageCheck, Plus, RefreshCw, ArrowLeft, X, Boxes } from 'lucide-react';
import { wmsEnterpriseService, type PackingSlip, type PackingCarton } from '../../../services/wmsEnterpriseService';

interface Props {
  darkMode?: boolean;
  onBack?: () => void;
}

export function PackingModule({ darkMode, onBack }: Props) {
  const [slips, setSlips] = useState<PackingSlip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PackingSlip | null>(null);
  const [cartons, setCartons] = useState<PackingCarton[]>([]);
  const [busy, setBusy] = useState(false);
  const [carton, setCarton] = useState({ cartonNo: '', sscc: '', trackingNo: '', weightKg: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSlips(await wmsEnterpriseService.listPackingSlips());
    } catch (e: any) {
      setError(e?.message || 'Paketleme fişleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openSlip = async (s: PackingSlip) => {
    setSelected(s);
    try {
      setCartons(await wmsEnterpriseService.listCartons(s.id));
    } catch {
      setCartons([]);
    }
  };

  const newSlip = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await wmsEnterpriseService.createPackingSlip({});
      await load();
      if (s) await openSlip(s);
    } catch (e: any) {
      setError(e?.message || 'Oluşturulamadı');
    } finally {
      setBusy(false);
    }
  };

  const addCarton = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await wmsEnterpriseService.addCarton(selected.id, {
        cartonNo: carton.cartonNo || `K${(cartons.length + 1).toString().padStart(2, '0')}`,
        sscc: carton.sscc || undefined,
        trackingNo: carton.trackingNo || undefined,
        weightKg: carton.weightKg ? Number(carton.weightKg) : undefined,
      });
      setCarton({ cartonNo: '', sscc: '', trackingNo: '', weightKg: '' });
      setCartons(await wmsEnterpriseService.listCartons(selected.id));
    } catch (e: any) {
      setError(e?.message || 'Koli eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const closeSlip = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await wmsEnterpriseService.setPackingStatus(selected.id, 'packed');
      await load();
      setSelected({ ...selected, status: 'packed' });
    } finally {
      setBusy(false);
    }
  };

  const card = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const text = darkMode ? 'text-gray-100' : 'text-gray-900';
  const inputCls = `border rounded px-2 py-1 text-xs ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'border-gray-300'}`;

  return (
    <div className={`h-full flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="bg-[var(--asin-primary,#0E2433)] text-white px-4 py-3 flex items-center justify-between border-b border-[var(--asin-accent,#1FA8A0)]/35">
        <div className="flex items-center gap-2">
          {onBack && <button onClick={onBack} className="p-1 hover:bg-white/15 rounded"><ArrowLeft className="w-5 h-5" /></button>}
          <PackageCheck className="w-5 h-5" />
          <h2 className="font-bold">Paketleme İstasyonu</h2>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => void load()} className="flex items-center gap-1 px-2 py-1 bg-white/15 hover:bg-white/25 rounded text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
          </button>
          <button onClick={() => void newSlip()} disabled={busy} className="flex items-center gap-1 px-2 py-1 bg-[var(--asin-accent,#1FA8A0)] text-white hover:bg-[#178f88] rounded text-xs font-medium">
            <Plus className="w-3.5 h-3.5" /> Yeni Paket
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {error && <div className="lg:col-span-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded flex justify-between"><span>{error}</span><button onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button></div>}

        <div className={`border rounded ${card}`}>
          <div className={`px-3 py-1.5 text-[11px] ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-indigo-50 text-gray-700'}`}>Paketleme Fişleri</div>
          <table className="w-full text-sm">
            <thead className={darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}>
              <tr className="text-[10px] text-left"><th className="px-2 py-1">PAKET NO</th><th className="px-2 py-1">DURUM</th><th className="px-2 py-1">TARİH</th></tr>
            </thead>
            <tbody>
              {slips.length === 0 && !loading && <tr><td colSpan={3} className={`px-3 py-6 text-center text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Paket yok. "Yeni Paket" ile başlayın.</td></tr>}
              {slips.map((s) => (
                <tr key={s.id} onClick={() => void openSlip(s)} className={`border-t text-xs cursor-pointer ${selected?.id === s.id ? (darkMode ? 'bg-gray-700' : 'bg-indigo-50') : ''} ${darkMode ? 'border-gray-700 hover:bg-gray-700/50' : 'border-gray-100 hover:bg-gray-50'} ${text}`}>
                  <td className="px-2 py-1 font-mono">{s.pack_no}</td>
                  <td className="px-2 py-1"><span className={`px-1.5 py-0.5 rounded text-[9px] ${s.status === 'packed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>{s.status}</span></td>
                  <td className="px-2 py-1">{String(s.created_at || '').slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={`border rounded ${card}`}>
          <div className={`px-3 py-1.5 text-[11px] flex items-center justify-between ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-indigo-50 text-gray-700'}`}>
            <span>Koliler {selected ? `· ${selected.pack_no}` : ''}</span>
            {selected && selected.status !== 'packed' && (
              <button onClick={() => void closeSlip()} disabled={busy} className="text-[10px] px-2 py-0.5 bg-green-600 text-white rounded">Paketi Kapat</button>
            )}
          </div>
          {!selected ? (
            <p className={`p-4 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Soldan bir paket seçin.</p>
          ) : (
            <div className="p-3 space-y-3">
              <div className="flex flex-wrap gap-1.5 items-end">
                <input className={`${inputCls} w-16`} placeholder="Koli" value={carton.cartonNo} onChange={(e) => setCarton({ ...carton, cartonNo: e.target.value })} />
                <input className={`${inputCls} w-28`} placeholder="SSCC" value={carton.sscc} onChange={(e) => setCarton({ ...carton, sscc: e.target.value })} />
                <input className={`${inputCls} w-28`} placeholder="Takip No" value={carton.trackingNo} onChange={(e) => setCarton({ ...carton, trackingNo: e.target.value })} />
                <input className={`${inputCls} w-16`} placeholder="Kg" type="number" value={carton.weightKg} onChange={(e) => setCarton({ ...carton, weightKg: e.target.value })} />
                <button onClick={() => void addCarton()} disabled={busy || selected.status === 'packed'} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs flex items-center gap-1 disabled:opacity-50"><Plus className="w-3 h-3" />Koli</button>
              </div>
              <table className="w-full text-sm">
                <thead className={darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}>
                  <tr className="text-[10px] text-left"><th className="px-2 py-1">KOLİ</th><th className="px-2 py-1">SSCC</th><th className="px-2 py-1">TAKİP</th><th className="px-2 py-1 text-right">KG</th></tr>
                </thead>
                <tbody>
                  {cartons.length === 0 && <tr><td colSpan={4} className={`px-3 py-4 text-center text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Koli yok.</td></tr>}
                  {cartons.map((c) => (
                    <tr key={c.id} className={`border-t text-xs ${darkMode ? 'border-gray-700' : 'border-gray-100'} ${text}`}>
                      <td className="px-2 py-1 font-mono">{c.carton_no || '—'}</td>
                      <td className="px-2 py-1 font-mono text-[10px]">{c.sscc || '—'}</td>
                      <td className="px-2 py-1 font-mono text-[10px]">{c.tracking_no || '—'}</td>
                      <td className="px-2 py-1 text-right">{c.weight_kg ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-1 text-[10px] text-gray-500"><Boxes className="w-3 h-3" /> {cartons.length} koli</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PackingModule;
