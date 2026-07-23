import { useState, useEffect, useCallback } from 'react';
import { MapPin, Plus, RefreshCw, ArrowLeft, Search, Boxes, X } from 'lucide-react';
import {
  wmsEnterpriseService,
  type WmsBin,
  type BinInventoryRow,
  type FefoAllocation,
} from '../../../services/wmsEnterpriseService';

interface Props {
  darkMode?: boolean;
  onBack?: () => void;
}

type Tab = 'bins' | 'inventory' | 'fefo';

export function BinManagement({ darkMode, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('bins');
  const [bins, setBins] = useState<WmsBin[]>([]);
  const [inventory, setInventory] = useState<BinInventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // FEFO
  const [fefoProduct, setFefoProduct] = useState('');
  const [fefoQty, setFefoQty] = useState('10');
  const [fefoResult, setFefoResult] = useState<FefoAllocation[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, inv] = await Promise.all([
        wmsEnterpriseService.listBins(),
        wmsEnterpriseService.getBinInventory(),
      ]);
      setBins(b);
      setInventory(inv);
    } catch (e: any) {
      setError(e?.message || 'Veri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runFefo = async () => {
    if (!fefoProduct.trim()) return;
    setError(null);
    try {
      const rows = await wmsEnterpriseService.allocateFefo(fefoProduct.trim(), Number(fefoQty) || 0);
      setFefoResult(rows);
    } catch (e: any) {
      setError(e?.message || 'FEFO tahsis başarısız');
      setFefoResult([]);
    }
  };

  const card = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const text = darkMode ? 'text-gray-100' : 'text-gray-900';

  return (
    <div className={`h-full flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="bg-[var(--asin-primary,#0E2433)] text-white px-4 py-3 flex items-center justify-between border-b border-[var(--asin-accent,#1FA8A0)]/35">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="p-1 hover:bg-white/15 rounded">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <MapPin className="w-5 h-5" />
          <h2 className="font-bold">Lokasyon & Bin Stok</h2>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => void load()} className="flex items-center gap-1 px-2 py-1 bg-white/15 hover:bg-white/25 rounded text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
          </button>
          {tab === 'bins' && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 px-2 py-1 bg-[var(--asin-accent,#1FA8A0)] text-white hover:bg-[#178f88] rounded text-xs font-medium">
              <Plus className="w-3.5 h-3.5" /> Bin Ekle
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 px-3 pt-2">
        {([['bins', 'Lokasyonlar'], ['inventory', 'Bin Stok'], ['fefo', 'FEFO Tahsis']] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs rounded-t-lg font-medium ${tab === id ? 'bg-blue-600 text-white' : darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-200 text-gray-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {tab === 'bins' && (
          <div className={`border rounded ${card}`}>
            <table className="w-full text-sm">
              <thead className={darkMode ? 'bg-gray-700' : 'bg-blue-50'}>
                <tr className="text-[11px] text-left">
                  <th className="px-2 py-1.5">KOD</th><th className="px-2 py-1.5">ZONE</th>
                  <th className="px-2 py-1.5">KORİDOR</th><th className="px-2 py-1.5">RAF</th>
                  <th className="px-2 py-1.5">GÖZ</th><th className="px-2 py-1.5">TİP</th>
                  <th className="px-2 py-1.5">BARKOD</th>
                </tr>
              </thead>
              <tbody>
                {bins.length === 0 && !loading && (
                  <tr><td colSpan={7} className={`px-3 py-6 text-center text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Lokasyon yok. "Bin Ekle" ile başlayın.</td></tr>
                )}
                {bins.map((b) => (
                  <tr key={b.id} className={`border-t text-xs ${darkMode ? 'border-gray-700' : 'border-gray-100'} ${text}`}>
                    <td className="px-2 py-1 font-mono font-semibold">{b.code}</td>
                    <td className="px-2 py-1">{b.zone || '—'}</td>
                    <td className="px-2 py-1">{b.aisle || '—'}</td>
                    <td className="px-2 py-1">{b.rack || '—'}</td>
                    <td className="px-2 py-1">{b.bin || '—'}</td>
                    <td className="px-2 py-1">{b.bin_type || 'storage'}</td>
                    <td className="px-2 py-1 font-mono text-[10px]">{b.barcode || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'inventory' && (
          <div className={`border rounded ${card}`}>
            <table className="w-full text-sm">
              <thead className={darkMode ? 'bg-gray-700' : 'bg-blue-50'}>
                <tr className="text-[11px] text-left">
                  <th className="px-2 py-1.5">BİN</th><th className="px-2 py-1.5">ÜRÜN</th>
                  <th className="px-2 py-1.5">LOT</th><th className="px-2 py-1.5">SKT</th>
                  <th className="px-2 py-1.5 text-right">MİKTAR</th><th className="px-2 py-1.5 text-right">REZERVE</th>
                </tr>
              </thead>
              <tbody>
                {inventory.length === 0 && !loading && (
                  <tr><td colSpan={6} className={`px-3 py-6 text-center text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Bin stoğu yok.</td></tr>
                )}
                {inventory.map((r) => (
                  <tr key={r.id} className={`border-t text-xs ${darkMode ? 'border-gray-700' : 'border-gray-100'} ${text}`}>
                    <td className="px-2 py-1 font-mono">{r.bin_code || '—'}</td>
                    <td className="px-2 py-1">{r.product_name || r.product_code || '—'}</td>
                    <td className="px-2 py-1">{r.lot_no || '—'}</td>
                    <td className="px-2 py-1">{r.expiry_date ? String(r.expiry_date).slice(0, 10) : '—'}</td>
                    <td className="px-2 py-1 text-right font-semibold">{Number(r.qty).toLocaleString('tr-TR')}</td>
                    <td className="px-2 py-1 text-right text-gray-500">{Number(r.reserved_qty).toLocaleString('tr-TR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'fefo' && (
          <div className={`border rounded p-4 ${card}`}>
            <div className="flex items-center gap-2 mb-3">
              <Boxes className="w-4 h-4 text-blue-600" />
              <span className={`text-sm font-semibold ${text}`}>FEFO/FIFO Tahsis Simülasyonu</span>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-xs">
                <span className="block text-gray-500 mb-0.5">Ürün ID (UUID)</span>
                <input value={fefoProduct} onChange={(e) => setFefoProduct(e.target.value)} placeholder="ürün uuid" className="border border-gray-300 rounded px-2 py-1 text-xs w-72" />
              </label>
              <label className="text-xs">
                <span className="block text-gray-500 mb-0.5">Miktar</span>
                <input value={fefoQty} onChange={(e) => setFefoQty(e.target.value)} type="number" className="border border-gray-300 rounded px-2 py-1 text-xs w-24" />
              </label>
              <button onClick={() => void runFefo()} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs flex items-center gap-1">
                <Search className="w-3.5 h-3.5" /> Tahsis Et
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">İpucu: Bin Stok sekmesindeki bir ürünün UUID'sini kullanın; en erken SKT'li lot önce tahsis edilir.</p>
            {fefoResult.length > 0 && (
              <table className="w-full text-sm mt-3">
                <thead className={darkMode ? 'bg-gray-700' : 'bg-blue-50'}>
                  <tr className="text-[11px] text-left">
                    <th className="px-2 py-1.5">BİN</th><th className="px-2 py-1.5">LOT</th>
                    <th className="px-2 py-1.5">SKT</th><th className="px-2 py-1.5 text-right">TAHSİS</th>
                  </tr>
                </thead>
                <tbody>
                  {fefoResult.map((r, i) => (
                    <tr key={i} className={`border-t text-xs ${darkMode ? 'border-gray-700' : 'border-gray-100'} ${text}`}>
                      <td className="px-2 py-1 font-mono">{r.bin_code}</td>
                      <td className="px-2 py-1">{r.lot_no || '—'}</td>
                      <td className="px-2 py-1">{r.expiry_date ? String(r.expiry_date).slice(0, 10) : '—'}</td>
                      <td className="px-2 py-1 text-right font-semibold">{Number(r.alloc_qty).toLocaleString('tr-TR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateBinModal
          darkMode={darkMode}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function CreateBinModal({ darkMode, onClose, onCreated }: { darkMode?: boolean; onClose: () => void; onCreated: () => void | Promise<void> }) {
  const [form, setForm] = useState({ code: '', zone: '', aisle: '', rack: '', shelf: '', bin: '', bin_type: 'storage', barcode: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!form.code.trim()) {
      setErr('Kod zorunlu');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await wmsEnterpriseService.createBin(form);
      await onCreated();
    } catch (e: any) {
      setErr(e?.message || 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = `border rounded px-2 py-1.5 text-xs w-full ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'border-gray-300'}`;
  return (
    <div className="fixed inset-0 bg-black/50 z-[2147483646] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`w-full max-w-md rounded-xl overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
        <div className="bg-[var(--asin-primary,#0E2433)] text-white px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Yeni Lokasyon / Bin</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-2">
          {err && <p className="text-xs text-red-600">{err}</p>}
          <input className={inputCls} placeholder="Kod (örn. A-01-01) *" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Zone" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
            <input className={inputCls} placeholder="Koridor (aisle)" value={form.aisle} onChange={(e) => setForm({ ...form, aisle: e.target.value })} />
            <input className={inputCls} placeholder="Raf (rack)" value={form.rack} onChange={(e) => setForm({ ...form, rack: e.target.value })} />
            <input className={inputCls} placeholder="Kat (shelf)" value={form.shelf} onChange={(e) => setForm({ ...form, shelf: e.target.value })} />
            <input className={inputCls} placeholder="Göz (bin)" value={form.bin} onChange={(e) => setForm({ ...form, bin: e.target.value })} />
            <select className={inputCls} value={form.bin_type} onChange={(e) => setForm({ ...form, bin_type: e.target.value })}>
              <option value="storage">Depolama</option>
              <option value="picking">Toplama</option>
              <option value="receiving">Mal Kabul</option>
              <option value="staging">Hazırlık</option>
              <option value="quarantine">Karantina</option>
              <option value="damage">Hasarlı</option>
            </select>
          </div>
          <input className={inputCls} placeholder="Barkod" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border rounded">İptal</button>
          <button onClick={() => void save()} disabled={busy} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded disabled:opacity-50">
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BinManagement;
