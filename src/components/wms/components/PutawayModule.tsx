import { useState, useEffect, useCallback } from 'react';
import { ArrowDownToLine, RefreshCw, ArrowLeft, Check, X, PackagePlus } from 'lucide-react';
import { wmsEnterpriseService, type PutawayTask, type WmsBin } from '../../../services/wmsEnterpriseService';

interface Props {
  darkMode?: boolean;
  onBack?: () => void;
}

export function PutawayModule({ darkMode, onBack }: Props) {
  const [tasks, setTasks] = useState<PutawayTask[]>([]);
  const [bins, setBins] = useState<WmsBin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [selectedBin, setSelectedBin] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showGen, setShowGen] = useState(false);
  const [receiving, setReceiving] = useState<Array<{ id: string; slip_no: string; supplier_name?: string; status?: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, b] = await Promise.all([
        wmsEnterpriseService.listPutawayTasks(statusFilter),
        wmsEnterpriseService.listBins(),
      ]);
      setTasks(t);
      setBins(b.filter((x) => (x.bin_type || 'storage') !== 'receiving'));
    } catch (e: any) {
      setError(e?.message || 'Görevler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const complete = async (task: PutawayTask) => {
    const binId = selectedBin[task.id] || task.suggested_bin_id;
    if (!binId) {
      setError('Hedef bin seçin');
      return;
    }
    setBusyId(task.id);
    setError(null);
    try {
      await wmsEnterpriseService.completePutaway(task.id, binId, { storeId: task.store_id ?? null });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Tamamlanamadı');
    } finally {
      setBusyId(null);
    }
  };

  const card = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const text = darkMode ? 'text-gray-100' : 'text-gray-900';

  return (
    <div className={`h-full flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="p-1 hover:bg-white/15 rounded"><ArrowLeft className="w-5 h-5" /></button>
          )}
          <ArrowDownToLine className="w-5 h-5" />
          <h2 className="font-bold">Yerleştirme (Putaway)</h2>
        </div>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs rounded px-2 py-1 text-gray-800">
            <option value="open">Açık</option>
            <option value="done">Tamamlanan</option>
            <option value="all">Tümü</option>
          </select>
          <button
            onClick={async () => { setShowGen(true); try { setReceiving(await wmsEnterpriseService.listReceivingForPutaway()); } catch { setReceiving([]); } }}
            className="flex items-center gap-1 px-2 py-1 bg-white text-green-700 hover:bg-green-50 rounded text-xs font-medium"
          >
            <PackagePlus className="w-3.5 h-3.5" /> Mal Kabulden Üret
          </button>
          <button onClick={() => void load()} className="flex items-center gap-1 px-2 py-1 bg-white/15 hover:bg-white/25 rounded text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <div className={`border rounded ${card}`}>
          <table className="w-full text-sm">
            <thead className={darkMode ? 'bg-gray-700' : 'bg-green-50'}>
              <tr className="text-[11px] text-left">
                <th className="px-2 py-1.5">ÜRÜN</th><th className="px-2 py-1.5">LOT</th>
                <th className="px-2 py-1.5">SKT</th><th className="px-2 py-1.5 text-right">MİKTAR</th>
                <th className="px-2 py-1.5">HEDEF BİN</th><th className="px-2 py-1.5">DURUM</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && !loading && (
                <tr><td colSpan={7} className={`px-3 py-6 text-center text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Putaway görevi yok. Mal kabulden görev üretin.</td></tr>
              )}
              {tasks.map((t) => (
                <tr key={t.id} className={`border-t text-xs ${darkMode ? 'border-gray-700' : 'border-gray-100'} ${text}`}>
                  <td className="px-2 py-1">{t.product_name || t.product_code || '—'}</td>
                  <td className="px-2 py-1">{t.lot_no || '—'}</td>
                  <td className="px-2 py-1">{t.expiry_date ? String(t.expiry_date).slice(0, 10) : '—'}</td>
                  <td className="px-2 py-1 text-right font-semibold">{Number(t.qty).toLocaleString('tr-TR')}</td>
                  <td className="px-2 py-1">
                    {t.status === 'done' ? (
                      <span className="text-gray-500">{t.to_bin_id ? 'Yerleşti' : '—'}</span>
                    ) : (
                      <select
                        value={selectedBin[t.id] || t.suggested_bin_id || ''}
                        onChange={(e) => setSelectedBin({ ...selectedBin, [t.id]: e.target.value })}
                        className="border border-gray-300 rounded px-1.5 py-1 text-[11px] text-gray-800"
                      >
                        <option value="">Bin seç…</option>
                        {bins.map((b) => (
                          <option key={b.id} value={b.id}>{b.code}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] ${t.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                      {t.status === 'done' ? 'Tamamlandı' : 'Açık'}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right">
                    {t.status !== 'done' && (
                      <button
                        onClick={() => void complete(t)}
                        disabled={busyId === t.id}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-[10px] disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" /> {busyId === t.id ? '…' : 'Yerleştir'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showGen && (
        <div className="fixed inset-0 bg-black/50 z-[2147483646] flex items-center justify-center p-4" onClick={() => setShowGen(false)}>
          <div className={`w-full max-w-lg rounded-xl overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-semibold text-sm">Mal Kabulden Putaway Üret</h3>
              <button onClick={() => setShowGen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 max-h-[60vh] overflow-auto">
              {receiving.length === 0 ? (
                <p className={`text-xs p-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Mal kabul fişi yok.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}><tr className="text-[10px] text-left"><th className="px-2 py-1">FİŞ</th><th className="px-2 py-1">TEDARİKÇİ</th><th className="px-2 py-1"></th></tr></thead>
                  <tbody>
                    {receiving.map((r) => (
                      <tr key={r.id} className={`border-t text-xs ${darkMode ? 'border-gray-700' : 'border-gray-100'} ${text}`}>
                        <td className="px-2 py-1 font-mono">{r.slip_no}</td>
                        <td className="px-2 py-1">{r.supplier_name || '—'}</td>
                        <td className="px-2 py-1 text-right">
                          <button
                            onClick={async () => {
                              setBusyId(r.id);
                              try {
                                const n = await wmsEnterpriseService.createPutawayFromReceiving(r.id);
                                setShowGen(false);
                                await load();
                                if (n === 0) setError('Bu fişte satır yok veya görev üretilmedi');
                              } catch (e: any) {
                                setError(e?.message || 'Üretilemedi');
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            disabled={busyId === r.id}
                            className="px-2 py-1 bg-green-600 text-white rounded text-[10px] disabled:opacity-50"
                          >
                            {busyId === r.id ? '…' : 'Üret'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PutawayModule;
