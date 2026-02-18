import React, { useState, useRef, useEffect } from 'react';
import {
  Search, User, Grid3x3, ArrowLeft, Camera, ShoppingBag, Plus, Minus, 
  X, CreditCard, Banknote, Tag, Trash2, Package, Check
} from 'lucide-react';
import type { Product, Customer, Sale, SaleItem, Campaign } from '../core/types';

interface MobileSalesScreenProps {
  products: Product[];
  customers: Customer[];
  campaigns: Campaign[];
  onSaleComplete: (sale: Sale) => void;
  onBack?: () => void;
}

export function MobileSalesScreen({ 
  products, 
  customers, 
  campaigns, 
  onSaleComplete,
  onBack 
}: MobileSalesScreenProps) {
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [showProductGrid, setShowProductGrid] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Generate invoice number
  const invoiceNo = `FIS${String(Date.now()).slice(-6)}`;

  // Get unique categories
  const categories = ['Tümü', ...Array.from(new Set(products.map(p => p.category)))];

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'Tümü' || product.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.barcode.includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  // Calculate totals
  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateVAT = () => {
    return calculateSubtotal() * 0.00; // Iraq'ta TAX yok, 0% olarak ayarlandı
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const discount = (subtotal * generalDiscount) / 100;
    return subtotal + calculateVAT() - discount;
  };

  // Add product to cart
  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.productId === product.id);
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        price: product.price,
        discount: 0,
        total: product.price
      }]);
    }
    setShowProductGrid(false);
  };

  // Update quantity
  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(cart.map(item =>
        item.productId === productId
          ? { ...item, quantity: newQuantity, total: newQuantity * item.price }
          : item
      ));
    }
  };

  // Remove from cart
  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  // Handle barcode scan
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) {
      const product = products.find(p => 
        p.barcode === barcodeInput.trim() || 
        p.name.toLowerCase().includes(barcodeInput.trim().toLowerCase())
      );
      
      if (product) {
        addToCart(product);
        setBarcodeInput('');
      }
    }
  };

  // Complete sale
  const completeSale = (paymentMethod: 'cash' | 'card') => {
    const sale: Sale = {
      id: String(Date.now()),
      receiptNumber: invoiceNo,
      date: new Date().toISOString(),
      items: cart,
      subtotal: calculateSubtotal(),
      discount: (calculateSubtotal() * generalDiscount) / 100,
      total: calculateTotal(),
      paymentMethod,
      paymentStatus: 'paid',
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      cashier: 'Mobile POS'
    };

    onSaleComplete(sale);
    
    // Reset cart
    setCart([]);
    setGeneralDiscount(0);
    setSelectedCustomer(null);
    setShowPayment(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors">
              <span className="font-bold text-lg">R</span>
            </button>
            <button 
              onClick={() => setShowCustomerModal(true)}
              className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <User className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowProductGrid(true)}
              className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <Grid3x3 className="w-5 h-5" />
            </button>
          </div>
          {onBack && (
            <button 
              onClick={onBack}
              className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Search Bar */}
        <form onSubmit={handleBarcodeSubmit} className="relative">
          <div className="bg-white rounded-lg p-3 flex items-center gap-2">
            <Search className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <div className="text-xs text-gray-500">Fiş No: {invoiceNo}</div>
              <input
                ref={searchRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Ara"
                className="w-full bg-transparent text-gray-900 outline-none text-sm"
              />
            </div>
            <button 
              type="submit"
              className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center hover:bg-blue-200 transition-colors"
            >
              <Camera className="w-5 h-5 text-blue-600" />
            </button>
          </div>
        </form>

        {/* Selected Customer */}
        {selectedCustomer && (
          <div className="mt-2 bg-white/10 backdrop-blur-sm rounded-lg p-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span className="text-sm">{selectedCustomer.name}</span>
            </div>
            <button 
              onClick={() => setSelectedCustomer(null)}
              className="p-1 hover:bg-white/10 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {cart.length === 0 ? (
          // Empty State
          <div className="flex flex-col items-center justify-center h-full py-20">
            <div className="w-32 h-32 bg-gray-200 rounded-3xl flex items-center justify-center mb-4">
              <ShoppingBag className="w-16 h-16 text-gray-400" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl text-gray-800 mb-2">Sepet boş</h3>
            <p className="text-sm text-gray-500 text-center px-8">
              Barkod okutun veya kategori butonuna tıklayın
            </p>
          </div>
        ) : (
          // Cart Items
          <div className="p-4 space-y-3">
            {cart.map((item) => (
              <div key={item.productId} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 mb-1">{item.productName}</h4>
                    <p className="text-sm text-blue-600 font-medium">
                      {item.price.toLocaleString('tr-TR')} IQD
                    </p>
                  </div>
                  <button 
                    onClick={() => removeFromCart(item.productId)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      className="w-8 h-8 bg-white rounded-md flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                      <Minus className="w-4 h-4 text-gray-600" />
                    </button>
                    <span className="w-12 text-center font-bold text-gray-900">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      className="w-8 h-8 bg-white rounded-md flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                      <Plus className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-xs text-gray-500 mb-1">Toplam</div>
                    <div className="font-bold text-lg text-gray-900">
                      {item.total.toLocaleString('tr-TR')} IQD
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary Section */}
      <div className="bg-white border-t-2 border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Ara Toplam:</span>
          <span className="font-bold text-gray-900">
            {calculateSubtotal().toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">TAX:</span>
          <span className="font-bold text-gray-900">
            {calculateVAT().toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Genel İndirim %:</span>
          <input
            type="number"
            min="0"
            max="100"
            value={generalDiscount}
            onChange={(e) => setGeneralDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
            className="w-20 text-center border border-gray-300 rounded-lg px-3 py-2 font-medium text-gray-900 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Footer - Total and Payment */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm text-gray-400 mb-1">Toplam:</div>
            <div className="text-3xl font-bold">
              {calculateTotal().toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          
          {cart.length > 0 && (
            <button
              onClick={() => setShowPayment(true)}
              className="px-8 py-3 bg-green-500 hover:bg-green-600 rounded-xl font-bold text-lg transition-colors shadow-lg"
            >
              Tahsil Et
            </button>
          )}
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span>Çevrimiçi</span>
            <span>KASA-01</span>
          </div>
          <span>ExRetailOS Version 1.3.17</span>
        </div>
      </div>

      {/* Product Grid Modal */}
      {showProductGrid && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Ürünler</h3>
              <button 
                onClick={() => setShowProductGrid(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* Categories */}
            <div className="p-4 border-b border-gray-200 overflow-x-auto">
              <div className="flex gap-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Products */}
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="bg-gray-50 rounded-xl p-4 text-left hover:bg-blue-50 transition-colors border-2 border-transparent hover:border-blue-200"
                  >
                    <div className="aspect-square bg-white rounded-lg mb-3 flex items-center justify-center">
                      <Package className="w-12 h-12 text-gray-300" />
                    </div>
                    <h4 className="font-bold text-sm text-gray-900 mb-1 line-clamp-2">
                      {product.name}
                    </h4>
                    <p className="text-blue-600 font-bold text-sm">
                      {product.price.toLocaleString('tr-TR')} IQD
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Stok: {product.stock}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Selection Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[70vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Müşteri Seç</h3>
              <button 
                onClick={() => setShowCustomerModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              <div className="space-y-2">
                {customers.map(customer => (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setShowCustomerModal(false);
                    }}
                    className="w-full bg-gray-50 rounded-xl p-4 text-left hover:bg-blue-50 transition-colors border-2 border-transparent hover:border-blue-200"
                  >
                    <div className="font-bold text-gray-900 mb-1">{customer.name}</div>
                    <div className="text-sm text-gray-600">{customer.phone}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6">
            <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">Ödeme Yöntemi</h3>
            
            <div className="space-y-3 mb-6">
              <button
                onClick={() => completeSale('cash')}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl p-6 flex items-center justify-between hover:from-green-600 hover:to-green-700 transition-all shadow-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                    <Banknote className="w-8 h-8" />
                  </div>
                  <div className="text-left">
                    <div className="text-lg font-bold">Nakit</div>
                    <div className="text-sm text-green-100">Cash Payment</div>
                  </div>
                </div>
                <Check className="w-6 h-6" />
              </button>
              
              <button
                onClick={() => completeSale('card')}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl p-6 flex items-center justify-between hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                    <CreditCard className="w-8 h-8" />
                  </div>
                  <div className="text-left">
                    <div className="text-lg font-bold">Kredi/Banka Kartı</div>
                    <div className="text-sm text-blue-100">Card Payment</div>
                  </div>
                </div>
                <Check className="w-6 h-6" />
              </button>
            </div>
            
            <button
              onClick={() => setShowPayment(false)}
              className="w-full py-3 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              İptal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
