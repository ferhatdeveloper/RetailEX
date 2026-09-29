import { X, CreditCard, Banknote, Wallet, Plus, Trash2, CheckCircle, Calculator, ShoppingCart, Minus, Globe, Tag, TrendingDown, Loader2, Printer, ChevronDown, FileText, Receipt, Calendar } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { CartItem } from './types';
import type { Campaign, Customer } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import {
  getReceiptSettings,
  resolveDefaultPosReceiptPrintFormat,
  resolveDefaultReceiptLang,
  saveReceiptSettings,
  type PosReceiptPrintFormat
} from '../../services/receiptSettingsService';
import { useTheme } from '../../contexts/ThemeContext';
import { ModalLayer } from '../shared/FullscreenBodyPortal';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import {
  collectCustomerDebt,
  getCustomerOutstandingInvoices,
  getCustomerOutstandingBalance,
  type CustomerOutstandingInvoice,
} from '../../services/api/customerDebtCollection';
import { formatCurrency, formatNumber, formatMoneyWithCode, getGlobalCurrency } from '../../utils/currency';
import { formatNumber as formatNumberTR } from '../../utils/formatNumber';
import { posPaymentAdditionalDiscount, roundPosMoneyAmount, posMoneyEpsilon, getPosQuickDiscountAmountPresets } from '../../utils/discountRounding';
import { getCurrencyDecimalPlaces } from '../../utils/currency';
import { POSCancelReasonModal } from './POSCancelReasonModal';
import { fetchKasalar, type Kasa } from '../../services/api/kasa';
import {
  POS_CARI_REMAINING_THRESHOLD,
  buildVeresiyeForRemaining as buildVeresiyeForRemainingHelper,
} from '../../utils/posCariRemainder';
import {
  buildPesinatliPayments,
  buildPesinatliVeresiye,
  isValidPesinatliInstallments,
  suggestPesinatliPayNow,
} from '../../utils/posPesinatli';
import {
  loadReportMenuParams,
  subscribeReportMenuParams,
} from '../../services/reportMenuParamsService';
import { isPosPaymentBackToSaleAllowed } from '../../utils/posPaymentBackGuard';

// Helper function to format number with Turkish formatting (nokta binlik, virgül ondalık)
const formatNumberInput = (value: string): string => {
  // Türkiye formatı: binlik ayırıcı nokta (.), ondalık ayırıcı virgül (,)
  // Kullanıcının yazdığı nokta ve virgülleri koru, sadece geçersiz karakterleri temizle
  const cleanValue = value.replace(/[^\d.,]/g, '');

  if (!cleanValue) return '';

  // Virgül varsa, ondan önce ve sonra ayır
  const commaIndex = cleanValue.lastIndexOf(',');

  let integerPart = '';
  let decimalPart = '';

  if (commaIndex !== -1) {
    // Virgül varsa, ondalık ayırıcı olarak kabul et
    integerPart = cleanValue.slice(0, commaIndex).replace(/\./g, '');
    decimalPart = cleanValue.slice(commaIndex + 1).replace(/[^\d]/g, '').slice(0, 2);
  } else {
    // Sadece rakamlar ve noktalar varsa, noktaları binlik ayırıcı olarak kabul et
    // Kullanıcı "2.000.000" yazabilmeli
    integerPart = cleanValue.replace(/\./g, '');
    decimalPart = '';
  }

  if (!integerPart) return decimalPart && decimalPart !== '00' ? `0,${decimalPart}` : '';

  // Binlik ayırıcı olarak nokta ekle
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // Ondalık kısmı virgül ile birleştir (sadece sıfır değilse)
  if (decimalPart && decimalPart !== '00' && decimalPart !== '0') {
    return `${formattedInteger},${decimalPart}`;
  }

  return formattedInteger;
};

// Helper function to parse Turkish formatted number back to float
const parseFormattedNumber = (value: string): number => {
  // Türkiye formatından parse et: nokta binlik, virgül ondalık
  // Örnek: "1.800.000,50" -> 1800000.50
  const normalized = value
    .replace(/\./g, '') // Binlik noktaları kaldır
    .replace(/,/g, '.'); // Ondalık virgülü noktaya çevir
  return parseFloat(normalized) || 0;
};

export interface POSPaymentModalPaymentRow {
  method: 'cash' | 'card' | 'veresiye' | 'pesinatli';
  amount: number;
  currency: 'IQD' | 'USD' | 'EUR';
  /** Seçilen kasa bilgisi — kasada ödeme türü gösterimi için */
  cash_register_id?: string;
  cash_register_name?: string;
  cash_register_code?: string;
  /**
   * Peşinatlı satış (pesinatli) için taksit planı (3/6/9/12 ay).
   * İlk taksit tahsilat satırında ve kalan veresiye satırında aynı değer
   * bulunur; ileride `installment_plans` tablosu eklenirse plan satırlarını
   * üretmek için kullanılır.
   */
  installments?: number;
  /** Taksit başına tahmini tutar (veresiye satırında gösterim için) */
  installment_amount?: number;
}

/** Hesabı kapatmadan ön fiş / adisyon yazdırırken modal içi özet */
export type POSPaymentModalDraftContext = {
  payments: POSPaymentModalPaymentRow[];
  totalPaid: number;
  change: number;
  remaining: number;
  finalTotal: number;
  discount: number;
  receiptLanguage: string;
  /**
   * Windows yazıcı servisi (RetailEX Print Service) açıksa `true` —
   * parent bu bayrağı görünce `Receipt80mm`'i `printImmediately` modunda
   * açmalı; kullanıcı fiş önizleme modalını GÖRMEMELİ.
   */
  printImmediatelyOnService?: boolean;
};

type Payment = POSPaymentModalPaymentRow;

/** Kalan tutar eşiği — müşteri varsa cariye yazılabilir. */
const CARI_REMAINING_THRESHOLD = POS_CARI_REMAINING_THRESHOLD;

interface POSPaymentModalProps {
  total: number;
  subtotal: number;
  itemDiscount: number;
  campaignDiscount: number;
  selectedCampaign?: Campaign | null;  // Kampanya bilgisi
  selectedCustomer?: Customer | null;
  receiptNumber?: string;
  /** false: Market POS — satışta otomatik yazdırma yok; fiş sonraki ekranda */
  showAutoPrintOption?: boolean;
  /** Ödeme sonrası fiş önizlemesi varsayılanı (Restoran: genelde false = doğrudan yazdır) */
  defaultShowReceiptPreview?: boolean;
  /** Restoran: ödeme modalından hesabı kapatmadan yazdır (Promise ile yükleme göstergesi) */
  onPrintDraftReceipt?: (ctx: POSPaymentModalDraftContext) => void | Promise<void>;
  /**
   * Windows yazıcı servisi AÇIK ve "Yazdır" butonuna basıldığında bu callback
   * çağrılır — parent POSPaymentModal'ı kapatıp sadece sessiz yazdırma yapar.
   * Kullanıcı yazdırma önizleme / fiş modalı görmez.
   */
  onCloseForSilentPrint?: () => void;
  onClose: () => void;
  onComplete: (paymentData: any, options?: { autoPrint?: boolean; language?: string }) => Promise<void> | void;
}

