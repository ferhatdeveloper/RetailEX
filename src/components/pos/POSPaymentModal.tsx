import { X, CreditCard, DollarSign, Wallet, Plus, Trash2, CheckCircle, Calculator, Smartphone, ShoppingCart, QrCode, Banknote, Minus, Globe, Tag, TrendingDown, Loader2, Check, Percent, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { CartItem } from './types';
import type { Campaign, Customer } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { paymentGateway, type PaymentProvider } from '../../services/paymentGateway';
import { formatCurrency, formatNumber } from '../../utils/currency';
import { formatNumber as formatNumberTR } from '../../utils/formatNumber';

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
  method: 'cash' | 'card' | 'gateway' | 'veresiye';
  amount: number;
  currency: 'IQD' | 'USD' | 'EUR';
  gatewayProvider?: string;
  transactionId?: string;
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
};

type Payment = POSPaymentModalPaymentRow;

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
  /** Restoran: ödeme modalından hesabı kapatmadan yazdır (Promise ile yükleme göstergesi) */
  onPrintDraftReceipt?: (ctx: POSPaymentModalDraftContext) => void | Promise<void>;
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
  onPrintDraftReceipt,
  onClose,
  onComplete
}: POSPaymentModalProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [currentMethod, setCurrentMethod] = useState<'cash' | 'card' | 'gateway' | 'veresiye'>('cash');
  const [currentAmount, setCurrentAmount] = useState('');
  const [currentCurrency, setCurrentCurrency] = useState<'IQD' | 'USD' | 'EUR'>('IQD');
  const [discountType, setDiscountType] = useState<'percentage' | 'amount'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [showNumpad, setShowNumpad] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState<string>('');
  const [activeProviders, setActiveProviders] = useState<PaymentProvider[]>([]);
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrGatewayName, setQrGatewayName] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // Receipt Settings (restoran: Tauri sessiz yazdır; Market POS’ta kapalı)
  const [autoPrint, setAutoPrint] = useState(false);
  const [receiptLanguage, setReceiptLanguage] = useState<string>(useLanguage().language);

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
  const [isLoading, setIsLoading] = useState(false);
  const [draftPrintLoading, setDraftPrintLoading] = useState(false);

  const { t } = useLanguage();
  const { darkMode } = useTheme();

  // Load active payment providers
  useEffect(() => {
    const providers = paymentGateway.getActiveProviders();
    setActiveProviders(providers);
    if (providers.length > 0) {
      setSelectedGateway(providers[0].id);
    }
  }, []);

  // Currency exchange rates (base: IQD)
  const exchangeRates: Record<string, number> = {
    IQD: 1,
    USD: 1310,
    EUR: 1450,
  };

  // Calculate additional discount
  let calculatedDiscount = 0;
  if (discountValue) {
    if (discountType === 'percentage') {
      calculatedDiscount = (total * parseFloat(discountValue)) / 100;
    } else {
      calculatedDiscount = parseFloat(discountValue);
    }
  }

  const finalTotal = total - calculatedDiscount;

  // Calculate total paid (convert all to IQD)
  const totalPaid = payments.reduce((sum, payment) => {
    const amountInIQD = payment.amount * (exchangeRates[payment.currency] ?? 1);
    return sum + amountInIQD;
  }, 0);

  const remaining = finalTotal - totalPaid;
  const change = totalPaid > finalTotal ? totalPaid - finalTotal : 0;

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

    const newPayment: Payment = {
      method: currentMethod,
      amount: amount,
      currency: currentCurrency,
      ...(currentMethod === 'gateway' && { gatewayProvider: selectedGateway })
    };

    // If gateway payment, show QR code
    if (currentMethod === 'gateway' && selectedGateway) {
      const result = await paymentGateway.initiatePayment(
        selectedGateway,
        {
          amount: amount,
          currency: currentCurrency,
          orderId: `ORDER-${Date.now()}`,
          description: 'POS Satış Ödemesi'
        }
      );

      if (result.success) {
        newPayment.transactionId = result.transactionId;
        setShowQRCode(true);
        setQrGatewayName(result.providerName || '');
        // Auto close QR after 3 seconds for demo
        setTimeout(() => setShowQRCode(false), 3000);
      } else {
        alert(`Ödeme başlatılamadı: ${result.error}`);
        return;
      }
    }

    setPayments([...payments, newPayment]);
    setCurrentAmount('');
  };

  const handleRemovePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const handlePrintDraftReceipt = async () => {
    if (!onPrintDraftReceipt || draftPrintLoading) return;
    const ctx: POSPaymentModalDraftContext = {
      payments: payments.map(p => ({ ...p })),
      totalPaid,
      change,
      remaining,
      finalTotal,
      discount: calculatedDiscount,
      receiptLanguage,
    };
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
    if (remaining > 0.01) {
      alert(t.insufficientPayment || 'Ödeme tutarı yetersiz!');
      return;
    }

    setIsLoading(true);
    try {
      await onComplete({
        payments: payments,
        totalPaid: totalPaid,
        change: change,
        discount: calculatedDiscount,
        finalTotal: finalTotal,
        autoPrint: showAutoPrintOption ? autoPrint : false,
        language: receiptLanguage
      });
    } catch (error) {
      console.error('Payment confirmation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const currencies = [
    { code: 'IQD' as const, symbol: 'IQD', label: 'دیار عێراقی', flag: '🇮🇶' },
    { code: 'USD' as const, symbol: '$', label: 'US Dollar', flag: '🇺🇸' }
  ];

  const paymentMethods = [
    { id: 'cash', name: t.cashLabel || 'Nakit', icon: Wallet },
    { id: 'card', name: t.cardLabel || 'Kart (POS)', icon: CreditCard },
    { id: 'veresiye', name: t.veresiyeLabel || 'Veresiye (Cari)', icon: Wallet, disabled: !selectedCustomer },
    { id: 'gateway', name: t.gatewayLabel || 'QR Ödeme Sağlayıcı', icon: QrCode }
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
            {activeProviders.map(provider => (
              <button
                key={provider.id}
                onClick={async () => {
                  const amount = finalTotal;
                  const result = await paymentGateway.initiatePayment(
                    provider.id,
                    {
                      amount: amount,
                      currency: 'IQD',
                      orderId: `ORDER-${Date.now()}`,
                      description: 'POS Satış Ödemesi'
                    }
                  );
                  if (result.success) {
                    setQrGatewayName(result.providerName || provider.name);
                    setCurrentAmount(amount.toString());
                    setShowQRCode(true);
                  } else {
                    alert(`${provider.name} ${t.paymentFailed || 'ödemesi başlatılamadı:'} ${result.error}`);
                  }
                }}
                className="px-3 py-1.5 rounded text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors font-medium"
              >
                {provider.name}
              </button>
            ))}
            <button onClick={onClose} className="text-white hover:text-gray-200 p-1">
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
                    <DollarSign className="w-3.5 h-3.5 inline mr-1" />
                    IQD
                  </button>
                </div>

                <input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percentage' ? t.discountPercentage || 'İndirim %' : t.discountAmount || 'İndirim Tutarı'}
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
                  <div className="grid grid-cols-3 gap-2">
                    {[1000, 5000, 10000].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setDiscountValue(amount.toString())}
                        className={`px-2 py-1.5 text-xs border transition-colors ${darkMode
                          ? 'bg-gray-700 border-gray-600 text-blue-400 hover:bg-gray-600'
                          : 'bg-white border-blue-300 text-blue-700 hover:bg-blue-100'
                          }`}
                      >
                        {formatNumberTR(amount, 2, true)}
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
                    <span className="font-medium font-mono">{formatNumber(subtotal)}</span>
                  </div>

                  {selectedCampaign && campaignDiscount > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>{selectedCampaign.name} {t.discount || 'İndirimi'}:</span>
                      <span className="font-medium font-mono">-{formatNumber(campaignDiscount)}</span>
                    </div>
                  )}

                  {itemDiscount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>{t.itemDiscount || 'Ürün İndirimi'}:</span>
                      <span className="font-medium font-mono">-{formatNumber(itemDiscount)}</span>
                    </div>
                  )}

                  {calculatedDiscount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>{t.additionalDiscount || 'İlave İndirim'}:</span>
                      <span className="font-medium font-mono">-{formatNumber(calculatedDiscount)}</span>
                    </div>
                  )}

                  <div className={`border-t-2 my-2 ${darkMode ? 'border-gray-600' : 'border-gray-400'}`}></div>

                  <div className="flex justify-between text-xl pt-1">
                    <span className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                      {t.total || 'TOPLAM'}:
                    </span>
                    <span className={`font-bold font-mono px-3 py-1 rounded ${darkMode ? 'text-blue-400 bg-blue-900/30' : 'text-blue-700 bg-blue-50'
                      }`}>
                      {formatNumber(finalTotal)} IQD
                    </span>
                  </div>

                  {totalPaid > 0 && (
                    <>
                      <div className="flex justify-between text-green-600">
                        <span>{t.totalPaid || 'Ödenen'}:</span>
                        <span className="font-medium font-mono">{formatNumber(totalPaid)} IQD</span>
                      </div>

                      {remaining > 0 ? (
                        <div className="flex justify-between text-red-600 font-medium">
                          <span>{t.remainingAmount || 'Kalan'}:</span>
                          <span className="font-mono">{formatNumber(remaining)} IQD</span>
                        </div>
                      ) : (
                        <div className={`p-3 rounded-lg mt-2 ${darkMode ? 'bg-green-900/30 border-2 border-green-600' : 'bg-green-50 border-2 border-green-400'
                          }`}>
                          <div className="flex justify-between items-center">
                            <span className="text-green-700 dark:text-green-400 font-semibold">
                              {t.changeAmount || 'Para Üstü'}:
                            </span>
                            <span className="text-2xl font-bold font-mono text-green-700 dark:text-green-300">
                              {formatNumber(change)} IQD
                            </span>
                          </div>
                        </div>
                      )}
                    </>
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
                          ) : payment.method === 'veresiye' ? (
                            <Wallet className="w-4 h-4 text-orange-600" />
                          ) : (
                            <Smartphone className="w-4 h-4 text-purple-600" />
                          )}
                          <span className="text-sm">
                            {payment.amount} {payment.currency}
                          </span>
                          <span className="text-xs text-gray-500">
                            (≈ {formatNumber(payment.amount * exchangeRates[payment.currency])} IQD)
                          </span>
                          {payment.gatewayProvider && (
                            <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                              {payment.gatewayProvider.toUpperCase()}
                            </span>
                          )}
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
              </div>

              {/* Currency Selector */}
              <div>
                <h4 className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t.currencyAndRates || 'Para Birimi & Kurlar'}:
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {currencies.map(curr => (
                    <button
                      key={curr.code}
                      onClick={() => setCurrentCurrency(curr.code)}
                      className={`p-2 border text-sm transition-colors ${currentCurrency === curr.code
                        ? darkMode
                          ? 'bg-blue-900/30 text-blue-400 border-blue-700'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                        : darkMode
                          ? 'bg-gray-800 border-gray-600 text-gray-300 hover:border-blue-500'
                          : 'bg-white border-gray-300 hover:border-blue-300'
                        }`}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-1">
                          <span>{curr.flag}</span>
                          <span className="font-medium">{curr.code}</span>
                        </div>
                        {curr.code !== 'IQD' && (
                          <span className="text-xs text-gray-500">
                            1 = {exchangeRates[curr.code]} IQD
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
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
                  onClick={() => {
                    setCurrentAmount(remaining > 0 ? remaining.toString() : finalTotal.toString());
                    setTimeout(() => handleAddPayment(), 100);
                  }}
                  className={`py-3 text-sm font-medium transition-colors ${darkMode
                    ? 'bg-orange-900/30 hover:bg-orange-900/50 text-orange-400 border border-orange-700'
                    : 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200'
                    }`}
                >
                  {t.fullAmount || 'Tam Tutar'}
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
                    disabled={!currentAmount || parseFloat(currentAmount) <= 0}
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
            ) : onPrintDraftReceipt ? null : (
              <div
                className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 max-w-2xl ${darkMode ? 'border-blue-500/40 bg-blue-950/40' : 'border-blue-200 bg-blue-50/80'
                  }`}
              >
                <Printer className={`w-5 h-5 shrink-0 mt-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className={`text-sm font-bold ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}>
                    {t.printReceiptLabel}: {t.printReceiptLocationShort}
                  </p>
                  <p className={`text-xs leading-snug ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {t.posReceiptDeferredPrintHint}
                  </p>
                </div>
              </div>
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
              </select>
            </div>
          </div>

          <div className={`text-[10px] px-2 py-1 rounded-full shrink-0 ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
            POS ID: {receiptNumber.split('-').pop()}
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex flex-col sm:flex-row gap-2 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 px-4 py-3 rounded transition-colors ${darkMode
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
            disabled={remaining > 0.01 || isLoading || draftPrintLoading}
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

      {/* QR Code Modal */}
      {showQRCode && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center z-[60]">
          <button
            onClick={() => setShowQRCode(false)}
            className="absolute top-6 right-6 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-8 h-8" />
          </button>

          <div className="text-center max-w-2xl px-8">
            {/* QR Code Container */}
            <div className={`mb-8 p-12 rounded-2xl inline-block ${darkMode ? 'bg-white' : 'bg-white'
              }`}>
              <QrCode className="w-80 h-80 text-gray-800" />
            </div>

            {/* Payment Info */}
            <div className="space-y-4">
              <div className="inline-block px-6 py-2 bg-purple-600 rounded-full">
                <h3 className="text-2xl font-bold text-white">
                  {qrGatewayName.toUpperCase()}
                </h3>
              </div>

              <h4 className="text-3xl font-bold text-white">
                {t.qrScanCode || 'QR Kodu Okutun'}
              </h4>

              <p className="text-xl text-gray-300">
                {t.qrCustomerInstruction || 'Müşteri telefonu ile QR kodu okutarak ödemeyi tamamlayabilir'}
              </p>

              {/* Amount Display */}
              <div className="mt-8 p-6 bg-white/10 rounded-xl border-2 border-white/20">
                <p className="text-sm text-gray-400 mb-2">{t.paymentAmount || 'Ödeme Tutarı'}</p>
                <p className="text-5xl font-bold text-white font-mono">
                  {formatNumberTR(parseFloat(currentAmount), 2, true)} <span className="text-3xl text-gray-300">{currentCurrency}</span>
                </p>
                {currentCurrency !== 'IQD' && (
                  <p className="text-lg text-gray-400 mt-2">
                    ≈ {formatNumberTR(parseFloat(currentAmount) * exchangeRates[currentCurrency], 2, true)} IQD
                  </p>
                )}
              </div>

              {/* Instructions */}
              <div className="mt-6 flex items-center justify-center gap-3 text-gray-400">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                  <Smartphone className="w-6 h-6" />
                </div>
                <p className="text-left">
                  <span className="block text-sm">{t.step1 || 'Adım 1'}</span>
                  <span className="block text-white">{t.holdPhoneToQr || 'Telefonu QR koda tutun'}</span>
                </p>
                <div className="text-2xl text-white/30">→</div>
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                  <Check className="w-6 h-6 text-green-400" />
                </div>
                <p className="text-left">
                  <span className="block text-sm">{t.step2 || 'Adım 2'}</span>
                  <span className="block text-white">{t.confirmPaymentText || 'Ödemeyi onaylayın'}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
