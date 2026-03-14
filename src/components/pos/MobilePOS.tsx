import { useState, useRef, useEffect } from 'react';
import { Search, Plus, Minus, X, Trash2, User, CreditCard, Banknote, Smartphone, ShoppingBag, Grid3x3, ArrowLeft, Tag, RefreshCw, FileText, Truck, Send, FileCheck, Menu, Camera, Database, Globe } from 'lucide-react';
import type { Product, Customer, Sale, SaleItem, Campaign } from '../../App';
import { BarcodeScanner, type BarcodeScanResult } from '../inventory/stock/BarcodeScanner';
import { formatNumber } from '../../utils/formatNumber';
import { useTheme } from '../../contexts/ThemeContext';
import { APP_VERSION } from '../../core/version';
import { productAPI } from '../../services/api/products';
import { printThermalReceipt } from '../../utils/thermalPrinter';
import { postgres } from '../../services/postgres';

interface MobilePOSProps {
  products: Product[];
  customers: Customer[];
  campaigns: Campaign[];
  onSaleComplete: (sale: Sale) => void;
  onBack?: () => void;
}

export function MobilePOS({ products, customers, campaigns, onSaleComplete, onBack }: MobilePOSProps) {
  const { darkMode } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [discount, setDiscount] = useState(0);
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [appliedCampaign, setAppliedCampaign] = useState<Campaign | null>(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Printing options
  const [autoPrint, setAutoPrint] = useState(false);
  const [receiptLanguage, setReceiptLanguage] = useState<'tr' | 'en' | 'ar' | 'ku'>('tr');

  useEffect(() => {
    const savedPrinter = localStorage.getItem('retailos-printer-settings');
    if (savedPrinter) {
      try {
        const config = JSON.parse(savedPrinter);
        if (config.autoPrint !== undefined) setAutoPrint(config.autoPrint);
        if (config.defaultLanguage) setReceiptLanguage(config.defaultLanguage);
      } catch (err) {
        console.error('Failed to parse printer settings:', err);
      }
    }
  }, []);

  // Exchange rate state
  const [exchangeRate, setExchangeRate] = useState<number>(1310);
  const [unitSets, setUnitSets] = useState<any[]>([]);

  useEffect(() => {
    const fetchRate = async () => {
      try {
        const { exchangeRateAPI } = await import('../../services/api/masterData');
        const rates = await exchangeRateAPI.getLatestRates();
        const usdRate = rates.find(r => r.currency_code === 'USD');
        if (usdRate) {
          setExchangeRate(usdRate.sell_rate);
        }
      } catch (error) {
        console.error('Failed to fetch exchange rate:', error);
      }
    };
    fetchRate();
  }, []);

  // Load Unit Sets for multiplier support
  useEffect(() => {
    const loadUnitSets = async () => {
      try {
        const { rows: sets } = await postgres.query('SELECT * FROM unitsets ORDER BY name ASC');
        const setsWithLines = await Promise.all(sets.map(async (set: any) => {
          const { rows: lines } = await postgres.query(
            'SELECT * FROM unitsetl WHERE unitset_id = $1 ORDER BY conv_fact1 ASC',
            [set.id]
          );
          return {
            ...set,
            lines: lines.map((l: any) => ({
              id: l.id,
              code: l.code || l.item_code,
              name: l.name || l.item_code,
              conv_fact1: parseFloat(l.conv_fact1) || 1,
              main_unit: l.main_unit || false
            }))
          };
        }));
        setUnitSets(setsWithLines);
      } catch (err) {
        console.error('[MobilePOS] Unit sets load failed:', err);
      }
    };
    loadUnitSets();
  }, []);

  // Notification system
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState<'success' | 'error' | 'warning' | 'info'>('info');

  // Show notification helper
  const showNotif = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  // Invoice number
  const invoiceNo = `FIS${String(Date.now()).slice(-6)}`;

  // Get unique categories
  const categories = ['Tümü', ...Array.from(new Set(products.map(p => p.category)))];

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'Tümü' || product.category === selectedCategory;
    const matchesSearch = searchQuery === '' ||
      (product.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.barcode || '').includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) {
      const searchTerm = barcodeInput.trim();

      try {
        const result = await productAPI.lookupByBarcode(searchTerm);

        if (result && result.product) {
          const product = result.product;
          const unitInfo = result.unitInfo;

          // Varyant kontrolü (Basit mobil versiyon için varyant desteği ekleyebiliriz veya direkt ekleriz)
          if (product.hasVariants || (product.variants && product.variants.length > 0)) {
            // Mobil için varyant seçim modalı gerekebilir. Şimdilik MarketPOS'taki gibi basit geçiyoruz
            showNotif('Lütfen varyant seçimi için market ekranını kullanın veya ürünü listeden seçin.', 'info');
            return;
          }

          // Pricing logic: First check unit multiplier, then USD calculation
          let price = product.price;
          let unitMultiplier = unitInfo?.multiplier || 1;

          // If unitMultiplier is 1 or missing, try to find in unitSets
          if (unitInfo && unitMultiplier === 1 && unitInfo.unit) {
            const pUnitsetId = (product as any).unitset_id || (product as any).unitsetId;
            if (pUnitsetId) {
              const unitSet = unitSets.find(us => us.id === pUnitsetId);
              const line = unitSet?.lines?.find((l: any) => l.name === unitInfo.unit || l.code === unitInfo.unit);
              if (line) {
                unitMultiplier = line.conv_fact1 || 1;
              }
            }
          }

          if (unitInfo) {
            if (unitInfo.sale_price && unitInfo.sale_price > 0) {
              price = unitInfo.sale_price;
            } else if (unitMultiplier > 1) {
              price = product.price * unitMultiplier;
            }
          }

          // USD Auto-calculation
          const isAutoCalc = (product as any).autoCalculateUSD || (product as any).auto_calculate_usd;
          if (isAutoCalc && (product as any).salePriceUSD > 0 && (!unitInfo || !unitInfo.sale_price)) {
            let effectiveRate = (product as any).customExchangeRate || (product as any).custom_exchange_rate || exchangeRate;
            if (effectiveRate > 0 && effectiveRate < 10) effectiveRate *= 1000;
            price = (product as any).salePriceUSD * effectiveRate * unitMultiplier;
          }

          addToCart(product, undefined, unitInfo?.unit, unitMultiplier, price);
          setBarcodeInput('');
        } else {
          showNotif('Ürün bulunamadı!', 'error');
        }
      } catch (error) {
        console.error('[MobilePOS] Barcode lookup error:', error);
        showNotif('Barkod sorgulama hatası!', 'error');
      }
    }
  };

  const addToCart = (product: Product, variant?: any, unit?: string, multiplier?: number, customPrice?: number) => {
    // Unique ID for cart matching
    const itemMatch = (item: SaleItem) => {
      if (variant) {
        return item.productId === product.id && item.variant?.id === variant.id;
      }
      return item.productId === product.id && !item.variant && item.unit === unit;
    };

    const existingItem = cart.find(itemMatch);
    const price = customPrice !== undefined ? customPrice : (variant?.price || product.price);

    if (existingItem) {
      setCart(cart.map(item =>
        itemMatch(item)
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * price * (1 - item.discount / 100) }
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        price: price,
        discount: 0,
        total: price,
        variant,
        unit,
        multiplier
      }]);
    }
  };

  const updateQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(index);
      return;
    }
    setCart(cart.map((item, idx) => {
      if (idx === index) {
        const newTotal = quantity * item.price * (1 - item.discount / 100);
        return { ...item, quantity, total: newTotal };
      }
      return item;
    }));
  };

  const updateItemDiscount = (index: number, discount: number) => {
    setCart(cart.map((item, idx) => {
      if (idx === index) {
        const newTotal = item.quantity * item.price * (1 - discount / 100);
        return { ...item, discount, total: newTotal };
      }
      return item;
    }));
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, idx) => idx !== index));
  };

  // Check and apply campaigns automatically
  const checkCampaigns = () => {
    if (cart.length === 0) {
      setAppliedCampaign(null);
      setDiscount(0);
      return;
    }

    const now = new Date();
    const activeCampaigns = campaigns.filter(c => {
      if (!c.active) return false;
      const start = new Date(c.startDate);
      const end = new Date(c.endDate);
      return now >= start && now <= end;
    });

    // Calculate subtotal for campaign check
    const subtotal = cart.reduce((sum, item) => sum + (item.quantity * item.price), 0);

    for (const campaign of activeCampaigns) {
      let isEligible = false;

      switch (campaign.type) {
        case 'percentage':
          // General percentage discount if minPurchase met
          if (campaign.minPurchase && subtotal >= campaign.minPurchase) {
            isEligible = true;
          } else if (!campaign.minPurchase) {
            isEligible = true;
          }
          break;

        case 'fixed':
          // Fixed amount discount if minPurchase met
          if (campaign.minPurchase && subtotal >= campaign.minPurchase) {
            isEligible = true;
          }
          break;

        case 'category':
          // Category-based discount
          if (campaign.categoryId) {
            const hasCategory = cart.some(item => {
              const product = products.find(p => p.id === item.productId);
              if (!product || !product.category) return false;
              const productCategories = Array.isArray(product.category) ? product.category : [product.category];
              return productCategories.includes(campaign.categoryId!);
            });
            if (hasCategory) {
              isEligible = true;
            }
          }
          break;
      }

      if (isEligible) {
        setAppliedCampaign(campaign);
        if (campaign.type === 'percentage') {
          setDiscount(campaign.discountValue);
        }
        return; // Apply first matching campaign
      }
    }

    // No campaign matches
    setAppliedCampaign(null);
    setDiscount(0);
  };

  // Auto-check campaigns when cart changes
  useEffect(() => {
    checkCampaigns();
  }, [cart, campaigns]);

  // F7 and F8 Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F7') {
        e.preventDefault();
        if (cart.length > 0) {
          setShowPayment(true);
        }
      }
      if (e.key === 'F8') {
        e.preventDefault();
        if (showPayment && cart.length > 0) {
          // Complete sale with cash
          const { subtotal, totalDiscount, tax, total } = calculateTotals();

          const sale: Sale = {
            id: invoiceNo,
            receiptNumber: invoiceNo,
            date: new Date().toISOString(),
            customerId: selectedCustomer?.id,
            customerName: selectedCustomer?.name,
            items: cart,
            subtotal,
            tax,
            discount: totalDiscount,
            total,
            paymentMethod: 'Nakit',
            cashier: 'Admin'
          };

          onSaleComplete(sale);
          setCart([]);
          setSelectedCustomer(null);
          setDiscount(0);
          setShowPayment(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, showPayment, discount, selectedCustomer, products]);

  const calculateTotals = () => {
    const subtotal = cart.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const itemDiscounts = cart.reduce((sum, item) => sum + (item.quantity * item.price * item.discount / 100), 0);
    const discountedSubtotal = subtotal - itemDiscounts;
    const generalDiscount = discountedSubtotal * (discount / 100);
    const afterDiscount = discountedSubtotal - generalDiscount;
    const tax = cart.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      const taxRate = product ? product.taxRate : 8;
      const itemTotal = item.quantity * item.price * (1 - item.discount / 100);
      return sum + (itemTotal * taxRate / 100);
    }, 0);
    const total = afterDiscount + tax;

    return {
      subtotal,
      itemDiscounts,
      generalDiscount,
      totalDiscount: itemDiscounts + generalDiscount,
      tax,
      total
    };
  };

  const completeSale = (paymentMethod: string) => {
    const { subtotal, totalDiscount, tax, total } = calculateTotals();

    const sale: Sale = {
      id: invoiceNo,
      receiptNumber: invoiceNo,
      date: new Date().toISOString(),
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      items: cart,
      subtotal,
      tax,
      discount: totalDiscount,
      total,
      paymentMethod,
      cashier: 'Admin',
      autoPrint: autoPrint,
      language: receiptLanguage
    };

    onSaleComplete(sale);

    // Automatic Printing Logic
    if (autoPrint) {
      const companyName = 'RetailEX Mobile'; // Dynamic value could be added if needed
      printThermalReceipt(sale, companyName, { 
        autoPrint: true, 
        language: receiptLanguage 
      });
    }

    setCart([]);
    setSelectedCustomer(null);
    setDiscount(0);
    setShowPayment(false);
  };

  const { subtotal, totalDiscount, tax, total } = calculateTotals();

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Top Bar */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg">
        <div className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center border border-white/30">
              <span className="text-lg font-bold text-white">R</span>
            </div>
            <button
              onClick={() => setShowCustomerModal(true)}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
            >
              <User className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowQuickActions(!showQuickActions)}
              className={`p-2 rounded-lg hover:bg-white/30 transition-all ${showQuickActions ? 'bg-white/30' : 'bg-white/20'}`}
              title={showQuickActions ? 'Hızlı Aksiyonları Gizle' : 'Hızlı Aksiyonları Göster'}
            >
              <Grid3x3 className="w-5 h-5" />
            </button>
            <button className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
              <Grid3x3 className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBarcodeScanner(true)}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              title="Barkod Tara"
            >
              <Camera className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                if (onBack) {
                  onBack();
                } else {
                  // Fallback: dispatch event to navigate back
                  window.dispatchEvent(new CustomEvent('navigateBackFromMobilePOS'));
                }
              }}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              title="Geri"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Actions Grid - Conditional */}
        {showQuickActions && (
          <div className="bg-white p-3 border-b">
            <div className="grid grid-cols-4 gap-2">
              <button className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-gray-200 rounded hover:border-blue-500 transition-all active:bg-blue-50">
                <Tag className="w-6 h-6 text-orange-600" />
                <span className="text-xs text-center leading-tight">Kampanya</span>
              </button>
              <button
                onClick={() => setShowProductsModal(true)}
                className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-gray-200 rounded hover:border-blue-500 transition-all active:bg-blue-50"
              >
                <Grid3x3 className="w-6 h-6 text-blue-600" />
                <span className="text-xs text-center leading-tight">Kategori</span>
              </button>
              <button className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-gray-200 rounded hover:border-blue-500 transition-all active:bg-blue-50">
                <RefreshCw className="w-6 h-6 text-purple-600" />
                <span className="text-xs text-center leading-tight">İade</span>
              </button>
              <button className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-gray-200 rounded hover:border-blue-500 transition-all active:bg-blue-50">
                <FileText className="w-6 h-6 text-red-600" />
                <span className="text-xs text-center leading-tight">Fiş İptal</span>
              </button>
              <button className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-gray-200 rounded hover:border-blue-500 transition-all active:bg-blue-50">
                <FileCheck className="w-6 h-6 text-green-600" />
                <span className="text-xs text-center leading-tight">Son Fiş</span>
              </button>
              <button className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-gray-200 rounded hover:border-blue-500 transition-all active:bg-blue-50">
                <Truck className="w-6 h-6 text-cyan-600" />
                <span className="text-xs text-center leading-tight">Park Et</span>
              </button>
              <button className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-gray-200 rounded hover:border-blue-500 transition-all active:bg-blue-50">
                <Send className="w-6 h-6 text-pink-600" />
                <span className="text-xs text-center leading-tight">Et</span>
              </button>
              <button className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-gray-200 rounded hover:border-blue-500 transition-all active:bg-blue-50">
                <Menu className="w-6 h-6 text-indigo-600" />
                <span className="text-xs text-center leading-tight">Bekleyen</span>
              </button>
            </div>
          </div>
        )}

        {/* Search Bar with Invoice Number */}
        <div className="px-3 pb-3">
          <form onSubmit={handleBarcodeSubmit} className="flex-1">
            <div className="bg-white rounded-lg flex items-center px-4 py-3 shadow-sm">
              <Search className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-1 font-medium">Fiş No: {invoiceNo}</div>
                <input
                  ref={barcodeRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Ara"
                  className="w-full border-0 outline-none text-base p-0 bg-transparent placeholder-gray-400"
                  autoFocus
                />
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Customer Info */}
      {selectedCustomer && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            <div>
              <div className="text-sm font-medium">{selectedCustomer.name}</div>
              <div className="text-xs text-gray-600">{selectedCustomer.phone}</div>
            </div>
          </div>
          <button
            onClick={() => setSelectedCustomer(null)}
            className="text-red-500 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Campaign Info Banner */}
      {appliedCampaign && (
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-2.5 border-b flex items-center gap-2">
          <Tag className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{appliedCampaign.name}</div>
            <div className="text-xs text-orange-100 truncate">{appliedCampaign.description}</div>
          </div>
        </div>
      )}

      {/* Cart Area */}
      <div className="flex-1 overflow-auto bg-white" style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#cbd5e1 #ffffff',
      }}>
        <style>{`
          div::-webkit-scrollbar {
            width: 8px;
          }
          div::-webkit-scrollbar-track {
            background: #ffffff;
          }
          div::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
        `}</style>
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 px-4">
            <ShoppingBag className="w-32 h-32 mb-6 opacity-20" />
            <p className="text-xl font-medium text-gray-500 mb-2">Sepet boş</p>
            <p className="text-sm text-gray-400 text-center max-w-xs">
              Barkod okutun veya kategori butonuna tıklayın
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {cart.map((item, idx) => (
              <div key={idx} className="bg-gray-50 p-3 border border-gray-200 rounded-lg">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="font-medium text-sm mb-1">{item.productName}</div>
                    <div className="text-xs text-gray-500">
                      {(() => {
                        const mult = (item as any).multiplier && (item as any).multiplier > 1 ? (item as any).multiplier : 1;
                        const unit = (item as any).unit || 'Adet';
                        const basePrice = mult > 1 ? item.price / mult : item.price;
                        return mult > 1
                          ? <><span>{basePrice.toLocaleString('tr-TR')} / Adet × {mult}</span><span className="text-orange-500 ml-1">(={item.quantity * mult} Adet)</span></>
                          : <span>{item.price.toLocaleString('tr-TR')} / {unit}</span>;
                      })()}
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromCart(idx)}
                    className="text-red-500 hover:bg-red-50 p-1.5 rounded -mt-1 -mr-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(idx, item.quantity - 1)}
                      className="w-9 h-9 border-2 border-gray-300 hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center rounded"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 1)}
                      className="w-16 h-9 text-center border-2 border-gray-300 rounded font-medium"
                    />
                    <button
                      onClick={() => updateQuantity(idx, item.quantity + 1)}
                      className="w-9 h-9 border-2 border-gray-300 hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center rounded"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-blue-600 font-medium text-lg">
                    {item.total.toFixed(2)}
                  </div>
                </div>

                {/* Discount */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600">İndirim %:</label>
                  <input
                    type="number"
                    value={item.discount}
                    onChange={(e) => updateItemDiscount(idx, parseFloat(e.target.value) || 0)}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                    placeholder="0"
                    min="0"
                    max="100"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Summary Bar */}
      <div className="bg-white border-t border-gray-200">
        <div className="px-4 py-3 space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Ara Toplam:</span>
            <span className="font-medium text-gray-900">{formatNumber(subtotal, 2, false)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">TAX:</span>
            <span className="font-medium text-gray-900">{formatNumber(tax, 2, false)}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <span className="text-gray-600 text-sm">Genel İndirim %:</span>
            <input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
              className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              min="0"
              max="100"
            />
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between items-center text-red-600">
              <span>İndirim:</span>
              <span className="font-medium">-{formatNumber(totalDiscount, 2, false)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Total & System Info Bar */}
      <div className="bg-gray-900 text-white">
        <div className="px-4 py-4 flex justify-between items-center border-b border-gray-700">
          <span className="text-xl font-bold">TOPLAM:</span>
          <span className="text-2xl font-bold">{formatNumber(total, 2, false)}</span>
        </div>
        <div className="px-4 py-2.5 flex items-center justify-between text-xs border-t border-gray-700">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-gray-300">Çevrimiçi</span>
            </span>
            <span className="text-gray-400">KASA-01</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400">ExRetailOS {APP_VERSION.display}</span>
            <button className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors">
              <Database className="w-4 h-4 text-blue-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Floating Payment Button */}
      {cart.length > 0 && (
        <button
          onClick={() => setShowPayment(true)}
          className="fixed bottom-20 right-4 w-16 h-16 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:from-green-600 hover:to-green-700 transition-all z-30 active:scale-95"
        >
          <CreditCard className="w-7 h-7" />
        </button>
      )}

      {/* Products Modal */}
      {showProductsModal && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between shadow-lg">
            <h3 className="font-medium text-lg">Ürünler</h3>
            <button onClick={() => setShowProductsModal(false)} className="p-1">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Search */}
          <div className="p-3 bg-white border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Ürün ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* Categories */}
          <div className="bg-white border-b px-3 py-2 overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 whitespace-nowrap text-sm rounded-lg transition-all ${selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-auto p-3 bg-gray-50">
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => {
                    // USD Auto-calculation for grid selection
                    let price = product.price;
                    const isAutoCalc = (product as any).autoCalculateUSD || (product as any).auto_calculate_usd;
                    if (isAutoCalc && (product as any).salePriceUSD > 0) {
                      let effectiveRate = (product as any).customExchangeRate || (product as any).custom_exchange_rate || exchangeRate;
                      if (effectiveRate > 0 && effectiveRate < 10) effectiveRate *= 1000;
                      price = (product as any).salePriceUSD * effectiveRate;
                    }

                    addToCart(product, undefined, undefined, undefined, price);
                    setShowProductsModal(false);
                  }}
                  className="bg-white border-2 border-gray-200 p-3 text-left hover:shadow-lg hover:border-blue-500 active:bg-blue-50 transition-all rounded-lg"
                >
                  <div className="font-medium text-sm mb-2 line-clamp-2 min-h-[40px]">{product.name}</div>
                  <div className="text-blue-600 font-bold text-lg mb-1">
                    {product.price.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">Stok: {product.stock}</div>
                  <div className="text-xs text-gray-400 mt-1">{product.barcode}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4">
              <h3 className="font-medium text-lg">Ödeme</h3>
              <div className="text-3xl font-bold mt-1">{total.toFixed(2)}</div>
              {appliedCampaign && (
                <div className="mt-2 text-xs flex items-center gap-1 bg-white/20 px-2 py-1 rounded">
                  <Tag className="w-3 h-3" />
                  <span>{appliedCampaign.name} uygulandı</span>
                </div>
              )}
            </div>

            <div className="p-6 space-y-3">
              <button
                onClick={() => completeSale('Nakit')}
                className="w-full flex items-center gap-3 px-4 py-4 bg-green-50 border-2 border-green-500 text-green-700 hover:bg-green-100 active:bg-green-200 transition-all rounded-lg"
              >
                <Banknote className="w-6 h-6" />
                <div className="flex-1 text-left">
                  <div className="font-medium">Nakit (F8)</div>
                </div>
              </button>

              <button
                onClick={() => completeSale('Kredi Kartı')}
                className="w-full flex items-center gap-3 px-4 py-4 bg-blue-50 border-2 border-blue-500 text-blue-700 hover:bg-blue-100 active:bg-blue-200 transition-all rounded-lg"
              >
                <CreditCard className="w-6 h-6" />
                <div className="flex-1 text-left">
                  <div className="font-medium">Kredi Kartı</div>
                </div>
              </button>

              <button
                onClick={() => completeSale('Banka Kartı')}
                className="w-full flex items-center gap-3 px-4 py-4 bg-purple-50 border-2 border-purple-500 text-purple-700 hover:bg-purple-100 active:bg-purple-200 transition-all rounded-lg"
              >
                <CreditCard className="w-6 h-6" />
                <div className="flex-1 text-left">
                  <div className="font-medium">Banka Kartı</div>
                </div>
              </button>

              <button
                onClick={() => completeSale('Mobil Ödeme')}
                className="w-full flex items-center gap-3 px-4 py-4 bg-orange-50 border-2 border-orange-500 text-orange-700 hover:bg-orange-100 active:bg-orange-200 transition-all rounded-lg"
              >
                <Smartphone className="w-6 h-6" />
                <div className="flex-1 text-left">
                  <div className="font-medium">Mobil Ödeme</div>
                </div>
              </button>

              <div className="h-px bg-gray-200 my-2"></div>

              {/* Printing Options */}
              <div className="p-4 bg-gray-50 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 px-1">
                    <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-gray-500" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900">Yazıcı Ayarları</div>
                      <div className="text-[10px] text-gray-500 font-medium">Satış sonrası çıktı seçenekleri</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex flex-col gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${autoPrint ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-center justify-between">
                      <div className={`p-1.5 rounded-lg ${autoPrint ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        <Plus className={`w-4 h-4 ${autoPrint ? '' : 'rotate-45'}`} />
                      </div>
                      <input
                        type="checkbox"
                        checked={autoPrint}
                        onChange={(e) => setAutoPrint(e.target.checked)}
                        className="hidden"
                      />
                    </div>
                    <div className="text-[11px] font-bold text-gray-900 leading-tight">Otomatik Yazdır</div>
                  </label>

                  <div className={`flex flex-col gap-2 p-3 rounded-xl border-2 border-purple-500 bg-purple-50 transition-all`}>
                    <div className="flex items-center justify-between">
                      <div className="p-1.5 rounded-lg bg-purple-600 text-white">
                        <Globe className="w-4 h-4" />
                      </div>
                    </div>
                    <select
                      value={receiptLanguage}
                      onChange={(e) => setReceiptLanguage(e.target.value as any)}
                      className="bg-transparent border-none text-[11px] font-bold text-gray-900 p-0 focus:ring-0 cursor-pointer"
                    >
                      <option value="tr">TR</option>
                      <option value="en">EN</option>
                      <option value="ar">AR</option>
                      <option value="ku">KU</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-200 my-2"></div>

              <button
                onClick={() => setShowPayment(false)}
                className="w-full px-4 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4">
              <h3 className="font-medium text-lg">Müşteri Seç</h3>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-2">
              <button
                onClick={() => {
                  setSelectedCustomer(null);
                  setShowCustomerModal(false);
                }}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 active:bg-blue-100 text-left"
              >
                <p className="font-medium">Müşterisiz Devam Et</p>
              </button>

              {customers.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setShowCustomerModal(false);
                  }}
                  className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${selectedCustomer?.id === customer.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50 active:bg-blue-100'
                    }`}
                >
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-gray-600">{customer.phone}</p>
                </button>
              ))}
            </div>

            <div className="p-4 border-t">
              <button
                onClick={() => setShowCustomerModal(false)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {showNotification && (
        <div className="fixed top-4 right-4 z-[100] animate-slide-in">
          <div className={`px-6 py-4 shadow-2xl border-l-4 min-w-[300px] ${notificationType === 'success' ? 'bg-green-50 border-green-600' :
            notificationType === 'error' ? 'bg-red-50 border-red-600' :
              notificationType === 'warning' ? 'bg-yellow-50 border-yellow-600' :
                'bg-blue-50 border-blue-600'
            }`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 ${notificationType === 'success' ? 'text-green-600' :
                notificationType === 'error' ? 'text-red-600' :
                  notificationType === 'warning' ? 'text-yellow-600' :
                    'text-blue-600'
                }`}>
                {notificationType === 'success' ? <FileCheck className="w-5 h-5" /> :
                  notificationType === 'error' ? <X className="w-5 h-5" /> :
                    notificationType === 'warning' ? <Smartphone className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <p className={`text-sm whitespace-pre-line ${notificationType === 'success' ? 'text-green-800' :
                  notificationType === 'error' ? 'text-red-800' :
                    notificationType === 'warning' ? 'text-yellow-800' :
                      'text-blue-800'
                  }`}>{notificationMessage}</p>
              </div>
              <button
                onClick={() => setShowNotification(false)}
                className={`${notificationType === 'success' ? 'text-green-600 hover:text-green-800' :
                  notificationType === 'error' ? 'text-red-600 hover:text-red-800' :
                    notificationType === 'warning' ? 'text-yellow-600 hover:text-yellow-800' :
                      'text-blue-600 hover:text-blue-800'
                  }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {showBarcodeScanner && (
        <BarcodeScanner
          onScan={async result => {
            // Close scanner first
            setShowBarcodeScanner(false);

            // Debug - log what we're searching for
            console.log('Scanned barcode:', result.code);

            try {
              const lookupResult = await productAPI.lookupByBarcode(result.code);

              if (lookupResult && lookupResult.product) {
                const product = lookupResult.product;
                const unitInfo = lookupResult.unitInfo;

                if (product.hasVariants || (product.variants && product.variants.length > 0)) {
                  showNotif('Lütfen varyant seçimi için market ekranını kullanın veya ürünü listeden seçin.', 'info');
                  return;
                }

                const price = (unitInfo && unitInfo.sale_price > 0) ? unitInfo.sale_price : (product.price * (unitInfo?.multiplier || 1));
                addToCart(product, undefined, unitInfo?.unit_code, unitInfo?.multiplier, price);
                showNotif(`${product.name} sepete eklendi`, 'success');
              } else {
                showNotif(`Ürün bulunamadı!\nAranan barkod: ${result.code}`, 'error');
              }
            } catch (error) {
              console.error('[MobilePOS] Barcode scanning error:', error);
              showNotif('Barkod tarama hatası!', 'error');
            }
          }}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}
    </div>
  );
}
