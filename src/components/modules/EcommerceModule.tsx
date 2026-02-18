import React, { useState } from 'react';
import {
  ShoppingCart, Package, TrendingUp, DollarSign, Users, Star,
  Search, Filter, Plus, Edit2, Trash2, Eye, Settings, Globe,
  Tag, Percent, Image, FileText, BarChart3, MessageSquare,
  Clock, CheckCircle, XCircle, AlertCircle, ChevronDown,
  ExternalLink, Copy, RefreshCw, Download, Upload, Zap,
  Layers, Grid, List, ShoppingBag, Heart, Share2, Box
} from 'lucide-react';

interface EcommerceProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  comparePrice?: number;
  cost: number;
  stock: number;
  status: 'active' | 'draft' | 'archived';
  variants: ProductVariant[];
  images: string[];
  description: string;
  shortDescription: string;
  seo: SEOData;
  tags: string[];
  rating: number;
  reviewCount: number;
  sales: number;
  views: number;
  createdAt: string;
  updatedAt: string;
}

interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  attributes: { [key: string]: string };
}

interface SEOData {
  title: string;
  description: string;
  keywords: string[];
  slug: string;
}

interface EcommerceOrder {
  id: string;
  orderNumber: string;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  items: {
    productName: string;
    quantity: number;
    price: number;
  }[];
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  paymentStatus: 'pending' | 'paid' | 'refunded';
  shippingAddress: string;
  createdAt: string;
}

interface Review {
  id: string;
  productId: string;
  productName: string;
  customerName: string;
  rating: number;
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

type ViewMode = 'dashboard' | 'products' | 'orders' | 'reviews' | 'analytics' | 'settings';

export function EcommerceModule() {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<EcommerceProduct | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productFormData, setProductFormData] = useState({
    name: '',
    sku: '',
    category: '',
    price: 0,
    comparePrice: 0,
    cost: 0,
    stock: 0,
    status: 'active' as 'active' | 'draft' | 'archived',
    description: '',
    shortDescription: '',
    seoTitle: '',
    seoDescription: '',
    seoKeywords: '',
    seoSlug: '',
    tags: [] as string[],
    images: [] as string[]
  });
  const [activeTab, setActiveTab] = useState<'general' | 'variants' | 'seo' | 'images'>('general');
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  // Mock data
  const [products, setProducts] = useState<EcommerceProduct[]>([
    {
      id: '1',
      name: 'Premium Laptop Çantası',
      sku: 'LAP-BAG-001',
      category: 'Aksesuar',
      price: 299.90,
      comparePrice: 399.90,
      cost: 150,
      stock: 45,
      status: 'active',
      variants: [
        { id: 'v1', name: 'Siyah - Küçük', sku: 'LAP-BAG-001-BK-S', price: 299.90, stock: 15, attributes: { color: 'Siyah', size: 'Küçük' } },
        { id: 'v2', name: 'Siyah - Büyük', sku: 'LAP-BAG-001-BK-L', price: 329.90, stock: 20, attributes: { color: 'Siyah', size: 'Büyük' } },
        { id: 'v3', name: 'Kahverengi - Küçük', sku: 'LAP-BAG-001-BR-S', price: 299.90, stock: 10, attributes: { color: 'Kahverengi', size: 'Küçük' } },
      ],
      images: ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400'],
      description: 'Şık ve dayanıklı laptop çantası. Su geçirmez kumaş, çok bölmeli iç tasarım.',
      shortDescription: 'Premium kalite laptop çantası',
      seo: {
        title: 'Premium Laptop Çantası | Su Geçirmez',
        description: 'En kaliteli laptop çantası modelleri. Hızlı kargo ve güvenli alışveriş.',
        keywords: ['laptop çantası', 'su geçirmez çanta', 'premium çanta'],
        slug: 'premium-laptop-cantasi'
      },
      tags: ['yeni', 'öne-çıkan', 'indirimli'],
      rating: 4.8,
      reviewCount: 124,
      sales: 342,
      views: 5234,
      createdAt: '2024-01-15',
      updatedAt: '2024-12-10'
    },
    {
      id: '2',
      name: 'Kablosuz Mouse',
      sku: 'MOUSE-001',
      category: 'Bilgisayar',
      price: 149.90,
      cost: 80,
      stock: 120,
      status: 'active',
      variants: [],
      images: ['https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400'],
      description: 'Ergonomik tasarım, uzun pil ömrü, hassas sensör.',
      shortDescription: 'Kablosuz ergonomik mouse',
      seo: {
        title: 'Kablosuz Mouse - Ergonomik Tasarım',
        description: 'Kablosuz mouse modelleri en uygun fiyatlarla.',
        keywords: ['kablosuz mouse', 'ergonomik mouse', 'bilgisayar mouse'],
        slug: 'kablosuz-mouse'
      },
      tags: ['çok-satan'],
      rating: 4.5,
      reviewCount: 89,
      sales: 567,
      views: 3421,
      createdAt: '2024-02-10',
      updatedAt: '2024-12-08'
    },
    {
      id: '3',
      name: 'Mekanik Klavye RGB',
      sku: 'KEY-RGB-001',
      category: 'Bilgisayar',
      price: 899.90,
      comparePrice: 1199.90,
      cost: 450,
      stock: 28,
      status: 'active',
      variants: [
        { id: 'v1', name: 'Kırmızı Switch', sku: 'KEY-RGB-001-RED', price: 899.90, stock: 15, attributes: { switch: 'Kırmızı' } },
        { id: 'v2', name: 'Mavi Switch', sku: 'KEY-RGB-001-BLUE', price: 899.90, stock: 13, attributes: { switch: 'Mavi' } },
      ],
      images: ['https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400'],
      description: 'RGB aydınlatmalı mekanik klavye. Programlanabilir tuşlar, alüminyum kasa.',
      shortDescription: 'RGB mekanik gaming klavye',
      seo: {
        title: 'Mekanik Klavye RGB - Gaming',
        description: 'Profesyonel mekanik klavye modelleri.',
        keywords: ['mekanik klavye', 'rgb klavye', 'gaming klavye'],
        slug: 'mekanik-klavye-rgb'
      },
      tags: ['yeni', 'gaming', 'indirimli'],
      rating: 4.9,
      reviewCount: 215,
      sales: 198,
      views: 8932,
      createdAt: '2024-03-05',
      updatedAt: '2024-12-09'
    }
  ]);

