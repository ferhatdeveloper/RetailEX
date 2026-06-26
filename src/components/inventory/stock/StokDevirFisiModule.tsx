import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  RefreshCw,
  Save,
  Search,
  AlertCircle,
  FileText,
  Pencil,
  Trash2,
  X,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import {
  cancelStockDevirRecord,
  createStockDevirBatch,
  getStockDevirMapByProduct,
  listStockDevirRecords,
  updateStockDevirItem,
  type StockDevirRecord,
} from '../../../services/api/stockOpeningBalance';
import { formatNumber } from '../../../utils/formatNumber';

type RowDraft = {
  product: Product;
  targetStock: string;
  selected: boolean;
  existingMovementId?: string;
  existingItemId?: string;
};

type EditForm = {
  movementId: string;
  itemId: string;
  productId: string;
  productName: string;
  targetStock: string;
  date: string;
  notes: string;
};

export function StokDevirFisiModule() {
  const { tm } = useLanguage();

  const [activeTab, setActiveTab] = useState<'entry' | 'records'>('entry');
  const [products, setProducts] = useState<Product[]>([]);
  const [records, setRecords] = useState<StockDevirRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recordsSearch, setRecordsSearch] = useState('');
  const [devirDate, setDevirDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [batchNotes, setBatchNotes] = useState('Eski program stok devir bakiyesi');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const buildDraftsFromProducts = useCallback(
    (rows: Product[], devirMap: Map<string, StockDevirRecord>, prev?: Record<string, RowDraft>) => {
      const next: Record<string, RowDraft> = { ...(prev || {}) };
      for (const p of rows) {
        const existing = devirMap.get(p.id);
        const prevRow = prev?.[p.id];
        if (existing) {
          next[p.id] = {
            product: p,
            targetStock: prevRow?.selected ? prevRow.targetStock : String(existing.quantity),
            selected: prevRow?.selected ?? false,
            existingMovementId: existing.movementId,
            existingItemId: existing.itemId,
          };
        } else if (!next[p.id]) {
          next[p.id] = {
            product: p,
            targetStock: prevRow?.targetStock || '',
            selected: prevRow?.selected ?? false,
          };
        } else {
          next[p.id] = { ...next[p.id], product: p };
        }
      }
      return next;
    },
    [],
  );

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, devirMap] = await Promise.all([productAPI.getAll(), getStockDevirMapByProduct()]);
      const active = rows.filter((p) => p.is_active !== false);
      setProducts(active);
      setDrafts((prev) => buildDraftsFromProducts(active, devirMap, prev));
    } catch (e: any) {
      toast.error(e?.message || 'Ürünler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [buildDraftsFromProducts]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const list = await listStockDevirRecords();
      setRecords(list);
    } catch (e: any) {
      toast.error(e?.message || 'Stok devir kayıtları yüklenemedi');
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (activeTab === 'records') void loadRecords();
  }, [activeTab, loadRecords]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return products;
    return products.filter(
      (p) =>
        (p.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (p.code || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (p.barcode || '').toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [products, searchQuery]);

  const filteredRecords = useMemo(() => {
    const q = recordsSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return records;
    return records.filter(
      (r) =>
        (r.product_name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (r.product_code || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (r.document_no || '').toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [records, recordsSearch]);

  const selectedCount = useMemo(
    () =>
      filteredRows.filter((p) => {
        const d = drafts[p.id];
        return d?.selected && d.targetStock !== '' && !Number.isNaN(parseFloat(d.targetStock));
      }).length,
    [filteredRows, drafts],
  );

  const updateDraft = (id: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const handleSave = async () => {
    const lines = Object.values(drafts)
      .filter((d) => d.selected && d.targetStock !== '' && !Number.isNaN(parseFloat(d.targetStock)))
      .map((d) => ({
        productId: d.product.id,
        productCode: d.product.code,
        productName: d.product.name,
        targetStock: Math.max(0, parseFloat(d.targetStock) || 0),
        existingMovementId: d.existingMovementId,
        existingItemId: d.existingItemId,
      }));

    if (lines.length === 0) {
      toast.error('En az bir ürün için devir stok miktarı girin ve satırı işaretleyin');
      return;
    }

    setSaving(true);
    try {
      const result = await createStockDevirBatch({
        date: devirDate,
        batchNotes,
        replaceExisting,
        lines,
      });
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} satır kaydedilemedi`, {
          description: result.errors[0]?.message,
        });
      }
      const parts: string[] = [];
      if (result.created > 0) parts.push(`${result.created} yeni`);
      if (result.updated > 0) parts.push(`${result.updated} güncellendi`);
      if (result.replaced > 0) parts.push(`${result.replaced} eski iptal`);
      if (parts.length > 0) {
        toast.success(`Stok devir: ${parts.join(', ')}`);
        await loadProducts();
        setDrafts((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(next)) {
            if (next[id].selected) {
              next[id] = { ...next[id], selected: false };
            }
          }
          return next;
        });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Stok devir kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (rec: StockDevirRecord) => {
    setEditForm({
      movementId: rec.movementId,
      itemId: rec.itemId,
      productId: rec.product_id,
      productName: rec.product_name || rec.product_code || rec.product_id,
      targetStock: String(rec.quantity),
      date: rec.movement_date ? rec.movement_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      notes: rec.description || '',
    });
  };

  const handleEditSave = async () => {
    if (!editForm) return;
    const target = Math.max(0, parseFloat(editForm.targetStock) || 0);
    setEditSaving(true);
    try {
      await updateStockDevirItem(
        editForm.movementId,
        editForm.itemId,
        editForm.productId,
        target,
        { date: editForm.date, notes: editForm.notes || undefined },
      );
      toast.success('Stok devir güncellendi');
      setEditForm(null);
      await Promise.all([loadRecords(), loadProducts()]);
    } catch (e: any) {
      toast.error(e?.message || 'Güncelleme başarısız');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (rec: StockDevirRecord) => {
    const label = rec.product_name || rec.product_code || rec.product_id;
    if (!confirm(`${label} için stok devir fişini iptal etmek istiyor musunuz?`)) return;
    try {
      await cancelStockDevirRecord(rec.movementId, rec.itemId);
      toast.success('Stok devir iptal edildi');
      await Promise.all([loadRecords(), loadProducts()]);
    } catch (e: any) {
      toast.error(e?.message || 'İptal edilemedi');
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-50">
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white px-4 py-3 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            <div>
              <h1 className="text-base font-bold">Stok Devir Fişi</h1>
              <p className="text-[11px] text-emerald-100">
                Eski programdan geçiş — ürün açılış stok miktarları
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => (activeTab === 'entry' ? void loadProducts() : void loadRecords())}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading || recordsLoading ? 'animate-spin' : ''}`} />
              {tm('refreshData')}
            </button>
            {activeTab === 'entry' && (
              <button
                type="button"
                disabled={saving || selectedCount === 0}
                onClick={() => void handleSave()}
                className="flex items-center gap-1 px-4 py-1.5 bg-white text-emerald-800 hover:bg-emerald-50 text-xs font-bold rounded-lg disabled:opacity-40"
              >
                <Save className="w-3.5 h-3.5" />
                Devir Kaydet ({selectedCount})
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1 mt-3">
          {(
            [
              { key: 'entry' as const, label: 'Toplu Giriş / Düzenle' },
              { key: 'records' as const, label: 'Kayıtlı Devirler' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${
                activeTab === tab.key ? 'bg-white text-emerald-800' : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        {activeTab === 'entry' ? (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-900">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Nasıl kullanılır?</p>
                <ul className="mt-1 list-disc list-inside text-xs space-y-0.5 opacity-90">
                  <li><strong>Devir Miktarı:</strong> Ürünün hedef açılış stok miktarıdır (mevcut stok değil).</li>
                  <li>Kayıtlı devirler otomatik doldurulur; değiştirip kaydederek güncelleyebilirsiniz.</li>
                  <li>&quot;Önceki devri iptal et&quot; işaretliyse yeni fiş oluşturulur; değilse mevcut kayıt güncellenir.</li>
                </ul>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Devir Tarihi</label>
                <input
                  type="date"
                  value={devirDate}
                  onChange={(e) => setDevirDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Açıklama</label>
                <input
                  type="text"
                  value={batchNotes}
                  onChange={(e) => setBatchNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Eski program stok devri"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-3">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="rounded"
                />
                Aynı ürün için önceki devir fişlerini iptal et ve yeni miktarla değiştir
              </label>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Kod, barkod veya ürün adı ara..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {loading ? (
                <div className="py-16 flex items-center justify-center text-gray-500 gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  {tm('loadingData')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2 w-10" />
                        <th className="px-3 py-2 text-left">Kod</th>
                        <th className="px-3 py-2 text-left">Ürün</th>
                        <th className="px-3 py-2 text-right">Mevcut Stok</th>
                        <th className="px-3 py-2 text-right">Devir Miktarı (Hedef)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((p) => {
                        const draft = drafts[p.id] || {
                          product: p,
                          targetStock: '',
                          selected: false,
                        };
                        const stock = parseFloat(String(p.stock ?? 0)) || 0;
                        return (
                          <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={draft.selected}
                                onChange={(e) => updateDraft(p.id, { selected: e.target.checked })}
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-emerald-700 font-bold">{p.code || '—'}</td>
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {p.name}
                              {draft.existingItemId && (
                                <span className="ml-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                  Kayıtlı
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-gray-700">
                              {formatNumber(stock, 2, true)} {p.unit || 'Adet'}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.001"
                                value={draft.targetStock}
                                onChange={(e) => updateDraft(p.id, { targetStock: e.target.value, selected: true })}
                                placeholder="0"
                                className="w-full max-w-[140px] ml-auto block border border-gray-300 rounded px-2 py-1 text-sm text-right"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredRows.length === 0 && (
                    <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 opacity-40" />
                      {tm('noRecordFound')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={recordsSearch}
                  onChange={(e) => setRecordsSearch(e.target.value)}
                  placeholder="Ürün veya fiş no ara..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {recordsLoading ? (
                <div className="py-16 flex items-center justify-center text-gray-500 gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  {tm('loadingData')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Fiş No</th>
                        <th className="px-3 py-2 text-left">Tarih</th>
                        <th className="px-3 py-2 text-left">Ürün</th>
                        <th className="px-3 py-2 text-right">Miktar</th>
                        <th className="px-3 py-2 text-right w-24">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((rec) => (
                        <tr key={rec.itemId} className="border-b border-gray-100 hover:bg-gray-50/80">
                          <td className="px-3 py-2 font-mono text-xs">{rec.document_no}</td>
                          <td className="px-3 py-2">{rec.movement_date ? rec.movement_date.slice(0, 10) : '—'}</td>
                          <td className="px-3 py-2 font-medium">
                            {rec.product_code && <span className="font-mono text-xs text-emerald-700 mr-2">{rec.product_code}</span>}
                            {rec.product_name}
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{formatNumber(rec.quantity, 2, true)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(rec)}
                                className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"
                                title="Düzenle"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(rec)}
                                className="p-1.5 rounded hover:bg-red-50 text-red-600"
                                title="İptal et"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredRecords.length === 0 && (
                    <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-2">
                      <ArrowRightLeft className="w-8 h-8 opacity-40" />
                      Kayıtlı stok devir fişi yok
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-gray-900">Stok Devir Düzenle</h3>
              <button type="button" onClick={() => setEditForm(null)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-600">{editForm.productName}</p>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tarih</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hedef Stok Miktarı</label>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  value={editForm.targetStock}
                  onChange={(e) => setEditForm({ ...editForm, targetStock: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Açıklama</label>
                <input
                  type="text"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t bg-gray-50 rounded-b-xl">
              <button
                type="button"
                onClick={() => setEditForm(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-white"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={editSaving}
                onClick={() => void handleEditSave()}
                className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50"
              >
                {editSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
