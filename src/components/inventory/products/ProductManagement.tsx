import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { exportDataGridToExcel } from '../../../utils/gridExcelExport';
import { ColumnVisibilityMenu } from '../../shared/ColumnVisibilityMenu';
import type { Product } from '../../../App';
import { useProductStore } from '../../../store';
import { productAPI } from '../../../services/api/products';
import { ProductFormPage } from './ProductFormPage';
import { ProductOperationHub, HubTab } from './ProductOperationHub';
import {
  buildProductGridColumns,
  getProductGridColumnLabels,
  loadProductColumnVisibility,
  productColumnVisibilityMenuItems,
  PRODUCT_COLUMN_VISIBILITY_KEY,
  PRODUCT_GRID_COLUMN_ORDER,
} from './productGridColumns';
import { ContextMenu } from '../../shared/ContextMenu';
import { formatNumber, formatCurrency as formatAmountWithCode } from '../../../utils/formatNumber';
import { formatCurrency } from '../../../utils/currency';
import { formatScaleQuantityDisplay } from '../../../utils/scaleQuantity';
import { isProductStockLow, isWeightBasedUnit } from '../../../utils/productUnits';
import { toast } from 'sonner';
import {
  Package,
  Edit,
  Barcode,
  TrendingUp,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  Plus,
  Search,
  X,
  FileText,
  ImageIcon,
  SlidersHorizontal,
  Printer,
  ShoppingCart,
  Loader2,
  CalendarDays,
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { usePermission } from '../../../shared/hooks/usePermission';
import { useResponsive } from '../../../hooks/useResponsive';
import { BulkProductImageUpdateModal } from './BulkProductImageUpdateModal';
import { BulkProductFieldUpdateModal } from './BulkProductFieldUpdateModal';
import { BulkProductLabelPrint } from './BulkProductLabelPrint';
import { ReportViewerModule } from '../../reports/ReportViewerModule';
import { ReportTemplate } from '../../reports/designerUtils';
import {
  buildQuickRetailProductLabelTemplate,
  productToQuickRetailLabelInput,
} from './quickRetailProductLabelTemplate';
import { DEMO_PRODUCT_CODES } from '../../../utils/demoSeedCodes';
import { FullscreenBodyPortal } from '../../shared/FullscreenBodyPortal';
import { confirm as confirmDialog } from '../../shared/ConfirmDialog';
import { PREFILL_PURCHASE_FROM_COUNT_STORAGE_KEY } from '../../../utils/countSlipPurchaseDraft';
import {
  buildPurchaseEditDataFromProductsForPurchaseWithStock,
  productNeedPurchaseDraftMaxLines,
} from '../../../utils/productNeedPurchaseDraft';

const NEW_PRODUCT_PURCHASE_DRAFT_DAYS = 30;

function isMaterialProductRow(p: Product): boolean {
  return !(p.materialType === 'service' || p.isService === true);
}

function isProductCreatedToday(createdAt: string | undefined | null): boolean {
  if (createdAt == null || String(createdAt).trim() === '') return false;
  const d = new Date(createdAt);
  if (!Number.isFinite(d.getTime())) return false;
  return d.toDateString() === new Date().toDateString();
}

interface ProductManagementProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
}

const ALL_CATEGORIES = '__ALL__';
const MOBILE_PAGE_SIZE = 40;
const LONG_PRESS_MS = 480;
const LONG_PRESS_MOVE_PX = 14;
/** Arka plan stok yenilemesi: 30 sn çok sık (web + büyük liste); sekme görünürken 2 dk */
const PRODUCT_STOCK_REFRESH_MS = 120000;

