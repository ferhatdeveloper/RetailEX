import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X, Printer, Tag, Plus, Minus, Search, RotateCw, LayoutGrid, ListChecks } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import type { Product } from '../../../core/types';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { useProductStore } from '../../../store/useProductStore';
import {
  buildJsBarcodeOptions,
  DEFAULT_LABEL_PRINT_FIELD_SETTINGS,
  getLabelPrintFieldSettings,
  saveLabelPrintFieldSettings,
  type BarcodeCaptionMode,
  type LabelPrintFieldSettings,
} from '../../../services/labelPrintFieldSettingsService';
import {
  LABEL_DESIGNS,
  LABEL_SIZES,
  LabelContent,
  RotatedLabel,
  type LabelDesign,
  type LabelSize,
  type PrintRotation,
} from './ProductLabelPrint';
import {
  addProductToBulkQueue,
  addProductsToBulkQueue,
  type BulkLabelQueueItem,
} from './bulkLabelPrintFromProduct';

export interface BulkProductLabelPrintProps {
  onClose: () => void;
  /** Modal açılırken kuyruğa bir kez eklenecek ürünler (ör. tabloda seçili satırlar) */
  initialQueueProducts?: Product[];
  /** Tablodaki güncel seçim — \"Seçilenleri ekle\" ile kuyruğa aktarılır */
  gridSelectedProducts?: Product[];
}

function matchesProductSearch(p: Product, needle: string): boolean {
  const q = needle.trim();
  if (!q) return true;
  const n = q.toLocaleLowerCase('tr-TR');
  const hay = (s: string | undefined) => (s ?? '').toLocaleLowerCase('tr-TR');
  return (
    hay(p.name).includes(n) ||
    hay(p.barcode).includes(n) ||
    hay(p.category).includes(n) ||
    hay(p.code).includes(n) ||
    hay(p.sku).includes(n)
  );
}

