import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { X, Printer, Tag, Plus, Minus, Download, Sparkles, RotateCw, LayoutGrid, ListChecks, ArrowLeftRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import {
  buildJsBarcodeOptions,
  DEFAULT_LABEL_PRINT_FIELD_SETTINGS,
  getLabelPrintFieldSettings,
  normalizeLabelPrintFieldSettings,
  saveLabelPrintFieldSettings,
  type BarcodeCaptionMode,
  type LabelPrintFieldSettings,
} from '../../../services/labelPrintFieldSettingsService';
import {
  LS_LABEL_CUSTOM_HEIGHT_MM,
  LS_LABEL_CUSTOM_MM_ENABLED,
  LS_LABEL_CUSTOM_WIDTH_MM,
  LABEL_MM_MAX,
  LABEL_MM_MIN,
  buildActiveLabelSize,
  readLabelCustomHeightMm,
  readLabelCustomMmEnabled,
  readLabelCustomWidthMm,
} from './labelPrintDimensions';
import { DEFAULT_A4, exportLabelGridToPdfPages, exportToPDF } from '../../reports/designerUtils';
import type { Template } from '../../../core/types/templates';
import {
  buildLabelTemplateFieldValues,
  labelTemplateDesignId,
  TemplateLabelView,
  templateToLabelSize,
} from '../../../services/labelTemplateRender';
import { LabelDesignPicker } from './LabelDesignPicker';

export type PrintRotation = 0 | 90 | 180 | 270;

export interface LabelPrintVariant {
  id: string;
  variantCode: string;
  barcode: string;
  attributes: Record<string, string>;
  salePrice: number;
  enabled: boolean;
  stock?: number;
  cost?: number;
  /** Birim (örn. Adet) — fiyat satırı sağında gösterim */
  unit?: string;
}

interface ProductLabelPrintProps {
  productName: string;
  variants: LabelPrintVariant[];
  currency: string;
  category?: string;
  /** Mağaza etiketi marka satırı (yoksa kategori kökü kullanılır) */
  productBrand?: string;
  /** Birim etiket metni (örn. formdaki satış birimi) */
  productUnit?: string;
  /** Ürün kartı `special_code_2` — etiket satırı (alan açıksa) */
  productSpecialCode2?: string;
  onClose: () => void;
}

export interface LabelSize {
  id: string;
  name: string;
  width: number; // mm
  height: number; // mm
  perRow: number;
  perColumn: number;
  description: string;
  category: 'termal' | 'a4' | 'raf';
}

export interface LabelDesign {
  id: string;
  name: string;
  description: string;
  icon: string;
  supportedSizes: string[]; // 'all' veya specific size ids
}

interface SelectedVariant {
  variant: LabelPrintVariant;
  quantity: number;
}

// GENİŞLETİLMİŞ ETİKET BOYUTLARI
export const LABEL_SIZES: LabelSize[] = [
  // TERMAL YAZICI BOYUTLARI
  {
    id: 't-20x10',
    name: '20x10 mm',
    width: 20,
    height: 10,
    perRow: 1,
    perColumn: 1,
    description: 'Mini fiyat etiketi',
    category: 'termal'
  },
  {
    id: 't-30x20',
    name: '30x20 mm',
    width: 30,
    height: 20,
    perRow: 1,
    perColumn: 1,
    description: 'Takı/Aksesuar etiketi',
    category: 'termal'
  },
  {
    id: 't-40x25',
    name: '40x25 mm',
    width: 40,
    height: 25,
    perRow: 1,
    perColumn: 1,
    description: 'Kozmetik/İlaç etiketi',
    category: 'termal'
  },
  {
    id: 't-50x30',
    name: '50x30 mm',
    width: 50,
    height: 30,
    perRow: 1,
    perColumn: 1,
    description: 'Gıda etiketi',
    category: 'termal'
  },
  {
    id: 't-60x40',
    name: '60x40 mm',
    width: 60,
    height: 40,
    perRow: 1,
    perColumn: 1,
    description: 'Standart ürün etiketi',
    category: 'termal'
  },
  {
    id: 't-70x42',
    name: '70x42 mm',
    width: 70,
    height: 42,
    perRow: 1,
    perColumn: 1,
    description: 'Geniş ürün etiketi',
    category: 'termal'
  },
  {
    id: 't-100x50',
    name: '100x50 mm',
    width: 100,
    height: 50,
    perRow: 1,
    perColumn: 1,
    description: 'Büyük ürün etiketi',
    category: 'termal'
  },
  {
    id: 't-100x70',
    name: '100x70 mm',
    width: 100,
    height: 70,
    perRow: 1,
    perColumn: 1,
    description: 'Kargo/Lojistik etiketi',
    category: 'termal'
  },
  {
    id: 't-100x100',
    name: '100x100 mm',
    width: 100,
    height: 100,
    perRow: 1,
    perColumn: 1,
    description: 'Kare özel etiket',
    category: 'termal'
  },

  // A4 SAYFA BOYUTLARI
  {
    id: 'a4-2x4',
    name: 'A4 - 2x4 (8 etiket)',
    width: 105,
    height: 74,
    perRow: 2,
    perColumn: 4,
    description: 'Büyük boy etiket',
    category: 'a4'
  },
  {
    id: 'a4-2x7',
    name: 'A4 - 2x7 (14 etiket)',
    width: 99,
    height: 38,
    perRow: 2,
    perColumn: 7,
    description: 'Orta boy etiket',
    category: 'a4'
  },
  {
    id: 'a4-3x7',
    name: 'A4 - 3x7 (21 etiket)',
    width: 70,
    height: 42,
    perRow: 3,
    perColumn: 7,
    description: 'Standart etiket',
    category: 'a4'
  },
  {
    id: 'a4-3x8',
    name: 'A4 - 3x8 (24 etiket)',
    width: 63.5,
    height: 33.9,
    perRow: 3,
    perColumn: 8,
    description: 'Yaygın kullanılan',
    category: 'a4'
  },
  {
    id: 'a4-3x9',
    name: 'A4 - 3x9 (27 etiket)',
    width: 70,
    height: 32,
    perRow: 3,
    perColumn: 9,
    description: 'Kompakt etiket',
    category: 'a4'
  },
  {
    id: 'a4-4x10',
    name: 'A4 - 4x10 (40 etiket)',
    width: 48,
    height: 25,
    perRow: 4,
    perColumn: 10,
    description: 'Küçük boy etiket',
    category: 'a4'
  },
  {
    id: 'a4-5x13',
    name: 'A4 - 5x13 (65 etiket)',
    width: 38,
    height: 21,
    perRow: 5,
    perColumn: 13,
    description: 'Mini etiket',
    category: 'a4'
  },

  // RAF ETİKETLERİ - BÜYÜK FORMAT
  {
    id: 'raf-a4-full',
    name: 'A4 Tam Sayfa',
    width: 210,
    height: 297,
    perRow: 1,
    perColumn: 1,
    description: 'Tek büyük raf etiketi',
    category: 'raf'
  },
  {
    id: 'raf-a4-half',
    name: 'A4 Yarım (2 etiket)',
    width: 210,
    height: 148,
    perRow: 1,
    perColumn: 2,
    description: 'İki raf etiketi',
    category: 'raf'
  },
  {
    id: 'raf-a5',
    name: 'A5 (4 etiket)',
    width: 148,
    height: 105,
    perRow: 2,
    perColumn: 2,
    description: 'Dört raf etiketi',
    category: 'raf'
  },
  {
    id: 'raf-landscape',
    name: 'Yatay Raf (A4/3)',
    width: 210,
    height: 99,
    perRow: 1,
    perColumn: 3,
    description: 'Üç yatay etiket',
    category: 'raf'
  }
];

// ETİKET TASARIMLARI
export const LABEL_DESIGNS: LabelDesign[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Sadece fiyat ve barkod - Hızlı satış',
    icon: '⚡',
    supportedSizes: ['all']
  },
  {
    id: 'standard',
    name: 'Standart',
    description: 'Ürün bilgisi + Barkod + Fiyat',
    icon: '\u{1F4CB}',
    supportedSizes: ['all']
  },
  {
    id: 'detailed',
    name: 'Detaylı',
    description: 'Tüm bilgiler + Varyant özellikleri',
    icon: '\u{1F4DD}',
    supportedSizes: ['all']
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Şık tasarım + Gradient + Logo alanı',
    icon: '✨',
    supportedSizes: ['all']
  },
  {
    id: 'promotional',
    name: 'Promosyon',
    description: 'İndirim göstergeli + Eski-Yeni fiyat',
    icon: '\u{1F525}',
    supportedSizes: ['all']
  },
  {
    id: 'qr',
    name: 'QR Kodlu',
    description: 'QR kod + Dijital entegrasyon',
    icon: '\u{1F4F1}',
    supportedSizes: ['all']
  },
  {
    id: 'shelf',
    name: 'Raf Etiketi',
    description: 'Büyük font + Stok bilgisi + Konum',
    icon: '\u{1F3F7}\u{FE0F}',
    supportedSizes: ['raf-a4-full', 'raf-a4-half', 'raf-a5', 'raf-landscape']
  }
];