export function ProductManagement({ products, setProducts }: ProductManagementProps) {
  const { t, tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const { canViewPurchasePricing } = usePermission();
  const showPurchasePricing = canViewPurchasePricing();
  const { isMobile } = useResponsive();
  const updateProduct = useProductStore((state) => state.updateProduct);
  const deleteProduct = useProductStore((state) => state.deleteProduct);
  const loadProducts = useProductStore((state) => state.loadProducts);
  const storeProducts = useProductStore((state) => state.products);
  const isLoading = useProductStore((state) => state.isLoading);
  const [hasLoadedFromStore, setHasLoadedFromStore] = useState(false);

  // Store'dan ürünleri kullan (stok güncellemeleri otomatik yansır)
  const displayProducts = hasLoadedFromStore ? storeProducts : products;

  // Sayfa yüklendiğinde ve periyodik olarak ürünleri yenile
  useEffect(() => {
    // İlk yükleme
    if (storeProducts.length === 0) {
      loadProducts().finally(() => setHasLoadedFromStore(true));
    } else {
      setHasLoadedFromStore(true);
    }

    // Her 30 saniyede bir stokları güncelle (alış/satış sonrası güncellemeler için)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadProducts(true);
    }, PRODUCT_STOCK_REFRESH_MS);

    return () => clearInterval(interval);
  }, [loadProducts, storeProducts.length]);

  // Manuel yenileme fonksiyonu
  const handleRefresh = async () => {
    await loadProducts();
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showProductHub, setShowProductHub] = useState(false);
  const [activeHubProduct, setActiveHubProduct] = useState<Product | null>(null);
  const [hubInitialTab, setHubInitialTab] = useState<HubTab>('overview');
  const [editingProductId, setEditingProductId] = useState<string | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; product: Product } | null>(null);
  const [showServicesOnly, setShowServicesOnly] = useState(false);
  const [showTodayOnly, setShowTodayOnly] = useState(false);
  const [duplicateDetectBy, setDuplicateDetectBy] = useState<'none' | 'code' | 'barcode'>('none');
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [showBulkRateModal, setShowBulkRateModal] = useState(false);
  const [showBulkFieldModal, setShowBulkFieldModal] = useState(false);
  const [showBulkImageModal, setShowBulkImageModal] = useState(false);
  const [showBulkLabelPrint, setShowBulkLabelPrint] = useState(false);
  const [bulkLabelModalKey, setBulkLabelModalKey] = useState(0);
  const [bulkLabelInitial, setBulkLabelInitial] = useState<Product[] | undefined>(undefined);
  const [purchaseDraftBusy, setPurchaseDraftBusy] = useState(false);
  const [bulkRate, setBulkRate] = useState(1530); // Default common rate
  const [roundTo, setRoundTo] = useState(250); // Default rounding for IQD
  const [columnVisibility, setColumnVisibility] = useState(loadProductColumnVisibility);
  const [mobilePage, setMobilePage] = useState(0);
  const [mobileActionProduct, setMobileActionProduct] = useState<Product | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Design Center Integration
  const [showViewer, setShowViewer] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);

  const executeDeleteWithProtection = async (targets: Product[]) => {
    if (!targets.length) return;
    const ids = targets.map((p) => p.id);
    const impact = await productAPI.getDeleteImpact(ids);
    const hasRefs = impact.hasInvoiceRefs;

    let options: { force?: boolean; adminPassword?: string } | undefined;
    if (hasRefs) {
      const saleInvoiceNos = Array.from(new Set(impact.saleRefs.map((x) => x.invoiceNo)));
      const purchaseInvoiceNos = Array.from(new Set(impact.purchaseRefs.map((x) => x.invoiceNo)));
      const names = targets.map((p) => p.name).slice(0, 8).join(', ');
      const ok = await confirmDialog({
        variant: 'danger',
        title: tm('productHasInvoiceRefsTitle') || 'Ürün faturalarda kullanılmış',
        description: `${names}${targets.length > 8 ? '...' : ''}`,
        meta: (
          <div className="space-y-1 text-xs">
            {saleInvoiceNos.length > 0 && (
              <div>
                <span className="font-bold uppercase tracking-wider opacity-70">{tm('salesInvoice') || 'Satış'}:</span>{' '}
                <span className="font-mono">{saleInvoiceNos.slice(0, 8).join(', ')}{saleInvoiceNos.length > 8 ? '…' : ''}</span>
              </div>
            )}
            {purchaseInvoiceNos.length > 0 && (
              <div>
                <span className="font-bold uppercase tracking-wider opacity-70">{tm('purchaseInvoice') || 'Alış'}:</span>{' '}
                <span className="font-mono">{purchaseInvoiceNos.slice(0, 8).join(', ')}{purchaseInvoiceNos.length > 8 ? '…' : ''}</span>
              </div>
            )}
            <div className="mt-2">{tm('productHasInvoiceRefsHint') || 'Bu faturalardaki geçmiş kayıt ilişkilerini kaldırmak istediğinize emin misiniz? Devam etmek için yönetici şifresi gerekecek.'}</div>
          </div>
        ),
        confirmLabel: tm('continue') || 'Devam Et',
        cancelLabel: tm('cancel') || 'İptal',
      });
      if (!ok) return;
      const adminPassword = window.prompt(tm('adminPasswordPromptShort') || 'Yönetici şifresi gerekli:');
      if (!adminPassword) {
        toast.error(tm('adminPasswordNotProvided') || 'Yönetici şifresi girilmedi, işlem iptal edildi.');
        return;
      }
      options = { force: true, adminPassword };
    }

    let ok = 0;
    let fail = 0;
    for (const product of targets) {
      try {
        await deleteProduct(product.id, options);
        ok++;
      } catch {
        fail++;
      }
    }
    await loadProducts(true);
    if (fail > 0) {
      toast.success(`${ok} ürün silindi. ${fail} ürün silinemedi.`);
    } else {
      toast.success(`${ok} ürün silindi.`);
    }
  };

  const printLabel = (product: Product, size: { w: number; h: number }) => {
    setActiveHubProduct(product);
    const template = buildQuickRetailProductLabelTemplate(productToQuickRetailLabelInput(product), size);
    setSelectedTemplate(template);
    setShowViewer(true);
  };

  const duplicateKeys = useMemo(() => {
    if (duplicateDetectBy === 'none') return new Set<string>();
    const counts = new Map<string, number>();
    for (const p of displayProducts) {
      const key = duplicateDetectBy === 'code'
        ? String(p.code || '').trim()
        : String(p.barcode || '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, c]) => c > 1).map(([k]) => k));
  }, [displayProducts, duplicateDetectBy]);

  const todayProductsCount = useMemo(
    () => displayProducts.filter((p) => isProductCreatedToday(p.created_at)).length,
    [displayProducts]
  );

  useEffect(() => {
    setMobilePage(0);
  }, [searchQuery, categoryFilter, showServicesOnly, showTodayOnly, duplicateDetectBy]);

  useEffect(() => {
    try {
      const payload = Object.fromEntries(
        PRODUCT_GRID_COLUMN_ORDER.map((id) => [id, columnVisibility[id] !== false])
      );
      localStorage.setItem(PRODUCT_COLUMN_VISIBILITY_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [columnVisibility]);

  const filteredProducts = useMemo(() => {
    const list = displayProducts.filter(product => {
      const searchLower = searchQuery.toLocaleLowerCase('tr-TR');
      const matchesSearch = searchQuery === '' ||
        (product.name?.toLocaleLowerCase('tr-TR') || '').includes(searchLower) ||
        (product.code?.toLocaleLowerCase('tr-TR') || '').includes(searchLower) ||
        (product.barcode || '').includes(searchQuery) ||
        (product.category?.toLocaleLowerCase('tr-TR') || '').includes(searchLower);
      const matchesCategory = categoryFilter === ALL_CATEGORIES || product.category === categoryFilter;
      const matchesService = showServicesOnly ? (product.materialType === 'service' || product.isService === true) : true;
      const matchesToday = !showTodayOnly || isProductCreatedToday(product.created_at);
      const duplicateKey = duplicateDetectBy === 'code'
        ? String(product.code || '').trim()
        : String(product.barcode || '').trim();
      const matchesDuplicate = duplicateDetectBy === 'none' || duplicateKeys.has(duplicateKey);
      return matchesSearch && matchesCategory && matchesService && matchesToday && matchesDuplicate;
    });
    /** Ekleme tarihine göre yeniden eskiye (created_at DESC) */
    return [...list].sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      const diff = (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      if (diff !== 0) return diff;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr', { sensitivity: 'base' });
    });
  }, [displayProducts, searchQuery, categoryFilter, showServicesOnly, showTodayOnly, duplicateDetectBy, duplicateKeys]);

  const mobilePageCount = Math.max(1, Math.ceil(filteredProducts.length / MOBILE_PAGE_SIZE));
  const mobilePagedProducts = useMemo(() => {
    const start = mobilePage * MOBILE_PAGE_SIZE;
    return filteredProducts.slice(start, start + MOBILE_PAGE_SIZE);
  }, [filteredProducts, mobilePage]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }, []);

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  const startLongPress = useCallback(
    (clientX: number, clientY: number, product: Product) => {
      clearLongPress();
      longPressOriginRef.current = { x: clientX, y: clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressOriginRef.current = null;
        setMobileActionProduct(product);
      }, LONG_PRESS_MS);
    },
    [clearLongPress]
  );

  const maybeCancelLongPressMove = useCallback(
    (clientX: number, clientY: number) => {
      const o = longPressOriginRef.current;
      if (!o || !longPressTimerRef.current) return;
      if (
        Math.abs(clientX - o.x) > LONG_PRESS_MOVE_PX ||
        Math.abs(clientY - o.y) > LONG_PRESS_MOVE_PX
      ) {
        clearLongPress();
      }
    },
    [clearLongPress]
  );

  const toggleProductSelected = useCallback((product: Product, selected: boolean) => {
    setSelectedProducts((prev) => {
      if (selected) {
        if (prev.some((p) => p.id === product.id)) return prev;
        return [...prev, product];
      }
      return prev.filter((p) => p.id !== product.id);
    });
  }, []);

  const openPurchaseDraftForProducts = useCallback(
    (eligibleInput: Product[], notesIntro: string, supplierLabel: string) => {
      if (!selectedFirm) {
        toast.error(tm('countPurchaseFromSurplusNeedFirm'));
        return;
      }
      const eligible = eligibleInput.filter((p) => p?.id && isMaterialProductRow(p));
      if (!eligible.length) {
        toast.error(tm('productPurchaseDraftNoEligible'));
        return;
      }
      const maxL = productNeedPurchaseDraftMaxLines();
      if (eligible.length > maxL) {
        toast.message(
          tm('productPurchaseDraftTruncated')
            .replace(/\{max\}/g, String(maxL))
            .replace(/\{total\}/g, String(eligible.length))
        );
      }
      const draft = buildPurchaseEditDataFromProductsForPurchaseWithStock(eligible, {
        supplierLabel,
        notesIntro,
      });
      if (!draft) {
        toast.error(tm('productPurchaseDraftNoEligible'));
        return;
      }
      try {
        sessionStorage.setItem(
          PREFILL_PURCHASE_FROM_COUNT_STORAGE_KEY,
          JSON.stringify({
            editData: draft,
            skipProductStockUpdate: false,
          })
        );
      } catch {
        /* ignore */
      }
      window.dispatchEvent(
        new CustomEvent('navigateToScreen', {
          detail: {
            screen: 'purchase-invoice-standard',
            countPurchaseDraft: {
              editData: draft,
              skipProductStockUpdate: false,
            },
          },
        })
      );
      toast.success(tm('countPurchaseOpeningInvoiceForm'));
    },
    [selectedFirm, tm]
  );

  const handlePurchaseDraftFromSelection = useCallback(() => {
    if (selectedProducts.length === 0) {
      toast.error(tm('productPurchaseDraftNoSelection'));
      return;
    }
    openPurchaseDraftForProducts(
      selectedProducts,
      tm('productPurchaseDraftNotesSelection'),
      tm('productPurchaseDraftSupplier')
    );
  }, [openPurchaseDraftForProducts, selectedProducts, tm]);

  const handlePurchaseDraftNoPurchaseHistory = useCallback(async () => {
    if (!selectedFirm) {
      toast.error(tm('countPurchaseFromSurplusNeedFirm'));
      return;
    }
    const materials = filteredProducts.filter((p) => p?.id && isMaterialProductRow(p));
    if (!materials.length) {
      toast.error(tm('productPurchaseDraftNoEligible'));
      return;
    }
    setPurchaseDraftBusy(true);
    const toastId = 'product-purchase-draft-scan';
    try {
      toast.loading(tm('productPurchaseDraftScanning'), { id: toastId });
      const ids = materials.map((p) => p.id);
      const withoutIds = await productAPI.filterIdsWithoutPurchaseHistory(ids);
      toast.dismiss(toastId);
      const allow = new Set(withoutIds);
      const list = materials.filter((p) => allow.has(p.id));
      if (!list.length) {
        toast.error(tm('productPurchaseDraftNoEligible'));
        return;
      }
      openPurchaseDraftForProducts(
        list,
        tm('productPurchaseDraftNotesNoHistory'),
        tm('productPurchaseDraftSupplier')
      );
    } catch (err: unknown) {
      toast.dismiss(toastId);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setPurchaseDraftBusy(false);
    }
  }, [filteredProducts, openPurchaseDraftForProducts, selectedFirm, tm]);

  const handlePurchaseDraftNewProducts = useCallback(() => {
    const cutoff = Date.now() - NEW_PRODUCT_PURCHASE_DRAFT_DAYS * 86400000;
    const list = filteredProducts.filter((p) => {
      if (!p?.id || !isMaterialProductRow(p)) return false;
      const raw = p.created_at;
      if (raw == null || String(raw).trim() === '') return false;
      const t = new Date(raw).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
    openPurchaseDraftForProducts(
      list,
      tm('productPurchaseDraftNotesNewProducts'),
      tm('productPurchaseDraftSupplier')
    );
  }, [filteredProducts, openPurchaseDraftForProducts, tm]);

  /** Listede bulunan demo ürünler — sağ tık menüsünde "Demo ürünleri toplu sil" sadece bunlar varken gösterilir */
  const demoProductsInList = useMemo(() => {
    return displayProducts.filter(p => p.code && DEMO_PRODUCT_CODES.has(String(p.code).trim()));
  }, [displayProducts]);

  const openProductForm = (productId?: string) => {
    setEditingProductId(productId);
    setShowProductForm(true);
  };

  const closeProductForm = () => {
    setEditingProductId(undefined);
    setShowProductForm(false);
  };

  const handleProductFormSubmit = (_product: Product) => {
    // ProductFormPage kaydı zaten yaptı; çift INSERT/UPDATE ve kod çakışması önlenir
    closeProductForm();
    void loadProducts(true);
  };

  const columnLabelOverrides = useMemo(() => getProductGridColumnLabels(tm), [tm]);

  const columns = useMemo<ColumnDef<Product, unknown>[]>(
    () =>
      buildProductGridColumns({
        columnVisibility,
        showPurchasePricing,
        labelOverrides: columnLabelOverrides,
        tm,
        localeCode: tm('localeCode'),
      }),
    [columnVisibility, showPurchasePricing, columnLabelOverrides, tm]
  );

  const columnVisibilityItems = useMemo(
    () =>
      productColumnVisibilityMenuItems({
        columnVisibility,
        showPurchasePricing,
        labels: columnLabelOverrides,
      }),
    [columnVisibility, showPurchasePricing, columnLabelOverrides]
  );

  const columnVisibilityControl = (
    <ColumnVisibilityMenu
      variant="filterBar"
      columns={columnVisibilityItems}
      onToggle={(columnId) => {
        setColumnVisibility((prev) => ({
          ...prev,
          [columnId]: !(prev[columnId] !== false),
        }));
      }}
      onShowAll={() => {
        setColumnVisibility(
          Object.fromEntries(PRODUCT_GRID_COLUMN_ORDER.map((id) => [id, true]))
        );
      }}
      onHideAll={() => {
        setColumnVisibility(
          Object.fromEntries(PRODUCT_GRID_COLUMN_ORDER.map((id) => [id, false]))
        );
      }}
    />
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="relative z-20 shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            <h2 className="text-sm">{tm('productManagement')}</h2>
            <span className="text-blue-100 text-[10px] ml-2">• {displayProducts.length} {tm('productCards').toLowerCase()}</span>
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]"
              title={tm('refreshStocks')}
            >
              <RefreshCw className="w-3 h-3" />
              <span>{tm('refresh')}</span>
            </button>
            <button
              type="button"
              disabled={purchaseDraftBusy}
              onClick={handlePurchaseDraftFromSelection}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] disabled:opacity-50"
              title={tm('productPurchaseDraftNotesSelection')}
            >
              <ShoppingCart className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">{tm('productPurchaseDraftFromSelectionBtn')}</span>
              <span className="sm:hidden">Seç→Alış</span>
            </button>
            <button
              type="button"
              disabled={purchaseDraftBusy}
              onClick={() => void handlePurchaseDraftNoPurchaseHistory()}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] disabled:opacity-50"
              title={tm('productPurchaseDraftNotesNoHistory')}
            >
              {purchaseDraftBusy ? (
                <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
              ) : (
                <ShoppingCart className="w-3 h-3 shrink-0" />
              )}
              <span className="hidden sm:inline">{tm('productPurchaseDraftFromNoHistoryBtn')}</span>
              <span className="sm:hidden">Alışsız</span>
            </button>
            <button
              type="button"
              disabled={purchaseDraftBusy}
              onClick={handlePurchaseDraftNewProducts}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] disabled:opacity-50"
              title={tm('productPurchaseDraftNotesNewProducts')}
            >
              <ShoppingCart className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">{tm('productPurchaseDraftFromNewBtn')}</span>
              <span className="sm:hidden">Yeni</span>
            </button>
            <button
              type="button"
              onClick={() => exportDataGridToExcel(filteredProducts, columns, tm('productManagement') || 'urunler')}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]"
            >
              <Download className="w-3 h-3" />
              <span>{tm('export')}</span>
            </button>
            <button className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
              <Upload className="w-3 h-3" />
              <span>{tm('import')}</span>
            </button>
            <button
              onClick={() => {
                setBulkLabelInitial(selectedProducts.length > 0 ? [...selectedProducts] : undefined);
                setBulkLabelModalKey((k) => k + 1);
                setShowBulkLabelPrint(true);
              }}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]"
              title={tm('bulkBarcodeLabelPrint')}
              type="button"
            >
              <Printer className="w-3 h-3" />
              <span>{tm('bulkLabelPrintButton')}</span>
            </button>
            <button
              onClick={() => openProductForm()}
              className="flex items-center gap-1 px-2 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px]"
            >
              <Plus className="w-3 h-3" />
              <span>{tm('newProduct')}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowTodayOnly((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 transition-colors text-[10px] font-bold ${
                showTodayOnly ? 'bg-emerald-600 text-white' : 'bg-white/10 hover:bg-white/20'
              }`}
              title={tm('productFilterTodayTitle')}
            >
              <CalendarDays className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">{tm('productFilterTodayBtn')}</span>
              <span className="sm:hidden">{tm('productFilterTodayBtn')}</span>
              {todayProductsCount > 0 && (
                <span className={`tabular-nums ${showTodayOnly ? 'text-emerald-100' : 'text-blue-100'}`}>
                  ({todayProductsCount})
                </span>
              )}
            </button>
            <button
              onClick={() => setShowServicesOnly(!showServicesOnly)}
              className={`flex items-center gap-1 px-2 py-1 transition-colors text-[10px] font-bold ${
                showServicesOnly ? 'bg-orange-600 text-white' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              <FileText className="w-3 h-3" />
              <span>{tm('serviceCardsEntities')}</span>
            </button>
            {selectedProducts.length > 0 && (
              <>
                <button
                  onClick={async () => {
                    const ok = await confirmDialog({
                      variant: 'danger',
                      title: tm('deleteSelectedProducts') || 'Seçili ürünleri sil',
                      description: (tm('confirmBulkProductDelete') || '{count} ürün silinecek. Emin misiniz?').replace('{count}', String(selectedProducts.length)),
                      confirmLabel: tm('deleteAction') || 'Sil',
                      cancelLabel: tm('cancel') || 'İptal',
                    });
                    if (!ok) return;
                    await executeDeleteWithProtection(selectedProducts);
                    setSelectedProducts([]);
                  }}
                  className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white hover:bg-red-700 transition-colors text-[10px] font-bold"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{tm('productBulkDeleteBtn').replace('{count}', String(selectedProducts.length))}</span>
                </button>
                <button
                  onClick={() => setShowBulkFieldModal(true)}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white hover:bg-blue-700 transition-colors text-[10px] font-bold"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>{tm('productBulkUpdateBtn').replace('{count}', String(selectedProducts.length))}</span>
                </button>
                <button
                  onClick={() => setShowBulkImageModal(true)}
                  className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-[10px] font-bold"
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>{tm('productBulkImageBtn').replace('{count}', String(selectedProducts.length))}</span>
                </button>
                <button
                  onClick={() => setShowBulkRateModal(true)}
                  className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white hover:bg-orange-600 transition-colors text-[10px] font-bold"
                >
                  <TrendingUp className="w-3 h-3" />
                  <span>{tm('productBulkRateBtn').replace('{count}', String(selectedProducts.length))}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        className={`flex-1 flex flex-col min-h-0 p-3 bg-gray-50 ${isMobile ? 'overflow-hidden' : 'overflow-auto'}`}
      >
        {/* Search Box */}
        <div className="mb-3 bg-white p-3 border border-gray-200 rounded shrink-0 relative z-20">
          {isMobile && (
            <p className="text-[11px] text-gray-500 mb-2">{tm('productMobileRowHint')}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={tm('productSearchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {columnVisibilityControl}
              <select
                value={duplicateDetectBy}
                onChange={(e) => setDuplicateDetectBy(e.target.value as 'none' | 'code' | 'barcode')}
                className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">{tm('productDuplicateFilterOff')}</option>
                <option value="code">{tm('productDuplicateFilterCode')}</option>
                <option value="barcode">{tm('productDuplicateFilterBarcode')}</option>
              </select>
              {duplicateDetectBy !== 'none' && (
                <span className="text-[11px] px-2 py-1 rounded bg-amber-100 text-amber-700 font-semibold whitespace-nowrap">
                  {tm('productDuplicateKeysCount').replace('{count}', String(duplicateKeys.size))}
                </span>
              )}
            </div>
          </div>
          {showTodayOnly && (
            <p className="mt-2 text-[11px] text-emerald-700 font-semibold">
              {tm('productFilterTodayActive').replace(/\{count\}/g, String(filteredProducts.length))}
            </p>
          )}
        </div>

        <div
          className={`bg-white border border-gray-200 min-h-0 ${isMobile ? 'flex-1 flex flex-col overflow-hidden' : ''}`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-gray-600 text-sm">{tm('dataLoading')}</p>
              </div>
            </div>
          ) : isMobile ? (
            <>
              <div className="flex-1 overflow-y-auto overscroll-contain bg-gray-50/80">
                {mobilePagedProducts.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">{tm('noDataFound')}</div>
                ) : (
                  mobilePagedProducts.map((p) => {
                    const selected = selectedProducts.some((s) => s.id === p.id);
                    const stockN = Number(p.stock ?? 0);
                    const safeStock = Number.isFinite(stockN) ? stockN : 0;
                    const low = isProductStockLow(p, safeStock);
                    const stockLabel = isWeightBasedUnit(p.unit)
                      ? formatScaleQuantityDisplay(safeStock, p.unit)
                      : String(safeStock);
                    const code = (p.barcode || p.code || '—').trim();
                    return (
                      <div
                        key={p.id}
                        className={`grid grid-cols-[auto_1fr] gap-2 pl-2 pr-3 py-1.5 border-b border-gray-100/90 min-h-[52px] items-center active:bg-white/90 touch-manipulation select-none ${
                          selected ? 'bg-blue-50/90' : 'bg-white'
                        }`}
                        onPointerDown={(e) => {
                          if (e.pointerType === 'mouse' && e.button !== 0) return;
                          try {
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          } catch {
                            /* ignore */
                          }
                          startLongPress(e.clientX, e.clientY, p);
                        }}
                        onPointerMove={(e) => {
                          maybeCancelLongPressMove(e.clientX, e.clientY);
                        }}
                        onPointerUp={(e) => {
                          try {
                            const el = e.currentTarget as HTMLElement;
                            if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) {
                              el.releasePointerCapture(e.pointerId);
                            }
                          } catch {
                            /* ignore */
                          }
                          clearLongPress();
                        }}
                        onPointerCancel={(e) => {
                          try {
                            const el = e.currentTarget as HTMLElement;
                            if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) {
                              el.releasePointerCapture(e.pointerId);
                            }
                          } catch {
                            /* ignore */
                          }
                          clearLongPress();
                        }}
                      >
                        <div
                          className="flex items-center self-center"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="w-[18px] h-[18px] rounded border-gray-300 text-blue-600"
                            checked={selected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleProductSelected(p, e.target.checked);
                            }}
                            aria-label={tm('selectRow')}
                          />
                        </div>
                        <div className="min-w-0 flex flex-col justify-center gap-0.5">
                          <div className="flex items-start justify-between gap-2 min-w-0">
                            <span className="font-semibold text-[13px] text-gray-900 leading-snug line-clamp-2">
                              {p.name || '—'}
                            </span>
                            <span className="shrink-0 text-[12px] font-bold tabular-nums text-blue-700 leading-snug pt-0.5">
                              {formatCurrency(Number(p.price) || 0, 2, false)}
                            </span>
                          </div>
                          {showTodayOnly && p.created_at && (
                            <div className="text-[9px] text-emerald-700 truncate font-medium">
                              {new Date(p.created_at).toLocaleString('tr-TR', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          )}
                          {p.specialCode2 != null && String(p.specialCode2).trim() !== '' && (
                            <div className="text-[9px] text-gray-500 truncate">
                              <span className="font-semibold text-gray-600">{tm('specialCode')} 2:</span>{' '}
                              <span className="font-mono">{String(p.specialCode2).trim()}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 min-w-0 mt-0.5">
                            <div className="flex items-center gap-1 min-w-0">
                              <Barcode className="w-3 h-3 shrink-0 text-gray-400" aria-hidden />
                              <span className="text-[10px] font-mono text-gray-500 truncate tracking-tight">{code}</span>
                            </div>
                            <span
                              className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                                low
                                  ? 'bg-red-50 text-red-700 ring-1 ring-red-200/80'
                                  : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70'
                              }`}
                            >
                              {tm('stock')} {stockLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="shrink-0 border-t border-gray-200 px-2 py-2 flex items-center gap-2 bg-gray-50">
                <button
                  type="button"
                  disabled={mobilePage <= 0}
                  onClick={() => setMobilePage((x) => Math.max(0, x - 1))}
                  className="flex-1 py-2 text-xs font-medium rounded border border-gray-300 disabled:opacity-40"
                >
                  {tm('previous')}
                </button>
                <span className="text-[11px] text-gray-600 whitespace-nowrap px-1">
                  {mobilePage + 1}/{mobilePageCount}
                </span>
                <button
                  type="button"
                  disabled={mobilePage >= mobilePageCount - 1}
                  onClick={() => setMobilePage((x) => Math.min(mobilePageCount - 1, x + 1))}
                  className="flex-1 py-2 text-xs font-medium rounded border border-gray-300 disabled:opacity-40"
                >
                  {tm('next')}
                </button>
              </div>
            </>
          ) : (
            <DevExDataGrid
              data={filteredProducts}
              columns={columns}
              enableColumnVisibility
              showColumnVisibilityToolbar={false}
              enableExcelExport={false}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              onRowContextMenu={(e, product) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, product });
              }}
              enableSelection
              onSelectionChange={setSelectedProducts}
              height="calc(100vh - 120px)"
              pageSize={50}
              pageSizeOptions={[10, 25, 50, 100, 200, 500, 1000]}
            />
          )}
        </div>
      </div>

      {/* Mobil: basılı tut ile işlem + detay — body portal (üst çubuk altında kalmaması için) */}
      {mobileActionProduct && (
        <FullscreenBodyPortal
          className="flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          role="dialog"
          aria-modal
          onClick={() => setMobileActionProduct(null)}
        >
          <div
            className="w-full max-h-[88vh] rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl flex flex-col max-w-lg sm:max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{tm('productManagement')}</p>
                <h3 className="text-base font-bold text-gray-900 leading-tight break-words">
                  {mobileActionProduct.name}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-1 truncate">
                  {mobileActionProduct.barcode || mobileActionProduct.code || '—'}
                </p>
              </div>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0"
                aria-label={t.close}
                onClick={() => setMobileActionProduct(null)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
              {[
                [tm('barcode').toUpperCase(), mobileActionProduct.barcode || '—'],
                [tm('invThProductCode').toUpperCase(), mobileActionProduct.code || '—'],
                [tm('productName').toUpperCase(), mobileActionProduct.name || '—'],
                [tm('category').toUpperCase(), mobileActionProduct.category || '—'],
                ...(showPurchasePricing
                  ? [
                      [tm('cost').toUpperCase(), mobileActionProduct.cost != null && String(mobileActionProduct.cost).trim() !== '' ? formatCurrency(Number(mobileActionProduct.cost), 2, false) : '—'] as [string, string],
                    ]
                  : []),
                [tm('unitPrice').toUpperCase(), formatCurrency(Number(mobileActionProduct.price) || 0, 2, false)],
                [tm('productGridColPriceUsd').toUpperCase(), (mobileActionProduct as any).salePriceUSD != null && (mobileActionProduct as any).salePriceUSD !== '' ? formatAmountWithCode(Number((mobileActionProduct as any).salePriceUSD), 'USD', 2) : '—'],
                ...(showPurchasePricing
                  ? [
                      [tm('productGridColPurchaseUsd').toUpperCase(), (mobileActionProduct as any).purchasePriceUSD != null && (mobileActionProduct as any).purchasePriceUSD !== '' ? formatAmountWithCode(Number((mobileActionProduct as any).purchasePriceUSD), 'USD', 2) : '—'] as [string, string],
                    ]
                  : []),
                [tm('tax').toUpperCase(), `%${mobileActionProduct.taxRate ?? 0}`],
                [tm('salesTotal').toUpperCase(), String(mobileActionProduct.totalSales ?? 0)],
                ...(showPurchasePricing
                  ? [[tm('purchaseTotal').toUpperCase(), String(mobileActionProduct.totalPurchased ?? 0)] as [string, string]]
                  : []),
                [tm('stock').toUpperCase(), isWeightBasedUnit(mobileActionProduct.unit)
                  ? formatScaleQuantityDisplay(Number(mobileActionProduct.stock ?? 0), mobileActionProduct.unit)
                  : String(mobileActionProduct.stock ?? 0)],
                [tm('unit').toUpperCase(), mobileActionProduct.unit || '—'],
              ].map(([label, val]) => (
                <div key={String(label)} className="flex justify-between gap-3 border-b border-gray-50 pb-2 last:border-0">
                  <span className="text-[10px] text-gray-500 font-semibold shrink-0">{label}</span>
                  <span className="text-right text-gray-900 break-all">{val}</span>
                </div>
              ))}
            </div>
            <div className="shrink-0 border-t border-gray-100 p-3 space-y-2 bg-gray-50 rounded-b-2xl">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="py-2.5 px-2 text-xs font-semibold rounded-lg bg-blue-600 text-white"
                  onClick={() => {
                    const prod = mobileActionProduct;
                    setMobileActionProduct(null);
                    setActiveHubProduct(prod);
                    setShowProductHub(true);
                  }}
                >
                  {t.actionCenter}
                </button>
                <button
                  type="button"
                  className="py-2.5 px-2 text-xs font-semibold rounded-lg border border-gray-300 bg-white"
                  onClick={() => {
                    const id = mobileActionProduct.id;
                    setMobileActionProduct(null);
                    openProductForm(id);
                  }}
                >
                  {t.edit}
                </button>
                <button
                  type="button"
                  className="py-2.5 px-2 text-xs font-semibold rounded-lg border border-gray-300 bg-white col-span-2"
                  onClick={() => {
                    const prod = mobileActionProduct;
                    setMobileActionProduct(null);
                    setActiveHubProduct(prod);
                    setHubInitialTab('movements');
                    setShowProductHub(true);
                  }}
                >
                  {t.historyMovements || t.movements}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  className="py-2 text-[10px] font-medium rounded border bg-white"
                  onClick={() => {
                    const prod = mobileActionProduct;
                    setMobileActionProduct(null);
                    setActiveHubProduct(prod);
                    printLabel(prod, { w: 40, h: 20 });
                  }}
                >
                  40×20
                </button>
                <button
                  type="button"
                  className="py-2 text-[10px] font-medium rounded border bg-white"
                  onClick={() => {
                    const prod = mobileActionProduct;
                    setMobileActionProduct(null);
                    setActiveHubProduct(prod);
                    printLabel(prod, { w: 50, h: 30 });
                  }}
                >
                  50×30
                </button>
                <button
                  type="button"
                  className="py-2 text-[10px] font-medium rounded border bg-white"
                  onClick={() => {
                    const prod = mobileActionProduct;
                    setMobileActionProduct(null);
                    setActiveHubProduct(prod);
                    printLabel(prod, { w: 60, h: 40 });
                  }}
                >
                  60×40
                </button>
              </div>
              <button
                type="button"
                className="w-full py-2.5 text-xs font-semibold rounded-lg bg-red-600 text-white"
                onClick={async () => {
                  const product = mobileActionProduct;
                  const message = t.confirmItemDelete
                    ? t.confirmItemDelete.replace('{item}', product.name)
                    : `${product.name} silinsin mi?`;
                  const ok = await confirmDialog({
                    variant: 'danger',
                    title: tm('deleteProduct') || 'Ürünü sil',
                    description: message,
                    confirmLabel: tm('deleteAction') || 'Sil',
                    cancelLabel: tm('cancel') || 'İptal',
                  });
                  if (!ok) return;
                  setMobileActionProduct(null);
                  try {
                    await executeDeleteWithProtection([product]);
                  } catch (err: any) {
                    toast.error(err?.message || 'Ürün silinemedi.');
                  }
                }}
              >
                {t.deleteAction}
              </button>
            </div>
          </div>
        </FullscreenBodyPortal>
      )}

      {/* Product Form — body portal (üst çubuk altında kalmaması için) */}
      {showProductForm && (
        <FullscreenBodyPortal className="bg-white">
          <ProductFormPage
            productId={editingProductId}
            onSave={handleProductFormSubmit}
            onClose={closeProductForm}
          />
        </FullscreenBodyPortal>
      )}

      {/* Product Hub — body portal */}
      {showProductHub && activeHubProduct && (
        <FullscreenBodyPortal>
          <ProductOperationHub
            product={activeHubProduct}
            initialTab={hubInitialTab}
            onClose={() => {
              setShowProductHub(false);
              setActiveHubProduct(null);
              setHubInitialTab('overview');
            }}
            onSave={(updatedProduct) => {
              handleProductFormSubmit(updatedProduct);
              setActiveHubProduct(updatedProduct);
            }}
          />
        </FullscreenBodyPortal>
      )}

      {/* Etiket önizleme — tam ekran; araç çubuğu (Yazdır / PDF) kesilmesin diye ekstra kart sarmalayıcı yok */}
      {showViewer && selectedTemplate && activeHubProduct && (
        <ReportViewerModule
          template={selectedTemplate}
          data={{ product: activeHubProduct }}
          onClose={() => {
            setShowViewer(false);
            setSelectedTemplate(null);
          }}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'hub',
              label: t.actionCenter,
              icon: Package,
              onClick: () => {
                setActiveHubProduct(contextMenu.product);
                setShowProductHub(true);
                setContextMenu(null);
              }
            },
            {
              id: 'edit',
              label: t.edit,
              icon: Edit,
              onClick: () => openProductForm(contextMenu.product.id)
            },
            {
              id: 'label-40-20',
              label: `${t.print} (40x20mm)`,
              icon: Barcode,
              onClick: () => {
                setActiveHubProduct(contextMenu.product);
                printLabel(contextMenu.product, { w: 40, h: 20 });
                setContextMenu(null);
              }
            },
            {
              id: 'label-50-30',
              label: `${t.print} (50x30mm)`,
              icon: Barcode,
              onClick: () => {
                setActiveHubProduct(contextMenu.product);
                printLabel(contextMenu.product, { w: 50, h: 30 });
                setContextMenu(null);
              }
            },
            {
              id: 'label-60-40',
              label: `${t.print} (60x40mm)`,
              icon: Barcode,
              onClick: () => {
                setActiveHubProduct(contextMenu.product);
                printLabel(contextMenu.product, { w: 60, h: 40 });
                setContextMenu(null);
              }
            },
            {
              id: 'movements',
              label: t.historyMovements || t.movements,
              icon: TrendingUp,
              onClick: () => {
                setActiveHubProduct(contextMenu.product);
                setHubInitialTab('movements');
                setShowProductHub(true);
                setContextMenu(null);
              },
              divider: true
            },
            {
              id: 'delete',
              label: t.deleteAction,
              icon: Trash2,
              variant: 'danger',
              divider: demoProductsInList.length > 0,
              onClick: async () => {
                const product = contextMenu.product;
                const message = t.confirmItemDelete
                  ? t.confirmItemDelete.replace('{item}', product.name)
                  : `${product.name} silinsin mi? Emin misiniz?`;
                const ok = await confirmDialog({
                  variant: 'danger',
                  title: tm('deleteProduct') || 'Ürünü sil',
                  description: message,
                  confirmLabel: tm('deleteAction') || 'Sil',
                  cancelLabel: tm('cancel') || 'İptal',
                });
                if (!ok) return;
                setContextMenu(null);
                try {
                  await executeDeleteWithProtection([product]);
                } catch (err: any) {
                  toast.error(err?.message || 'Ürün silinemedi.');
                }
              }
            },
            ...(demoProductsInList.length > 0
              ? [
                  {
                    id: 'delete-demo',
                    label: `Demo ürünleri toplu sil (${demoProductsInList.length} adet)`,
                    icon: Trash2,
                    variant: 'danger' as const,
                    onClick: async () => {
                      const ok = await confirmDialog({
                        variant: 'danger',
                        title: tm('deleteDemoProducts') || 'Demo ürünleri sil',
                        description: (tm('confirmBulkDemoProductDelete') || '{count} demo ürünü silinecek. Emin misiniz?').replace('{count}', String(demoProductsInList.length)),
                        confirmLabel: tm('deleteAction') || 'Sil',
                        cancelLabel: tm('cancel') || 'İptal',
                      });
                      if (!ok) {
                        setContextMenu(null);
                        return;
                      }
                      (async () => {
                        setContextMenu(null);
                        await executeDeleteWithProtection(demoProductsInList);
                      })();
                    }
                  }
                ]
              : [])
          ]}
        />
      )}
      {showBulkImageModal && selectedProducts.length > 0 && (
        <BulkProductImageUpdateModal
          key={selectedProducts.map((p) => p.id).join(',')}
          products={selectedProducts}
          onClose={() => setShowBulkImageModal(false)}
          onConfirm={async (updates) => {
            for (const u of updates) {
              await updateProduct(u.id, { image_url: u.image_url, image_url_cdn: '' });
            }
            toast.success(`${updates.length} ürünün resmi güncellendi.`);
            await loadProducts(true);
            setSelectedProducts([]);
          }}
        />
      )}

      {showBulkFieldModal && selectedProducts.length > 0 && (
        <BulkProductFieldUpdateModal
          products={selectedProducts}
          showPurchasePricing={showPurchasePricing}
          onClose={() => setShowBulkFieldModal(false)}
          onApplied={async () => {
            await loadProducts(true);
            setSelectedProducts([]);
          }}
        />
      )}

      {/* Bulk Rate Modal — body portal */}
      {showBulkRateModal && (
        <FullscreenBodyPortal className="flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b bg-orange-50 flex items-center justify-between">
              <h3 className="font-bold text-orange-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Toplu Kur Güncelleme ({selectedProducts.length} Ürün)
              </h3>
              <button onClick={() => setShowBulkRateModal(false)} className="p-1 hover:bg-orange-100 rounded-lg text-orange-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Seçili ürünlerin USD fiyatlarını baz alarak IQD fiyatlarını güncelleyebilirsiniz.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Güncel Kur (1 USD)</label>
                  <input
                    type="number"
                    value={bulkRate}
                    onChange={(e) => setBulkRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 border-2 border-orange-100 rounded-xl focus:outline-none focus:border-orange-500 text-lg font-bold"
                    placeholder="Kur örn: 1530"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Yuvarlama (MROUND)</label>
                  <select
                    value={roundTo}
                    onChange={(e) => setRoundTo(parseInt(e.target.value))}
                    className="w-full px-4 py-3 border-2 border-orange-100 rounded-xl focus:outline-none focus:border-orange-500 text-lg font-bold bg-white"
                  >
                    <option value={1}>Yok</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                    <option value={500}>500</option>
                    <option value={1000}>1000</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 flex gap-3 justify-end">
              <button onClick={() => setShowBulkRateModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium">İptal</button>
              <button
                onClick={async () => {
                  try {
                    const mround = (num: number, mult: number) => num > 0 ? Math.round(num / mult) * mult : 0;
                    
                    const promises = selectedProducts.map(p => {
                      const basePrice = Number((p as any).salePriceUSD ?? 0);
                      if (basePrice > 0) {
                        const calculatedPrice = basePrice * bulkRate;
                        const roundedPrice = mround(calculatedPrice, roundTo);
                        return updateProduct(p.id, { ...p, price: roundedPrice });
                      }
                      return Promise.resolve();
                    });
                    
                    await Promise.all(promises);
                    toast.success(`${selectedProducts.length} ürünün fiyatı kur ve yuvarlama ile güncellendi.`);
                    setShowBulkRateModal(false);
                    setSelectedProducts([]);
                  } catch (e: any) {
                    toast.error(e.message || "Güncelleme başarısız.");
                  }
                }}
                className="px-6 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 font-bold shadow-lg shadow-orange-200"
              >
                Fiyatları Güncelle
              </button>
            </div>
          </div>
        </FullscreenBodyPortal>
      )}

      {showBulkLabelPrint && (
        <BulkProductLabelPrint
          key={bulkLabelModalKey}
          onClose={() => setShowBulkLabelPrint(false)}
          initialQueueProducts={bulkLabelInitial}
          gridSelectedProducts={selectedProducts}
        />
      )}
    </div>
  );
}
