import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FULLSCREEN_BODY_PORTAL_Z } from '../../shared/FullscreenBodyPortal';
import { FileText, Plus, Search, X, Save, User, MoreVertical, AlertCircle, CheckCircle2, Calendar, Truck, Package, Clock, ChevronDown, ChevronRight, History, TrendingUp, TrendingDown, Percent, MoreHorizontal, Trash2, Settings, Minus, Square, Filter, ChevronUp, Check, Printer, PlusCircle, ArrowRight, ArrowLeft, RefreshCw, BarChart2, Edit3, Clipboard, ExternalLink, Camera, FileSpreadsheet, Upload } from 'lucide-react';
import { moduleTranslations, type Language } from '../../../locales/module-translations';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { usePermission } from '../../../shared/hooks/usePermission';
import { InvoiceItemsGrid } from './InvoiceItemsGrid';
import { InvoiceHeader } from './InvoiceHeader';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useAutoJournal, formatJournalResult } from '../../../hooks/useAutoJournal';
import { toast } from 'sonner';
import { formatNumber } from '../../../utils/formatNumber';
import { parseDecimalStringForInput, formatDecimalForTrInput, parseInvoiceWeightQuantity } from '../../../utils/numberFormatter';
import { normalizeWeightProductQuantity, syncWeightLineQuantities, hydrateWeightLineFromDb } from '../../../utils/scaleQuantity';
import { canonicalInvoiceLineType, isInvoiceServiceLineType, isInvoiceMaterialLineType, isInvoiceSupplierPayableLineType } from '../../../utils/invoiceLineType';
import { allocatePurchaseInvoiceLineCosts } from '../../../utils/purchasePromoCost';
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
import { InvoiceCariSelectModal, type InvoiceCariItem } from './InvoiceCariSelectModal';
import { useCampaignStore } from '../../../store/useCampaignStore';
import { BarcodeScanner as InventoryBarcodeScanner } from '../../inventory/stock/BarcodeScanner';
import { useResponsive } from '../../../hooks/useResponsive';
import { priceChangeVouchersAPI } from '../../../services/api/priceChangeVouchers';
import { supplierAPI, type Supplier } from '../../../services/api/suppliers';
import { customerAPI } from '../../../services/api/customers';
import { invoicesAPI } from '../../../services/api/index';
import { serviceAPI, Service } from '../../../services/serviceAPI';
import { postgres, getAppDefaultCurrency, DB_SETTINGS } from '../../../services/postgres';
import { IS_BROWSER } from '../../../utils/env';
import { productAPI } from '../../../services/api/products';
import {
  currencyAPI,
  exchangeRateAPI,
  pickExchangeRateValue,
  crossRateDocumentToLedgerFromLatest,
  resolveDocumentCurrencyRateToLedger,
  unitAPI,
  type Currency,
  type ExchangeRate
} from '../../../services/api/masterData';
import { unitSetAPI } from '../../../services/unitSetAPI';
import type { UnitMasterRow } from '../../../utils/unitOptions';
import {
  downloadPurchaseInvoiceImportTemplate,
  parsePurchaseInvoiceExcelArrayBuffer,
  applyPurchaseExcelRowQuantityAsBaseStock,
} from '../../../utils/purchaseInvoiceExcelImport';
import {
  dbPaymentMethodToFormCode,
  formCodeToDbPaymentMethod,
  isPosRetailPaymentContext,
  paymentFormCodeTranslationKey,
  paymentMethodImpliesPaidNow,
  RETAIL_SALES_INVOICE_TRCODE,
} from '../../../utils/paymentMethodUtils';
import { buildInvoiceHeaderFieldsFromForm, readInvoiceHeaderFields } from '../../../utils/invoiceHeaderFields';

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

/** Karttaki USD alış/satış fiyatını fatura birim fiyatına çevirir; fatura dövizi USD ise kur uygulanmaz. */
function usdFieldToInvoiceUnitPrice(
  usdPrice: number,
  unitMult: number,
  invoiceCurrency: string,
  finalRateToLocal: number
): number {
  if (usdPrice <= 0) return 0;
  const m = unitMult > 0 ? unitMult : 1;
  const doc = (invoiceCurrency || '').trim().toUpperCase();
  if (doc === 'USD') {
    return Math.round(usdPrice * m * 100) / 100;
  }
  return Math.round(usdPrice * finalRateToLocal * m);
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
  /** Sayım sonrası taslak: stok/FIFO/muhasebe tekrarını engelle */
  createSaveOptions?: { skipProductStockUpdate?: boolean };
}

// Mock Products - lastPurchasePrice eklendi
const mockProducts = [
  { code: 'GID-001', name: 'Süt 1L', unit: 'Adet', price: 3500, vat: 0, barcode: '8690000000001', lastPurchasePrice: 3200 },
  { code: 'GID-002', name: 'Ekmek Beyaz', unit: 'Adet', price: 1500, vat: 0, barcode: '8690000000002', lastPurchasePrice: 1400 },
  { code: 'GID-003', name: 'Pirinç 1Kg', unit: 'Kg', price: 4000, vat: 0, barcode: '8690000000003', lastPurchasePrice: 3800 },
  { code: 'GID-004', name: 'Yağ 1L', unit: 'Litre', price: 8500, vat: 0, barcode: '8690000000004', lastPurchasePrice: 8200 },
  { code: 'GID-005', name: 'Şeker 1Kg', unit: 'Kg', price: 3000, vat: 0, barcode: '8690000000005', lastPurchasePrice: 2800 },
];

function invoiceEditLineToFormAmounts(
  item: any,
  headerCurrency: string,
  headerRate: number
): { unitPrice: number; amount: number; netAmount: number } {
  const hdrCur = String(headerCurrency || 'IQD').trim().toUpperCase();
  const rowCur = String(item.currency || hdrCur || 'IQD').trim().toUpperCase();
  const rate = headerRate > 0 ? headerRate : 1;
  const uFCraw = item.unit_price_fc ?? item.unitPriceFC;
  const uFC =
    uFCraw != null && uFCraw !== '' && !Number.isNaN(parseFloat(String(uFCraw)))
      ? parseFloat(String(uFCraw))
      : NaN;
  const uLoc = parseFloat(String(item.unitPrice ?? item.unit_price ?? item.price ?? 0));
  /** Döviz satırında `unit_price_fc` bazen 0 kayıtlı; yerel `unit_price` doluysa FC sıfırını yok say. */
  const useFc =
    Number.isFinite(uFC) && rowCur !== 'IQD' && !(uFC === 0 && uLoc > 0);
  const unitPrice = useFc ? uFC : uLoc;

  const hasLedgerGross =
    item.total_amount != null &&
    item.total_amount !== '' &&
    !Number.isNaN(parseFloat(String(item.total_amount)));
  const hasLedgerNet =
    item.net_amount != null &&
    item.net_amount !== '' &&
    !Number.isNaN(parseFloat(String(item.net_amount)));

  let amount: number;
  if (useFc && rate !== 0 && hasLedgerGross) {
    amount = parseFloat(String(item.total_amount)) / rate;
  } else {
    amount = parseFloat(
      String(item.amount ?? item.gross_amount ?? item.total ?? item.total_amount ?? 0)
    );
  }

  let netAmount: number;
  if (useFc && rate !== 0 && hasLedgerNet) {
    netAmount = parseFloat(String(item.net_amount)) / rate;
  } else {
    netAmount = parseFloat(
      String(item.netAmount ?? item.net_amount ?? item.amount ?? item.total ?? 0)
    );
  }

  /** Taslak satırlarda (sayım → alış) total alanları boş/0 olabilir; brüt = miktar × birim fiyat */
  const qty = parseFloat(String(item.quantity ?? item.qty ?? 0)) || 0;
  if (!Number.isFinite(amount)) amount = 0;
  if (!Number.isFinite(netAmount)) netAmount = 0;
  if (Math.abs(amount) < 1e-9 && qty > 0 && unitPrice > 0) {
    amount = qty * unitPrice;
  }
  if (Math.abs(netAmount) < 1e-9 && amount > 0) {
    const discPct = parseFloat(String(item.discount_percent ?? item.discountPercent ?? item.discount ?? 0)) || 0;
    const discFix = parseFloat(String(item.discount_amount ?? item.discountAmount ?? 0)) || 0;
    const d = discFix > 0 ? discFix : amount * (discPct / 100);
    netAmount = amount - d;
  }

  return { unitPrice, amount, netAmount };
}

/**
 * Tarayıcı veya doğrudan PG (köprü) modunda: Supabase FIFO katmanına N× istek atmak yerine
 * yerel ürün kartındaki alış fiyatından tahmini maliyet (kayıt + canlı kar önizlemesi hızlanır).
 */
function preferLocalCatalogFifoOverCloud(): boolean {
  return IS_BROWSER || DB_SETTINGS.connectionProvider === 'db';
}

function buildLocalCatalogFifoCostMap(
  validItems: InvoiceItem[],
  products: Product[],
  storeProducts: Product[]
): Map<string, { unitCost: number; totalCost: number; available: boolean }> {
  const results = new Map<string, { unitCost: number; totalCost: number; available: boolean }>();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const resolveProduct = (item: InvoiceItem): Product | undefined => {
    if (uuidRe.test(item.code)) {
      return products.find((p) => p.id === item.code) || storeProducts.find((p) => p.id === item.code);
    }
    return products.find((p) => p.code === item.code) || storeProducts.find((p) => p.code === item.code);
  };

  for (const item of validItems) {
    let productId = item.code;
    if (!uuidRe.test(item.code)) {
      const pr = resolveProduct(item);
      if (pr?.id) productId = pr.id;
    }
    const pr =
      resolveProduct(item) ||
      products.find((p) => p.id === productId) ||
      storeProducts.find((p) => p.id === productId);
    /** PostgREST/SQL satırı: `purchase_price`; `mapDatabaseProductToProduct` öncelikle `cost` doldurur. */
    const unitPurchase = Number(
      pr
        ? ((pr as { purchase_price?: number; purchasePrice?: number; cost?: number }).purchase_price ??
            (pr as { purchase_price?: number; purchasePrice?: number; cost?: number }).purchasePrice ??
            (pr as { cost?: number }).cost ??
            0)
        : 0
    );
    const baseQty = item.baseQuantity ?? item.quantity * (item.multiplier || 1);
    const totalCost = baseQty * unitPurchase;
    results.set(productId, {
      unitCost: baseQty > 0 ? totalCost / baseQty : 0,
      totalCost,
      available: unitPurchase > 0,
    });
  }
  return results;
}

function isInvoiceDiscountLineType(type: string | undefined): boolean {
  return canonicalInvoiceLineType(type) === 'İndirim';
}

/** Barkod/kod ile doldurulabilir satır — alışta promosyon da stok alır */
function isInvoiceProductBarcodeLineType(type: string | undefined, category?: string): boolean {
  const canonical = canonicalInvoiceLineType(type);
  if (category === 'Alis') return canonical === 'Malzeme' || canonical === 'Promosyon';
  return canonical === 'Malzeme';
}

function barcodeLookupAttempts(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const out: string[] = [];
  const add = (s: string) => {
    const x = s.trim();
    if (x && !out.includes(x)) out.push(x);
  };
  add(t);
  const noLead = t.replace(/^0+/, '');
  if (noLead && noLead !== t) add(noLead);
  if (/^\d+$/.test(t) && t.length < 14) {
    const pad13 = t.padStart(13, '0');
    if (pad13 !== t) add(pad13);
  }
  return out;
}

