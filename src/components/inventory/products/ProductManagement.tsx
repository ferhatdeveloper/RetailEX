import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import type { Product } from '../../../App';
import { useProductStore } from '../../../store';
import { productAPI } from '../../../services/api/products';
import { ProductFormPage } from './ProductFormPage';
import { ProductOperationHub, HubTab } from './ProductOperationHub';
import { ContextMenu } from '../../shared/ContextMenu';
import { formatNumber, formatCurrency as formatAmountWithCode } from '../../../utils/formatNumber';
import { formatCurrency } from '../../../utils/currency';
import { toast } from 'sonner';
import { Package, Edit, Barcode, TrendingUp, Trash2, RefreshCw, Download, Upload, Plus, Search, X, FileText, ImageIcon } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useResponsive } from '../../../hooks/useResponsive';
import { BulkProductImageUpdateModal } from './BulkProductImageUpdateModal';
import { ReportViewerModule } from '../../reports/ReportViewerModule';
import { ReportTemplate } from '../../reports/designerUtils';
import { DEMO_PRODUCT_CODES } from '../../../utils/demoSeedCodes';

interface ProductManagementProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
}

const MOBILE_PAGE_SIZE = 40;
const LONG_PRESS_MS = 480;
const LONG_PRESS_MOVE_PX = 14;