  const [orders, setOrders] = useState<EcommerceOrder[]>([
    {
      id: '1',
      orderNumber: 'ORD-2024-00142',
      customer: {
        name: 'Ahmed Al-Maliki',
        email: 'ahmet@example.com',
        phone: '+964 750 123 4567'
      },
      items: [
        { productName: 'Premium Laptop Çantası', quantity: 1, price: 299.90 },
        { productName: 'Kablosuz Mouse', quantity: 2, price: 149.90 }
      ],
      total: 599.70,
      status: 'processing',
      paymentStatus: 'paid',
      shippingAddress: 'Al-Mansour District, Street 45, Baghdad',
      createdAt: '2024-12-10 14:35'
    },
    {
      id: '2',
      orderNumber: 'ORD-2024-00141',
      customer: {
        name: 'Zeynep Kaya',
        email: 'zeynep@example.com',
        phone: '+90 543 987 6543'
      },
      items: [
        { productName: 'Mekanik Klavye RGB', quantity: 1, price: 899.90 }
      ],
      total: 899.90,
      status: 'shipped',
      paymentStatus: 'paid',
      shippingAddress: 'Al-Karada Street, Building 12, Baghdad',
      createdAt: '2024-12-09 11:20'
    },
    {
      id: '3',
      orderNumber: 'ORD-2024-00140',
      customer: {
        name: 'Mohammed Hassan',
        email: 'mehmet@example.com',
        phone: '+964 770 321 9876'
      },
      items: [
        { productName: 'Kablosuz Mouse', quantity: 3, price: 149.90 }
      ],
      total: 449.70,
      status: 'delivered',
      paymentStatus: 'paid',
      shippingAddress: 'Alsancak Mah. Kıbrıs Şehitleri Cad. No:78 Konak/İzmir',
      createdAt: '2024-12-08 09:15'
    }
  ]);

  const [reviews, setReviews] = useState<Review[]>([
    {
      id: '1',
      productId: '1',
      productName: 'Premium Laptop Çantası',
      customerName: 'Ali Veli',
      rating: 5,
      comment: 'Harika bir ürün, kalitesi çok iyi. Kesinlikle tavsiye ederim.',
      status: 'approved',
      createdAt: '2024-12-09 16:30'
    },
    {
      id: '2',
      productId: '3',
      productName: 'Mekanik Klavye RGB',
      customerName: 'Ayşe Yıldız',
      rating: 5,
      comment: 'Gaming için mükemmel. RGB aydınlatması çok güzel.',
      status: 'approved',
      createdAt: '2024-12-08 14:20'
    },
    {
      id: '3',
      productId: '2',
      productName: 'Kablosuz Mouse',
      customerName: 'Can Öztürk',
      rating: 4,
      comment: 'İyi bir mouse ama biraz daha ergonomik olabilirdi.',
      status: 'pending',
      createdAt: '2024-12-10 10:45'
    }
  ]);

