import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { logger } from '../../utils/logger';
import {
  ShoppingCart,
  CreditCard,
  Banknote,
  Receipt,
  Trash2,
  Plus,
  Minus,
  Search,
  Users,
  Calculator,
  RotateCcw,
  CheckCircle,
  X,
  Tag,
  Package,
  History,
  FileText,
  Scale,
  Percent,
  DollarSign,
  Grid3x3,
  ArrowRightLeft,
  Globe,
  Clock,
  Calendar,
  LogOut,
  Settings,
  Barcode,
  Keyboard,
  Lock,
  Unlock,
  CornerDownLeft,
  Mic,
  TrendingUp
} from 'lucide-react';
import { POSPaymentModal } from './POSPaymentModal';
import { POSManagerAuthModal } from './POSManagerAuthModal';
import { POSParkedReceiptsModal } from './POSParkedReceiptsModal';
import { POSSalesHistoryModal } from './POSSalesHistoryModal';
import { POSReturnModal } from './POSReturnModal';
import { POSCampaignModal } from './POSCampaignModal';
import { POSCancelReasonModal } from './POSCancelReasonModal';
import { POSItemDiscountModal } from './POSItemDiscountModal';
import { POSProductCatalogModal } from './POSProductCatalogModal';
import { POSCloseCashRegisterModal } from './POSCloseCashRegisterModal';
import { Receipt80mm } from './Receipt80mm';
import { POSOpenCashRegisterModal } from './POSOpenCashRegisterModal';
import { POSMissingBarcodesModal } from './POSMissingBarcodesModal';
import { POSCategoryModal } from './POSCategoryModal';
import { POSStockQueryModal } from './POSStockQueryModal';
import { POSPageSelectorModal } from './POSPageSelectorModal';
import { CartTable } from './CartTable';
import { CartCards } from './CartCards';
import { VariantSelectionPanelForCart } from './VariantSelectionPanelForCart';
import { POSDetailSidebar } from './POSDetailSidebar';
import { BalanceLoadModal } from '../wallet/BalanceLoadModal';
import { printThermalReceipt } from '../../utils/thermalPrinter';
import { KeyboardShortcutOverlay, KeyboardShortcutHint } from '../shared/KeyboardShortcutOverlay';
import { salesAPI } from '../../services/api/sales';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts';
import { useSaleStore } from '../../store';
import { productAPI } from '../../services/api/products';
import { postgres } from '../../services/postgres';

import { useLanguage } from '../../contexts/LanguageContext';
import { usePermission } from '../../shared/hooks/usePermission';
import { useTheme } from '../../contexts/ThemeContext';
import { formatNumber as formatNumberUtil } from '../../utils/formatNumber';
import { LanguageSelectionModal } from '../system/LanguageSelectionModal';
import type { Product, Customer, Campaign, User as UserType, Sale } from '../../core/types';
import type { CartItem, ParkedReceipt, SaleRecord, PaymentType } from './types';
import { applyCampaign, CampaignResult } from '../../utils/campaignEngine';
// import type { LayoutOrder } from './ScreenSettingsModal';
export type LayoutOrder = 'cart-numpad-quick' | 'cart-fullscreen' | 'cart-wide-quick' | 'quick-dominant' | 'numpad-dominant' | 'cart-top-actions-bottom' | 'quick-top-cart-bottom' | 'quick-with-detail-sidebar' | 'quick-sidebar-numpad' | 'cart-quick-numpad-float' | string;

interface MarketPOSProps {
  products: Product[];
  customers: Customer[];
  campaigns: Campaign[];
  selectedCustomer: Customer | null;
  currentStaff: string;
  currentUser: UserType;
  onSaleComplete: (sale: Sale) => void;
  onLogout?: () => void;
  gridColumns?: number;
  fontSize?: number;
  fontWeight?: number;
  zoomLevel?: number;
  onZoomClick?: () => void;
  cartViewMode?: 'table' | 'cards';
  buttonColorStyle?: 'filled' | 'outline';
  wsStatus?: 'connected' | 'disconnected' | 'connecting';
  rtlMode?: boolean;
  setRtlMode?: (value: boolean) => void;
  layoutOrder?: LayoutOrder;
}