export function ProductManagement({ products, setProducts }: ProductManagementProps) {
  const { t, tm } = useLanguage();
  const { isMobile } = useResponsive();
  const addProduct = useProductStore((state) => state.addProduct);
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
      loadProducts(true); // Silent refresh
    }, 30000); // 30 saniye

    return () => clearInterval(interval);
  }, [loadProducts, storeProducts.length]);

  // Manuel yenileme fonksiyonu
  const handleRefresh = async () => {
    await loadProducts();
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Tümü');
  const [showProductForm, setShowProductForm] = useState(false);
  const [showProductHub, setShowProductHub] = useState(false);
  const [activeHubProduct, setActiveHubProduct] = useState<Product | null>(null);
  const [hubInitialTab, setHubInitialTab] = useState<HubTab>('overview');
  const [editingProductId, setEditingProductId] = useState<string | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; product: Product } | null>(null);
  const [showServicesOnly, setShowServicesOnly] = useState(false);
  const [duplicateDetectBy, setDuplicateDetectBy] = useState<'none' | 'code' | 'barcode'>('none');
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [showBulkRateModal, setShowBulkRateModal] = useState(false);
  const [showBulkImageModal, setShowBulkImageModal] = useState(false);
  const [bulkRate, setBulkRate] = useState(1530); // Default common rate
  const [roundTo, setRoundTo] = useState(250); // Default rounding for IQD
  const [mobilePage, setMobilePage] = useState(0);
  const [mobileActionProduct, setMobileActionProduct] = useState<Product | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Design Center Integration
  const [showViewer, setShowViewer] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);

  const buildInvoiceWarningText = (productNames: string[], saleRefs: string[], purchaseRefs: string[]) => {
    const names = productNames.slice(0, 8).join(', ');
    const sales = saleRefs.length > 0 ? `Satış: ${saleRefs.slice(0, 8).join(', ')}` : '';
    const purchases = purchaseRefs.length > 0 ? `Alış: ${purchaseRefs.slice(0, 8).join(', ')}` : '';
    return [
      `Bu ürün(ler) faturalarda kullanılmış: ${names}${productNames.length > 8 ? '...' : ''}`,
      sales,
      purchases,
      'Bu faturalardaki geçmiş kayıt ilişkilerini kaldırmak istediğinize emin misiniz?',
      'Devam etmek için yönetici şifresi girmeniz gerekecek.'
    ].filter(Boolean).join('\n');
  };

  const executeDeleteWithProtection = async (targets: Product[]) => {
    if (!targets.length) return;
    const ids = targets.map((p) => p.id);
    const impact = await productAPI.getDeleteImpact(ids);
    const hasRefs = impact.hasInvoiceRefs;

    let options: { force?: boolean; adminPassword?: string } | undefined;
    if (hasRefs) {
      const saleInvoiceNos = Array.from(new Set(impact.saleRefs.map((x) => x.invoiceNo)));
      const purchaseInvoiceNos = Array.from(new Set(impact.purchaseRefs.map((x) => x.invoiceNo)));
      const msg = buildInvoiceWarningText(
        targets.map((p) => p.name),
        saleInvoiceNos,
        purchaseInvoiceNos
      );
      if (!window.confirm(msg)) return;
      const adminPassword = window.prompt('Yönetici şifresi gerekli:');
      if (!adminPassword) {
        toast.error('Yönetici şifresi girilmedi, işlem iptal edildi.');
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

  const printLabel = (product: Product, size: { w: number, h: number }) => {
    const template: ReportTemplate = {
      name: `${size.w}x${size.h}mm Ürün Etiketi`,
      category: 'etiket',
      pageSize: { width: size.w, height: size.h },
      components: [
        {
          id: 'p_name',
          type: 'text',
          x: 2, y: 2,
          width: size.w - 4, height: 6,
          content: product.name,
          style: { fontSize: size.w < 50 ? '8px' : '10px', fontWeight: 'bold', textAlign: 'center' }
        },
        {
          id: 'p_price',
          type: 'text',
          x: 2, y: size.h / 2 - 2,
          width: size.w - 4, height: 8,
          content: formatCurrency(product.price || 0, 2, false),
          style: { fontSize: size.w < 50 ? '12px' : '16px', fontWeight: '900', textAlign: 'center', color: '#1d4ed8' }
        },
        {
          id: 'barcode',
          type: 'barcode',
          x: size.w * 0.1, y: size.h - (size.h * 0.35),
          width: size.w * 0.8, height: size.h * 0.25,
          content: product.barcode
        }
      ]
    };
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

  useEffect(() => {
    setMobilePage(0);
  }, [searchQuery, categoryFilter, showServicesOnly, duplicateDetectBy]);

  const filteredProducts = useMemo(() => {
    return displayProducts.filter(product => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = searchQuery === '' ||
        (product.name?.toLowerCase() || '').includes(searchLower) ||
        (product.code?.toLowerCase() || '').includes(searchLower) ||
        (product.barcode || '').includes(searchQuery) ||
        (product.category?.toLowerCase() || '').includes(searchLower);
      const matchesCategory = categoryFilter === 'Tümü' || product.category === categoryFilter;
      const matchesService = showServicesOnly ? (product.materialType === 'service' || product.isService === true) : true;
      const duplicateKey = duplicateDetectBy === 'code'
        ? String(product.code || '').trim()
        : String(product.barcode || '').trim();
      const matchesDuplicate = duplicateDetectBy === 'none' || duplicateKeys.has(duplicateKey);
      return matchesSearch && matchesCategory && matchesService && matchesDuplicate;
    });
  }, [displayProducts, searchQuery, categoryFilter, showServicesOnly, duplicateDetectBy, duplicateKeys]);

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

  const handleProductFormSubmit = (product: Product) => {
    if (editingProductId) {
      updateProduct(editingProductId, product);
    } else {
      addProduct(product);
    }
    closeProductForm();
  };

  const columnHelper = createColumnHelper<Product>();

  const columns = useMemo<ColumnDef<Product, any>[]>(() => [
    columnHelper.accessor('barcode', {
      header: tm('barcode').toUpperCase(),
      cell: info => info.getValue(),
      size: 140
    }),
    columnHelper.accessor('name', {
      header: tm('productName').toUpperCase(),
      cell: info => info.getValue(),
      size: 250
    }),
    columnHelper.accessor('category', {
      header: tm('category').toUpperCase(),
      cell: info => info.getValue(),
      size: 140
    }),
    columnHelper.accessor('cost', {
      header: tm('cost').toUpperCase(),
      cell: info => info.getValue() != null && info.getValue() !== '' ? formatCurrency(Number(info.getValue()), 2, false) : '-',
      size: 120
    }),
    columnHelper.accessor('price', {
      header: tm('unitPrice').toUpperCase(),
      cell: info => info.getValue() != null && info.getValue() !== '' ? formatCurrency(Number(info.getValue()), 2, false) : '-',
      size: 140
    }),
    columnHelper.accessor('salePriceUSD' as any, {
      header: 'FİYAT (USD)',
      cell: info => info.getValue() != null && info.getValue() !== '' ? formatAmountWithCode(Number(info.getValue()), 'USD', 2) : '-',
      size: 120
    }),
    columnHelper.accessor('purchasePriceUSD' as any, {
      header: 'ALIŞ (USD)',
      cell: info => info.getValue() != null && info.getValue() !== '' ? formatAmountWithCode(Number(info.getValue()), 'USD', 2) : '-',
      size: 120
    }),
    columnHelper.accessor('taxRate', {
      header: tm('tax').toUpperCase(),
      cell: info => `%${info.getValue()}`,
      size: 100
    }),
    columnHelper.accessor('totalSales', {
      header: tm('salesTotal').toUpperCase(),
      cell: info => (
        <span className="text-green-600 font-medium font-bold">
          {info.getValue() || 0}
        </span>
      ),
      size: 120
    }),
    columnHelper.accessor('totalPurchased', {
      header: tm('purchaseTotal').toUpperCase(),
      cell: info => (
        <span className="text-blue-600 font-medium font-bold">
          {info.getValue() || 0}
        </span>
      ),
      size: 120
    }),
    columnHelper.accessor('stock', {
      header: tm('stock').toUpperCase(),
      cell: info => (
        <span className={info.getValue() < 10 ? 'text-red-600 font-medium' : 'text-gray-700'}>
          {info.getValue()}
        </span>
      ),
      size: 100
    }),
    columnHelper.accessor('unit', {
      header: tm('unit').toUpperCase(),
      cell: info => info.getValue(),
      size: 100
    }),
  ], [tm]);

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2">
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
            <button className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
              <Download className="w-3 h-3" />
              <span>{tm('export')}</span>
            </button>
            <button className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
              <Upload className="w-3 h-3" />
              <span>{tm('import')}</span>
            </button>
            <button
              onClick={() => openProductForm()}
              className="flex items-center gap-1 px-2 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px]"
            >
              <Plus className="w-3 h-3" />
              <span>{tm('newProduct')}</span>
            </button>
            <button
              onClick={() => setShowServicesOnly(!showServicesOnly)}
              className={`flex items-center gap-1 px-2 py-1 transition-colors text-[10px] font-bold ${
                showServicesOnly ? 'bg-orange-600 text-white' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              <FileText className="w-3 h-3" />
              <span>Hizmet Kartları</span>
            </button>
            {selectedProducts.length > 0 && (
              <>
                <button
                  onClick={async () => {
                    if (!window.confirm(`${selectedProducts.length} ürün silinecek. Emin misiniz?`)) return;
                    await executeDeleteWithProtection(selectedProducts);
                    setSelectedProducts([]);
                  }}
                  className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white hover:bg-red-700 transition-colors text-[10px] font-bold"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Toplu Sil {selectedProducts.length}</span>
                </button>
                <button
                  onClick={() => setShowBulkImageModal(true)}
                  className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-[10px] font-bold"
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Toplu resim {selectedProducts.length}</span>
                </button>
                <button
                  onClick={() => setShowBulkRateModal(true)}
                  className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white hover:bg-orange-600 transition-colors text-[10px] font-bold"
                >
                  <TrendingUp className="w-3 h-3" />
                  <span>Toplu Kur {selectedProducts.length}</span>
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
        <div className="mb-3 bg-white p-3 border border-gray-200 rounded shrink-0">
          {isMobile && (
            <p className="text-[11px] text-gray-500 mb-2">
              Satıra basılı tutun: detay ve işlemler (düzenle, sil, etiket…).
            </p>
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
            <div className="flex items-center gap-2">
              <select
                value={duplicateDetectBy}
                onChange={(e) => setDuplicateDetectBy(e.target.value as 'none' | 'code' | 'barcode')}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">Tekrar Filtresi: Kapalı</option>
                <option value="code">Tekrar Filtresi: Ürün Kodu</option>
                <option value="barcode">Tekrar Filtresi: Barkod</option>
              </select>
              {duplicateDetectBy !== 'none' && (
                <span className="text-[11px] px-2 py-1 rounded bg-amber-100 text-amber-700 font-semibold whitespace-nowrap">
                  {duplicateKeys.size} tekrar anahtarı
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          className={`bg-white border border-gray-200 min-h-0 ${isMobile ? 'flex-1 flex flex-col overflow-hidden' : ''}`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-gray-600 text-sm">Veriler yükleniyor...</p>
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
                    const low = (p.stock ?? 0) < 10;
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
                            aria-label="Seç"
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
                              {tm('stock')} {p.stock ?? 0}
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
              onRowContextMenu={(e, product) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, product });
              }}
              enableSelection
              onSelectionChange={setSelectedProducts}
              height="calc(100vh - 120px)"
              pageSize={50}
            />
          )}
        </div>
      </div>

      {/* Mobil: basılı tut ile işlem + detay */}
      {mobileActionProduct && (
        <div
          className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
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
                [tm('productName').toUpperCase(), mobileActionProduct.name || '—'],
                [tm('category').toUpperCase(), mobileActionProduct.category || '—'],
                [tm('cost').toUpperCase(), mobileActionProduct.cost != null && mobileActionProduct.cost !== '' ? formatCurrency(Number(mobileActionProduct.cost), 2, false) : '—'],
                [tm('unitPrice').toUpperCase(), formatCurrency(Number(mobileActionProduct.price) || 0, 2, false)],
                ['FİYAT (USD)', (mobileActionProduct as any).salePriceUSD != null && (mobileActionProduct as any).salePriceUSD !== '' ? formatAmountWithCode(Number((mobileActionProduct as any).salePriceUSD), 'USD', 2) : '—'],
                ['ALIŞ (USD)', (mobileActionProduct as any).purchasePriceUSD != null && (mobileActionProduct as any).purchasePriceUSD !== '' ? formatAmountWithCode(Number((mobileActionProduct as any).purchasePriceUSD), 'USD', 2) : '—'],
                [tm('tax').toUpperCase(), `%${mobileActionProduct.taxRate ?? 0}`],
                [tm('salesTotal').toUpperCase(), String(mobileActionProduct.totalSales ?? 0)],
                [tm('purchaseTotal').toUpperCase(), String(mobileActionProduct.totalPurchased ?? 0)],
                [tm('stock').toUpperCase(), String(mobileActionProduct.stock ?? 0)],
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
                  if (!window.confirm(message)) return;
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
        </div>
      )}

      {/* Product Form */}
      {showProductForm && (
        <div className="fixed inset-0 z-[10000] bg-white">
          <ProductFormPage
            productId={editingProductId}
            onSave={handleProductFormSubmit}
            onClose={closeProductForm}
          />
        </div>
      )}

      {/* Product Hub */}
      {showProductHub && activeHubProduct && (
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
            // Update active product in hub to reflect changes without reloading
            setActiveHubProduct(updatedProduct);
          }}
        />
      )}

      {/* Report Viewer for Labels */}
      {showViewer && selectedTemplate && activeHubProduct && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col">
            <ReportViewerModule
              template={selectedTemplate}
              data={{ product: activeHubProduct }}
              onClose={() => setShowViewer(false)}
            />
          </div>
        </div>
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
                if (!window.confirm(message)) return;
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
                    onClick: () => {
                      const message = `${demoProductsInList.length} demo ürünü silinecek. Emin misiniz?`;
                      if (!window.confirm(message)) {
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

      {/* Bulk Rate Modal */}
      {showBulkRateModal && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
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
                      const basePrice = p.salePriceUSD || 0;
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
        </div>
      )}
    </div>
  );
}