/** Formdaki işlem tarihi (örn. tr-TR dd.MM.yyyy) → exchange_rates sorgusu için YYYY-MM-DD */
function transactionDateToIsoDateString(transactionDate: string): string {
  const dateParts = transactionDate.split('.');
  if (dateParts.length === 3) {
    const d = parseInt(dateParts[0], 10);
    const m = parseInt(dateParts[1], 10);
    const y = parseInt(dateParts[2], 10);
    if (!Number.isNaN(d) && !Number.isNaN(m) && !Number.isNaN(y)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const dt = new Date(transactionDate);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

/** İşlem tarihi (dd.MM.yyyy veya parse edilebilir string) → Date; Kaydet butonu `isTransactionAllowed(transactionDate)` ile uyumlu */
function parseTransactionDateInput(date: Date | string): Date {
  if (date instanceof Date) return date;
  if (typeof date !== 'string') return new Date();
  const dateParts = date.trim().split('.');
  if (dateParts.length === 3) {
    const d = parseInt(dateParts[0], 10);
    const m = parseInt(dateParts[1], 10);
    const y = parseInt(dateParts[2], 10);
    if (!Number.isNaN(d) && !Number.isNaN(m) && !Number.isNaN(y)) {
      return new Date(y, m - 1, d);
    }
  }
  const dt = new Date(date);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

export function UniversalInvoiceForm({
  invoiceType,
  customers: customersProp = [],
  products: productsProp = [],
  onClose,
  editData,
  createSaveOptions,
}: UniversalInvoiceFormProps) {
  const { language, tm } = useLanguage();
  const { user } = useAuth();
  const { darkMode } = useTheme();
  const { canViewPurchasePricing } = usePermission();

  const { selectedFirm, selectedPeriod, selectedBranch, selectedWarehouse } = useFirmaDonem();
  // Alias for backward compatibility with existing code
  const selectedFirma = selectedFirm;
  const selectedDonem = selectedPeriod;

  const normalizeCurrencyCode = (value: unknown, fallback = 'IQD'): string => {
    const raw = String(value ?? fallback)
      .trim()
      .toUpperCase();
    return raw.length >= 2 ? raw.slice(0, 10) : fallback;
  };

  const normalizeImportIssueMessages = (issues: unknown[]): string[] =>
    issues
      .map((item) => (item == null ? '' : typeof item === 'string' ? item : String(item)))
      .filter((s) => s.length > 0);

  /** Deftere / yerel gösterim: firma ana para veya sistem varsayılanı (IQD sabit değil) */
  const ledgerCurrency = useMemo(() => {
    return normalizeCurrencyCode(selectedFirm?.ana_para_birimi || getAppDefaultCurrency() || 'IQD');
  }, [selectedFirm?.ana_para_birimi]);

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
        const targetDate = parseTransactionDateInput(date);
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

  const lookupInvoiceProductByKey = useCallback(
    async (raw: string): Promise<{ product: Product; unitInfo?: any } | null> => {
      const attempts = barcodeLookupAttempts(raw.trim());
      for (const key of attempts) {
        const r = await productAPI.lookupByBarcode(key);
        if (r) return r;
        const byCode = await productAPI.getByCode(key);
        if (byCode) return { product: byCode };
      }
      const pool: Product[] = [];
      const seen = new Set<string>();
      for (const p of [...storeProducts, ...(productsProp.length > 0 ? productsProp : [])]) {
        const k = (p as Product)?.id || (p as Product)?.code || '';
        if (k && !seen.has(k)) {
          seen.add(k);
          pool.push(p as Product);
        }
      }
      if (pool.length === 0) {
        for (const p of products) {
          const k = p?.id || p?.code || '';
          if (k && !seen.has(k)) {
            seen.add(k);
            pool.push(p);
          }
        }
      }
      for (const key of attempts) {
        const rawLower = key.toLowerCase();
        const local = pool.find(
          (pr) =>
            (pr.code && pr.code.trim().toLowerCase() === rawLower) ||
            (pr.barcode && pr.barcode.trim() === key)
        );
        if (local) return { product: local };
      }
      return null;
    },
    [storeProducts, productsProp, products]
  );

  // Suppliers ve Customers state - Veritabanından çekilecek
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>(customersProp);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [services, setServices] = useState<Service[]>([]); // Services state

  // API fetches for dropdowns
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [latestRates, setLatestRates] = useState<ExchangeRate[]>([]);
  /** Elle kur girildiyse tarih/master güncellemesi ezmesin; döviz veya kur türü değişince sıfırlanır */
  const currencyRateUserTouchedRef = useRef(false);

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
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [quickBarcodeInput, setQuickBarcodeInput] = useState('');
  const { isMobile } = useResponsive();

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
  const [paymentMethod, setPaymentMethod] = useState<string>(() => {
    if (editData) {
      return (
        dbPaymentMethodToFormCode(
          (editData as any).payment_method ?? (editData as any).paymentMethod,
        ) || 'ACIK_CARI'
      );
    }
    return 'ACIK_CARI';
  }); // Form kodu: NAKIT, KREDIKARTI, ACIK_CARI, …
  const [cashierName, setCashierName] = useState(() => editData?.cashier || ''); // Kasiyer / iade yapan
  const isSalesReturnForm = invoiceType.code === 3;
  const isPosRetail = useMemo(
    () =>
      invoiceType.code === RETAIL_SALES_INVOICE_TRCODE ||
      isPosRetailPaymentContext({
        source: (editData as any)?.source,
        paymentMethod: (editData as any)?.payment_method ?? paymentMethod,
        invoiceTypeCode: invoiceType.code,
        cashier: (editData as any)?.cashier ?? cashierName,
      }),
    [editData, invoiceType.code, cashierName, paymentMethod],
  );
  const paymentMethodLabel = useMemo(() => {
    if (!paymentMethod || paymentMethod === 'ACIK_CARI') return tm('paymentOpenAccount');
    const key = paymentFormCodeTranslationKey(paymentMethod);
    return key === 'openTerms' ? paymentMethod : tm(key);
  }, [paymentMethod, tm]);
  const resolvePaymentMethodForDb = useCallback(
    () => formCodeToDbPaymentMethod(paymentMethod, { posRetail: isPosRetail }),
    [paymentMethod, isPosRetail],
  );
  const resolveAuthUserDisplayName = useCallback(() => {
    const name = String(user?.full_name || user?.username || '').trim();
    return name;
  }, [user?.full_name, user?.username]);
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
  const [selectedCariBalance, setSelectedCariBalance] = useState<number | null>(null);
  const [selectedCariPhone, setSelectedCariPhone] = useState<string | null>(null);
  const [currency, setCurrency] = useState(() => {
    const ed = (editData as any)?.currency;
    if (ed) return String(ed).trim().toUpperCase().slice(0, 10);
    if (selectedFirm?.ana_para_birimi) return String(selectedFirm.ana_para_birimi).trim().toUpperCase().slice(0, 10);
    return getAppDefaultCurrency();
  });
  const [currencyRate, setCurrencyRate] = useState(() => parseFloat((editData as any)?.currency_rate) || 1); // Kuru (sayı; DB/hesap)
  const [currencyRateStr, setCurrencyRateStr] = useState(''); // Kur metin kutusu: 1,54 veya 1.54
  const [reportingCurrency, setReportingCurrency] = useState(() => {
    const ed = (editData as any)?.reporting_currency;
    if (ed) return String(ed).trim().toUpperCase().slice(0, 10);
    const rc = selectedFirm?.raporlama_para_birimi || selectedFirm?.ana_para_birimi || getAppDefaultCurrency();
    return String(rc).trim().toUpperCase().slice(0, 10);
  });
  const [reportingCurrencyRate, setReportingCurrencyRate] = useState(1); // Raporlama Döviz Kuru
  const [valuationRate, setValuationRate] = useState(1); // Değerleme Kuru
  const [currencyRateType, setCurrencyRateType] = useState('Satış'); // Kur Türü (Alış, Satış, Efektif Alış, Efektif Satış)
  const [isCurrencyTransaction, setIsCurrencyTransaction] = useState(false); // Dövizli İşlem Checkbox
  const [unitSets, setUnitSets] = useState<any[]>([]); // Birim setleri
  const [masterUnits, setMasterUnits] = useState<UnitMasterRow[]>([]); // Kart birimleri (units)
  const [transactionType, setTransactionType] = useState(''); // İşlem
  const [shippingAccountCode, setShippingAccountCode] = useState(''); // Sevkiyat Hesabı Kodu
  const [shippingAccountTitle, setShippingAccountTitle] = useState(''); // Sevkiyat Hesabı Ünvanı
  const [shippingAddressCode, setShippingAddressCode] = useState(''); // Sevkiyat Adresi Kodu
  const [shippingAddressDesc, setShippingAddressDesc] = useState(''); // Sevkiyat Adresi Açıklaması
  const [waybillType, setWaybillType] = useState(''); // İrsaliye Türü
  const [waybillNo, setWaybillNo] = useState(''); // İrsaliye No
  const [waybillDocumentNo, setWaybillDocumentNo] = useState(''); // İrsaliye Belge No
  const [description, setDescription] = useState(''); // Açıklama
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
      const hdrCur = String((editData as any)?.currency || 'IQD');
      const hdrRate = parseFloat(String((editData as any)?.currency_rate)) || 1;
      return editData.items.map((item: any, index: number) => {
        const fc = invoiceEditLineToFormAmounts(item, hdrCur, hdrRate);
        const hydrated = hydrateWeightLineFromDb({
          quantity: item.quantity || 0,
          baseQuantity: item.baseQuantity || item.base_quantity,
          unit: item.unit || 'Adet',
          multiplier: item.multiplier || item.unit_multiplier || 1,
        });
        return {
          id: item.id || `item-${index}`,
          type: canonicalInvoiceLineType(item.type ?? item.item_type),
          code: item.code || item.productId || '',
          description: item.description || item.productName || '',
          description2: '',
          quantity: hydrated.quantity,
          unit: item.unit || 'Adet',
          unitPrice: fc.unitPrice,
          discountPercent: item.discountPercent || item.discount || 0,
          discountAmount:
            fc.amount > 1e-9 ? Math.max(0, fc.amount - fc.netAmount) : Number(item.discountAmount || 0) || 0,
          amount: fc.amount,
          netAmount: fc.netAmount,
          lastPurchasePrice: item.lastPurchasePrice,
          priceDifference: item.priceDifference,
          priceDifferencePercent: item.priceDifferencePercent,
          unitsetId: item.unitsetId || item.unitset_id,
          multiplier: item.multiplier || item.unit_multiplier || 1,
          baseQuantity: hydrated.baseQuantity,
          unitPriceFC: item.unitPriceFC ?? item.unit_price_fc,
          expiryDate: item.expiryDate ?? (item.expiry_date ? String(item.expiry_date).slice(0, 10) : ''),
          batchNo: item.batchNo ?? item.batch_no ?? '',
        };
      });
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
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProductIndex, setSelectedProductIndex] = useState(-1);
  const [searchingRowIndex, setSearchingRowIndex] = useState(-1);
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showCashRegisterDropdown, setShowCashRegisterDropdown] = useState(false);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [showProductHistoryModal, setShowProductHistoryModal] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<{ code: string; name: string; id: string } | null>(null);
  const [bulkPriceIncreasePercent, setBulkPriceIncreasePercent] = useState<number | ''>('');
  const [showProductCatalogModal, setShowProductCatalogModal] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [totalGrossProfit, setTotalGrossProfit] = useState(0);
  const [profitMargin, setProfitMargin] = useState(0);

  /** Dip (fatura seviyesi) indirim — satır indirimine ek */
  const [footerDiscountMode, setFooterDiscountMode] = useState<'percentage' | 'amount'>(() => {
    const hf = readInvoiceHeaderFields((editData as any)?.header_fields);
    const m = String(hf.footerDiscountMode || '').trim();
    return m === 'amount' ? 'amount' : 'percentage';
  });
  const [footerDiscountPercent, setFooterDiscountPercent] = useState(() => {
    const hf = readInvoiceHeaderFields((editData as any)?.header_fields);
    const n = parseFloat(String(hf.footerDiscountPercent ?? ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const [footerDiscountAmount, setFooterDiscountAmount] = useState(() => {
    const hf = readInvoiceHeaderFields((editData as any)?.header_fields);
    const n = parseFloat(String(hf.footerDiscountAmount ?? ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const [footerDiscountPercentStr, setFooterDiscountPercentStr] = useState(() => {
    const hf = readInvoiceHeaderFields((editData as any)?.header_fields);
    const n = parseFloat(String(hf.footerDiscountPercent ?? ''));
    return Number.isFinite(n) && n > 0 ? formatDecimalForTrInput(n) : '';
  });
  const [footerDiscountAmountStr, setFooterDiscountAmountStr] = useState(() => {
    const hf = readInvoiceHeaderFields((editData as any)?.header_fields);
    const n = parseFloat(String(hf.footerDiscountAmount ?? ''));
    return Number.isFinite(n) && n > 0 ? formatDecimalForTrInput(n) : '';
  });

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

    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
      const newItems = data.items.map((item: any, index: number) => {
        const qty = item.quantity || 1;
        const price = item.price || item.unitPrice || 0;
        return {
          id: `voice-${Date.now()}-${index}`,
          type: 'Malzeme',
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
    const editingId = (editData as any)?.id;

    const handleVoiceNavigate = (e: any) => {
      if (editingId) return;
      const { formData } = e.detail;
      if (formData) {
        populateFromVoiceData(formData);
      }
    };

    if (!editingId) {
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
    }

    window.addEventListener('voiceCommandNavigate', handleVoiceNavigate as EventListener);
    return () => window.removeEventListener('voiceCommandNavigate', handleVoiceNavigate as EventListener);
  }, [editData?.id]);

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

  /** Döviz seçici: ana para + güncel seçim + yaygın kodlar + master */
  const invoiceCurrencyCodes = useMemo(() => {
    const s = new Set<string>();
    [ledgerCurrency, currency, 'TRY', 'USD', 'EUR', 'GBP', 'IQD', 'IRR', 'AED'].forEach(c => {
      if (c?.trim()) s.add(c.trim().toUpperCase().slice(0, 10));
    });
    currencies.forEach(c => {
      if (c?.code?.trim()) s.add(c.code.trim().toUpperCase().slice(0, 10));
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [ledgerCurrency, currency, currencies]);

  /** Kart USD fiyatını fatura dövizine çevirmek: 1 USD = ? fatura dövizi (çapraz kur, örn. TRY ≈ 34,5; ham 1312 değil). */
  const resolveUsdRateForCardPrice = useCallback((): number => {
    const docCur = (currency || '').trim().toUpperCase();
    if (!docCur || docCur === 'USD') {
      const row = latestRates.find(r => String(r.currency_code).trim().toUpperCase() === 'USD');
      if (row) return pickExchangeRateValue(row, currencyRateType);
      return currencyRate > 0 ? currencyRate : 1;
    }
    const cross = crossRateDocumentToLedgerFromLatest('USD', docCur, latestRates, currencyRateType);
    if (cross != null && cross > 0) return cross;
    const row = latestRates.find(r => String(r.currency_code).trim().toUpperCase() === 'USD');
    const r = row ? pickExchangeRateValue(row, currencyRateType) : currencyRate > 0 ? currencyRate : 1;
    /* Küçük kur (örn. 1,54) artık tabloda gerçek değer; eski *1000 hack kaldırıldı */
    return r > 0 ? r : 1;
  }, [currency, latestRates, currencyRate, currencyRateType]);

  // Yeni fatura: firma / sistem ana parasına hizala (düzenlemede dokunma)
  useEffect(() => {
    if (editData) return;
    if (!selectedFirm) return;
    const ac = normalizeCurrencyCode(selectedFirm.ana_para_birimi || getAppDefaultCurrency());
    setCurrency(ac);
    const rc = normalizeCurrencyCode(selectedFirm.raporlama_para_birimi || ac);
    setReportingCurrency(rc);
  }, [editData, selectedFirm?.logicalref, selectedFirm?.ana_para_birimi, selectedFirm?.raporlama_para_birimi]);

  useEffect(() => {
    currencyRateUserTouchedRef.current = false;
  }, [(editData as any)?.id]);

  /** İşlem tarihi değişince master kur yeniden yüklensin; eski elle/yanlış metin kur alanında kalmasın */
  useEffect(() => {
    currencyRateUserTouchedRef.current = false;
  }, [transactionDate]);

  // Düzenleme: belge dövizi = seçim → DB’deki kayıtlı kur; farklı döviz → işlem tarihine göre kur
  useEffect(() => {
    const id = (editData as any)?.id;
    if (!id) return;
    const lc = String(ledgerCurrency || '').trim().toUpperCase();
    const docCur = String((editData as any)?.currency || '').trim().toUpperCase();
    const loc = String(currency || '').trim().toUpperCase();

    if (loc === lc) {
      setCurrencyRate(1);
      return;
    }
    if (loc === docCur) {
      if (currencyRateUserTouchedRef.current) return;
      const cr = parseFloat(String((editData as any)?.currency_rate ?? ''));
      if (Number.isFinite(cr) && cr > 0) setCurrencyRate(cr);
      return;
    }

    if (currencyRateUserTouchedRef.current) return;

    let cancelled = false;
    (async () => {
      const iso = transactionDateToIsoDateString(transactionDate);
      try {
        let n: number | null = await resolveDocumentCurrencyRateToLedger(loc, lc, iso, currencyRateType);
        if (n == null || n <= 0) {
          n = crossRateDocumentToLedgerFromLatest(loc, lc, latestRates, currencyRateType);
        }
        if (n == null || n <= 0) {
          const row = await exchangeRateAPI.getRateAsOfDate(loc, iso);
          if (row) n = pickExchangeRateValue(row, currencyRateType);
        }
        if (n == null || n <= 0) {
          const rate = latestRates.find(
            r => String(r.currency_code).trim().toUpperCase() === loc
          );
          if (rate) n = pickExchangeRateValue(rate, currencyRateType);
        }
        if (cancelled || currencyRateUserTouchedRef.current) return;
        if (n != null && n > 0) setCurrencyRate(n);
      } catch (e) {
        console.error('[UniversalInvoiceForm] düzenleme kur:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    (editData as any)?.id,
    (editData as any)?.currency,
    (editData as any)?.currency_rate,
    currency,
    transactionDate,
    ledgerCurrency,
    currencyRateType,
    latestRates
  ]);

  // Yeni fatura: işlem tarihine göre exchange_rates’ten kur; yoksa son bilinen master kur
  useEffect(() => {
    if ((editData as any)?.id) return;

    if (currency === ledgerCurrency) {
      setCurrencyRate(1);
      return;
    }

    if (currencyRateUserTouchedRef.current) return;

    let cancelled = false;
    (async () => {
      const iso = transactionDateToIsoDateString(transactionDate);
      const lc = String(ledgerCurrency || '').trim().toUpperCase();
      const cur = String(currency || '').trim().toUpperCase();
      try {
        let n: number | null = await resolveDocumentCurrencyRateToLedger(cur, lc, iso, currencyRateType);
        if (n == null || n <= 0) {
          n = crossRateDocumentToLedgerFromLatest(cur, lc, latestRates, currencyRateType);
        }
        if (n == null || n <= 0) {
          const row = await exchangeRateAPI.getRateAsOfDate(cur, iso);
          if (row) n = pickExchangeRateValue(row, currencyRateType);
        }
        if (n == null || n <= 0) {
          const rate = latestRates.find(
            r => String(r.currency_code).trim().toUpperCase() === cur
          );
          if (rate) n = pickExchangeRateValue(rate, currencyRateType);
        }
        if (cancelled || currencyRateUserTouchedRef.current) return;
        if (n != null && n > 0) setCurrencyRate(n);
      } catch (e) {
        console.error('[UniversalInvoiceForm] tarih bazlı kur yüklenemedi:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currency,
    transactionDate,
    ledgerCurrency,
    currencyRateType,
    latestRates,
    (editData as any)?.id
  ]);

  useEffect(() => {
    if (currencyRateUserTouchedRef.current) return;
    if (currency === ledgerCurrency) {
      setCurrencyRateStr('');
      return;
    }
    if (Number.isFinite(currencyRate) && currencyRate > 0) {
      setCurrencyRateStr(formatDecimalForTrInput(currencyRate));
    } else {
      setCurrencyRateStr('');
    }
  }, [currencyRate, currency, ledgerCurrency]);

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

  // Birim kartı + birim setleri (Tauri / PostgREST / doğrudan PG tek API zinciri)
  useEffect(() => {
    const loadUnitsAndSets = async () => {
      try {
        const [unitRows, setsWithLines] = await Promise.all([
          unitAPI.getAll(),
          unitSetAPI.getAll(),
        ]);
        setMasterUnits(unitRows || []);
        setUnitSets(Array.isArray(setsWithLines) ? setsWithLines : []);
      } catch (err) {
        console.error('[UniversalInvoice] Units / unit sets load failed:', err);
      }
    };
    loadUnitsAndSets();
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
        const currentSupplier = suppliers.find(s => s.id === supplierId);
        if (currentSupplier && currentSupplier.code === supplierCode) return;

        const found = suppliers.find(s => s.code === supplierCode);
        if (found) {
          setSupplierId(found.id);
          setSupplierTitle(found.name);
          return;
        }

        try {
          const fetched = await supplierAPI.getByCode(supplierCode);
          if (fetched) {
            setSupplierId(fetched.id);
            setSupplierTitle(fetched.name);
          }
        } catch (err) {
          console.error('[UniversalInvoice] Supplier lookup failed:', err);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [supplierCode, suppliers]);

  const isColumnVisible = useCallback(
    (columnId: string) => {
      if (itemColumnVisibility[columnId] === false) return false;
      if (!canViewPurchasePricing()) {
        if (invoiceType.category === 'Satis' && columnId === 'profit') return false;
        if (invoiceType.category === 'Alis' && columnId === 'profitMarginPercent') return false;
      }
      return true;
    },
    [itemColumnVisibility, canViewPurchasePricing, invoiceType.category]
  );

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
  ], [itemColumnVisibility, invoiceType.category, invoiceType.code, tm, isColumnVisible]);

  /** Grid yalnızca `itemColumnVisibility` okuduğu için RBAC ile zorunlu gizlemeyi burada birleştiriyoruz */
  const effectiveItemColumnVisibility = useMemo(() => {
    const merged: Record<string, boolean> = { ...itemColumnVisibility };
    if (!canViewPurchasePricing()) {
      if (invoiceType.category === 'Satis') merged.profit = false;
      if (invoiceType.category === 'Alis') merged.profitMarginPercent = false;
    }
    return merged;
  }, [itemColumnVisibility, canViewPurchasePricing, invoiceType.category]);

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

  useEffect(() => {
    try {
      localStorage.setItem('invoiceItemColumnVisibility', JSON.stringify(itemColumnVisibility));
    } catch {
      /* ignore */
    }
  }, [itemColumnVisibility]);

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

  const gridRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const cashRegisterDropdownRef = useRef<HTMLDivElement>(null);
  const purchaseExcelInputRef = useRef<HTMLInputElement>(null);
  const [purchaseExcelImporting, setPurchaseExcelImporting] = useState(false);
  /** Excel içe aktarmada atlanan satırlar — tam liste formda gösterilir */
  const [purchaseExcelImportReport, setPurchaseExcelImportReport] = useState<{
    importedCount: number;
    issues: string[];
  } | null>(null);

  // Header renk belirleme
  const getHeaderColor = () => {
    switch (invoiceType.category) {
      case 'Satis': return { gradient: 'from-[var(--asin-primary,#0E2433)] to-[var(--asin-primary,#0E2433)]', solid: 'bg-[var(--asin-accent,#1FA8A0)]' };
      case 'Alis': return { gradient: 'from-teal-600 to-teal-700', solid: 'bg-teal-600' };
      case 'Hizmet':
        // Hizmet faturaları için: Verilen (code 7) -> Asin ink/accent, Alınan (code 8) -> teal
        if (invoiceType.code === 7) {
          return { gradient: 'from-[var(--asin-primary,#0E2433)] to-[var(--asin-primary,#0E2433)]', solid: 'bg-[var(--asin-accent,#1FA8A0)]' };
        } else if (invoiceType.code === 8) {
          return { gradient: 'from-teal-600 to-teal-700', solid: 'bg-teal-600' };
        }
        return { gradient: 'from-[var(--asin-accent,#1FA8A0)] to-[#178f88]', solid: 'bg-[var(--asin-accent,#1FA8A0)]' };
      case 'Iade': return { gradient: 'from-red-600 to-red-700', solid: 'bg-red-600' };
      case 'Irsaliye': return { gradient: 'from-orange-600 to-orange-700', solid: 'bg-orange-600' };
      case 'Siparis': return { gradient: 'from-[var(--asin-primary,#0E2433)] to-[#163447]', solid: 'bg-[var(--asin-primary,#0E2433)]' };
      case 'Teklif': return { gradient: 'from-[var(--asin-accent,#1FA8A0)] to-[#178f88]', solid: 'bg-[var(--asin-accent,#1FA8A0)]' };
      default: return { gradient: 'from-gray-600 to-gray-700', solid: 'bg-gray-600' };
    }
  };

  // Cari hesap border rengi
  const getCariBorderColor = () => {
    if (darkMode) {
      switch (invoiceType.category) {
        case 'Satis': return 'border-[var(--asin-accent,#1FA8A0)] bg-gray-800';
        case 'Alis': return 'border-teal-500 bg-gray-800';
        case 'Hizmet':
          if (invoiceType.code === 7) return 'border-[var(--asin-accent,#1FA8A0)] bg-gray-800';
          if (invoiceType.code === 8) return 'border-teal-500 bg-gray-800';
          return 'border-[var(--asin-accent,#1FA8A0)] bg-gray-800';
        case 'Iade': return 'border-red-500 bg-gray-800';
        case 'Irsaliye': return 'border-orange-500 bg-gray-800';
        case 'Siparis': return 'border-[var(--asin-primary,#0E2433)] bg-gray-800';
        case 'Teklif': return 'border-[var(--asin-accent,#1FA8A0)] bg-gray-800';
        default: return 'border-gray-500 bg-gray-800';
      }
    }
    switch (invoiceType.category) {
      case 'Satis': return 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)]';
      case 'Alis': return 'border-teal-600 bg-teal-50';
      case 'Hizmet':
        // Hizmet faturaları için: Verilen (code 7) -> Asin ink/accent, Alınan (code 8) -> teal
        if (invoiceType.code === 7) {
          return 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)]';
        } else if (invoiceType.code === 8) {
          return 'border-teal-600 bg-teal-50';
        }
        return 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)]';
      case 'Iade': return 'border-red-600 bg-red-50';
      case 'Irsaliye': return 'border-orange-600 bg-orange-50';
      case 'Siparis': return 'border-[var(--asin-primary,#0E2433)] bg-[var(--asin-accent-muted,#D5F0EE)]';
      case 'Teklif': return 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)]';
      default: return 'border-gray-600 bg-gray-50';
    }
  };

  // Cari hesap text rengi
  const getCariTextColor = () => {
    switch (invoiceType.category) {
      case 'Satis': return 'text-[var(--asin-accent,#1FA8A0)]';
      case 'Alis': return 'text-teal-600';
      case 'Hizmet':
        // Hizmet faturaları için: Verilen (code 7) -> Asin ink/accent, Alınan (code 8) -> teal
        if (invoiceType.code === 7) {
          return 'text-[var(--asin-accent,#1FA8A0)]';
        } else if (invoiceType.code === 8) {
          return 'text-teal-600';
        }
        return 'text-[var(--asin-accent,#1FA8A0)]';
      case 'Iade': return 'text-red-600';
      case 'Irsaliye': return 'text-orange-600';
      case 'Siparis': return 'text-[var(--asin-primary,#0E2433)]';
      case 'Teklif': return 'text-[var(--asin-accent,#1FA8A0)]';
      default: return 'text-gray-600';
    }
  };

  const createInvoiceLineId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const createEmptyInvoiceLine = (type: InvoiceItem['type'] = 'Malzeme'): InvoiceItem => ({
    id: createInvoiceLineId(),
    type,
    code: '',
    description: '',
    description2: '',
    quantity: 0,
    unit: 'Brüt',
    unitPrice: 0,
    discountPercent: 0,
    discountAmount: 0,
    amount: 0,
    netAmount: 0,
  });

  const lineIsBlank = (row: InvoiceItem) =>
    !row.code && row.quantity === 0 && row.unitPrice === 0;

  const withTrailingEmptyLine = (list: InvoiceItem[]): InvoiceItem[] => {
    const last = list[list.length - 1];
    if (!last || !lineIsBlank(last)) {
      return [...list, createEmptyInvoiceLine()];
    }
    return list;
  };

  /** Barkod / ürün kodu ile satırı doldur (lookup sonucu) */
  const applyLookupResultToInvoiceItem = (baseItem: InvoiceItem, product: Product, unitInfo?: any): InvoiceItem => {
    const item = { ...baseItem };
    item.code = product.code || (product as any).id || '';
    item.description = product.name || '';
    const isPurchase = invoiceType.category === 'Alis';
    const docUsd = (currency || '').trim().toUpperCase() === 'USD';
    const systemUsdRate = resolveUsdRateForCardPrice();
    let effectiveRate = (product as any).customExchangeRate || (product as any).custom_exchange_rate || 0;
    let finalRate = effectiveRate > 0 ? effectiveRate : systemUsdRate;
    const isAutoCalc = (product as any).autoCalculateUSD || (product as any).auto_calculate_usd;
    const usdPurchaseCard = Number((product as any).purchasePriceUSD ?? (product as any).purchase_price_usd ?? 0);
    const usdSaleCard = Number((product as any).salePriceUSD ?? (product as any).sale_price_usd ?? 0);
    /** Kart USD alanından fiyat kullan: fatura USD ise her zaman (varsa); değilse yalnızca auto USD açıksa */
    const useUsdPurchase = usdPurchaseCard > 0 && (docUsd || isAutoCalc);
    const useUsdSale = usdSaleCard > 0 && (docUsd || isAutoCalc);

    if (unitInfo) {
      item.unit = unitInfo.unit || unitInfo.unit_code || product.unit || 'Adet';
      let unitMult = unitInfo.multiplier || 1;
      const pUnitsetId = (product as any).unitsetId || (product as any).unitset_id;
      if (unitMult === 1 && item.unit !== 'Adet' && pUnitsetId) {
        const unitSet = unitSets.find((us: any) => us.id === pUnitsetId);
        const line = unitSet?.lines?.find((l: any) => l.name === item.unit || l.code === item.unit);
        if (line) unitMult = parseFloat(line.conv_fact1) || parseFloat(line.multiplier1) || 1;
      }
      item.multiplier = unitMult;
      let resolvedPrice = 0;
      if (isPurchase) {
        if (useUsdPurchase) {
          resolvedPrice = usdFieldToInvoiceUnitPrice(usdPurchaseCard, unitMult, currency, finalRate);
        } else {
          resolvedPrice = (unitInfo.purchase_price > 0) ? unitInfo.purchase_price : 0;
          if (resolvedPrice === 0) {
            const pp = Number((product as any).purchase_price ?? (product as any).purchasePrice ?? 0);
            resolvedPrice =
              ((product as any).cost || pp || (product as any).lastPurchasePrice || product.price || 0) * unitMult;
          }
        }
      } else {
        if (useUsdSale) {
          resolvedPrice = usdFieldToInvoiceUnitPrice(usdSaleCard, unitMult, currency, finalRate);
        } else {
          resolvedPrice = (unitInfo.sale_price > 0) ? unitInfo.sale_price : 0;
          if (resolvedPrice === 0) {
            resolvedPrice = (product.price || 0) * unitMult;
          }
        }
      }
      item.unitPrice = resolvedPrice;
    } else {
      item.unit = product.unit || 'Adet';
      item.multiplier = 1;
      let resolvedPrice = 0;
      if (isPurchase) {
        if (useUsdPurchase) {
          resolvedPrice = usdFieldToInvoiceUnitPrice(usdPurchaseCard, 1, currency, finalRate);
        }
        if (resolvedPrice === 0) {
          const pp = Number((product as any).purchase_price ?? (product as any).purchasePrice ?? 0);
          resolvedPrice =
            (product as any).cost || pp || (product as any).lastPurchasePrice || product.price || 0;
        }
      } else {
        if (useUsdSale) {
          resolvedPrice = usdFieldToInvoiceUnitPrice(usdSaleCard, 1, currency, finalRate);
        }
        if (resolvedPrice === 0) {
          resolvedPrice = product.price || 0;
        }
      }
      item.unitPrice = resolvedPrice;
    }

    item.quantity = baseItem.quantity > 0 ? baseItem.quantity : 1;
    item.baseQuantity = item.quantity * (item.multiplier || 1);
    item.unitsetId = (product as any).unitsetId || (product as any).unitset_id;

    if (!unitInfo && item.unitsetId) {
      const unitSet = unitSets.find(us => us.id === item.unitsetId);
      if (unitSet && unitSet.lines && unitSet.lines.length > 0) {
        const mainUnit = unitSet.lines.find((l: any) => l.main_unit) || unitSet.lines[0];
        item.unit = mainUnit.name || mainUnit.code;
        item.multiplier = parseFloat(mainUnit.conv_fact1) || parseFloat(mainUnit.multiplier1) || 1;
        item.baseQuantity = item.quantity * (item.multiplier || 1);
      }
    }

    /** Sayım taslağı / kartta maliyet 0: satıra zaten yazılmış birim fiyat korunur */
    if (isPurchase && (item.unitPrice || 0) <= 0 && (baseItem.unitPrice || 0) > 0) {
      item.unitPrice = Number(baseItem.unitPrice) || 0;
    }

    if (isPurchase) {
      const cost =
        Number((product as any).lastPurchasePrice) ||
        Number((product as any).cost) ||
        Number((product as any).purchase_price ?? (product as any).purchasePrice ?? 0) ||
        0;
      if (docUsd && usdPurchaseCard > 0) {
        item.lastPurchasePrice = usdPurchaseCard;
        item.priceDifference = item.unitPrice - usdPurchaseCard;
        item.priceDifferencePercent = usdPurchaseCard > 0 ? ((item.unitPrice - usdPurchaseCard) / usdPurchaseCard) * 100 : 0;
      } else {
        item.lastPurchasePrice = cost;
        item.priceDifference = item.unitPrice - cost;
        item.priceDifferencePercent = cost > 0 ? ((item.unitPrice - cost) / cost) * 100 : 0;
      }
    }

    const subtotal = item.quantity * item.unitPrice;
    item.discountAmount = subtotal * ((item.discountPercent || 0) / 100);
    item.amount = subtotal;
    item.netAmount = subtotal - item.discountAmount;

    return item;
  };

  const applyUnitHintToInvoiceItem = (item: InvoiceItem, hint: string): InvoiceItem => {
    const h = hint.trim();
    if (!h || !item.unitsetId) return item;
    const unitSet = unitSets.find((us: any) => us.id === item.unitsetId);
    const line = unitSet?.lines?.find(
      (l: any) =>
        String(l.name || '')
          .trim()
          .toLowerCase() === h.toLowerCase() ||
        String(l.code || '')
          .trim()
          .toLowerCase() === h.toLowerCase()
    );
    if (!line) return item;
    const next = { ...item };
    const oldMult = next.multiplier || 1;
    const newMult = parseFloat(line.conv_fact1) || parseFloat(line.multiplier1) || 1;
    next.unit = line.name || line.code || next.unit;
    next.multiplier = newMult;
    if (oldMult > 0 && newMult !== oldMult && (next.unitPrice || 0) > 0) {
      next.unitPrice = next.unitPrice * (newMult / oldMult);
    }
    next.baseQuantity = (next.quantity || 0) * (next.multiplier || 1);
    return next;
  };

  const finalizePurchaseLineAmounts = (item: InvoiceItem): InvoiceItem => {
    const next = { ...item };
    next.discountPercent = Math.min(100, Math.max(0, next.discountPercent || 0));
    const gross = (next.quantity || 0) * (next.unitPrice || 0);
    next.discountAmount = gross * ((next.discountPercent || 0) / 100);
    next.amount = gross;
    next.netAmount = gross - next.discountAmount;
    next.baseQuantity = (next.quantity || 0) * (next.multiplier || 1);
    if (next.lastPurchasePrice != null && next.lastPurchasePrice > 0) {
      const up = next.unitPrice || 0;
      next.priceDifference = up - next.lastPurchasePrice;
      next.priceDifferencePercent =
        next.lastPurchasePrice > 0 ? ((up - next.lastPurchasePrice) / next.lastPurchasePrice) * 100 : 0;
    }
    return next;
  };

  const handleDownloadPurchaseInvoiceExcelTemplate = async () => {
    try {
      const ok = await downloadPurchaseInvoiceImportTemplate();
      if (ok) toast.success(tm('purchaseInvoiceExcelTemplateDownloaded'));
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || tm('purchaseInvoiceExcelDownloadError'));
    }
  };

  const handlePurchaseExcelInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || invoiceType.category !== 'Alis') return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      toast.error(tm('supportedFormats'));
      return;
    }
    setPurchaseExcelImporting(true);
    setPurchaseExcelImportReport(null);
    try {
      const buf = await file.arrayBuffer();
      const { rows, errors } = parsePurchaseInvoiceExcelArrayBuffer(buf);
      if (rows.length === 0) {
        const issueList = normalizeImportIssueMessages(
          errors.length > 0 ? errors : [tm('purchaseInvoiceExcelEmptyFile')]
        );
        setPurchaseExcelImportReport({ importedCount: 0, issues: issueList });
        toast.error(tm('purchaseInvoiceExcelEmptyFile'));
        return;
      }
      const built: InvoiceItem[] = [];
      const rowErrors: string[] = [];
      for (const pr of rows) {
        const resolved = await lookupInvoiceProductByKey(pr.productKey);
        if (!resolved) {
          rowErrors.push(
            tm('purchaseInvoiceExcelRowProductMissing')
              .replace('{row}', String(pr.excelRow))
              .replace('{key}', pr.productKey)
          );
          continue;
        }
        const base = createEmptyInvoiceLine();
        base.quantity = pr.quantity;
        base.discountPercent = pr.discountPercent;
        let item = applyLookupResultToInvoiceItem(base, resolved.product, resolved.unitInfo);
        if (pr.unitHint) {
          item = applyUnitHintToInvoiceItem(item, pr.unitHint);
        }
        if (pr.unitPrice > 0) {
          item.unitPrice = pr.unitPrice;
        }
        if (pr.lineNote) {
          item.description2 = pr.lineNote;
        }
        item = finalizePurchaseLineAmounts(item);
        const synced = syncWeightLineQuantities(item.quantity || 0, item.unit, item.multiplier || 1);
        item.quantity = synced.quantity;
        item.baseQuantity = synced.baseQuantity;
        item = applyPurchaseExcelRowQuantityAsBaseStock(item, synced.quantity, pr.unitHint);
        built.push(item);
      }
      if (built.length === 0) {
        const issueList = normalizeImportIssueMessages([...errors, ...rowErrors]);
        setPurchaseExcelImportReport({
          importedCount: 0,
          issues: issueList.length ? issueList : [tm('purchaseInvoiceExcelImportFailed')],
        });
        toast.error(tm('purchaseInvoiceExcelImportFailed'));
        return;
      }
      setItems((prev) => {
        const withoutTrailing =
          prev.length > 0 && lineIsBlank(prev[prev.length - 1]) ? prev.slice(0, -1) : prev;
        return withTrailingEmptyLine([...withoutTrailing, ...built]);
      });
      toast.success(tm('purchaseInvoiceExcelImportSuccess').replace('{n}', String(built.length)));
      const warnParts = normalizeImportIssueMessages([...errors, ...rowErrors]);
      if (warnParts.length > 0) {
        setPurchaseExcelImportReport({ importedCount: built.length, issues: warnParts });
        toast.warning(tm('purchaseInvoiceExcelImportToastWarn').replace('{n}', String(warnParts.length)));
      } else {
        setPurchaseExcelImportReport(null);
      }
    } catch (err: any) {
      console.error('[UniversalInvoiceForm] purchase excel import:', err);
      toast.error(err?.message || tm('purchaseInvoiceExcelImportFailed'));
    } finally {
      setPurchaseExcelImporting(false);
    }
  };

  const resolveProductByCodeInput = async (rowIndex: number, codeRaw: string) => {
    const raw = codeRaw.trim();
    if (!raw) return;

    try {
      const resolved = await lookupInvoiceProductByKey(raw);

      if (!resolved) {
        toast.error(tm('productNotFound'));
        return;
      }

      setItems(prev => {
        if (rowIndex < 0 || rowIndex >= prev.length) return prev;
        const row = prev[rowIndex];
        if (!isInvoiceProductBarcodeLineType(row.type, invoiceType.category)) return prev;
        const next = [...prev];
        next[rowIndex] = applyLookupResultToInvoiceItem(row, resolved.product, resolved.unitInfo);
        const withEmpty = withTrailingEmptyLine(next);
        const emptyIdx = withEmpty.length - 1;
        setTimeout(() => {
          setCurrentRowIndex(emptyIdx);
          gridRefs.current[`code-${emptyIdx}`]?.focus();
        }, 0);
        return withEmpty;
      });

      const name = resolved.product.name || '';
      toast.success(name ? `${name} eklendi` : 'Ürün eklendi');
    } catch (err: any) {
      console.error('[UniversalInvoiceForm] resolveProductByCodeInput:', err);
      toast.error(err?.message || 'Ürün arama hatası');
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
    if (isInvoiceServiceLineType(currentItem?.type)) {
      return services.filter(s =>
        (s.code && s.code.toLowerCase().includes(search)) ||
        (s.name && s.name.toLowerCase().includes(search)) ||
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
      (p.code && p.code.toLowerCase().includes(search)) ||
      (p.name && p.name.toLowerCase().includes(search)) ||
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
      const prevRow = updated[index];
      let nextValue = value;
      if (field === 'quantity') {
        const parsed = typeof value === 'number'
          ? value
          : parseInvoiceWeightQuantity(String(value ?? ''));
        if (Number.isFinite(parsed) && parsed > 0) {
          nextValue = normalizeWeightProductQuantity(parsed, prevRow.unit);
        } else if (typeof value === 'number') {
          nextValue = value;
        } else {
          return prev;
        }
      }
      const item = { ...prevRow, [field]: nextValue };

      // Birim değişince çarpan ve birim fiyatı (baz birime göre) güncelle
      if (field === 'unit' && item.unitsetId) {
        const unitSet = unitSets.find((us: any) => us.id === item.unitsetId);
        const line = unitSet?.lines?.find((l: any) => l.name === value || l.code === value);
        const oldMult = prevRow.multiplier || 1;
        const newMult = line
          ? (parseFloat(line.conv_fact1) || parseFloat(line.multiplier1) || 1)
          : 1;
        item.multiplier = newMult;
        if (oldMult > 0 && newMult !== oldMult && (prevRow.unitPrice || 0) > 0) {
          item.unitPrice = prevRow.unitPrice * (newMult / oldMult);
        }
      }

      // Miktar veya birim değişince base_quantity'yi güncelle
      if (field === 'quantity' || field === 'unit') {
        const synced = syncWeightLineQuantities(item.quantity || 0, item.unit, item.multiplier || 1);
        item.quantity = synced.quantity;
        item.baseQuantity = synced.baseQuantity;
      }

      const grossAmount = (field === 'quantity' || field === 'unitPrice' || field === 'unit')
        ? (item.quantity || 0) * (item.unitPrice || 0)
        : (updated[index].quantity || 0) * (updated[index].unitPrice || 0);

      // Discount synchronization
      if (field === 'discountPercent') {
        item.discountAmount = grossAmount * ((value as number) / 100);
      } else if (field === 'discountAmount') {
        item.discountPercent = grossAmount > 0 ? ((value as number) / grossAmount) * 100 : 0;
      } else if (field === 'quantity' || field === 'unitPrice' || field === 'unit') {
        item.discountAmount = grossAmount * ((item.discountPercent || 0) / 100);
      }

      // Compute derived fields
      if ((field === 'unitPrice' || field === 'unit') && invoiceType.category === 'Alis' && item.lastPurchasePrice !== undefined) {
        const up = field === 'unit' ? (item.unitPrice || 0) : (value as number);
        item.priceDifference = up - item.lastPurchasePrice;
        item.priceDifferencePercent = item.lastPurchasePrice > 0
          ? ((up - item.lastPurchasePrice) / item.lastPurchasePrice) * 100
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
    const lastItem = currentItems.length > 0 ? currentItems[currentItems.length - 1] : undefined;
    const isLastItemEmpty =
      !lastItem || (!lastItem.code && lastItem.quantity === 0 && lastItem.unitPrice === 0);

    if (isLastItemEmpty && lastItem) {
      const updatedItems = [...currentItems.slice(0, -1), ...newItems, lastItem];
      setItems(withTrailingEmptyLine(updatedItems));
    } else {
      setItems(withTrailingEmptyLine([...currentItems, ...newItems]));
    }

    toast.success(`${newItems.length} ürün geçmişten eklendi`);
  };

  // Ürün seçimi (modal'dan)
  // Mevcut satıra ürün ekle (Açıklama alanına çift tıklama için)
  const [selectedRowForProduct, setSelectedRowForProduct] = useState<number | null>(null);

  const handleProductSelectForRow = (selProduct: Product, variant?: any, rowIndex?: number) => {
    const targetRowIndex = rowIndex !== undefined ? rowIndex : (selectedRowForProduct ?? currentRowIndex);

    if (targetRowIndex < 0 || targetRowIndex >= items.length) return;

    const systemUsdRate = resolveUsdRateForCardPrice();
    const effectiveRate = (selProduct as any).customExchangeRate || (selProduct as any).custom_exchange_rate || 0;
    let finalRate = effectiveRate > 0 ? effectiveRate : systemUsdRate;
    const docUsd = (currency || '').trim().toUpperCase() === 'USD';
    const isAutoCalc = (selProduct as any).autoCalculateUSD || (selProduct as any).auto_calculate_usd;
    const usdP = Number((selProduct as any).purchasePriceUSD ?? (selProduct as any).purchase_price_usd ?? 0);
    const usdS = Number((selProduct as any).salePriceUSD ?? (selProduct as any).sale_price_usd ?? 0);
    const useUsdPurchase = usdP > 0 && (docUsd || isAutoCalc);
    const useUsdSale = usdS > 0 && (docUsd || isAutoCalc);

    let productPrice = 0;
    if (invoiceType.category === 'Alis') {
      if (useUsdPurchase) {
        productPrice = usdFieldToInvoiceUnitPrice(usdP, 1, currency, finalRate);
      } else {
        productPrice = selProduct.cost || (selProduct as any).lastPurchasePrice || 0;
      }
    } else {
      if (useUsdSale) {
        productPrice = usdFieldToInvoiceUnitPrice(usdS, 1, currency, finalRate);
      } else {
        productPrice = variant?.price || selProduct.price || 0;
      }
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

    // Alış faturası için son fiyat (USD faturada kart USD ile kıyas)
    if (invoiceType.category === 'Alis') {
      const costIqd = (selProduct as any).cost ?? (selProduct as any).lastPurchasePrice ?? 0;
      if (docUsd && usdP > 0) {
        item.lastPurchasePrice = usdP;
        item.priceDifference = productPrice - usdP;
        item.priceDifferencePercent = usdP > 0 ? ((productPrice - usdP) / usdP) * 100 : 0;
      } else {
        item.lastPurchasePrice = costIqd;
        item.priceDifference = productPrice - costIqd;
        item.priceDifferencePercent = costIqd > 0 ? ((productPrice - costIqd) / costIqd) * 100 : 0;
      }
    }

    const subtotal = item.quantity * item.unitPrice;
    item.discountAmount = subtotal * ((item.discountPercent || 0) / 100);
    item.amount = subtotal;
    item.netAmount = subtotal - item.discountAmount;

    updatedItems[targetRowIndex] = item;
    const nextItems = withTrailingEmptyLine(updatedItems);
    setItems(nextItems);
    setShowProductCatalogModal(false);
    setSelectedRowForProduct(null);

    const emptyIdx = nextItems.length - 1;
    setCurrentRowIndex(emptyIdx);
    setTimeout(() => {
      gridRefs.current[`code-${emptyIdx}`]?.focus();
    }, 50);
  };

  const handleProductsBulkSelectForRow = (selectedProducts: Product[], rowIndex?: number) => {
    const targetRowIndex = rowIndex !== undefined ? rowIndex : (selectedRowForProduct ?? currentRowIndex);
    if (targetRowIndex < 0 || selectedProducts.length === 0) return;

    const withoutTrailing =
      items.length > 0 && lineIsBlank(items[items.length - 1])
        ? items.slice(0, -1)
        : [...items];

    if (targetRowIndex >= withoutTrailing.length) {
      withoutTrailing.push(...Array.from({ length: targetRowIndex - withoutTrailing.length + 1 }, () => createEmptyInvoiceLine()));
    }

    const [firstProduct, ...restProducts] = selectedProducts;
    const baseRow = withoutTrailing[targetRowIndex] || createEmptyInvoiceLine();
    withoutTrailing[targetRowIndex] = applyLookupResultToInvoiceItem(
      { ...baseRow, quantity: baseRow.quantity > 0 ? baseRow.quantity : 1 },
      firstProduct
    );

    const extraRows = restProducts.map((product) =>
      applyLookupResultToInvoiceItem(createEmptyInvoiceLine('Malzeme'), product)
    );

    const merged = [
      ...withoutTrailing.slice(0, targetRowIndex + 1),
      ...extraRows,
      ...withoutTrailing.slice(targetRowIndex + 1),
    ];

    const nextItems = withTrailingEmptyLine(merged);
    setItems(nextItems);
    setShowProductCatalogModal(false);
    setSelectedRowForProduct(null);
    toast.success(`${selectedProducts.length} ürün eklendi`);

    const emptyIdx = nextItems.length - 1;
    setCurrentRowIndex(emptyIdx);
    setTimeout(() => {
      gridRefs.current[`code-${emptyIdx}`]?.focus();
    }, 50);
  };

  const handleProductFromCatalog = (selProduct: Product, variant?: any) => {
    const systemUsdRate = resolveUsdRateForCardPrice();
    const effectiveRate = (selProduct as any).customExchangeRate || (selProduct as any).custom_exchange_rate || 0;
    let finalRate = effectiveRate > 0 ? effectiveRate : systemUsdRate;
    const docUsd = (currency || '').trim().toUpperCase() === 'USD';
    const isAutoCalc = (selProduct as any).autoCalculateUSD || (selProduct as any).auto_calculate_usd;
    const usdP = Number((selProduct as any).purchasePriceUSD ?? (selProduct as any).purchase_price_usd ?? 0);
    const usdS = Number((selProduct as any).salePriceUSD ?? (selProduct as any).sale_price_usd ?? 0);
    const useUsdPurchase = usdP > 0 && (docUsd || isAutoCalc);
    const useUsdSale = usdS > 0 && (docUsd || isAutoCalc);

    let productPrice = 0;
    if (invoiceType.category === 'Alis') {
      if (useUsdPurchase) {
        productPrice = usdFieldToInvoiceUnitPrice(usdP, 1, currency, finalRate);
      } else {
        productPrice = (selProduct as any).cost || (selProduct as any).lastPurchasePrice || 0;
      }
    } else {
      if (useUsdSale) {
        productPrice = usdFieldToInvoiceUnitPrice(usdS, 1, currency, finalRate);
      } else {
        productPrice = variant?.price || selProduct.price || 0;
      }
    }

    const productCode = variant?.code || selProduct.barcode || selProduct.id || '';
    const productName = variant ? `${selProduct.name} - ${variant.size || variant.color || ''}` : selProduct.name;
    const productUnit = selProduct.unit || 'Adet';

    // Yeni kalem oluştur
    const newItem: InvoiceItem = {
      id: createInvoiceLineId(),
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

    // Alış faturası için son fiyat (USD faturada kart USD ile kıyas)
    if (invoiceType.category === 'Alis') {
      const cost = (selProduct as any).cost || (selProduct as any).lastPurchasePrice || 0;
      if (docUsd && usdP > 0) {
        newItem.lastPurchasePrice = usdP;
        newItem.priceDifference = productPrice - usdP;
        newItem.priceDifferencePercent = usdP > 0 ? ((productPrice - usdP) / usdP) * 100 : 0;
      } else {
        newItem.lastPurchasePrice = cost;
        newItem.priceDifference = productPrice - cost;
        newItem.priceDifferencePercent = cost > 0 ? ((productPrice - cost) / cost) * 100 : 0;
      }
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

    const lastItem = items[items.length - 1];
    const isEmptyLastItem = lineIsBlank(lastItem);
    const baseItems = isEmptyLastItem ? [...items.slice(0, -1), newItem] : [...items, newItem];
    const nextItems = withTrailingEmptyLine(baseItems);
    setItems(nextItems);
    setCurrentRowIndex(nextItems.length - 1);
    setTimeout(() => {
      gridRefs.current[`code-${nextItems.length - 1}`]?.focus();
    }, 50);

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
    setItems(prev => {
      if (rowIndex < 0 || rowIndex >= prev.length) return prev;
      const next = [...prev];
      const item = { ...next[rowIndex] };

      const isPurchase = invoiceType.category === 'Alis';
      const docUsd = (currency || '').trim().toUpperCase() === 'USD';
      const autoUsd = product.autoCalculateUSD === true;
      const usdP = Number(product.purchasePriceUSD || 0);
      const usdS = Number(product.salePriceUSD || 0);
      const systemUsdRate = resolveUsdRateForCardPrice();
      const effectiveRate = product.customExchangeRate || 0;
      let finalRateSel = effectiveRate > 0 ? effectiveRate : systemUsdRate;
      const useUsdPurchase = usdP > 0 && (docUsd || autoUsd);
      const useUsdSale = usdS > 0 && (docUsd || autoUsd);

      let productPrice = 0;
      if (isPurchase) {
        if (useUsdPurchase) {
          productPrice = usdFieldToInvoiceUnitPrice(usdP, 1, currency, finalRateSel);
        } else {
          productPrice = product.lastPurchasePrice || (product as any).cost || 0;
        }
      } else {
        if (useUsdSale) {
          productPrice = usdFieldToInvoiceUnitPrice(usdS, 1, currency, finalRateSel);
        } else {
          productPrice = product.price || 0;
        }
      }

      item.code = product.code;
      item.description = product.name;
      item.unit = product.unit;
      item.unitPrice = productPrice;
      item.quantity = 1;

      const pUnitsetId = (product as any).unitset_id || (product as any).unitsetId;
      if (pUnitsetId) {
        item.unitsetId = pUnitsetId;
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

      if (invoiceType.category === 'Alis') {
        const cost = product.lastPurchasePrice || (product as any).cost || 0;
        if (docUsd && usdP > 0) {
          item.lastPurchasePrice = usdP;
          item.priceDifference = productPrice - usdP;
          item.priceDifferencePercent = usdP > 0 ? ((productPrice - usdP) / usdP) * 100 : 0;
        } else {
          item.lastPurchasePrice = cost;
          item.priceDifference = productPrice - cost;
          item.priceDifferencePercent = cost > 0 ? ((productPrice - cost) / cost) * 100 : 0;
        }
      }

      const grossAmount = item.quantity * item.unitPrice;
      item.discountAmount = grossAmount * ((item.discountPercent || 0) / 100);
      item.amount = grossAmount;
      item.netAmount = grossAmount - item.discountAmount;

      next[rowIndex] = item;
      return next;
    });

    setShowProductDropdown(false);
    setProductSearch('');

    setTimeout(() => {
      const newItem: InvoiceItem = createEmptyInvoiceLine('Malzeme');
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
    if (isInvoiceServiceLineType(currentItem?.type) || invoiceType.category === 'Hizmet') {
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
    setItems(prev => {
      if (rowIndex < 0 || rowIndex >= prev.length) return prev;
      const next = [...prev];
      const item = { ...next[rowIndex] };

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

      if (service.withholding_rate) {
        (item as any).withholdingRate = service.withholding_rate;
      }

      const grossAmount = item.quantity * item.unitPrice;
      item.discountAmount = grossAmount * ((item.discountPercent || 0) / 100);
      item.amount = grossAmount;
      item.netAmount = grossAmount - item.discountAmount;

      next[rowIndex] = item;
      return next;
    });

    setShowProductDropdown(false);
    setProductSearch('');

    setTimeout(() => {
      setItems(prev => {
        if (rowIndex !== prev.length - 1) return prev;
        const newItem: InvoiceItem = createEmptyInvoiceLine('Hizmet');
        return [...prev, newItem];
      });
      setTimeout(() => {
        setCurrentRowIndex(rowIndex + 1);
        gridRefs.current[`code-${rowIndex + 1}`]?.focus();
      }, 50);
    }, 50);
  };

  const handleProductKeyDown = (e: React.KeyboardEvent, rowIndex: number) => {
    const inputEl = e.currentTarget as HTMLInputElement;
    const inputVal = inputEl.value.trim();
    const filtered = filteredProducts;
    const dropdownForThisRow = showProductDropdown && searchingRowIndex === rowIndex;

    if (dropdownForThisRow) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedProductIndex(prev =>
          prev < filtered.length - 1 ? prev + 1 : prev
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedProductIndex(prev => (prev > 0 ? prev - 1 : -1));
        return;
      }
      if (e.key === 'Escape') {
        setShowProductDropdown(false);
        setProductSearch('');
        return;
      }
    }

    if (e.key !== 'Enter') return;

    // Kod alanında Enter’ın form göndermesi / sonraki hücreye atlama davranışını kes (ilk satırda boş satır oluşmasını önler).
    e.preventDefault();
    e.stopPropagation();

    const row = items[rowIndex];
    if (!row || !isInvoiceProductBarcodeLineType(row.type, invoiceType.category)) return;

    if (dropdownForThisRow && selectedProductIndex >= 0 && filtered[selectedProductIndex]) {
      const selected = filtered[selectedProductIndex];
      const selType = 'type' in selected ? (selected as { type?: string }).type : undefined;
      if (selType === 'Hizmet') {
        selectService(selected, rowIndex);
      } else {
        selectProduct(selected, rowIndex);
      }
      return;
    }

    if (dropdownForThisRow && filtered.length === 1) {
      const only = filtered[0];
      const onlyType = 'type' in only ? (only as { type?: string }).type : undefined;
      const attempts = barcodeLookupAttempts(inputVal);
      const exact = attempts.some(
        key =>
          (only.code && only.code.trim().toLowerCase() === key.toLowerCase()) ||
          (only.barcode && only.barcode.trim() === key)
      );
      if (exact) {
        if (onlyType === 'Hizmet') {
          selectService(only, rowIndex);
        } else {
          selectProduct(only, rowIndex);
        }
        return;
      }
    }

    const idx = rowIndex;
    const flushCodeResolve = (raw: string) => {
      const v = raw.trim();
      if (!v) return false;
      updateItem(idx, 'code', v);
      setShowProductDropdown(false);
      setProductSearch('');
      void resolveProductByCodeInput(idx, v);
      return true;
    };

    // Önce keydown anındaki DOM değeri (inputVal) — çoğu durumda ref/setTimeout’tan güvenilir.
    if (flushCodeResolve(inputVal)) return;

    // Barkod okuyucu / React onChange batch: Enter, son karakterin state’e işlenmesinden önce gelebilir.
    window.setTimeout(() => {
      const el = gridRefs.current[`code-${idx}`] as HTMLInputElement | undefined;
      flushCodeResolve(el?.value ?? '');
    }, 0);
  };

  const handleCameraBarcodeScan = useCallback((barcode: string) => {
    const code = (barcode || '').trim();
    if (!code) return;

    setCustomerBarcode(code);
    const targetIndex = Math.max(0, currentRowIndex);
    updateItem(targetIndex, 'code', code);
    void resolveProductByCodeInput(targetIndex, code);
    toast.success(`Barkod okundu: ${code}`);
  }, [currentRowIndex, updateItem, resolveProductByCodeInput]);

  const handleQuickBarcodeSubmit = useCallback(() => {
    const code = (quickBarcodeInput || '').trim();
    if (!code) return;
    handleCameraBarcodeScan(code);
    setQuickBarcodeInput('');
  }, [quickBarcodeInput, handleCameraBarcodeScan]);

  useEffect(() => {
    // Form ilk açılışında kamera modalı kapalı başlasın.
    setShowCameraScanner(false);
  }, [editData?.id, invoiceType.code]);

  /** Satış iade: backoffice'ten yeni form — oturum açmış kullanıcıyı varsayılan iade yapan olarak doldur */
  useEffect(() => {
    if (!isSalesReturnForm) return;
    if ((editData as any)?.id) return;
    if ((editData as any)?.source === 'pos') return;
    if (cashierName.trim()) return;
    const authName = resolveAuthUserDisplayName();
    if (authName) setCashierName(authName);
  }, [isSalesReturnForm, editData, cashierName, resolveAuthUserDisplayName]);

  // EditData değiştiğinde items'ı güncelle
  useEffect(() => {
    if (editData) {
      console.log('[UniversalInvoiceForm] editData received:', editData);

      /* Yeni taslak: sayım/alış ön doldurma notları → Açıklama (kayıtta notes olarak gider) */
      if (!(editData as any).id) {
        const draftNotes = (editData as any).notes;
        if (draftNotes != null && String(draftNotes).trim() !== '') {
          setDescription((prev) => (prev.trim() ? prev : String(draftNotes)));
        }
        const draftCashier = (editData as any).cashier;
        if (draftCashier != null && String(draftCashier).trim() !== '') {
          setCashierName(String(draftCashier).trim());
        }
      } else if ((editData as any).cashier) {
        setCashierName(String((editData as any).cashier).trim());
      }

      if ((editData as any).id) {
        const loadedPayment = dbPaymentMethodToFormCode(
          (editData as any).payment_method ?? (editData as any).paymentMethod,
        );
        setPaymentMethod(loadedPayment || 'ACIK_CARI');

        const hf = readInvoiceHeaderFields((editData as any).header_fields);
        const docNo = hf.documentNo || String((editData as any).document_no || '').trim();
        if (docNo) setDocumentNo(docNo);
        if (hf.specialCode) setSpecialCode(hf.specialCode);
        if (hf.tradingGroup) setTradingGroup(hf.tradingGroup);
        if (hf.authorizationCode) setAuthorizationCode(hf.authorizationCode);
        if (hf.warehouse) setWarehouse(hf.warehouse);
        if (hf.workplace) setWorkplace(hf.workplace);
        if (hf.salespersonCode) setSalespersonCode(hf.salespersonCode);
        if (hf.editDate) setEditDate(hf.editDate);
        if (hf.customerBarcode) setCustomerBarcode(hf.customerBarcode);
        if (hf.deliveryCode) setDeliveryCode(hf.deliveryCode);
        if (hf.campaignCode) setCampaignCode(hf.campaignCode);
        if (hf.time) setTime(hf.time);

        const hfMode = String(hf.footerDiscountMode || '').trim();
        const hfPct = parseFloat(String(hf.footerDiscountPercent ?? ''));
        const hfAmt = parseFloat(String(hf.footerDiscountAmount ?? ''));
        if (hfMode === 'amount' || hfMode === 'percentage' || (Number.isFinite(hfPct) && hfPct > 0) || (Number.isFinite(hfAmt) && hfAmt > 0)) {
          const mode: 'percentage' | 'amount' = hfMode === 'amount' ? 'amount' : 'percentage';
          setFooterDiscountMode(mode);
          if (Number.isFinite(hfPct) && hfPct > 0) {
            setFooterDiscountPercent(hfPct);
            setFooterDiscountPercentStr(formatDecimalForTrInput(hfPct));
          }
          if (Number.isFinite(hfAmt) && hfAmt > 0) {
            setFooterDiscountAmount(hfAmt);
            setFooterDiscountAmountStr(formatDecimalForTrInput(hfAmt));
          }
        } else {
          /* Eski kayıtlar: total_discount − satır indirimleri = dip indirim (ledger) */
          const headerDisc = parseFloat(String((editData as any).discount ?? (editData as any).total_discount ?? 0)) || 0;
          const itemsDataForDisc = editData.items || editData.invoice_items || editData.lines || editData.sale_items || [];
          let lineDiscIQD = 0;
          for (const it of itemsDataForDisc) {
            const da = parseFloat(String(it.discountAmount ?? it.discount_amount ?? 0)) || 0;
            if (da > 0) {
              lineDiscIQD += da;
              continue;
            }
            const pct = parseFloat(String(it.discountPercent ?? it.discount ?? it.discount_rate ?? 0)) || 0;
            const qty = parseFloat(String(it.quantity ?? 0)) || 0;
            const up = parseFloat(String(it.unitPrice ?? it.unit_price ?? 0)) || 0;
            if (pct > 0 && qty > 0 && up > 0) lineDiscIQD += (qty * up * pct) / 100;
          }
          const residualIQD = Math.max(0, Math.round((headerDisc - lineDiscIQD) * 100) / 100);
          if (residualIQD > 0.009) {
            const hdrRate = parseFloat(String((editData as any)?.currency_rate)) || 1;
            const hdrCur = String((editData as any)?.currency || ledgerCurrency).trim().toUpperCase();
            const residualFC =
              hdrCur !== ledgerCurrency && hdrRate > 0 ? residualIQD / hdrRate : residualIQD;
            setFooterDiscountMode('amount');
            setFooterDiscountAmount(residualFC);
            setFooterDiscountAmountStr(formatDecimalForTrInput(residualFC));
            setFooterDiscountPercent(0);
            setFooterDiscountPercentStr('');
          }
        }
      }

      // Farklı field isimlerini kontrol et: items, invoice_items, lines, sale_items
      const itemsData = editData.items || editData.invoice_items || editData.lines || editData.sale_items || [];

      console.log('[UniversalInvoiceForm] itemsData:', itemsData);

      if (itemsData.length > 0) {
        const hdrCur = String((editData as any)?.currency || 'IQD');
        const hdrRate = parseFloat(String((editData as any)?.currency_rate)) || 1;
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

          const fc = invoiceEditLineToFormAmounts(item, hdrCur, hdrRate);
          const q = item.quantity || 0;
          return {
            id: item.id || `item-${index}`,
            type: canonicalInvoiceLineType(item.type ?? item.item_type),
            code: productCode,
            description: item.description || item.productName || item.product_name || '',
            description2: item.description2 || '',
            quantity: q,
            unit: item.unit || 'Adet',
            unitPrice: fc.unitPrice,
            discountPercent: item.discountPercent || item.discount || item.discount_percent || 0,
            discountAmount:
              fc.amount > 1e-9 ? Math.max(0, fc.amount - fc.netAmount) : Number(item.discountAmount || item.discount_amount || 0) || 0,
            amount: fc.amount,
            netAmount: fc.netAmount,
            lastPurchasePrice: item.lastPurchasePrice || item.last_purchase_price,
            priceDifference: item.priceDifference || item.price_difference,
            priceDifferencePercent: item.priceDifferencePercent || item.price_difference_percent,
            unitsetId: item.unitsetId || item.unitset_id,
            multiplier: item.multiplier || item.unit_multiplier || 1,
            baseQuantity: item.baseQuantity || item.base_quantity || item.quantity,
            unitPriceFC: item.unitPriceFC ?? item.unit_price_fc,
            expiryDate: item.expiryDate ?? (item.expiry_date ? String(item.expiry_date).slice(0, 10) : ''),
            batchNo: item.batchNo ?? item.batch_no ?? '',
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
    /* editData?.items?.length: getById sonrası kalem sayısı değişince yeniden doldur */
  }, [editData, editData?.items?.length]);

  // Load suppliers and customers from database
  useEffect(() => {
    const loadSuppliers = async () => {
      if (invoiceType.category === 'Alis') {
        setLoadingSuppliers(true);
        try {
          const data = await supplierAPI.getAll({ cardType: 'supplier' });
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

  /** Seçili cari bakiye + telefon (defter bakiyesi) */
  useEffect(() => {
    let cancelled = false;

    const clearMeta = () => {
      setSelectedCariBalance(null);
      setSelectedCariPhone(null);
    };

    const applyMeta = (balance: number, phone: string | null) => {
      setSelectedCariBalance(balance);
      setSelectedCariPhone(phone);
    };

    if (invoiceType.category === 'Alis') {
      if (!supplierId && !supplierTitle.trim()) {
        clearMeta();
        return;
      }
      const sup = suppliers.find((s) => String(s.id) === String(supplierId));
      if (sup) {
        applyMeta(Number((sup as any).balance ?? 0), String((sup as any).phone || '').trim() || null);
        return;
      }
      if (!supplierId) return;
      void (async () => {
        try {
          const data = await supplierAPI.getAll({ cardType: 'supplier' });
          if (cancelled) return;
          const row = data.find((s) => String(s.id) === String(supplierId));
          if (row) {
            applyMeta(Number((row as any).balance ?? 0), String((row as any).phone || '').trim() || null);
          }
        } catch (e) {
          console.warn('[UniversalInvoiceForm] Tedarikçi bakiye/telefon:', e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (!customerId && !customerTitle.trim()) {
      clearMeta();
      return;
    }
    const cust = customers.find((c) => String(c.id) === String(customerId));
    if (cust) {
      applyMeta(
        Number(cust.balance ?? 0),
        String((cust as any).phone || (cust as any).phone2 || '').trim() || null,
      );
      return;
    }
    if (!customerId) return;
    void (async () => {
      try {
        const data = await customerAPI.getAll();
        if (cancelled) return;
        const row = data.find((c) => String(c.id) === String(customerId));
        if (row) {
          applyMeta(
            Number(row.balance ?? 0),
            String((row as any).phone || (row as any).phone2 || '').trim() || null,
          );
        }
      } catch (e) {
        console.warn('[UniversalInvoiceForm] Müşteri bakiye/telefon:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, customerTitle, customers, supplierId, supplierTitle, suppliers, invoiceType.category]);

  /* Alış düzenleme: tedarikçi UUID/ünvanı customer_id üzerinde; suppliers async yüklenince kod/ünvanı doldur */
  useEffect(() => {
    if (!editData?.id || invoiceType.category !== 'Alis') return;
    const sid = (editData as any).supplier_id || editData.customer_id;
    const st = (editData as any).supplier_name || (editData as any).customer_name;
    if (sid) setSupplierId(String(sid));
    if (st) setSupplierTitle(String(st));
    if (sid && suppliers.length > 0) {
      const sup = suppliers.find((s: any) => String(s.id) === String(sid));
      if (sup && (sup as any).code) setSupplierCode(String((sup as any).code));
    }
  }, [editData?.id, editData?.customer_id, (editData as any)?.supplier_id, invoiceType.category, suppliers]);

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

  /** Kod hücresine odak: searchingRowIndex + productSearch input ile hizala (Enter’da stale filtre/odak kayması önlenir) */
  const handleInvoiceCodeFieldFocus = useCallback((rowIndex: number, displayCode: string) => {
    setSearchingRowIndex(rowIndex);
    setSelectedProductIndex(-1);
    const v = displayCode.trim();
    setProductSearch(displayCode);
    setShowProductDropdown(v.length >= 1);
  }, []);

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

  const effectiveInvoiceCurrencyRate = useMemo(() => {
    if (currency === ledgerCurrency) return 1;
    const fromStr = parseDecimalStringForInput(currencyRateStr);
    /* Elle düzenleme: metin kutusu kaynak; aksi halde currencyRate (API/tarih) — str önce parse edilince
       senkron gecikmesi veya dokunulmuş + eski "1500" metni doğru 1.54 state'ini ezerdi */
    if (currencyRateUserTouchedRef.current) {
      if (Number.isFinite(fromStr) && fromStr > 0) return fromStr;
      return currencyRate > 0 ? currencyRate : 1;
    }
    return currencyRate > 0 ? currencyRate : 1;
  }, [currency, ledgerCurrency, currencyRateStr, currencyRate]);

  // Toplam hesaplama
  const totals = useMemo(() => {
    let lineDiscount = 0;
    let totalGross = 0;
    let netAfterLines = 0;

    items.forEach(item => {
      if (invoiceType.category === 'Alis' && !isInvoiceSupplierPayableLineType(item.type)) return;
      const itemGross = (item.quantity || 0) * (item.unitPrice || 0);
      const itemTotalDiscount = (item.discountAmount || 0);
      const itemNet = itemGross - itemTotalDiscount;

      totalGross += itemGross;
      lineDiscount += itemTotalDiscount;
      netAfterLines += itemNet;
    });

    let footerDiscount = 0;
    if (footerDiscountMode === 'percentage') {
      const pct = Math.min(100, Math.max(0, footerDiscountPercent || 0));
      footerDiscount = netAfterLines > 0 ? (netAfterLines * pct) / 100 : 0;
    } else {
      footerDiscount = Math.max(0, footerDiscountAmount || 0);
    }
    footerDiscount = Math.round(footerDiscount * 100) / 100;
    if (footerDiscount > netAfterLines) footerDiscount = Math.max(0, netAfterLines);

    const derivedFooterPercent =
      netAfterLines > 0 ? Math.round((footerDiscount / netAfterLines) * 10000) / 100 : 0;
    const totalDiscount = lineDiscount + footerDiscount;
    const totalNet = netAfterLines - footerDiscount;

    // Döviz kuru: yerel (ledger) para karşılıkları
    const rate = currency !== ledgerCurrency ? effectiveInvoiceCurrencyRate : 1;
    return {
      totalExpenses: 0,
      lineDiscount,
      footerDiscount,
      footerDiscountPercent:
        footerDiscountMode === 'percentage'
          ? Math.min(100, Math.max(0, footerDiscountPercent || 0))
          : derivedFooterPercent,
      totalDiscount,
      subtotal: totalGross,       // Fatura dövizinde (FC)
      totalVat: 0,
      net: totalNet,              // Fatura dövizinde (FC)
      rate,
      subtotalIQD: totalGross * rate,
      lineDiscountIQD: lineDiscount * rate,
      footerDiscountIQD: footerDiscount * rate,
      totalDiscountIQD: totalDiscount * rate,
      netIQD: totalNet * rate,    // Yerel para karşılığı → DB
    };
  }, [
    items,
    invoiceType.category,
    currency,
    ledgerCurrency,
    effectiveInvoiceCurrencyRate,
    footerDiscountMode,
    footerDiscountPercent,
    footerDiscountAmount,
  ]);

  const applyFooterDiscountPercent = useCallback((raw: string) => {
    setFooterDiscountPercentStr(raw);
    setFooterDiscountMode('percentage');
    const n = parseDecimalStringForInput(raw);
    const pct = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
    setFooterDiscountPercent(pct);
  }, []);

  const applyFooterDiscountAmount = useCallback((raw: string) => {
    setFooterDiscountAmountStr(raw);
    setFooterDiscountMode('amount');
    const n = parseDecimalStringForInput(raw);
    const amt = Number.isFinite(n) ? Math.max(0, n) : 0;
    setFooterDiscountAmount(amt);
  }, []);

  /* Yüzde modunda satır değişince dip tutarını güncelle; tutar modunda % gösterimini güncelle */
  useEffect(() => {
    if (footerDiscountMode === 'percentage') {
      const amt = totals.footerDiscount;
      setFooterDiscountAmount(amt);
      setFooterDiscountAmountStr(amt > 0 ? formatDecimalForTrInput(amt) : '');
    } else {
      const pct = totals.footerDiscountPercent;
      setFooterDiscountPercent(pct);
      setFooterDiscountPercentStr(pct > 0 ? formatDecimalForTrInput(pct) : '');
    }
  }, [footerDiscountMode, totals.footerDiscount, totals.footerDiscountPercent]);

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
        const costResults = preferLocalCatalogFifoOverCloud()
          ? buildLocalCatalogFifoCostMap(validItems, products, storeProducts)
          : await batchCalculateFIFOCost({
              items: validItems.map((item) => {
                let productId = item.code;
                const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidPattern.test(item.code)) {
                  const product = products.find((p) => p.code === item.code);
                  if (product && product.id) {
                    productId = product.id;
                  } else {
                    const foundStoreProduct = storeProducts.find((p) => p.code === item.code);
                    if (foundStoreProduct && foundStoreProduct.id) {
                      productId = foundStoreProduct.id;
                    }
                  }
                }
                return {
                  productId,
                  productCode: item.code,
                  quantity: item.baseQuantity ?? (item.quantity * (item.multiplier || 1)),
                };
              }),
              firmaId: (selectedFirm?.logicalref || 0).toString(),
              donemId: (selectedPeriod?.logicalref || 0).toString(),
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
        const footerDisc = totals.footerDiscount || 0;
        const profitAfterFooter = calculatedTotalGrossProfit - footerDisc;
        setTotalGrossProfit(profitAfterFooter);
        const salesNetAfterFooter = Math.max(0, netTotal - footerDisc);
        setProfitMargin(
          salesNetAfterFooter > 0 ? (profitAfterFooter / salesNetAfterFooter) * 100 : 0
        );
      } catch (error) {
        console.error('[UniversalInvoiceForm] Error calculating profit:', error);
        setTotalCost(0);
        setTotalGrossProfit(0);
        setProfitMargin(0);
      }
    };

    calculateProfit();
  }, [items, invoiceType.category, selectedFirm, selectedPeriod, products, storeProducts, totals.footerDiscount]);

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
      payment_method: resolvePaymentMethodForDb(),
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
    const isSalesReturnInvoice = invoiceType.category === 'Iade' && invoiceType.code === 3;
    if (invoiceType.category === 'Satis' && !customerTitle) {
      toast.error('❌ ' + tm('customerNotSelected'));
      return;
    }
    if (invoiceType.category === 'Iade' && !isSalesReturnInvoice && !customerTitle) {
      toast.error('❌ ' + tm('customerNotSelected'));
      return;
    }
    if (isSalesReturnInvoice && !customerTitle) {
      toast.warning('⚠️ ' + tm('salesReturnCustomerOptionalWarning'));
    }
    if (isSalesReturnInvoice && !cashierName.trim()) {
      const fallbackCashier = resolveAuthUserDisplayName();
      if (fallbackCashier) {
        setCashierName(fallbackCashier);
      }
    }
    const effectiveCashierName = cashierName.trim() || resolveAuthUserDisplayName();
    if (isSalesReturnInvoice && !effectiveCashierName) {
      toast.error('❌ ' + tm('salesReturnCashierRequired'));
      return;
    }

    // Kalem kontrolü — sayım fazlası taslağında birim fiyat 0 olabilir; alışta yine de kayda izin verilir
    const validItems = items.filter((item) => {
      if (!(Number(item.quantity) > 0)) return false;
      const price = Number(item.unitPrice);
      if (Number.isNaN(price)) return false;
      if (invoiceType.category === 'Alis') {
        return (
          price >= 0 &&
          (String(item.code || '').trim() !== '' || String(item.description || '').trim() !== '')
        );
      }
      return price > 0;
    });
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

      // Döviz kuru (yerel para birimine çevirme)
      const rateToIQD = currency !== ledgerCurrency ? effectiveInvoiceCurrencyRate : 1;

      if (invoiceType.category === 'Alis') {
        const costInputs = validItems.map((item, idx) => ({
          id: item.id || item.code || `line-${idx}`,
          code: item.code,
          type: item.type,
          quantity: item.quantity,
          baseQuantity: item.baseQuantity ?? (item.quantity * (item.multiplier || 1)),
          multiplier: item.multiplier,
          unitPrice: item.unitPrice,
          netAmount: item.netAmount,
          discountAmount: item.discountAmount,
        }));
        const costMap = allocatePurchaseInvoiceLineCosts(costInputs, rateToIQD);

        itemsWithCost = validItems.map((item, idx) => {
          const key = item.id || item.code || `line-${idx}`;
          const costInfo = costMap.get(key) || { unitCost: 0, totalCost: 0 };
          const unitPriceFC = item.unitPrice;
          const unitPriceIQD = unitPriceFC * rateToIQD;
          const baseQty = item.baseQuantity ?? (item.quantity * (item.multiplier || 1));
          totalCost += costInfo.totalCost;

          if (
            isInvoiceSupplierPayableLineType(item.type)
            && item.lastPurchasePrice
            && item.lastPurchasePrice > 0
            && unitPriceIQD !== item.lastPurchasePrice
          ) {
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
            unitCost: costInfo.unitCost,
            totalCost: costInfo.totalCost,
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

        const costResults = preferLocalCatalogFifoOverCloud()
          ? buildLocalCatalogFifoCostMap(validItems, products, storeProducts)
          : await batchCalculateFIFOCost({
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
      let resolvedSupplierId = supplierId;
      if (invoiceType.category === 'Alis' && !resolvedSupplierId) {
        const normTr = (s: string) => s.trim().toLocaleLowerCase('tr-TR');
        if (supplierCode) {
          const byCode = suppliers.find((s) => s.code === supplierCode);
          if (byCode) resolvedSupplierId = byCode.id;
          else {
            const fetched = await supplierAPI.getByCode(supplierCode);
            if (fetched) resolvedSupplierId = fetched.id;
          }
        }
        if (!resolvedSupplierId && supplierTitle) {
          const titleNorm = normTr(supplierTitle);
          const byName = suppliers.find((s) => normTr(s.name || '') === titleNorm);
          if (byName) resolvedSupplierId = byName.id;
        }
      }

      const invoiceData: any = {
        invoice_no: invoiceNo,
        invoice_date: transactionDate,
        invoice_type: invoiceType.code,
        invoice_category: invoiceType.category as any,
        customer_id: invoiceType.category === 'Alis' ? (resolvedSupplierId || customerId || undefined) : (customerId || undefined),
        supplier_id: resolvedSupplierId || undefined,
        supplier_name: supplierTitle || '',
        /* Alış: tedarikçi ünvanı sales.customer_name'e de yazılmalı (liste / join) */
        customer_name: invoiceType.category === 'Alis' ? (supplierTitle || customerTitle || '') : (customerTitle || ''),
        subtotal: totals.subtotalIQD,   // IQD
        discount: totals.totalDiscountIQD,
        tax: 0,
        total_amount: totals.netIQD,    // IQD
        total: totals.netIQD,
        total_cost: totalCost,
        gross_profit:
          invoiceType.category === 'Satis'
            ? calculatedGrossProfit - (totals.footerDiscountIQD || 0)
            : totalGrossProfit,
        profit_margin:
          invoiceType.category === 'Satis' && totals.netIQD > 0
            ? ((calculatedGrossProfit - (totals.footerDiscountIQD || 0)) / totals.netIQD) * 100
            : profitMargin,
        firma_id: selectedFirm?.logicalref?.toString() || '0',
        firma_name: selectedFirm?.name || '',
        donem_id: selectedPeriod?.logicalref?.toString() || '0',
        donem_name: selectedPeriod?.donem_adi || '',
        payment_method: resolvePaymentMethodForDb(),
        cashier: effectiveCashierName,
        created_by_user_id: (editData as any)?.created_by_user_id || user?.id || undefined,
        store_id: (editData as any)?.store_id || undefined,
        status: (() => {
          if (invoiceType.category === 'Alis' || invoiceType.category === 'Iade') return 'completed';
          return paymentMethodImpliesPaidNow(resolvePaymentMethodForDb()) ? 'completed' : 'unpaid';
        })(),
        notes: description,
        document_no: documentNo.trim() || invoiceNo,
        header_fields: buildInvoiceHeaderFieldsFromForm({
          documentNo,
          specialCode,
          tradingGroup,
          authorizationCode,
          warehouse,
          workplace,
          salespersonCode,
          editDate,
          customerBarcode,
          deliveryCode,
          campaignCode,
          time,
          footerDiscountMode,
          footerDiscountPercent: totals.footerDiscountPercent,
          footerDiscountAmount: totals.footerDiscount,
        }),
        currency: currency || ledgerCurrency,
        currency_rate: effectiveInvoiceCurrencyRate || 1,
        credit_amount: 0,
        items: itemsWithCost
      };

      let savedInvoice: any;
      if (editData?.id) {
        savedInvoice = await invoicesAPI.update(editData.id, invoiceData);
      } else {
        savedInvoice = await invoicesAPI.create(
          invoiceData,
          createSaveOptions?.skipProductStockUpdate
            ? { skipProductStockUpdate: true }
            : undefined
        );
      }

      if (!savedInvoice) throw new Error(tm('invoiceSaveError'));

      if (createSaveOptions?.skipProductStockUpdate && !editData?.id) {
        toast.success(`✅ ${tm('countPurchaseInvoiceSavedToast')}`);
      } else {
        toast.success('✅ ' + tm('invoiceSaved'));
      }

      // Stok DB'de güncellendi; ürün store'unu tazele (liste / katalog / POS stok etiketi)
      void useProductStore.getState().loadProducts(true);

      // Stok ve FIFO Hareketleri (baseQuantity kullan) — yerel PG modunda Supabase'e N× istek atılmaz (stok zaten invoicesAPI ile güncellendi)
      const skipCloudFifoAfterSave = preferLocalCatalogFifoOverCloud();
      const skipStockSideEffects = Boolean(createSaveOptions?.skipProductStockUpdate);
      if (!editData?.id) {
        if (!skipStockSideEffects) {
          if (!skipCloudFifoAfterSave) {
            if (invoiceType.category === 'Alis') {
              await Promise.all(
                itemsWithCost.map((item) => {
                  const baseQty = item.baseQuantity ?? item.quantity;
                  return CostAccountingService.addFIFOLayer({
                    product_id: item.code,
                    quantity: baseQty,
                    unit_cost: item.unitCost || item.unitPrice,
                    purchase_date: invoiceDate.toISOString(),
                    document_no: invoiceNo,
                    firma_id: selectedFirm.id || '',
                    donem_id: selectedPeriod.id || ''
                  });
                })
              );
            } else if (invoiceType.category === 'Satis') {
              await Promise.all(
                itemsWithCost.map((item) => {
                  const baseQty = item.baseQuantity ?? item.quantity;
                  return CostAccountingService.recordStockMovement({
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
                    donem_id: selectedPeriod.id || '',
                  });
                })
              );
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
      }

      const runJournalIfNeeded = async () => {
        if (skipStockSideEffects) return;
        if (!editData?.id && isReady) {
          let journalResult: any = null;

          if (invoiceType.category === 'Satis' && selectedFirm && selectedPeriod) {
            journalResult = await createSalesJournal({
              fatura_no: invoiceNo,
              tarih: invoiceDate,
              musteri_adi: customerTitle || supplierTitle,
              tutar: totals.netIQD,
              aciklama: description
            });
          } else if (invoiceType.category === 'Alis' && selectedFirm && selectedPeriod) {
            journalResult = await createPurchaseJournal({
              fatura_no: invoiceNo,
              tarih: invoiceDate,
              tedarikci_adi: supplierTitle || customerTitle,
              tutar: totals.netIQD,
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
      };

      const runPrintIfNeeded = async () => {
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
          paymentMethod: resolvePaymentMethodForDb()
        };

        if (window.electronAPI?.printer) {
          await window.electronAPI.printer.print(printData);
        } else {
          await handlePrint();
        }
      };

      if (skipCloudFifoAfterSave) {
        void runJournalIfNeeded().catch((e) => console.warn('[UniversalInvoice] Arka plan muhasebe fişi:', e));
        void runPrintIfNeeded().catch((e) => console.warn('[UniversalInvoice] Arka plan yazdırma:', e));
      } else {
        await runJournalIfNeeded();
        try {
          await runPrintIfNeeded();
        } catch (printError) {
          console.error('[UniversalInvoice] Print error:', printError);
        }
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

  const handleQuickCreateCari = async (
    cardType: 'customer' | 'supplier',
    payload: { name: string; phone?: string },
  ): Promise<InvoiceCariItem | null> => {
    try {
      const code = await supplierAPI.generateCode(cardType);
      const created = await supplierAPI.create({
        code,
        name: payload.name,
        phone: payload.phone,
        cardType,
      } as Omit<Supplier, 'id'>);
      const item: InvoiceCariItem = {
        id: created.id,
        code: created.code,
        name: created.name,
        phone: created.phone,
        email: created.email,
      };
      if (cardType === 'customer') {
        setCustomers((prev) => [...prev, created as unknown as Customer]);
      } else {
        setSuppliers((prev) => [...prev, created]);
      }
      toast.success(tm('quickCariCreated'));
      return item;
    } catch (e: any) {
      toast.error(e?.message || 'Cari eklenemedi');
      return null;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col bg-white pointer-events-auto"
      style={{ zIndex: FULLSCREEN_BODY_PORTAL_Z }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="universal-invoice-form-title"
    >
        {/* Header with Tabs */}
        <div className={`bg-gradient-to-r ${headerColors.gradient} flex-shrink-0`}>
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-white" />
              <h2 id="universal-invoice-form-title" className="text-lg text-white">{invoiceType.name} - {invoiceNo}</h2>
              {!isTransactionAllowed(new Date()) && (
                <div className="flex items-center gap-2 px-3 py-1 bg-red-500 rounded text-white text-xs">
                  <AlertCircle className="w-3 h-3" />
                  {tm('periodClosed')}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="text-white hover:bg-white/10 rounded p-1.5">
                <Minus className="w-4 h-4" />
              </button>
              <button type="button" className="text-white hover:bg-white/10 rounded p-1.5">
                <Square className="w-4 h-4" />
              </button>
              <button
                type="button"
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
              type="button"
              onClick={() => setActiveTab('fatura')}
              className={`px-6 py-2 text-sm transition-colors ${activeTab === 'fatura'
                ? 'bg-white text-gray-900'
                : 'text-white hover:bg-white/10'
                }`}
            >
              {tm('invoice')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('detaylar')}
              className={`px-6 py-2 text-sm transition-colors ${activeTab === 'detaylar'
                ? 'bg-white text-gray-900'
                : 'text-white hover:bg-white/10'
                }`}
            >
              {tm('details')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('detaylarII')}
              className={`px-6 py-2 text-sm transition-colors ${activeTab === 'detaylarII'
                ? 'bg-white text-gray-900'
                : 'text-white hover:bg-white/10'
                }`}
            >
              {tm('detailsII')}
            </button>
            <button
              type="button"
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
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gray-50 overscroll-y-contain">
          <div className="p-3 sm:p-6">
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
                  paymentMethodLabel={paymentMethodLabel}
                  warehouse={warehouse}
                  workplace={workplace}
                  salespersonCode={salespersonCode}
                  cashierName={cashierName}
                  onCashierNameChange={setCashierName}
                  cashierReadOnly={(editData as any)?.source === 'pos'}
                  showCashierField={isSalesReturnForm}
                  cashierFieldLabel={tm('salesReturnProcessedBy')}

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
                  selectedCariBalance={selectedCariBalance}
                  selectedCariPhone={selectedCariPhone}
                  selectedCariCurrency={currency || 'IQD'}
                />

                {invoiceType.category === 'Alis' && createSaveOptions?.skipProductStockUpdate && (
                  <div
                    className="mb-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950 shadow-sm dark:border-cyan-800/80 dark:bg-cyan-950/35 dark:text-cyan-100"
                    role="status"
                  >
                    <p className="font-semibold">{tm('countPurchaseInvoiceFormBannerTitle')}</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
                      <li>{tm('countPurchaseInvoiceFormBannerPoint1')}</li>
                      <li>{tm('countPurchaseInvoiceFormBannerPoint2')}</li>
                      <li>{tm('countPurchaseInvoiceFormBannerPoint3')}</li>
                    </ul>
                  </div>
                )}

                {isSalesReturnForm && (editData as any)?.source === 'pos' && cashierName.trim() && (
                  <div
                    className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-800/80 dark:bg-amber-950/35 dark:text-amber-100"
                    role="status"
                  >
                    <p className="font-semibold">
                      {tm('posSalesReturnCashierBanner').replace('{cashier}', cashierName.trim())}
                    </p>
                  </div>
                )}

                <div className="mb-3 flex w-full items-center gap-2 justify-end">
                  <input
                    type="text"
                    value={quickBarcodeInput}
                    onChange={(e) => setQuickBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleQuickBarcodeSubmit();
                      }
                    }}
                    placeholder={tm('barcodeScanOrType')}
                    autoComplete="off"
                    inputMode="text"
                    className="min-w-0 flex-1 sm:flex-none sm:w-64 touch-manipulation border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCameraScanner(true)}
                    className="inline-flex items-center justify-center gap-2 shrink-0 px-3 py-2 rounded-lg bg-[var(--asin-accent,#1FA8A0)] text-white text-sm font-medium hover:bg-[#178f88] active:scale-[0.99] transition-transform min-h-[44px] min-w-[44px]"
                    title={tm('cameraScan')}
                  >
                    <Camera className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap hidden sm:inline">{tm('cameraBtn')}</span>
                  </button>
                  <ColumnVisibilityMenu
                    columns={itemColumns}
                    onToggle={handleToggleColumn}
                    onShowAll={handleShowAllColumns}
                    onHideAll={handleHideAllColumns}
                    variant="filterBar"
                  />
                </div>

                {/* Items Grid */}
                <div className="space-y-3">
                  {/* Toplu Fiyat Artırımı - Sadece Alış Faturaları için */}
                  {invoiceType.category === 'Alis' && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-3">
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
                            type="button"
                            onClick={handleBulkPriceIncrease}
                            className="px-4 py-1 bg-[var(--asin-accent,#1FA8A0)] text-white rounded hover:bg-[#178f88] text-sm transition-colors"
                          >
                            {tm('apply')}
                          </button>
                          <span className="text-xs text-gray-600 max-w-md">{tm('bulkPriceIncreaseDesc')}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          <button
                            type="button"
                            onClick={() => void handleDownloadPurchaseInvoiceExcelTemplate()}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-teal-200 bg-teal-50 text-teal-800 text-sm font-medium hover:bg-teal-100 transition-colors"
                            title={tm('purchaseInvoiceExcelTemplateBtn')}
                          >
                            <FileSpreadsheet className="w-4 h-4 shrink-0" />
                            {tm('purchaseInvoiceExcelTemplateBtn')}
                          </button>
                          <button
                            type="button"
                            disabled={purchaseExcelImporting}
                            onClick={() => purchaseExcelInputRef.current?.click()}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                            title={tm('purchaseInvoiceExcelImportBtn')}
                          >
                            <Upload className="w-4 h-4 shrink-0" />
                            {purchaseExcelImporting ? tm('purchaseInvoiceExcelImporting') : tm('purchaseInvoiceExcelImportBtn')}
                          </button>
                          <input
                            ref={purchaseExcelInputRef}
                            type="file"
                            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                            className="hidden"
                            onChange={(ev) => void handlePurchaseExcelInputChange(ev)}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">{tm('purchaseInvoiceExcelHint')}</p>
                      {purchaseExcelImportReport && purchaseExcelImportReport.issues.length > 0 && (
                        <div
                          role="status"
                          className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-950 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 text-sm font-semibold leading-snug">
                              <span className="inline-flex items-center gap-1.5">
                                <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                                {tm('purchaseInvoiceExcelImportReportTitle')}
                              </span>
                              {purchaseExcelImportReport.importedCount > 0 && (
                                <span className="mt-0.5 block text-xs font-normal text-amber-900/90 dark:text-amber-200/90">
                                  {tm('purchaseInvoiceExcelImportReportImported').replace(
                                    '{n}',
                                    String(purchaseExcelImportReport.importedCount)
                                  )}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setPurchaseExcelImportReport(null)}
                              className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide text-amber-900 hover:bg-amber-200/80 dark:text-amber-100 dark:hover:bg-amber-800/60"
                            >
                              {tm('purchaseInvoiceExcelImportReportDismiss')}
                            </button>
                          </div>
                          <ul className="mt-2 max-h-56 list-disc space-y-1.5 overflow-y-auto overscroll-contain pl-5 text-xs leading-relaxed">
                            {purchaseExcelImportReport.issues.map((msg, idx) => {
                              const text = msg == null ? '' : String(msg);
                              return (
                                <li key={`${idx}-${text.slice(0, 40)}`} className="break-words">
                                  {text}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <InvoiceItemsGrid
                    items={items}
                    invoiceType={invoiceType}
                    itemColumnVisibility={effectiveItemColumnVisibility}
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
                    masterUnits={masterUnits}
                    unitSets={unitSets}
                    currency={currency}
                    currencyRate={effectiveInvoiceCurrencyRate}
                    ledgerCurrency={ledgerCurrency}
                    onCodeFieldFocus={handleInvoiceCodeFieldFocus}
                  />
                </div>

                {/* Totals Area */}
                <div className="flex justify-end gap-4 items-start">
                  {/* Totals Box */}
                  <div className={`${getCariBorderColor()} border p-4 rounded-lg w-full max-w-sm space-y-2 shadow-sm ${darkMode ? 'text-gray-100' : ''}`}>
                    {currency !== ledgerCurrency && (
                      <div className={`flex justify-between text-xs pb-1 border-b ${darkMode ? 'text-gray-400 border-gray-700' : 'text-gray-500 border-gray-100'}`}>
                        <span>{tm('grossTotal')} ({currency})</span>
                        <span>{formatNumber(totals.subtotal, 2, true)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>{tm('grossTotal')}{currency !== ledgerCurrency ? ` (${ledgerCurrency})` : ''}</span>
                      <span>{formatNumber(currency !== ledgerCurrency ? totals.subtotalIQD : totals.subtotal, 2, false)}</span>
                    </div>
                    {totals.lineDiscount > 0 && (
                      <>
                        {currency !== ledgerCurrency && (
                          <div className={`flex justify-between text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            <span>{tm('lineDiscountTotal')} ({currency})</span>
                            <span className="text-red-400">-{formatNumber(totals.lineDiscount, 2, true)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>{tm('lineDiscountTotal')}</span>
                          <span className="text-red-500">-{formatNumber(currency !== ledgerCurrency ? totals.lineDiscountIQD : totals.lineDiscount, 2, false)}</span>
                        </div>
                      </>
                    )}

                    {/* Dip (fatura seviyesi) indirim */}
                    <div className={`rounded-md border p-2 space-y-2 ${darkMode ? 'border-gray-600 bg-gray-900/40' : 'border-gray-200 bg-white/70'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`} title={tm('footerDiscountHint')}>
                          {tm('footerDiscount')}
                        </span>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const pct = totals.footerDiscountPercent || 0;
                              setFooterDiscountMode('percentage');
                              setFooterDiscountPercent(pct);
                              setFooterDiscountPercentStr(pct > 0 ? formatDecimalForTrInput(pct) : '');
                              setFooterDiscountAmount(totals.footerDiscount);
                              setFooterDiscountAmountStr(
                                totals.footerDiscount > 0 ? formatDecimalForTrInput(totals.footerDiscount) : ''
                              );
                            }}
                            className={`px-2 py-1 text-xs rounded border transition-colors ${
                              footerDiscountMode === 'percentage'
                                ? 'bg-[var(--asin-accent,#1FA8A0)] text-white border-[var(--asin-accent,#1FA8A0)]'
                                : darkMode
                                  ? 'bg-gray-700 text-gray-200 border-gray-600 hover:border-[var(--asin-accent,#1FA8A0)]'
                                  : 'bg-white text-gray-700 border-gray-300 hover:border-[var(--asin-accent,#1FA8A0)]'
                            }`}
                          >
                            %
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const amt = totals.footerDiscount || 0;
                              setFooterDiscountMode('amount');
                              setFooterDiscountAmount(amt);
                              setFooterDiscountAmountStr(amt > 0 ? formatDecimalForTrInput(amt) : '');
                              const pct = totals.footerDiscountPercent || 0;
                              setFooterDiscountPercent(pct);
                              setFooterDiscountPercentStr(pct > 0 ? formatDecimalForTrInput(pct) : '');
                            }}
                            className={`px-2 py-1 text-xs rounded border transition-colors ${
                              footerDiscountMode === 'amount'
                                ? 'bg-[var(--asin-accent,#1FA8A0)] text-white border-[var(--asin-accent,#1FA8A0)]'
                                : darkMode
                                  ? 'bg-gray-700 text-gray-200 border-gray-600 hover:border-[var(--asin-accent,#1FA8A0)]'
                                  : 'bg-white text-gray-700 border-gray-300 hover:border-[var(--asin-accent,#1FA8A0)]'
                            }`}
                          >
                            {currency || ledgerCurrency}
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div className="flex-1">
                          <label className={`block text-[10px] uppercase tracking-wide mb-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>%</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={footerDiscountPercentStr}
                            onChange={(e) => applyFooterDiscountPercent(e.target.value)}
                            onBlur={() => {
                              if (footerDiscountMode === 'percentage') {
                                const pct = Math.min(100, Math.max(0, footerDiscountPercent || 0));
                                setFooterDiscountPercent(pct);
                                setFooterDiscountPercentStr(pct > 0 ? formatDecimalForTrInput(pct) : '');
                                setFooterDiscountAmount(totals.footerDiscount);
                                setFooterDiscountAmountStr(
                                  totals.footerDiscount > 0 ? formatDecimalForTrInput(totals.footerDiscount) : ''
                                );
                              }
                            }}
                            placeholder="0"
                            className={`w-full px-2 py-1.5 text-sm text-right rounded border outline-none focus:ring-2 focus:ring-[var(--asin-accent,#1FA8A0)] ${
                              darkMode
                                ? 'bg-gray-800 border-gray-600 text-gray-100'
                                : 'bg-white border-gray-300 text-gray-800'
                            }`}
                          />
                        </div>
                        <div className="flex-1">
                          <label className={`block text-[10px] uppercase tracking-wide mb-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {tm('discountAmount')}
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={footerDiscountAmountStr}
                            onChange={(e) => applyFooterDiscountAmount(e.target.value)}
                            onBlur={() => {
                              if (footerDiscountMode === 'amount') {
                                const amt = Math.max(0, footerDiscountAmount || 0);
                                setFooterDiscountAmount(amt);
                                setFooterDiscountAmountStr(amt > 0 ? formatDecimalForTrInput(amt) : '');
                                const pct = totals.footerDiscountPercent || 0;
                                setFooterDiscountPercent(pct);
                                setFooterDiscountPercentStr(pct > 0 ? formatDecimalForTrInput(pct) : '');
                              }
                            }}
                            placeholder="0"
                            className={`w-full px-2 py-1.5 text-sm text-right rounded border outline-none focus:ring-2 focus:ring-[var(--asin-accent,#1FA8A0)] ${
                              darkMode
                                ? 'bg-gray-800 border-gray-600 text-gray-100'
                                : 'bg-white border-gray-300 text-gray-800'
                            }`}
                          />
                        </div>
                      </div>
                      {totals.footerDiscount > 0 && currency !== ledgerCurrency && (
                        <div className={`flex justify-between text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <span>{tm('footerDiscount')} ({ledgerCurrency})</span>
                          <span className="text-red-400">-{formatNumber(totals.footerDiscountIQD, 2, false)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between">
                      <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>{tm('discountTotal')}</span>
                      <span className="text-red-500">-{formatNumber(currency !== ledgerCurrency ? totals.totalDiscountIQD : totals.totalDiscount, 2, false)}</span>
                    </div>
                    {invoiceType.category === 'Satis' && totalCost > 0 && canViewPurchasePricing() && (
                      <>
                        <div className={`flex justify-between border-t pt-2 mt-2 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                          <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>{tm('costPurchase')}</span>
                          <span className={darkMode ? 'text-gray-200' : 'text-gray-700'}>{formatNumber(totalCost, 2, false)}</span>
                        </div>
                        <div className={`flex justify-between border-t pt-2 mt-2 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                          <span className={`font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-600'}`}>{tm('profitSalesPurchase')}</span>
                          <span className={totalGrossProfit >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                            {formatNumber(totalGrossProfit, 2, false)}
                          </span>
                        </div>
                        <div className={`flex justify-between text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <span>{tm('profitMarginLabel')}</span>
                          <span>{formatNumber(profitMargin, 2, false)}%</span>
                        </div>
                      </>
                    )}
                    <div className={`flex justify-between border-t pt-2 mt-2 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                      <span className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {tm('net')}{currency !== ledgerCurrency ? ` (${ledgerCurrency})` : ''}
                      </span>
                      <span className={`${getCariTextColor()} text-2xl font-bold`}>
                        {formatNumber(currency !== ledgerCurrency ? totals.netIQD : totals.net, 2, false)}
                      </span>
                    </div>
                    {currency !== ledgerCurrency && (
                      <div className={`flex justify-between text-xs pt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        <span>{tm('net')} ({currency})</span>
                        <span>{formatNumber(totals.net, 2, true)} {currency}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-3 items-center flex-wrap">
                  <select
                    value={currency}
                    onChange={(e) => {
                      const v = e.target.value;
                      currencyRateUserTouchedRef.current = false;
                      setCurrency(v);
                      if (v === ledgerCurrency) {
                        setCurrencyRate(1);
                        setCurrencyRateStr('');
                      }
                    }}
                    className="px-2 py-2 border border-gray-300 rounded text-sm min-w-[4.5rem] bg-white"
                    title={tm('currencyLabel')}
                  >
                    {invoiceCurrencyCodes.map(code => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                  {currency !== ledgerCurrency && (
                    <div className="flex items-center gap-1" title="Yerel tutar = adet × birim fiyat (döviz) × bu kur">
                      <span className="text-xs text-gray-500 whitespace-nowrap">1 {currency} =</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="1,54"
                        value={currencyRateStr}
                        onChange={(e) => {
                          currencyRateUserTouchedRef.current = true;
                          const raw = e.target.value;
                          setCurrencyRateStr(raw);
                          const n = parseDecimalStringForInput(raw);
                          if (Number.isFinite(n) && n > 0) setCurrencyRate(n);
                        }}
                        className="w-24 px-2 py-2 border border-orange-300 rounded text-sm text-right font-medium"
                      />
                      <span className="text-xs text-gray-500">{ledgerCurrency}</span>
                    </div>
                  )}
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
                          onChange={(e) => {
                            const v = e.target.value;
                            currencyRateUserTouchedRef.current = false;
                            setCurrency(v);
                            if (v === ledgerCurrency) {
                              setCurrencyRate(1);
                              setCurrencyRateStr('');
                            }
                          }}
                          className="w-full px-3 py-2 border border-[var(--asin-accent,#1FA8A0)]/50 bg-[var(--asin-accent-muted,#D5F0EE)] rounded text-sm font-bold"
                        >
                          {invoiceCurrencyCodes.map(code => (
                            <option key={code} value={code}>{code}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          className="block text-sm font-medium text-gray-700 mb-1"
                          title={`${ledgerCurrency} tutarı = satır (döviz) × kur. Örn. adet × 6 $ × 1,54`}
                        >
                          {tm('currencyRateShort')} (1 {currency} = ? {ledgerCurrency})
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="1,54"
                          value={currency === ledgerCurrency ? '' : currencyRateStr}
                          onChange={(e) => {
                            currencyRateUserTouchedRef.current = true;
                            const raw = e.target.value;
                            setCurrencyRateStr(raw);
                            const n = parseDecimalStringForInput(raw);
                            if (Number.isFinite(n) && n > 0) setCurrencyRate(n);
                          }}
                          disabled={currency === ledgerCurrency}
                          className={`w-full px-3 py-2 border rounded text-sm ${currency === ledgerCurrency ? 'border-gray-200 bg-gray-100 text-gray-400' : 'border-orange-300 font-semibold bg-orange-50'}`}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('currencyRateType')}</label>
                        <select
                          value={currencyRateType}
                          onChange={(e) => {
                            currencyRateUserTouchedRef.current = false;
                            setCurrencyRateType(e.target.value);
                          }}
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
                            className="w-4 h-4 text-[var(--asin-accent,#1FA8A0)] rounded border-gray-300 focus:ring-[var(--asin-accent,#1FA8A0)]"
                          />
                          <span className="text-sm font-medium text-gray-700">{tm('currencyTransaction')}</span>
                        </label>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('transactionField')}</label>
                        <select
                          value={transactionType}
                          onChange={(e) => setTransactionType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="">{tm('select')}...</option>
                          <option value="NORMAL">{tm('normalTransaction')}</option>
                          <option value="CONSIGNMENT">{tm('consignment')}</option>
                          <option value="RETURN">{tm('salesReturn')}</option>
                          <option value="EXCHANGE">{tm('exchangeTransaction')}</option>
                          <option value="SAMPLE">{tm('sampleTransaction')}</option>
                          <option value="PROMOTION">{tm('promotionTransaction')}</option>
                          <option value="DAMAGED">{tm('damagedTransaction')}</option>
                        </select>
                        {invoiceType.category === 'Alis' && transactionType === 'PROMOTION' && (
                          <p className="text-xs text-amber-700 mt-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                            {tm('purchasePromoHint')}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('totalWithCurrency')} ({ledgerCurrency})</label>
                        <input
                          type="text"
                          readOnly
                          value={formatNumber(totals.netIQD, 2, false)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50 font-semibold text-teal-700"
                        />
                        {currency !== ledgerCurrency && (
                          <div className="text-xs text-gray-400 mt-0.5">{formatNumber(totals.net, 2, true)} {currency}</div>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('distributedTotal')}</label>
                        <input
                          type="number"
                          value={distributedTotal}
                          onChange={(e) => setDistributedTotal(parseFloat(e.target.value) || 0)}
                          step="0.01"
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{tm('taxRate')}</label>
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('accountCodeLabel')}</label>
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('accountTitleLabel')}</label>
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
                          className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--asin-accent,#1FA8A0)] hover:text-[var(--asin-primary,#0E2433)] hover:bg-[var(--asin-accent-muted,#D5F0EE)] rounded transition-colors"
                          title={tm('selectProduct')}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[var(--asin-accent,#1FA8A0)]"
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
                          {invoiceCurrencyCodes.map(code => (
                            <option key={`rep-${code}`} value={code}>{code}</option>
                          ))}
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
          {showCustomerModal && (
            <InvoiceCariSelectModal
              mode="customer"
              items={customers.map((c) => ({
                id: String(c.id),
                code: (c as any).code,
                name: c.name,
                phone: (c as any).phone,
                email: (c as any).email,
              }))}
              selectedId={customerId || undefined}
              onSelect={(item) => {
                if (!item) {
                  setCustomerId('');
                  setCustomerCode('');
                  setCustomerTitle('');
                  setSelectedCariBalance(null);
                  setSelectedCariPhone(null);
                } else {
                  setCustomerId(item.id);
                  setCustomerCode(item.code || '');
                  setCustomerTitle(item.name);
                  const found = customers.find((c) => String(c.id) === String(item.id));
                  setSelectedCariBalance(found ? Number(found.balance ?? 0) : 0);
                  setSelectedCariPhone(String(item.phone || (found as any)?.phone || (found as any)?.phone2 || '').trim() || null);
                }
              }}
              onClose={() => setShowCustomerModal(false)}
              onCreate={(p) => handleQuickCreateCari('customer', p)}
            />
          )}

          {showSupplierModal && (
            <InvoiceCariSelectModal
              mode="supplier"
              items={suppliers.map((s) => ({
                id: String(s.id),
                code: s.code,
                name: s.name,
                phone: s.phone,
                email: s.email,
              }))}
              selectedId={supplierId || undefined}
              onSelect={(item) => {
                if (!item) {
                  setSupplierId('');
                  setSupplierCode('');
                  setSupplierTitle('');
                  setSelectedCariBalance(null);
                  setSelectedCariPhone(null);
                } else {
                  setSupplierId(item.id);
                  setSupplierCode(item.code || '');
                  setSupplierTitle(item.name);
                  const found = suppliers.find((s) => String(s.id) === String(item.id));
                  setSelectedCariBalance(found ? Number((found as any).balance ?? 0) : 0);
                  setSelectedCariPhone(String(item.phone || (found as any)?.phone || '').trim() || null);
                }
              }}
              onClose={() => setShowSupplierModal(false)}
              onCreate={(p) => handleQuickCreateCari('supplier', p)}
            />
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
              mode={selectedRowForProduct !== null ? 'invoice-multi-select' : 'add-to-cart'}
              onClose={() => { setShowProductCatalogModal(false); setSelectedRowForProduct(null); }}
              onAddToCart={(product, variant) => {
                if (selectedRowForProduct !== null) handleProductSelectForRow(product, variant, selectedRowForProduct);
                else handleProductFromCatalog(product, variant);
              }}
              onAddMultiple={(selected) => {
                if (selectedRowForProduct !== null) {
                  handleProductsBulkSelectForRow(selected, selectedRowForProduct);
                } else {
                  handleProductsBulkSelectForRow(selected, currentRowIndex);
                }
              }}
            />
          )}

          {showEditDateModal && <InvoiceEditDateModal currentDate={editDate} onSelect={setEditDate} onClose={() => setShowEditDateModal(false)} />}
          {showTransactionDateModal && <InvoiceEditDateModal currentDate={transactionDate} onSelect={setTransactionDate} onClose={() => setShowTransactionDateModal(false)} />}
          {showSpecialCodeModal && <InvoiceSpecialCodeModal currentCode={specialCode} onSelect={setSpecialCode} onClose={() => setShowSpecialCodeModal(false)} />}
          {showTradingGroupModal && <InvoiceTradingGroupModal currentGroup={tradingGroup} onSelect={setTradingGroup} onClose={() => setShowTradingGroupModal(false)} />}
          {showAuthorizationModal && <InvoiceAuthorizationModal currentAuth={authorizationCode} onSelect={setAuthorizationCode} onClose={() => setShowAuthorizationModal(false)} />}
          {showPaymentInfoModal && (
            <InvoicePaymentInfoModal
              currentPaymentMethod={paymentMethod}
              retailPosMode={isPosRetail}
              onSelect={setPaymentMethod}
              onClose={() => setShowPaymentInfoModal(false)}
            />
          )}
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

          <InventoryBarcodeScanner
            darkMode={darkMode}
            isOpen={showCameraScanner}
            title="Ürün Barkodu Tara"
            onClose={() => setShowCameraScanner(false)}
            onScan={(barcode) => {
              handleCameraBarcodeScan(barcode);
              setShowCameraScanner(false);
            }}
          />
        </div>
    </div>,
    document.body
  );
}