export default function MarketPOS({
  products,
  customers,
  campaigns,
  selectedCustomer,
  currentStaff,
  currentUser,
  onSaleComplete,
  onLogout,
  gridColumns = 4,
  fontSize = 100,
  fontWeight = 400,
  zoomLevel,
  onZoomClick,
  cartViewMode = 'cards',
  buttonColorStyle = 'filled',
  wsStatus = 'disconnected',
  rtlMode = false,
  setRtlMode,
  layoutOrder = 'cart-numpad-quick',
}: MarketPOSProps) {
  const { selectedFirma } = useFirmaDonem();
  // Get sales from store
  const sales = useSaleStore((state) => state.sales);

  // Language support
  const { t } = useLanguage();
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Theme support
  const { darkMode } = useTheme();

  // Permission check
  const { hasPermission } = usePermission();

  // Keyboard shortcuts
  const [showShortcutOverlay, setShowShortcutOverlay] = useState(false);

  // Helper function for button styles based on buttonColorStyle
  const getButtonClass = (baseColor: string) => {
    if (buttonColorStyle === 'outline') {
      // Sadece çerçeve - beyaz arkaplan, renkli border ve text
      const colorMap: Record<string, string> = {
        'blue': 'bg-white hover:bg-blue-50 text-blue-600 border-2 border-blue-600',
        'teal': 'bg-white hover:bg-teal-50 text-teal-600 border-2 border-teal-600',
        'teal-light': 'bg-white hover:bg-teal-50 text-teal-500 border-2 border-teal-400',
        'red': 'bg-white hover:bg-red-50 text-red-500 border-2 border-red-400',
        'purple': 'bg-white hover:bg-purple-50 text-purple-600 border-2 border-purple-600',
        'green': 'bg-white hover:bg-green-50 text-green-600 border-2 border-green-600',
        'red-dark': 'bg-white hover:bg-red-50 text-red-700 border-2 border-red-700',
        'green-dark': 'bg-white hover:bg-green-50 text-green-700 border-2 border-green-700',
        'gray': 'bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-700',
      };
      return colorMap[baseColor] || colorMap['blue'];
    } else {
      // Renkli arkaplan - klasik
      const colorMap: Record<string, string> = {
        'blue': 'bg-blue-600 hover:bg-blue-700 text-white',
        'teal': 'bg-teal-600 hover:bg-teal-700 text-white',
        'teal-light': 'bg-teal-400 hover:bg-teal-500 text-white',
        'red': 'bg-red-400 hover:bg-red-500 text-white',
        'purple': 'bg-purple-600 hover:bg-purple-700 text-white',
        'green': 'bg-green-600 hover:bg-green-700 text-white',
        'red-dark': 'bg-red-700 hover:bg-red-800 text-white',
        'green-dark': 'bg-green-700 hover:bg-green-800 text-white',
        'gray': 'bg-gray-700 hover:bg-gray-800 text-white',
      };
      return colorMap[baseColor] || colorMap['blue'];
    }
  };

  // Cart and customer state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Parked receipts state
  const [parkedReceipts, setParkedReceipts] = useState<ParkedReceipt[]>(() => {
    try {
      const saved = localStorage.getItem('retailos_parked_receipts');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to parse parked receipts:', e);
      return [];
    }
  });

  const [inputValue, setInputValue] = useState('');
  const [quantityMode, setQuantityMode] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [numpadMode, setNumpadMode] = useState<'barcode' | 'quantity'>('barcode'); // barcode veya quantity modu
  const [savedQuantity, setSavedQuantity] = useState<number | null>(null); // * tuşuna basıldığında kaydedilen adet

  // Barcode input ref for numpad support
  const barcodeInputRef = React.useRef<HTMLInputElement>(null);

  // Exchange rate state
  const [exchangeRate, setExchangeRate] = useState<number>(1310); // Default fallback
  const [exchangeRateDate, setExchangeRateDate] = useState<string>('');
  const [unitSets, setUnitSets] = useState<any[]>([]);

  useEffect(() => {
    const fetchRate = async () => {
      try {
        const { exchangeRateAPI } = await import('../../services/api/masterData');
        const rates = await exchangeRateAPI.getLatestRates();
        const usdRate = rates.find(r => r.currency_code === 'USD');
        if (usdRate) {
          setExchangeRate(usdRate.sell_rate);
          setExchangeRateDate(usdRate.date);
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
        console.error('[MarketPOS] Unit sets load failed:', err);
      }
    };
    loadUnitSets();
  }, []);

  // Category state
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Get unique categories from products - ensure it's always defined
  const categories = React.useMemo(() => {
    if (!products || products.length === 0) return [t.allCategories];
    const uniqueCategories = new Set<string>();
    products.forEach(p => {
      if (p.category) {
        if (Array.isArray(p.category)) {
          p.category.forEach(cat => uniqueCategories.add(cat));
        } else {
          uniqueCategories.add(p.category);
        }
      }
    });
    return [t.allCategories, ...Array.from(uniqueCategories)];
  }, [products, t.allCategories]);

  // Initialize selectedCategory when categories change
  useEffect(() => {
    if (!selectedCategory && categories.length > 0) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);

  // Modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showManagerAuthModal, setShowManagerAuthModal] = useState(false);
  const [showParkedReceiptsModal, setShowParkedReceiptsModal] = useState(false);
  const [showSalesHistoryModal, setShowSalesHistoryModal] = useState(false);
  const [showLastReceiptModal, setShowLastReceiptModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showStockQueryModal, setShowStockQueryModal] = useState(false);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [showItemDiscountModal, setShowItemDiscountModal] = useState(false);
  const [selectedItemForDiscount, setSelectedItemForDiscount] = useState<CartItem | null>(null);
  const [showProductCatalogModal, setShowProductCatalogModal] = useState(false);
  const [showCloseCashRegisterModal, setShowCloseCashRegisterModal] = useState(false);
  const [showOpenCashRegisterModal, setShowOpenCashRegisterModal] = useState(false);
  const [showPageSelectorModal, setShowPageSelectorModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [completedPaymentData, setCompletedPaymentData] = useState<any>(null);
  const [catalogMode, setCatalogMode] = useState<'add-to-cart' | 'assign-to-slot'>('add-to-cart');
  const [selectedQuickSlot, setSelectedQuickSlot] = useState<number>(0);
  const [quickProductPage, setQuickProductPage] = useState<number>(0); // 0=1-12, 1=13-24, 2=25-36, 3=37-48
  const [showVariantSelection, setShowVariantSelection] = useState(false);
  const [variantSelectionProduct, setVariantSelectionProduct] = useState<Product | null>(null);
  const [selectedCartItem, setSelectedCartItem] = useState<CartItem | null>(null); // For detail sidebar
  const [variantSelectionCartIndex, setVariantSelectionCartIndex] = useState<number | null>(null); // Sepet içi varyant değiştirme için
  const [productSearchQuery, setProductSearchQuery] = useState<string>(''); // Ürün kataloğu arama sorgusu
  const [showBalanceLoadModal, setShowBalanceLoadModal] = useState(false);
  const [missingBarcodes, setMissingBarcodes] = useState<string[]>([]);
  const [showMissingBarcodesModal, setShowMissingBarcodesModal] = useState(false);

  // Pending action state for manager override
  type PendingAction =
    | { type: 'REFUND' }
    | { type: 'CANCEL_RECEIPT' }
    | { type: 'DISCOUNT'; index: number }
    | { type: 'MANAGEMENT_ACCESS' }
    | null;

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  // Cash register state
  const [cashRegisterOpeningCash, setCashRegisterOpeningCash] = useState<number>(() => {
    const saved = localStorage.getItem('retailos_opening_cash');
    return saved ? parseFloat(saved) : 0;
  });
  const [isCashRegisterOpen, setIsCashRegisterOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('retailos_cash_register_open');
    return saved === 'true';
  });

  // Pending cash handover state
  const [pendingHandover, setPendingHandover] = useState<{
    fromStaff: string;
    amount: number;
    note: string;
  } | null>(() => {
    const saved = localStorage.getItem('retailos_pending_handover');
    return saved ? JSON.parse(saved) : null;
  });

  // Quick product slots - stored in localStorage
  const [quickProducts, setQuickProducts] = useState<(Product | null)[]>(() => {
    try {
      const saved = localStorage.getItem('retailos_quick_products');
      return saved ? JSON.parse(saved) : Array(48).fill(null);
    } catch (e) {
      console.error('Failed to parse quick products:', e);
      return Array(48).fill(null);
    }
  });

  // Save quick products to localStorage
  useEffect(() => {
    localStorage.setItem('retailos_quick_products', JSON.stringify(quickProducts));
  }, [quickProducts]);

  // Format number to Turkish locale (thousand separator: dot, decimal: comma)
  const formatNumber = (num: number, decimals: number = 2, showDecimals: boolean = false): string => {
    return formatNumberUtil(num, decimals, showDecimals);
  };

  // Receipt number - generate once and keep until cart is cleared
  const [receiptNumber, setReceiptNumber] = useState(() =>
    `MRK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0')}`
  );

  // Generate new receipt number when cart is cleared or payment is completed
  const generateNewReceiptNumber = async () => {
    try {
      const counts = await salesAPI.getSequenceCounts();
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0');
      setReceiptNumber(`MRK-${datePart}-M${counts.monthly}-D${counts.daily}-${randomPart}`);
    } catch (error) {
      console.error('Failed to generate sequence counts:', error);
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0');
      setReceiptNumber(`MRK-${datePart}-${randomPart}`);
    }
  };

  useEffect(() => {
    generateNewReceiptNumber();
  }, []);

  // Notification state
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

  const [customer, setCustomer] = useState({
    name: selectedCustomer?.name || t.retailCustomer,
    cardNo: selectedCustomer?.code || '',
    pointDiscount: 0,
    pointTotal: 0,
    cashCount: 0
  });

  // Update customer when selectedCustomer changes
  useEffect(() => {
    setCustomer({
      name: selectedCustomer?.name || t.retailCustomer,
      cardNo: selectedCustomer?.code || '',
      pointDiscount: 0,
      pointTotal: 0,
      cashCount: 0
    });
  }, [selectedCustomer, t.retailCustomer]);

  // Save parked receipts to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('retailos_parked_receipts', JSON.stringify(parkedReceipts));
  }, [parkedReceipts]);

  // Calculate totals - Optimized with useMemo
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const price = item.price || item.variant?.price || item.product.price;
      return sum + (item.quantity * price);
    }, 0);
  }, [cart]);

  const totalDiscount = useMemo(() => {
    return cart.reduce((sum, item) => {
      const price = item.price || item.variant?.price || item.product.price;
      const itemTotal = item.quantity * price;
      return sum + (itemTotal * item.discount / 100);
    }, 0);
  }, [cart]);

  const campaignResult = useMemo<CampaignResult>(() => {
    if (!selectedCampaign) {
      return { totalDiscount: 0, itemDiscounts: [], appliedCampaignId: null };
    }
    return applyCampaign(cart, selectedCampaign);
  }, [selectedCampaign, cart]);

  const campaignDiscount = useMemo(() => {
    return campaignResult.totalDiscount;
  }, [campaignResult]);

  const total = useMemo(() => {
    return subtotal - totalDiscount - campaignDiscount;
  }, [subtotal, totalDiscount, campaignDiscount]);

  // Brüt Kar Hesaplama (Instant Profit)
  const instantProfit = useMemo(() => {
    let profit = 0;
    cart.forEach(item => {
      const salePrice = item.price || item.variant?.price || item.product.price;
      const purchasePrice = item.variant?.cost || item.product.cost || 0;
      const itemSubtotal = item.quantity * salePrice;
      const itemDiscount = itemSubtotal * (item.discount / 100);
      const itemNetProfit = (itemSubtotal - itemDiscount) - (item.quantity * purchasePrice);
      profit += itemNetProfit;
    });
    // Sepet bazlı genel kampanya indirimini de kardan düşüyoruz
    return profit - campaignDiscount;
  }, [cart, campaignDiscount]);

  // Auto-apply campaign based on cart subtotal
  useEffect(() => {
    if (cart.length === 0) {
      setSelectedCampaign(null);
      return;
    }

    // Eğer manuel bir kampanya seçilmişse ve autoApply değilse, otomatik değiştirme
    if (selectedCampaign && !selectedCampaign.autoApply) {
      return;
    }

    const afterItemDiscount = subtotal - totalDiscount;

    // Aktif ve otomatik uygulanan kampanyaları bul
    const eligibleCampaigns = campaigns.filter(c => {
      if (!c.active || !c.autoApply) return false;
      if (c.minPurchase && afterItemDiscount < c.minPurchase) return false;

      const now = new Date();
      const start = new Date(c.startDate);
      const end = new Date(c.endDate);
      return now >= start && now <= end;
    });

    // En yüksek indirim sağlayan kampanyayı seç
    if (eligibleCampaigns.length > 0) {
      const bestCampaign = eligibleCampaigns.reduce((best, current) => {
        const bestDiscount = best.type === 'percentage'
          ? afterItemDiscount * best.discountValue / 100
          : Math.min(best.discountValue, afterItemDiscount);

        const currentDiscount = current.type === 'percentage'
          ? afterItemDiscount * current.discountValue / 100
          : Math.min(current.discountValue, afterItemDiscount);

        return currentDiscount > bestDiscount ? current : best;
      });

      if (selectedCampaign?.id !== bestCampaign.id) {
        setSelectedCampaign(bestCampaign);
      }
    } else if (selectedCampaign?.autoApply) {
      // Koşullar sağlanmıyorsa otomatik kampanyayı kaldır
      setSelectedCampaign(null);
    }
  }, [cart, subtotal, totalDiscount, campaigns, selectedCampaign]);

  const handleNumberClick = (num: string) => {
    // İlk tıklamada quantity moduna geç
    if (numpadMode === 'barcode') {
      setNumpadMode('quantity');
      setInputValue(num); // İlk sayıyı ekle
      // Barkod input'undan focus'u al
      barcodeInputRef.current?.blur();
    } else {
      // Quantity/price modunda - inputValue'ya yaz
      setInputValue(prev => prev + num);
    }
  };

  const handleClear = () => {
    if (numpadMode === 'barcode') {
      setBarcodeInput('');
      setTimeout(() => barcodeInputRef.current?.focus(), 0);
    } else {
      setInputValue('');
      setSavedQuantity(null); // Kaydedilmiş adeti de temizle
    }
  };

  const handleDelete = () => {
    if (numpadMode === 'barcode') {
      setBarcodeInput(prev => prev.slice(0, -1));
      setTimeout(() => barcodeInputRef.current?.focus(), 0);
    } else {
      setInputValue(prev => prev.slice(0, -1));
    }
  };

  const handleQuantity = async () => {
    // * tuşuna basıldığında: Eğer adet girilmişse kaydet, barkod moduna geç
    if (inputValue && !savedQuantity) {
      const quantity = parseInt(inputValue) || 1;
      setSavedQuantity(quantity);
      setInputValue('');
      setNumpadMode('barcode');
      barcodeInputRef.current?.focus();
      showNotif(t.quantitySavedMessage.replace('{quantity}', quantity.toString()), 'info');
      return;
    }

    // Barkod girildikten sonra Enter/Tamam'a basıldığında işlemi yap
    let barcodeToSearch = barcodeInput.trim();
    let quantity = savedQuantity || 1;

    if (!barcodeToSearch && inputValue) {
      barcodeToSearch = inputValue.trim();
    }

    if (!barcodeToSearch) {
      if (savedQuantity) {
        showNotif(t.pleaseEnterBarcode, 'error');
      } else {
        showNotif(t.pleaseEnterQuantityFirst, 'error');
      }
      return;
    }

    const found = await searchByBarcode(barcodeToSearch, quantity);
    if (found) {
      setBarcodeInput('');
      setInputValue('');
      setSavedQuantity(null);
      setNumpadMode('barcode');
      setTimeout(() => barcodeInputRef.current?.focus(), 0);
    }
  };

  const handleNumpadEnter = () => {
    if (numpadMode === 'barcode') {
      if (savedQuantity) {
        handleQuantity();
      } else {
        handleBarcodeSearch();
      }
    } else {
      if (inputValue && !savedQuantity) {
        handleQuantity();
      }
    }
  };

  // Barkod butonuna basınca direkt 1 adet ekle
  const handleBarcodeButtonClick = async () => {
    // Numpad'dan veya barkod input'tan barkodu al
    const barcodeToSearch = inputValue.trim() || barcodeInput.trim();

    if (!barcodeToSearch) {
      showNotif(t.pleaseEnterBarcodeFirst, 'error');
      return;
    }

    // Direkt bu barkod ile arama yap
    const found = await searchByBarcode(barcodeToSearch);

    // Eğer barkod bulunamadıysa, ürün arama ekranını aç
    if (!found) {
      setProductSearchQuery(barcodeToSearch);
      setCatalogMode('add-to-cart');
      setShowProductCatalogModal(true);
    }

    // Input'ları temizle
    setInputValue('');
    setBarcodeInput('');
    setTimeout(() => barcodeInputRef.current?.focus(), 0);
  };

  // Barkod ile arama yap - ürün bulunursa true, bulunamazsa false döner
  const searchByBarcode = async (barcode: string, quantity: number = 1): Promise<boolean> => {
    const trimmedBarcode = barcode.trim();
    logger.log('?? Aranan barkod:', trimmedBarcode);

    try {
      const result = await productAPI.lookupByBarcode(trimmedBarcode);

      if (result && result.product) {
        const product = result.product;
        const unitInfo = result.unitInfo;

        // Varyant kontrolü (Eğer ana ürün barkodu okutulmuşsa ve varyantları varsa)
        if (product.hasVariants || (product.variants && product.variants.length > 0)) {
          // Eğer okutulan barkod bir varyanta ait DEĞİLSE (yani birim barkodu veya ana barkod ise)
          // varyant seçimini aç. Eğer unitInfo varsa (birim barkodu ise), varyantı da belirlemiş olabiliriz.
          // Şimdilik ana ürün barkodu veya birim barkodu senaryosunda varyant kataloğunu açıyoruz.
          logger.log('✅ Varyantlı ürün bulundu, varyant seçim paneli açılıyor');
          showNotif(t.pleaseSelectVariant, 'info');
          setVariantSelectionProduct(product);
          setShowVariantSelection(true);
          return true;
        }

        // Fiyat belirleme: Önce birim fiyatı, sonra USD hesaplaması, en son baz fiyat
        let price = product.price;
        let unitName: string | undefined = undefined;
        let unitMultiplier: number | undefined = undefined;

        if (unitInfo) {
          unitName = unitInfo.unit || undefined;        // "Koli", "Palet" vb.
          unitMultiplier = unitInfo.multiplier || undefined;

          // If unitMultiplier is missing or 1, try to find it in unitSets
          if ((!unitMultiplier || unitMultiplier === 1) && unitName) {
            const pUnitsetId = (product as any).unitset_id || (product as any).unitsetId;
            if (pUnitsetId) {
              const unitSet = unitSets.find(us => us.id === pUnitsetId);
              const line = unitSet?.lines?.find((l: any) => l.name === unitName || l.code === unitName);
              if (line) {
                unitMultiplier = line.conv_fact1 || 1;
                logger.log(`[MarketPOS] Multiplier found in unitSets for ${unitName}: ${unitMultiplier}`);
              } else {
                logger.log(`[MarketPOS] Unit ${unitName} not found in unitSet ${pUnitsetId}`);
              }
            } else {
              logger.log(`[MarketPOS] Product has no unitset_id for unit lookup`);
            }
          }

          // Öncelik 1: Birim barkoduna özel TL satış fiyatı
          if (unitInfo.sale_price && unitInfo.sale_price > 0) {
            price = unitInfo.sale_price;
          }
          // Öncelik 2: Çarpan varsa ve kendi özel fiyatı yoksa çarpanla fiyatlandır
          else if (unitMultiplier && unitMultiplier > 1) {
            price = product.price * unitMultiplier;
          }
        }

        // USD Fiyat Kontrolü - Eğer TL fiyatı birim barkodundan direkt gelmediyse USD'den hesapla
        if (product.autoCalculateUSD && product.salePriceUSD && product.salePriceUSD > 0 && (!unitInfo || !unitInfo.sale_price)) {
          let effectiveRate = (product.customExchangeRate ?? 0) > 0 ? product.customExchangeRate! : exchangeRate;
          
          if (effectiveRate > 0 && effectiveRate < 10) {
            effectiveRate = effectiveRate * 1000;
          }
          
          const convertedPrice = product.salePriceUSD * effectiveRate;
          // Eğer birim barkodu ise çarpanla çarp, değilse direkt convertedPrice
          price = convertedPrice * (unitMultiplier || 1);
          logger.log(`💵 USD Fiyat Dönüşümü: ${product.salePriceUSD}$ * ${effectiveRate} = ${price} IQD`);
        }

        addToCart(product, undefined, quantity, unitName, unitMultiplier, price);
        return true;
      } else {
        logger.log('❌ Barkod bulunamadı');
        showNotif(t.barcodeNotFoundWarning.replace('{barcode}', trimmedBarcode), 'error');
        if (!missingBarcodes.includes(trimmedBarcode)) {
          setMissingBarcodes(prev => [trimmedBarcode, ...prev]);
        }
        return false;
      }
    } catch (error) {
      console.error('[MarketPOS] Barcode lookup error:', error);
      showNotif('Barkod sorgulama hatası!', 'error');
      return false;
    }
  };

  // Add to cart
  const addToCart = (product: Product, variant?: any, customQuantity?: number, unit?: string, multiplier?: number, customPrice?: number) => {
    // Kasa açık mı kontrol et
    if (!isCashRegisterOpen) {
      showNotif(t.openCashRegisterToAddProduct, 'error');
      setTimeout(() => {
        setShowOpenCashRegisterModal(true);
      }, 1000);
      return;
    }

    let price: number = 0;
    
    // Manual selection path (price not provided by barcode lookup)
    if (customPrice === undefined) {
      const isAutoCalc = (product as any).autoCalculateUSD || (product as any).auto_calculate_usd;
      if (isAutoCalc && (product as any).salePriceUSD > 0) {
        let effectiveRate = (product as any).customExchangeRate || (product as any).custom_exchange_rate || exchangeRate;
        // IQD Scaling Logic (e.g. 1.54 -> 1540)
        if (effectiveRate > 0 && effectiveRate < 10) effectiveRate *= 1000;
        
        price = (product as any).salePriceUSD * effectiveRate * (multiplier || 1);
        logger.log(`[MarketPOS] Manual Selection USD Price: ${(product as any).salePriceUSD}$ * ${effectiveRate} = ${price} IQD`);
      } else {
        price = variant?.price ?? product.price;
      }
    } else {
      price = customPrice;
    }

    const quantity = customQuantity || 1;
    const itemUnit = unit || product.unit || t.pcs;

    const existingItem = cart.find(item =>
      variant
        ? item.product.id === product.id && item.variant?.id === variant.id
        : item.product.id === product.id && !item.variant && (item.unit === itemUnit)
    );

    if (existingItem) {
      setCart(cart.map(item =>
        (variant ? item.product.id === product.id && item.variant?.id === variant.id : item.product.id === product.id && !item.variant && item.unit === itemUnit)
          ? { ...item, quantity: item.quantity + quantity, subtotal: (item.quantity + quantity) * price * (1 - item.discount / 100) }
          : item
      ));
    } else {
      setCart([...cart, {
        product,
        variant,
        quantity,
        unit: itemUnit,
        multiplier,
        discount: 0,
        subtotal: price * quantity,
        price
      }]);
    }

    showNotif(t.productAddedToCart.replace('{productName}', product.name), 'success');
  };

  // Handle barcode search (barcodeInput'tan okur)
  const handleBarcodeSearch = async () => {
    logger.log('Search handleBarcodeSearch called, barcodeInput:', barcodeInput);

    if (!barcodeInput.trim()) {
      logger.log('⚠️ Barkod boş, çıkılıyor');
      return;
    }

    const searchText = barcodeInput.trim();
    const quantity = savedQuantity || 1;

    const found = await searchByBarcode(searchText, quantity);

    // Eğer barkod bulunamadıysa, ürün arama ekranını aç
    if (!found) {
      setProductSearchQuery(searchText);
      setCatalogMode('add-to-cart');
      setShowProductCatalogModal(true);
      setBarcodeInput('');
      setSavedQuantity(null);
    } else {
      setBarcodeInput('');
      setSavedQuantity(null);
      setNumpadMode('barcode');
      setTimeout(() => barcodeInputRef.current?.focus(), 0);
    }
  };

  // Update cart item quantity
  const updateCartItemQuantity = (index: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(index);
      return;
    }

    setCart(cart.map((item, i) => {
      if (i === index) {
        const price = item.price ?? item.variant?.price ?? item.product.price;
        return {
          ...item,
          quantity: newQuantity,
          subtotal: newQuantity * price * (1 - item.discount / 100)
        };
      }
      return item;
    }));
  };

  // Update cart item price (Admin only)
  const updateCartItemPrice = (index: number, newPrice: number) => {
    setCart(cart.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          price: newPrice,
          subtotal: item.quantity * newPrice * (1 - item.discount / 100)
        };
      }
      return item;
    }));
  };

  // Remove from cart
  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
    showNotif(t.productRemovedFromCart, 'info');
  };

  // Update cart item variant
  const updateCartItemVariant = (index: number, variant: any) => {
    const item = cart[index];
    const newPrice = variant.price;
    const newSubtotal = newPrice * item.quantity * (1 - item.discount / 100);

    setCart(cart.map((cartItem, i) =>
      i === index
        ? { ...cartItem, variant, subtotal: newSubtotal }
        : cartItem
    ));

    showNotif(t.variantChanged.replace('{variant}', `${variant.color || ''} ${variant.size || ''}`.trim()), 'success');
  };

  // Clear cart
  const clearCart = () => {
    setShowCancelReasonModal(true);
  };

  const handleCancelConfirm = (reason: string) => {
    setCart([]);
    setSelectedCampaign(null);
    generateNewReceiptNumber();
    showNotif(t.receiptCancelled.replace('{reason}', reason), 'info');
    setShowCancelReasonModal(false);
  };

  // Park receipt
  const handleParkReceipt = () => {
    if (cart.length === 0) {
      showNotif(t.cartEmpty, 'warning');
      return;
    }

    const parkedReceipt: ParkedReceipt = {
      id: Date.now().toString(),
      receiptNumber,
      cart: cart,  // Fixed: was 'items', should be 'cart'
      customerName: selectedCustomer?.name,
      campaignName: selectedCampaign?.name,
      parkedAt: new Date().toISOString(),
      parkedBy: currentStaff
    };

    setParkedReceipts([...parkedReceipts, parkedReceipt]);
    setCart([]);
    setSelectedCampaign(null);
    generateNewReceiptNumber();
    showNotif(t.receiptParked, 'success');
  };

  // Retrieve parked receipt
  const handleRetrieveParkedReceipt = (receipt: ParkedReceipt) => {
    if (cart.length > 0) {
      showNotif(t.clearCurrentCartFirst, 'warning');
      return;
    }

    setCart(receipt.cart);  // Fixed: was receipt.items, should be receipt.cart
    setSelectedCampaign(null); // Kampanya yeniden seçilebilir
    setReceiptNumber(receipt.receiptNumber);
    setParkedReceipts(parkedReceipts.filter(r => r.id !== receipt.id));
    setShowParkedReceiptsModal(false);
    showNotif(t.parkedReceiptRetrieved, 'success');
  };

  // Delete parked receipt
  const handleDeleteParkedReceipt = (id: string) => {
    setParkedReceipts(parkedReceipts.filter(r => r.id !== id));
    showNotif(t.parkedReceiptDeleted, 'info');
  };

  // Handle payment
  const handlePaymentClick = () => {
    if (cart.length === 0) {
      showNotif(t.cartEmpty, 'warning');
      return;
    }

    // Kasa açık mı kontrol et
    if (!isCashRegisterOpen) {
      showNotif(t.openCashRegisterToSell, 'error');
      setTimeout(() => {
        setShowOpenCashRegisterModal(true);
      }, 1000);
      return;
    }

    setShowPaymentModal(true);
  };

  const handlePaymentComplete = async (paymentData: any) => {
    // Determine payment method from paymentData
    // If payments array exists (V2 modal), use the primary payment method
    // Otherwise use the method field directly (V1 modal)
    let paymentMethod = 'cash';
    if (paymentData.payments && paymentData.payments.length > 0) {
      // Calculate total amounts by payment method
      const exchangeRates: any = { IQD: 1, USD: 1310, EUR: 1450, TRY: 45 };
      const methodTotals: Record<string, number> = { cash: 0, card: 0, veresiye: 0 };

      paymentData.payments.forEach((payment: any) => {
        const amountInIQD = payment.amount * (exchangeRates[payment.currency] || 1);
        let method = payment.method;
        if (method === 'gateway') method = 'card';

        methodTotals[method] = (methodTotals[method] || 0) + amountInIQD;
      });

      // Use the payment method with the highest total
      paymentMethod = Object.keys(methodTotals).reduce((a, b) => methodTotals[a] > methodTotals[b] ? a : b);

    } else if (paymentData.method) {
      paymentMethod = paymentData.method === 'gateway' ? 'card' : paymentData.method;
    }

    const sale: Sale = {
      id: Date.now().toString(),
      receiptNumber,
      date: new Date().toISOString(),
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name || t.retailCustomer,
      items: cart.map(item => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        unit: item.unit || item.product.unit,
        multiplier: item.multiplier || 1,
        baseQuantity: item.quantity * (item.multiplier || 1),
        price: item.price || item.variant?.price || item.product.price,
        discount: item.discount,
        total: item.subtotal,
        variant: item.variant
      })),
      subtotal,
      discount: totalDiscount + campaignDiscount + (paymentData.discount || 0),
      total: paymentData.finalTotal || paymentData.total,
      paymentMethod: paymentMethod,
      campaignId: selectedCampaign?.id,
      campaignName: selectedCampaign?.name,
      campaignDiscount: campaignDiscount,
      cashier: currentStaff,
      firmNr: selectedFirm?.firm_nr,
      periodNr: selectedPeriod?.nr.toString().padStart(2, '0'),
      storeId: currentUser.storeId || undefined,
    };

    try {
      await onSaleComplete(sale);

      // Store sale and payment data for receipt
      setCompletedSale(sale);
      setCompletedPaymentData(paymentData);

      // Automatic Printing Logic
      if (paymentData.autoPrint) {
        const companyName = t.companyName || 'RetailOS';
        printThermalReceipt(sale, companyName, { 
          autoPrint: true, 
          language: paymentData.language || 'tr' 
        });
      }

      // Sepeti temizle
      setCart([]);
      setSelectedCampaign(null);
      generateNewReceiptNumber();
      setShowPaymentModal(false);

      // Müşteri seçilmiş ise ödeme kapatıldıktan sonra müşteri kalkmalı
      if (selectedCustomer) {
        const event = new CustomEvent('clearCustomer');
        window.dispatchEvent(event);
      }

      // Show receipt modal
      setShowReceiptModal(true);

      showNotif(t.saleCompleted, 'success');
    } catch (error: any) {
      console.error('Sale save failed:', error);
      showNotif(`Satış kaydedilemedi: ${error.message || 'Bilinmeyen hata'}`, 'error');
      // Do NOT clear cart on error so user can retry
    }
  };

  // Apply campaign
  const handleApplyCampaign = (campaign: Campaign | null) => {
    setSelectedCampaign(campaign);
    setShowCampaignModal(false);
    if (campaign) {
      showNotif(`${t.campaignApplied}: ${campaign.name}`, 'success');
    }
  };

  // Apply item discount
  const handleItemDiscountClick = (index: number) => {
    // Admin bypass: Admins can always apply discounts
    if (currentUser.role !== 'admin' && !hasPermission('pos.discount')) {
      setPendingAction({ type: 'DISCOUNT', index });
      setShowManagerAuthModal(true);
      return;
    }
    setSelectedItemForDiscount(cart[index]);
    setShowItemDiscountModal(true);
  };

  const handleApplyItemDiscount = (productId: string, variantId: string | undefined, discountPercent: number) => {
    setCart(cart.map((item) => {
      // Match by product ID and variant ID
      if (item.product.id === productId && item.variant?.id === variantId) {
        const price = item.variant?.price || item.product.price;
        return {
          ...item,
          discount: discountPercent,
          subtotal: item.quantity * price * (1 - discountPercent / 100)
        };
      }
      return item;
    }));
    showNotif(t.discountApplied.replace('{percent}', discountPercent.toString()), 'success');
    setShowItemDiscountModal(false);
    setSelectedItemForDiscount(null);
  };

  // Yeni modal için index bazlı indirim uygulama
  const handleApplyItemDiscountByIndex = (index: number, discountPercent: number) => {
    const item = cart[index];
    if (item) {
      handleApplyItemDiscount(item.product.id, item.variant?.id, discountPercent);
    }
  };

  const quickActions = [
    { label: t.campaign, color: 'bg-blue-50 text-blue-700 border-blue-400', onClick: () => setShowCampaignModal(true), icon: Tag },
    { label: t.category, color: 'bg-blue-50 text-blue-700 border-blue-400', onClick: () => setShowCategoryModal(true), icon: Package },
    { label: t.stockQuery, color: 'bg-blue-50 text-blue-700 border-blue-400', onClick: () => setShowStockQueryModal(true), icon: Package },
    { label: t.salesHistory, color: 'bg-blue-50 text-blue-700 border-blue-400', onClick: () => setShowSalesHistoryModal(true), icon: History },
    { label: t.returnTransaction, color: 'bg-blue-50 text-blue-700 border-blue-400', onClick: () => setShowReturnModal(true), icon: RotateCcw },
    { label: t.missingBarcodes, color: 'bg-red-50 text-red-700 border-red-400', onClick: () => setShowMissingBarcodesModal(true), icon: Barcode },
    { label: t.scale, color: 'bg-blue-50 text-blue-700 border-blue-400', onClick: () => { }, icon: Scale },
    { label: t.subtotalAction, color: 'bg-blue-50 text-blue-700 border-blue-400', onClick: () => showNotif(`${t.subtotalAction}: ${subtotal.toFixed(2)}`, 'info'), icon: Calculator },
    { label: t.receiptNote, color: 'bg-blue-50 text-blue-700 border-blue-400', onClick: () => { }, icon: FileText },
  ];

  // Helper function to get column order based on layoutOrder
  const getColumnOrder = (columnType: 'cart' | 'numpad' | 'quick'): number => {
    const parts = layoutOrder.split('-').filter(p => ['cart', 'numpad', 'quick'].includes(p));
    const index = parts.indexOf(columnType);
    return index !== -1 ? index : 0;
  };

  // Helper to check if numpad should be hidden
  const isNumpadHidden = () => {
    return layoutOrder.includes('2col') ||
      layoutOrder === 'cart-fullscreen' ||
      layoutOrder === 'quick-dominant';
  };

  // Helper to check if layout is vertical split
  const isVerticalLayout = () => {
    return layoutOrder.includes('top') && layoutOrder.includes('bottom');
  };

  // Helper to check if numpad should float
  const isNumpadFloat = () => {
    return layoutOrder === 'cart-quick-numpad-float' ||
      layoutOrder === 'cart-fullscreen';
  };

  // Get flex direction for main container
  const getMainFlexDirection = () => {
    if (isVerticalLayout()) return 'flex-col';
    return 'flex-row';
  };

  // Get cart width class based on layout
  const getCartWidthClass = () => {
    if (layoutOrder === 'cart-fullscreen') return 'w-full';
    if (layoutOrder === 'cart-wide-quick') return 'flex-[2]';
    if (layoutOrder.includes('2col')) return 'flex-1';
    if (layoutOrder === 'quick-dominant') return 'w-80';
    if (layoutOrder === 'numpad-dominant') return 'flex-1';
    // Vertical layouts use CSS Grid
    if (isVerticalLayout()) {
      if (layoutOrder === 'cart-top-actions-bottom') return 'w-full'; // cart spans top
      if (layoutOrder === 'quick-top-cart-bottom') return 'flex-1'; // cart in bottom row
    }
    return 'flex-1';
  };

  // Get numpad width class based on layout
  const getNumpadWidthClass = () => {
    if (layoutOrder === 'numpad-dominant') return 'w-96';
    return 'w-72';
  };

  // Get quick buttons width class based on layout
  const getQuickWidthClass = () => {
    // Sidebar layouts
    if (isSidebarLayout()) {
      return 'flex-1';
    }
    // Vertical layouts use CSS Grid
    if (isVerticalLayout()) {
      if (layoutOrder === 'quick-top-cart-bottom') return 'w-full'; // quick spans top
      if (layoutOrder === 'cart-top-actions-bottom') return 'flex-1'; // quick in bottom row
    }
    if (layoutOrder === 'quick-dominant') return 'flex-1';
    if (layoutOrder === 'cart-wide-quick') return 'flex-1';
    if (layoutOrder.includes('2col')) return 'flex-1';
    return 'w-[370px]';
  };

  // Get grid template for vertical layouts
  const getVerticalGridStyle = () => {
    if (!isVerticalLayout()) return {};

    if (layoutOrder === 'cart-top-actions-bottom') {
      // Cart on top, numpad + quick on bottom
      return {
        display: 'grid',
        gridTemplateRows: '1fr 1fr',
        gridTemplateColumns: 'auto 1fr',
        gridTemplateAreas: `"cart cart" "numpad quick"`
      };
    }

    if (layoutOrder === 'quick-top-cart-bottom') {
      // Quick on top, numpad + cart on bottom
      return {
        display: 'grid',
        gridTemplateRows: '1fr 1fr',
        gridTemplateColumns: 'auto 1fr',
        gridTemplateAreas: `"quick quick" "numpad cart"`
      };
    }

    return {};
  };

  // Get grid area for component in vertical layout
  const getGridArea = (component: 'cart' | 'numpad' | 'quick') => {
    if (!isVerticalLayout()) return {};
    return { gridArea: component };
  };

  // Helper to check if sidebar should be shown
  const isSidebarLayout = () => {
    return layoutOrder === 'quick-with-detail-sidebar' || layoutOrder === 'quick-sidebar-numpad';
  };

  // Get sidebar width class
  const getSidebarWidthClass = () => {
    return 'w-80'; // Fixed width for detail sidebar
  };

  // Auto-apply campaigns based on cart total
  useEffect(() => {
    if (cart.length === 0 || campaigns.length === 0) {
      return;
    }

    // Check if any campaign conditions are met
    const eligibleCampaign = campaigns.find(campaign => {
      if (!campaign.active) return false;

      // Check minimum purchase amount
      if (campaign.minPurchase && subtotal < campaign.minPurchase) {
        return false;
      }

      return true;
    });

    // Auto-apply the first eligible campaign if none is selected
    if (eligibleCampaign && !selectedCampaign) {
      setSelectedCampaign(eligibleCampaign);
      showNotif(`${t.campaignAutoApplied}: ${eligibleCampaign.name}`, 'success');
    }
    // Remove campaign if conditions are no longer met
    else if (selectedCampaign && selectedCampaign.minPurchase && subtotal < selectedCampaign.minPurchase) {
      setSelectedCampaign(null);
      showNotif(`${t.campaignRemoved}: ${t.minimumAmountNotMet}`, 'warning');
    }
  }, [cart, subtotal, campaigns]);

  // Define keyboard shortcuts configuration
  const keyboardShortcuts: KeyboardShortcut[] = useMemo(() => [
    // POS Actions
    { key: 'F1', description: 'payment', action: () => cart.length > 0 && handlePaymentClick(), category: 'pos' },
    { key: 'F2', description: 'productSearch', action: () => { setCatalogMode('add-to-cart'); setShowProductCatalogModal(true); }, category: 'pos' },
    { key: 'F3', description: 'campaign', action: () => setShowCampaignModal(true), category: 'pos' },
    { key: 'F4', description: 'return', action: () => setShowReturnModal(true), category: 'pos' },
    { key: 'F5', description: 'parkReceipt', action: () => cart.length > 0 && handleParkReceipt(), category: 'pos' },
    { key: 'F6', description: 'parkedReceipts', action: () => parkedReceipts.length > 0 && setShowParkedReceiptsModal(true), category: 'pos' },
    { key: 'F7', description: 'salesHistory', action: () => setShowSalesHistoryModal(true), category: 'pos' },
    { key: 'F8', description: 'cancelReceipt', action: () => cart.length > 0 && clearCart(), category: 'pos' },
    { key: 'F9', description: 'category', action: () => setShowCategoryModal(true), category: 'pos' },
    { key: 'F10', description: 'stockQuery', action: () => setShowStockQueryModal(true), category: 'pos' },
    { key: 'F11', description: 'openCashRegister', action: () => setShowOpenCashRegisterModal(true), category: 'pos' },
    { key: 'F12', description: 'closeCashRegister', action: () => isCashRegisterOpen && setShowCloseCashRegisterModal(true), category: 'pos' },

    // Quick Actions with Ctrl
    { key: 'p', ctrlKey: true, description: 'quickPayment', action: () => cart.length > 0 && handlePaymentClick(), category: 'quick' },
    { key: 'h', ctrlKey: true, description: 'parkedReceipts', action: () => parkedReceipts.length > 0 && setShowParkedReceiptsModal(true), category: 'quick' },
    { key: 'f', ctrlKey: true, description: 'search', action: () => { setCatalogMode('add-to-cart'); setShowProductCatalogModal(true); }, category: 'quick' },
    { key: 'Delete', description: 'clearCart', action: () => cart.length > 0 && clearCart(), category: 'quick' },

    // Navigation
    { key: 'Escape', description: 'focusBarcodeInput', action: () => barcodeInputRef.current?.focus(), category: 'navigation' },
    { key: 'Enter', description: 'confirmBarcode', action: () => barcodeInputRef.current?.focus(), category: 'navigation' },
    { key: '?', description: 'showShortcuts', action: () => setShowShortcutOverlay(!showShortcutOverlay), category: 'help' },
  ], [cart, parkedReceipts, isCashRegisterOpen, showShortcutOverlay]);

  // Register keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: keyboardShortcuts,
    enabled: true,
    preventDefault: true
  });

  // Legacy keyboard shortcuts (keep for backwards compatibility)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT' && !(e.ctrlKey || e.altKey || e.key.startsWith('F'))) {
        // Allow numpad input in barcode field
        if (e.key >= '0' && e.key <= '9' && barcodeInputRef.current) {
          // Already being handled by the input
          return;
        }
        return;
      }

      // F1 - Ödeme Al
      if (e.key === 'F1') {
        e.preventDefault();
        if (cart.length > 0) {
          handlePaymentClick();
        }
      }
      // F2 - Ürün Sorgulama
      else if (e.key === 'F2') {
        e.preventDefault();
        setCatalogMode('add-to-cart');
        setShowProductCatalogModal(true);
      }
      // F3 - Kampanya
      else if (e.key === 'F3') {
        e.preventDefault();
        setShowCampaignModal(true);
      }
      // F4 - İade
      else if (e.key === 'F4') {
        e.preventDefault();
        setShowReturnModal(true);
      }
      // F5 - Fiş Beklet
      else if (e.key === 'F5') {
        e.preventDefault();
        if (cart.length > 0) {
          handleParkReceipt();
        }
      }
      // F6 - Bekleyen Fişler
      else if (e.key === 'F6') {
        e.preventDefault();
        if (parkedReceipts.length > 0) {
          setShowParkedReceiptsModal(true);
        }
      }
      // F7 - Satış Geçmişi
      else if (e.key === 'F7') {
        e.preventDefault();
        setShowSalesHistoryModal(true);
      }
      // F8 - Fiş İptal
      else if (e.key === 'F8') {
        e.preventDefault();
        if (cart.length > 0) {
          clearCart();
        }
      }
      // ESC - Close modals / Focus barcode input
      else if (e.key === 'Escape') {
        barcodeInputRef.current?.focus();
      }
      // Enter - Search barcode (when not in input)
      else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, parkedReceipts, barcodeInput]);

  // Listen for last receipt event from header button
  useEffect(() => {
    const handleOpenLastReceipt = () => {
      if (sales.length > 0) {
        setShowLastReceiptModal(true);
      }
    };
    window.addEventListener('openLastReceipt', handleOpenLastReceipt);
    return () => window.removeEventListener('openLastReceipt', handleOpenLastReceipt);
  }, [sales]);

  return (
    <div className={`h-full flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
      {/* Notification */}
      {showNotification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded border ${notificationType === 'success' ? 'bg-green-50 border-green-400 text-green-700' :
          notificationType === 'error' ? 'bg-red-50 border-red-400 text-red-700' :
            notificationType === 'warning' ? 'bg-yellow-50 border-yellow-400 text-yellow-700' :
              'bg-blue-50 border-blue-400 text-blue-700'
          }`}>
          {notificationMessage}
        </div>
      )}

      {/* Missing Barcodes Modal */}
      {showMissingBarcodesModal && (
        <POSMissingBarcodesModal
          barcodes={missingBarcodes}
          onClose={() => setShowMissingBarcodesModal(false)}
          onClear={() => setMissingBarcodes([])}
        />
      )}

      {/* Main Content */}
      <div
        className={`flex-1 gap-0 overflow-hidden ${isVerticalLayout() ? '' : 'flex flex-row'}`}
        style={isVerticalLayout() ? getVerticalGridStyle() : {}}
      >
        {/* Left Side - Product List / Cart */}
        <div
          className={`${getCartWidthClass()} flex flex-col min-h-0 overflow-hidden ${isVerticalLayout() ? (layoutOrder === 'cart-top-actions-bottom' ? 'border-b' : 'border-r') : 'border-r'} ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
          style={isVerticalLayout() ? getGridArea('cart') : { order: getColumnOrder('cart') }}
        >
          {/* Search Bar */}
          <div className={`p-3 border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onFocus={() => setNumpadMode('barcode')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleBarcodeSearch();
                    }
                  }}
                  placeholder={t.barcodeSearchPlaceholder}
                  className={`w-full px-3 py-2.5 text-sm border transition-all ${numpadMode === 'barcode'
                    ? 'border-blue-400 ring-2 ring-blue-200'
                    : darkMode ? 'border-gray-600 focus:border-blue-400 bg-gray-700 text-white' : 'border-gray-300 focus:border-blue-400'
                    } ${darkMode ? 'bg-gray-700 text-white placeholder-gray-400' : ''}`}
                  autoFocus
                  ref={barcodeInputRef}
                />
              </div>
              <button
                onClick={handleBarcodeSearch}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors flex items-center gap-2"
              >
                <Search className="w-4 h-4" />
                {t.searchBtn}
              </button>
            </div>
          </div>

          {/* Product Table */}
          {cartViewMode === 'table' ? (
            <CartTable
              campaignResult={campaignResult}
              cart={cart}
              formatNumber={formatNumber}
              updateCartItemQuantity={updateCartItemQuantity}
              handleItemDiscountClick={handleItemDiscountClick}
              removeFromCart={removeFromCart}
              isAdmin={currentUser.role === 'admin'}
              updateCartItemPrice={updateCartItemPrice}
            />
          ) : (
            <CartCards
              campaignResult={campaignResult}
              cart={cart}
              formatNumber={formatNumber}
              updateCartItemQuantity={updateCartItemQuantity}
              handleItemDiscountClick={handleItemDiscountClick}
              removeFromCart={removeFromCart}
              updateCartItemVariant={updateCartItemVariant}
              onVariantPanelOpen={(index) => setVariantSelectionCartIndex(index)}
              onApplyItemDiscount={handleApplyItemDiscountByIndex}
              isAdmin={currentUser.role === 'admin'}
              updateCartItemPrice={updateCartItemPrice}
            />
          )}
        </div>

        {/* Middle - NumPad & Summary */}
        {!isNumpadHidden() && (
          <div
            className={`${getNumpadWidthClass()} flex flex-col gap-0 ${isVerticalLayout() ? 'border-r' : 'border-r'} ${isNumpadFloat() ? 'absolute right-4 bottom-4 top-20 z-40 shadow-2xl rounded-lg' : ''} ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
            style={isVerticalLayout() ? getGridArea('numpad') : { order: getColumnOrder('numpad') }}
          >
            {/* Customer Info */}
            <div className={`p-3 border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className="mb-2">
                <h3 className={`text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.customerInfo}</h3>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t.customer}:</span>
                  <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {selectedCustomer?.name || customer.name}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between px-2 py-1 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex items-center gap-1.5 grayscale opacity-70">
                    <ArrowRightLeft className="w-3 h-3 text-green-700" />
                    <span className="text-[10px] uppercase font-bold text-green-800">Güncel Kur</span>
                  </div>
                  <span className="text-xs font-black text-green-700">1$ = {exchangeRate} IQD</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-sm mb-1">
                <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>{t.productCount}:</span>
                <span className={darkMode ? 'text-white' : 'text-gray-900'}>{cart.length}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>{t.totalPieces}:</span>
                <span className={darkMode ? 'text-white' : 'text-gray-900'}>{cart.reduce((sum, item) => sum + item.quantity, 0).toFixed(0)}</span>
              </div>
            </div>

            {/* Quantity/Price Input */}
            <div className={`p-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.sales}</span>
                  <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {savedQuantity ? `${savedQuantity}x` : t.defaultQuantity}
                  </span>
                </div>
                <input
                  type="text"
                  value={savedQuantity ? t.quantitySavedBarcodeEnter.replace('{quantity}', savedQuantity.toString()) : inputValue}
                  readOnly
                  onClick={() => {
                    if (!savedQuantity) {
                      setNumpadMode('quantity');
                      barcodeInputRef.current?.blur();
                    }
                  }}
                  className={`w-full px-3 py-2 text-center text-lg focus:outline-none cursor-pointer transition-all ${savedQuantity
                    ? 'bg-orange-50 border-2 border-orange-400 ring-2 ring-orange-200 text-orange-900'
                    : numpadMode === 'quantity'
                      ? 'bg-green-50 border-2 border-green-400 ring-2 ring-green-200 text-gray-900'
                      : darkMode ? 'bg-gray-700 border border-gray-600 text-white' : 'bg-blue-50 border border-blue-200 text-gray-900'
                    }`}
                  placeholder={savedQuantity ? t.enterBarcode : t.zeroPlaceholder}
                />
              </div>

              {/* NumPad */}
              <div className="grid grid-cols-4 gap-1">
                <button
                  onClick={() => handleNumberClick('00')}
                  className={`col-span-1 border py-3 text-sm transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-white' : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-800'}`}
                >
                  00
                </button>
                <button
                  onClick={handleBarcodeButtonClick}
                  className={`col-span-1 border py-3 text-sm transition-colors flex items-center justify-center ${darkMode ? 'bg-blue-900/50 hover:bg-blue-800/50 border-blue-700 text-blue-300' : 'bg-blue-50 hover:bg-blue-100 border-blue-400 text-blue-700'}`}
                  title={t.addToCart}
                >
                  <Barcode className="w-5 h-5" />
                </button>
                <button
                  onClick={handleQuantity}
                  className={`col-span-1 border py-3 transition-colors ${darkMode ? 'bg-blue-900/50 hover:bg-blue-800/50 border-blue-700 text-blue-300' : 'bg-blue-50 hover:bg-blue-100 border-blue-400 text-blue-700'}`}
                  title={t.pcs}
                >
                  *
                </button>
                <button
                  onClick={handleDelete}
                  className={`col-span-1 border py-3 text-sm transition-colors ${darkMode ? 'bg-blue-900/50 hover:bg-blue-800/50 border-blue-700 text-blue-300' : 'bg-blue-50 hover:bg-blue-100 border-blue-400 text-blue-700'}`}
                >

                </button>

                {[7, 8, 9].map(num => (
                  <button
                    key={num}
                    onClick={() => handleNumberClick(num.toString())}
                    className={`border py-3 text-sm transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-white' : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-800'}`}
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleClear}
                  className={`border py-3 text-xs transition-colors ${darkMode ? 'bg-blue-900/50 hover:bg-blue-800/50 border-blue-700 text-blue-300' : 'bg-blue-50 hover:bg-blue-100 border-blue-400 text-blue-700'}`}
                >
                  C
                </button>

                {[4, 5, 6].map(num => (
                  <button
                    key={num}
                    onClick={() => handleNumberClick(num.toString())}
                    className={`border py-3 text-sm transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-white' : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-800'}`}
                  >
                    {num}
                  </button>
                ))}
                <button className={`border py-3 text-xs transition-colors ${darkMode ? 'bg-blue-900/50 hover:bg-blue-800/50 border-blue-700 text-blue-300' : 'bg-blue-50 hover:bg-blue-100 border-blue-400 text-blue-700'}`}>
                  {t.priceLabel}
                </button>

                {[1, 2, 3].map(num => (
                  <button
                    key={num}
                    onClick={() => handleNumberClick(num.toString())}
                    className={`border py-3 text-sm transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-white' : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-800'}`}
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleNumpadEnter}
                  className="row-span-2 bg-blue-600 hover:bg-blue-700 border border-blue-600 text-white text-sm transition-colors font-semibold flex items-center justify-center"
                >
                  <CornerDownLeft className="w-6 h-6" />
                </button>

                <button
                  onClick={() => handleNumberClick('0')}
                  className={`col-span-2 border py-3 text-sm transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-white' : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-800'}`}
                >
                  0
                </button>
                <button
                  onClick={() => handleNumberClick(',')}
                  className={`border py-3 text-sm transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-white' : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-800'}`}
                >
                  ,
                </button>
              </div>
            </div>

            {/* Total Display */}
            <div className={`flex-1 flex flex-col justify-end p-3 ${darkMode ? 'bg-gradient-to-b from-gray-800 to-gray-800/90' : 'bg-gradient-to-b from-white to-blue-50/30'}`}>
              <div className="space-y-2 text-sm">
                {/* Kampanya Bilgisi - Kampanya Adı ve İndirim Tutarı */}
                {selectedCampaign && (
                  <div className={`px-2.5 py-1.5 rounded-md flex items-center justify-between gap-2 ${darkMode ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'}`}>
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="text-xs font-medium truncate">{selectedCampaign.name}</span>
                      {selectedCampaign.autoApply && (
                        <span className="text-[10px] opacity-75">{t.automatic}</span>
                      )}
                    </div>
                    {campaignDiscount > 0 && (
                      <span className="text-xs font-semibold">-{formatNumber(campaignDiscount, 2, false)}</span>
                    )}
                  </div>
                )}

                <div className={`flex justify-between ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <span className="font-semibold">{t.subtotalLabel}</span>
                  <span className="font-semibold">{formatNumber(subtotal, 2, false)}</span>
                </div>

                {/* Kampanya İndirimi - Ara Toplamın Altında */}
                {selectedCampaign && campaignDiscount > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>{t.campaignDiscountLabel}</span>
                    <span className="font-semibold">-{formatNumber(campaignDiscount, 2, false)}</span>
                  </div>
                )}
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>{t.discountLabel}</span>
                    <span>-{formatNumber(totalDiscount, 2, true)}</span>
                  </div>
                )}
                <div className={`pt-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-blue-600" />
                      <span className={`font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t.totalLabel}</span>
                    </div>
                    <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{formatNumber(total, 2, true)}</div>
                  </div>
                </div>

                {/* Instant Profit Display */}
                <div className={`pt-2 border-t border-dashed ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between opacity-80">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.instantProfit}</span>
                    </div>
                    <div className={`text-sm font-semibold text-green-600`}>
                      {formatNumber(instantProfit, 2, true)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right Side - Quick Actions OR Variant Selection */}
        <div
          className={`${getQuickWidthClass()} flex-shrink-0 flex flex-col ${isVerticalLayout() ? (layoutOrder === 'quick-top-cart-bottom' ? 'border-b' : '') : 'border-s'} overflow-hidden relative ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
          style={isVerticalLayout() ? getGridArea('quick') : { order: getColumnOrder('quick') }}
        >
          {/* Sepet içinden varyant değiştirme - RIGHT PANEL OVERLAY */}
          {variantSelectionCartIndex !== null && cart[variantSelectionCartIndex] ? (
            <>
              {/* Backdrop blur - diğer alanları bulanıklaştır */}
              <div
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
                onClick={() => setVariantSelectionCartIndex(null)}
              />
              {/* Modal content */}
              <div className="absolute inset-0 z-50 bg-white shadow-2xl">
                <VariantSelectionPanelForCart
                  product={cart[variantSelectionCartIndex].product}
                  currentVariant={cart[variantSelectionCartIndex].variant}
                  onSelect={(variant) => {
                    updateCartItemVariant(variantSelectionCartIndex, variant);
                    setVariantSelectionCartIndex(null);
                  }}
                  onClose={() => setVariantSelectionCartIndex(null)}
                />
              </div>
            </>
          ) : null}

          {/* Barkod okutma varyant seçimi - RIGHT PANEL OVERLAY */}
          {showVariantSelection && variantSelectionProduct ? (
            <>
              {/* Backdrop blur - diğer alanları bulanıklaştır */}
              <div
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
                onClick={() => {
                  setShowVariantSelection(false);
                  setVariantSelectionProduct(null);
                }}
              />
              {/* Modal content */}
              <div className="absolute inset-0 z-50 bg-white shadow-2xl">
                <VariantSelectionPanelForCart
                  product={variantSelectionProduct}
                  currentVariant={undefined}
                  onSelect={(variant) => {
                    addToCart(variantSelectionProduct, variant);
                    setShowVariantSelection(false);
                    setVariantSelectionProduct(null);
                  }}
                  onClose={() => {
                    setShowVariantSelection(false);
                    setVariantSelectionProduct(null);
                  }}
                />
              </div>
            </>
          ) : null}

          {/* Quick Actions - Her zaman render edilir ama varyant paneli üstte overlay yapar */}
          {/* Top - Quick Product Add (Shift basılı tutarak) */}
          <div className={`p-2.5 border-b flex-shrink-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className={`text-xs mb-1.5 font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.quickProductAdd} ({t.shiftClick})</div>
            <div className="grid grid-cols-4 gap-1.5">
              {/* First 11 product slots (0-10) */}
              {Array.from({ length: 11 }).map((_, index) => {
                const slotIndex = quickProductPage * 12 + index;
                const product = quickProducts[slotIndex];
                const stock = product?.stock || 0;
                return (
                  <button
                    key={index}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        // Shift + Click: Ürün kataloğunu aç (assign-to-slot modu)
                        setSelectedQuickSlot(slotIndex);
                        setCatalogMode('assign-to-slot');
                        setShowProductCatalogModal(true);
                      } else if (product) {
                        // Debug: Ürün bilgilerini logla
                        console.log('[Quick Button] Product:', product.name);
                        console.log('[Quick Button] hasVariants:', product.hasVariants);
                        console.log('[Quick Button] variants:', product.variants);
                        console.log('[Quick Button] variants length:', product.variants?.length);

                        // Normal click: Varyant kontrolü yap
                        // Hem hasVariants flag'ini hem de variants array'ini kontrol et
                        const hasVariants = product.hasVariants || (product.variants && product.variants.length > 0);

                        if (hasVariants) {
                          // Varyantlı ürün - varyant seçim panelini aç
                          console.log('[Quick Button] Opening variant selection panel');
                          setVariantSelectionProduct(product);
                          setShowVariantSelection(true);
                        } else {
                          // Varyantsız ürün - direkt sepete ekle
                          console.log('[Quick Button] Adding to cart directly');
                          addToCart(product);
                        }
                      }
                    }}
                    className={`aspect-square border transition-all flex flex-col items-center justify-center text-xs leading-tight p-2 relative ${product
                      ? 'bg-blue-50 border-blue-400 text-blue-700 hover:bg-blue-100'
                      : 'bg-white border-gray-300 text-gray-400 hover:border-blue-400 hover:bg-blue-50'
                      }`}
                  >
                    {product ? (
                      <>
                        <div className="font-semibold truncate w-full text-center mb-1 text-[11px]">{product.name}</div>
                        <div className="text-[10px] text-blue-600 font-bold">{product.price.toFixed(2)}</div>
                        {stock !== undefined && (
                          <div className="absolute top-1 right-1 bg-blue-600 text-white text-[9px] px-1 py-0.5 leading-none font-medium">
                            {stock}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400 font-medium">{slotIndex + 1}</span>
                    )}
                  </button>
                );
              })}

              {/* 12th slot - Page selector button */}
              <button
                onClick={() => setShowPageSelectorModal(true)}
                className="aspect-square border-2 border-blue-600 bg-blue-600 hover:bg-blue-700 text-white transition-all flex flex-col items-center justify-center text-xs leading-tight p-2"
              >
                <Grid3x3 className="w-6 h-6 mb-1" />
                <div className="text-[10px] font-semibold">
                  {quickProductPage === 0
                    ? t.pageRange.replace('{start}', '1').replace('{end}', '12')
                    : quickProductPage === 1
                      ? t.pageRange.replace('{start}', '13').replace('{end}', '24')
                      : quickProductPage === 2
                        ? t.pageRange.replace('{start}', '25').replace('{end}', '36')
                        : t.pageRange.replace('{start}', '37').replace('{end}', '48')}
                </div>
              </button>
            </div>
          </div>

          {/* Bottom - Quick Action Buttons */}
          <div className="flex-1 p-2 overflow-hidden flex flex-col">
            <div className="grid grid-cols-3 gap-1.5 auto-rows-fr">
              {/* First Row - Main Actions */}
              <button
                onClick={() => setShowCampaignModal(true)}
                className={`${getButtonClass('blue')} py-4 text-xs leading-tight flex flex-col items-center justify-center gap-1 transition-all`}
              >
                <Tag className="w-5 h-5" />
                <span>{t.campaign}</span>
              </button>
              <button
                onClick={() => {
                  setCatalogMode('add-to-cart');
                  setShowProductCatalogModal(true);
                }}
                className={`${getButtonClass('blue')} py-4 text-xs leading-tight flex flex-col items-center justify-center gap-1 transition-all`}
              >
                <Search className="w-5 h-5" />
                <span>{t.productQuery}</span>
              </button>
              <button
                onClick={() => {
                  if (currentUser.role === 'admin' || hasPermission('pos.refund')) {
                    setShowReturnModal(true);
                  } else {
                    setPendingAction({ type: 'REFUND' });
                    setShowManagerAuthModal(true);
                  }
                }}
                className={`${getButtonClass('red')} py-4 text-xs leading-tight flex flex-col items-center justify-center gap-1 transition-all ${!hasPermission('pos.refund') ? 'opacity-70' : ''}`}
              >
                <RotateCcw className="w-5 h-5" />
                <span>{t.returnTransaction}</span>
              </button>

              {/* Second Row - Receipt Actions */}
              <button
                onClick={() => setShowSalesHistoryModal(true)}
                className={`${getButtonClass('blue')} py-4 text-xs leading-tight flex flex-col items-center justify-center gap-1 transition-all`}
              >
                <Receipt className="w-5 h-5" />
                <span>{t.sales}</span>
                {sales.length > 0 && <span className={`text-[10px] px-1.5 py-0.5 -mt-0.5 ${buttonColorStyle === 'outline' ? 'bg-blue-100 text-blue-600' : 'bg-blue-500 text-white'}`}>{sales.length}</span>}
              </button>
              <button
                onClick={() => setShowParkedReceiptsModal(true)}
                disabled={parkedReceipts.length === 0}
                className={`${getButtonClass('blue')} py-4 text-xs leading-tight flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Package className="w-5 h-5" />
                <span>{t.parkedReceiptsButton}</span>
                {parkedReceipts.length > 0 && <span className={`text-[10px] px-1.5 py-0.5 -mt-0.5 ${buttonColorStyle === 'outline' ? 'bg-blue-100 text-blue-600' : 'bg-blue-500 text-white'}`}>{parkedReceipts.length}</span>}
              </button>

              {/* Third Row - Cart & Customer */}
              <button
                onClick={handleParkReceipt}
                disabled={cart.length === 0}
                className={`${getButtonClass('blue')} py-4 text-xs leading-tight flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Clock className="w-5 h-5" />
                <span>{t.parkReceipt}</span>
              </button>
              <button
                onClick={() => {
                  if (currentUser.role === 'admin' || hasPermission('pos.cancel_sale')) {
                    clearCart();
                  } else {
                    setPendingAction({ type: 'CANCEL_RECEIPT' });
                    setShowManagerAuthModal(true);
                  }
                }}
                disabled={cart.length === 0}
                className={`${getButtonClass('red')} py-4 text-xs leading-tight flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${!hasPermission('pos.cancel_sale') ? 'opacity-70' : ''}`}
              >
                <X className="w-5 h-5" />
                <span>{t.cancelReceipt}</span>
              </button>
              <button
                onClick={() => {
                  const event = new CustomEvent('openCustomerModal');
                  window.dispatchEvent(event);
                }}
                className={`${getButtonClass('purple')} py-4 text-xs leading-tight flex flex-col items-center justify-center gap-1 transition-all`}
              >
                <Users className="w-5 h-5" />
                <span>{t.customer}</span>
              </button>
              <button
                onClick={() => {
                  if (isCashRegisterOpen) {
                    setShowCloseCashRegisterModal(true);
                  } else {
                    setShowOpenCashRegisterModal(true);
                  }
                }}
                className={`${getButtonClass(isCashRegisterOpen ? 'red-dark' : 'green-dark')} py-4 text-xs leading-tight flex flex-col items-center justify-center gap-1 transition-all`}
              >
                {isCashRegisterOpen ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
                <span>{isCashRegisterOpen ? t.closeRegister : t.openRegister}</span>
              </button>

              {/* 
               <button
                 onClick={() => setShowBalanceLoadModal(true)}
                 className={`${getButtonClass('purple')} py-4 text-xs leading-tight flex flex-col items-center justify-center gap-1 transition-all`}
               >
                 <Banknote className="w-4 h-4" />
                 <span>Cüzdan/Bakiye</span>
               </button>
               */}

              {/* Fourth Row - Payment */}
              <button
                onClick={handlePaymentClick}
                disabled={cart.length === 0}
                className={`col-span-3 ${getButtonClass('blue')} py-5 text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <CheckCircle className="w-5 h-5" />
                <span>{t.receivePayment.toUpperCase()}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar - Footer */}
      <div className={`bg-gradient-to-r from-gray-800 to-gray-900 text-white px-3 py-1 flex items-center justify-between text-xs border-t border-gray-700`}>
        {/* Left - Receipt Number, Store, Cash Register, Shift */}
        <div className={`flex items-center gap-3`}>
          <div className="text-blue-400 font-medium">
            {t.receiptTitle}: {receiptNumber}
          </div>
          <div className={`flex items-center gap-1.5 ${rtlMode ? 'flex-row-reverse' : ''}`}>
            <span className="text-gray-400">{t.store}:</span>
            <span className="text-white font-medium">{t.centralStore}</span>
          </div>
          <div className={`flex items-center gap-1.5 ${rtlMode ? 'flex-row-reverse' : ''}`}>
            <span className="text-gray-400">{t.cashRegister}:</span>
            <span className="text-white font-medium">{t.cashRegisterNumber}</span>
          </div>
          <div className={`flex items-center gap-1.5 ${rtlMode ? 'flex-row-reverse' : ''}`}>
            <span className="text-gray-400">{t.shift}:</span>
            <span className="text-white font-medium">{t.dayShift}</span>
          </div>
        </div>

        {/* Right - Language, Voice, Zoom, Shortcuts & Version Icon */}
        <div className="flex items-center gap-3 text-gray-300">
          <button
            onClick={() => setShowLanguageModal(true)}
            className="flex items-center gap-1.5 hover:text-blue-300 transition-colors cursor-pointer"
            title={t.language}
          >
            <Globe className="w-3 h-3 text-purple-400" />
            <span className="text-purple-400 hidden xs:inline">{t.language}</span>
          </button>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('voiceAssistantToggle'))}
            className="flex items-center gap-1.5 hover:text-blue-300 transition-colors cursor-pointer"
            title="Sesli Asistan"
          >
            <Mic className="w-3 h-3 text-indigo-400" />
            <span className="text-indigo-400 hidden xs:inline">Sesli</span>
          </button>

          <button
            onClick={onZoomClick}
            className="flex items-center gap-1.5 hover:text-blue-300 transition-colors cursor-pointer"
            title={t.screenSettings}
          >
            <Search className="w-3 h-3 text-blue-400" />
            <span className="text-blue-400 hidden xs:inline">{t.screenSettings}: {zoomLevel || 100}%</span>
          </button>

          <button
            onClick={() => setShowShortcutOverlay(!showShortcutOverlay)}
            className="flex items-center gap-1.5 hover:text-blue-300 transition-colors cursor-pointer"
            title={t.keyboardShortcutsTitle}
          >
            <Keyboard className="w-3 h-3 text-green-400" />
            <span className="text-green-400 hidden xs:inline">{t.shortcuts}</span>
          </button>

          <div className="flex items-center gap-1.5 cursor-pointer hover:text-blue-300" title={t.versionTitle}>
            <span className="w-3 h-3 text-gray-400">i</span>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showPaymentModal && (
        <POSPaymentModal
          total={total}
          subtotal={subtotal}
          itemDiscount={totalDiscount}
          campaignDiscount={campaignDiscount}
          selectedCampaign={selectedCampaign}
          selectedCustomer={selectedCustomer}
          onClose={() => setShowPaymentModal(false)}
          onComplete={handlePaymentComplete}
        />
      )}

      {showManagerAuthModal && (
        <POSManagerAuthModal
          onClose={() => {
            setShowManagerAuthModal(false);
            setPendingAction(null);
          }}
          onAuthorized={() => {
            setShowManagerAuthModal(false);

            if (!pendingAction) {
              // Default to management switch if no specific action
              const event = new CustomEvent('switchToManagement');
              window.dispatchEvent(event);
              return;
            }

            switch (pendingAction.type) {
              case 'REFUND':
                setShowReturnModal(true);
                break;
              case 'CANCEL_RECEIPT':
                if (cart.length > 0) clearCart();
                break;
              case 'DISCOUNT':
                if (cart[pendingAction.index]) {
                  setSelectedItemForDiscount(cart[pendingAction.index]);
                  setShowItemDiscountModal(true);
                }
                break;
              case 'MANAGEMENT_ACCESS':
                const event = new CustomEvent('switchToManagement');
                window.dispatchEvent(event);
                break;
            }

            setPendingAction(null);
            showNotif('Yönetici onayı başarılı', 'success');
          }}
        />
      )}

      {showParkedReceiptsModal && (
        <POSParkedReceiptsModal
          parkedReceipts={parkedReceipts}
          onRestore={handleRetrieveParkedReceipt}
          onDelete={handleDeleteParkedReceipt}
          onClose={() => setShowParkedReceiptsModal(false)}
        />
      )}

      {showSalesHistoryModal && (
        <POSSalesHistoryModal
          sales={sales}
          onClose={() => setShowSalesHistoryModal(false)}
          onPrintReceipt={(sale) => {
            // Dinamik import ile thermalPrinter modülünü yükle
            import('../../utils/thermalPrinter').then(({ printThermalReceipt }) => {
              const companyName = selectedFirma?.title || selectedFirma?.name || 'RetailOS';
              printThermalReceipt(sale, companyName);
            });
          }}
        />
      )}

      {showLastReceiptModal && (
        <POSSalesHistoryModal
          sales={sales}
          onClose={() => setShowLastReceiptModal(false)}
          autoSelectLast={true}
          onPrintReceipt={(sale) => {
            // Dinamik import ile thermalPrinter modülünü yükle
            import('../../utils/thermalPrinter').then(({ printThermalReceipt }) => {
              const companyName = selectedFirma?.title || selectedFirma?.name || 'RetailOS';
              printThermalReceipt(sale, companyName);
            });
          }}
        />
      )}

      {showReturnModal && (
        <POSReturnModal
          sales={sales}
          onClose={() => setShowReturnModal(false)}
          onReturnComplete={(returnData) => {
            showNotif(t.returnCompleted, 'success');
            setShowReturnModal(false);
          }}
        />
      )}

      {showCampaignModal && (
        <POSCampaignModal
          campaigns={campaigns}
          selectedCampaign={selectedCampaign}
          onClose={() => setShowCampaignModal(false)}
          onSelect={handleApplyCampaign}
        />
      )}

      {showCategoryModal && (
        <POSCategoryModal
          categories={categories}
          selectedCategory={selectedCategory}
          onSelect={(category) => {
            setSelectedCategory(category);
          }}
          onClose={() => setShowCategoryModal(false)}
        />
      )}

      {showStockQueryModal && (
        <POSStockQueryModal
          products={products}
          onClose={() => setShowStockQueryModal(false)}
        />
      )}

      {showCancelReasonModal && (
        <POSCancelReasonModal
          onClose={() => setShowCancelReasonModal(false)}
          onConfirm={handleCancelConfirm}
        />
      )}

      {showItemDiscountModal && selectedItemForDiscount && (
        <POSItemDiscountModal
          item={selectedItemForDiscount}
          onClose={() => {
            setShowItemDiscountModal(false);
            setSelectedItemForDiscount(null);
          }}
          onApplyDiscount={handleApplyItemDiscount}
        />
      )}

      {showProductCatalogModal && (
        <POSProductCatalogModal
          products={products}
          slotNumber={selectedQuickSlot}
          initialSearchQuery={productSearchQuery}
          onSelect={(product) => {
            const newQuickProducts = [...quickProducts];
            newQuickProducts[selectedQuickSlot] = product;
            setQuickProducts(newQuickProducts);
            setShowProductCatalogModal(false);
            setProductSearchQuery('');
            setBarcodeInput('');
            showNotif(t.productAssignedToSlot.replace('{productName}', product.name).replace('{slotNumber}', (selectedQuickSlot + 1).toString()), 'success');
          }}
          onAddToCart={(product, variant) => {
            addToCart(product, variant);
            setShowProductCatalogModal(false);
            setProductSearchQuery('');
            setBarcodeInput('');
          }}
          onClose={() => {
            setShowProductCatalogModal(false);
            setProductSearchQuery('');
            setBarcodeInput('');
          }}
          mode={catalogMode}
        />
      )}

      {showBalanceLoadModal && (
        <BalanceLoadModal onClose={() => setShowBalanceLoadModal(false)} />
      )}

      {showCloseCashRegisterModal && (
        <POSCloseCashRegisterModal
          onClose={() => setShowCloseCashRegisterModal(false)}
          sales={sales}
          currentStaff={currentStaff}
          openingCash={cashRegisterOpeningCash}
          onCashRegisterClosed={(closedCash, note) => {
            // Kasa kapatıldı - Yeni kasa açma modalını göster
            setShowCloseCashRegisterModal(false);
            setIsCashRegisterOpen(false);
            localStorage.setItem('retailos_cash_register_open', 'false');

            // Kasa kapatma kaydını localStorage'a ekle
            const closeRecord = {
              date: new Date().toISOString(),
              staff: currentStaff,
              openingCash: cashRegisterOpeningCash,
              closedCash: closedCash,
              note: note
            };
            localStorage.setItem('retailos_last_close', JSON.stringify(closeRecord));

            // Yeni kasa açma modalını göster
            setTimeout(() => {
              setShowOpenCashRegisterModal(true);
            }, 500);
          }}
          onCashHandover={(toStaff, amount, note) => {
            // Kasa devri - pending handover olarak kaydet
            const handoverData = {
              fromStaff: currentStaff,
              amount: amount,
              note: note
            };
            setPendingHandover(handoverData);
            localStorage.setItem('retailos_pending_handover', JSON.stringify(handoverData));

            // Kasayı kapat
            setShowCloseCashRegisterModal(false);
            setIsCashRegisterOpen(false);
            localStorage.setItem('retailos_cash_register_open', 'false');

            // Bilgilendirme
            alert(t.cashHandedOverMessage.replace('{staff}', toStaff).replace('{amount}', amount.toFixed(2)));
          }}
        />
      )}

      {showOpenCashRegisterModal && (
        <POSOpenCashRegisterModal
          onClose={() => setShowOpenCashRegisterModal(false)}
          currentStaff={currentStaff}
          pendingHandover={pendingHandover}
          onOpenRegister={(openingCash, note) => {
            // Kasayı aç
            setCashRegisterOpeningCash(openingCash);
            setIsCashRegisterOpen(true);
            localStorage.setItem('retailos_opening_cash', openingCash.toString());
            localStorage.setItem('retailos_cash_register_open', 'true');

            // Kasa açma kaydını localStorage'a ekle
            const openRecord = {
              date: new Date().toISOString(),
              staff: currentStaff,
              openingCash: openingCash,
              note: note
            };
            localStorage.setItem('retailos_last_open', JSON.stringify(openRecord));

            // Eğer devir varsa temizle
            if (pendingHandover) {
              setPendingHandover(null);
              localStorage.removeItem('retailos_pending_handover');
            }

            setShowOpenCashRegisterModal(false);
            alert(t.cashOpenedMessage.replace('{amount}', openingCash.toFixed(2)).replace('{staff}', currentStaff));
          }}
        />
      )}

      {showPageSelectorModal && (
        <POSPageSelectorModal
          currentPage={quickProductPage}
          onSelectPage={(page) => setQuickProductPage(page)}
          onClose={() => setShowPageSelectorModal(false)}
        />
      )}

      {/* Language Modal */}
      {showLanguageModal && (
        <LanguageSelectionModal
          onClose={() => setShowLanguageModal(false)}
          rtlMode={rtlMode}
          setRtlMode={setRtlMode || (() => { })}
        />
      )}

      {/* Keyboard Shortcuts Overlay */}
      {showShortcutOverlay && (
        <KeyboardShortcutOverlay
          shortcuts={keyboardShortcuts}
          onClose={() => setShowShortcutOverlay(false)}
        />
      )}

      {/* Receipt Modal (80mm) */}
      {showReceiptModal && completedSale && completedPaymentData && (
        <Receipt80mm
          sale={completedSale}
          paymentData={completedPaymentData}
          onClose={() => {
            setShowReceiptModal(false);
            setCompletedSale(null);
            setCompletedPaymentData(null);
          }}
        />
      )}

      {/* Keyboard Shortcut Hint (floating button) */}

    </div>
  );
}


