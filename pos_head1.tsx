import { X, CreditCard, Tag, Percent, DollarSign, TrendingDown, Banknote, Check, Plus, Minus, Globe, Smartphone } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Campaign } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { paymentGateway, type PaymentProvider } from '../../services/paymentGateway';
import { formatNumber } from '../../utils/formatNumber';
import { formatNumberInput } from '../../utils/numberFormatter';

interface Payment {
  method: 'cash' | 'card' | 'gateway';
  amount: number;
  currency: 'IQD' | 'USD' | 'EUR' | 'TRY';
  gatewayProvider?: string; // 'fib' | 'fastpay'
  transactionId?: string;
}

interface POSPaymentModalV2Props {
  total: number;
  subtotal: number;
  itemDiscount: number;
  campaignDiscount: number;
  selectedCampaign?: Campaign | null;  // Kampanya bilgisi
  onClose: () => void;
  onComplete: (paymentData: any) => void;
}

export function POSPaymentModalV2({
  total,
  subtotal,
  itemDiscount,
  campaignDiscount,
  selectedCampaign,
  onClose,
  onComplete
}: POSPaymentModalV2Props) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [currentMethod, setCurrentMethod] = useState<'cash' | 'card' | 'gateway'>('cash');
  const [currentAmount, setCurrentAmount] = useState('');
  const [currentCurrency, setCurrentCurrency] = useState<'IQD' | 'USD' | 'EUR' | 'TRY'>('IQD');
  const [discountType, setDiscountType] = useState<'percentage' | 'amount'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [numpadMode, setNumpadMode] = useState<'replace' | 'concat'>('replace'); // CONCAT MODE!
  const [selectedGateway, setSelectedGateway] = useState<string>('');
  const [activeProviders, setActiveProviders] = useState<PaymentProvider[]>([]);

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
  const exchangeRates = {
    IQD: 1,
    USD: 1310,  // 1 USD = 1310 IQD
    EUR: 1450,  // 1 EUR = 1450 IQD
    TRY: 45     // 1 TRY = 45 IQD
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
    const amountInIQD = payment.amount * exchangeRates[payment.currency];
    return sum + amountInIQD;
  }, 0);

  const remaining = finalTotal - totalPaid;
  const change = totalPaid > finalTotal ? totalPaid - finalTotal : 0;

  const handleNumpadClick = (value: string) => {
    if (value === ',' || value === '.') {
      // Türkiye formatı: virgül (,) ondalık ayırıcı
      if (numpadMode === 'concat') {
        if (!currentAmount.includes(',')) {
          setCurrentAmount(prev => {
            // Eğer boşsa veya sadece rakam varsa virgül ekle
            if (!prev || /^\d+$/.test(prev.replace(/\./g, ''))) {
              return prev + ',';
            }
            return prev;
          });
        }
      } else {
        setCurrentAmount(',');
      }
    } else if (numpadMode === 'concat') {
      // Concat mode: rakamları ekle ve formatla
      setCurrentAmount(prev => {
        const newValue = prev + value;
        return formatNumberInput(newValue);
      });
    } else {
      // Replace mode: yeni değeri formatla
      setCurrentAmount(formatNumberInput(value));
    }
  };

  const handleAddPayment = () => {
    // Türkiye formatından parse et: nokta binlik, virgül ondalık
    const normalized = currentAmount.replace(/\./g, '').replace(/,/g, '.');
    const amount = parseFloat(normalized) || 0;
    if (!amount || amount <= 0) return;

    const newPayment: Payment = {
      method: currentMethod,
      amount: amount,
      currency: currentCurrency,
      ...(currentMethod === 'gateway' && { gatewayProvider: selectedGateway })
    };

    setPayments([...payments, newPayment]);
    setCurrentAmount('');
  };

  const handleRemovePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const handleConfirmPayment = async () => {
    if (remaining > 0.01) {
      alert(t.insufficientPayment || 'Ödeme tutarı yetersiz!');
      return;
    }

    // Process gateway payments if any
    const gatewayPayments = payments.filter(p => p.method === 'gateway');

    if (gatewayPayments.length > 0) {
      // Gateway ödemeleri için işlem başlat
      for (const payment of gatewayPayments) {
        if (payment.gatewayProvider) {
          const result = await paymentGateway.initiatePayment(
            payment.gatewayProvider,
            {
              amount: payment.amount,
              currency: payment.currency,
              orderId: `ORDER-${Date.now()}`,
              description: 'POS Satış Ödemesi'
            }
          );

          if (result.success && result.paymentUrl) {
            // Ödeme URL'sini yeni sekmede aç
            window.open(result.paymentUrl, '_blank');

            // Wait for user confirmation (Simulated webhook/callback check)
            const confirmed = window.confirm(
              `"${payment.gatewayProvider}" ödeme sayfası yeni sekmede açıldı.\n\nÖdeme işlemini tamamladıktan sonra "Tamam" butonuna tıklayın.\nÖdeme başarısız olduysa "İptal" diyerek geri dönün.`
            );

            if (!confirmed) {
              return;
            }

            payment.transactionId = result.transactionId;
          } else {
            alert(`${payment.gatewayProvider} ödemesi başlatılamadı: ${result.error}`);
            return;
          }
        }
      }
    }

    onComplete({
      payments: payments,
      totalPaid: totalPaid,
      change: change,
      discount: calculatedDiscount,
      finalTotal: finalTotal
    });
  };

  const currencies = [
    { code: 'IQD' as const, symbol: 'IQD', label: 'Iraqi Dinar', flag: '🇮🇶' },
    { code: 'USD' as const, symbol: '$', label: 'US Dollar', flag: '🇺🇸' },
    { code: 'EUR' as const, symbol: '€', label: 'Euro', flag: '🇪🇺' }
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
        {/* Header */}
        <div className={`p-3 border-b flex items-center justify-between ${darkMode ? 'border-gray-700 bg-gradient-to-r from-gray-700 to-gray-600' : 'border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700'}`}>
          <h3 className="text-base text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {t.paymentTitle || 'Ödeme Al'}
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Campaign Banner */}
        {selectedCampaign && campaignDiscount > 0 && (
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-2.5 border-b flex items-center gap-2">
            <Tag className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{selectedCampaign.name}</div>
              <div className="text-xs text-orange-100">Kampanya İndirimi: -{formatNumber(campaignDiscount, 2, true)} IQD</div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-3 gap-4 h-full">
            {/* Left - Summary */}
            <div className={`space-y-3 ${darkMode ? 'text-gray-200' : ''}`}>
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
                    <Percent className="w-3.5 h-3.5 inline mr-1" />
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
                  placeholder={discountType === 'percentage' ? 'İndirim %' : 'İndirim Tutarı'}
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
                        {formatNumber(amount, 2, true)}
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
                    <span>Ara Toplam:</span>
                    <span className="font-medium font-mono">{formatNumber(subtotal, 2, true)}</span>
                  </div>

                  {itemDiscount > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Satır İndirimi:</span>
                      <span className="font-medium font-mono">-{formatNumber(itemDiscount, 2, true)}</span>
                    </div>
                  )}

                  {selectedCampaign && campaignDiscount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {selectedCampaign.name} İndirimi:
                      </span>
                      <span className="font-medium font-mono">-{formatNumber(campaignDiscount, 2, true)}</span>
                    </div>
                  )}

                  {calculatedDiscount > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span>İlave İndirim:</span>
                      <span className="font-medium font-mono">-{formatNumber(calculatedDiscount, 2, true)}</span>
                    </div>
                  )}

                  <div className={`border-t-2 my-2 ${darkMode ? 'border-gray-600' : 'border-gray-400'}`}></div>

                  <div className="flex justify-between text-xl pt-1">
                    <span className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                      Ödenecek:
                    </span>
                    <span className={`font-bold font-mono px-3 py-1 rounded ${darkMode ? 'text-blue-400 bg-blue-900/30' : 'text-blue-700 bg-blue-50'
                      }`}>
                      {formatNumber(finalTotal, 2, true)} IQD
                    </span>
                  </div>

                  {totalPaid > 0 && (
                    <>
                      <div className="flex justify-between text-green-600">
                        <span>Ödenen:</span>
                        <span className="font-medium font-mono">{formatNumber(totalPaid, 2, true)} IQD</span>
                      </div>

                      {remaining > 0 ? (
                        <div className="flex justify-between text-red-600 font-medium">
                          <span>Kalan:</span>
                          <span className="font-mono">{formatNumber(remaining, 2, true)} IQD</span>
                        </div>
                      ) : (
                        <div className={`p-3 rounded-lg mt-2 ${darkMode ? 'bg-green-900/30 border-2 border-green-600' : 'bg-green-50 border-2 border-green-400'
                          }`}>
                          <div className="flex justify-between items-center">
                            <span className="text-green-700 dark:text-green-400 font-semibold">
                              Para Üstü:
                            </span>
                            <span className="text-2xl font-bold font-mono text-green-700 dark:text-green-300">
                              {formatNumber(change, 2, true)} IQD
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
                  <h4 className={`text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Eklenen Ödemeler:</h4>
                  <div className="space-y-2">
                    {payments.map((payment, index) => (
                      <div key={index} className={`flex items-center justify-between p-2 border rounded ${darkMode ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-gray-50'
                        }`}>
                        <div className="flex items-center gap-2">
                          {payment.method === 'cash' ? (
                            <Banknote className="w-4 h-4 text-green-600" />
                          ) : payment.method === 'card' ? (
                            <CreditCard className="w-4 h-4 text-blue-600" />
                          ) : payment.gatewayProvider === 'zaincash' ? (
                            <img src="/payment-logos/zaincash.png" alt="ZainCash" className="w-4 h-4 object-contain" />
                          ) : (
                            <Smartphone className="w-4 h-4 text-purple-600" />
                          )}
                          <span className="text-sm">
                            {payment.amount} {payment.currency}
                          </span>
                          <span className="text-xs text-gray-500">
                            (≈ {formatNumber(payment.amount * exchangeRates[payment.currency], 2, true)} IQD)
                          </span>
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
              {/* Payment Method */}
              <div className="space-y-2">
                <h4 className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Ödeme Yöntemi:
                </h4>

                <button
                  onClick={() => setCurrentMethod('cash')}
                  className={`w-full p-3 border transition-all flex items-center gap-3 ${currentMethod === 'cash'
                    ? darkMode
                      ? 'border-green-500 bg-green-900/30 shadow-md'
                      : 'border-green-600 bg-green-50 shadow-md'
                    : darkMode
                      ? 'border-gray-600 bg-gray-800'
                      : 'border-gray-300 bg-white hover:border-green-500 hover:bg-green-50'
                    }`}
                >
                  <div className={`w-10 h-10 flex items-center justify-center ${currentMethod === 'cash' ? 'bg-green-600' : darkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`}>
                    <Banknote className={`w-5 h-5 ${currentMethod === 'cash' ? 'text-white' : darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                  </div>
                  <div className="flex-1 text-left">
                    <h5 className={`text-sm ${currentMethod === 'cash' ? 'text-green-700' : darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                      Nakit
                    </h5>
                  </div>
                  {currentMethod === 'cash' && <Check className="w-5 h-5 text-green-600" />}
                </button>

                <button
                  onClick={() => setCurrentMethod('card')}
                  className={`w-full p-3 border transition-all flex items-center gap-3 ${currentMethod === 'card'
                    ? darkMode
                      ? 'border-blue-500 bg-blue-900/30 shadow-md'
                      : 'border-blue-600 bg-blue-50 shadow-md'
                    : darkMode
                      ? 'border-gray-600 bg-gray-800'
                      : 'border-gray-300 bg-white hover:border-blue-500 hover:bg-blue-50'
                    }`}
                >
                  <div className={`w-10 h-10 flex items-center justify-center ${currentMethod === 'card' ? 'bg-blue-600' : darkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`}>
                    <CreditCard className={`w-5 h-5 ${currentMethod === 'card' ? 'text-white' : darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                  </div>
                  <div className="flex-1 text-left">
                    <h5 className={`text-sm ${currentMethod === 'card' ? 'text-blue-700' : darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                      Kart (POS)
                    </h5>
                  </div>
                  {currentMethod === 'card' && <Check className="w-5 h-5 text-blue-600" />}
                </button>

                {activeProviders.length > 0 && (
                  <div className="space-y-2">
                    <h4 className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Ödeme Sağlayıcı:
                    </h4>
                    {activeProviders.map(provider => (
                      <button
                        key={provider.id}
                        onClick={() => {
                          setCurrentMethod('gateway');
                          setSelectedGateway(provider.id);
                        }}
                        className={`w-full p-3 border transition-all flex items-center gap-3 ${currentMethod === 'gateway' && selectedGateway === provider.id
                          ? darkMode
                            ? 'border-purple-500 bg-purple-900/30 shadow-md'
                            : 'border-purple-600 bg-purple-50 shadow-md'
                          : darkMode
                            ? 'border-gray-600 bg-gray-800'
                            : 'border-gray-300 bg-white hover:border-purple-500 hover:bg-purple-50'
                          }`}
                      >
                        <div className={`w-10 h-10 flex items-center justify-center ${currentMethod === 'gateway' && selectedGateway === provider.id ? 'bg-purple-600' : darkMode ? 'bg-gray-700' : 'bg-gray-200'
                          }`}>
                          {provider.id === 'zaincash' ? (
                            <img src="/payment-logos/zaincash.png" alt="ZC" className="w-6 h-6 object-contain" />
                          ) : (
                            <Smartphone className={`w-5 h-5 ${currentMethod === 'gateway' && selectedGateway === provider.id ? 'text-white' : darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <h5 className={`text-sm ${currentMethod === 'gateway' && selectedGateway === provider.id ? 'text-purple-700' : darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                            {provider.name}
                          </h5>
                        </div>
                        {currentMethod === 'gateway' && selectedGateway === provider.id && <Check className="w-5 h-5 text-purple-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Currency Selector */}
              <div>
                <h4 className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Para Birimi:
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {currencies.map(curr => (
                    <button
                      key={curr.code}
                      onClick={() => setCurrentCurrency(curr.code)}
                      className={`p-2 border rounded text-sm transition-colors ${currentCurrency === curr.code
                        ? 'bg-blue-600 text-white border-blue-600'
                        : darkMode
                          ? 'bg-gray-800 border-gray-600 text-gray-300 hover:border-blue-500'
                          : 'bg-white border-gray-300 hover:border-blue-500'
                        }`}
                    >
                      <div className="flex items-center gap-1">
                        <span>{curr.flag}</span>
                        <span>{curr.code}</span>
                      </div>
                    </button>
                  ))}
                </div>
                {currentCurrency !== 'IQD' && (
                  <div className="text-xs text-gray-500 mt-1">
                    Kur: 1 {currentCurrency} = {exchangeRates[currentCurrency]} IQD
                  </div>
                )}
              </div>

              {/* Amount Input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Miktar:
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Numpad Modu:</span>
                    <button
                      onClick={() => setNumpadMode(numpadMode === 'replace' ? 'concat' : 'replace')}
                      className={`px-2 py-1 rounded text-xs border ${numpadMode === 'concat'
                        ? 'bg-green-600 text-white border-green-600'
                        : darkMode
                          ? 'bg-gray-700 border-gray-600 text-gray-300'
                          : 'bg-gray-100 border-gray-300'
                        }`}
                    >
                      {numpadMode === 'concat' ? '+ Ekle' : '↻ Değiştir'}
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={currentAmount}
                  readOnly
                  placeholder="0"
                  className={`w-full px-4 py-4 text-2xl text-center border-2 font-mono ${darkMode
                    ? 'bg-gray-800 border-gray-600 text-white'
                    : 'bg-white border-gray-300'
                    }`}
                />
              </div>

              {/* Add Payment Button */}
              <button
                onClick={handleAddPayment}
                disabled={!currentAmount || parseFloat(currentAmount) <= 0}
                className="w-full py-3 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Ödeme Ekle
              </button>
            </div>

            {/* Right - Numpad */}
            <div>
              <div className="grid grid-cols-4 gap-1">
                {/* First row: 00, Clear, ×, − */}
                <button
                  onClick={() => handleNumpadClick('00')}
                  className={`p-3 text-base rounded-sm transition-colors ${darkMode
                    ? 'bg-gray-800 hover:bg-gray-700 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                >
                  00
                </button>

                <button
                  onClick={() => setCurrentAmount('')}
                  className={`p-3 rounded-sm transition-colors ${darkMode
                    ? 'bg-gray-800 hover:bg-red-900/30 text-red-400'
                    : 'bg-gray-100 hover:bg-red-100 text-red-600'
                    }`}
                >
                  C
                </button>

                <button
                  onClick={() => setCurrentAmount(prev => prev.slice(0, -1))}
                  className={`p-3 rounded-sm transition-colors ${darkMode
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                    }`}
                >
                  ×
                </button>

                <button
                  onClick={() => setCurrentAmount(prev => prev.slice(0, -1))}
                  className={`p-3 rounded-sm transition-colors ${darkMode
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                    }`}
                >
                  −
                </button>

                {/* Second row: 7, 8, 9, C */}
                {[7, 8, 9].map(num => (
                  <button
                    key={num}
                    onClick={() => handleNumpadClick(num.toString())}
                    className={`p-3 text-base rounded-sm transition-colors ${darkMode
                      ? 'bg-gray-800 hover:bg-gray-700 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentAmount('')}
                  className={`p-3 text-xs rounded-sm transition-colors ${darkMode
                    ? 'bg-gray-800 hover:bg-gray-700 text-blue-400'
                    : 'bg-gray-100 hover:bg-gray-200 text-blue-600'
                    }`}
                >
                  C
                </button>

                {/* Third row: 4, 5, 6, Fiyat */}
                {[4, 5, 6].map(num => (
                  <button
                    key={num}
                    onClick={() => handleNumpadClick(num.toString())}
                    className={`p-3 text-base rounded-sm transition-colors ${darkMode
                      ? 'bg-gray-800 hover:bg-gray-700 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentAmount(finalTotal.toString())}
                  className={`p-3 text-xs rounded-sm transition-colors ${darkMode
                    ? 'bg-gray-800 hover:bg-gray-700 text-blue-400'
                    : 'bg-gray-100 hover:bg-gray-200 text-blue-600'
                    }`}
                >
                  Fiyat
                </button>

                {/* Fourth row: 1, 2, 3, Tamam */}
                {[1, 2, 3].map(num => (
                  <button
                    key={num}
                    onClick={() => handleNumpadClick(num.toString())}
                    className={`p-3 text-base rounded-sm transition-colors ${darkMode
                      ? 'bg-gray-800 hover:bg-gray-700 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleAddPayment}
                  disabled={!currentAmount || parseFloat(currentAmount) <= 0}
                  className={`row-span-2 p-3 rounded-sm text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${darkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                >
                  Tamam
                </button>

                {/* Fifth row: 0, , (nokta) */}
                <button
                  onClick={() => handleNumpadClick('0')}
                  className={`col-span-2 p-3 text-base rounded-sm transition-colors ${darkMode
                    ? 'bg-gray-800 hover:bg-gray-700 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                >
                  0
                </button>

                <button
                  onClick={() => handleNumpadClick('.')}
                  className={`p-3 text-base rounded-sm transition-colors ${darkMode
                    ? 'bg-gray-800 hover:bg-gray-700 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                >
                  ,
                </button>
              </div>

              {/* Quick amounts - below numpad */}
              <div className="grid grid-cols-3 gap-1 mt-1.5">
                {[1000, 5000, 10000, 20000, 50000, 100000].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setCurrentAmount(amount.toString())}
                    className={`p-2 text-xs rounded-sm transition-colors ${darkMode
                      ? 'bg-blue-900/30 hover:bg-blue-900/50 text-blue-400'
                      : 'bg-blue-100 hover:bg-blue-200 text-blue-700'
                      }`}
                  >
                    +{formatNumber(amount, 2, true)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex gap-2 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
          <button
            onClick={onClose}
            className={`flex-1 px-4 py-3 rounded transition-colors ${darkMode
              ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
          >
            İptal
          </button>
          <button
            onClick={handleConfirmPayment}
            disabled={remaining > 0.01}
            className="flex-1 px-4 py-3 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Ödemeyi Tamamla
          </button>
        </div>
      </div>
    </div>
  );
}
