import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Camera,
  Plus,
  Send,
  Check,
  X,
  FileSpreadsheet,
  Receipt,
  Trash2,
  Smartphone,
  Search,
  Loader2,
  Sparkles,
  PackagePlus,
} from 'lucide-react';
import { BarcodeScanner } from '../inventory/stock/BarcodeScanner';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { productAPI } from '../../services/api/products';
import { productVariantAPI } from '../../services/api/productVariants';
import type { Product } from '../../core/types';
import { visionService } from '../../services/visionService';
import { FullscreenBodyPortal } from '../shared/FullscreenBodyPortal';

type RowStatus = 'draft' | 'pending' | 'approved';

export interface MaterialIntakeDraftRow {
  id: string;
  barcode: string;
  name: string;
  variant: string;
  salePrice: number;
  status: RowStatus;
  /** Raf etiketi — isteğe bağlı; mobil `capture` ile alınabilir */
  labelPhotoDataUrl?: string;
  /** Ürün / varyant / birim barkodu ile stokta bulundu */
  stockMatched?: boolean;
  /** Bu satırdan oluşturulan ürün kartı */
  createdProductId?: string;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `r_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

/** Ana barkod, birim barkodu veya varyant barkodu ile stok kartı çözümleme */
async function lookupStockFields(barcode: string): Promise<{ name: string; variant: string; salePrice: number } | null> {
  const trimmed = String(barcode || '').trim();
  if (!trimmed) return null;
  try {
    const variant = await productVariantAPI.getByBarcode(trimmed);
    if (variant?.productId) {
      const p = await productAPI.getById(variant.productId);
      if (p) {
        const variantLabel = [variant.color, variant.size].filter(Boolean).join(' / ') || variant.code || '';
        const sale = variant.price != null && variant.price > 0 ? variant.price : p.price ?? 0;
        return { name: p.name, variant: variantLabel, salePrice: Number(sale) || 0 };
      }
    }
    const hit = await productAPI.lookupByBarcode(trimmed);
    if (hit?.product) {
      const p = hit.product;
      const unitSp = hit.unitInfo?.sale_price;
      const salePrice =
        unitSp != null && !Number.isNaN(Number(unitSp)) ? Number(unitSp) : p.price ?? 0;
      const unitLabel = hit.unitInfo?.unit != null ? String(hit.unitInfo.unit) : '';
      return { name: p.name, variant: unitLabel, salePrice: Number(salePrice) || 0 };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[MaterialsIntake] lookupStockFields:', msg);
  }
  return null;
}

export function MaterialsIntakeModule({
  onOpenPurchaseInvoice,
  variant = 'default',
}: {
  onOpenPurchaseInvoice?: () => void;
  /** Akıllı menü: raf etiketi / OCR vurgusu */
  variant?: 'default' | 'smart';
}) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { isMobile } = useResponsive();
  const [rows, setRows] = useState<MaterialIntakeDraftRow[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookupRowId, setLookupRowId] = useState<string | null>(null);
  const [createLoadingId, setCreateLoadingId] = useState<string | null>(null);
  const [ocrModal, setOcrModal] = useState<{
    rowId: string;
    raw: string;
    parsed: { barcode: string; salePrice: number; nameHint: string; variantHint: string };
    loading: boolean;
  } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetRowId, setPhotoTargetRowId] = useState<string | null>(null);

  useEffect(() => {
    if (variant !== 'smart') return;
    toast.info(tm('mgmtMatIntakeSmartBanner'), { duration: 6000 });
  }, [variant, tm]);

  const borderClass = darkMode ? 'border-gray-700' : 'border-gray-200';
  const cardBg = darkMode ? 'bg-gray-800' : 'bg-white';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const mutedClass = darkMode ? 'text-gray-400' : 'text-gray-500';

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      {
        id: newId(),
        barcode: '',
        name: '',
        variant: '',
        salePrice: 0,
        status: 'draft',
        stockMatched: false,
      },
    ]);
  }, []);

  const onBarcodeScanned = useCallback((code: string) => {
    const trimmed = String(code || '').trim();
    if (!trimmed) return;
    const id = newId();
    setRows((prev) => [
      ...prev,
      {
        id,
        barcode: trimmed,
        name: '',
        variant: '',
        salePrice: 0,
        status: 'draft',
        stockMatched: false,
      },
    ]);
    toast.success(trimmed);
    void (async () => {
      const hit = await lookupStockFields(trimmed);
      if (hit) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, ...hit, stockMatched: true } : r
          )
        );
        toast.success(tm('mgmtMatIntakeStockHit'));
      }
    })();
  }, [tm]);

  const updateRow = useCallback((id: string, patch: Partial<MaterialIntakeDraftRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const applyStockLookup = useCallback(
    async (rowId: string, barcode: string) => {
      const trimmed = String(barcode || '').trim();
      if (!trimmed) {
        toast.info(tm('mgmtMatIntakeStockMiss'));
        return;
      }
      setLookupRowId(rowId);
      try {
        const hit = await lookupStockFields(trimmed);
        if (hit) {
          updateRow(rowId, { ...hit, stockMatched: true });
          toast.success(tm('mgmtMatIntakeStockHit'));
        } else {
          updateRow(rowId, { stockMatched: false });
          toast.info(tm('mgmtMatIntakeStockMiss'));
        }
      } finally {
        setLookupRowId(null);
      }
    },
    [tm, updateRow]
  );

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const sendPending = useCallback(() => {
    setRows((prev) =>
      prev.map((r) => (r.status === 'draft' && (r.barcode || r.name) ? { ...r, status: 'pending' as const } : r))
    );
    toast.info(tm('mgmtMatIntakeSendApproval'));
  }, [tm]);

  const approveRow = useCallback((id: string) => {
    updateRow(id, { status: 'approved' });
  }, [updateRow]);

  const rejectRow = useCallback((id: string) => {
    updateRow(id, { status: 'draft' });
  }, [updateRow]);

  const exportApprovedXlsx = useCallback(() => {
    const approved = rows.filter((r) => r.status === 'approved');
    if (approved.length === 0) {
      toast.error(tm('mgmtMatIntakeNoApproved'));
      return;
    }
    const data = approved.map((r) => ({
      [tm('mgmtMatIntakeColBarcode')]: r.barcode,
      [tm('mgmtMatIntakeColName')]: r.name,
      [tm('mgmtMatIntakeColVariant')]: r.variant,
      [tm('mgmtMatIntakeColSalePrice')]: r.salePrice,
      [tm('mgmtMatIntakeColStockMatch')]: r.stockMatched ? 'E' : 'H',
      Durum: tm('mgmtMatIntakeStApproved'),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Malzemeler');
    const name = `Malzeme_onayli_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, name);
    toast.success(tm('mgmtMatIntakeExportXlsx'));
  }, [rows, tm]);

  const onPickLabelPhoto: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    const targetId = photoTargetRowId ?? rows[rows.length - 1]?.id;
    if (!file || !targetId) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      updateRow(targetId, { labelPhotoDataUrl: dataUrl || undefined });
      toast.success(tm('mgmtMatIntakePhotoSaved'));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setPhotoTargetRowId(null);
  };

  const runOcrForRow = useCallback(
    async (row: MaterialIntakeDraftRow) => {
      if (!row.labelPhotoDataUrl) {
        toast.error(tm('mgmtMatIntakeOcrNeedPhoto'));
        return;
      }
      setOcrModal({
        rowId: row.id,
        raw: '',
        parsed: { barcode: '', salePrice: 0, nameHint: '', variantHint: '' },
        loading: true,
      });
      try {
        const raw = await visionService.ocrShelfLabelDataUrl(row.labelPhotoDataUrl);
        const parsed = visionService.parseRetailShelfLabel(raw);
        setOcrModal({ rowId: row.id, raw, parsed, loading: false });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`${tm('mgmtMatIntakeOcrErr')} ${msg}`);
        setOcrModal(null);
      }
    },
    [tm]
  );

  const applyOcrModalToRow = useCallback(() => {
    if (!ocrModal || ocrModal.loading) return;
    const { rowId, parsed } = ocrModal;
    updateRow(rowId, {
      ...(parsed.barcode ? { barcode: parsed.barcode } : {}),
      ...(parsed.nameHint ? { name: parsed.nameHint } : {}),
      ...(parsed.variantHint ? { variant: parsed.variantHint } : {}),
      ...(parsed.salePrice > 0 ? { salePrice: parsed.salePrice } : {}),
      stockMatched: false,
    });
    setOcrModal(null);
    toast.success(tm('mgmtMatIntakeOcrApplied'));
  }, [ocrModal, tm, updateRow]);

  const createProductFromRow = useCallback(
    async (row: MaterialIntakeDraftRow) => {
      if (!row.barcode?.trim() || !row.name?.trim()) {
        toast.error(tm('mgmtMatIntakeCreateNeedFields'));
        return;
      }
      if (row.stockMatched) {
        toast.info(tm('mgmtMatIntakeAlreadyStock'));
        return;
      }
      if (row.createdProductId) {
        toast.info(tm('mgmtMatIntakeProductExists'));
        return;
      }
      setCreateLoadingId(row.id);
      try {
        const payload: Omit<Product, 'id'> = {
          name: row.name.trim(),
          barcode: row.barcode.trim(),
          price: row.salePrice || 0,
          cost: 0,
          stock: 0,
          category: '',
          unit: 'Adet',
          taxRate: 0,
        };
        const created = await productAPI.create(payload);
        if (created?.id) {
          updateRow(row.id, { stockMatched: true, createdProductId: created.id });
          toast.success(tm('mgmtMatIntakeProductCreated'));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
      } finally {
        setCreateLoadingId(null);
      }
    },
    [tm, updateRow]
  );

  const statusLabel = (s: RowStatus) => {
    if (s === 'approved') return tm('mgmtMatIntakeStApproved');
    if (s === 'pending') return tm('mgmtMatIntakeStPending');
    return tm('mgmtMatIntakeStDraft');
  };

  return (
    <div className={`h-full min-h-0 flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className={`shrink-0 border-b ${borderClass} ${cardBg} px-4 py-3`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className={`text-lg font-bold ${textClass}`}>{tm('mgmtMatIntakeTitle')}</h1>
            <p className={`text-sm mt-1 ${mutedClass}`}>{tm('mgmtMatIntakeSubtitle')}</p>
            {variant === 'smart' && (
              <p
                className={`text-sm mt-2 rounded-lg border px-3 py-2 ${darkMode ? 'border-amber-500/40 bg-amber-950/40 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-950'}`}
              >
                <Sparkles className="inline w-4 h-4 mr-1.5 align-text-bottom shrink-0" />
                {tm('mgmtMatIntakeSmartBanner')}
              </p>
            )}
            {isMobile && (
              <p className={`text-xs mt-2 flex items-center gap-1.5 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                Kamera izni tarayıcı / uygulama ayarlarından verilmelidir.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              <Camera className="w-4 h-4" />
              {tm('cameraScan')}
            </button>
            <button
              type="button"
              onClick={addRow}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border ${borderClass} ${darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-800'}`}
            >
              <Plus className="w-4 h-4" />
              {tm('mgmtMatIntakeAddRow')}
            </button>
            <button
              type="button"
              onClick={sendPending}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border ${borderClass} ${darkMode ? 'bg-amber-900/40 text-amber-200' : 'bg-amber-50 text-amber-900'}`}
            >
              <Send className="w-4 h-4" />
              {tm('mgmtMatIntakeSendApproval')}
            </button>
            <button
              type="button"
              onClick={exportApprovedXlsx}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border ${borderClass} ${darkMode ? 'bg-emerald-900/30 text-emerald-200' : 'bg-emerald-50 text-emerald-900'}`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              {tm('mgmtMatIntakeExportXlsx')}
            </button>
            {onOpenPurchaseInvoice && (
              <button
                type="button"
                onClick={onOpenPurchaseInvoice}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border ${borderClass} ${darkMode ? 'bg-violet-900/40 text-violet-200' : 'bg-violet-50 text-violet-900'}`}
              >
                <Receipt className="w-4 h-4" />
                {tm('mgmtMatIntakeOpenPurchase')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {rows.length === 0 ? (
          <div className={`rounded-xl border ${borderClass} ${cardBg} p-8 text-center ${mutedClass}`}>
            {tm('mgmtMatIntakeNoRows')}
          </div>
        ) : (
          <div className={`rounded-xl border ${borderClass} overflow-hidden ${cardBg}`}>
            <table className="w-full text-sm">
              <thead className={darkMode ? 'bg-gray-700/80' : 'bg-gray-100'}>
                <tr>
                  <th className={`text-left p-2 font-semibold ${textClass}`}>{tm('mgmtMatIntakeColBarcode')}</th>
                  <th className={`text-left p-2 font-semibold ${textClass}`}>{tm('mgmtMatIntakeColName')}</th>
                  <th className={`text-left p-2 font-semibold ${textClass}`}>{tm('mgmtMatIntakeColVariant')}</th>
                  <th className={`text-right p-2 font-semibold ${textClass}`}>{tm('mgmtMatIntakeColSalePrice')}</th>
                  <th className={`text-left p-2 font-semibold ${textClass}`}>{tm('mgmtMatIntakeColStatus')}</th>
                  <th className="p-2 min-w-[13rem]" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t ${borderClass}`}>
                    <td className="p-2 align-middle">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          value={r.barcode}
                          onChange={(e) =>
                            updateRow(r.id, { barcode: e.target.value, stockMatched: false })
                          }
                          className={`flex-1 min-w-[100px] rounded border px-2 py-1 font-mono text-xs ${borderClass} ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'}`}
                        />
                        {r.stockMatched ? (
                          <span
                            className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-600 text-white"
                            title={tm('mgmtMatIntakeStockHit')}
                          >
                            {tm('mgmtMatIntakeStockBadge')}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-2 align-middle">
                      <input
                        value={r.name}
                        onChange={(e) => updateRow(r.id, { name: e.target.value })}
                        className={`w-full min-w-[140px] rounded border px-2 py-1 text-xs ${borderClass} ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'}`}
                      />
                    </td>
                    <td className="p-2 align-middle">
                      <input
                        value={r.variant}
                        onChange={(e) => updateRow(r.id, { variant: e.target.value })}
                        className={`w-full min-w-[100px] rounded border px-2 py-1 text-xs ${borderClass} ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'}`}
                      />
                    </td>
                    <td className="p-2 align-middle">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={r.salePrice || ''}
                        onChange={(e) => updateRow(r.id, { salePrice: parseFloat(e.target.value) || 0 })}
                        className={`w-full max-w-[120px] ml-auto block rounded border px-2 py-1 text-xs text-right ${borderClass} ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'}`}
                      />
                    </td>
                    <td className={`p-2 align-middle text-xs font-medium ${mutedClass}`}>{statusLabel(r.status)}</td>
                    <td className="p-2 align-middle">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {r.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              title={tm('mgmtMatIntakeApprove')}
                              onClick={() => approveRow(r.id)}
                              className="p-1.5 rounded bg-green-600 text-white hover:bg-green-700"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title={tm('mgmtMatIntakeReject')}
                              onClick={() => rejectRow(r.id)}
                              className="p-1.5 rounded bg-gray-500 text-white hover:bg-gray-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {r.status === 'draft' && (
                          <button
                            type="button"
                            title={tm('mgmtMatIntakeStockLookup')}
                            disabled={lookupRowId === r.id}
                            onClick={() => applyStockLookup(r.id, r.barcode)}
                            className={`p-1.5 rounded border ${borderClass} ${darkMode ? 'text-sky-300' : 'text-sky-700'} disabled:opacity-50`}
                          >
                            {lookupRowId === r.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Search className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          title={tm('mgmtMatIntakePhotoLabel')}
                          onClick={() => {
                            setPhotoTargetRowId(r.id);
                            photoInputRef.current?.click();
                          }}
                          className={`p-1.5 rounded border ${borderClass} ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                        {r.labelPhotoDataUrl ? (
                          <button
                            type="button"
                            title={tm('mgmtMatIntakeOcrBtn')}
                            disabled={!!ocrModal?.loading}
                            onClick={() => void runOcrForRow(r)}
                            className={`p-1.5 rounded border ${borderClass} ${darkMode ? 'text-amber-300' : 'text-amber-700'} disabled:opacity-50`}
                          >
                            <Sparkles className="w-4 h-4" />
                          </button>
                        ) : null}
                        {!r.stockMatched && !r.createdProductId && r.barcode.trim() && r.name.trim() ? (
                          <button
                            type="button"
                            title={tm('mgmtMatIntakeCreateProduct')}
                            disabled={createLoadingId === r.id}
                            onClick={() => void createProductFromRow(r)}
                            className={`p-1.5 rounded border ${borderClass} ${darkMode ? 'text-indigo-300' : 'text-indigo-700'} disabled:opacity-50`}
                          >
                            {createLoadingId === r.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <PackagePlus className="w-4 h-4" />
                            )}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          title="Sil"
                          onClick={() => removeRow(r.id)}
                          className="p-1.5 rounded text-red-500 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPickLabelPhoto}
      />

      {ocrModal ? (
        <FullscreenBodyPortal
          className="flex items-center justify-center bg-black/65 p-3"
          role="dialog"
          aria-modal
          aria-labelledby="ocr-modal-title"
        >
          <div
            className={`w-full max-w-lg rounded-xl border ${borderClass} ${cardBg} shadow-xl p-4 max-h-[90vh] overflow-y-auto`}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 id="ocr-modal-title" className={`text-base font-bold ${textClass}`}>
                {tm('mgmtMatIntakeOcrTitle')}
              </h2>
              <button
                type="button"
                onClick={() => !ocrModal.loading && setOcrModal(null)}
                disabled={ocrModal.loading}
                className="p-1 rounded hover:bg-black/10 disabled:opacity-40"
                aria-label={tm('close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {(() => {
              const img = rows.find((x) => x.id === ocrModal.rowId)?.labelPhotoDataUrl;
              return img ? (
                <img src={img} alt="" className="w-full max-h-40 object-contain rounded border border-gray-600/30 mb-3" />
              ) : null;
            })()}
            {ocrModal.loading ? (
              <div className={`flex items-center justify-center gap-2 py-10 ${mutedClass}`}>
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">{tm('mgmtMatIntakeOcrRun')}…</span>
              </div>
            ) : (
              <>
                <label className={`block text-xs font-semibold mb-1 ${mutedClass}`}>{tm('mgmtMatIntakeOcrRaw')}</label>
                <textarea
                  value={ocrModal.raw}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setOcrModal((m) =>
                      m ? { ...m, raw, parsed: visionService.parseRetailShelfLabel(raw) } : null
                    );
                  }}
                  rows={7}
                  className={`w-full rounded border px-2 py-2 text-xs font-mono mb-3 ${borderClass} ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white'}`}
                />
                <p className={`text-xs font-semibold mb-1 ${mutedClass}`}>{tm('mgmtMatIntakeOcrParsed')}</p>
                <ul className={`text-xs space-y-1 mb-4 ${textClass}`}>
                  <li>
                    {tm('mgmtMatIntakeColBarcode')}: <span className="font-mono">{ocrModal.parsed.barcode || '—'}</span>
                  </li>
                  <li>
                    {tm('mgmtMatIntakeColName')}: {ocrModal.parsed.nameHint || '—'}
                  </li>
                  <li>
                    {tm('mgmtMatIntakeColVariant')}: {ocrModal.parsed.variantHint || '—'}
                  </li>
                  <li>
                    {tm('mgmtMatIntakeColSalePrice')}: {ocrModal.parsed.salePrice > 0 ? ocrModal.parsed.salePrice : '—'}
                  </li>
                </ul>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOcrModal(null)}
                    className={`px-3 py-2 rounded-lg text-sm border ${borderClass}`}
                  >
                    {tm('close')}
                  </button>
                  <button
                    type="button"
                    onClick={applyOcrModalToRow}
                    className="px-3 py-2 rounded-lg text-sm bg-amber-600 text-white font-semibold hover:bg-amber-700"
                  >
                    {tm('mgmtMatIntakeOcrApply')}
                  </button>
                </div>
              </>
            )}
          </div>
        </FullscreenBodyPortal>
      ) : null}

      {scannerOpen && (
        <BarcodeScanner
          isOpen={scannerOpen}
          darkMode={darkMode}
          onScan={onBarcodeScanned}
          onClose={() => setScannerOpen(false)}
          continuous={false}
        />
      )}
    </div>
  );
}
