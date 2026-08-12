import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Plus, RefreshCw, ArrowLeft, X, Check, Trash2 } from 'lucide-react';
import { wmsEnterpriseService, type StockAdjustment, type WmsBin } from '../../../services/wmsEnterpriseService';

interface Props {
  darkMode?: boolean;
  onBack?: () => void;
}

interface DraftLine {
  productCode: string;
  productName: string;
  binId: string;
  lotNo: string;
  expiryDate: string;
  qtyDelta: string;
}

const REASONS = [
  { code: 'fire', label: 'Fire / Zayi' },
  { code: 'damage', label: 'Hasar' },
  { code: 'loss', label: 'Kayıp' },
  { code: 'expiry', label: 'SKT Geçti' },
  { code: 'found', label: 'Fazla Bulundu' },
  { code: 'correction', label: 'Düzeltme' },
];

export function StockAdjustmentModule({ darkMode, onBack }: Props) {
  const [list, setList] = useState<StockAdjustment[]>([]);
  const [bins, setBins] = useState<WmsBin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [l, b] = await Promise.all([wmsEnterpriseService.listStockAdjustments(), wmsEnterpriseService.listBins()]);
      setList(l);
      setBins(b);
    } catch (e: any) {
      setError(e?.message || 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (a: StockAdjustment) => {
    setBusyId(a.id);
    setError(null);
    try {
      await wmsEnterpriseService.applyStockAdjustment(a.id);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Uygulanamadı');
    } finally {
      setBusyId(null);
    }
  };

  const card = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const text = darkMode ? 'text-gray-100' : 'text-gray-900';

  return (
    <div className={`h-full flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && <button onClick={onBack} className="p-1 hover:bg-white/15 rounded"><ArrowLeft className="w-5 h-5" /></button>}
          <AlertTriangle className="w-5 h-5" />
          <h2 className="font-bold">Fire / Stok Düzeltme</h2>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => void load()} className="flex items-center gap-1 px-2 py-1 bg-white/15 hover:bg-white/25 rounded text-xs"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile</button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 px-2 py-1 bg-white text-rose-700 hover:bg-rose-50 rounded text-xs font-medium"><Plus className="w-3.5 h-3.5" /> Yeni Fiş</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {error && <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded flex justify-between"><span>{error}</span><button onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button></div>}
        <div className={`border rounded ${card}`}>
          <table className="w-full text-sm">
            <thead className={darkMode ? 'bg-gray-700' : 'bg-rose-50'}>
              <tr className="text-[11px] text-left"><th className="px-2 py-1.5">FİŞ NO</th><th className="px-2 py-1.5">TÜR</th><th className="px-2 py-1.5">NEDEN</th><th className="px-2 py-1.5">DURUM</th><th className="px-2 py-1.5">TARİH</th><th className="px-2 py-1.5"></th></tr>
            </thead>
            <tbody>
              {list.length === 0 && !loading && <tr><td colSpan={6} className={`px-3 py-6 text-center text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Kayıt yok.</td></tr>}
              {list.map((a) => (
                <tr key={a.id} className={`border-t text-xs ${darkMode ? 'border-gray-700' : 'border-gray-100'} ${text}`}>
                  <td className="px-2 py-1 font-mono">{a.adj_no}</td>
                  <td className="px-2 py-1">{REASONS.find((r) => r.code === a.adj_type)?.label || a.adj_type}</td>
                  <td className="px-2 py-1">{a.reason_text || a.reason_code || '—'}</td>
                  <td className="px-2 py-1"><span className={`px-1.5 py-0.5 rounded text-[9px] ${a.status === 'applied' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>{a.status}</span></td>
                  <td className="px-2 py-1">{String(a.created_at || '').slice(0, 10)}</td>
                  <td className="px-2 py-1 text-right">
                    {a.status !== 'applied' && (
                      <button onClick={() => void apply(a)} disabled={busyId === a.id} className="inline-flex items-center gap-1 px-2 py-1 bg-rose-600 text-white rounded text-[10px] disabled:opacity-50"><Check className="w-3 h-3" />{busyId === a.id ? '…' : 'Uygula'}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateAdjustmentModal
          darkMode={darkMode}
          bins={bins}
          onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await load(); }}
        />
      )}
    </div>
  );
}

function CreateAdjustmentModal({ darkMode, bins, onClose, onCreated }: { darkMode?: boolean; bins: WmsBin[]; onClose: () => void; onCreated: () => void | Promise<void> }) {
  const [adjType, setAdjType] = useState('fire');
  const [reasonText, setReasonText] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ productCode: '', productName: '', binId: '', lotNo: '', expiryDate: '', qtyDelta: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setLine = (i: number, patch: Partial<DraftLine>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines([...lines, { productCode: '', productName: '', binId: '', lotNo: '', expiryDate: '', qtyDelta: '' }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));

  const save = async () => {
    const valid = lines.filter((l) => (l.productCode || l.productName) && l.qtyDelta);
    if (!valid.length) {
      setErr('En az bir satır (ürün + miktar) girin');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await wmsEnterpriseService.createStockAdjustment({
        adjType,
        reasonCode: adjType,
        reasonText: reasonText || undefined,
        lines: valid.map((l) => ({
          productCode: l.productCode || undefined,
          productName: l.productName || undefined,
          binId: l.binId || undefined,
          lotNo: l.lotNo || undefined,
          expiryDate: l.expiryDate || undefined,
          qtyDelta: -Math.abs(Number(l.qtyDelta) || 0) * (adjType === 'found' ? -1 : 1),
        })),
      });
      await onCreated();
    } catch (e: any) {
      setErr(e?.message || 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = `border rounded px-2 py-1 text-xs ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'border-gray-300'}`;
  return (
    <div className="fixed inset-0 bg-black/50 z-[2147483646] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`w-full max-w-3xl rounded-xl overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Yeni Fire / Düzeltme Fişi</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-auto">
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2">
            <label className="text-xs">
              <span className="block text-gray-500 mb-0.5">Tür / Neden</span>
              <select className={inputCls} value={adjType} onChange={(e) => setAdjType(e.target.value)}>
                {REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            </label>
            <label className="text-xs flex-1">
              <span className="block text-gray-500 mb-0.5">Açıklama</span>
              <input className={`${inputCls} w-full`} value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="opsiyonel" />
            </label>
          </div>
          <table className="w-full text-xs">
            <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
              <tr className="text-left text-[10px]"><th className="px-1 py-1">ÜRÜN KODU</th><th className="px-1 py-1">AD</th><th className="px-1 py-1">BİN</th><th className="px-1 py-1">LOT</th><th className="px-1 py-1">SKT</th><th className="px-1 py-1">MİKTAR</th><th></th></tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-1 py-1"><input className={`${inputCls} w-24`} value={l.productCode} onChange={(e) => setLine(i, { productCode: e.target.value })} /></td>
                  <td className="px-1 py-1"><input className={`${inputCls} w-28`} value={l.productName} onChange={(e) => setLine(i, { productName: e.target.value })} /></td>
                  <td className="px-1 py-1">
                    <select className={`${inputCls} w-24`} value={l.binId} onChange={(e) => setLine(i, { binId: e.target.value })}>
                      <option value="">—</option>
                      {bins.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1"><input className={`${inputCls} w-16`} value={l.lotNo} onChange={(e) => setLine(i, { lotNo: e.target.value })} /></td>
                  <td className="px-1 py-1"><input className={`${inputCls} w-28`} type="date" value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} /></td>
                  <td className="px-1 py-1"><input className={`${inputCls} w-16`} type="number" value={l.qtyDelta} onChange={(e) => setLine(i, { qtyDelta: e.target.value })} /></td>
                  <td className="px-1 py-1">{lines.length > 1 && <button onClick={() => removeLine(i)} className="text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addLine} className="text-xs px-2 py-1 border rounded flex items-center gap-1"><Plus className="w-3 h-3" /> Satır Ekle</button>
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border rounded">İptal</button>
          <button onClick={() => void save()} disabled={busy} className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded disabled:opacity-50">{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </div>
    </div>
  );
}

export default StockAdjustmentModule;
