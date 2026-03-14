import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { FileText, Plus, Search, X, Save, User, MoreVertical, Barcode, AlertCircle, CheckCircle2, Calendar, Truck, Package, Clock, ChevronDown, ChevronRight, History, TrendingUp, TrendingDown, Percent, MoreHorizontal, Trash2, Settings, Minus, Square, Filter, ChevronUp, Check, Printer, PlusCircle, ArrowRight, ArrowLeft, RefreshCw, BarChart2, Edit3, Clipboard, ExternalLink } from 'lucide-react';
import { moduleTranslations, type Language } from '../../../locales/module-translations';
import { useLanguage } from '../../../contexts/LanguageContext';
import { InvoiceItemsGrid } from './InvoiceItemsGrid';
import { InvoiceHeader } from './InvoiceHeader';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { useAutoJournal, formatJournalResult } from '../../../hooks/useAutoJournal';
import { toast } from 'sonner';
import { formatNumber } from '../../../utils/formatNumber';
import { DocumentManager } from '../../shared/DocumentManager';
import { printInvoice } from '../../../utils/printUtils';
import type { Invoice } from '../../../core/types';
import { ProductHistoryModal } from '../purchase/PurchaseInvoiceLineEnhanced';
import { SupplierHistoryModal } from '../contacts/SupplierHistoryModal';
import { ColumnVisibilityMenu } from '../../shared/ColumnVisibilityMenu';
import { batchCalculateFIFOCost } from '../../../hooks/useFIFOCost';
import { CostAccountingService } from '../../../services/costAccountingService';
import { POSProductCatalogModal } from '../../pos/POSProductCatalogModal';
import { useProductStore } from '../../../store/useProductStore';
import type { Customer, Product } from '../../../App';
import { InvoiceEditDateModal } from './InvoiceEditDateModal';
import { InvoiceSpecialCodeModal } from './InvoiceSpecialCodeModal';
import { InvoiceTradingGroupModal } from './InvoiceTradingGroupModal';
import { InvoiceAuthorizationModal } from './InvoiceAuthorizationModal';
import { InvoicePaymentInfoModal } from './InvoicePaymentInfoModal';
import { InvoiceWorkplaceModal } from './InvoiceWorkplaceModal';
import { InvoiceWarehouseModal } from './InvoiceWarehouseModal';
import { InvoiceSalespersonModal } from './InvoiceSalespersonModal';
import { useCampaignStore } from '../../../store/useCampaignStore';
import { priceChangeVouchersAPI } from '../../../services/api/priceChangeVouchers';
import { supplierAPI, type Supplier } from '../../../services/api/suppliers';
import { customerAPI } from '../../../services/api/customers';
import { invoicesAPI } from '../../../services/api/index';
import { serviceAPI, Service } from '../../../services/serviceAPI';
import { postgres } from '../../../services/postgres';
import { productAPI } from '../../../services/api/products';
import { currencyAPI, exchangeRateAPI, type Currency, type ExchangeRate } from '../../../services/api/masterData';

// Electron API tip tanımı
declare global {
  interface Window {
    electronAPI?: {
      printer?: {
        print: (data: any) => Promise<{ success: boolean }>;
      };
      isElectron?: boolean;
      app?: {
        getVersion: () => Promise<string>;
        getPlatform: () => Promise<string>;
      };
    };
  }
}

interface InvoiceType {
  code: number;
  name: string;
  category: 'Satis' | 'Alis' | 'Iade' | 'Irsaliye' | 'Siparis' | 'Teklif' | 'Hizmet';
  color: string;
}

interface InvoiceItem {
  id: string;
  type: string;
  code: string;
  description: string;
  description2: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  amount: number; // Brüt
  netAmount: number;
  // Alış faturası için ekstra alanlar
  expiryDate?: string;
  lastPurchasePrice?: number; // Son alış fiyatı
  priceDifference?: number; // Fiyat farkı (şimdiki - önceki)
  priceDifferencePercent?: number; // % fiyat farkı
  profitMarginPercent?: number; // Kar marjı % (alış fiyatına göre)
  // İrsaliye için ekstra alanlar
  batchNo?: string;
  productionDate?: string;
  // MALİYET VE KAR ANALİZİ ALANLARI (SQL sorgularını minimize etmek için)
  unitCost?: number; // Birim maliyet (FIFO/LIFO'dan gelecek)
  totalCost?: number; // Toplam maliyet (quantity * unitCost)
  grossProfit?: number; // Brüt kar (netAmount - totalCost)
  profitMargin?: number; // Kar marjı % ((grossProfit / netAmount) * 100)
  cogs?: number; // Cost of Goods Sold (Satış maliyeti - satış faturaları için)
  // Birim seti & çarpan (ambalaj hiyerarşisi)
  unitsetId?: string;    // Ürünün birim setinin ID'si
  multiplier?: number;   // Seçili birimin conv_fact1 değeri (örn. KOLI=24)
  baseQuantity?: number; // quantity * multiplier → stok güncellemesi için
  // Döviz
  unitPriceFC?: number;  // Fatura dövizindeki orijinal birim fiyat
}

interface UniversalInvoiceFormProps {
  invoiceType: InvoiceType;
  customers?: Customer[];
  products?: Product[];
  onClose: () => void;
  editData?: any; // Düzenleme için fatura verisi
}

// Mock Products - lastPurchasePrice eklendi
const mockProducts = [
  { code: 'GID-001', name: 'Süt 1L', unit: 'Adet', price: 3500, vat: 0, barcode: '8690000000001', lastPurchasePrice: 3200 },
  { code: 'GID-002', name: 'Ekmek Beyaz', unit: 'Adet', price: 1500, vat: 0, barcode: '8690000000002', lastPurchasePrice: 1400 },
  { code: 'GID-003', name: 'Pirinç 1Kg', unit: 'Kg', price: 4000, vat: 0, barcode: '8690000000003', lastPurchasePrice: 3800 },
  { code: 'GID-004', name: 'Yağ 1L', unit: 'Litre', price: 8500, vat: 0, barcode: '8690000000004', lastPurchasePrice: 8200 },
  { code: 'GID-005', name: 'Şeker 1Kg', unit: 'Kg', price: 3000, vat: 0, barcode: '8690000000005', lastPurchasePrice: 2800 },
];

