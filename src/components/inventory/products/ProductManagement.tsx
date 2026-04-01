import { useState, useEffect, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import type { Product } from '../../../App';
import { useProductStore } from '../../../store';
import { ProductFormPage } from './ProductFormPage';
import { ProductOperationHub, HubTab } from './ProductOperationHub';
import { ContextMenu } from '../../shared/ContextMenu';
import { formatNumber } from '../../../utils/formatNumber';
import { toast } from 'sonner';
import { Package, Edit, Barcode, TrendingUp, Trash2, RefreshCw, Download, Upload, Plus, Search, X, FileText } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ReportViewerModule } from '../../reports/ReportViewerModule';
import { ReportTemplate } from '../../reports/designerUtils';

/** 001_demo_data.sql ile gelen demo ürün kodları — toplu silmede kullanılır */
const DEMO_PRODUCT_CODES = new Set([
  'PHONE-001', 'PHONE-002', 'PHONE-003', 'PC-001', 'PC-002',
  'SNACK-001', 'SNACK-002', 'SNACK-003', 'DRINK-001', 'DRINK-002',
  'BEAUTY-001', 'BEAUTY-002', 'CLOTH-001', 'CLOTH-002', 'CLOTH-003',
  'TSHIRT-VAR', 'PHONE-VAR',
  'MENU-001', 'MENU-002', 'MENU-003', 'MENU-004', 'MENU-005', 'MENU-006', 'MENU-007'
]);

interface ProductManagementProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
}

export function ProductManagement({ products, setProducts }: ProductManagementProps) {
  const { t, tm } = useLanguage();
  const addProduct = useProductStore((state) => state.addProduct);
  const updateProduct = useProductStore((state) => state.updateProduct);
  const deleteProduct = useProductStore((state) => state.deleteProduct);
  const loadProducts = useProductStore((state) => state.loadProducts);
  const storeProducts = useProductStore((state) => state.products);
  const isLoading = useProductStore((state) => state.isLoading);

  // Store'dan ürünleri kullan (stok güncellemeleri otomatik yansır)
  const displayProducts = storeProducts.length > 0 ? storeProducts : products;

  // Sayfa yüklendiğinde ve periyodik olarak ürünleri yenile
  useEffect(() => {
    // İlk yükleme
    if (storeProducts.length === 0) {
      loadProducts();
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
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [showBulkRateModal, setShowBulkRateModal] = useState(false);
  const [bulkRate, setBulkRate] = useState(1530); // Default common rate
  const [roundTo, setRoundTo] = useState(250); // Default rounding for IQD

  // Design Center Integration
  const [showViewer, setShowViewer] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);

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
          content: `${formatNumber(product.price || 0, 2, false)} IQD`,
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

  const filteredProducts = useMemo(() => {
    return displayProducts.filter(product => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = searchQuery === '' ||
        (product.name?.toLowerCase() || '').includes(searchLower) ||
        (product.barcode || '').includes(searchQuery) ||
        (product.category?.toLowerCase() || '').includes(searchLower);
      const matchesCategory = categoryFilter === 'Tümü' || product.category === categoryFilter;
      const matchesService = showServicesOnly ? (product.materialType === 'service' || product.isService === true) : true;
      return matchesSearch && matchesCategory && matchesService;
    });
  }, [displayProducts, searchQuery, categoryFilter]);

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
      cell: info => info.getValue() ? formatNumber(info.getValue(), 2, false) : '-',
      size: 120
    }),
    columnHelper.accessor('price', {
      header: tm('unitPrice').toUpperCase(),
      cell: info => info.getValue() ? formatNumber(info.getValue(), 2, false) : '-',
      size: 140
    }),
    columnHelper.accessor('salePriceUSD' as any, {
      header: 'FİYAT (USD)',
      cell: info => info.getValue() ? `$${formatNumber(info.getValue(), 2, false)}` : '-',
      size: 120
    }),
    columnHelper.accessor('purchasePriceUSD' as any, {
      header: 'ALIŞ (USD)',
      cell: info => info.getValue() ? `$${formatNumber(info.getValue(), 2, false)}` : '-',
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
              <button
                onClick={() => setShowBulkRateModal(true)}
                className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white hover:bg-orange-600 transition-colors text-[10px] font-bold"
              >
                <TrendingUp className="w-3 h-3" />
                <span>Toplu Kur {selectedProducts.length}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-3 bg-gray-50">
        {/* Search Box */}
        <div className="mb-3 bg-white p-3 border border-gray-200 rounded">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={tm('productSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="bg-white border border-gray-200">
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-gray-600 text-sm">Veriler yükleniyor...</p>
              </div>
            </div>
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
                  await deleteProduct(product.id);
                  toast.success('Ürün silindi.');
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
                        let ok = 0;
                        let fail = 0;
                        for (const p of demoProductsInList) {
                          try {
                            await deleteProduct(p.id);
                            ok++;
                          } catch {
                            fail++;
                          }
                        }
                        await loadProducts(true);
                        if (fail > 0) {
                          toast.success(`${ok} demo ürün silindi. ${fail} ürün silinemedi.`);
                        } else {
                          toast.success(`${ok} demo ürün silindi.`);
                        }
                      })();
                    }
                  }
                ]
              : [])
          ]}
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