export function BulkProductLabelPrint({
  onClose,
  initialQueueProducts,
  gridSelectedProducts,
}: BulkProductLabelPrintProps) {
  const { tm } = useLanguage();
  const { selectedFirma } = useFirmaDonem();
  const currency = (selectedFirma?.ana_para_birimi ?? '').trim() || 'TRY';
  const storeProducts = useProductStore((s) => s.products);
  const loadProducts = useProductStore((s) => s.loadProducts);

  const [queue, setQueue] = useState<BulkLabelQueueItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const seededRef = useRef(false);

  const [selectedSize, setSelectedSize] = useState<LabelSize>(LABEL_SIZES[5]);
  const [selectedDesign, setSelectedDesign] = useState<LabelDesign>(LABEL_DESIGNS[1]);
  const [sizeFilter, setSizeFilter] = useState<'termal' | 'a4' | 'raf' | 'all'>('termal');
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(20);
  const [shelfLocation, setShelfLocation] = useState('');
  const [printRotation, setPrintRotation] = useState<PrintRotation>(() => {
    if (typeof window === 'undefined') return 0;
    const saved = Number(localStorage.getItem('retailex-label-print-rotation'));
    return ([0, 90, 180, 270] as PrintRotation[]).includes(saved as PrintRotation)
      ? (saved as PrintRotation)
      : 0;
  });
  const [leftPanelTab, setLeftPanelTab] = useState<'design' | 'fields'>('design');
  const [fieldSettings, setFieldSettings] = useState<LabelPrintFieldSettings>(DEFAULT_LABEL_PRINT_FIELD_SETTINGS);
  const [fieldSettingsLoading, setFieldSettingsLoading] = useState(true);
  const [fieldSettingsSaving, setFieldSettingsSaving] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('retailex-label-print-rotation', String(printRotation));
    } catch {
      /* ignore */
    }
  }, [printRotation]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getLabelPrintFieldSettings();
        if (!cancelled) setFieldSettings(s);
      } catch {
        if (!cancelled) setFieldSettings(DEFAULT_LABEL_PRINT_FIELD_SETTINGS);
      } finally {
        if (!cancelled) setFieldSettingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (storeProducts.length === 0) void loadProducts();
  }, [storeProducts.length, loadProducts]);

  useEffect(() => {
    if (seededRef.current) return;
    const init = initialQueueProducts;
    if (!init?.length) return;
    seededRef.current = true;
    setQueue((prev) => addProductsToBulkQueue(prev, init));
  }, [initialQueueProducts]);

  const isSideways = printRotation === 90 || printRotation === 270;
  const pageWidthMm = isSideways ? selectedSize.height : selectedSize.width;
  const pageHeightMm = isSideways ? selectedSize.width : selectedSize.height;

  useEffect(() => {
    const timer = setTimeout(() => {
      const cells = queue.flatMap((row, rowIdx) =>
        Array.from({ length: row.quantity }, (_, qIdx) => ({
          barcodeId: `bulk-barcode-${rowIdx}-${qIdx}`,
          qrId: `bulk-qrcode-${rowIdx}-${qIdx}`,
          barcode: row.variant.barcode,
          variantCode: row.variant.variantCode,
        }))
      );
      cells.forEach((cell) => {
        if (selectedDesign.id !== 'qr') {
          const canvas = document.getElementById(cell.barcodeId) as HTMLCanvasElement | null;
          if (canvas && cell.barcode) {
            try {
              const opts = buildJsBarcodeOptions(cell.barcode, cell.variantCode, fieldSettings.barcodeCaptionMode, {
                width: selectedSize.width,
                height: selectedSize.height,
              });
              JsBarcode(canvas, cell.barcode, opts as Parameters<typeof JsBarcode>[2]);
            } catch (err) {
              console.error('Barkod oluşturma hatası:', err);
            }
          }
        }
        if (selectedDesign.id === 'qr') {
          const qrCanvas = document.getElementById(cell.qrId) as HTMLCanvasElement | null;
          if (qrCanvas && cell.barcode) {
            const qrSize = Math.min(selectedSize.width * 3, selectedSize.height * 3);
            QRCode.toCanvas(qrCanvas, cell.barcode, {
              width: qrSize,
              margin: 1,
              errorCorrectionLevel: 'M',
            }).catch((err) => console.error('QR kod hatası:', err));
          }
        }
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [queue, selectedSize, selectedDesign, fieldSettings]);

  const filteredSizes =
    sizeFilter === 'all' ? LABEL_SIZES : LABEL_SIZES.filter((s) => s.category === sizeFilter);

  const filteredProducts = storeProducts.filter(
    (p) => !p.isService && matchesProductSearch(p, searchQuery)
  );

  const totalLabels = queue.reduce((sum, r) => sum + r.quantity, 0);

  const handleDesignChange = (design: LabelDesign) => {
    setSelectedDesign(design);
    if (design.id === 'shelf') {
      const shelfSize = LABEL_SIZES.find((s) => s.id === 'raf-a4-half');
      if (shelfSize) {
        setSelectedSize(shelfSize);
        setSizeFilter('raf');
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const bumpQuantity = (queueKey: string, delta: number) => {
    setQueue((prev) =>
      prev
        .map((r) =>
          r.queueKey === queueKey
            ? { ...r, quantity: Math.max(1, Math.min(999, r.quantity + delta)) }
            : r
        )
        .filter((r) => r.quantity > 0)
    );
  };

  const setQuantity = (queueKey: string, qty: number) => {
    const v = Math.max(1, Math.min(999, qty));
    setQueue((prev) => prev.map((r) => (r.queueKey === queueKey ? { ...r, quantity: v } : r)));
  };

  const removeRow = (queueKey: string) => {
    setQueue((prev) => prev.filter((r) => r.queueKey !== queueKey));
  };

  const clearQueue = () => setQueue([]);

  const gridSelection = gridSelectedProducts?.filter((p) => !p.isService) ?? [];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10050] p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2 text-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Tag className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg truncate">{tm('bulkBarcodeLabelPrint')}</h2>
              <p className="text-xs sm:text-sm text-purple-100 truncate">
                {tm('bulkBarcodeLabelPrintSubtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              disabled={queue.length === 0}
              className="px-3 sm:px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-2 text-xs sm:text-sm font-bold border border-white/30 whitespace-nowrap"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>{tm('print')}</span>
              {queue.length > 0 && (
                <span className="text-[10px] font-mono opacity-90">({totalLabels})</span>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="hover:bg-white/20 p-2 rounded-lg transition-colors"
              aria-label={tm('close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50 shrink-0 min-h-0">
            <div className="shrink-0 flex border-b border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => setLeftPanelTab('design')}
                className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold ${
                  leftPanelTab === 'design'
                    ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50/50'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {tm('labelPrintTabDesign')}
              </button>
              <button
                type="button"
                onClick={() => setLeftPanelTab('fields')}
                className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold ${
                  leftPanelTab === 'fields'
                    ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50/50'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {tm('labelPrintTabFields')}
              </button>
            </div>

            {leftPanelTab === 'design' ? (
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-gray-200 bg-white">
              <label className="text-sm font-medium text-gray-900 mb-2 block">{tm('labelDesign')}</label>
              <div className="grid grid-cols-2 gap-2">
                {LABEL_DESIGNS.map((design) => (
                  <button
                    key={design.id}
                    type="button"
                    onClick={() => handleDesignChange(design)}
                    className={`p-2 text-left border-2 rounded-lg transition-all ${
                      selectedDesign.id === design.id
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="text-lg mb-1">{design.icon}</div>
                    <div className="text-xs font-medium">{tm(design.id)}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {tm(design.id + '_desc') || design.description.split('-')[0]}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 border-b border-gray-200 bg-white">
              <label className="text-sm font-medium text-gray-900 mb-2 block">{tm('labelCategory')}</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSizeFilter('termal')}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg transition-all ${
                    sizeFilter === 'termal' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tm('thermal')}
                </button>
                <button
                  type="button"
                  onClick={() => setSizeFilter('a4')}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg transition-all ${
                    sizeFilter === 'a4' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tm('a4')}
                </button>
                <button
                  type="button"
                  onClick={() => setSizeFilter('raf')}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg transition-all ${
                    sizeFilter === 'raf' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tm('shelfLabelShort')}
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-gray-200 bg-white">
              <label className="text-sm font-medium text-gray-900 mb-2 block">{tm('labelSize')}</label>
              <select
                value={selectedSize.id}
                onChange={(e) => {
                  const size = LABEL_SIZES.find((s) => s.id === e.target.value);
                  if (size) setSelectedSize(size);
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                {filteredSizes.map((size) => (
                  <option key={size.id} value={size.id}>
                    {size.name} - {size.description}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-xs text-gray-500 bg-gray-100 p-2 rounded">
                {tm('size')}: {selectedSize.width}×{selectedSize.height}mm
                {selectedSize.perRow > 1 &&
                  ` • ${selectedSize.perRow}×${selectedSize.perColumn} = ${selectedSize.perRow * selectedSize.perColumn} ${tm('labelCount')}`}
              </div>
            </div>

            <div className="p-4 border-b border-gray-200 bg-white">
              <label className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-purple-600" />
                {tm('printRotation')}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    { value: 0 as PrintRotation, label: '0°', hint: tm('rotationNormal') },
                    { value: 90 as PrintRotation, label: '90°', hint: tm('rotationRight') },
                    { value: 180 as PrintRotation, label: '180°', hint: tm('rotationFlip') },
                    { value: 270 as PrintRotation, label: '270°', hint: tm('rotationLeft') },
                  ] as const
                ).map((opt) => {
                  const active = printRotation === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPrintRotation(opt.value)}
                      title={`${opt.label} — ${opt.hint}`}
                      className={`flex flex-col items-center justify-center gap-1 px-2 py-2 border-2 rounded-lg transition-all ${
                        active
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                      }`}
                    >
                      <div
                        className="text-[14px] font-bold"
                        style={{
                          transform: `rotate(${opt.value}deg)`,
                          transformOrigin: 'center center',
                          transition: 'transform 200ms',
                          lineHeight: 1,
                        }}
                        aria-hidden
                      >
                        A
                      </div>
                      <div className="text-[10px] font-medium">{opt.label}</div>
                      <div className="text-[9px] text-gray-500">{opt.hint}</div>
                    </button>
                  );
                })}
              </div>
              {isSideways && (
                <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 leading-relaxed">
                  {tm('rotationPaperHint')}
                </div>
              )}
            </div>

            {selectedDesign.id === 'promotional' && (
              <div className="p-4 border-b border-gray-200 bg-white">
                <label className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showDiscount}
                    onChange={(e) => setShowDiscount(e.target.checked)}
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded"
                  />
                  {tm('showDiscount')}
                </label>
                {showDiscount && (
                  <div className="mt-2">
                    <label className="text-xs text-gray-600 mb-1 block">{tm('discountRate')} (%)</label>
                    <input
                      type="number"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      min={1}
                      max={99}
                    />
                  </div>
                )}
              </div>
            )}

            {selectedDesign.id === 'shelf' && (
              <div className="p-4 border-b border-gray-200 bg-white">
                <label className="text-sm font-medium text-gray-900 mb-2 block">{tm('shelfLocation')}</label>
                <input
                  type="text"
                  value={shelfLocation}
                  onChange={(e) => setShelfLocation(e.target.value)}
                  placeholder={tm('shelfLocationPlaceholder')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>
            )}

            <div className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 border-t border-gray-200">
              <div className="text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">{tm('bulkQueueProducts')}:</span>
                  <span className="font-bold text-purple-700">{queue.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{tm('totalLabels')}:</span>
                  <span className="font-bold text-purple-700">{totalLabels}</span>
                </div>
              </div>
            </div>
            </div>
            ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-white space-y-4">
              {fieldSettingsLoading ? (
                <p className="text-sm text-gray-500">{tm('loading')}</p>
              ) : (
                <>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{tm('labelPrintFieldsHint')}</p>
                  {(
                    [
                      ['showProductName', tm('labelPrintFieldProductName')] as const,
                      ['showVariantCode', tm('labelPrintFieldVariantCode')] as const,
                      ['showVariantAttributes', tm('labelPrintFieldVariantAttrs')] as const,
                      ['showPrice', tm('labelPrintFieldPrice')] as const,
                      ['showStock', tm('labelPrintFieldStock')] as const,
                      ['showCategory', tm('labelPrintFieldCategory')] as const,
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fieldSettings[key]}
                        onChange={(e) => setFieldSettings((prev) => ({ ...prev, [key]: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  <div className="pt-2 border-t border-gray-100">
                    <label className="text-xs font-semibold text-gray-700 block mb-1.5">{tm('labelPrintBarcodeCaptionLabel')}</label>
                    <select
                      value={fieldSettings.barcodeCaptionMode}
                      onChange={(e) =>
                        setFieldSettings((prev) => ({
                          ...prev,
                          barcodeCaptionMode: e.target.value as BarcodeCaptionMode,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="barcode">{tm('labelPrintBarcodeCaptionBarcode')}</option>
                      <option value="variantCode">{tm('labelPrintBarcodeCaptionVariant')}</option>
                      <option value="both">{tm('labelPrintBarcodeCaptionBoth')}</option>
                      <option value="none">{tm('labelPrintBarcodeCaptionNone')}</option>
                    </select>
                    <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">{tm('labelPrintBarcodeCaptionHint')}</p>
                  </div>
                  <button
                    type="button"
                    disabled={fieldSettingsSaving}
                    onClick={async () => {
                      setFieldSettingsSaving(true);
                      try {
                        await saveLabelPrintFieldSettings(fieldSettings);
                        toast.success(tm('labelFieldSettingsSaved'));
                      } catch {
                        toast.error(tm('labelFieldSettingsSaveFailed'));
                      } finally {
                        setFieldSettingsSaving(false);
                      }
                    }}
                    className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {fieldSettingsSaving ? '…' : tm('labelSaveFieldSettings')}
                  </button>
                </>
              )}
            </div>
            )}
          </div>

          <div className="w-80 border-r border-gray-200 flex flex-col min-w-0 shrink-0">
            <div className="p-4 border-b border-gray-200 bg-white shrink-0">
              <h3 className="font-medium text-gray-900 mb-2">{tm('addProductsToQueue')}</h3>
              {gridSelection.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQueue((prev) => addProductsToBulkQueue(prev, gridSelection))}
                  className="w-full mb-2 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {tm('addGridSelectionToQueue')} ({gridSelection.length})
                </button>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder={tm('productSearchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 bg-white">
              {filteredProducts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">{tm('noDataFound')}</p>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setQueue((prev) => addProductToBulkQueue(prev, p))}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-purple-400 hover:bg-purple-50/50 transition-colors"
                  >
                    <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                    <div className="text-xs text-gray-600 mt-0.5 truncate">
                      {(p.barcode || '—') + (p.code ? ` · ${p.code}` : '')}
                    </div>
                    <div className="text-xs text-purple-700 font-semibold mt-1">
                      {p.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-gray-100 min-w-0 min-h-0">
            <div className="p-4 border-b border-gray-200 bg-white shrink-0 flex items-center justify-between gap-2">
              <h3 className="font-medium text-gray-900">{tm('labelPreview')}</h3>
              <div className="flex items-center gap-2">
                {queue.length > 0 && (
                  <button
                    type="button"
                    onClick={clearQueue}
                    className="text-xs text-red-600 hover:text-red-700 font-medium px-2"
                  >
                    {tm('clearQueue')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={queue.length === 0}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg text-sm"
                >
                  <Printer className="w-4 h-4" />
                  {tm('print')} ({totalLabels})
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              {queue.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <Tag className="w-16 h-16 mx-auto mb-3 opacity-50" />
                    <p className="text-lg mb-1">{tm('bulkQueueEmptyHint')}</p>
                    <p className="text-sm">{tm('bulkQueueEmptyHint2')}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg border border-gray-200 p-3 max-h-48 overflow-y-auto">
                    <div className="text-xs font-semibold text-gray-600 mb-2">{tm('printQueue')}</div>
                    <div className="space-y-2">
                      {queue.map((row) => (
                        <div
                          key={row.queueKey}
                          className="flex items-center gap-2 text-xs border border-gray-100 rounded p-2 bg-gray-50"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{row.productName}</div>
                            <div className="text-gray-500 truncate">
                              {row.variant.variantCode} · {row.variant.barcode || '—'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => bumpQuantity(row.queueKey, -1)}
                              className="p-1 rounded hover:bg-gray-200"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              className="w-12 text-center border rounded text-xs py-0.5"
                              value={row.quantity}
                              min={1}
                              max={999}
                              onChange={(e) => setQuantity(row.queueKey, parseInt(e.target.value, 10) || 1)}
                            />
                            <button
                              type="button"
                              onClick={() => bumpQuantity(row.queueKey, 1)}
                              className="p-1 rounded hover:bg-gray-200"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeRow(row.queueKey)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                              aria-label={tm('delete')}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div ref={printRef} className="print-area">
                    <div
                      className={`grid gap-3 ${
                        selectedSize.perRow === 1
                          ? 'grid-cols-1'
                          : selectedSize.perRow === 2
                            ? 'grid-cols-2'
                            : selectedSize.perRow === 3
                              ? 'grid-cols-3'
                              : selectedSize.perRow === 4
                                ? 'grid-cols-4'
                                : 'grid-cols-5'
                      }`}
                    >
                      {queue.flatMap((row, rowIdx) =>
                        Array.from({ length: row.quantity }, (_, qIdx) => (
                          <RotatedLabel key={`${row.queueKey}-${qIdx}`} rotation={printRotation} size={selectedSize}>
                            <LabelContent
                              variant={row.variant}
                              productName={row.productName}
                              currency={currency}
                              category={row.category}
                              barcodeId={`bulk-barcode-${rowIdx}-${qIdx}`}
                              qrId={`bulk-qrcode-${rowIdx}-${qIdx}`}
                              size={selectedSize}
                              design={selectedDesign}
                              showDiscount={showDiscount}
                              discountPercent={discountPercent}
                              shelfLocation={shelfLocation}
                            />
                          </RotatedLabel>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area,
          .print-area * {
            visibility: visible;
          }
          .print-area {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
          }
          @page {
            margin: ${selectedSize.category === 'termal' ? '0' : '5mm'};
            size: ${selectedSize.category === 'termal' ? `${pageWidthMm}mm ${pageHeightMm}mm` : 'A4 portrait'};
          }
        }
      `}</style>
    </div>
  );
}
