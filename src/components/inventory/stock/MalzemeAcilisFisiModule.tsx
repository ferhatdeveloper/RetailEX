/**
 * Malzeme Açılış Faturası (slip_kind='invoice', trcode=14)
 *
 * Alış faturasına benzer form:
 *   tarih + ambar + açıklama + satırlarda (ürün, miktar, KDV hariç birim
 *   fiyat, KDV %, satır toplam) + alt toplamlar (KDV hariç, KDV, genel).
 *
 * Servis: `createStockOpeningInvoiceSlip` (`stockOpeningInvoice.ts`).
 *   - Absolute replace: `products.stock = qty`, `products.cost = unitCostExclVat`
 *   - UNIQUE (ürün başına 1 aktif fiş) — `180_*.sql`
 *   - Tedarikçi/cari/ledger YOK — yalnız stok + maliyet
 *
 * Mount: `StockMovementsModule` içindeki "Ekle → Belge Türü" modalı
 * `selectedSlipLabel === stockOpeningInvoiceTitle` iken bu bileşen doğrudan
 * PercentBodyModal içinde render edilir.
 *
 * NOT: Bu bileşen eski ayrı menü öğesinden (`stock-opening-invoice-slip`)
 * kaldırılmıştır — yalnızca Stock Movements modülünün Ekle menüsünden
 * erişilir. Bileşen harici olarak da mount edilebilir (props.onClose
 * ile), ama varsayılan davranış içerideki "Kaydet / Kapat" butonudur.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  ChevronDown,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import {
  createStockOpeningInvoiceSlip,
  cancelStockOpeningInvoiceSlip,
  findExistingOpeningInvoiceProductIds,
  listStockOpeningInvoiceRecords,
  type StockOpeningInvoiceLineInput,
  type StockOpeningInvoiceRecord,
} from '../../../services/api/stockOpeningInvoice';
import { formatNumber } from '../../../utils/formatNumber';

type DraftLine = {
  uid: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  qty: string;
  unitCostExclVat: string;
  vatRate: string;
};

function num(raw: string): number {
  const x = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
}

function newDraft(): DraftLine {
  return {
    uid: `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: '',
    productCode: '',
    productName: '',
    unit: 'Adet',
    qty: '',
    unitCostExclVat: '',
    vatRate: '0',
  };
}

function computeLineSubtotal(ln: Pick<DraftLine, 'qty' | 'unitCostExclVat' | 'vatRate'>) {
  const q = num(ln.qty);
  const u = num(ln.unitCostExclVat);
  const v = num(ln.vatRate);
  const excl = q * u;
  const incl = excl * (1 + v / 100);
  return { excl, incl };
}

export interface MalzemeAcilisFisiModuleProps {
  /** Modal içinde kullanılıyorsa kapatma callback'i. */
  onClose?: () => void;
  /** Üst başlık satırındaki ambar listesi (opsiyonel). */
  warehouses?: Array<{ id: string; name: string }>;
  /** Üst başlıkta görünen başlık (örn. StockMovementsModule'dan gelen slip adı). */
  headerLabel?: string;
}

/**
 * Malzeme Açılış Faturası modülü — alış faturası seviyesinde UX.
 * Mount noktası: StockMovementsModule "Ekle → Belge Türü" modalı.
 */