const DEFAULT_LABEL_SIZE = LABEL_SIZES.find((s) => s.id === 't-60x40') ?? LABEL_SIZES[0];

export function ProductLabelPrint({
  productName,
  variants,
  currency,
  category,
  productBrand,
  productUnit,
  productSpecialCode2,
  onClose,
}: ProductLabelPrintProps) {
  const { tm } = useLanguage();
  const [selectedSize, setSelectedSize] = useState<LabelSize>(DEFAULT_LABEL_SIZE);
  const [selectedDesign, setSelectedDesign] = useState<LabelDesign>(LABEL_DESIGNS[1]); // Standard default
  const [selectedCustomTemplate, setSelectedCustomTemplate] = useState<Template | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<SelectedVariant[]>([]);
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
  const [pdfExporting, setPdfExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

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

  // Yön tercihini hatırla (yazıcıya kağıt yerleştirme şekli sabit kalır)
  useEffect(() => {
    try {
      localStorage.setItem('retailex-label-print-rotation', String(printRotation));
    } catch {
      /* sessizce yoksay */
    }
  }, [printRotation]);

  const presetDefault = DEFAULT_LABEL_SIZE;
  const [useCustomMm, setUseCustomMm] = useState(() => readLabelCustomMmEnabled());
  const [customWidthMm, setCustomWidthMm] = useState(() => readLabelCustomWidthMm(presetDefault.width));
  const [customHeightMm, setCustomHeightMm] = useState(() => readLabelCustomHeightMm(presetDefault.height));
  const prevPresetSizeIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LABEL_CUSTOM_MM_ENABLED, useCustomMm ? '1' : '0');
      localStorage.setItem(LS_LABEL_CUSTOM_WIDTH_MM, String(customWidthMm));
      localStorage.setItem(LS_LABEL_CUSTOM_HEIGHT_MM, String(customHeightMm));
    } catch {
      /* sessizce yoksay */
    }
  }, [useCustomMm, customWidthMm, customHeightMm]);

  useEffect(() => {
    if (!useCustomMm) {
      prevPresetSizeIdRef.current = selectedSize.id;
      return;
    }
    const prev = prevPresetSizeIdRef.current;
    if (prev !== null && prev !== selectedSize.id) {
      setCustomWidthMm(selectedSize.width);
      setCustomHeightMm(selectedSize.height);
    }
    prevPresetSizeIdRef.current = selectedSize.id;
  }, [selectedSize.id, selectedSize.width, selectedSize.height, useCustomMm]);

  const sizePreset = selectedCustomTemplate
    ? templateToLabelSize(selectedCustomTemplate, selectedSize.category)
    : selectedSize;

  const activePrintSize = useMemo(
    () =>
      buildActiveLabelSize(
        sizePreset,
        useCustomMm && !selectedCustomTemplate,
        customWidthMm,
        customHeightMm,
      ),
    [sizePreset, useCustomMm, selectedCustomTemplate, customWidthMm, customHeightMm],
  );

  // 90°/270° için fiziksel sayfa boyutu (kağıt yatay beslenirse w/h yer değişir)
  const isSideways = printRotation === 90 || printRotation === 270;
  const pageWidthMm = isSideways ? activePrintSize.height : activePrintSize.width;
  const pageHeightMm = isSideways ? activePrintSize.width : activePrintSize.height;

  // Barkodları ve QR kodları otomatik oluştur
  useEffect(() => {
    if (selectedCustomTemplate) return;
    const timer = setTimeout(() => {
      const cells = selectedVariants.flatMap((sv, svIdx) =>
        Array.from({ length: sv.quantity }, (_, qIdx) => ({
          barcodeId: `barcode-${svIdx}-${qIdx}`,
          qrId: `qrcode-${svIdx}-${qIdx}`,
          barcode: sv.variant.barcode,
          variantCode: sv.variant.variantCode,
        }))
      );
      cells.forEach((cell) => {
        if (selectedDesign.id !== 'qr') {
          const canvas = document.getElementById(cell.barcodeId) as HTMLCanvasElement;
          if (canvas && cell.barcode) {
            try {
              const opts = buildJsBarcodeOptions(cell.barcode, cell.variantCode, fieldSettings.barcodeCaptionMode, {
                width: activePrintSize.width,
                height: activePrintSize.height,
              });
              JsBarcode(canvas, cell.barcode, opts as Parameters<typeof JsBarcode>[2]);
            } catch (err) {
              console.error('Barkod oluşturma hatası:', err);
            }
          }
        }

        if (selectedDesign.id === 'qr') {
          const qrCanvas = document.getElementById(cell.qrId) as HTMLCanvasElement;
          if (qrCanvas && cell.barcode) {
            const qrSize = Math.min(activePrintSize.width * 3, activePrintSize.height * 3);
            QRCode.toCanvas(qrCanvas, cell.barcode, {
              width: qrSize,
              margin: 1,
              errorCorrectionLevel: 'M'
            }).catch((err: unknown) => console.error('QR kod hatası:', err));
          }
        }
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [selectedVariants, activePrintSize, selectedDesign, fieldSettings, selectedCustomTemplate]);

  // Varyant seç/kaldır
  const toggleVariant = (variant: LabelPrintVariant) => {
    const exists = selectedVariants.find(sv => sv.variant.id === variant.id);
    if (exists) {
      setSelectedVariants(selectedVariants.filter(sv => sv.variant.id !== variant.id));
    } else {
      setSelectedVariants([...selectedVariants, { variant, quantity: 1 }]);
    }
  };

  // Miktar değiştir
  const updateQuantity = (variantId: string, delta: number) => {
    setSelectedVariants(selectedVariants.map(sv => {
      if (sv.variant.id === variantId) {
        const newQty = Math.max(1, Math.min(999, sv.quantity + delta));
        return { ...sv, quantity: newQty };
      }
      return sv;
    }));
  };

  // Tüm varyantları seç
  const selectAllVariants = () => {
    const enabledVariants = variants.filter(v => v.enabled);
    setSelectedVariants(enabledVariants.map(v => ({ variant: v, quantity: 1 })));
  };

  // Tümünü temizle
  const clearAll = () => {
    setSelectedVariants([]);
  };

  // Toplam etiket sayısı
  const totalLabels = selectedVariants.reduce((sum, sv) => sum + sv.quantity, 0);

  // Filtrelenmiş boyutlar
  const filteredSizes = sizeFilter === 'all'
    ? LABEL_SIZES
    : LABEL_SIZES.filter(s => s.category === sizeFilter);

  // Yazdırma fonksiyonu
  const handlePrint = () => {
    window.print();
  };

  const handlePdfExport = async () => {
    if (selectedVariants.length === 0) {
      toast.error(tm('selectVariantForLabel'));
      return;
    }
    const root = printRef.current;
    if (!root) return;
    setPdfExporting(true);
    try {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise((r) => setTimeout(r, 220));
      const fname = `retailex-etiket-${new Date().toISOString().slice(0, 10)}.pdf`;
      const pdfCategory = selectedCustomTemplate ? 'termal' : selectedSize.category;
      if (pdfCategory === 'termal') {
        const cells = Array.from(root.querySelectorAll('.rotated-label-wrapper')) as HTMLElement[];
        if (cells.length > 0) {
          await exportLabelGridToPdfPages(root, cells, fname, { width: pageWidthMm, height: pageHeightMm });
        } else {
          await exportToPDF(root, fname, { width: pageWidthMm, height: pageHeightMm });
        }
      } else {
        await exportToPDF(root, fname, DEFAULT_A4);
      }
      toast.success(tm('bulkLabelPdfReady'));
    } catch (e) {
      toast.error((e as Error)?.message || tm('bulkLabelPdfExportFailed'));
    } finally {
      setPdfExporting(false);
    }
  };

  // Tasarım değiştiğinde uygun boyut seç
  const handleDesignChange = (design: LabelDesign) => {
    setSelectedCustomTemplate(null);
    setSelectedDesign(design);

    // Raf etiketi seçilirse raf boyutunu ayarla
    if (design.id === 'shelf') {
      const shelfSize = LABEL_SIZES.find(s => s.id === 'raf-a4-half');
      if (shelfSize) {
        setSelectedSize(shelfSize);
        setSizeFilter('raf');
      }
    }
  };

  const handleTemplateSelect = (template: Template) => {
    setSelectedCustomTemplate(template);
    setSelectedDesign({
      id: labelTemplateDesignId(template.id),
      name: template.name,
      description: template.description ?? '',
      icon: '✨',
      supportedSizes: ['all'],
    });
    const matched = LABEL_SIZES.find(
      (s) => s.width === template.width && s.height === template.height,
    );
    if (matched) {
      setSelectedSize(matched);
    } else {
      setSelectedSize(templateToLabelSize(template, 'termal'));
    }
    setUseCustomMm(false);
  };

  const selectedDesignId = selectedCustomTemplate
    ? labelTemplateDesignId(selectedCustomTemplate.id)
    : selectedDesign.id;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10050] p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header — Yazdır her zaman görünür (yan paneller kaydırılsa bile) */}
        <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2 text-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Tag className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg truncate">{tm('professionalLabelPrint')}</h2>
              <p className="text-xs sm:text-sm text-purple-100 truncate">{productName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePdfExport}
              disabled={selectedVariants.length === 0 || pdfExporting}
              className="px-3 sm:px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-2 text-xs sm:text-sm font-bold border border-white/30 whitespace-nowrap"
              title={tm('bulkLabelPdfDownload')}
            >
              <Download className="w-4 h-4 shrink-0" />
              {pdfExporting ? '…' : tm('bulkLabelPdfDownload')}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={selectedVariants.length === 0}
              className="px-3 sm:px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-2 text-xs sm:text-sm font-bold border border-white/30 whitespace-nowrap"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>{tm('print')}</span>
              {selectedVariants.length > 0 && (
                <span className="text-[10px] font-mono opacity-90">({totalLabels})</span>
              )}
            </button>
            <button type="button" onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-colors" aria-label={tm('close')}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* Sol Panel - Ayarlar */}
          <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50 min-h-0 shrink-0">
            <div className="shrink-0 flex border-b border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => setLeftPanelTab('design')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
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
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
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
            {/* Tasarım Seçimi */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <label className="text-sm font-medium text-gray-900 mb-2 block">{tm('labelDesign')}</label>
              <LabelDesignPicker
                selectedDesignId={selectedDesignId}
                onSelectBuiltin={handleDesignChange}
                onSelectTemplate={handleTemplateSelect}
                tm={tm}
              />
            </div>

            {/* Boyut Filtresi */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <label className="text-sm font-medium text-gray-900 mb-2 block">{tm('labelCategory')}</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSizeFilter('termal')}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg transition-all ${sizeFilter === 'termal' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {tm('thermal')}
                </button>
                <button
                  onClick={() => setSizeFilter('a4')}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg transition-all ${sizeFilter === 'a4' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  📄 {tm('a4')}
                </button>
                <button
                  onClick={() => setSizeFilter('raf')}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg transition-all ${sizeFilter === 'raf' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {tm('shelfLabelShort')}
                </button>
              </div>
            </div>

            {/* Etiket Boyutu */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <label className="text-sm font-medium text-gray-900 mb-2 block">{tm('labelSize')}</label>
              {selectedCustomTemplate && (
                <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5 mb-2">
                  {tm('labelTemplateSizeHint')}: {selectedCustomTemplate.width}×{selectedCustomTemplate.height} mm
                </p>
              )}
              <select
                value={selectedSize.id}
                disabled={!!selectedCustomTemplate}
                onChange={(e) => {
                  const size = LABEL_SIZES.find(s => s.id === e.target.value);
                  if (size) setSelectedSize(size);
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 disabled:text-gray-500"
              >
                {filteredSizes.map(size => (
                  <option key={size.id} value={size.id}>
                    {size.name} - {size.description}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-xs text-gray-500 bg-gray-100 p-2 rounded">
                {tm('size')}: {activePrintSize.width}×{activePrintSize.height}mm
                {selectedSize.perRow > 1 &&
                  ` • ${selectedSize.perRow}×${selectedSize.perColumn} = ${selectedSize.perRow * selectedSize.perColumn} ${tm('labelCount')}`}
                {useCustomMm && (
                  <span className="block mt-1 text-purple-700 font-medium">
                    {tm('labelPreset')}: {selectedSize.name}
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomMm}
                    disabled={!!selectedCustomTemplate}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setUseCustomMm(on);
                      if (on) {
                        setCustomWidthMm(selectedSize.width);
                        setCustomHeightMm(selectedSize.height);
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  {tm('labelCustomMmEnabled')}
                </label>
                {useCustomMm && (
                  <>
                    <p className="text-[11px] text-gray-500 leading-relaxed">{tm('labelCustomMmHint')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-medium text-gray-600 block mb-1">{tm('labelWidthMmHorizontal')}</label>
                        <input
                          type="number"
                          min={LABEL_MM_MIN}
                          max={LABEL_MM_MAX}
                          step={1}
                          value={customWidthMm}
                          onChange={(e) => setCustomWidthMm(Number(e.target.value))}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-gray-600 block mb-1">{tm('labelHeightMmVertical')}</label>
                        <input
                          type="number"
                          min={LABEL_MM_MIN}
                          max={LABEL_MM_MAX}
                          step={1}
                          value={customHeightMm}
                          onChange={(e) => setCustomHeightMm(Number(e.target.value))}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const w = customWidthMm;
                        setCustomWidthMm(customHeightMm);
                        setCustomHeightMm(w);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-2 py-2 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      {tm('labelSwapWidthHeight')}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Yazdırma Yönü */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <label className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-purple-600" />
                {tm('printRotation') || 'Yazdırma Yönü'}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {([
                  { value: 0, label: '0°', hint: tm('rotationNormal') || 'Normal' },
                  { value: 90, label: '90°', hint: tm('rotationRight') || 'Sağa' },
                  { value: 180, label: '180°', hint: tm('rotationFlip') || 'Ters' },
                  { value: 270, label: '270°', hint: tm('rotationLeft') || 'Sola' },
                ] as Array<{ value: PrintRotation; label: string; hint: string }>).map((opt) => {
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
                  {tm('rotationPaperHint') ||
                    'Yatay döndürmede yazıcıya gönderilen sayfa boyutu yer değiştirir. Termal yazıcıda etiketin besleme yönünü kontrol edin.'}
                </div>
              )}
            </div>

            {/* Promosyon Ayarları */}
            {!selectedCustomTemplate && selectedDesign.id === 'promotional' && (
              <div className="p-4 border-b border-gray-200 bg-white">
                <label className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showDiscount}
                    onChange={(e) => setShowDiscount(e.target.checked)}
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded"
                  />
                  🔥 {tm('showDiscount')}
                </label>
                {showDiscount && (
                  <div className="mt-2">
                    <label className="text-xs text-gray-600 mb-1 block">{tm('discountRate')} (%)</label>
                    <input
                      type="number"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      min="1"
                      max="99"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Raf Konumu */}
            {!selectedCustomTemplate && selectedDesign.id === 'shelf' && (
              <div className="p-4 border-b border-gray-200 bg-white">
                <label className="text-sm font-medium text-gray-900 mb-2 block">{tm('shelfLocation')}</label>
                <input
                  type="text"
                  value={shelfLocation}
                  onChange={(e) => setShelfLocation(e.target.value)}
                  placeholder="Örn: A-12, Koridor 3"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>
            )}

            {/* Özet */}
            <div className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 border-t border-gray-200">
              <div className="text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">{tm('selectedVariant')}:</span>
                  <span className="font-bold text-purple-700">{selectedVariants.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{tm('totalLabels')}:</span>
                  <span className="font-bold text-purple-700">{totalLabels}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{tm('labelDesign')}:</span>
                  <span className="font-medium text-purple-700">{selectedDesign.icon} {tm(selectedDesign.id)}</span>
                </div>
              </div>
            </div>
            </div>
            ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-white space-y-4">
              {fieldSettingsLoading ? (
                <p className="text-sm text-gray-500">{tm('loading') || '…'}</p>
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
                      ['showSpecialCode2', tm('labelPrintFieldSpecialCode2')] as const,
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

          {/* Orta Panel - Varyant Seçimi */}
          <div className="w-80 border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-900">{tm('variantSelection')}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllVariants}
                    className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    {tm('all')}
                  </button>
                  <button
                    onClick={clearAll}
                    className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    {tm('clear')}
                  </button>
                </div>
              </div>
            </div>

            {/* Varyant Listesi */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {variants.filter(v => v.enabled).map(variant => {
                  const selected = selectedVariants.find(sv => sv.variant.id === variant.id);
                  const isSelected = !!selected;

                  return (
                    <div
                      key={variant.id}
                      className={`border rounded-lg p-3 transition-all ${isSelected
                        ? 'border-purple-500 bg-purple-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleVariant(variant)}
                          className="mt-0.5 w-4 h-4 text-purple-600 border-gray-300 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {variant.variantCode}
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {Object.entries(variant.attributes).map(([key, value]) => (
                              <span key={key} className="mr-2">
                                {key}: <span className="font-medium">{value}</span>
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs">
                            <span className="text-purple-700 font-bold">
                              {variant.salePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}
                            </span>
                            {variant.stock !== undefined && (
                              <span className="text-gray-500">
                                • {tm('stock')}: {variant.stock}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-purple-200">
                          <span className="text-xs text-gray-600">{tm('unitCount')}:</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateQuantity(variant.id, -1)}
                              className="p-1 hover:bg-purple-200 rounded transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              value={selected.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1;
                                setSelectedVariants(selectedVariants.map(sv =>
                                  sv.variant.id === variant.id ? { ...sv, quantity: Math.max(1, Math.min(999, val)) } : sv
                                ));
                              }}
                              className="w-16 px-2 py-1 bg-white border border-purple-300 rounded text-sm font-medium text-center"
                            />
                            <button
                              onClick={() => updateQuantity(variant.id, 1)}
                              className="p-1 hover:bg-purple-200 rounded transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sağ Panel - Önizleme */}
          <div className="flex-1 flex flex-col bg-gray-100">
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-medium text-gray-900">{tm('labelPreview')}</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePdfExport}
                    disabled={selectedVariants.length === 0 || pdfExporting}
                    className="px-4 py-2 bg-white border border-purple-200 text-purple-800 rounded-lg hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow text-sm"
                    title={tm('bulkLabelPdfDownload')}
                  >
                    <Download className="w-4 h-4" />
                    {pdfExporting ? '…' : tm('bulkLabelPdfDownload')}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={selectedVariants.length === 0}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                  >
                    <Printer className="w-4 h-4" />
                    {tm('print')} ({totalLabels})
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {selectedVariants.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <Tag className="w-16 h-16 mx-auto mb-3 opacity-50" />
                    <p className="text-lg mb-1">Etiket yazdırmak için varyant seçin</p>
                    <p className="text-sm">Sol panelden varyantları işaretleyin</p>
                  </div>
                </div>
              ) : (
                <div ref={printRef} className="print-area">
                  <div
                    className={`thermal-print-label-grid grid gap-3 ${selectedSize.perRow === 1
                    ? 'grid-cols-1'
                    : selectedSize.perRow === 2
                      ? 'grid-cols-2'
                      : selectedSize.perRow === 3
                        ? 'grid-cols-3'
                        : selectedSize.perRow === 4
                          ? 'grid-cols-4'
                          : 'grid-cols-5'
                    }`}>
                    {selectedVariants.flatMap((sv, svIdx) =>
                      Array.from({ length: sv.quantity }, (_, qIdx) => {
                        const instanceKey = `${svIdx}-${qIdx}`;
                        return (
                          <RotatedLabel
                            key={instanceKey}
                            rotation={printRotation}
                            size={activePrintSize}
                          >
                            {selectedCustomTemplate ? (
                              <TemplateLabelView
                                template={selectedCustomTemplate}
                                instanceKey={instanceKey}
                                fieldSettings={fieldSettings}
                                fields={buildLabelTemplateFieldValues({
                                  productName,
                                  barcode: sv.variant.barcode,
                                  variantCode: sv.variant.variantCode,
                                  salePrice: sv.variant.salePrice,
                                  currency,
                                  category,
                                  stock: sv.variant.stock,
                                  sku: sv.variant.variantCode,
                                  specialCode2: productSpecialCode2,
                                })}
                              />
                            ) : (
                              <LabelContent
                                variant={sv.variant}
                                productName={productName}
                                currency={currency}
                                category={category}
                                productBrand={productBrand}
                                productUnit={productUnit}
                                productSpecialCode2={productSpecialCode2}
                                barcodeId={`barcode-${svIdx}-${qIdx}`}
                                qrId={`qrcode-${svIdx}-${qIdx}`}
                                size={activePrintSize}
                                design={selectedDesign}
                                showDiscount={showDiscount}
                                discountPercent={discountPercent}
                                shelfLocation={shelfLocation}
                                fieldSettings={fieldSettings}
                              />
                            )}
                          </RotatedLabel>
                        );
                      }),
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{buildLabelPrintStyleBlock({
        category: selectedCustomTemplate ? 'termal' : selectedSize.category,
        pageWidthMm,
        pageHeightMm,
        thermalOneLabelPerPage: selectedCustomTemplate ? true : selectedSize.category === 'termal',
      })}</style>
    </div>
  );
}

/** Ortak @media print — barkod/rakam netliği, termal mm @page, çoklu etikette sayfa başına bir adet */
export function buildLabelPrintStyleBlock(p: {
  category: 'termal' | 'a4' | 'raf';
  pageWidthMm: number;
  pageHeightMm: number;
  /** Termalde her `.rotated-label-wrapper` ayrı fiziksel sayfa (modal boyutu = @page) */
  thermalOneLabelPerPage?: boolean;
}): string {
  const thermal = p.category === 'termal';
  const w = p.pageWidthMm;
  const h = p.pageHeightMm;
  const onePer = thermal && p.thermalOneLabelPerPage !== false;
  const htmlBodySizing =
    thermal && onePer
      ? `width: auto !important;
    height: auto !important;
    max-width: none !important;
    max-height: none !important;
    overflow: visible !important;`
      : thermal && !onePer
        ? `width: ${w}mm !important;
    height: ${h}mm !important;
    max-width: ${w}mm !important;
    max-height: ${h}mm !important;
    overflow: hidden !important;`
        : '';

  const thermalPrintFlowOverrides = onePer
      ? `
  .print-area {
    position: static !important;
    top: auto !important;
    left: auto !important;
    width: auto !important;
    max-width: none !important;
    height: auto !important;
    overflow: visible !important;
  }
  .thermal-print-label-grid {
    display: block !important;
    width: auto !important;
  }
  .thermal-print-label-grid > .rotated-label-wrapper {
    page-break-after: always !important;
    break-after: page !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    margin: 0 auto !important;
  }
  .thermal-print-label-grid > .rotated-label-wrapper:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
  }
`
      : '';

  return `
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    ${htmlBodySizing}
  }
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
    font-variant-numeric: tabular-nums;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  ${thermalPrintFlowOverrides}
  .print-area canvas {
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
  }
  .print-area .text-gray-700,
  .print-area .text-gray-600,
  .print-area .text-gray-500 {
    color: #111827 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .print-area .text-black {
    color: #000 !important;
  }
  .rotated-label-wrapper {
    overflow: visible !important;
  }
  @page {
    margin: ${thermal ? '0' : '5mm'};
    size: ${thermal ? `${w}mm ${h}mm` : 'A4 portrait'};
  }
}
`;
}

/**
 * Etiketi seçili açıyla döndüren konteyner.
 * 90°/270°'de görsel kutu boyutu yer değiştirir; barkod, fiyat ve metin
 * etiketle birlikte fiziksel olarak da yazıcıya döndürülmüş gönderilir.
 */
export function RotatedLabel({
  rotation,
  size,
  children,
}: {
  rotation: PrintRotation;
  size: LabelSize;
  children: ReactNode;
}) {
  if (rotation === 0) {
    // Grid hücresi etiketten geniş olduğunda (perRow>1) sarmalayıcı sütuna yayılır; html2canvas
    // PDF kırpması boş sağ alanı da alır — sabit mm genişlik + hizalama ile kutu = etiket boyutu.
    return (
      <div
        className="rotated-label-wrapper overflow-visible justify-self-center self-start"
        style={{
          width: `${size.width}mm`,
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
    );
  }

  const sideways = rotation === 90 || rotation === 270;
  const outerWidth = sideways ? size.height : size.width;
  const outerHeight = sideways ? size.width : size.height;

  return (
    <div
      className="rotated-label-wrapper overflow-hidden print:overflow-visible"
      style={{
        width: `${outerWidth}mm`,
        height: `${outerHeight}mm`,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface LabelContentProps {
  variant: LabelPrintVariant;
  productName: string;
  currency: string;
  category?: string;
  productBrand?: string;
  productUnit?: string;
  /** Ürün `special_code_2` — standart/detaylı etiket satırı */
  productSpecialCode2?: string;
  barcodeId?: string;
  qrId?: string;
  size: LabelSize;
  design: LabelDesign;
  showDiscount?: boolean;
  discountPercent?: number;
  shelfLocation?: string;
  /** Firma bazlı etiket alanı tercihleri (kısmi merge edilir) */
  fieldSettings?: Partial<LabelPrintFieldSettings>;
}

export function LabelContent({
  variant,
  productName,
  currency,
  category,
  productBrand,
  productUnit,
  productSpecialCode2,
  barcodeId,
  qrId,
  size,
  design,
  showDiscount,
  discountPercent,
  shelfLocation,
  fieldSettings,
}: LabelContentProps) {
  const f = normalizeLabelPrintFieldSettings(fieldSettings);
  const rawSc2 = typeof productSpecialCode2 === 'string' ? productSpecialCode2.trim() : '';
  const sc2Line =
    f.showSpecialCode2 && rawSc2 !== ''
      ? rawSc2
      : '';
  const isSmall = size.width < 50;
  const isMedium = size.width >= 50 && size.width < 80;
  const isLarge = size.width >= 80 && size.width < 150;
  const isXLarge = size.width >= 150;
  const barcodeDataAttrs = {
    'data-barcode-value': variant.barcode || '',
    'data-variant-code': variant.variantCode || '',
    'data-barcode-caption-mode': f.barcodeCaptionMode,
    'data-label-width-mm': String(size.width),
    'data-label-height-mm': String(size.height),
  };
  const qrDataAttrs = {
    'data-qr-value': variant.barcode || '',
    'data-qr-margin': '1',
  };

  const oldPrice = showDiscount && discountPercent ? variant.salePrice / (1 - discountPercent / 100) : 0;

  // MINIMAL DESIGN
  if (design.id === 'minimal') {
    return (
      <div
        className="border border-gray-300 bg-white rounded overflow-hidden"
        style={{
          width: `${size.width}mm`,
          height: `${size.height}mm`,
          padding: '1mm'
        }}
      >
        <div className="h-full flex flex-col justify-center items-center text-black">
          {variant.barcode && (
            <canvas
              id={barcodeId}
              {...barcodeDataAttrs}
              style={{
                maxWidth: '95%',
                height: isSmall ? '12mm' : '18mm'
              }}
            />
          )}
          {f.showPrice && (
          <div className={`${isSmall ? 'text-[10px]' : 'text-[14px]'} font-bold mt-1`}>
            {variant.salePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}
          </div>
          )}
        </div>
      </div>
    );
  }

  // STANDARD DESIGN — mağaza / hızlı etiket düzeni: marka, kod+ad, fiyat | stok+birim, barkod
  if (design.id === 'standard') {
    const catFirst = (category || '').split(/[>/|]/)[0]?.trim() || '';
    const brandLine = ((productBrand || '').trim() || catFirst || '—').toLocaleUpperCase('tr-TR');
    const titleLine = `${variant.variantCode} ${productName}`.replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr-TR');
    const unitStr = (productUnit || variant.unit || 'Adet').trim() || 'Adet';
    const stockN = Math.round(Number(variant.stock) || 0);
    const qtyCore = `${stockN} ${unitStr}`;
    // İstenen davranış: özel kod 2 değerini adet satırında her zaman göstermek.
    const qtyHasSpecialCode = rawSc2 !== '' && f.showStock;
    const qtyStr = qtyHasSpecialCode ? `${rawSc2} - ${qtyCore}` : qtyCore;
    const showStandaloneSc2 = !!sc2Line && !f.showStock;
    const priceStr = `${variant.salePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currency}`;
    const m = Math.max(0.5, Math.min(1.2, size.width * 0.028));
    const compact = size.height < 24;

    if (compact) {
      const nameH = Math.min(7, Math.max(4, size.height * 0.35));
      const priceH = Math.min(6, Math.max(4, size.height * 0.28));
      const barH = Math.max(5, size.height - m * 2 - nameH - priceH - 1);
      return (
        <div
          className="border border-gray-300 bg-white rounded overflow-hidden text-black"
          style={{
            width: `${size.width}mm`,
            height: `${size.height}mm`,
            padding: `${m}mm`,
            boxSizing: 'border-box',
          }}
        >
          <div className="h-full flex flex-col items-stretch" style={{ gap: '0.35mm' }}>
            {f.showProductName && (
              <div
                className="font-bold text-center leading-tight"
                style={{
                  fontSize: size.width < 50 ? '7px' : '8px',
                  maxHeight: `${nameH}mm`,
                  overflow: 'hidden',
                }}
              >
                {titleLine.slice(0, 120)}
              </div>
            )}
            {showStandaloneSc2 && (
              <div
                className="text-center leading-tight text-gray-700 truncate w-full"
                style={{ fontSize: size.width < 50 ? '5px' : '6px', maxHeight: '2.8mm', overflow: 'hidden' }}
              >
                {sc2Line}
              </div>
            )}
            {f.showPrice && (
              <div
                className="font-extrabold text-center leading-none"
                style={{ fontSize: size.width < 50 ? '10px' : '12px', maxHeight: `${priceH}mm` }}
              >
                {priceStr}
              </div>
            )}
            {variant.barcode && (
              <div className="flex flex-1 justify-center items-end min-h-0">
                <canvas
                  id={barcodeId}
                  {...barcodeDataAttrs}
                  style={{
                    maxWidth: '95%',
                    height: `${barH}mm`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    const usable = size.height - 2 * m;
    const hBrand = Math.max(3, Math.min(5, usable * 0.12));
    const hTitle = Math.max(4.5, Math.min(10, usable * 0.3));
    const hRow = Math.max(3.2, Math.min(5, usable * 0.12));
    const gap = Math.max(0.35, usable * 0.02);
    const hSpec = showStandaloneSc2 ? Math.max(2.2, Math.min(4, usable * 0.075)) : 0;
    const yAfterTop = m + hBrand + gap + hTitle + gap + (showStandaloneSc2 ? hSpec + gap : 0) + hRow + gap;
    const barH = Math.max(6, size.height - yAfterTop - m);

    return (
      <div
        className="border border-gray-300 bg-white rounded overflow-hidden text-black"
        style={{
          width: `${size.width}mm`,
          height: `${size.height}mm`,
          padding: `${m}mm`,
          boxSizing: 'border-box',
        }}
      >
        <div className="flex flex-col h-full" style={{ gap: `${gap}mm` }}>
          {(f.showCategory || !!(productBrand && productBrand.trim())) && (
            <div
              className="font-extrabold text-center leading-none truncate"
              style={{ fontSize: size.width < 50 ? '7px' : '9px', minHeight: `${hBrand}mm` }}
            >
              {brandLine}
            </div>
          )}
          {f.showProductName && (
            <div
              className="font-semibold text-center leading-tight"
              style={{
                fontSize: size.width < 50 ? '6px' : '7px',
                minHeight: `${hTitle}mm`,
                maxHeight: `${hTitle}mm`,
                overflow: 'hidden',
              }}
            >
              {titleLine.slice(0, 160)}
            </div>
          )}
          {showStandaloneSc2 && (
            <div
              className="font-medium text-center leading-tight text-gray-700 truncate w-full shrink-0"
              style={{
                fontSize: size.width < 50 ? '5.5px' : '6.5px',
                minHeight: `${hSpec}mm`,
                maxHeight: `${hSpec}mm`,
                overflow: 'hidden',
              }}
            >
              {sc2Line}
            </div>
          )}
          <div
            className="flex flex-row items-center w-full shrink-0"
            style={{
              minHeight: `${hRow}mm`,
              justifyContent: f.showPrice && f.showStock ? 'space-between' : 'center',
            }}
          >
            {f.showPrice && f.showStock ? (
              <>
                <div
                  className="font-extrabold leading-none text-left min-w-0 flex-1 pr-1 break-words"
                  style={{ fontSize: size.width < 50 ? '9px' : '11px' }}
                >
                  {priceStr}
                </div>
                <div
                  className="font-bold text-right text-gray-800 leading-none min-w-0 flex-1 pl-1 break-words"
                  style={{ fontSize: size.width < 50 ? (qtyHasSpecialCode ? '7px' : '8px') : (qtyHasSpecialCode ? '8px' : '10px') }}
                >
                  {qtyStr}
                </div>
              </>
            ) : f.showPrice ? (
              <div
                className="font-extrabold leading-none text-center w-full px-0.5 break-words"
                style={{ fontSize: size.width < 50 ? '9px' : '11px' }}
              >
                {priceStr}
              </div>
            ) : f.showStock ? (
              <div
                className="font-bold text-center text-gray-800 leading-none w-full px-0.5 break-words"
                style={{ fontSize: size.width < 50 ? '8px' : '10px' }}
              >
                {qtyStr}
              </div>
            ) : null}
          </div>
          {variant.barcode && (
            <div className="flex flex-1 justify-center items-end min-h-0 w-full">
              <canvas
                id={barcodeId}
                {...barcodeDataAttrs}
                style={{
                  maxWidth: '92%',
                  height: `${barH}mm`,
                }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // DETAILED DESIGN
  if (design.id === 'detailed') {
    return (
      <div
        className="border-2 border-gray-400 bg-white rounded overflow-hidden"
        style={{
          width: `${size.width}mm`,
          height: `${size.height}mm`,
          padding: '2mm'
        }}
      >
        <div className="h-full flex flex-col justify-between text-black">
          <div>
            {f.showProductName && (
            <div className={`${isSmall ? 'text-[7px]' : 'text-[10px]'} font-bold truncate border-b border-gray-300 pb-0.5`}>
              {productName}
            </div>
            )}
            <div className={`${isSmall ? 'text-[6px]' : 'text-[8px]'} text-gray-700 mt-1 space-y-0.5`}>
              {f.showVariantAttributes &&
                Object.entries(variant.attributes).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="font-medium">{key}:</span>
                  <span>{value}</span>
                </div>
              ))}
              {sc2Line && (
                <div className="flex justify-between gap-1">
                  <span className="font-medium shrink-0">Özel kod 2:</span>
                  <span className="text-right truncate">{sc2Line}</span>
                </div>
              )}
              {f.showCategory && category && <div className="text-gray-500">Kategori: {category}</div>}
            </div>
          </div>

          {variant.barcode && (
            <div className="flex justify-center my-1">
              <canvas id={barcodeId} {...barcodeDataAttrs} style={{ maxWidth: '95%', height: isMedium ? '22mm' : '28mm' }} />
            </div>
          )}

          {f.showStock && variant.stock !== undefined && (
            <div className={`${isSmall ? 'text-[7px]' : 'text-[8px]'} text-gray-600 text-center`}>
              Stok: {variant.stock}
            </div>
          )}

          <div>
            {f.showPrice && (
            <div className={`${isSmall ? 'text-[11px]' : 'text-[14px]'} font-bold text-center bg-gray-100 py-1 rounded`}>
              {variant.salePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}
            </div>
            )}
            {f.showVariantCode && (
            <div className={`${isSmall ? 'text-[6px]' : 'text-[7px]'} text-gray-500 text-center mt-0.5`}>
              {variant.variantCode}
            </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PREMIUM DESIGN
  if (design.id === 'premium') {
    return (
      <div
        className="border border-gray-300 bg-gradient-to-br from-white to-gray-50 rounded-lg overflow-hidden shadow-sm"
        style={{
          width: `${size.width}mm`,
          height: `${size.height}mm`,
          padding: '2mm'
        }}
      >
        <div className="h-full flex flex-col justify-between text-black">
          {f.showProductName && (
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-2 py-1 rounded -m-0.5 mb-1">
            <div className={`${isSmall ? 'text-[7px]' : 'text-[10px]'} font-bold truncate`}>
              {productName}
            </div>
          </div>
          )}

          {f.showVariantAttributes && (
          <div className={`${isSmall ? 'text-[7px]' : 'text-[9px]'} text-gray-700 space-y-0.5`}>
            {Object.entries(variant.attributes).map(([key, value]) => (
              <div key={key} className="flex gap-1">
                <span className="text-purple-600">•</span>
                <span>{key}: <span className="font-medium">{value}</span></span>
              </div>
            ))}
          </div>
          )}

          {variant.barcode && (
            <div className="flex justify-center my-1 bg-white p-1 rounded">
              <canvas id={barcodeId} {...barcodeDataAttrs} style={{ maxWidth: '95%', height: isMedium ? '20mm' : '25mm' }} />
            </div>
          )}

          {f.showPrice && (
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white text-center py-1.5 rounded">
            <div className={`${isSmall ? 'text-[10px]' : 'text-[13px]'} font-bold`}>
              {variant.salePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}
            </div>
          </div>
          )}
        </div>
      </div>
    );
  }

  // PROMOTIONAL DESIGN
  if (design.id === 'promotional') {
    return (
      <div
        className="border-2 border-red-500 bg-white rounded overflow-hidden relative"
        style={{
          width: `${size.width}mm`,
          height: `${size.height}mm`,
          padding: '2mm'
        }}
      >
        {showDiscount && (
          <div className="absolute top-0 right-0 bg-red-600 text-white px-2 py-0.5 text-[10px] font-bold rounded-bl">
            -{discountPercent}%
          </div>
        )}

        <div className="h-full flex flex-col justify-between text-black pt-3">
          {f.showProductName && (
          <div className={`${isSmall ? 'text-[8px]' : 'text-[10px]'} font-bold truncate`}>
            {productName}
          </div>
          )}

          {f.showVariantAttributes && (
          <div className={`${isSmall ? 'text-[7px]' : 'text-[8px]'} text-gray-600`}>
            {Object.values(variant.attributes).join(' • ')}
          </div>
          )}

          {variant.barcode && (
            <div className="flex justify-center my-1">
              <canvas id={barcodeId} {...barcodeDataAttrs} style={{ maxWidth: '95%', height: '20mm' }} />
            </div>
          )}

          <div>
            {showDiscount && oldPrice > 0 && f.showPrice && (
              <div className={`${isSmall ? 'text-[8px]' : 'text-[10px]'} text-gray-500 line-through text-center`}>
                {oldPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}
              </div>
            )}
            {f.showPrice && (
            <div className={`${isSmall ? 'text-[12px]' : 'text-[16px]'} font-bold text-red-600 text-center`}>
              {variant.salePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}
            </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // QR CODE DESIGN
  if (design.id === 'qr') {
    return (
      <div
        className="border border-gray-300 bg-white rounded overflow-hidden"
        style={{
          width: `${size.width}mm`,
          height: `${size.height}mm`,
          padding: '2mm'
        }}
      >
        <div className="h-full flex flex-col justify-between items-center text-black">
          {f.showProductName && (
          <div className={`${isSmall ? 'text-[7px]' : 'text-[9px]'} font-bold text-center w-full truncate`}>
            {productName}
          </div>
          )}

          {variant.barcode && (
            <div className="flex justify-center">
              <canvas
                id={qrId}
                {...qrDataAttrs}
                style={{
                  width: isSmall ? '15mm' : isMedium ? '25mm' : '35mm',
                  height: isSmall ? '15mm' : isMedium ? '25mm' : '35mm'
                }}
              />
            </div>
          )}

          <div className="text-center w-full">
            {f.showVariantAttributes && (
            <div className={`${isSmall ? 'text-[6px]' : 'text-[7px]'} text-gray-600`}>
              {Object.values(variant.attributes).join(' • ')}
            </div>
            )}
            {f.showPrice && (
            <div className={`${isSmall ? 'text-[10px]' : 'text-[12px]'} font-bold mt-1`}>
              {variant.salePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}
            </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // SHELF LABEL DESIGN
  if (design.id === 'shelf') {
    return (
      <div
        className="border-4 border-blue-600 bg-white rounded-lg overflow-hidden"
        style={{
          width: `${size.width}mm`,
          height: `${size.height}mm`,
          padding: '5mm'
        }}
      >
        <div className="h-full flex flex-col justify-between text-black">
          <div>
            {shelfLocation && (
              <div className="bg-blue-600 text-white px-4 py-2 rounded text-[18px] font-bold mb-3 text-center">
                {shelfLocation}
              </div>
            )}
            {f.showProductName && <div className="text-[24px] font-bold mb-2">{productName}</div>}
            {f.showCategory && category && <div className="text-[16px] text-gray-600 mb-3">Kategori: {category}</div>}
          </div>

          <div className="space-y-3">
            {f.showVariantAttributes && (
            <div className="grid grid-cols-2 gap-4 text-[14px]">
              {Object.entries(variant.attributes).map(([key, value]) => (
                <div key={key} className="border-2 border-gray-300 p-2 rounded">
                  <div className="text-gray-600 text-[12px]">{key}</div>
                  <div className="font-bold text-[16px]">{value}</div>
                </div>
              ))}
            </div>
            )}

            {f.showStock && variant.stock !== undefined && (
              <div className={`text-[14px] font-medium p-2 rounded ${variant.stock > 10 ? 'bg-green-100 text-green-800' :
                variant.stock > 0 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                Stok: <span className="font-bold text-[18px]">{variant.stock}</span> adet
              </div>
            )}
          </div>

          {variant.barcode && (
            <div className="flex justify-center my-3 bg-gray-50 p-3 rounded">
              <canvas id={barcodeId} {...barcodeDataAttrs} style={{ maxWidth: '80%', height: '40mm' }} />
            </div>
          )}

          {f.showPrice && (
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-center py-4 rounded-lg">
            <div className="text-[16px] mb-1">Satış Fiyatı</div>
            <div className="text-[32px] font-bold">
              {variant.salePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}
            </div>
          </div>
          )}

          {f.showVariantCode && (
          <div className="text-[12px] text-gray-500 text-center mt-2">
            Kod: {variant.variantCode}
          </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