export function UniversalInvoiceForm({ invoiceType, customers: customersProp = [], products: productsProp = [], onClose, editData }: UniversalInvoiceFormProps) {
  const { language, tm } = useLanguage();

  const { selectedFirm, selectedPeriod, selectedBranch, selectedWarehouse } = useFirmaDonem();
  // Alias for backward compatibility with existing code
  const selectedFirma = selectedFirm;
  const selectedDonem = selectedPeriod;

  const firmId = selectedFirm?.logicalref;
  const periodId = selectedPeriod?.logicalref;
  const storeProducts = useProductStore((state) => state.products);
  const campaigns = useCampaignStore((state) => state.campaigns || []);

  const { isReady, createSalesJournal, createPurchaseJournal } = useAutoJournal();

  // Transaction validation logic
  const isTransactionAllowed = (date: Date | string, type?: string) => {
    if (!selectedFirm || !selectedPeriod) return false;

    // If period is explicitly inactive, deny
    if (selectedPeriod.active === false) return false;

    // Validate dates if they exist
    if (selectedPeriod.beg_date && selectedPeriod.end_date) {
      try {
        const targetDate = typeof date === 'string' ? new Date(date) : date;
        const begDate = new Date(selectedPeriod.beg_date);
        const endDate = new Date(selectedPeriod.end_date);

        // If dates are valid, check range
        if (!isNaN(begDate.getTime()) && !isNaN(endDate.getTime())) {
          return targetDate >= begDate && targetDate <= endDate;
        }
      } catch (e) {
        console.error('[UniversalInvoiceForm] Date validation error:', e);
      }
    }

    // Fallback: If dates are missing or invalid but period is active, allow
    return selectedPeriod.active;
  };

  // Products prop varsa onu kullan, yoksa store'dan al
  const products = productsProp.length > 0 ? productsProp : storeProducts;

  // Suppliers ve Customers state - Veritabanından çekilecek
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>(customersProp);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [services, setServices] = useState<Service[]>([]); // Services state

  // API fetches for dropdowns
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [latestRates, setLatestRates] = useState<ExchangeRate[]>([]);

  const [activeTab, setActiveTab] = useState<'fatura' | 'detaylar' | 'detaylarII' | 'ekliDosyalar'>('fatura');
  const [saving, setSaving] = useState(false);

  // Form States - Her fatura türü için ortak
  const [cashRegister, setCashRegister] = useState('001.01 Baghdad Central Kasa');
  const [invoiceNo, setInvoiceNo] = useState(() => {
    if (editData?.invoice_no) {
      return editData.invoice_no;
    }
    return `${new Date().toISOString().split('T')[0].replace(/-/g, '')}${Math.floor(Math.random() * 1000000)}`;
  });
  const [editDate, setEditDate] = useState(() => {
    if (editData?.invoice_date) {
      return new Date(editData.invoice_date).toLocaleDateString(tm('localeCode'));
    }
    return new Date().toLocaleDateString(tm('localeCode'));
  });
  const [transactionNo, setTransactionNo] = useState('0000004');
  const [transactionDate, setTransactionDate] = useState(() => {
    if (editData?.invoice_date) {
      return new Date(editData.invoice_date).toLocaleDateString(tm('localeCode'));
    }
    return new Date().toLocaleDateString(tm('localeCode'));
  });
  const [specialCode, setSpecialCode] = useState('');
  const [tradingGroup, setTradingGroup] = useState('');

  // Cari hesap (Müşteri/Tedarikçi)
  // customerCode aslında customer_id veya customer_code olabilir
  // customerId gerçek ID'yi saklar, customerCode görüntüleme için kullanılır
  const [customerId, setCustomerId] = useState(() => editData?.customer_id || '');
  const [customerCode, setCustomerCode] = useState(() => {
    if (editData?.customer_code) return editData.customer_code;
    if (editData?.customer_id && customers.length > 0) {
      const customer = customers.find(c => c.id === editData.customer_id);
      return customer ? ((customer as any).code || '') : '';
    }
    return '';
  });
  const [customerTitle, setCustomerTitle] = useState(() => editData?.customer_name || '');
  const [supplierCode, setSupplierCode] = useState(() => editData?.supplier_code || '');
  const [supplierId, setSupplierId] = useState(() => editData?.supplier_id || '');
  const [supplierTitle, setSupplierTitle] = useState(() => editData?.supplier_name || '');
  const [customerBarcode, setCustomerBarcode] = useState(''); // Cari Hesap Barkodu

  // Fatura türüne özel alanlar
  const [referenceInvoiceNo, setReferenceInvoiceNo] = useState(''); // İade için
  const [returnReason, setReturnReason] = useState(''); // İade nedeni
  const [shippingAddress, setShippingAddress] = useState(''); // İrsaliye/Sipariş için
  const [vehicleInfo, setVehicleInfo] = useState(''); // İrsaliye için
  const [driverName, setDriverName] = useState(''); // İrsaliye için
  const [driverPhone, setDriverPhone] = useState(''); // İrsaliye için - şoför telefon
  const [deliveryDate, setDeliveryDate] = useState(''); // Sipariş/İrsaliye için
  const [validUntil, setValidUntil] = useState(''); // Teklif/Vade tarihi için
  const [orderDate, setOrderDate] = useState(''); // Sipariş için
  const [dueDate, setDueDate] = useState(''); // Satış faturası vade tarihi
  const [paymentMethod, setPaymentMethod] = useState(''); // Ödeme şekli (boşsa açık hesap/cari olarak işlem görür)
  const [cashierName, setCashierName] = useState(() => editData?.cashier || ''); // Kasiyer (perakende için)
  const [warehouse, setWarehouse] = useState('000, Merkez'); // Depo (Ambar)
  const [fromWarehouse, setFromWarehouse] = useState(''); // Çıkış deposu (Transfer)
  const [toWarehouse, setToWarehouse] = useState(''); // Giriş deposu (Transfer)
  const [consignmentCommission, setConsignmentCommission] = useState(0); // Konsinye komisyon %
  const [consignmentDeliveryDate, setConsignmentDeliveryDate] = useState(''); // Konsinye teslim tarihi
  const [taxRate, setTaxRate] = useState(0); // TAX oranı (Alış için)
  const [expenseAmount, setExpenseAmount] = useState(0); // Masraf tutarı (Alış için)
  const [approvalStatus, setApprovalStatus] = useState('BEKLEMEDE'); // Onay durumu (Sipariş/Teklif)
  const [approvalDate, setApprovalDate] = useState(''); // Onay tarihi

  // Logo formatına uygun ek alanlar
  const [documentNo, setDocumentNo] = useState(''); // Belge No
  const [workplace, setWorkplace] = useState('000, Merkez'); // İşyeri
  const [salespersonCode, setSalespersonCode] = useState(''); // Satış Elemanı Kodu
  const [authorizationCode, setAuthorizationCode] = useState(''); // Yetki Kodu
  const [currency, setCurrency] = useState(() => (editData as any)?.currency || selectedFirm?.ana_para_birimi || 'IQD'); // Döviz
  const [currencyRate, setCurrencyRate] = useState(() => parseFloat((editData as any)?.currency_rate) || 1); // Kuru
  const [reportingCurrency, setReportingCurrency] = useState('USD'); // Raporlama Dövizi
  const [reportingCurrencyRate, setReportingCurrencyRate] = useState(1); // Raporlama Döviz Kuru
  const [valuationRate, setValuationRate] = useState(1); // Değerleme Kuru
  const [currencyRateType, setCurrencyRateType] = useState('Satış'); // Kur Türü (Alış, Satış, Efektif Alış, Efektif Satış)
  const [isCurrencyTransaction, setIsCurrencyTransaction] = useState(false); // Dövizli İşlem Checkbox
  const [unitSets, setUnitSets] = useState<any[]>([]); // Birim setleri
  const [transactionType, setTransactionType] = useState(''); // İşlem
  const [shippingAccountCode, setShippingAccountCode] = useState(''); // Sevkiyat Hesabı Kodu
  const [shippingAccountTitle, setShippingAccountTitle] = useState(''); // Sevkiyat Hesabı Ünvanı
  const [shippingAddressCode, setShippingAddressCode] = useState(''); // Sevkiyat Adresi Kodu
  const [shippingAddressDesc, setShippingAddressDesc] = useState(''); // Sevkiyat Adresi Açıklaması
  const [waybillType, setWaybillType] = useState(''); // İrsaliye Türü
  const [waybillNo, setWaybillNo] = useState(''); // İrsaliye No
  const [waybillDocumentNo, setWaybillDocumentNo] = useState(''); // İrsaliye Belge No
  const [description, setDescription] = useState(''); // Açıklama
  const [creditAmount, setCreditAmount] = useState(0); // Alacak/Borç Tutarı
  const [documentTrackingNo, setDocumentTrackingNo] = useState(''); // Doküman İzleme Numarası
  const [paymentType, setPaymentType] = useState('İşlem Yapılmayacak'); // Ödeme Tipi
  const [isElectronicDoc, setIsElectronicDoc] = useState(false); // Elektronik Belge
  const [receiptType, setReceiptType] = useState(''); // Dekont Türü
  const [transactionStatus, setTransactionStatus] = useState('Operation Completed'); // İşlem Statüsü
  const [creditCardNo, setCreditCardNo] = useState(''); // Kredi Kart No
  const [serialNo, setSerialNo] = useState(''); // Seri No
  const [deliveryCode, setDeliveryCode] = useState(''); // Teslimat Kodu
  const [isDeposit, setIsDeposit] = useState(false); // Emanet
  const [isTransfer, setIsTransfer] = useState(false); // Devir
  const [campaignCode, setCampaignCode] = useState(''); // Kampanya Kodu
  const [returnTransactionType, setReturnTransactionType] = useState(''); // İade Hakkı Doğuran İşlem Türü
  const [isTaxFree, setIsTaxFree] = useState(false); // Tax Free
  const [affectCollateralRisk, setAffectCollateralRisk] = useState(false); // Teminat Riskini Etkileyecek
  const [affectRisk, setAffectRisk] = useState(false); // Riski Etkileyecek
  const [time, setTime] = useState(new Date().toLocaleTimeString(tm('localeCode'), { hour: '2-digit', minute: '2-digit', second: '2-digit' })); // Zaman
  const [distributedTotal, setDistributedTotal] = useState(0); // Dağılacak Toplam

  // Items
  // EditData varsa items'ı yükle
  const initializeItems = (): InvoiceItem[] => {
    if (editData?.items && editData.items.length > 0) {
      return editData.items.map((item: any, index: number) => ({
        id: item.id || `item-${index}`,
        type: 'Malzeme',
        code: item.code || item.productId || '',
        description: item.description || item.productName || '',
        description2: '',
        quantity: item.quantity || 0,
        unit: item.unit || 'Adet',
        unitPrice: item.unitPrice || item.price || 0,
        discountPercent: item.discountPercent || item.discount || 0,
        discountAmount: item.discountAmount || 0,
        amount: item.amount || (item.quantity * (item.unitPrice || item.price)) || 0,
        netAmount: item.netAmount || item.total || 0,
        lastPurchasePrice: item.lastPurchasePrice,
        priceDifference: item.priceDifference,
        priceDifferencePercent: item.priceDifferencePercent,
        unitsetId: item.unitsetId || item.unitset_id,
        multiplier: item.multiplier || item.unit_multiplier || 1,
        baseQuantity: item.baseQuantity || item.base_quantity || item.quantity,
      }));
    }
    return [{
      id: '1',
      type: 'Malzeme',
      code: '',
      description: '',
      description2: '',
      quantity: 0,
      unit: 'Brüt',
      unitPrice: 0,
      discountPercent: 0,
      discountAmount: 0,
      amount: 0,
      netAmount: 0
    }];
  };

  const [items, setItems] = useState<InvoiceItem[]>(initializeItems());
  const [barcodeInput, setBarcodeInput] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProductIndex, setSelectedProductIndex] = useState(-1);
  const [searchingRowIndex, setSearchingRowIndex] = useState(-1);
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [customerSearchModal, setCustomerSearchModal] = useState('');
  const [supplierSearchModal, setSupplierSearchModal] = useState('');
  const [showCashRegisterDropdown, setShowCashRegisterDropdown] = useState(false);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [showProductHistoryModal, setShowProductHistoryModal] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<{ code: string; name: string; id: string } | null>(null);
  const [bulkPriceIncreasePercent, setBulkPriceIncreasePercent] = useState<number | ''>('');
  const [showProductCatalogModal, setShowProductCatalogModal] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [totalGrossProfit, setTotalGrossProfit] = useState(0);
  const [profitMargin, setProfitMargin] = useState(0);

  // Global Supplier History
  const [showSupplierHistory, setShowSupplierHistory] = useState(false);
  const [selectedSupplierHistory, setSelectedSupplierHistory] = useState<{ id: string, name: string } | null>(null);

  // Column visibility for invoice items grid
  const [itemColumnVisibility, setItemColumnVisibility] = useState(() => {
    const saved = localStorage.getItem('invoiceItemColumnVisibility');
    return saved ? JSON.parse(saved) : {
      type: true,
      code: true,
      description: true,
      description2: true,
      quantity: true,
      unit: true,
      unitPrice: true,
      discountPercent: true,
      discountAmount: true,
      profitMarginPercent: true,
      expiryDate: true,
      batchNo: true,
      profit: true,
      amount: true,
      netAmount: true,
    };
  });

  const populateFromVoiceData = (data: any) => {
    if (data.supplier_name) setSupplierTitle(data.supplier_name);
    if (data.customer_name) setCustomerTitle(data.customer_name);
    if (data.notes) setDescription(data.notes);

    if (data.items && Array.isArray(data.items)) {
      const newItems = data.items.map((item: any, index: number) => {
        const qty = item.quantity || 1;
        const price = item.price || item.unitPrice || 0;
        return {
          id: `voice-${Date.now()}-${index}`,
          type: tm('material'),
          code: item.code || '',
          description: item.name || item.description || '',
          description2: '',
          quantity: qty,
          unit: item.unit || tm('piece'),
          unitPrice: price,
          discountPercent: 0,
          amount: qty * price,
          netAmount: qty * price
        };
      });
      setItems(newItems);
      toast.success(tm('visionDataTransferredToForm'));
    }
  };

  useEffect(() => {
    const handleVoiceNavigate = (e: any) => {
      const { formData } = e.detail;
      if (formData) {
        populateFromVoiceData(formData);
      }
    };

    const savedData = sessionStorage.getItem('voiceCommandFormData');
    if (savedData) {
      try {
        const formData = JSON.parse(savedData);
        populateFromVoiceData(formData);
        sessionStorage.removeItem('voiceCommandFormData');
      } catch (e) {
        console.error('Error parsing voice data', e);
      }
    }

    window.addEventListener('voiceCommandNavigate', handleVoiceNavigate as EventListener);
    return () => window.removeEventListener('voiceCommandNavigate', handleVoiceNavigate as EventListener);
  }, []);

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [currData, rateData] = await Promise.all([
          currencyAPI.getAll(),
          exchangeRateAPI.getLatestRates()
        ]);
        setCurrencies(currData);
        setLatestRates(rateData);
      } catch (e) {
        console.error('Error fetching master data for invoice:', e);
      }
    };
    fetchMasterData();
  }, []);

  // Update rate when currency changes
  useEffect(() => {
    if (currency === 'IQD') {
      setCurrencyRate(1);
    } else {
      const rate = latestRates.find(r => r.currency_code === currency);
      if (rate) {
        setCurrencyRate(rate.sell_rate || rate.buy_rate || 1);
      }
    }
  }, [currency, latestRates]);

  // Load Services
  useEffect(() => {
    const loadServices = async () => {
      try {
        const data = await serviceAPI.getAll();
        setServices(data);
      } catch (error) {
        console.error('[UniversalInvoice] Error loading services:', error);
      }
    };
    loadServices();
  }, []);

  // Load Unit Sets (birim setleri - ambalaj hiyerarşisi için)
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
        console.error('[UniversalInvoice] Unit sets load failed:', err);
      }
    };
    loadUnitSets();
  }, []);

  // Lookup Effect for Customer Code
  useEffect(() => {
    if (customerCode && customerCode.length >= 3) {
      const timer = setTimeout(async () => {
        // Only lookup if code is different from current customer's code
        const currentCustomer = customers.find(c => c.id === customerId);
        if (currentCustomer && currentCustomer.code === customerCode) return;

        try {
          const rows = await customerAPI.getAll();
          const found = rows.find((c: Customer) => (c as any).code === customerCode);
          if (found) {
            setCustomerId(found.id);
            setCustomerTitle(found.name);
          }
        } catch (err) {
          console.error('[UniversalInvoice] Customer lookup failed:', err);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [customerCode]);

  // Lookup Effect for Supplier Code
  useEffect(() => {
    if (supplierCode && supplierCode.length >= 3) {
      const timer = setTimeout(async () => {
        // Find existing supplier in the local list first
        const found = suppliers.find(s => s.code === supplierCode);
        if (found) {
          setSupplierTitle(found.name);
          return;
        }

        try {
          const fetched = await supplierAPI.getByCode(supplierCode);
          if (fetched) {
            setSupplierTitle(fetched.name);
          }
        } catch (err) {
          console.error('[UniversalInvoice] Supplier lookup failed:', err);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [supplierCode, suppliers]);

  const isColumnVisible = (columnId: string) => {
    return itemColumnVisibility[columnId] !== false;
  };

  const itemColumns = useMemo(() => [
    { id: 'type', label: tm('type'), visible: isColumnVisible('type') },
    { id: 'code', label: tm('code'), visible: isColumnVisible('code') },
    { id: 'description', label: tm('description'), visible: isColumnVisible('description') },
    { id: 'description2', label: tm('description2'), visible: isColumnVisible('description2') },
    { id: 'quantity', label: tm('quantity'), visible: isColumnVisible('quantity') },
    { id: 'unit', label: tm('unit'), visible: isColumnVisible('unit') },
    { id: 'unitPrice', label: tm('price'), visible: isColumnVisible('unitPrice') },
    { id: 'discountPercent', label: tm('discountPercent'), visible: isColumnVisible('discountPercent') },
    { id: 'discountAmount', label: tm('discountAmount'), visible: isColumnVisible('discountAmount') },
    { id: 'amount', label: tm('gross'), visible: isColumnVisible('amount') },
    ...(invoiceType.category === 'Alis' ? [{ id: 'profitMarginPercent', label: tm('profitPercent'), visible: isColumnVisible('profitMarginPercent') }] : []),
    ...(invoiceType.category === 'Alis' || invoiceType.category === 'Irsaliye' || (invoiceType.category === 'Satis' && invoiceType.code === 1) ? [{ id: 'expiryDate', label: tm('expiryDate'), visible: isColumnVisible('expiryDate') }] : []),
    ...(invoiceType.category === 'Irsaliye' ? [{ id: 'batchNo', label: tm('batchNo'), visible: isColumnVisible('batchNo') }] : []),
    ...(invoiceType.category === 'Satis' ? [{ id: 'profit', label: tm('profit'), visible: isColumnVisible('profit') }] : []),
    { id: 'netAmount', label: tm('net'), visible: isColumnVisible('netAmount') },
  ], [itemColumnVisibility, invoiceType, tm]);

  const handleToggleColumn = (columnId: string) => {
    setItemColumnVisibility((prev: any) => ({
      ...prev,
      [columnId]: !prev[columnId]
    }));
  };

  const handleShowAllColumns = () => {
    const allVisible = Object.keys(itemColumnVisibility).reduce((acc, key) => ({
      ...acc,
      [key]: true
    }), {});
    setItemColumnVisibility(allVisible);
  };

  const handleHideAllColumns = () => {
    const allHidden = Object.keys(itemColumnVisibility).reduce((acc, key) => ({
      ...acc,
      [key]: false
    }), {});
    setItemColumnVisibility(allHidden);
  };

  // Modal states for ellipsis buttons
  const [showEditDateModal, setShowEditDateModal] = useState(false);
  const [showTransactionDateModal, setShowTransactionDateModal] = useState(false);
  const [showSpecialCodeModal, setShowSpecialCodeModal] = useState(false);
  const [showTradingGroupModal, setShowTradingGroupModal] = useState(false);
  const [showAuthorizationModal, setShowAuthorizationModal] = useState(false);
  const [showPaymentInfoModal, setShowPaymentInfoModal] = useState(false);
  const [showWorkplaceModal, setShowWorkplaceModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [showSalespersonModal, setShowSalespersonModal] = useState(false);
  const [showShippingAccountModal, setShowShippingAccountModal] = useState(false);
  const [showShippingAddressModal, setShowShippingAddressModal] = useState(false);
  const [showDeliveryCodeModal, setShowDeliveryCodeModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showReturnTransactionTypeModal, setShowReturnTransactionTypeModal] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const gridRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const cashRegisterDropdownRef = useRef<HTMLDivElement>(null);

  // Header renk belirleme
  const getHeaderColor = () => {
    switch (invoiceType.category) {
      case 'Satis': return { gradient: 'from-blue-600 to-blue-700', solid: 'bg-blue-600' };
      case 'Alis': return { gradient: 'from-teal-600 to-teal-700', solid: 'bg-teal-600' };
      case 'Hizmet':
        // Hizmet faturaları için: Verilen (code 7) -> mavi, Alınan (code 8) -> teal
        if (invoiceType.code === 7) {
          return { gradient: 'from-blue-600 to-blue-700', solid: 'bg-blue-600' };
        } else if (invoiceType.code === 8) {
          return { gradient: 'from-teal-600 to-teal-700', solid: 'bg-teal-600' };
        }
        return { gradient: 'from-indigo-600 to-indigo-700', solid: 'bg-indigo-600' };
      case 'Iade': return { gradient: 'from-red-600 to-red-700', solid: 'bg-red-600' };
      case 'Irsaliye': return { gradient: 'from-orange-600 to-orange-700', solid: 'bg-orange-600' };
      case 'Siparis': return { gradient: 'from-purple-600 to-purple-700', solid: 'bg-purple-600' };
      case 'Teklif': return { gradient: 'from-indigo-600 to-indigo-700', solid: 'bg-indigo-600' };
      default: return { gradient: 'from-gray-600 to-gray-700', solid: 'bg-gray-600' };
    }
  };

  // Cari hesap border rengi
  const getCariBorderColor = () => {
    switch (invoiceType.category) {
      case 'Satis': return 'border-blue-600 bg-blue-50';
      case 'Alis': return 'border-teal-600 bg-teal-50';
      case 'Hizmet':
        // Hizmet faturaları için: Verilen (code 7) -> mavi, Alınan (code 8) -> teal
        if (invoiceType.code === 7) {
          return 'border-blue-600 bg-blue-50';
        } else if (invoiceType.code === 8) {
          return 'border-teal-600 bg-teal-50';
        }
        return 'border-indigo-600 bg-indigo-50';
      case 'Iade': return 'border-red-600 bg-red-50';
      case 'Irsaliye': return 'border-orange-600 bg-orange-50';
      case 'Siparis': return 'border-purple-600 bg-purple-50';
      case 'Teklif': return 'border-indigo-600 bg-indigo-50';
      default: return 'border-gray-600 bg-gray-50';
    }
  };

  // Cari hesap text rengi
  const getCariTextColor = () => {
    switch (invoiceType.category) {
      case 'Satis': return 'text-blue-600';
      case 'Alis': return 'text-teal-600';
      case 'Hizmet':
        // Hizmet faturaları için: Verilen (code 7) -> mavi, Alınan (code 8) -> teal
        if (invoiceType.code === 7) {
          return 'text-blue-600';
        } else if (invoiceType.code === 8) {
          return 'text-teal-600';
        }
        return 'text-indigo-600';
      case 'Iade': return 'text-red-600';
      case 'Irsaliye': return 'text-orange-600';
      case 'Siparis': return 'text-purple-600';
      case 'Teklif': return 'text-indigo-600';
      default: return 'text-gray-600';
    }
  };

  // Barkod okutma
  const handleBarcodeSubmit = async () => {
    if (!barcodeInput.trim()) return;

    const barcode = barcodeInput.trim();
    try {
      const result = await productAPI.lookupByBarcode(barcode);

      if (result && result.product) {
        const product = result.product;
        const unitInfo = result.unitInfo;

        if (items.length > 0 && currentRowIndex >= 0) {
          const updatedItems = [...items];
          const item = updatedItems[currentRowIndex];
          item.code = product.code;
          item.description = product.name;
          
          // Birim ve Fiyat Belirleme
          const isPurchase = invoiceType.category === 'Alis';
          const systemUsdRate = latestRates.find(r => r.currency_code === 'USD')?.sell_rate || currencyRate || 1;
          const effectiveRate = product.customExchangeRate || 0;
          let finalRate = effectiveRate > 0 ? effectiveRate : systemUsdRate;
          
          // IQD Scaling Logic: If rate is small (e.g., 1.54), scale by 1000
          if (finalRate > 0 && finalRate < 10) {
            finalRate = finalRate * 1000;
          }
          
          const isAutoCalc = product.autoCalculateUSD;

          if (unitInfo) {
            item.unit = unitInfo.unit || unitInfo.unit_code;
            
            // Birim çarpanını bul
            let unitMult = unitInfo.multiplier || 1;
            
            // Eğer veritabanından çarpan gelmediyse (veya 1 ise) ve birim Adet değilse birim setinden bak
            const pUnitsetId = product.unitsetId || (product as any).unitset_id;
            if (unitMult === 1 && item.unit !== 'Adet' && pUnitsetId) {
              const unitSet = unitSets.find((us: any) => us.id === pUnitsetId);
              const line = unitSet?.lines?.find((l: any) => l.name === item.unit || l.code === item.unit);
              if (line) {
                unitMult = parseFloat(line.conv_fact1) || 1;
              }
            }
            
            item.multiplier = unitMult;

            // Fiyat Belirleme Mantığı
            let resolvedPrice = 0;
            if (isPurchase) {
              resolvedPrice = (unitInfo.purchase_price > 0) ? unitInfo.purchase_price : 0;
              if (resolvedPrice === 0 && isAutoCalc) {
                const usdPurchasePrice = (product as any).purchasePriceUSD || (product as any).purchase_price_usd || 0;
                if (usdPurchasePrice > 0) {
                  resolvedPrice = Math.round(usdPurchasePrice * finalRate * unitMult);
                }
              }
              if (resolvedPrice === 0) {
                resolvedPrice = ((product as any).cost || (product as any).lastPurchasePrice || 0) * unitMult;
              }
            } else {
              resolvedPrice = (unitInfo.sale_price > 0) ? unitInfo.sale_price : 0;
              if (resolvedPrice === 0 && isAutoCalc) {
                const usdSalePrice = (product as any).salePriceUSD || (product as any).sale_price_usd || 0;
                if (usdSalePrice > 0) {
                  resolvedPrice = Math.round(usdSalePrice * finalRate * unitMult);
                }
              }
              if (resolvedPrice === 0) {
                resolvedPrice = product.price * unitMult;
              }
            }
            item.unitPrice = resolvedPrice;
          } else {
            item.unit = product.unit;
            item.multiplier = 1;
            
            let resolvedPrice = 0;
            if (isPurchase) {
              if (isAutoCalc) {
                const usdPurchasePrice = (product as any).purchasePriceUSD || (product as any).purchase_price_usd || 0;
                resolvedPrice = usdPurchasePrice > 0 ? Math.round(usdPurchasePrice * finalRate) : 0;
              }
              if (resolvedPrice === 0) {
                resolvedPrice = (product as any).cost || (product as any).lastPurchasePrice || product.price || 0;
              }
            } else {
              if (isAutoCalc) {
                const usdSalePrice = (product as any).salePriceUSD || (product as any).sale_price_usd || 0;
                resolvedPrice = usdSalePrice > 0 ? Math.round(usdSalePrice * finalRate) : 0;
              }
              if (resolvedPrice === 0) {
                resolvedPrice = product.price;
              }
            }
            item.unitPrice = resolvedPrice;
          }
          
          item.quantity = item.quantity || 1;
          item.baseQuantity = item.quantity * (item.multiplier || 1);
          item.unitsetId = product.unitsetId || (product as any).unitset_id;

          const currentGross = item.quantity * item.unitPrice;
          const discountAmount = currentGross * (item.discountPercent / 100);
          const amount = currentGross - discountAmount;

          item.amount = currentGross;
          item.netAmount = amount;

          setItems(updatedItems);
          setBarcodeInput('');
          barcodeInputRef.current?.focus();
          toast.success(`${product.name} (${item.unit}) eklendi`);
        } else {
          const isPurchase = invoiceType.category === 'Alis';
          const systemUsdRate = latestRates.find(r => r.currency_code === 'USD')?.sell_rate || currencyRate || 1;
          const effectiveRate = product.customExchangeRate || 0;
          let finalRate = effectiveRate > 0 ? effectiveRate : systemUsdRate;

          // IQD Scaling Logic
          if (finalRate > 0 && finalRate < 10) {
            finalRate = finalRate * 1000;
          }
          
          const isAutoCalc = product.autoCalculateUSD;

          let resolvedPrice = 0;
          let resolvedUnit = unitInfo ? (unitInfo.unit || unitInfo.unit_code) : product.unit;
          let resolvedMult = unitInfo ? (unitInfo.multiplier || 1) : 1;

          if (isPurchase) {
            resolvedPrice = (unitInfo && unitInfo.purchase_price > 0) ? unitInfo.purchase_price : 0;
            if (resolvedPrice === 0 && isAutoCalc) {
              const usdPurchasePrice = (product as any).purchasePriceUSD || (product as any).purchase_price_usd || 0;
              if (usdPurchasePrice > 0) {
                resolvedPrice = Math.round(usdPurchasePrice * finalRate * resolvedMult);
              }
            }
            if (resolvedPrice === 0) {
              resolvedPrice = ((product as any).cost || (product as any).lastPurchasePrice || product.price || 0) * resolvedMult;
            }
          } else {
            resolvedPrice = (unitInfo && unitInfo.sale_price > 0) ? unitInfo.sale_price : 0;
            if (resolvedPrice === 0 && isAutoCalc) {
              const usdSalePrice = (product as any).salePriceUSD || (product as any).sale_price_usd || 0;
              if (usdSalePrice > 0) {
                resolvedPrice = Math.round(usdSalePrice * finalRate * resolvedMult);
              }
            }
            if (resolvedPrice === 0) {
              resolvedPrice = product.price * resolvedMult;
            }
          }

          const newItem: InvoiceItem = {
            id: Date.now().toString(),
            type: 'Malzeme',
            code: product.code,
            description: product.name,
            description2: '',
            quantity: 1,
            unit: resolvedUnit,
            unitPrice: resolvedPrice,
            discountPercent: 0,
            discountAmount: 0,
            amount: 0,
            netAmount: 0,
            multiplier: resolvedMult,
            baseQuantity: resolvedMult,
            unitsetId: product.unitset_id
          };
          
          newItem.amount = newItem.quantity * newItem.unitPrice;
          newItem.netAmount = newItem.amount;
          
          setItems([...items, newItem]);
          setBarcodeInput('');
          setCurrentRowIndex(items.length);
          barcodeInputRef.current?.focus();
          toast.success(`${product.name} (${newItem.unit}) eklendi`);
        }
      } else {
        toast.error('Ürün bulunamadı!');
        setBarcodeInput('');
      }
    } catch (error: any) {
      console.error('[UniversalInvoice] Barcode lookup error:', error);
      toast.error('Barkod okuma hatası!');
      setBarcodeInput('');
    }
  };

  // Ürün arama
  const filteredProducts = useMemo(() => {
    if (!productSearch) return [];
    const search = productSearch.toLowerCase();

    const filteredRealProducts = products.filter(p =>
      (p.code && p.code.toLowerCase().includes(search)) ||
      (p.name && p.name.toLowerCase().includes(search)) ||
      (p.barcode && p.barcode.toLowerCase().includes(search))
    );

    // Check current row type for Service
    const currentItem = items[searchingRowIndex];
    if (currentItem?.type === 'Hizmet') {
      return services.filter(s =>
        s.code.toLowerCase().includes(search) ||
        s.name.toLowerCase().includes(search) ||
        (s.category && s.category.toLowerCase().includes(search))
      ).map(s => ({
        code: s.code,
        name: s.name,
        unit: s.unit,
        price: s.unit_price,
        barcode: s.code,
        lastPurchasePrice: 0,
        type: 'Hizmet'
      }));
    }

    if (filteredRealProducts.length > 0) {
      return filteredRealProducts.map(p => ({
        code: p.code || p.id || '',
        name: p.name || '',
        unit: p.unit || 'Adet',
        price: p.price || 0,
        barcode: p.barcode || '',
        lastPurchasePrice: (p as any).cost || (p as any).lastPurchasePrice,
        autoCalculateUSD: (p as any).autoCalculateUSD,
        salePriceUSD: (p as any).salePriceUSD,
        purchasePriceUSD: (p as any).purchasePriceUSD,
        customExchangeRate: (p as any).customExchangeRate,
        unitsetId: (p as any).unitsetId
      }));
    }

    return mockProducts.filter(p =>
      p.code.toLowerCase().includes(search) ||
      p.name.toLowerCase().includes(search) ||
      (p.barcode && p.barcode.includes(search))
    );
  }, [productSearch, products]);

  // Satır silme
  const removeItem = useCallback((index: number) => {
    setItems(prev => {
      if (prev.length <= 1) {
        return [{
          id: '1',
          type: 'Malzeme',
          code: '',
          description: '',
          description2: '',
          quantity: 0,
          unit: 'Brüt',
          unitPrice: 0,
          discountPercent: 0,
          discountAmount: 0,
          amount: 0,
          netAmount: 0
        }];
      }
      return prev.filter((_, i) => i !== index);
    });

    // setCurrentRowIndex is async in setState, but we can't easily fix it here without more changes
    // it will be called correctly next tick
  }, []);

  // Item güncelleme
  const updateItem = useCallback((index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      // Birim değişince multiplier'ı güncelle
      if (field === 'unit' && item.unitsetId) {
        const unitSet = unitSets.find((us: any) => us.id === item.unitsetId);
        const line = unitSet?.lines?.find((l: any) => l.name === value || l.code === value);
        item.multiplier = line ? (parseFloat(line.conv_fact1) || 1) : 1;
      }

      // Miktar veya birim değişince base_quantity'yi güncelle
      if (field === 'quantity' || field === 'unit') {
        item.baseQuantity = (item.quantity || 0) * (item.multiplier || 1);
      }

      const grossAmount = (field === 'quantity' || field === 'unitPrice')
        ? (item.quantity || 0) * (item.unitPrice || 0)
        : (updated[index].quantity || 0) * (updated[index].unitPrice || 0);

      // Discount synchronization
      if (field === 'discountPercent') {
        item.discountAmount = grossAmount * ((value as number) / 100);
      } else if (field === 'discountAmount') {
        item.discountPercent = grossAmount > 0 ? ((value as number) / grossAmount) * 100 : 0;
      } else if (field === 'quantity' || field === 'unitPrice') {
        // Recalculate discountAmount based on existing percent when quantity/price changes
        item.discountAmount = grossAmount * ((item.discountPercent || 0) / 100);
      }

      // Compute derived fields
      if (field === 'unitPrice' && invoiceType.category === 'Alis' && item.lastPurchasePrice !== undefined) {
        item.priceDifference = (value as number) - item.lastPurchasePrice;
        item.priceDifferencePercent = item.lastPurchasePrice > 0
          ? (((value as number) - item.lastPurchasePrice) / item.lastPurchasePrice) * 100
          : 0;
      }

      const currentGross = (item.quantity || 0) * (item.unitPrice || 0);
      const netAmount = currentGross - (item.discountAmount || 0);

      item.amount = currentGross;
      item.netAmount = netAmount;

      // Kar hesaplaması
      if (item.unitCost !== undefined && item.unitCost > 0) {
        item.grossProfit = item.netAmount - (item.quantity * item.unitCost);
        item.profitMargin = item.netAmount > 0 ? (item.grossProfit / item.netAmount) * 100 : 0;
      }

      updated[index] = item;
      return updated;
    });
  }, [invoiceType.category, unitSets]);

  // Toplu fiyat artırımı
  const handleBulkPriceIncrease = () => {
    if (bulkPriceIncreasePercent === '' || bulkPriceIncreasePercent === 0) {
      toast.error('Lütfen geçerli bir yüzde girin');
      return;
    }

    const updatedItems = items.map(item => {
      if (item.code && item.unitPrice > 0) {
        const newPrice = item.unitPrice * (1 + Number(bulkPriceIncreasePercent) / 100);
        const priceDiff = item.lastPurchasePrice ? newPrice - item.lastPurchasePrice : 0;
        const priceDiffPercent = item.lastPurchasePrice && item.lastPurchasePrice > 0
          ? ((newPrice - item.lastPurchasePrice) / item.lastPurchasePrice) * 100
          : 0;

        return {
          ...item,
          unitPrice: newPrice,
          priceDifference: priceDiff,
          priceDifferencePercent: priceDiffPercent,
          amount: item.quantity * newPrice * (1 - item.discountPercent / 100),
          netAmount: item.quantity * newPrice * (1 - item.discountPercent / 100)
        };
      }
      return item;
    });

    setItems(updatedItems);
    toast.success(tm('priceBulkUpdateSuccess').replace('{percent}', bulkPriceIncreasePercent.toString()));
    setBulkPriceIncreasePercent('');
  };

  const handleShowProductHistory = (productCode: string, productName: string, productId: string) => {
    setSelectedProductForHistory({ code: productCode, name: productName, id: productId });
    setShowProductHistoryModal(true);
  };

  const handleInvoiceAddFromHistory = (historyItems: any[]) => {
    const newItems = historyItems.map((hItem, index) => ({
      id: Date.now().toString() + Math.random().toString().slice(2, 5) + index,
      type: 'Malzeme',
      code: '',
      description: hItem.product,
      description2: '',
      quantity: hItem.quantity,
      unit: hItem.unit,
      unitPrice: hItem.price,
      discountPercent: 0,
      discountAmount: 0,
      amount: hItem.total,
      netAmount: hItem.total,
      // Alış faturası ise maliyet bilgileri
      unitCost: hItem.price,
      totalCost: hItem.total,
      grossProfit: 0,
      profitMargin: 0,
      cogs: 0
    }));

    // Mevcut items listesine ekle, boş satırı en sona atabiliriz veya direkt ekleriz
    // Eğer son satır boşsa, ondan önce ekleyelim
    const currentItems = [...items];
    const lastItem = currentItems[currentItems.length - 1];
    const isLastItemEmpty = !lastItem.code && lastItem.quantity === 0 && lastItem.unitPrice === 0;

    if (isLastItemEmpty) {
      const updatedItems = [...currentItems.slice(0, -1), ...newItems, lastItem];
      setItems(updatedItems);
    } else {
      setItems([...currentItems, ...newItems]);
    }

    toast.success(`${newItems.length} ürün geçmişten eklendi`);
  };

  // Ürün seçimi (modal'dan)
  // Mevcut satıra ürün ekle (Açıklama alanına çift tıklama için)
  const [selectedRowForProduct, setSelectedRowForProduct] = useState<number | null>(null);

  const handleProductSelectForRow = (selProduct: Product, variant?: any, rowIndex?: number) => {
    const targetRowIndex = rowIndex !== undefined ? rowIndex : (selectedRowForProduct ?? currentRowIndex);

    if (targetRowIndex < 0 || targetRowIndex >= items.length) return;

    const systemUsdRate = latestRates.find(r => r.currency_code === 'USD')?.sell_rate || currencyRate || 1;
    const effectiveRate = (selProduct as any).customExchangeRate || (selProduct as any).custom_exchange_rate || 0;
    const finalRate = effectiveRate > 0 ? effectiveRate : systemUsdRate;
    const isAutoCalc = (selProduct as any).autoCalculateUSD || (selProduct as any).auto_calculate_usd;

    let productPrice = 0;
    if (isAutoCalc) {
      if (invoiceType.category === 'Alis') {
        const usdPurchasePrice = (selProduct as any).purchasePriceUSD || (selProduct as any).purchase_price_usd;
        if (usdPurchasePrice > 0) {
          productPrice = Math.round(usdPurchasePrice * finalRate);
        } else {
          productPrice = selProduct.cost || (selProduct as any).lastPurchasePrice || 0;
        }
      } else {
        const usdSalePrice = (selProduct as any).salePriceUSD || (selProduct as any).sale_price_usd;
        if (usdSalePrice > 0) {
          productPrice = Math.round(usdSalePrice * finalRate);
        } else {
          productPrice = variant?.price || selProduct.price || 0;
        }
      }
    } else {
      productPrice = invoiceType.category === 'Alis' ? (selProduct.cost || (selProduct as any).lastPurchasePrice || 0) : (variant?.price || selProduct.price || 0);
    }

    const productCode = variant?.code || selProduct.code || selProduct.barcode || selProduct.id || '';
    const productName = variant ? `${selProduct.name} - ${variant.size || variant.color || ''}` : selProduct.name;
    const productUnit = selProduct.unit || 'Adet';

    // Mevcut satıra ürün bilgilerini ekle
    const updatedItems = [...items];
    const item = { ...updatedItems[targetRowIndex] };

    item.code = productCode;
    item.description = productName;
    item.unit = productUnit;
    item.unitPrice = productPrice;
    if (item.quantity === 0) {
      item.quantity = 1;
    }

    // Birim seti bağla
    const productUnitsetId = (selProduct as any).unitset_id || (selProduct as any).unitsetId;
    if (productUnitsetId) {
      item.unitsetId = productUnitsetId;
      
      // Set default unit from unitset if available
      const unitSet = unitSets.find(us => us.id === productUnitsetId);
      if (unitSet && unitSet.lines && unitSet.lines.length > 0) {
        const mainUnit = unitSet.lines.find((l: any) => l.main_unit) || unitSet.lines[0];
        item.unit = mainUnit.name || mainUnit.code;
        item.multiplier = parseFloat(mainUnit.conv_fact1) || parseFloat(mainUnit.multiplier1) || 1;
        item.baseQuantity = item.quantity * (item.multiplier || 1);
      } else {
        item.multiplier = 1;
        item.baseQuantity = item.quantity;
      }
    }

    // Alış faturası için son fiyat bilgilerini çek
    if (invoiceType.category === 'Alis' && (selProduct as any).lastPurchasePrice !== undefined) {
      item.lastPurchasePrice = (selProduct as any).lastPurchasePrice;
      item.priceDifference = productPrice - ((selProduct as any).lastPurchasePrice || 0);
      item.priceDifferencePercent = (selProduct as any).lastPurchasePrice > 0
        ? ((productPrice - (selProduct as any).lastPurchasePrice) / (selProduct as any).lastPurchasePrice) * 100
        : 0;
    }

    updatedItems[targetRowIndex] = item;
    setItems(updatedItems);
    setShowProductCatalogModal(false);
    setSelectedRowForProduct(null);

    // Net tutarı hesapla
    const subtotal = item.quantity * item.unitPrice;
    const afterDiscount = subtotal * (1 - item.discountPercent / 100);
    updateItem(targetRowIndex, 'netAmount', afterDiscount);
  };

  const handleProductFromCatalog = (selProduct: Product, variant?: any) => {
    const systemUsdRate = latestRates.find(r => r.currency_code === 'USD')?.sell_rate || currencyRate || 1;
    const effectiveRate = (selProduct as any).customExchangeRate || (selProduct as any).custom_exchange_rate || 0;
    const finalRate = effectiveRate > 0 ? effectiveRate : systemUsdRate;
    const isAutoCalc = (selProduct as any).autoCalculateUSD || (selProduct as any).auto_calculate_usd;

    let productPrice = 0;
    if (isAutoCalc) {
      if (invoiceType.category === 'Alis') {
        const usdPurchasePrice = (selProduct as any).purchasePriceUSD || (selProduct as any).purchase_price_usd;
        if (usdPurchasePrice > 0) {
          productPrice = Math.round(usdPurchasePrice * finalRate);
        } else {
          productPrice = (selProduct as any).cost || (selProduct as any).lastPurchasePrice || 0;
        }
      } else {
        const usdSalePrice = (selProduct as any).salePriceUSD || (selProduct as any).sale_price_usd;
        if (usdSalePrice > 0) {
          productPrice = Math.round(usdSalePrice * finalRate);
        } else {
          productPrice = variant?.price || selProduct.price || 0;
        }
      }
    } else {
      productPrice = invoiceType.category === 'Alis' ? ((selProduct as any).cost || (selProduct as any).lastPurchasePrice || 0) : (variant?.price || selProduct.price || 0);
    }

    const productCode = variant?.code || selProduct.barcode || selProduct.id || '';
    const productName = variant ? `${selProduct.name} - ${variant.size || variant.color || ''}` : selProduct.name;
    const productUnit = selProduct.unit || 'Adet';

    // Yeni kalem oluştur
    const newItem: InvoiceItem = {
      id: Date.now().toString(),
      type: 'Malzeme',
      code: productCode,
      description: productName,
      description2: '',
      quantity: 1,
      unit: productUnit,
      unitPrice: productPrice,
      discountPercent: 0,
      discountAmount: 0,
      amount: productPrice,
      netAmount: productPrice,
      unitsetId: (selProduct as any).unitset_id || (selProduct as any).unitsetId,
      multiplier: 1,
      baseQuantity: 1
    };

    // Alış faturası için son fiyat bilgilerini çek (eğer varsa)
    if (invoiceType.category === 'Alis') {
      const cost = (selProduct as any).cost || (selProduct as any).lastPurchasePrice || 0;
      newItem.lastPurchasePrice = cost;
      newItem.priceDifference = productPrice - cost;
      newItem.priceDifferencePercent = cost > 0
        ? ((productPrice - cost) / cost) * 100
        : 0;
    }

    // Set default unit from unitset if available
    if (newItem.unitsetId) {
      const unitSet = unitSets.find(us => us.id === newItem.unitsetId);
      if (unitSet && unitSet.lines && unitSet.lines.length > 0) {
        const mainUnit = unitSet.lines.find((l: any) => l.main_unit) || unitSet.lines[0];
        newItem.unit = mainUnit.name || mainUnit.code;
        newItem.multiplier = parseFloat(mainUnit.conv_fact1) || parseFloat(mainUnit.multiplier1) || 1;
        newItem.baseQuantity = newItem.quantity * (newItem.multiplier || 1);
      }
    }

    // Boş son kalemi kaldır ve yeni kalemi ekle
    const lastItem = items[items.length - 1];
    const isEmptyLastItem = !lastItem.code && lastItem.quantity === 0 && lastItem.unitPrice === 0;

    if (isEmptyLastItem) {
      const updatedItems = [...items.slice(0, -1), newItem, {
        id: Date.now().toString() + '_new',
        type: 'Malzeme',
        code: '',
        description: '',
        description2: '',
        quantity: 0,
        unit: 'Brüt',
        unitPrice: 0,
        discountPercent: 0,
        discountAmount: 0,
        amount: 0,
        netAmount: 0
      }];
      setItems(updatedItems);
      setCurrentRowIndex(updatedItems.length - 2);
    } else {
      setItems([...items, newItem, {
        id: Date.now().toString() + '_new',
        type: 'Malzeme',
        code: '',
        description: '',
        description2: '',
        quantity: 0,
        unit: 'Brüt',
        unitPrice: 0,
        discountPercent: 0,
        discountAmount: 0,
        amount: 0,
        netAmount: 0
      }]);
      setCurrentRowIndex(items.length);
    }

    setShowProductCatalogModal(false);
    toast.success(`${productName} eklendi`);
  };

  // Ürün seçimi
  const selectProduct = (product: { 
    code: string; 
    name: string; 
    unit: string; 
    price: number; 
    barcode?: string; 
    lastPurchasePrice?: number;
    autoCalculateUSD?: boolean;
    salePriceUSD?: number;
    purchasePriceUSD?: number;
    customExchangeRate?: number;
    unitsetId?: string;
  }, rowIndex: number) => {
    const updatedItems = [...items];
    const item = { ...updatedItems[rowIndex] };

    const isPurchase = invoiceType.category === 'Alis';
    let productPrice = isPurchase ? (product.lastPurchasePrice || (product as any).cost || 0) : (product.price || 0);
    
    // USD Auto-calculation for manual selection
    if (product.autoCalculateUSD) {
      const usdPrice = isPurchase ? (product.purchasePriceUSD || 0) : (product.salePriceUSD || 0);
      if (usdPrice > 0) {
        const systemUsdRate = latestRates.find(r => r.currency_code === 'USD')?.sell_rate || currencyRate || 1;
        const effectiveRate = product.customExchangeRate || 0;
        let finalRate = effectiveRate > 0 ? effectiveRate : systemUsdRate;
        
        // IQD Scaling Logic
        if (finalRate > 0 && finalRate < 10) finalRate *= 1000;
        
        productPrice = Math.round(usdPrice * finalRate);
        console.log(`[UniversalInvoice] Selected Product USD Calculation: ${usdPrice}$ * ${finalRate} = ${productPrice} IQD`);
      }
    }

    const grossAmount = item.quantity * productPrice;

    item.code = product.code;
    item.description = product.name;
    item.unit = product.unit;
    item.unitPrice = productPrice;
    item.quantity = 1;

    // Birim seti bağla
    const pUnitsetId = (product as any).unitset_id || (product as any).unitsetId;
    if (pUnitsetId) {
      item.unitsetId = pUnitsetId;
 
      // Set default unit from unitset if available
      const unitSet = unitSets.find(us => us.id === pUnitsetId);
      if (unitSet && unitSet.lines && unitSet.lines.length > 0) {
        const mainUnit = unitSet.lines.find((l: any) => l.main_unit) || unitSet.lines[0];
        item.unit = mainUnit.name || mainUnit.code;
        item.multiplier = parseFloat(mainUnit.conv_fact1) || parseFloat(mainUnit.multiplier1) || 1;
        item.baseQuantity = item.quantity * (item.multiplier || 1);
      } else {
        item.multiplier = 1;
        item.baseQuantity = item.quantity;
      }
    }

    // Alış faturası için son fiyat bilgilerini çek
    if (invoiceType.category === 'Alis') {
      const cost = product.lastPurchasePrice || (product as any).cost || 0;
      item.lastPurchasePrice = cost;
      item.priceDifference = productPrice - cost;
      item.priceDifferencePercent = cost > 0
        ? ((productPrice - cost) / cost) * 100
        : 0;
    }

    // Synchronize discount based on current percentage
    item.discountAmount = grossAmount * ((item.discountPercent || 0) / 100);

    item.amount = grossAmount;
    item.netAmount = grossAmount - item.discountAmount;

    setItems(updatedItems);
    setShowProductDropdown(false);
    setProductSearch('');

    setTimeout(() => {
      const newItem: InvoiceItem = {
        id: Date.now().toString(),
        type: 'Malzeme',
        code: '',
        description: '',
        description2: '',
        quantity: 0,
        unit: 'Brüt',
        unitPrice: 0,
        discountPercent: 0,
        discountAmount: 0,
        amount: 0,
        netAmount: 0
      };
      setItems(prev => [...prev, newItem]);

      setTimeout(() => {
        setCurrentRowIndex(rowIndex + 1);
        gridRefs.current[`code-${rowIndex + 1}`]?.focus();
      }, 50);
    }, 50);
  };

  const handleProductSearchChange = (value: string, rowIndex: number) => {
    setProductSearch(value);
    setSearchingRowIndex(rowIndex);
    updateItem(rowIndex, 'code', value);
    setShowProductDropdown(value.length >= 1);
    setSelectedProductIndex(-1);

    // If typing in a service row, prioritize services
    const currentItem = items[rowIndex];
    if (currentItem?.type === 'Hizmet' || invoiceType.category === 'Hizmet') {
       // Search handled by filteredProducts useMemo
    } else if (value.length >= 8) {
      const product = mockProducts.find(p => p.barcode === value.trim());
      if (product) {
        selectProduct(product, rowIndex);
        return;
      }
    }
  };

  const selectService = (service: Service | any, rowIndex: number) => {
    const updatedItems = [...items];
    const item = { ...updatedItems[rowIndex] };

    // Determine correct price based on invoice type and currency
    let servicePrice = 0;
    if (invoiceType.category === 'Alis') {
      if (currency === 'USD' && service.purchase_price_usd) {
        servicePrice = service.purchase_price_usd;
      } else if (currency === 'EUR' && service.purchase_price_eur) {
        servicePrice = service.purchase_price_eur;
      } else {
        servicePrice = service.purchase_price || service.unit_price || 0;
      }
    } else {
      if (currency === 'USD' && service.unit_price_usd) {
        servicePrice = service.unit_price_usd;
      } else if (currency === 'EUR' && service.unit_price_eur) {
        servicePrice = service.unit_price_eur;
      } else {
        servicePrice = service.unit_price || service.price || 0;
      }
    }

    item.type = 'Hizmet';
    item.code = service.code;
    item.description = service.name;
    item.unit = service.unit || 'Adet';
    item.unitPrice = servicePrice;
    item.quantity = item.quantity || 1;
    
    // Set withholding rate if provided and form supports it (future)
    if (service.withholding_rate) {
       (item as any).withholdingRate = service.withholding_rate;
    }

    const grossAmount = item.quantity * item.unitPrice;
    item.discountAmount = grossAmount * ((item.discountPercent || 0) / 100);
    item.amount = grossAmount;
    item.netAmount = grossAmount - item.discountAmount;

    updatedItems[rowIndex] = item;
    setItems(updatedItems);
    setShowProductDropdown(false);
    setProductSearch('');

    // Focus next row or add new one
    setTimeout(() => {
        if (rowIndex === items.length - 1) {
            const newItem: InvoiceItem = {
              id: Date.now().toString(),
              type: 'Hizmet',
              code: '',
              description: '',
              description2: '',
              quantity: 0,
              unit: 'Brüt',
              unitPrice: 0,
              discountPercent: 0,
              discountAmount: 0,
              amount: 0,
              netAmount: 0
            };
            setItems(prev => [...prev, newItem]);
        }
        setTimeout(() => {
            setCurrentRowIndex(rowIndex + 1);
            gridRefs.current[`code-${rowIndex + 1}`]?.focus();
        }, 50);
    }, 50);
  };

  const handleProductKeyDown = (e: React.KeyboardEvent, rowIndex: number) => {
    if (!showProductDropdown) return;

    const filtered = filteredProducts;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedProductIndex(prev =>
        prev < filtered.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedProductIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedProductIndex >= 0 && filtered[selectedProductIndex]) {
        const selected = filtered[selectedProductIndex];
        if (selected.type === 'Hizmet') {
            selectService(selected, rowIndex);
        } else {
            selectProduct(selected, rowIndex);
        }
      }
    } else if (e.key === 'Escape') {
      setShowProductDropdown(false);
      setProductSearch('');
    }
  };

  // EditData değiştiğinde items'ı güncelle
  useEffect(() => {
    if (editData) {
      console.log('[UniversalInvoiceForm] editData received:', editData);

      // Farklı field isimlerini kontrol et: items, invoice_items, lines, sale_items
      const itemsData = editData.items || editData.invoice_items || editData.lines || editData.sale_items || [];

      console.log('[UniversalInvoiceForm] itemsData:', itemsData);

      if (itemsData.length > 0) {
        const initializedItems = itemsData.map((item: any, index: number) => {
          // Ürün kodunu bul - product_id ise products listesinden bul
          let productCode = item.code || item.product_code || '';
          const productId = item.productId || item.product_id;

          // Eğer product_id varsa ve UUID formatındaysa, products listesinden bul
          if (productId && !productCode) {
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidPattern.test(productId)) {
              const foundProduct = products.find(p => p.id === productId);
              if (foundProduct && foundProduct.code) {
                productCode = foundProduct.code;
              } else {
                const foundStoreProduct = storeProducts.find(p => p.id === productId);
                if (foundStoreProduct && foundStoreProduct.code) {
                  productCode = foundStoreProduct.code;
                } else {
                  productCode = productId; // Bulunamazsa product_id'yi kullan
                }
              }
            } else {
              productCode = productId; // UUID değilse direkt kullan
            }
          }

          return {
            id: item.id || `item-${index}`,
            type: 'Malzeme',
            code: productCode,
            description: item.description || item.productName || item.product_name || '',
            description2: item.description2 || '',
            quantity: item.quantity || 0,
            unit: item.unit || 'Adet',
            unitPrice: item.unitPrice || item.price || item.unit_price || 0,
            discountPercent: item.discountPercent || item.discount || item.discount_percent || 0,
            discountAmount: item.discountAmount || item.discount_amount || 0,
            amount: item.amount || item.gross_amount || ((item.quantity || 0) * (item.unitPrice || item.price || item.unit_price || 0)) || 0,
            netAmount: item.netAmount || item.total || item.net_amount || item.amount || 0,
            lastPurchasePrice: item.lastPurchasePrice || item.last_purchase_price,
            priceDifference: item.priceDifference || item.price_difference,
            priceDifferencePercent: item.priceDifferencePercent || item.price_difference_percent,
            unitsetId: item.unitsetId || item.unitset_id,
            multiplier: item.multiplier || item.unit_multiplier || 1,
            baseQuantity: item.baseQuantity || item.base_quantity || item.quantity,
          };
        });
        console.log('[UniversalInvoiceForm] initializedItems:', initializedItems);
        setItems(initializedItems);
      } else {
        console.warn('[UniversalInvoiceForm] No items found in editData');
        // Items yoksa veya boşsa, boş bir item ile başlat
        setItems([{
          id: '1',
          type: 'Malzeme',
          code: '',
          description: '',
          description2: '',
          quantity: 0,
          unit: 'Brüt',
          unitPrice: 0,
          discountPercent: 0,
          discountAmount: 0,
          amount: 0,
          netAmount: 0
        }]);
      }
    }
  }, [editData]);

  // Load suppliers and customers from database
  useEffect(() => {
    const loadSuppliers = async () => {
      if (invoiceType.category === 'Alis') {
        setLoadingSuppliers(true);
        try {
          const data = await supplierAPI.getAll();
          setSuppliers(data);
          console.log('[UniversalInvoiceForm] ✅ Suppliers loaded from database:', data.length);
        } catch (error) {
          console.error('[UniversalInvoiceForm] ❌ Failed to load suppliers:', error);
          toast.error(tm('suppliersNotLoaded'));
        } finally {
          setLoadingSuppliers(false);
        }
      }
    };

    const loadCustomers = async () => {
      if (invoiceType.category === 'Satis' || invoiceType.category === 'Iade') {
        // Eğer customers prop boşsa, veritabanından yükle
        if (customersProp.length === 0) {
          setLoadingCustomers(true);
          try {
            const data = await customerAPI.getAll();
            setCustomers(data);
            console.log('[UniversalInvoiceForm] ✅ Customers loaded from database:', data.length);
          } catch (error) {
            console.error('[UniversalInvoiceForm] ❌ Failed to load customers:', error);
            toast.error(tm('customersNotLoaded'));
          } finally {
            setLoadingCustomers(false);
          }
        } else {
          // Prop'tan gelen customers'ı kullan
          setCustomers(customersProp);
        }
      }
    };

    loadSuppliers();
    loadCustomers();
  }, [invoiceType.category, customersProp]);

  // Click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false);
      }
      if (cashRegisterDropdownRef.current && !cashRegisterDropdownRef.current.contains(event.target as Node)) {
        setShowCashRegisterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ürün kodunu bul (product_id ise products listesinden bul)
  const getProductCode = (itemCode: string): string => {
    if (!itemCode) return '';

    // Eğer UUID formatındaysa (product_id), products listesinden bul
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(itemCode)) {
      // products listesinden product_id'ye göre bul
      const product = products.find(p => p.id === itemCode);
      if (product && product.code) {
        return product.code;
      }
      // storeProducts'tan da dene
      const storeProduct = storeProducts.find(p => p.id === itemCode);
      if (storeProduct && storeProduct.code) {
        return storeProduct.code;
      }
    }

    // UUID değilse direkt kodu döndür
    return itemCode;
  };

  // Müşteri kodunu bul (customer_id ise customers listesinden bul)
  const getCustomerCode = (customerIdOrCode: string): string => {
    if (!customerIdOrCode) return '';

    // Eğer UUID formatındaysa (customer_id), customers listesinden bul
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(customerIdOrCode)) {
      // customers listesinden customer_id'ye göre bul
      const customer = customers.find(c => c.id === customerIdOrCode);
      if (customer && (customer as any).code) {
        return (customer as any).code;
      }
    }

    // UUID değilse direkt kodu döndür
    return customerIdOrCode;
  };

  // Müşteri ID'sini bul (customer_code ise customers listesinden bul)
  const getCustomerId = (customerCodeOrId: string): string => {
    if (!customerCodeOrId) return '';

    // Eğer UUID formatındaysa, direkt ID olarak döndür
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(customerCodeOrId)) {
      return customerCodeOrId;
    }

    // UUID değilse, customers listesinden code'a göre ID bul
    const customer = customers.find(c => (c as any).code === customerCodeOrId);
    if (customer && customer.id) {
      return customer.id;
    }

    // Bulunamazsa direkt döndür (belki zaten ID'dir)
    return customerCodeOrId;
  };

  // Toplam hesaplama
  const totals = useMemo(() => {
    let totalDiscount = 0;
    let totalGross = 0;
    let totalNet = 0;

    items.forEach(item => {
      const itemGross = (item.quantity || 0) * (item.unitPrice || 0);
      const itemTotalDiscount = (item.discountAmount || 0);
      const itemNet = itemGross - itemTotalDiscount;

      totalGross += itemGross;
      totalDiscount += itemTotalDiscount;
      totalNet += itemNet;
    });

    // Döviz kuru uygula: IQD karşılıkları
    const rate = (currency !== 'IQD' && currencyRate > 0) ? currencyRate : 1;
    return {
      totalExpenses: 0,
      totalDiscount,
      subtotal: totalGross,       // Fatura dövizinde (FC)
      totalVat: 0,
      net: totalNet,              // Fatura dövizinde (FC)
      rate,
      subtotalIQD: totalGross * rate,
      totalDiscountIQD: totalDiscount * rate,
      netIQD: totalNet * rate,    // IQD karşılığı → DB'ye yazılacak
    };
  }, [items, currency, currencyRate]);

  // Kar hesaplama (satış faturaları için)
  useEffect(() => {
    if (invoiceType.category !== 'Satis' || !selectedFirm || !selectedPeriod) {
      setTotalCost(0);
      setTotalGrossProfit(0);
      setProfitMargin(0);
      return;
    }

    const calculateProfit = async () => {
      const validItems = items.filter(item => item.code && item.quantity > 0 && item.unitPrice > 0);

      if (validItems.length === 0) {
        setTotalCost(0);
        setTotalGrossProfit(0);
        setProfitMargin(0);
        return;
      }

      try {
        const itemsForFIFO = validItems.map(item => {
          let productId = item.code;
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidPattern.test(item.code)) {
            const product = products.find(p => p.code === item.code);
            if (product && product.id) {
              productId = product.id;
            } else {
              const foundStoreProduct = storeProducts.find(p => p.code === item.code);
              if (foundStoreProduct && foundStoreProduct.id) {
                productId = foundStoreProduct.id;
              }
            }
          }
          return {
            productId: productId,
            productCode: item.code,
            quantity: item.quantity
          };
        });

        const costResults = await batchCalculateFIFOCost({
          items: itemsForFIFO,
          firmaId: (selectedFirm?.logicalref || 0).toString(),
          donemId: (selectedPeriod?.logicalref || 0).toString()
        });

        let calculatedTotalCost = 0;
        let calculatedTotalGrossProfit = 0;

        validItems.forEach(item => {
          let productId = item.code;
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidPattern.test(item.code)) {
            const p = products.find(p => p.code === item.code) || storeProducts.find(p => p.code === item.code);
            if (p) productId = p.id;
          }

          const costInfo = costResults.get(productId);
          const itemCost = costInfo?.totalCost || 0;
          calculatedTotalCost += itemCost;
          calculatedTotalGrossProfit += (item.netAmount - itemCost);
        });

        const netTotal = validItems.reduce((sum, item) => sum + item.netAmount, 0);
        const calculatedProfitMargin = netTotal > 0 ? (calculatedTotalGrossProfit / netTotal) * 100 : 0;

        // Update individual items with cost and profit info
        let hasChanges = false;
        const updatedItemsWithProfit = items.map(item => {
          let productId = item.code;
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidPattern.test(item.code)) {
            const p = products.find(p => p.code === item.code) || storeProducts.find(p => p.code === item.code);
            if (p) productId = p.id;
          }

          const costInfo = costResults.get(productId);
          if (costInfo) {
            const itemGrossProfit = item.netAmount - costInfo.totalCost;
            const itemProfitMargin = item.netAmount > 0 ? (itemGrossProfit / item.netAmount) * 100 : 0;

            // Sadece kar/maliyet alanları değiştiyse güncelle
            if (item.unitCost !== costInfo.unitCost ||
              item.totalCost !== costInfo.totalCost ||
              item.grossProfit !== itemGrossProfit ||
              item.profitMargin !== itemProfitMargin) {
              hasChanges = true;
              return {
                ...item,
                unitCost: costInfo.unitCost,
                totalCost: costInfo.totalCost,
                grossProfit: itemGrossProfit,
                profitMargin: itemProfitMargin
              };
            }
          }
          return item;
        });

        if (hasChanges) {
          setItems(updatedItemsWithProfit);
        }

        setTotalCost(calculatedTotalCost);
        setTotalGrossProfit(calculatedTotalGrossProfit);
        setProfitMargin(calculatedProfitMargin);
      } catch (error) {
        console.error('[UniversalInvoiceForm] Error calculating profit:', error);
        setTotalCost(0);
        setTotalGrossProfit(0);
        setProfitMargin(0);
      }
    };

    calculateProfit();
  }, [items, invoiceType.category, selectedFirm, selectedPeriod, products, storeProducts]);

  // Yazdırma İşlemi
  const handlePrint = async () => {
    // Construct invoice object for printing
    const currentInvoice: any = {
      invoice_no: invoiceNo,
      invoice_date: transactionDate,
      invoice_type: invoiceType.code,
      trcode: invoiceType.code,
      invoice_category: invoiceType.category as any,
      customer_name: customerTitle || supplierTitle || '',
      payment_method: paymentMethod || 'Nakit',
      cashier: cashierName,
      subtotal: totals.subtotalIQD,
      tax: totals.totalVat,
      discount: totals.totalDiscountIQD,
      total: totals.netIQD,
      total_amount: totals.netIQD,
      items: items.map(item => ({
        productName: item.description,
        code: item.code,
        quantity: item.quantity,
        unit: item.unit,
        price: item.unitPrice,
        unitPrice: item.unitPrice,
        total: item.netAmount,
        netAmount: item.netAmount,
        discount: item.discountPercent
      }))
    };

    // Determine label
    const typeLabel = invoiceType.name.toUpperCase();
    await printInvoice(currentInvoice, typeLabel);
  };

  // Kaydetme
  const handleSave = async () => {
    if (!selectedFirm || !selectedPeriod) {
      toast.error('❌ ' + tm('selectFirmAndPeriod'));
      return;
    }

    let invoiceDate: Date;
    try {
      const dateParts = transactionDate.split('.');
      if (dateParts.length === 3) {
        invoiceDate = new Date(parseInt(dateParts[2]), parseInt(dateParts[1]) - 1, parseInt(dateParts[0]));
      } else {
        invoiceDate = new Date(transactionDate);
      }
      if (isNaN(invoiceDate.getTime())) invoiceDate = new Date();
    } catch {
      invoiceDate = new Date();
    }

    if (!isTransactionAllowed(invoiceDate)) {
      toast.error('❌ ' + tm('transactionNotAllowedDate'));
      return;
    }

    // Cari kontrol
    if (invoiceType.category === 'Alis' && !supplierTitle) {
      toast.error('❌ ' + tm('supplierNotSelected'));
      return;
    }
    if ((invoiceType.category === 'Satis' || invoiceType.category === 'Iade') && !customerTitle) {
      toast.error('❌ ' + tm('customerNotSelected'));
      return;
    }

    // Kalem kontrolü
    const validItems = items.filter(item => item.quantity > 0 && item.unitPrice > 0);
    if (validItems.length === 0) {
      toast.error('❌ ' + tm('noInvoiceItems'));
      return;
    }

    setSaving(true);
    try {
      // ===== 1. MALİYET HESAPLAMALARI =====
      let totalCost = 0;
      let calculatedGrossProfit = 0;
      let itemsWithCost: InvoiceItem[] = [];
      let priceChangeItems: any[] = [];

      // Döviz kuru (IQD'ye çevirme katsayısı)
      const rateToIQD = (currency !== 'IQD' && currencyRate > 0) ? currencyRate : 1;

      if (invoiceType.category === 'Alis') {
        itemsWithCost = validItems.map(item => {
          const unitPriceFC = item.unitPrice;                    // Fatura dövizindeki fiyat
          const unitPriceIQD = unitPriceFC * rateToIQD;          // IQD karşılığı
          const baseQty = item.baseQuantity ?? (item.quantity * (item.multiplier || 1));
          const totalItemCost = baseQty * unitPriceIQD;
          totalCost += totalItemCost;

          if (item.lastPurchasePrice && item.lastPurchasePrice > 0 && unitPriceIQD !== item.lastPurchasePrice) {
            priceChangeItems.push({
              code: item.code,
              name: item.description,
              oldPrice: item.lastPurchasePrice,
              newPrice: unitPriceIQD,
              difference: unitPriceIQD - item.lastPurchasePrice,
              differencePercent: ((unitPriceIQD - item.lastPurchasePrice) / item.lastPurchasePrice) * 100
            });
          }

          return {
            ...item,
            unitPriceFC,
            unitPrice: unitPriceIQD,
            baseQuantity: baseQty,
            unitCost: unitPriceIQD,
            totalCost: totalItemCost,
            grossProfit: 0,
            profitMargin: 0
          };
        });
      } else if (invoiceType.category === 'Satis') {
        const itemsForFIFO = validItems.map(item => {
          let productId = item.code;
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.code)) {
            const p = products.find(p => p.code === item.code) || storeProducts.find(p => p.code === item.code);
            if (p) productId = p.id;
          }
          const baseQty = item.baseQuantity ?? (item.quantity * (item.multiplier || 1));
          return { productId, productCode: item.code, quantity: baseQty };
        });

        const costResults = await batchCalculateFIFOCost({
          items: itemsForFIFO,
          firmaId: (selectedFirm?.logicalref || 0).toString(),
          donemId: (selectedPeriod?.logicalref || 0).toString()
        });

        itemsWithCost = validItems.map(item => {
          let productId = item.code;
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.code)) {
            const p = products.find(p => p.code === item.code) || storeProducts.find(p => p.code === item.code);
            if (p) productId = p.id;
          }
          const costInfo = costResults.get(productId);
          const unitCost = costInfo?.unitCost || 0;
          const totalItemCost = costInfo?.totalCost || 0;
          totalCost += totalItemCost;

          const unitPriceFC = item.unitPrice;
          const unitPriceIQD = unitPriceFC * rateToIQD;
          const baseQty = item.baseQuantity ?? (item.quantity * (item.multiplier || 1));
          const netAmountIQD = item.netAmount * rateToIQD;
          calculatedGrossProfit += (netAmountIQD - totalItemCost);

          return {
            ...item,
            unitPriceFC,
            unitPrice: unitPriceIQD,
            baseQuantity: baseQty,
            unitCost,
            totalCost: totalItemCost,
            grossProfit: netAmountIQD - totalItemCost
          };
        });
      }

      // itemsWithCost yoksa (Iade, Irsaliye vb.) döviz dönüşümünü uygula
      if (itemsWithCost.length === 0 && validItems.length > 0) {
        itemsWithCost = validItems.map(item => ({
          ...item,
          unitPriceFC: item.unitPrice,
          unitPrice: item.unitPrice * rateToIQD,
          baseQuantity: item.baseQuantity ?? (item.quantity * (item.multiplier || 1))
        }));
      }

      // ===== 2. VERİTABANINA KAYDET =====
      const invoiceData: any = {
        invoice_no: invoiceNo,
        invoice_date: transactionDate,
        invoice_type: invoiceType.code,
        invoice_category: invoiceType.category as any,
        customer_id: customerId || undefined,
        supplier_id: supplierId || undefined,
        supplier_name: supplierTitle || '',
        customer_name: customerTitle || '',
        subtotal: totals.subtotalIQD,   // IQD
        discount: totals.totalDiscountIQD,
        tax: 0,
        total_amount: totals.netIQD,    // IQD
        total: totals.netIQD,
        total_cost: totalCost,
        gross_profit: totalGrossProfit,
        profit_margin: profitMargin,
        firma_id: selectedFirm?.logicalref?.toString() || '0',
        firma_name: selectedFirm?.name || '',
        donem_id: selectedPeriod?.logicalref?.toString() || '0',
        donem_name: selectedPeriod?.donem_adi || '',
        payment_method: paymentMethod || 'Nakit',
        cashier: cashierName,
        status: (invoiceType.category === 'Alis' || invoiceType.category === 'Iade') ? 'completed' : 'unpaid',
        notes: description,
        currency: currency || 'IQD',
        currency_rate: currencyRate || 1,
        credit_amount: creditAmount,
        items: itemsWithCost
      };

      let savedInvoice: any;
      if (editData?.id) {
        savedInvoice = await invoicesAPI.update(editData.id, invoiceData);
      } else {
        savedInvoice = await invoicesAPI.create(invoiceData);
      }

      if (!savedInvoice) throw new Error(tm('invoiceSaveError'));

      toast.success('✅ ' + tm('invoiceSaved'));

      // Stok ve FIFO Hareketleri (baseQuantity kullan)
      if (!editData?.id) {
        if (invoiceType.category === 'Alis') {
          for (const item of itemsWithCost) {
            const baseQty = item.baseQuantity ?? item.quantity;
            await CostAccountingService.addFIFOLayer({
              product_id: item.code,
              quantity: baseQty,
              unit_cost: item.unitCost || item.unitPrice,
              purchase_date: invoiceDate.toISOString(),
              document_no: invoiceNo,
              firma_id: selectedFirm.id || '',
              donem_id: selectedPeriod.id || ''
            });
          }
        } else if (invoiceType.category === 'Satis') {
          for (const item of itemsWithCost) {
            const baseQty = item.baseQuantity ?? item.quantity;
            await CostAccountingService.recordStockMovement({
              product_id: item.code,
              product_code: item.code,
              product_name: item.description,
              movement_type: 'OUT',
              quantity: baseQty,
              unit_cost: item.unitCost || 0,
              unit_price: item.unitPrice,
              total_cost: item.totalCost || 0,
              total_price: item.netAmount * rateToIQD,
              movement_date: invoiceDate.toISOString(),
              document_no: invoiceNo,
              document_type: 'SALES_INVOICE',
              firma_id: selectedFirm.id || '',
              donem_id: selectedPeriod.id || ''
            });
          }
        }

        if (priceChangeItems.length > 0) {
          await priceChangeVouchersAPI.create({
            voucher_no: `FD-${invoiceNo}`,
            invoice_no: invoiceNo,
            date: invoiceDate.toISOString(),
            items: priceChangeItems,
            firma_id: selectedFirm.id || '',
            donem_id: selectedPeriod.id || ''
          });
        }
      }

      // ===== 6. OTOMATİK MUHASEBE FİŞİ =====
      if (!editData?.id && isReady) {
        let journalResult: any = null;

        if (invoiceType.category === 'Satis' && selectedFirm && selectedPeriod) {
          journalResult = await createSalesJournal({
            fatura_no: invoiceNo,
            tarih: invoiceDate,
            musteri_adi: customerTitle || supplierTitle,
            tutar: totals.netIQD,   // IQD
            aciklama: description
          });
        } else if (invoiceType.category === 'Alis' && selectedFirm && selectedPeriod) {
          journalResult = await createPurchaseJournal({
            fatura_no: invoiceNo,
            tarih: invoiceDate,
            tedarikci_adi: supplierTitle || customerTitle,
            tutar: totals.netIQD,   // IQD
            aciklama: description
          });
        }

        if (journalResult && (journalResult as any).success) {
          toast.success("Muhasebe Fişi Oluşturuldu", {
            description: formatJournalResult(journalResult as any),
            duration: 5000,
          });
        }
      }

      // ===== 7. YAZDIRMA =====
      try {
        const printData = {
          storeName: selectedFirm?.name || '',
          storeAddress: '',
          storeTaxNo: '',
          receiptNumber: invoiceNo,
          date: invoiceDate.toISOString(),
          customerName: invoiceType.category === 'Alis' ? supplierTitle : customerTitle,
          cashier: cashierName || '',
          items: itemsWithCost.map(item => ({
            productName: item.description,
            quantity: item.quantity,
            price: item.unitPrice,
            total: item.netAmount
          })),
          subtotal: totals.subtotalIQD,
          discount: totals.totalDiscountIQD,
          tax: totals.totalVat,
          total: totals.netIQD,
          paymentMethod: paymentMethod || 'Nakit'
        };

        if (window.electronAPI?.printer) {
          await window.electronAPI.printer.print(printData);
        } else {
          // Fallback to corporate print
          await handlePrint();
        }
      } catch (printError) {
        console.error('[UniversalInvoice] Print error:', printError);
      }

      setTimeout(() => onClose(), 1000);
    } catch (error: any) {
      toast.error('❌ Kayıt hatası!', {
        description: error.message || 'Fatura kaydedilemedi.',
      });
    } finally {
      setSaving(false);
    }
  };

  const headerColors = getHeaderColor();
  const cariBorderColor = getCariBorderColor();
  const cariTextColor = getCariTextColor();

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        {/* Header with Tabs */}
        <div className={`bg-gradient-to-r ${headerColors.gradient} flex-shrink-0`}>
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-white" />
              <h2 className="text-lg text-white">{invoiceType.name} - {invoiceNo}</h2>
              {!isTransactionAllowed(new Date()) && (
                <div className="flex items-center gap-2 px-3 py-1 bg-red-500 rounded text-white text-xs">
                  <AlertCircle className="w-3 h-3" />
                  {tm('periodClosed')}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button className="text-white hover:bg-white/10 rounded p-1.5">
                <Minus className="w-4 h-4" />
              </button>
              <button className="text-white hover:bg-white/10 rounded p-1.5">
                <Square className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="text-white hover:bg-white/10 rounded p-1.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-t border-white/20">
            <button
              onClick={() => setActiveTab('fatura')}
              className={`px-6 py-2 text-sm transition-colors ${activeTab === 'fatura'
                ? 'bg-white text-gray-900'
                : 'text-white hover:bg-white/10'
                }`}
            >
              {tm('invoice')}
            </button>
            <button
              onClick={() => setActiveTab('detaylar')}
              className={`px-6 py-2 text-sm transition-colors ${activeTab === 'detaylar'
                ? 'bg-white text-gray-900'
                : 'text-white hover:bg-white/10'
                }`}
            >
              {tm('details')}
            </button>
            <button
              onClick={() => setActiveTab('detaylarII')}
              className={`px-6 py-2 text-sm transition-colors ${activeTab === 'detaylarII'
                ? 'bg-white text-gray-900'
                : 'text-white hover:bg-white/10'
                }`}
            >
              {tm('detailsII')}
            </button>
            <button
              onClick={() => setActiveTab('ekliDosyalar')}
              className={`px-6 py-2 text-sm transition-colors ${activeTab === 'ekliDosyalar'
                ? 'bg-white text-gray-900'
                : 'text-white hover:bg-white/10'
                }`}
            >
              {tm('attachments')}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto bg-gray-50">
          <div className="p-6">
            {/* Top Form */}
            {activeTab === 'fatura' && (
              <>
                <InvoiceHeader
                  invoiceType={invoiceType}
                  isFormExpanded={isFormExpanded}
                  setIsFormExpanded={setIsFormExpanded}

                  invoiceNo={invoiceNo}
                  transactionDate={transactionDate}
                  setTransactionDate={setTransactionDate}
                  time={time}
                  setTime={setTime}
                  documentNo={documentNo}
                  setDocumentNo={setDocumentNo}
                  customerBarcode={customerBarcode}
                  setCustomerBarcode={setCustomerBarcode}
                  editDate={editDate}
                  setEditDate={setEditDate}
                  specialCode={specialCode}
                  setSpecialCode={setSpecialCode}
                  tradingGroup={tradingGroup}
                  setTradingGroup={setTradingGroup}
                  authorizationCode={authorizationCode}
                  setAuthorizationCode={setAuthorizationCode}

                  supplierCode={supplierCode}
                  setSupplierCode={setSupplierCode}
                  customerCode={customerCode}
                  setCustomerCode={setCustomerCode}
                  supplierTitle={supplierTitle}
                  customerTitle={customerTitle}

                  paymentMethod={paymentMethod}
                  warehouse={warehouse}
                  workplace={workplace}
                  salespersonCode={salespersonCode}

                  setShowTransactionDateModal={setShowTransactionDateModal}
                  setShowEditDateModal={setShowEditDateModal}
                  setShowSpecialCodeModal={setShowSpecialCodeModal}
                  setShowTradingGroupModal={setShowTradingGroupModal}
                  setShowAuthorizationModal={setShowAuthorizationModal}
                  setShowCustomerModal={setShowCustomerModal}
                  setShowSupplierModal={setShowSupplierModal}
                  setShowPaymentInfoModal={setShowPaymentInfoModal}
                  setShowWorkplaceModal={setShowWorkplaceModal}
                  setShowWarehouseModal={setShowWarehouseModal}
                  setShowSalespersonModal={setShowSalespersonModal}

                  setSelectedSupplierHistory={setSelectedSupplierHistory}
                  setShowSupplierHistory={setShowSupplierHistory}

                  cariBorderColor={cariBorderColor}
                  cariTextColor={cariTextColor}
                />



                {/* Items Grid */}
                <div className="space-y-3">
                  {/* Toplu Fiyat Artırımı - Sadece Alış Faturaları için */}
                  {invoiceType.category === 'Alis' && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 font-medium">{tm('bulkPriceIncrease')}:</span>
                        <input
                          type="number"
                          value={bulkPriceIncreasePercent}
                          onChange={(e) => setBulkPriceIncreasePercent(e.target.value === '' ? '' : parseFloat(e.target.value))}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right"
                          placeholder="%"
                          step="0.1"
                        />
                        <button
                          onClick={handleBulkPriceIncrease}
                          className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm transition-colors"
                        >
                          {tm('apply')}
                        </button>
                        <span className="text-xs text-gray-600">{tm('bulkPriceIncreaseDesc')}</span>
                      </div>
                      <ColumnVisibilityMenu
                        columns={itemColumns}
                        onToggle={handleToggleColumn}
                        onShowAll={handleShowAllColumns}
                        onHideAll={handleHideAllColumns}
                      />
                    </div>
                  )}
                  {/* Kolon Görünürlüğü Sadece Diğer Fatura Türleri İçin (Alış değilse buraya gelir) */}
                  {invoiceType.category !== 'Alis' && (
                    <div className="flex justify-end">
                      <ColumnVisibilityMenu
                        columns={itemColumns}
                        onToggle={handleToggleColumn}
                        onShowAll={handleShowAllColumns}
                        onHideAll={handleHideAllColumns}
                      />
                    </div>
                  )}

                  {/* Barkod Okutma Alanı */}
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="bg-blue-50 p-2 rounded-lg">
                      <Barcode className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleBarcodeSubmit()}
                        placeholder="Ürün barkodunu okutun..."
                        className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium placeholder:text-gray-400"
                        autoFocus
                      />
                    </div>
                    <div className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100 uppercase tracking-wider">
                      AUTO-UNIT DETECT
                    </div>
                  </div>

                  <InvoiceItemsGrid
                    items={items}
                    invoiceType={invoiceType}
                    itemColumnVisibility={itemColumnVisibility}
                    filteredProducts={filteredProducts}
                    currentRowIndex={currentRowIndex}
                    setCurrentRowIndex={setCurrentRowIndex}
                    updateItem={updateItem}
                    removeItem={removeItem}
                    selectProduct={selectProduct}
                    handleProductSearchChange={handleProductSearchChange}
                    handleProductKeyDown={handleProductKeyDown}
                    handleShowProductHistory={handleShowProductHistory}
                    setSelectedRowForProduct={setSelectedRowForProduct}
                    setShowProductCatalogModal={setShowProductCatalogModal}
                    searchingRowIndex={searchingRowIndex}
                    productDropdownRef={productDropdownRef}
                    gridRefs={gridRefs}
                    getProductCode={getProductCode}
                    unitSets={unitSets}
                    currency={currency}
                    currencyRate={currencyRate}
                  />
                </div>

                {/* Totals Area: currency selector + totals box */}
                <div className="flex justify-end gap-4 items-start">
                  {/* Döviz & Kur Seçici */}
                  <div className="flex items-end gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Döviz</label>
                      <select
                        value={currency}
                        onChange={(e) => { setCurrency(e.target.value); if (e.target.value === 'IQD') setCurrencyRate(1); }}
                        className="px-2 py-1.5 border border-gray-300 rounded text-sm w-20"
                      >
                        <option value="IQD">IQD</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="TRY">TRY</option>
                      </select>
                    </div>
                    {currency !== 'IQD' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">1 {currency} =</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={currencyRate}
                            onChange={(e) => setCurrencyRate(parseFloat(e.target.value) || 1)}
                            step="0.0001"
                            min="0.0001"
                            className="w-28 px-2 py-1.5 border border-orange-300 rounded text-sm text-right font-medium"
                          />
                          <span className="text-xs text-gray-500">IQD</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Totals Box */}
                  <div className={`${getCariBorderColor()} border p-4 rounded-lg w-full max-w-sm space-y-2 shadow-sm`}>
                    {currency !== 'IQD' && (
                      <div className="flex justify-between text-xs text-gray-500 pb-1 border-b border-gray-100">
                        <span>{tm('grossTotal')} ({currency})</span>
                        <span>{formatNumber(totals.subtotal, 2, true)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">{tm('grossTotal')}{currency !== 'IQD' ? ' (IQD)' : ''}</span>
                      <span>{formatNumber(currency !== 'IQD' ? totals.subtotalIQD : totals.subtotal, 2, false)}</span>
                    </div>
                    {currency !== 'IQD' && totals.totalDiscount > 0 && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{tm('discountTotal')} ({currency})</span>
                        <span className="text-red-400">-{formatNumber(totals.totalDiscount, 2, true)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">{tm('discountTotal')}</span>
                      <span className="text-red-500">-{formatNumber(currency !== 'IQD' ? totals.totalDiscountIQD : totals.totalDiscount, 2, false)}</span>
                    </div>
                    {invoiceType.category === 'Satis' && totalCost > 0 && (
                      <>
                        <div className="flex justify-between border-t border-gray-100 pt-2 mt-2">
                          <span className="text-gray-600">{tm('costPurchase')}</span>
                          <span className="text-gray-700">{formatNumber(totalCost, 2, false)}</span>
                        </div>
                        <div className="flex justify-between border-t border-gray-100 pt-2 mt-2">
                          <span className="text-gray-600 font-semibold">{tm('profitSalesPurchase')}</span>
                          <span className={totalGrossProfit >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                            {formatNumber(totalGrossProfit, 2, false)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>{tm('profitMarginLabel')}</span>
                          <span>{formatNumber(profitMargin, 2, false)}%</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between border-t border-gray-100 pt-2 mt-2">
                      <span className="text-gray-900 font-bold text-lg">
                        {tm('net')}{currency !== 'IQD' ? ' (IQD)' : ''}
                      </span>
                      <span className={`${getCariTextColor()} text-2xl font-bold`}>
                        {formatNumber(currency !== 'IQD' ? totals.netIQD : totals.net, 2, false)}
                      </span>
                    </div>
                    {invoiceType.category === 'Alis' && (
                       <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-200">
                         <span className="text-gray-600 font-medium">{tm('veresiye')}</span>
                         <div className="flex items-center gap-2">
                            <input 
                              type="number"
                              value={creditAmount}
                              onChange={(e) => setCreditAmount(parseFloat(e.target.value) || 0)}
                              className="w-32 px-2 py-1 border border-red-200 rounded text-right font-bold text-red-600 bg-red-50"
                            />
                            <span className="text-xs text-gray-500">IQD</span>
                         </div>
                       </div>
                    )}
                    {currency !== 'IQD' && (
                      <div className="flex justify-between text-xs text-gray-400 pt-1">
                        <span>{tm('net')} ({currency})</span>
                        <span>{formatNumber(totals.net, 2, true)} {currency}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={handlePrint}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    {tm('print')}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !isTransactionAllowed(transactionDate)}
                    className={`px-12 py-1.5 text-white rounded text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${getHeaderColor().solid}`}
                  >
                    <Save className="w-4 h-4" />
                    {saving ? tm('savingInProgress') : tm('save')}
                  </button>
                  <button
                    onClick={onClose}
                    className="w-9 h-9 bg-gray-800 hover:bg-gray-900 text-white rounded-full transition-colors flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </>
            )
            }

            {/* Detaylar Sekmesi - Logo Formatı */}
            {
              activeTab === 'detaylar' && (
                <div className="bg-white rounded border border-gray-200 p-6">
                  <div className="space-y-6">
                    {/* Üst Kısım - Döviz ve Toplam Bilgileri */}
                    <div className="grid grid-cols-6 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('transactionCurrency')}</label>
                        <select
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value)}
                          className="w-full px-3 py-2 border border-blue-300 bg-blue-50 rounded text-sm font-bold"
                        >
                          <option value="IQD">IQD</option>
                          {currencies.filter(c => c.code !== 'IQD').map(c => (
                            <option key={c.code} value={c.code}>{c.code}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('currencyRateShort')} (1 {currency} = ? IQD)</label>
                        <input
                          type="number"
                          value={currencyRate}
                          onChange={(e) => setCurrencyRate(parseFloat(e.target.value) || 1)}
                          step="0.0001"
                          min="0.0001"
                          disabled={currency === 'IQD'}
                          className={`w-full px-3 py-2 border rounded text-sm ${currency === 'IQD' ? 'border-gray-200 bg-gray-100 text-gray-400' : 'border-orange-300 font-semibold bg-orange-50'}`}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('currencyRateType')}</label>
                        <select
                          value={currencyRateType}
                          onChange={(e) => setCurrencyRateType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="Satış">{tm('sales')}</option>
                          <option value="Alış">{tm('purchase')}</option>
                          <option value="Efektif Satış">Efektif Satış</option>
                          <option value="Efektif Alış">Efektif Alış</option>
                        </select>
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isCurrencyTransaction}
                            onChange={(e) => setIsCurrencyTransaction(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">{tm('currencyTransaction')}</span>
                        </label>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">İşlem</label>
                        <select
                          value={transactionType}
                          onChange={(e) => setTransactionType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="">Seçiniz...</option>
                          <option value="NORMAL">Normal İşlem</option>
                          <option value="CONSIGNMENT">Konsinye</option>
                          <option value="RETURN">İade</option>
                          <option value="EXCHANGE">Değişim</option>
                          <option value="SAMPLE">Numune</option>
                          <option value="PROMOTION">Promosyon</option>
                          <option value="DAMAGED">Hasarlı</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Toplam (IQD)</label>
                        <input
                          type="text"
                          readOnly
                          value={formatNumber(totals.netIQD, 2, false)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50 font-semibold text-teal-700"
                        />
                        {currency !== 'IQD' && (
                          <div className="text-xs text-gray-400 mt-0.5">{formatNumber(totals.net, 2, true)} {currency}</div>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Dağılacak Toplam</label>
                        <input
                          type="number"
                          value={distributedTotal}
                          onChange={(e) => setDistributedTotal(parseFloat(e.target.value) || 0)}
                          step="0.01"
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">TAX Oranı</label>
                        <input
                          type="number"
                          value={taxRate}
                          onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                          step="0.01"
                        />
                      </div>
                    </div>

                    {/* Sevkiyat Hesabı */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Sevkiyat Hesabı</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Kodu</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={shippingAccountCode}
                              onChange={(e) => setShippingAccountCode(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                            <button
                              onClick={() => setShowShippingAccountModal(true)}
                              className="px-2 py-2 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              <MoreVertical className="w-4 h-4 text-gray-600" />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Ünvanı</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={shippingAccountTitle}
                              onChange={(e) => setShippingAccountTitle(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                            <button
                              onClick={() => setShowShippingAccountModal(true)}
                              className="px-2 py-2 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              <MoreVertical className="w-4 h-4 text-gray-600" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-end gap-4">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={affectCollateralRisk}
                              onChange={(e) => setAffectCollateralRisk(e.target.checked)}
                              className="w-4 h-4"
                            />
                            <span>Teminat Riskini Etkileyecek</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={affectRisk}
                              onChange={(e) => setAffectRisk(e.target.checked)}
                              className="w-4 h-4"
                            />
                            <span>{tm('affectRisk')}</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Sevkiyat Adresi */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">{tm('shippingAddress')}</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('code')}</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={shippingAddressCode}
                              onChange={(e) => setShippingAddressCode(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                            <button
                              onClick={() => setShowShippingAddressModal(true)}
                              className="px-2 py-2 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              <MoreVertical className="w-4 h-4 text-gray-600" />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('descriptionLabel')}</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={shippingAddressDesc}
                              onChange={(e) => setShippingAddressDesc(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                            <button
                              onClick={() => setShowShippingAddressModal(true)}
                              className="px-2 py-2 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              <MoreVertical className="w-4 h-4 text-gray-600" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* İrsaliye Bilgileri */}
                    {invoiceType.category === 'Satis' && (
                      <div className="border-t pt-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">{tm('waybillInfo')}</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{tm('type')}</label>
                            <input
                              type="text"
                              value={waybillType || `${invoiceType.name} İrsaliyesi`}
                              onChange={(e) => setWaybillType(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{tm('waybillNo')}</label>
                            <input
                              type="text"
                              value={waybillNo || invoiceNo}
                              onChange={(e) => setWaybillNo(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{tm('documentNo')}</label>
                            <input
                              type="text"
                              value={waybillDocumentNo}
                              onChange={(e) => setWaybillDocumentNo(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Açıklama */}
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">{tm('description')}</label>
                        <button
                          onClick={() => setShowProductCatalogModal(true)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                          title={tm('selectProduct')}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder={`${tm('invoice')} ${tm('description')}...`}
                      />
                    </div>

                    {/* Doküman İzleme ve Ödeme */}
                    <div className="border-t pt-4">
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('documentTrackingNo')}</label>
                          <input
                            type="text"
                            value={documentTrackingNo}
                            onChange={(e) => setDocumentTrackingNo(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('paymentType')}</label>
                          <select
                            value={paymentType}
                            onChange={(e) => setPaymentType(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                          >
                            <option value="İşlem Yapılmayacak">{tm('noAction')}</option>
                            <option value="Nakit">{tm('cash')}</option>
                            <option value="Kredi Kartı">{tm('creditCard')}</option>
                            <option value="Veresiye">{tm('paymentCredit')}</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={isElectronicDoc}
                              onChange={(e) => setIsElectronicDoc(e.target.checked)}
                              className="w-4 h-4"
                            />
                            <span>{tm('electronicDoc')}</span>
                          </label>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('receiptType')}</label>
                          <select
                            value={receiptType}
                            onChange={(e) => setReceiptType(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                          >
                            <option value="">{tm('selectOne')}</option>
                            <option value="CASH">{tm('cash')}</option>
                            <option value="CREDIT_CARD">{tm('creditCard')}</option>
                            <option value="BANK_TRANSFER">{tm('bankTransfer')}</option>
                            <option value="CHECK">{tm('check')}</option>
                            <option value="BANK_CARD">{tm('bankCard')}</option>
                            <option value="MOBILE_PAYMENT">{tm('mobilePayment')}</option>
                            <option value="CREDIT">{tm('credit')}</option>
                            <option value="OTHER">{tm('other')}</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            }

            {/* Detaylar II Sekmesi - Logo Formatı */}
            {
              activeTab === 'detaylarII' && (
                <div className="bg-white rounded border border-gray-200 p-6">
                  <div className="space-y-6">
                    <div className="grid grid-cols-5 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('transactionStatus')}</label>
                        <select
                          value={transactionStatus}
                          onChange={(e) => setTransactionStatus(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="Operation Completed">{tm('operationCompleted')}</option>
                          <option value="Pending">{tm('pending')}</option>
                          <option value="Cancelled">{tm('cancelled')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('reportingCurrency')}</label>
                        <select
                          value={reportingCurrency}
                          onChange={(e) => setReportingCurrency(e.target.value)}
                          className="w-full px-3 py-2 border border-green-300 bg-green-50 rounded text-sm font-bold"
                        >
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="TRY">TRY</option>
                          <option value="IQD">IQD</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('reportingCurrencyRate')}</label>
                        <input
                          type="number"
                          value={reportingCurrencyRate}
                          onChange={(e) => setReportingCurrencyRate(parseFloat(e.target.value) || 1)}
                          step="0.0001"
                          className="w-full px-3 py-2 border border-green-300 rounded text-sm font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('valuationRate')}</label>
                        <input
                          type="number"
                          value={valuationRate}
                          onChange={(e) => setValuationRate(parseFloat(e.target.value) || 1)}
                          step="0.0001"
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('creditCardNo')}</label>
                        <input
                          type="text"
                          value={creditCardNo}
                          onChange={(e) => setCreditCardNo(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('deliveryCode')}</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={deliveryCode}
                              onChange={(e) => setDeliveryCode(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                            <button
                              onClick={() => setShowDeliveryCodeModal(true)}
                              className="px-2 py-2 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              <MoreVertical className="w-4 h-4 text-gray-600" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-end gap-4">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={isDeposit}
                              onChange={(e) => setIsDeposit(e.target.checked)}
                              className="w-4 h-4"
                            />
                            <span>{tm('deposit')}</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={isTransfer}
                              onChange={(e) => setIsTransfer(e.target.checked)}
                              className="w-4 h-4"
                            />
                            <span>{tm('transfer')}</span>
                          </label>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('campaignCode')}</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={campaignCode}
                              onChange={(e) => setCampaignCode(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                            <button
                              onClick={() => setShowCampaignModal(true)}
                              className="px-2 py-2 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              <MoreVertical className="w-4 h-4 text-gray-600" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('returnTransactionTypeLabel')}</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={returnTransactionType}
                              onChange={(e) => setReturnTransactionType(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                            <button
                              onClick={() => setShowReturnTransactionTypeModal(true)}
                              className="px-2 py-2 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              <MoreVertical className="w-4 h-4 text-gray-600" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={isTaxFree}
                              onChange={(e) => setIsTaxFree(e.target.checked)}
                              className="w-4 h-4"
                            />
                            <span>{tm('taxFree')}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            }

            {/* Ekli Dosyalar Sekmesi */}
            {
              activeTab === 'ekliDosyalar' && (
                <div className="bg-white rounded border border-gray-200 p-6">
                  <DocumentManager />
                </div>
              )
            }
          </div>

          {/* Modals outside main flow */}
          {(showCustomerModal || showSupplierModal) && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col overflow-hidden text-black">
                <div className={`bg-gradient-to-r ${showCustomerModal ? 'from-blue-600 to-blue-700' : 'from-teal-600 to-teal-700'} text-white px-6 py-4`}>
                  <h3 className="font-medium text-lg">{showCustomerModal ? tm('selectMusteri') : tm('selectTedarikci')}</h3>
                </div>
                <div className="px-4 pt-4">
                  <input
                    type="text"
                    value={showCustomerModal ? customerSearchModal : supplierSearchModal}
                    onChange={(e) => showCustomerModal ? setCustomerSearchModal(e.target.value) : setSupplierSearchModal(e.target.value)}
                    placeholder={tm('searchPlaceholder')}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg"
                    autoFocus
                  />
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-2">
                  {(showCustomerModal ? customers : suppliers)
                    .filter(item => ((item as any)?.code || '').toLowerCase().includes((showCustomerModal ? customerSearchModal : supplierSearchModal).toLowerCase()) || ((item as any)?.name || (item as any)?.title || '').toLowerCase().includes((showCustomerModal ? customerSearchModal : supplierSearchModal).toLowerCase()))
                    .map((item, index) => {
                      const code = (item as any)?.code || '';
                      const title = (item as any)?.name || (item as any)?.title || '';
                      return (
                        <button
                          key={index}
                          onClick={() => {
                            if (showCustomerModal) {
                              setCustomerId((item as any).id);
                              setCustomerCode(code);
                              setCustomerTitle(title);
                              setShowCustomerModal(false);
                            }
                            else {
                              setSupplierCode(code);
                              setSupplierId((item as any).id || '');
                              setSupplierTitle(title);
                              setShowSupplierModal(false);
                            }
                          }}
                          className="w-full px-4 py-3 border border-gray-200 rounded-lg text-left hover:border-blue-500 hover:bg-blue-50"
                        >
                          <p className="text-xs text-gray-500">{tm('code')}: {code}</p>
                          <p className="font-medium">{title}</p>
                        </button>
                      );
                    })}
                </div>
                <div className="p-4 border-t"><button onClick={() => { setShowCustomerModal(false); setShowSupplierModal(false); }} className="w-full py-2 bg-gray-100 rounded-lg">{tm('close')}</button></div>
              </div>
            </div>
          )}

          {showProductHistoryModal && selectedProductForHistory && (
            <ProductHistoryModal
              productCode={selectedProductForHistory.code}
              productName={selectedProductForHistory.name}
              productId={selectedProductForHistory.id}
              onClose={() => { setShowProductHistoryModal(false); setSelectedProductForHistory(null); }}
            />
          )}

          {showProductCatalogModal && (
            <POSProductCatalogModal
              products={products}
              mode="add-to-cart"
              onClose={() => { setShowProductCatalogModal(false); setSelectedRowForProduct(null); }}
              onAddToCart={(product, variant) => {
                if (selectedRowForProduct !== null) handleProductSelectForRow(product, variant, selectedRowForProduct);
                else handleProductFromCatalog(product, variant);
              }}
            />
          )}

          {showEditDateModal && <InvoiceEditDateModal currentDate={editDate} onSelect={setEditDate} onClose={() => setShowEditDateModal(false)} />}
          {showTransactionDateModal && <InvoiceEditDateModal currentDate={transactionDate} onSelect={setTransactionDate} onClose={() => setShowTransactionDateModal(false)} />}
          {showSpecialCodeModal && <InvoiceSpecialCodeModal currentCode={specialCode} onSelect={setSpecialCode} onClose={() => setShowSpecialCodeModal(false)} />}
          {showTradingGroupModal && <InvoiceTradingGroupModal currentGroup={tradingGroup} onSelect={setTradingGroup} onClose={() => setShowTradingGroupModal(false)} />}
          {showAuthorizationModal && <InvoiceAuthorizationModal currentAuth={authorizationCode} onSelect={setAuthorizationCode} onClose={() => setShowAuthorizationModal(false)} />}
          {showPaymentInfoModal && <InvoicePaymentInfoModal currentPaymentMethod={paymentMethod} onSelect={setPaymentMethod} onClose={() => setShowPaymentInfoModal(false)} />}
          {showWorkplaceModal && <InvoiceWorkplaceModal currentWorkplace={workplace} onSelect={setWorkplace} onClose={() => setShowWorkplaceModal(false)} />}
          {showWarehouseModal && <InvoiceWarehouseModal currentWarehouse={warehouse} onSelect={setWarehouse} onClose={() => setShowWarehouseModal(false)} />}
          {showSalespersonModal && <InvoiceSalespersonModal currentSalesperson={salespersonCode} onSelect={setSalespersonCode} onClose={() => setShowSalespersonModal(false)} />}

          {showSupplierHistory && (
            <SupplierHistoryModal
              isOpen={showSupplierHistory}
              onClose={() => setShowSupplierHistory(false)}
              supplierName={selectedSupplierHistory?.name || ''}
              onAddItems={handleInvoiceAddFromHistory}
            />
          )}
        </div>
      </div>
    </>
  );
}