export function POSPaymentModal({
  total,
  subtotal,
  itemDiscount,
  campaignDiscount,
  selectedCampaign,
  selectedCustomer,
  receiptNumber = '',
  showAutoPrintOption = false,
  defaultShowReceiptPreview = true,
  onPrintDraftReceipt,
  onCloseForSilentPrint,
  onClose,
  onComplete
}: POSPaymentModalProps) {
  const { t, tm, language: uiLanguage } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const baseCurrency = useMemo(
    () => (selectedFirm?.ana_para_birimi?.trim().toUpperCase() || getGlobalCurrency()) as 'IQD' | 'USD' | 'EUR',
    [selectedFirm?.ana_para_birimi]
  );

  const [payments, setPayments] = useState<Payment[]>([]);
  const [currentMethod, setCurrentMethod] = useState<'cash' | 'card' | 'veresiye' | 'pesinatli'>('cash');
  /** Peşinatlı satış için seçilen taksit sayısı (0 = seçilmedi) */
  const [pesinatInstallments, setPesinatInstallments] = useState<3 | 6 | 9 | 12>(0 as 3 | 6 | 9 | 12);
  const [currentAmount, setCurrentAmount] = useState('');
  const [currentCurrency, setCurrentCurrency] = useState<'IQD' | 'USD' | 'EUR'>(baseCurrency);
  const [discountType, setDiscountType] = useState<'percentage' | 'amount'>('percentage');
  // Kasa listesi ve seçilen kasa (ödeme tipi değiştiğinde uygun kasalar önerilir)
  const [cashRegisters, setCashRegisters] = useState<Kasa[]>([]);
  const [cashRegistersLoading, setCashRegistersLoading] = useState(false);
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<string>('');
  const [showCashRegisterModal, setShowCashRegisterModal] = useState(false);
  const [discountValue, setDiscountValue] = useState('');
  const [showNumpad, setShowNumpad] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  // Müşteri cari borç tahsilatı — müşteri seçildiğinde listelenir
  const [customerInvoices, setCustomerInvoices] = useState<CustomerOutstandingInvoice[]>([]);
  const [customerInvoicesLoading, setCustomerInvoicesLoading] = useState(false);
  /** Müşteri cari bakiyesi (customers.balance) — negatif = borçlu */
  const [customerBalance, setCustomerBalance] = useState<number>(0);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [collectingDebt, setCollectingDebt] = useState(false);
  const [allowPaymentBackToSale, setAllowPaymentBackToSale] = useState(() =>
    isPosPaymentBackToSaleAllowed(),
  );
  
  // Receipt Settings (restoran: Tauri sessiz yazdır; Market POS’ta kapalı)
  const [autoPrint, setAutoPrint] = useState(false);
  const receiptFirmNr = useMemo(() => {
    const f = selectedFirm;
    if (!f) return undefined;
    const raw = f.firm_nr ?? f.firma_kodu ?? (f.nr != null ? String(f.nr) : '');
    const s = String(raw).trim().padStart(3, '0').slice(0, 10);
    return s || undefined;
  }, [selectedFirm]);
  const [receiptLanguage, setReceiptLanguage] = useState<string>(uiLanguage);
  const [printFormat, setPrintFormat] = useState<PosReceiptPrintFormat>('80mm');
  const [showReceiptPreview, setShowReceiptPreview] = useState(defaultShowReceiptPreview);

  useEffect(() => {
    let cancelled = false;
    void loadReportMenuParams().then((p) => {
      if (!cancelled) setAllowPaymentBackToSale(isPosPaymentBackToSaleAllowed(p));
    });
    const unsub = subscribeReportMenuParams((p) => {
      setAllowPaymentBackToSale(isPosPaymentBackToSaleAllowed(p));
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let printerDefault: string | undefined;
    let printerPaperSize: string | undefined;
    try {
      const savedPrinter = localStorage.getItem('retailos-printer-settings');
      if (savedPrinter) {
        const config = JSON.parse(savedPrinter);
        if (config.autoPrint !== undefined) setAutoPrint(config.autoPrint);
        printerDefault = config.defaultLanguage;
        printerPaperSize = config.paperSize;
      }
    } catch (err) {
      console.error('Failed to parse printer settings:', err);
    }
    void (async () => {
      let rs: Awaited<ReturnType<typeof getReceiptSettings>> = {};
      try {
        rs = await getReceiptSettings(receiptFirmNr);
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      setReceiptLanguage(resolveDefaultReceiptLang(rs, uiLanguage, printerDefault));
      setPrintFormat(resolveDefaultPosReceiptPrintFormat(rs, printerPaperSize));
    })();
    return () => {
      cancelled = true;
    };
  }, [receiptFirmNr, uiLanguage]);

  useEffect(() => {
    setCurrentCurrency(baseCurrency);
  }, [baseCurrency]);

  // Peşinatlı satış: input boşsa "bugün ödenecek" alanını kalan sepet
  // tutarı ile doldur (serbest — kullanıcı küçültebilir). currentAmount
  // üzerinde yazılı bir değer varsa müdahale etme (kullanıcı override'ı).
  useEffect(() => {
    if (currentMethod !== 'pesinatli') return;
    if (currentAmount && parseFormattedNumber(currentAmount) > 0) return;
    const suggested = suggestPesinatliPayNow(remaining);
    if (suggested > 0) {
      setCurrentAmount(formatNumberInput(suggested.toString()));
    }
    // remaining değiştiğinde de yeniden öner (sepet değişti / ödeme eklendi).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMethod]);

  // Müşteri değişince cari bakiye + bekleyen faturaları çek
  // (tek sorgu bloğu: customers.balance + sales + beauty_sales)
  useEffect(() => {
    const custId = selectedCustomer?.id;
    if (!custId) {
      setCustomerInvoices([]);
      setCustomerBalance(0);
      setSelectedInvoiceIds(new Set());
      return;
    }
    let cancelled = false;
    setCustomerInvoicesLoading(true);
    void getCustomerOutstandingBalance(custId)
      .then((info) => {
        if (cancelled) return;
        setCustomerBalance(info.customerBalance);
        setCustomerInvoices(info.outstandingInvoices);
        // Önceki seçimleri temizle (yeni müşteri → farklı fatura seti)
        setSelectedInvoiceIds(new Set());
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[POSPaymentModal] customerDebt load failed:', err);
        setCustomerInvoices([]);
        setCustomerBalance(0);
      })
      .finally(() => {
        if (!cancelled) setCustomerInvoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCustomer?.id]);

  const handlePrintFormatChange = async (nextFormat: PosReceiptPrintFormat) => {
    setPrintFormat(nextFormat);
    try {
      await saveReceiptSettings({ defaultPosReceiptPrintFormat: nextFormat }, receiptFirmNr);
    } catch (error) {
      console.error('[POSPaymentModal] defaultPosReceiptPrintFormat save failed:', error);
    }
  };
  const [isLoading, setIsLoading] = useState(false);
  const [draftPrintLoading, setDraftPrintLoading] = useState(false);

  const discountAmountDecimals = getCurrencyDecimalPlaces(baseCurrency);
  const quickDiscountAmounts = useMemo(
    () => getPosQuickDiscountAmountPresets(baseCurrency),
    [baseCurrency],
  );
  const formatSummaryMoney = (value: number) => formatMoneyWithCode(value, baseCurrency);
  const { darkMode } = useTheme();

  // Kasa listesini yükle (aktif kasalar)
  useEffect(() => {
    let cancelled = false;
    setCashRegistersLoading(true);
    fetchKasalar({ aktif: true })
      .then((rows) => {
        if (cancelled) return;
        setCashRegisters(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('[POSPaymentModal] fetchKasalar failed:', e);
        setCashRegisters([]);
      })
      .finally(() => {
        if (cancelled) return;
        setCashRegistersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Varsayılan kasa: her zaman listenin ilk öğesi (DB'ye ilk eklenmiş kasa,
  // fetchKasalar created_at'e göre sıralı döner).
  // Kullanıcı isterse kasa seçim modalından elle değiştirebilir.
  useEffect(() => {
    if (cashRegisters.length === 0) return;
    if (selectedCashRegisterId && cashRegisters.some((k) => k.id === selectedCashRegisterId)) return;
    setSelectedCashRegisterId(cashRegisters[0]?.id || '');
  }, [currentMethod, cashRegisters, selectedCashRegisterId]);

  const selectedCashRegister = cashRegisters.find((k) => k.id === selectedCashRegisterId) || null;

  // Ana para birimi — UI'da USD/IQD seçici yok; tutarlar firma bazında
  const exchangeRates: Record<string, number> = {
    IQD: 1,
    USD: 1310,
    EUR: 1450,
  };

  // İlave indirim — yüzde gerçek oran; IQD 250 kademesi yalnızca tutar modunda
  const parsedDiscountValue = parseFloat(discountValue);
  const calculatedDiscount =
    discountValue && Number.isFinite(parsedDiscountValue) && parsedDiscountValue > 0
      ? posPaymentAdditionalDiscount(total, parsedDiscountValue, discountType, baseCurrency)
      : 0;

  const finalTotal = roundPosMoneyAmount(total - calculatedDiscount, baseCurrency);

  // Calculate total paid (convert all to base currency)
  const totalPaidRaw = payments.reduce((sum, payment) => {
    const amountInBase = payment.amount * (exchangeRates[payment.currency] ?? 1);
    return sum + amountInBase;
  }, 0);
  const totalPaid = roundPosMoneyAmount(totalPaidRaw, baseCurrency);

  const remainingRaw = finalTotal - totalPaid;
  const remaining = remainingRaw > posMoneyEpsilon(baseCurrency)
    ? roundPosMoneyAmount(remainingRaw, baseCurrency)
    : 0;
  const change = totalPaid > finalTotal + posMoneyEpsilon(baseCurrency)
    ? roundPosMoneyAmount(totalPaid - finalTotal, baseCurrency)
    : 0;

  const hasCariRemainder = remaining > CARI_REMAINING_THRESHOLD;
  const canPostRemainderToCari = Boolean(selectedCustomer) && hasCariRemainder;
  const selectCustomerForCariMessage =
    tm('posSelectCustomerForCari') || t.selectCustomerForCari || t.pleaseSelectCustomer || 'Kalanı cariye yazmak için müşteri seçin.';
  const writeRemainingToCariLabel =
    tm('posWriteRemainingToCari') || t.writeRemainingToCari || 'Kalanı cariye yaz';

  const buildVeresiyeForRemaining = (amount: number): Payment =>
    buildVeresiyeForRemainingHelper(amount, baseCurrency);

  /** Peşin/kart/QR satırına kasa; veresiye satırına kasa adı yazılmaz. */
  const cashRegisterFieldsForMethod = (
    method: Payment['method'],
  ): Pick<Payment, 'cash_register_id' | 'cash_register_name' | 'cash_register_code'> => {
    if (method === 'veresiye' || !selectedCashRegister) return {};
    return {
      cash_register_id: selectedCashRegister.id,
      cash_register_name: selectedCashRegister.kasa_adi,
      cash_register_code: selectedCashRegister.kasa_kodu,
    };
  };

  const handleWriteRemainingToCari = () => {
    if (!selectedCustomer) {
      alert(selectCustomerForCariMessage);
      return;
    }
    if (!hasCariRemainder) return;
    // Peşinatlı: yeni akışta kalan zaten handleAddPayment'ta veresiye satırı
    // olarak eklendi. Burada yalnızca kullanıcı henüz eklemediyse fallback
    // olarak yazıyoruz (geriye dönük uyum / eski akıştan kalan ödeme yok).
    if (
      currentMethod === 'pesinatli' &&
      isValidPesinatliInstallments(pesinatInstallments)
    ) {
      const veresiyeRow = buildPesinatliVeresiye({
        amount: remaining,
        installments: pesinatInstallments as 3 | 6 | 9 | 12,
        currency: baseCurrency,
      });
      setPayments((prev) => [...prev, veresiyeRow as unknown as Payment]);
      return;
    }
    setPayments((prev) => [...prev, buildVeresiyeForRemaining(remaining)]);
  };

  const handleNumpadClick = (value: string) => {
    if (value === 'clear') {
      setCurrentAmount('');
    } else if (value === 'backspace') {
      setCurrentAmount(prev => prev.slice(0, -1));
    } else if (value === ',' || value === '.') {
      // Türkiye formatı: virgül (,) ondalık ayırıcı
      if (!currentAmount.includes(',') && !currentAmount.includes('.')) {
        setCurrentAmount(prev => prev + ',');
      }
    } else {
      setCurrentAmount(prev => prev + value);
    }
  };

  const handleAddPayment = async () => {
    const amount = parseFormattedNumber(currentAmount);
    if (!amount || amount <= 0) return;

    const normalizedAmount = Number.isFinite(amount) ? amount : 0;
    if (normalizedAmount <= 0) return;

    // Peşinatlı: serbest tutar — kalan cariye yazılır.
    if (currentMethod === 'pesinatli') {
      try {
        const totalForPesinat = remaining + totalPaid;
        const rows = buildPesinatliPayments({
          totalAmount: totalForPesinat,
          payNow: normalizedAmount,
          currency: currentCurrency,
          installments: isValidPesinatliInstallments(pesinatInstallments)
            ? (pesinatInstallments as 3 | 6 | 9 | 12)
            : null,
          cashRegister: selectedCashRegister
            ? {
                id: selectedCashRegister.id,
                kasa_adi: selectedCashRegister.kasa_adi,
                kasa_kodu: selectedCashRegister.kasa_kodu,
              }
            : null,
        });
        // Veresiye satırına cari türü kasa alanı yazılmaz.
        const sanitized = rows.map((row) => {
          if (row.method === 'veresiye') {
            const { cash_register_id, cash_register_name, cash_register_code, ...rest } = row as any;
            return rest as Payment;
          }
          return row as Payment;
        });
        setPayments((prev) => [...prev, ...sanitized]);
        setCurrentAmount('');
        const kalanRow = sanitized.find((r) => r.method === 'veresiye') as Payment | undefined;
        if (kalanRow && Number(kalanRow.amount) > 0) {
          toast.success(
            `${tm('pesinatAddButton') || 'Peşinat Ekle'}: ${formatMoneyWithCode(normalizedAmount, currentCurrency)} · ${tm('pesinatRemainderToCari') || 'Kalan cariye yazıldı'}: ${formatMoneyWithCode(Number(kalanRow.amount), currentCurrency)}`,
          );
        } else {
          toast.success(
            `${tm('pesinatTodayPaid') || 'Bugün ödenen'}: ${formatMoneyWithCode(normalizedAmount, currentCurrency)}`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg || 'Geçersiz tutar.');
      }
      return;
    }

    const newPayment: Payment = {
      method: currentMethod,
      amount: normalizedAmount,
      currency: currentCurrency,
      ...cashRegisterFieldsForMethod(currentMethod),
    };

    setPayments((prev) => [...prev, newPayment]);
    setCurrentAmount('');
  };

  const handleRemovePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  // ----- Müşteri cari borç tahsilatı -----
  const customerDebtTotal = useMemo(
    () => customerInvoices.reduce((s, i) => s + (Number(i.remaining) || 0), 0),
    [customerInvoices],
  );
  const selectedDebtTotal = useMemo(
    () =>
      customerInvoices
        .filter((i) => selectedInvoiceIds.has(i.id))
        .reduce((s, i) => s + (Number(i.remaining) || 0), 0),
    [customerInvoices, selectedInvoiceIds],
  );

  const handleCollectCustomerDebt = async () => {
    if (!selectedCustomer) {
      toast.error('Müşteri seçilmedi.');
      return;
    }
    if (!selectedCashRegisterId) {
      toast.error(tm('selectCashRegister') || 'Aktif kasa seçilmedi.');
      return;
    }
    const ids = Array.from(selectedInvoiceIds);
    if (ids.length === 0) return;

    // Toplam tutar (IQD tabanlı, çünkü POS baseCurrency ile çalışıyor).
    // Müşteri Borcu listesi IQD cinsinden; currentCurrency karışıklığı yok.
    if (!(selectedDebtTotal > 0)) {
      toast.error('Tahsilat tutarı sıfır.');
      return;
    }

    setCollectingDebt(true);
    try {
      const methodLabel =
        currentMethod === 'cash'
          ? 'Nakit'
          : currentMethod === 'card'
            ? 'Kart'
            : 'Tahsilat';
      // invoiceSources: id → tablo. customerInvoices içindeki `source` alanı
      // (sales / beauty_sales) hangi tabloya paid_amount yazılacağını belirler.
      // Tahsilat fonksiyonu verilmezse geriye dönük uyumluluk için `sales` varsayılır.
      const invoiceSources: Record<string, 'sales' | 'beauty_sales'> = {};
      for (const inv of customerInvoices) {
        if (ids.includes(inv.id) && inv.source) {
          invoiceSources[inv.id] = inv.source;
        }
      }
      const res = await collectCustomerDebt({
        customerId: selectedCustomer.id,
        invoiceIds: ids,
        amount: selectedDebtTotal,
        cashRegisterId: selectedCashRegisterId,
        cashRegisterName: selectedCashRegister?.kasa_adi,
        cashRegisterCode: selectedCashRegister?.kasa_kodu,
        paymentMethodLabel: methodLabel,
        invoiceSources,
      });
      // Tahsilat tutarını "Toplam Ödenen"e ekle — yeni bir payment satırı
      // olarak listeye yaz (parent onComplete'e iletecek).
      setPayments((prev) => [
        ...prev,
        {
          method: currentMethod === 'veresiye' ? 'cash' : currentMethod,
          amount: res.totalAmount,
          currency: baseCurrency,
          cash_register_id: selectedCashRegisterId,
          cash_register_name: selectedCashRegister?.kasa_adi,
          cash_register_code: selectedCashRegister?.kasa_kodu,
        },
      ]);
      // Listeyi yenile (kalan bakiye sıfırlanan faturalar kaybolur; cari
      // bakiye de güncellenir çünkü tahsilat `customers.balance -= amount`
      // yazdı — bakiye daha az negatif olur).
      const refreshed = await getCustomerOutstandingBalance(selectedCustomer.id);
      setCustomerInvoices(refreshed.outstandingInvoices);
      setCustomerBalance(refreshed.customerBalance);
      setSelectedInvoiceIds(new Set());
      toast.success(
        `${res.cashLinesWritten} ${tm('invoiceCount') || 'fatura'} ${tm('collected') || 'tahsil edildi'}: ${formatSummaryMoney(res.totalAmount)}`,
      );
    } catch (err) {
      console.error('[POSPaymentModal] collectCustomerDebt failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || (tm('collectionFailed') || 'Tahsilat başarısız'));
    } finally {
      setCollectingDebt(false);
    }
  };

  const handlePrintDraftReceipt = async () => {
    if (!onPrintDraftReceipt || draftPrintLoading) return;
    // Windows yazıcı servisi açık mı? Açıksa parent'a "öniizleme gösterme,
    // doğrudan yazdır" bayrağı gönderiyoruz — kullanıcı fiş önizleme modalını
    // görmemeli, sadece "Yazdırılıyor..." göstergesi.
    let printImmediatelyOnService = false;
    try {
      const { isWindowsPrinterServiceEnabled } = await import(
        '../../services/unifiedPrintQueueService'
      );
      printImmediatelyOnService = await isWindowsPrinterServiceEnabled();
    } catch {
      // Servis yok/erişilemez → eski davranışa düş (öniizleme açılır)
      printImmediatelyOnService = false;
    }
    const ctx: POSPaymentModalDraftContext = {
      payments: payments.map(p => ({ ...p })),
      totalPaid,
      change,
      remaining,
      finalTotal,
      discount: calculatedDiscount,
      receiptLanguage,
      printImmediatelyOnService,
    };
    // Windows yazıcı servisi açıksa: önce sessiz yazdırma için POSPaymentModal'ı
    // kapat (kullanıcı modalı görmesin), sonra parent'a adisyon yazdırmayı tetikle.
    if (printImmediatelyOnService && onCloseForSilentPrint) {
      setDraftPrintLoading(true);
      try {
        onCloseForSilentPrint();
        await Promise.resolve(onPrintDraftReceipt(ctx));
      } catch (e) {
        console.error('[POSPaymentModal] onPrintDraftReceipt (silent)', e);
      } finally {
        setDraftPrintLoading(false);
      }
      return;
    }
    setDraftPrintLoading(true);
    try {
      await Promise.resolve(onPrintDraftReceipt(ctx));
    } catch (e) {
      console.error('[POSPaymentModal] onPrintDraftReceipt', e);
    } finally {
      setDraftPrintLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (isLoading) return;

    let paymentsToSubmit = payments.map((p) => ({ ...p }));
    let totalPaidAfter = totalPaid;
    let remainingAfter = remaining;
    let changeAfter = change;

    if (remainingAfter > CARI_REMAINING_THRESHOLD) {
      if (!selectedCustomer) {
        alert(selectCustomerForCariMessage);
        return;
      }
      // Peşinatlı seçili ve taksit planı belirli ise kalan tutar
      // taksit metadata'sı ile cariye yazılır; değilse düz veresiye.
      // Yeni akışta: handleAddPayment zaten iki satır üretir (peşinat +
      // veresiye) → remainingAfter = 0 olur ve bu blok atlanır. Buradaki
      // yalnızca fallback — kullanıcı eski usul "peşinat ekle + Kalanı
      // cariye yaz" akışını kullandıysa devreye girer.
      const veresiyeRow =
        currentMethod === 'pesinatli' &&
        isValidPesinatliInstallments(pesinatInstallments)
          ? buildPesinatliVeresiye({
              amount: remainingAfter,
              installments: pesinatInstallments as 3 | 6 | 9 | 12,
              currency: baseCurrency,
            })
          : buildVeresiyeForRemaining(remainingAfter);
      paymentsToSubmit = [...paymentsToSubmit, veresiyeRow as Payment];
      const amountInBase = (veresiyeRow as any).amount * (exchangeRates[(veresiyeRow as any).currency] ?? 1);
      totalPaidAfter = roundPosMoneyAmount(totalPaidAfter + amountInBase, baseCurrency);
      remainingAfter = 0;
      changeAfter = 0;
    }

    setIsLoading(true);
    // Sistem ayarlarında Windows yazıcı servisi (RetailEX Print Service)
    // AÇIKSA fiş önizleme modalını GÖSTERMEMELİYİZ — kullanıcı sadece
    // «Yazdırılıyor...» göstergesini görsün, ardından yazıcıya gitsin.
    // showReceiptPreview'ı yalnızca ödeme anında override ediyoruz;
    // UI checkbox'ı kullanıcının tercihine saygı için olduğu gibi kalır.
    let printImmediatelyOnService = false;
    try {
      const { isWindowsPrinterServiceEnabled } = await import(
        '../../services/unifiedPrintQueueService'
      );
      printImmediatelyOnService = await isWindowsPrinterServiceEnabled();
    } catch {
      printImmediatelyOnService = false;
    }
    const effectiveShowReceiptPreview = printImmediatelyOnService ? false : showReceiptPreview;
    const paymentPayload = {
      payments: paymentsToSubmit,
      totalPaid: totalPaidAfter,
      change: changeAfter,
      discount: calculatedDiscount,
      finalTotal: finalTotal,
      autoPrint: showAutoPrintOption ? autoPrint : false,
      language: receiptLanguage,
      printFormat,
      showReceiptPreview: effectiveShowReceiptPreview,
      // Ödeme tipi başına seçilen kasaları payload'a ekle
      cash_register_id: selectedCashRegister?.id,
      cash_register_name: selectedCashRegister?.kasa_adi,
      cash_register_code: selectedCashRegister?.kasa_kodu,
    };
    const PAYMENT_TIMEOUT_MS = 45_000;
    try {
      await Promise.race([
        Promise.resolve(onComplete(paymentPayload)),
        new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  'Ödeme işlemi zaman aşımına uğradı (45 sn). Yerel PostgreSQL veya ağ bağlantısını kontrol edin.',
                ),
              ),
            PAYMENT_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      console.error('Payment confirmation error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(msg || 'Ödeme tamamlanamadı.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestClose = () => {
    if (isLoading || draftPrintLoading) return;
    if (!allowPaymentBackToSale) {
      alert(
        tm('posPaymentBackBlocked') ||
          'Bu işlem parametre ile kapatıldı. Ödeme ekranından satışa geri dönüşe izin verilmiyor.',
      );
      return;
    }
    setShowCancelReasonModal(true);
  };

  const handleCancelConfirm = () => {
    setShowCancelReasonModal(false);
    onClose();
  };

  const paymentMethods = [
    { id: 'cash', name: t.cashLabel || 'Nakit', icon: Wallet },
    { id: 'card', name: t.cardLabel || 'Kart (POS)', icon: CreditCard },
    {
      id: 'pesinatli',
      name: tm('paymentMethodPesinatli') || t.pesinatliLabel || 'Peşinatlı Satış',
      icon: Calendar,
    },
    { id: 'veresiye', name: t.veresiyeLabel || 'Veresiye (Cari)', icon: Wallet, disabled: !selectedCustomer },
  ];

  return (
    <ModalLayer className="bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`w-full ${showNumpad ? 'max-w-6xl' : 'max-w-4xl'} max-h-[95vh] flex flex-col shadow-2xl transition-all duration-300 ${darkMode ? 'bg-gray-900' : 'bg-white'
          }`}
      >
        {/* Header */}
        <div className={`p-3 border-b flex items-center justify-between ${darkMode ? 'border-gray-700 bg-gradient-to-r from-gray-700 to-gray-600' : 'border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700'
          }`}>
          <h3 className="text-base text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {t.paymentTitle || 'Ödeme Al'}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNumpad(!showNumpad)}
              className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors ${showNumpad
                ? 'bg-white/20 text-white'
                : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
            >
              <Calculator className="w-4 h-4" />
              {t.numpad || 'Numpad'}
            </button>
            <button
              onClick={handleRequestClose}
              title={
                allowPaymentBackToSale
                  ? undefined
                  : tm('posPaymentBackBlocked') ||
                    'Bu işlem parametre ile kapatıldı. Ödeme ekranından satışa geri dönüşe izin verilmiyor.'
              }
              className={`text-white p-1 ${
                allowPaymentBackToSale
                  ? 'hover:text-gray-200'
                  : 'opacity-40 cursor-not-allowed'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Campaign Banner */}
        {selectedCampaign && campaignDiscount > 0 && (
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-2.5 border-b flex items-center gap-2">
            <Tag className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{selectedCampaign.name}</div>
              <div className="text-xs text-orange-100">{t.campaignDiscount || 'Kampanya İndirimi'}: -{formatCurrency(campaignDiscount)}</div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          <div className={`grid ${showNumpad ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
            {/* Left - Summary */}
            <div className="space-y-3">
              {/* Discount Input */}
              <div className={`border p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'}`}>
                <h4 className={`text-sm mb-3 flex items-center gap-2 ${darkMode ? 'text-blue-400' : 'text-blue-800'}`}>
                  <TrendingDown className="w-4 h-4" />
                  {t.discountOptional || 'İlave İndirim (Opsiyonel)'}
                </h4>

                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setDiscountType('percentage')}
                    className={`flex-1 px-3 py-2 text-xs border transition-colors ${discountType === 'percentage'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : darkMode
                        ? 'bg-gray-700 text-gray-200 border-gray-600 hover:border-blue-400'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                      }`}
                  >
                    %
                  </button>
                  <button
                    onClick={() => setDiscountType('amount')}
                    className={`flex-1 px-3 py-2 text-xs border transition-colors ${discountType === 'amount'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : darkMode
                        ? 'bg-gray-700 text-gray-200 border-gray-600 hover:border-blue-400'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                      }`}
                  >
                    <Banknote className="w-3.5 h-3.5 inline mr-1" />
                    {baseCurrency}
                  </button>
                </div>

                <input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percentage' ? t.discountPercentage || 'İndirim %' : t.discountAmount || 'İndirim Tutarı'}
                  step={discountType === 'percentage' ? '1' : (discountAmountDecimals > 0 ? '0.01' : '1')}
                  min="0"
                  className={`w-full px-3 py-2.5 text-sm border focus:outline-none focus:border-blue-600 mb-3 ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
                    }`}
                />

                {discountType === 'percentage' ? (
                  <div className="grid grid-cols-4 gap-2">
                    {[5, 10, 15, 20].map((percent) => (
                      <button
                        key={percent}
                        onClick={() => setDiscountValue(percent.toString())}
                        className={`px-2 py-1.5 text-xs border transition-colors ${darkMode
                          ? 'bg-gray-700 border-gray-600 text-blue-400 hover:bg-gray-600'
                          : 'bg-white border-blue-300 text-blue-700 hover:bg-blue-100'
                          }`}
                      >
                        %{percent}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={`grid gap-2 ${quickDiscountAmounts.length > 3 ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-3'}`}>
                    {quickDiscountAmounts.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setDiscountValue(amount.toString())}
                        className={`px-2 py-1.5 text-xs border transition-colors ${darkMode
                          ? 'bg-gray-700 border-gray-600 text-blue-400 hover:bg-gray-600'
                          : 'bg-white border-blue-300 text-blue-700 hover:bg-blue-100'
                          }`}
                      >
                        {formatMoneyWithCode(amount, baseCurrency)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Total Summary */}
              <div className={`border-2 p-5 shadow-sm ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-300'}`}>
                <h4 className={`text-xs uppercase tracking-wide mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t.paymentSummary || 'Ödeme Özeti'}
                </h4>
                <div className="space-y-2.5 text-sm">
                  <div className={`flex justify-between ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    <span>{t.subtotalLabel || 'ARA TOPLAM'}:</span>
                    <span className="font-medium font-mono">{formatSummaryMoney(subtotal)}</span>
                  </div>

                  {selectedCampaign && campaignDiscount > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>{selectedCampaign.name} {t.discount || 'İndirimi'}:</span>
                      <span className="font-medium font-mono">-{formatSummaryMoney(campaignDiscount)}</span>
                    </div>
                  )}

                  {itemDiscount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>{t.itemDiscount || 'Ürün İndirimi'}:</span>
                      <span className="font-medium font-mono">-{formatSummaryMoney(itemDiscount)}</span>
                    </div>
                  )}

                  {calculatedDiscount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>{t.additionalDiscount || 'İlave İndirim'}:</span>
                      <span className="font-medium font-mono">-{formatSummaryMoney(calculatedDiscount)}</span>
                    </div>
                  )}

                  <div className={`border-t-2 my-2 ${darkMode ? 'border-gray-600' : 'border-gray-400'}`}></div>

                  <div className="flex justify-between text-xl pt-1">
                    <span className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                      {t.total || 'TOPLAM'}:
                    </span>
                    <span className={`font-bold font-mono px-3 py-1 rounded ${darkMode ? 'text-blue-400 bg-blue-900/30' : 'text-blue-700 bg-blue-50'
                      }`}>
                      {formatCurrency(finalTotal)}
                    </span>
                  </div>

                  {totalPaid > 0 && (
                    <>
                      <div className="flex justify-between text-green-600">
                        <span>{t.totalPaid || 'Ödenen'}:</span>
                        <span className="font-medium font-mono">{formatCurrency(totalPaid)}</span>
                      </div>

                      {remaining > 0 ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-red-600 font-medium">
                            <span>{t.remainingAmount || 'Kalan'}:</span>
                            <span className="font-mono">{formatCurrency(remaining)}</span>
                          </div>
                          {hasCariRemainder && !selectedCustomer ? (
                            <p className={`text-xs ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                              {selectCustomerForCariMessage}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className={`p-3 rounded-lg mt-2 ${darkMode ? 'bg-green-900/30 border-2 border-green-600' : 'bg-green-50 border-2 border-green-400'
                          }`}>
                          <div className="flex justify-between items-center">
                            <span className="text-green-700 dark:text-green-400 font-semibold">
                              {t.changeAmount || 'Para Üstü'}:
                            </span>
                            <span className="text-2xl font-bold font-mono text-green-700 dark:text-green-300">
                              {formatCurrency(change)}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {canPostRemainderToCari && (
                    <div className="mt-3 pt-3 border-t-2 border-orange-200">
                      <button
                        type="button"
                        data-testid="pos-write-remaining-to-cari"
                        onClick={handleWriteRemainingToCari}
                        title={
                          selectedCustomer
                            ? `${writeRemainingToCariLabel} — ${formatCurrency(remaining)}`
                            : selectCustomerForCariMessage
                        }
                        className={`w-full py-3 px-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 border-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                          darkMode
                            ? 'bg-orange-900/40 hover:bg-orange-900/60 text-orange-300 border-orange-700'
                            : 'bg-orange-50 hover:bg-orange-100 text-orange-800 border-orange-300'
                        }`}
                      >
                        <Wallet className="w-4 h-4" aria-hidden />
                        {remaining > 0
                          ? `${writeRemainingToCariLabel} (${formatCurrency(remaining)})`
                          : writeRemainingToCariLabel}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Added Payments List */}
              {payments.length > 0 && (
                <div className={`border p-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}`}>
                  <h4 className={`text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t.addedPayments || 'Eklenen Ödemeler'}:</h4>
                  <div className="space-y-2">
                    {payments.map((payment, index) => (
                      <div key={index} className={`flex items-center justify-between p-2 border rounded ${darkMode ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-gray-50'
                        }`}>
                        <div className="flex items-center gap-2">
                          {payment.method === 'cash' ? (
                            <Banknote className="w-4 h-4 text-green-600" />
                          ) : payment.method === 'card' ? (
                            <CreditCard className="w-4 h-4 text-blue-600" />
                          ) : payment.method === 'pesinatli' ? (
                            <Calendar className="w-4 h-4 text-purple-600" />
                          ) : (
                            <Wallet className="w-4 h-4 text-orange-600" />
                          )}
                          <span className="text-sm font-medium font-mono">
                            {payment.currency === baseCurrency
                              ? formatCurrency(payment.amount)
                              : formatMoneyWithCode(payment.amount, payment.currency)}
                          </span>
                          {payment.method === 'pesinatli' && payment.installments ? (
                            <span
                              data-testid="pesinat-payment-badge"
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                darkMode ? 'bg-purple-900/40 text-purple-200' : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {(tm('paymentMethodPesinatli') || t.pesinatliLabel || 'Peşinatlı')}
                              {` · ${payment.installments} `}
                              {(tm('installmentShort') || 'ay')}
                            </span>
                          ) : payment.method === 'veresiye' ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-orange-900/40 text-orange-300' : 'bg-orange-100 text-orange-800'}`}>
                              {payment.installments
                                ? `${t.veresiyeLabel || 'Veresiye (Cari)'} · ${payment.installments} ${tm('installmentShort') || 'ay'}`
                                : (t.veresiyeLabel || 'Veresiye (Cari)')}
                            </span>
                          ) : payment.cash_register_name ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
                              {payment.cash_register_name}
                            </span>
                          ) : null}
                        </div>
                        <button
                          onClick={() => handleRemovePayment(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Müşteri Borcu (tahsilat) — müşteri seçildiğinde aktif */}
              {selectedCustomer && (
                <div
                  data-testid="pos-customer-debt-section"
                  className={`border-2 rounded-xl p-3 ${
                    darkMode
                      ? 'bg-purple-900/20 border-purple-700/60'
                      : 'bg-purple-50 border-purple-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4
                      className={`text-sm font-semibold flex items-center gap-2 ${
                        darkMode ? 'text-purple-300' : 'text-purple-900'
                      }`}
                    >
                      <Receipt className="w-4 h-4" />
                      {tm('customerDebt') || 'Müşteri Borcu'} ({selectedCustomer.name})
                    </h4>
                    <div className="flex flex-col items-end gap-0.5">
                      {/* Cari bakiye (customers.balance) — negatif = borçlu */}
                      <span
                        data-testid="pos-customer-balance"
                        className={`text-sm font-bold font-mono ${
                          customerBalance < 0
                            ? darkMode
                              ? 'text-red-300'
                              : 'text-red-700'
                            : darkMode
                              ? 'text-gray-400'
                              : 'text-gray-500'
                        }`}
                        title={tm('customerDebt') || 'Cari bakiye (customers.balance)'}
                      >
                        {customerBalance < 0
                          ? `${tm('customerDebt') || 'Borç'}: ${formatSummaryMoney(Math.abs(customerBalance))} ${baseCurrency}`
                          : customerBalance > 0
                            ? `${tm('customerCredit') || 'Alacak'}: ${formatSummaryMoney(customerBalance)} ${baseCurrency}`
                            : `${formatSummaryMoney(0)} ${baseCurrency}`}
                      </span>
                      {/* Bekleyen fatura toplamı — fatura listesi senkronu */}
                      {customerInvoices.length > 0 && (
                        <span
                          className={`text-[10px] font-mono ${
                            darkMode ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          ({customerInvoices.length} {tm('invoiceCount') || 'fatura'} ·{' '}
                          {formatSummaryMoney(customerDebtTotal)} {baseCurrency})
                        </span>
                      )}
                    </div>
                  </div>

                  {customerInvoicesLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {tm('loading') || 'Yükleniyor...'}
                    </div>
                  ) : customerInvoices.length === 0 ? (
                    <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {tm('customerDebtEmpty') || 'Bekleyen borç yok.'}
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {customerInvoices.map((inv) => {
                        const checked = selectedInvoiceIds.has(inv.id);
                        return (
                          <label
                            key={inv.id}
                            className={`flex items-center justify-between gap-2 text-xs cursor-pointer rounded px-1 py-1 ${
                              darkMode
                                ? checked
                                  ? 'bg-purple-900/40'
                                  : 'hover:bg-purple-900/30'
                                : checked
                                  ? 'bg-purple-100'
                                  : 'hover:bg-purple-50'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setSelectedInvoiceIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(inv.id)) next.delete(inv.id);
                                    else next.add(inv.id);
                                    return next;
                                  })
                                }
                                className="rounded text-purple-600 focus:ring-purple-500"
                                aria-label={`Fatura ${inv.invoice_no} seç`}
                              />
                              <FileText className="w-3 h-3 opacity-70 shrink-0" />
                              <span className="font-mono truncate">
                                {inv.invoice_no} · {inv.invoice_date.slice(0, 10)}
                              </span>
                            </span>
                            <span
                              className={`font-semibold font-mono shrink-0 ${
                                darkMode ? 'text-red-300' : 'text-red-600'
                              }`}
                            >
                              {formatSummaryMoney(inv.remaining)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {selectedInvoiceIds.size > 0 && selectedCashRegisterId && (
                    <button
                      type="button"
                      data-testid="pos-collect-customer-debt"
                      onClick={handleCollectCustomerDebt}
                      disabled={collectingDebt}
                      className={`w-full mt-2 py-2 px-3 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60 bg-purple-600 hover:bg-purple-700 text-white`}
                    >
                      {collectingDebt ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                      {collectingDebt
                        ? (tm('processingText') || 'İŞLENİYOR...')
                        : `${tm('collectSelectedDebts') || 'Seçili Borçları Öde'} (${formatSummaryMoney(selectedDebtTotal)})`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Middle - Payment Input */}
            <div className="space-y-3">
              {/* Payment Method Selection */}
              <div>
                <h4 className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t.paymentMethodLabel || 'Ödeme Yöntemi:'}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map(method => (
                    <button
                      key={method.id}
                      onClick={() => !method.disabled && setCurrentMethod(method.id as any)}
                      className={`p-3 border transition-all flex items-center gap-2 ${currentMethod === method.id
                        ? darkMode
                          ? 'border-blue-500 bg-blue-900/30 shadow-md'
                          : 'border-blue-600 bg-blue-50 shadow-md'
                        : darkMode
                          ? 'border-gray-600 bg-gray-800'
                          : 'border-gray-300 bg-white hover:border-blue-500 hover:bg-blue-50'
                        } ${method.disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                      disabled={method.disabled}
                    >
                      <div className={`w-8 h-8 flex items-center justify-center ${currentMethod === method.id ? 'bg-blue-600' : darkMode ? 'bg-gray-700' : 'bg-gray-200'
                        }`}>
                        <method.icon className={`w-4 h-4 ${currentMethod === method.id ? 'text-white' : darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                      </div>
                      <span className={`text-sm ${currentMethod === method.id ? 'text-blue-700 font-medium' : darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                        {method.name}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Peşinatlı Satış: bilgilendirme + serbest tutar (Seçenek A) */}
                {currentMethod === 'pesinatli' && (
                  <div
                    data-testid="pesinat-installment-picker"
                    className={`mt-3 p-3 border-2 rounded-xl ${
                      darkMode
                        ? 'bg-purple-900/20 border-purple-700/60'
                        : 'bg-purple-50 border-purple-200'
                    }`}
                  >
                    <h5
                      className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${
                        darkMode ? 'text-purple-200' : 'text-purple-900'
                      }`}
                    >
                      <Calendar className="w-4 h-4" />
                      {tm('paymentMethodPesinatli') || t.pesinatliLabel || 'Peşinatlı Satış'}
                    </h5>
                    <p
                      className={`text-xs mb-2 ${
                        darkMode ? 'text-purple-200' : 'text-purple-700'
                      }`}
                    >
                      {tm('pesinatSubtitle') ||
                        t.pesinatSubtitle ||
                        'Bugün ödenecek tutarı serbest girin; kalan sonraki gelişinizde tahsil edilir.'}
                    </p>
                    <div
                      data-testid="pesinat-installment-summary"
                      className={`text-xs ${
                        darkMode ? 'text-purple-300' : 'text-purple-700'
                      }`}
                    >
                      {tm('posRemainingTotal') || 'Sepet toplamı'}:{' '}
                      <span className="font-bold font-mono">
                        {formatMoneyWithCode(remaining, baseCurrency)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Amount Input */}
              <div>
                <h4 className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t.amountLabel || 'Miktar'}:
                </h4>
                <div className="relative">
                  <input
                    type="text"
                    value={currentAmount}
                    onChange={(e) => setCurrentAmount(formatNumberInput(e.target.value))}
                    placeholder="0"
                    className={`w-full px-4 py-2 text-lg text-center border-2 font-mono ${darkMode
                      ? 'bg-gray-800 border-gray-600 text-white'
                      : 'bg-white border-gray-300'
                      }`}
                  />
                  {currentAmount && (
                    <button
                      onClick={() => setCurrentAmount('')}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full transition-colors ${darkMode
                        ? 'bg-red-900/40 hover:bg-red-900/60 text-red-400'
                        : 'bg-red-100 hover:bg-red-200 text-red-600'
                        }`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Quick amounts */}
              <div className="grid grid-cols-3 gap-2">
                {[1000, 5000, 10000, 20000, 50000, 100000].map(amount => (
                  <button
                    key={amount}
                    onClick={() => {
                      const current = parseFormattedNumber(currentAmount);
                      setCurrentAmount(formatNumberInput((current + amount).toString()));
                    }}
                    className={`py-2 text-sm transition-colors ${darkMode
                      ? 'bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 border border-blue-700'
                      : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
                      }`}
                  >
                    +{formatNumberTR(amount, 2, true)}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    const rate = exchangeRates[currentCurrency] ?? 1;
                    const remainingInSelectedCurrency = currentCurrency === baseCurrency
                      ? Math.max(0, remaining)
                      : Math.max(0, remaining) / rate;
                    const amountToAdd = Number(
                      roundPosMoneyAmount(
                        remainingInSelectedCurrency,
                        currentCurrency
                      )
                    );
                    if (!Number.isFinite(amountToAdd) || amountToAdd <= 0) return;

                    // Peşinatlı: serbest tutar modu. "Tam Tutar" / default
                    // öneri olarak `suggestPesinatliPayNow` kullanılır — input
                    // boşsa kalan sepetle dolar, kullanıcı küçültebilir.
                    if (currentMethod === 'pesinatli') {
                      const suggested = suggestPesinatliPayNow(remaining);
                      const amount = suggested > 0 ? suggested : amountToAdd;
                      setCurrentAmount(formatNumberInput(amount.toString()));
                      return;
                    }

                    setCurrentAmount(formatNumberInput(amountToAdd.toString()));
                    const newPayment: Payment = {
                      method: currentMethod,
                      amount: amountToAdd,
                      currency: currentCurrency,
                      ...cashRegisterFieldsForMethod(currentMethod),
                    };
                    setPayments((prev) => [...prev, newPayment]);
                    setCurrentAmount('');
                  }}
                  className={`py-3 text-sm font-medium transition-colors ${darkMode
                    ? 'bg-orange-900/30 hover:bg-orange-900/50 text-orange-400 border border-orange-700'
                    : 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200'
                    }`}
                >
                  {currentMethod === 'pesinatli'
                    ? (tm('pesinatAddButton') || t.pesinatAddButton || 'Peşinat Ekle')
                    : (t.fullAmount || 'Tam Tutar')}
                </button>

                <button
                  onClick={handleAddPayment}
                  disabled={!currentAmount || parseFormattedNumber(currentAmount) <= 0}
                  className={`py-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${darkMode
                    ? 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-400 border border-purple-700'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                    }`}
                >
                  <Plus className="w-4 h-4" />
                  {t.addPaymentLabel || 'Ödeme Ekle'}
                </button>
              </div>
            </div>

            {/* Right - Numpad (conditional) */}
            {showNumpad && (
              <div>
                <h4 className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t.numpad || 'Numpad'}:
                </h4>
                <div className="grid grid-cols-4 gap-0.5">
                  {/* Row 1: 00, 000, Clear icon, × */}
                  <button
                    onClick={() => handleNumpadClick('00')}
                    className={`p-4 text-lg font-medium transition-colors ${darkMode
                      ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
                      }`}
                  >
                    00
                  </button>

                  <button
                    onClick={() => handleNumpadClick('000')}
                    className={`p-4 text-lg font-medium transition-colors ${darkMode
                      ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
                      }`}
                  >
                    000
                  </button>

                  <button
                    onClick={() => handleNumpadClick('clear')}
                    className={`p-4 font-medium transition-colors ${darkMode
                      ? 'bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 active:bg-blue-900/80'
                      : 'bg-blue-200 hover:bg-blue-300 text-blue-700 active:bg-blue-400'
                      }`}
                  >
                    ⫿
                  </button>

                  <button
                    onClick={() => handleNumpadClick('backspace')}
                    className={`p-4 font-medium transition-colors ${darkMode
                      ? 'bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 active:bg-blue-900/80'
                      : 'bg-blue-200 hover:bg-blue-300 text-blue-700 active:bg-blue-400'
                      }`}
                  >
                    ×
                  </button>

                  {/* Row 2: 7, 8, 9, C */}
                  {[7, 8, 9].map(num => (
                    <button
                      key={num}
                      onClick={() => handleNumpadClick(num.toString())}
                      className={`p-4 text-lg font-medium transition-colors ${darkMode
                        ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
                        }`}
                    >
                      {num}
                    </button>
                  ))}

                  <button
                    onClick={() => handleNumpadClick('clear')}
                    className={`p-4 font-medium transition-colors ${darkMode
                      ? 'bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 active:bg-blue-900/80'
                      : 'bg-blue-200 hover:bg-blue-300 text-blue-700 active:bg-blue-400'
                      }`}
                  >
                    C
                  </button>

                  {/* Row 3: 4, 5, 6, Fiyat */}
                  {[4, 5, 6].map(num => (
                    <button
                      key={num}
                      onClick={() => handleNumpadClick(num.toString())}
                      className={`p-4 text-lg font-medium transition-colors ${darkMode
                        ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
                        }`}
                    >
                      {num}
                    </button>
                  ))}

                  <button
                    onClick={() => setCurrentAmount(Math.floor(finalTotal).toString())}
                    className={`p-4 text-xs font-medium transition-colors ${darkMode
                      ? 'bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 active:bg-blue-900/80'
                      : 'bg-blue-200 hover:bg-blue-300 text-blue-700 active:bg-blue-400'
                      }`}
                  >
                    {t.priceLabel || 'Fiyat'}
                  </button>

                  {/* Row 4-5: 1, 2, 3, TAMAM (row-span-2) */}
                  {[1, 2, 3].map(num => (
                    <button
                      key={num}
                      onClick={() => handleNumpadClick(num.toString())}
                      className={`p-4 text-lg font-medium transition-colors ${darkMode
                        ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
                        }`}
                    >
                      {num}
                    </button>
                  ))}

                  <button
                    onClick={handleAddPayment}
                    disabled={!currentAmount || parseFormattedNumber(currentAmount) <= 0}
                    className={`row-span-2 p-4 text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${darkMode
                      ? 'bg-blue-600 hover:bg-blue-700 text-white active:bg-blue-800'
                      : 'bg-blue-600 hover:bg-blue-700 text-white active:bg-blue-800'
                      }`}
                  >
                    {t.okLabel || 'Tamam'}
                  </button>

                  {/* Row 5: 0 (col-span-2), comma */}
                  <button
                    onClick={() => handleNumpadClick('0')}
                    className={`col-span-2 p-4 text-lg font-medium transition-colors ${darkMode
                      ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
                      }`}
                  >
                    0
                  </button>

                  <button
                    onClick={() => handleNumpadClick('.')}
                    disabled={currentAmount.includes('.')}
                    className={`p-4 text-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${darkMode
                      ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
                      }`}
                  >
                    .
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fiş dili + (isteğe) otomatik yazdır — Market POS’ta sadece bilgi metni */}
        <div className={`px-4 py-3 border-t flex flex-wrap items-center justify-between gap-4 ${darkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="flex flex-wrap items-center gap-4 min-w-0">
            {showAutoPrintOption ? (
              <label className="flex items-center gap-2 cursor-pointer group shrink-0">
                <input
                  type="checkbox"
                  checked={autoPrint}
                  onChange={(e) => setAutoPrint(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all"
                />
                <span className={`text-sm font-medium transition-colors ${darkMode ? 'text-gray-300 group-hover:text-white' : 'text-gray-700 group-hover:text-blue-600'}`}>
                  {t.autoPrintReceipt || 'Otomatik Yazdır'}
                </span>
              </label>
            ) : (
              <>
                <label className="flex items-center gap-2 cursor-pointer group shrink-0">
                  <input
                    type="checkbox"
                    checked={showReceiptPreview}
                    onChange={(e) => setShowReceiptPreview(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all"
                  />
                  <span className={`text-sm font-medium transition-colors ${darkMode ? 'text-gray-300 group-hover:text-white' : 'text-gray-700 group-hover:text-blue-600'}`}>
                    {t.showReceiptPreviewLabel}
                  </span>
                </label>
              </>
            )}

            <div className={`h-6 w-px shrink-0 ${darkMode ? 'bg-gray-700' : 'bg-gray-300'}`} />

            <div className="flex items-center gap-2 shrink-0">
              <Globe className={`w-4 h-4 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
              <select
                value={receiptLanguage}
                onChange={(e) => setReceiptLanguage(e.target.value as any)}
                className={`text-sm bg-transparent border-none focus:ring-0 cursor-pointer font-medium p-0 ${darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-blue-600'}`}
              >
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
                <option value="ku">Kurdî</option>
                <option value="uz">Oʻzbekcha</option>
              </select>
            </div>

            <div className={`h-6 w-px shrink-0 ${darkMode ? 'bg-gray-700' : 'bg-gray-300'}`} />

            <div className="flex items-center gap-2 shrink-0">
              <Printer className={`w-4 h-4 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
              <select
                value={printFormat}
                onChange={(e) => void handlePrintFormatChange(e.target.value as PosReceiptPrintFormat)}
                className={`text-sm bg-transparent border-none focus:ring-0 cursor-pointer font-medium p-0 ${darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-blue-600'}`}
              >
                <option value="80mm">80mm</option>
                <option value="A5">A5</option>
                <option value="A4">A4</option>
              </select>
            </div>
          </div>

          {/* Kasa seçimi — eski POS ID yerinde */}
          <button
            type="button"
            aria-label={tm('cashRegisterLabel') || 'Kasa Seçimi'}
            disabled={cashRegistersLoading || cashRegisters.length === 0}
            onClick={() => setShowCashRegisterModal(true)}
            className={`max-w-[min(100%,22rem)] text-left flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0 border transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
              darkMode
                ? 'bg-emerald-900/30 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/50'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
            }`}
            title={
              selectedCashRegister
                ? `${selectedCashRegister.kasa_adi} (${selectedCashRegister.kasa_kodu}) — ${selectedCashRegister.id_doviz_kodu} · ${selectedCashRegister.bakiye.toLocaleString('tr-TR')}`
                : (tm('selectCashRegister') || 'Kasa seçin')
            }
          >
            <Wallet className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <span className="text-[10px] font-medium truncate min-w-0">
              {cashRegistersLoading
                ? (tm('loading') || 'Yükleniyor...')
                : selectedCashRegister
                  ? `${selectedCashRegister.kasa_adi} (${selectedCashRegister.kasa_kodu}) — ${selectedCashRegister.id_doviz_kodu} · ${selectedCashRegister.bakiye.toLocaleString('tr-TR')}`
                  : (tm('selectCashRegister') || 'Kasa seçin')}
            </span>
            <ChevronDown className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
          </button>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex flex-col sm:flex-row gap-2 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
          <button
            type="button"
            onClick={handleRequestClose}
            title={
              allowPaymentBackToSale
                ? undefined
                : tm('posPaymentBackBlocked') ||
                  'Bu işlem parametre ile kapatıldı. Ödeme ekranından satışa geri dönüşe izin verilmiyor.'
            }
            className={`flex-1 px-4 py-3 rounded transition-colors ${
              !allowPaymentBackToSale
                ? darkMode
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-60'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                : darkMode
                  ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {t.cancel || 'İptal'}
          </button>
          {onPrintDraftReceipt && (
            <button
              type="button"
              onClick={() => void handlePrintDraftReceipt()}
              disabled={draftPrintLoading}
              aria-busy={draftPrintLoading}
              className={`flex-1 px-4 py-3 rounded font-medium flex items-center justify-center gap-2 border-2 transition-colors min-h-[3rem] ${draftPrintLoading
                ? darkMode
                  ? 'border-blue-400 bg-blue-950/40 text-blue-100'
                  : 'border-blue-500 bg-blue-50 text-blue-800'
                : darkMode
                  ? 'border-blue-500 text-blue-200 hover:bg-blue-950/50'
                  : 'border-blue-600 text-blue-700 hover:bg-blue-50'
                } disabled:cursor-wait`}
            >
              {draftPrintLoading ? (
                <>
                  <Loader2 className="w-5 h-5 shrink-0 animate-spin text-current" aria-hidden />
                  <span className="font-semibold">{t.printingReceiptStatus}</span>
                </>
              ) : (
                <>
                  <Printer className="w-5 h-5 shrink-0" aria-hidden />
                  <span>{t.printReceiptLabel}</span>
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirmPayment}
            disabled={isLoading || draftPrintLoading || (hasCariRemainder && !selectedCustomer)}
            title={hasCariRemainder && !selectedCustomer ? selectCustomerForCariMessage : undefined}
            className={`flex-1 px-4 py-3 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2 sm:min-w-[11rem]`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{t.processingText || 'İŞLENİYOR...'}</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>{t.completePayment || 'Ödemeyi Tamamla'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {showCashRegisterModal && (
        <PercentBodyModal
          nested
          size="list"
          ariaLabel={tm('cashRegisterLabel') || 'Kasa Seçimi'}
          onClose={() => setShowCashRegisterModal(false)}
        >
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 text-white shrink-0 flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              {tm('cashRegisterLabel') || 'Kasa Seçimi'}
            </h3>
            <button
              type="button"
              onClick={() => setShowCashRegisterModal(false)}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors"
              aria-label={t.cancel || 'Kapat'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <PercentBodyModalScrollBody className="p-4">
            <div className="space-y-2">
              {cashRegisters.map((k) => {
                const selected = k.id === selectedCashRegisterId;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => {
                      setSelectedCashRegisterId(k.id);
                      setShowCashRegisterModal(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                      selected
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white hover:border-emerald-300 text-slate-800'
                    }`}
                  >
                    <div className="font-bold text-sm">
                      {k.kasa_adi} ({k.kasa_kodu})
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {k.id_doviz_kodu} · {tm('balance') || 'Bakiye'}: {k.bakiye.toLocaleString('tr-TR')}
                    </div>
                  </button>
                );
              })}
              {cashRegisters.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">
                  {tm('noCashRegisters') || 'Aktif kasa bulunamadı'}
                </p>
              )}
            </div>
          </PercentBodyModalScrollBody>
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
            <button
              type="button"
              onClick={() => setShowCashRegisterModal(false)}
              className="w-full py-3 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100"
            >
              {t.cancel || 'İptal'}
            </button>
          </div>
        </PercentBodyModal>
      )}

      {showCancelReasonModal && (
        <POSCancelReasonModal
          onClose={() => setShowCancelReasonModal(false)}
          onConfirm={handleCancelConfirm}
        />
      )}
    </ModalLayer>
  );
}