export function MalzemeAcilisFisiModule({
  onClose,
  warehouses = [],
  headerLabel,
}: MalzemeAcilisFisiModuleProps = {}) {
  const { tm } = useLanguage();

  const [activeTab, setActiveTab] = useState<'entry' | 'records'>('entry');
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);

  const [drafts, setActive] = useState<DraftLine[]>(() => [newDraft()]);
  const [docDate, setDocDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState<string>(() => warehouses[0]?.id || '');
  const [docNotes, setDocNotes] = useState<string>('');

  const [records, setRecords] = useState<StockOpeningInvoiceRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Ambar listesi yoksa servis çağrısı (store/load değil — modüle özel)
  const [resolvedWarehouses, setResolvedWarehouses] = useState<
    Array<{ id: string; name: string }>
  >([]);

  useEffect(() => {
    if (warehouses.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { postgres } = await import('../../../services/postgres');
        const result = await postgres.query<{ id: string; name: string }>(
          'SELECT id, name FROM stores WHERE is_active = true ORDER BY name ASC LIMIT 50',
        );
        const rows = (result as any)?.rows || [];
        if (!cancelled) {
          const list = rows.map((r: any) => ({
            id: String(r.id),
            name: String(r.name || ''),
          }));
          setResolvedWarehouses(list);
          if (list.length > 0 && !warehouseId) setWarehouseId(list[0].id);
        }
      } catch {
        // sessiz
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveWarehouses = warehouses.length > 0 ? warehouses : resolvedWarehouses;

  // Ürün arama (debounce)
  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await productAPI.search(q);
        if (cancelled) return;
        const filtered = (hits || [])
          .filter((p) => !p.isService && p.is_active !== false)
          .slice(0, 20);
        setSearchHits(filtered);
      } catch {
        if (!cancelled) setSearchHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [searchQ]);

  const totals = useMemo(() => {
    let excl = 0;
    let vat = 0;
    let incl = 0;
    for (const ln of drafts) {
      const q = num(ln.qty);
      const u = num(ln.unitCostExclVat);
      const v = num(ln.vatRate);
      const lineExcl = q * u;
      const lineVat = lineExcl * (v / 100);
      excl += lineExcl;
      vat += lineVat;
      incl += lineExcl + lineVat;
    }
    return {
      excl: Math.round(excl * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      incl: Math.round(incl * 100) / 100,
    };
  }, [drafts]);

  const validLines = useMemo(
    () =>
      drafts.filter(
        (d) =>
          d.productId &&
          num(d.qty) > 0 &&
          num(d.unitCostExclVat) >= 0 &&
          num(d.vatRate) >= 0,
      ),
    [drafts],
  );

  const updateLine = (uid: string, patch: Partial<DraftLine>) => {
    setActive((prev) => prev.map((d) => (d.uid === uid ? { ...d, ...patch } : d)));
  };

  const removeLine = (uid: string) => {
    setActive((prev) => (prev.length > 1 ? prev.filter((d) => d.uid !== uid) : [newDraft()]));
  };

  const pickProduct = (uid: string, p: Product) => {
    updateLine(uid, {
      productId: p.id,
      productCode: p.code || p.barcode || '',
      productName: p.name,
      unit: p.unit || 'Adet',
    });
    setSearchQ('');
    setSearchHits([]);
  };

  const addEmptyLine = () => {
    setActive((prev) => [...prev, newDraft()]);
  };

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const list = await listStockOpeningInvoiceRecords();
      setRecords(list);
    } catch (e: any) {
      toast.error(e?.message || tm('stockOpeningInvoiceLoadError') || 'Açılış faturaları yüklenemedi');
    } finally {
      setRecordsLoading(false);
    }
  }, [tm]);

  useEffect(() => {
    if (activeTab === 'records') void loadRecords();
  }, [activeTab, loadRecords]);

  const handleSave = async () => {
    if (validLines.length === 0) {
      toast.error(tm('minOneProductRequired') || 'En az bir ürün satırı zorunlu');
      return;
    }

    const lines: StockOpeningInvoiceLineInput[] = validLines.map((d) => ({
      productId: d.productId,
      productCode: d.productCode,
      productName: d.productName,
      qty: num(d.qty),
      unitCostExclVat: num(d.unitCostExclVat),
      vatRate: num(d.vatRate),
    }));

    setSaving(true);
    try {
      // Ön-kontrol: aynı ürün için başka aktif açılış fişi varsa kullanıcıya
      // bildir (UNIQUE kısıt DB tarafında da var, ama mesaj daha anlamlı).
      const already = await findExistingOpeningInvoiceProductIds(
        lines.map((l) => l.productId),
      );
      if (already.size > 0) {
        const dupNames = validLines
          .filter((d) => already.has(d.productId))
          .map((d) => d.productCode || d.productName || d.productId)
          .join(', ');
        throw new Error(
          `Bu ürün(ler) için zaten açılış faturası mevcut: ${dupNames}. Aynı ürün için yalnız bir açılış fişi girilebilir.`,
        );
      }

      const result = await createStockOpeningInvoiceSlip({
        firmNr: '',
        periodNr: '',
        date: docDate,
        warehouseId: warehouseId || undefined,
        notes: docNotes.trim() || undefined,
        lines,
      });
      toast.success(
        `${tm('stockOpeningInvoiceSaved') || 'Açılış faturası kaydedildi'}: ${result.documentNo}`,
        {
          description: `${result.lines.length} ${tm('batchCreatedCount') || 'kalem'} • ${tm('grandTotal') || 'Toplam'}: ${formatNumber(result.grandTotal, 2, true)}`,
        },
      );
      setActive([newDraft()]);
      setDocNotes('');
      void loadRecords();
    } catch (e: any) {
      toast.error(e?.message || tm('stockOpeningInvoiceSaveError') || 'Açılış faturası kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (movementId: string, productLabel: string) => {
    if (!window.confirm(
      tm('stockOpeningInvoiceCancelConfirm') ||
        `Açılış faturasını iptal etmek istediğinizden emin misiniz?\n${productLabel}\n\nStok ve maliyet geri alınır (absolute).`,
    )) {
      return;
    }
    try {
      await cancelStockOpeningInvoiceSlip(movementId);
      toast.success(tm('stockOpeningInvoiceCancelSuccess') || 'Açılış faturası iptal edildi (stok ve maliyet geri alındı)');
      void loadRecords();
    } catch (e: any) {
      toast.error(e?.message || tm('errorOccurred') || 'İşlem başarısız');
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-50">
      {/* Üst başlık — alış faturası kalıbı */}
      <div className="relative z-20 shrink-0 bg-gradient-to-r from-indigo-600 to-blue-700 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <ArrowRightLeft className="w-4 h-4 shrink-0" />
            <h2 className="text-sm truncate">
              {headerLabel ||
                tm('stockOpeningInvoiceTitle') ||
                'Malzeme Açılış Faturası'}
            </h2>
            <span className="text-blue-100 text-[10px] ml-2 hidden sm:inline">
              • {activeTab === 'entry' ? validLines.length : records.length}{' '}
              {tm('records')}
            </span>
          </div>
          <div className="flex gap-1.5 items-center">
            <button
              type="button"
              onClick={() => setActiveTab('entry')}
              className={`flex items-center gap-1 px-2 py-1 transition-colors text-[10px] font-bold ${
                activeTab === 'entry'
                  ? 'bg-white text-indigo-700'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {tm('tabEntryEdit') || 'Giriş / Düzen'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('records')}
              className={`flex items-center gap-1 px-2 py-1 transition-colors text-[10px] font-bold ${
                activeTab === 'records'
                  ? 'bg-white text-indigo-700'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {tm('tabRegisteredRecords') || 'Kayıtlı Faturalar'}
            </button>
            <button
              type="button"
              onClick={() => (activeTab === 'entry' ? setActive([newDraft()]) : void loadRecords())}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]"
              title={tm('refresh') || 'Yenile'}
            >
              <RefreshCw className={`w-3 h-3 ${recordsLoading ? 'animate-spin' : ''}`} />
              <span>{tm('refresh') || 'Yenile'}</span>
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center"
                title={tm('cancel') || 'Kapat'}
              >
                <X className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        {activeTab === 'entry' ? (
          <>
            {/* Açılış fişi bilgilendirme bandı */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-900">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {tm('openingInvoiceAlertTitle') || 'Açılış faturası — absolute replace'}
                </p>
                <ul className="mt-1 list-disc list-inside text-xs space-y-0.5 opacity-90">
                  <li>
                    {tm('openingInvoiceHelp1') ||
                      'Her satır: ürün + miktar + KDV hariç birim fiyat + KDV %. Tedarikçi/cari yok.'}
                  </li>
                  <li>
                    {tm('openingInvoiceHelp4') ||
                      'Ürün stoğu ve standart maliyeti bu fişten SONRA satırdaki miktara ve birim fiyata eşitlenir (mutlak).'}
                  </li>
                  <li>
                    {tm('openingInvoiceHelp5') ||
                      'Aynı ürün için yalnız bir açılış faturası girilebilir (UNIQUE kısıt). İptal için "Kayıtlı Faturalar" sekmesi.'}
                  </li>
                  <li>
                    {tm('openingInvoiceHelp3') ||
                      'Muhasebe simetrisi: kasa/banka/cari ledger YOK — yalnız stok devir (slip_kind=invoice).'}
                  </li>
                </ul>
              </div>
            </div>

            {/* Tarih + Ambar + Açıklama */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                  {tm('openingBalanceDate') || 'Fiş Tarihi'}
                </label>
                <input
                  type="date"
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                  {tm('warehouse') || 'Ambar'}
                </label>
                <div className="relative">
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm bg-white appearance-none"
                  >
                    <option value="">—</option>
                    {effectiveWarehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                  {tm('description') || 'Açıklama'}
                </label>
                <input
                  type="text"
                  value={docNotes}
                  onChange={(e) => setDocNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder={tm('openingInvoiceNotesPlaceholder') || 'Açılış faturası devri'}
                />
              </div>
            </div>

            {/* Satırlar */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 w-10" />
                      <th className="px-3 py-2 text-left min-w-[260px]">
                        {tm('product') || 'Ürün'}
                      </th>
                      <th className="px-3 py-2 text-right w-32">
                        {tm('quantity') || 'Miktar'}
                      </th>
                      <th className="px-3 py-2 text-right w-40">
                        {tm('unitPriceExclVat') || 'Birim Fiyat (KDV Hariç)'}
                      </th>
                      <th className="px-3 py-2 text-right w-24">
                        {tm('vatRate') || 'KDV %'}
                      </th>
                      <th className="px-3 py-2 text-right w-40">
                        {tm('lineTotal') || 'Satır Toplam'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((ln) => {
                      const { excl, incl } = computeLineSubtotal(ln);
                      return (
                        <tr
                          key={ln.uid}
                          className="border-b border-gray-100 align-top hover:bg-gray-50/50"
                        >
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => removeLine(ln.uid)}
                              className="p-1 rounded hover:bg-red-50 text-red-600"
                              title={tm('removeRow') || 'Satırı sil'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            {ln.productId ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <Package className="w-4 h-4 text-indigo-500" />
                                  <span className="font-mono text-xs text-emerald-700 font-bold">
                                    {ln.productCode || '—'}
                                  </span>
                                  <span className="font-medium text-gray-900 truncate max-w-[280px]">
                                    {ln.productName}
                                  </span>
                                  <span className="text-[10px] text-gray-400">({ln.unit})</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateLine(ln.uid, {
                                      productId: '',
                                      productCode: '',
                                      productName: '',
                                    })
                                  }
                                  className="text-[10px] text-blue-600 hover:underline"
                                >
                                  {tm('changeProduct') || 'Değiştir'}
                                </button>
                              </div>
                            ) : (
                              <ProductSearchCell
                                searchQ={searchQ}
                                setSearchQ={setSearchQ}
                                hits={searchHits}
                                searching={searching}
                                onPick={(p) => pickProduct(ln.uid, p)}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step="0.001"
                              value={ln.qty}
                              onChange={(e) => updateLine(ln.uid, { qty: e.target.value })}
                              placeholder="0"
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step="0.0001"
                              value={ln.unitCostExclVat}
                              onChange={(e) =>
                                updateLine(ln.uid, { unitCostExclVat: e.target.value })
                              }
                              placeholder="0"
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="relative">
                              <select
                                value={ln.vatRate}
                                onChange={(e) => updateLine(ln.uid, { vatRate: e.target.value })}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right bg-white pr-7 appearance-none"
                              >
                                {[0, 1, 5, 10, 15, 20].map((v) => (
                                  <option key={v} value={String(v)}>
                                    %{v}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="text-xs text-gray-500">
                              {tm('subtotalExclVat') || 'KDV Hariç'}: {formatNumber(excl, 2, true)}
                            </div>
                            <div className="font-bold text-gray-900">
                              {formatNumber(incl, 2, true)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td
                        colSpan={5}
                        className="px-3 py-3 text-right text-[11px] uppercase font-bold text-gray-500"
                      >
                        {tm('subtotalExclVat') || 'KDV Hariç Toplam'}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-gray-700">
                        {formatNumber(totals.excl, 2, true)}
                      </td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td
                        colSpan={5}
                        className="px-3 py-2 text-right text-[11px] uppercase font-bold text-gray-500"
                      >
                        {tm('vatTotal') || 'KDV Toplam'}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-gray-700">
                        {formatNumber(totals.vat, 2, true)}
                      </td>
                    </tr>
                    <tr className="bg-indigo-50 border-t border-indigo-200">
                      <td
                        colSpan={5}
                        className="px-3 py-3 text-right text-[11px] uppercase font-extrabold text-indigo-700"
                      >
                        {tm('grandTotal') || 'Genel Toplam (KDV Dahil)'}
                      </td>
                      <td className="px-3 py-3 text-right text-base font-extrabold text-indigo-700">
                        {formatNumber(totals.incl, 2, true)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={addEmptyLine}
                className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
              >
                <Plus className="w-4 h-4" />
                {tm('addRow') || 'Satır Ekle'}
              </button>
              <button
                type="button"
                disabled={saving || validLines.length === 0}
                onClick={() => void handleSave()}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving
                  ? tm('saving') || 'Kaydediliyor…'
                  : `${tm('save') || 'Kaydet'} (${validLines.length})`}
              </button>
            </div>
          </>
        ) : (
          <RecordsView
            records={records}
            loading={recordsLoading}
            onCancel={handleCancel}
          />
        )}
      </div>
    </div>
  );
}

function ProductSearchCell({
  searchQ,
  setSearchQ,
  hits,
  searching,
  onPick,
}: {
  searchQ: string;
  setSearchQ: (q: string) => void;
  hits: Product[];
  searching: boolean;
  onPick: (p: Product) => void;
}) {
  const { tm } = useLanguage();
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={searchQ}
        onChange={(e) => setSearchQ(e.target.value)}
        placeholder={tm('searchProductPlaceholder') || 'Ürün ara (kod / ad / barkod)...'}
        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
      {searching && (
        <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
      )}
      {hits.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {hits.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-indigo-50 text-left text-sm border-b border-gray-100 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-emerald-700 font-bold">
                    {p.code || p.barcode || '—'}
                  </span>
                  <span className="font-medium text-gray-900 truncate">{p.name}</span>
                </div>
                <div className="text-[10px] text-gray-500">
                  {p.unit || 'Adet'} •{' '}
                  {tm('currentStockLabel') || 'Mevcut'}:{' '}
                  {formatNumber(parseFloat(String(p.stock ?? 0)) || 0, 2, true)}
                </div>
              </div>
              <ChevronDown className="w-4 h-4 -rotate-90 text-gray-400" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordsView({
  records,
  loading,
  onCancel,
}: {
  records: StockOpeningInvoiceRecord[];
  loading: boolean;
  onCancel: (movementId: string, productLabel: string) => void;
}) {
  const { tm } = useLanguage();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return records;
    return records.filter(
      (r) =>
        (r.productName || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (r.productCode || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (r.documentNo || '').toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [records, search]);

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tm('searchProductOrSlip') || 'Ürün veya fiş no ara...'}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-gray-500 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {tm('loadingData') || 'Yükleniyor...'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">
                    {tm('slipNo') || 'Fiş No'}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {tm('date') || 'Tarih'}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {tm('product') || 'Ürün'}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {tm('quantity') || 'Miktar'}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {tm('unitPriceExclVat') || 'Birim (KDV H)'}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {tm('vatRate') || 'KDV %'}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {tm('lineTotal') || 'Toplam'}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {tm('currentCost') || 'Güncel Maliyet'}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {tm('actions') || 'İşlem'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.itemId}
                    className="border-b border-gray-100 hover:bg-gray-50/80"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{r.documentNo}</td>
                    <td className="px-3 py-2">
                      {r.movementDate ? r.movementDate.slice(0, 10) : '—'}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {r.productCode && (
                        <span className="font-mono text-xs text-emerald-700 mr-2">
                          {r.productCode}
                        </span>
                      )}
                      {r.productName}
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      {formatNumber(r.qty, 2, true)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(r.unitCostExclVat, 2, true)}
                    </td>
                    <td className="px-3 py-2 text-right">{r.vatRate}%</td>
                    <td className="px-3 py-2 text-right font-bold">
                      {formatNumber(r.lineTotal, 2, true)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700">
                      {formatNumber(r.productCurrentCost ?? 0, 2, true)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onCancel(
                            r.movementId,
                            `${r.documentNo} • ${r.productCode || r.productName || r.productId}`,
                          )
                        }
                        className="px-2 py-1 text-[10px] font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded"
                        title={tm('stockOpeningInvoiceCancelTitle') || 'Açılış faturasını iptal et'}
                      >
                        {tm('cancel') || 'İptal'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-12 text-center text-gray-400">
                {tm('noRegisteredOpeningInvoice') || 'Kayıtlı açılış faturası yok'}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}