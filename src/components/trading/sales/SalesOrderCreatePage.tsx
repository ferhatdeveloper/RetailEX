import { useState } from 'react';
import { ArrowLeft, Plus, Minus, Trash2, Save, Search } from 'lucide-react';
import { APP_VERSION } from '../../../core/version';
import type { Customer, Product } from '../../../App';

interface SalesOrderCreatePageProps {
  customers: Customer[];
  products: Product[];
  onBack: () => void;
  onSuccess: () => void;
}

export function SalesOrderCreatePage({ customers, products, onBack, onSuccess }: SalesOrderCreatePageProps) {
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.barcode.includes(productSearch)
  );

  const addOrderItem = (product: Product) => {
    const existing = orderItems.find(item => item.productId === product.id);

    if (existing) {
      setOrderItems(orderItems.map(item =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setOrderItems([...orderItems, {
        productId: product.id,
        name: product.name,
        quantity: 1,
        price: product.price,
      }]);
    }
    setProductSearch('');
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) {
      removeOrderItem(index);
      return;
    }
    const newItems = [...orderItems];
    newItems[index].quantity = quantity;
    setOrderItems(newItems);
  };

  const removeOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  };

  const handleCreateOrder = async () => {
    if (!selectedCustomer) {
      alert('Lütfen müşteri seçin!');
      return;
    }

    if (orderItems.length === 0) {
      alert('Lütfen en az bir ürün ekleyin!');
      return;
    }

    setLoading(true);

    try {
      // Mock Mode - Store data locally
      console.log('ğŸ“¦ Sipariş oluşturuldu:', {
        customer: customers.find(c => c.id === selectedCustomer)?.name,
        items: orderItems,
        total: calculateTotal(),
        deliveryDate,
        notes,
        date: new Date().toISOString(),
      });
      alert('✅ Sipariş başarıyla oluşturuldu!');

      // Auto-increment version after successful operation
      APP_VERSION.increment();

      onSuccess();
    } catch (error) {
      console.error('❌ Sipariş oluşturma hatası:', error);
      alert('❌ Sipariş oluşturulurken hata oluştu!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg">Yeni Satış Siparişi</h2>
            <p className="text-xs text-blue-100">Sipariş Formu</p>
          </div>
        </div>
        <button
          onClick={handleCreateOrder}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          <span>{loading ? 'Kaydediliyor...' : 'Kaydet'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column - Order Details */}
          <div className="lg:col-span-2 space-y-4">
            {/* Customer Selection */}
            <div className="bg-white border border-gray-200 rounded">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
                <h3 className="text-sm text-gray-700">Müşteri Bilgileri</h3>
              </div>
              <div className="p-4">
                <label className="block text-xs text-gray-600 mb-2">Müşteri *</label>
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  required
                >
                  <option value="">Müşteri Seçin</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} - {customer.phone}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Order Items */}
            <div className="bg-white border border-gray-200 rounded">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center justify-between">
                <h3 className="text-sm text-gray-700">Sipariş Kalemleri</h3>
                <span className="text-xs text-gray-500">{orderItems.length} kalem</span>
              </div>
              <div className="p-4">
                {orderItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">Henüz ürün eklenmedi</p>
                    <p className="text-xs mt-1">Sağdaki listeden ürün ekleyin</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orderItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded">
                        <div className="flex-1">
                          <p className="text-sm text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500">Birim Fiyat: {item.price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateItemQuantity(index, item.quantity - 1)}
                            className="p-1 hover:bg-gray-200 rounded"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 1)}
                            className="w-16 px-2 py-1 text-center border border-gray-300 rounded text-sm"
                            min="1"
                          />
                          <button
                            onClick={() => updateItemQuantity(index, item.quantity + 1)}
                            className="p-1 hover:bg-gray-200 rounded"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="w-24 text-right">
                          <p className="text-sm text-gray-900">{(item.quantity * item.price).toFixed(2)}</p>
                        </div>
                        <button
                          onClick={() => removeOrderItem(index)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Additional Info */}
            <div className="bg-white border border-gray-200 rounded">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
                <h3 className="text-sm text-gray-700">Ek Bilgiler</h3>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-2">Teslimat Tarihi</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-600 mb-2">Notlar</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    rows={3}
                    placeholder="Sipariş notları..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Product Selection & Summary */}
          <div className="space-y-4">
            {/* Product Search */}
            <div className="bg-white border border-gray-200 rounded">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
                <h3 className="text-sm text-gray-700">Ürün Ekle</h3>
              </div>
              <div className="p-4">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Ürün ara..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div className="max-h-96 overflow-y-auto space-y-1">
                  {filteredProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addOrderItem(product)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded transition-colors"
                    >
                      <p className="text-sm text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-500">
                        {product.barcode} • {product.price.toFixed(2)} • Stok: {product.stock}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-white border border-gray-200 rounded">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
                <h3 className="text-sm text-gray-700">Sipariş Özeti</h3>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Kalem Sayısı:</span>
                  <span className="text-gray-900">{orderItems.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Toplam Adet:</span>
                  <span className="text-gray-900">{orderItems.reduce((sum, item) => sum + item.quantity, 0)}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-gray-900">Toplam Tutar:</span>
                    <span className="text-blue-600 text-lg">{calculateTotal().toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
