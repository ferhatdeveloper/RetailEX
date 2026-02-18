import { useState, useEffect } from 'react';
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
import { Package, Edit, Barcode, TrendingUp, Trash2, RefreshCw, Download, Upload, Plus, Search } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ReportViewerModule } from '../../reports/ReportViewerModule';
import { ReportTemplate } from '../../reports/designerUtils';

interface ProductManagementProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
}

export function ProductManagement({ products, setProducts }: ProductManagementProps) {
  const { tm } = useLanguage();
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

  const filteredProducts = displayProducts.filter(product => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === '' ||
      (product.name?.toLowerCase() || '').includes(searchLower) ||
      (product.barcode || '').includes(searchQuery) ||
      (product.category?.toLowerCase() || '').includes(searchLower);
    const matchesCategory = categoryFilter === 'Tümü' || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

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

  const columns = [
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
  ];

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
              label: 'İşlem Merkezi',
              icon: Package,
              onClick: () => {
                setActiveHubProduct(contextMenu.product);
                setShowProductHub(true);
                setContextMenu(null);
              }
            },
            {
              id: 'edit',
              label: 'Düzenle',
              icon: Edit,
              onClick: () => openProductForm(contextMenu.product.id)
            },
            {
              id: 'label-40-20',
              label: 'Etiket Yazdır (40x20mm)',
              icon: Barcode,
              onClick: () => {
                setActiveHubProduct(contextMenu.product);
                printLabel(contextMenu.product, { w: 40, h: 20 });
                setContextMenu(null);
              }
            },
            {
              id: 'label-50-30',
              label: 'Etiket Yazdır (50x30mm)',
              icon: Barcode,
              onClick: () => {
                setActiveHubProduct(contextMenu.product);
                printLabel(contextMenu.product, { w: 50, h: 30 });
                setContextMenu(null);
              }
            },
            {
              id: 'label-60-40',
              label: 'Etiket Yazdır (60x40mm)',
              icon: Barcode,
              onClick: () => {
                setActiveHubProduct(contextMenu.product);
                printLabel(contextMenu.product, { w: 60, h: 40 });
                setContextMenu(null);
              }
            },
            {
              id: 'movements',
              label: 'Stok Hareketleri',
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
              label: 'Sil',
              icon: Trash2,
              variant: 'danger',
              onClick: () => {
                if (window.confirm(`${contextMenu.product.name} isimli ürünü silmek istediğinize emin misiniz?`)) {
                  deleteProduct(contextMenu.product.id);
                }
              }
            }
          ]}
        />
      )}
    </div>
  );
}