  // Stats
  const stats = {
    totalProducts: products.length,
    activeProducts: products.filter(p => p.status === 'active').length,
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.status === 'pending' || o.status === 'processing').length,
    totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
    avgOrderValue: orders.length > 0 ? orders.reduce((sum, o) => sum + o.total, 0) / orders.length : 0,
    totalReviews: reviews.length,
    pendingReviews: reviews.filter(r => r.status === 'pending').length,
    avgRating: products.reduce((sum, p) => sum + p.rating, 0) / products.length,
    totalViews: products.reduce((sum, p) => sum + p.views, 0)
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Ürün</p>
              <p className="text-2xl mt-2">{stats.totalProducts}</p>
              <p className="text-xs text-green-600 mt-1">{stats.activeProducts} aktif</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Sipariş</p>
              <p className="text-2xl mt-2">{stats.totalOrders}</p>
              <p className="text-xs text-orange-600 mt-1">{stats.pendingOrders} beklemede</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Gelir</p>
              <p className="text-2xl mt-2">{stats.totalRevenue.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">Ort: {stats.avgOrderValue.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ortalama Puan</p>
              <p className="text-2xl mt-2">{stats.avgRating.toFixed(1)}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.totalReviews} değerlendirme</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center">
              <Star className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-sm">Son Siparişler</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {orders.slice(0, 5).map(order => (
              <div key={order.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm">{order.orderNumber}</p>
                    <p className="text-xs text-gray-500 mt-1">{order.customer.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{order.total.toFixed(2)}</p>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs mt-1 ${
                      order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                      order.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                      order.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {order.status === 'delivered' ? 'Teslim Edildi' :
                       order.status === 'shipped' ? 'Kargoda' :
                       order.status === 'processing' ? 'Hazırlanıyor' : 'Beklemede'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
            <button 
              onClick={() => setViewMode('orders')}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Tüm Siparişleri Gör →
            </button>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-sm">En Çok Satan Ürünler</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {[...products].sort((a, b) => b.sales - a.sales).slice(0, 5).map(product => (
              <div key={product.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm">{product.name}</p>
                    <p className="text-xs text-gray-500 mt-1">SKU: {product.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{product.sales} satış</p>
                    <p className="text-xs text-gray-500 mt-1">{product.views} görüntülenme</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
            <button 
              onClick={() => setViewMode('products')}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Tüm Ürünleri Gör →
            </button>
          </div>
        </div>
      </div>

      {/* Pending Reviews */}
      {stats.pendingReviews > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm">Onay Bekleyen Yorumlar</h3>
              <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                {stats.pendingReviews} yeni
              </span>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {reviews.filter(r => r.status === 'pending').map(review => (
              <div key={review.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm">{review.customerName}</p>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            className={`w-3 h-3 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} 
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{review.productName}</p>
                    <p className="text-sm text-gray-700 mt-2">{review.comment}</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button className="p-2 text-green-600 hover:bg-green-50 rounded">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button className="p-2 text-red-600 hover:bg-red-50 rounded">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderProducts = () => (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Ürün ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-80"
            />
          </div>
          <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtrele
          </button>
        </div>
        <button 
          onClick={() => {
            setSelectedProduct(null);
            setProductFormData({
              name: '',
              sku: '',
              category: '',
              price: 0,
              comparePrice: 0,
              cost: 0,
              stock: 0,
              status: 'active',
              description: '',
              shortDescription: '',
              seoTitle: '',
              seoDescription: '',
              seoKeywords: '',
              seoSlug: '',
              tags: [],
              images: []
            });
            setVariants([]);
            setActiveTab('general');
            setShowProductModal(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm hover:from-blue-700 hover:to-blue-800 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Yeni Ürün
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs text-gray-600">Ürün</th>
              <th className="px-6 py-3 text-left text-xs text-gray-600">SKU</th>
              <th className="px-6 py-3 text-left text-xs text-gray-600">Kategori</th>
              <th className="px-6 py-3 text-right text-xs text-gray-600">Fiyat</th>
              <th className="px-6 py-3 text-right text-xs text-gray-600">Stok</th>
              <th className="px-6 py-3 text-center text-xs text-gray-600">Durum</th>
              <th className="px-6 py-3 text-center text-xs text-gray-600">Puan</th>
              <th className="px-6 py-3 text-right text-xs text-gray-600">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products
              .filter(p => 
                searchQuery === '' || 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.sku.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map(product => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img 
                        src={product.images[0]} 
                        alt={product.name}
                        className="w-10 h-10 rounded object-cover"
                      />
                      <div>
                        <p className="text-sm">{product.name}</p>
                        {product.variants.length > 0 && (
                          <p className="text-xs text-gray-500">{product.variants.length} varyant</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{product.sku}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{product.category}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">
                    <div>
                      {product.price.toFixed(2)}
                      {product.comparePrice && (
                        <p className="text-xs text-gray-400 line-through">{product.comparePrice.toFixed(2)}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    <span className={product.stock < 10 ? 'text-red-600' : product.stock < 30 ? 'text-yellow-600' : 'text-green-600'}>
                      {product.stock}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-2 py-1 rounded text-xs ${
                      product.status === 'active' ? 'bg-green-100 text-green-700' :
                      product.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {product.status === 'active' ? 'Aktif' : product.status === 'draft' ? 'Taslak' : 'Arşiv'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-sm">{product.rating}</span>
                      <span className="text-xs text-gray-400">({product.reviewCount})</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedProduct(product);
                          setShowProductModal(true);
                        }}
                        className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-1 text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (viewMode) {
      case 'dashboard':
        return renderDashboard();
      case 'products':
        return renderProducts();
      case 'orders':
        return <div className="text-center py-12 text-gray-500">Sipariş Yönetimi (Yakında)</div>;
      case 'reviews':
        return <div className="text-center py-12 text-gray-500">Yorum Yönetimi (Yakında)</div>;
      case 'analytics':
        return <div className="text-center py-12 text-gray-500">Analitik (Yakında)</div>;
      case 'settings':
        return <div className="text-center py-12 text-gray-500">E-Ticaret Ayarları (Yakında)</div>;
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg text-gray-900">E-Ticaret Yönetim Paneli</h1>
            <p className="text-sm text-gray-500 mt-1">Online mağaza yönetimi ve sipariş takibi</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Dışa Aktar
            </button>
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Senkronize Et
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { id: 'products', label: 'Ürünler', icon: Package },
            { id: 'orders', label: 'Siparişler', icon: ShoppingCart, badge: stats.pendingOrders },
            { id: 'reviews', label: 'Yorumlar', icon: MessageSquare, badge: stats.pendingReviews },
            { id: 'analytics', label: 'Analitik', icon: TrendingUp },
            { id: 'settings', label: 'Ayarlar', icon: Settings }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as ViewMode)}
                className={`px-4 py-3 text-sm flex items-center gap-2 border-b-2 transition-colors relative ${
                  viewMode === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-red-500 text-white rounded-full text-xs">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {renderContent()}
      </div>

      {/* Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg">
                {selectedProduct ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}
              </h2>
              <button
                onClick={() => setShowProductModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 px-6">
              <div className="flex gap-1">
                {[
                  { id: 'general', label: 'Genel Bilgiler', icon: FileText },
                  { id: 'variants', label: 'Varyantlar', icon: Layers },
                  { id: 'seo', label: 'SEO & Meta', icon: Globe },
                  { id: 'images', label: 'Görseller', icon: Image }
                ].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`px-4 py-3 text-sm flex items-center gap-2 border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-6">
              {activeTab === 'general' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Ürün Adı *</label>
                      <input
                        type="text"
                        value={productFormData.name}
                        onChange={(e) => setProductFormData({ ...productFormData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ürün adını girin"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">SKU *</label>
                      <input
                        type="text"
                        value={productFormData.sku}
                        onChange={(e) => setProductFormData({ ...productFormData, sku: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Stok kodu"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Kategori</label>
                      <select
                        value={productFormData.category}
                        onChange={(e) => setProductFormData({ ...productFormData, category: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="Bilgisayar">Bilgisayar</option>
                        <option value="Aksesuar">Aksesuar</option>
                        <option value="Elektronik">Elektronik</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Stok Miktarı</label>
                      <input
                        type="number"
                        value={productFormData.stock}
                        onChange={(e) => setProductFormData({ ...productFormData, stock: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Durum</label>
                      <select
                        value={productFormData.status}
                        onChange={(e) => setProductFormData({ ...productFormData, status: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="active">Aktif</option>
                        <option value="draft">Taslak</option>
                        <option value="archived">Arşiv</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Satış Fiyatı *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={productFormData.price}
                        onChange={(e) => setProductFormData({ ...productFormData, price: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Karşılaştırma Fiyatı</label>
                      <input
                        type="number"
                        step="0.01"
                        value={productFormData.comparePrice}
                        onChange={(e) => setProductFormData({ ...productFormData, comparePrice: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="İndirim öncesi fiyat"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Maliyet</label>
                      <input
                        type="number"
                        step="0.01"
                        value={productFormData.cost}
                        onChange={(e) => setProductFormData({ ...productFormData, cost: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Kısa Açıklama</label>
                    <input
                      type="text"
                      value={productFormData.shortDescription}
                      onChange={(e) => setProductFormData({ ...productFormData, shortDescription: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ürün için kısa bir açıklama"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Detaylı Açıklama</label>
                    <textarea
                      value={productFormData.description}
                      onChange={(e) => setProductFormData({ ...productFormData, description: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ürün açıklaması, özellikler, kullanım talimatları..."
                    />
                  </div>
                </div>
              )}

              {activeTab === 'variants' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      Farklı renk, beden veya özelliklerde ürün varyantları tanımlayın.
                    </p>
                    <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm hover:from-blue-700 hover:to-blue-800 flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Varyant Ekle
                    </button>
                  </div>

                  {variants.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                      <Box className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Henüz varyant eklenmemiş</p>
                      <p className="text-xs text-gray-400 mt-1">Farklı özellikler için varyant ekleyebilirsiniz</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {variants.map((variant, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm">{variant.name}</p>
                            <p className="text-xs text-gray-500">SKU: {variant.sku}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm">{variant.price.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">Stok: {variant.stock}</p>
                          </div>
                          <button className="p-2 text-red-600 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'seo' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">SEO Başlık</label>
                    <input
                      type="text"
                      value={productFormData.seoTitle}
                      onChange={(e) => setProductFormData({ ...productFormData, seoTitle: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Arama motoru için başlık (max 60 karakter)"
                    />
                    <p className="text-xs text-gray-500 mt-1">{productFormData.seoTitle.length}/60 karakter</p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">SEO Açıklama</label>
                    <textarea
                      value={productFormData.seoDescription}
                      onChange={(e) => setProductFormData({ ...productFormData, seoDescription: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Arama motoru için açıklama (max 160 karakter)"
                    />
                    <p className="text-xs text-gray-500 mt-1">{productFormData.seoDescription.length}/160 karakter</p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Anahtar Kelimeler</label>
                    <input
                      type="text"
                      value={productFormData.seoKeywords}
                      onChange={(e) => setProductFormData({ ...productFormData, seoKeywords: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="laptop çantası, su geçirmez, premium (virgülle ayırın)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">URL Slug</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">yoursite.com/urun/</span>
                      <input
                        type="text"
                        value={productFormData.seoSlug}
                        onChange={(e) => setProductFormData({ ...productFormData, seoSlug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="premium-laptop-cantasi"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-sm mb-2 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-blue-600" />
                      Önizleme
                    </h4>
                    <div className="text-xs space-y-1">
                      <p className="text-blue-600 font-medium">
                        {productFormData.seoTitle || 'SEO Başlığı'}
                      </p>
                      <p className="text-green-700">
                        yoursite.com/urun/{productFormData.seoSlug || 'url-slug'}
                      </p>
                      <p className="text-gray-600">
                        {productFormData.seoDescription || 'SEO Açıklaması buraya gelecek...'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'images' && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600">Görselleri sürükleyin veya tıklayın</p>
                    <p className="text-xs text-gray-400 mt-1">PNG, JPG veya WEBP (max 5MB)</p>
                    <button className="mt-4 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm hover:from-blue-700 hover:to-blue-800">
                      Dosya Seç
                    </button>
                  </div>

                  {productFormData.images.length > 0 && (
                    <div className="grid grid-cols-4 gap-4">
                      {productFormData.images.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img src={img} alt="" className="w-full h-32 object-cover rounded-lg" />
                          <button className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowProductModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                İptal
              </button>
              <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm hover:from-blue-700 hover:to-blue-800">
                {selectedProduct ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
