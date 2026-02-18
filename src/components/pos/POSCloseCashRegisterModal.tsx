import React, { useState } from 'react';
import { X, DollarSign, Printer, CheckCircle, AlertTriangle, Calculator, Users } from 'lucide-react';
import type { Sale } from '../../core/types';
import { POSClosePrintPreview } from './POSClosePrintPreview';
import { formatCurrency, formatNumber } from '../../utils/formatNumber';
import { formatNumberInput, parseFormattedNumber } from '../../utils/numberFormatter';
import { POSNumpad } from './POSNumpad';
import { POSCashHandoverModal } from './POSCashHandoverModal';
import { useLanguage } from '../../contexts/LanguageContext';

interface POSCloseCashRegisterModalProps {
  onClose: () => void;
  sales: Sale[];
  currentStaff: string;
  openingCash: number;
  onCashRegisterClosed: (closedCash: number, note: string) => void;
  onCashHandover?: (toStaff: string, amount: number, note: string) => void;
}

interface DenominationCount {
  value: number;
  count: number;
}


export function POSCloseCashRegisterModal({
  onClose,
  sales,
  currentStaff,
  openingCash,
  onCashRegisterClosed,
  onCashHandover
}: POSCloseCashRegisterModalProps) {
  const { t } = useLanguage();
  const [countedCash, setCountedCash] = useState('');
  const [showDenominationCounter, setShowDenominationCounter] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [note, setNote] = useState('');
  const [printFormat, setPrintFormat] = useState<'80mm' | 'a4'>('80mm');
  
  // Banknot/madeni para sayımı
  const [denominations, setDenominations] = useState<DenominationCount[]>([
    { value: 50000, count: 0 },
    { value: 25000, count: 0 },
    { value: 10000, count: 0 },
    { value: 5000, count: 0 },
    { value: 1000, count: 0 },
    { value: 500, count: 0 },
    { value: 250, count: 0 },
  ]);

  // Hesaplamalar
  const todaySales = sales.filter(sale => {
    const saleDate = new Date(sale.date);
    const today = new Date();
    return saleDate.toDateString() === today.toDateString();
  });

  // More robust filtering - check for all possible payment method values
  // If paymentMethod is undefined/null, treat as cash (default)
  const cashSales = todaySales.filter(s => {
    if (!s.paymentMethod) return true; // Default to cash if undefined
    const pm = String(s.paymentMethod).toLowerCase().trim();
    return pm === 'cash' || pm === 'nakit' || pm === '';
  });
  
  const cardSales = todaySales.filter(s => {
    if (!s.paymentMethod) return false; // Skip undefined for card
    const pm = String(s.paymentMethod).toLowerCase().trim();
    return pm === 'card' || pm === 'kredi kartı' || pm === 'gateway' || pm === 'kart';
  });
  
  const returnSales = todaySales.filter(s => s.total < 0);

  const totalSales = todaySales.reduce((sum, sale) => sum + (sale.total > 0 ? sale.total : 0), 0);
  const cashTotal = cashSales.reduce((sum, sale) => sum + sale.total, 0);
  const cardTotal = cardSales.reduce((sum, sale) => sum + sale.total, 0);
  const returnTotal = returnSales.reduce((sum, sale) => sum + Math.abs(sale.total), 0);
  const netSales = totalSales - returnTotal;

  // Kart ödemeleri de kasaya yansımalı (nakit + kart)
  const expectedCash = openingCash + cashTotal + cardTotal;
  const actualCash = showDenominationCounter 
    ? denominations.reduce((sum, d) => sum + (d.value * d.count), 0)
    : parseFormattedNumber(countedCash);
  const difference = actualCash - expectedCash;

  const handleDenominationChange = (index: number, count: number) => {
    const newDenominations = [...denominations];
    newDenominations[index].count = Math.max(0, count);
    setDenominations(newDenominations);
  };

  const handlePrintReport = () => {
    setShowPrintPreview(true);
  };

  const handleActualPrint = () => {
    // Yazdırma işlemi
    window.print();
  };

  const handleCloseCashRegister = () => {
    if (!actualCash || actualCash === 0) {
      alert(t.cashCountRequired);
      return;
    }

    if (Math.abs(difference) > 10 && !confirm(t.cashDifferenceConfirm.replace('{amount}', formatCurrency(Math.abs(difference))).replace('{type}', difference > 0 ? t.excess : t.shortage))) {
      return;
    }

    handlePrintReport();
    
    // Kasa kapatma işlemi
    alert(t.cashClosedSuccessfully.replace('{opening}', formatCurrency(openingCash)).replace('{counted}', formatCurrency(actualCash)).replace('{difference}', formatCurrency(difference)));
    
    // Burada gerçek uygulamada:
    // 1. Kasa kapatma kaydı veritabanına eklenir
    // 2. Rapor yazdırılır
    // 3. Kasaya yeni oturum açılır (isteğe bağlı)
    // 4. Kullanıcı çıkışı yapılır veya yeni oturum başlatılır
    
    onCashRegisterClosed(actualCash, note);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white w-full ${showNumpad ? 'max-w-6xl' : 'max-w-4xl'} max-h-[95vh] flex flex-col shadow-2xl transition-all duration-300`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-red-600 to-red-700 flex items-center justify-between">
          <h3 className="text-lg text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6" />
            {t.closeCashRegisterProcess}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNumpad(!showNumpad)}
              className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors ${
                showNumpad 
                  ? 'bg-white/20 text-white' 
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              <Calculator className="w-4 h-4" />
              {t.numpad}
            </button>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/10 p-1 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className={`${showNumpad ? 'grid grid-cols-3 gap-4' : 'grid grid-cols-2 gap-4'}`}>
            {/* Sol Kolon - Satış Özeti */}
            <div className="space-y-4">
              {/* Satış İstatistikleri */}
              <div className="bg-blue-50 border border-blue-200 p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-3">{t.salesSummary}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t.totalSalesCount}</span>
                    <span className="font-medium text-gray-900">{todaySales.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t.grossSales}:</span>
                    <span className="font-medium text-gray-900">{formatCurrency(totalSales)}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>{t.returnTotal}:</span>
                    <span className="font-medium">-{formatCurrency(returnTotal)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-blue-300">
                    <span className="text-blue-900 font-medium">{t.netSales}:</span>
                    <span className="font-bold text-blue-900">{formatCurrency(netSales)}</span>
                  </div>
                </div>
              </div>

              {/* Ödeme Yöntemleri */}
              <div className="bg-green-50 border border-green-200 p-4">
                <h4 className="text-sm font-medium text-green-900 mb-3">{t.paymentMethods}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t.cashSales} ({cashSales.length}):</span>
                    <span className="font-medium text-gray-900">{formatCurrency(cashTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t.creditCard} ({cardSales.length}):</span>
                    <span className="font-medium text-gray-900">{formatCurrency(cardTotal)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-green-300">
                    <span className="text-green-900 font-medium">{t.totalCollection}</span>
                    <span className="font-bold text-green-900">{formatCurrency(cashTotal + cardTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Kasa Durumu */}
              <div className="bg-orange-50 border border-orange-200 p-4">
                <h4 className="text-sm font-medium text-orange-900 mb-3">{t.cashStatus}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t.openingCashRegister}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(openingCash)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t.cashSales}:</span>
                    <span className="font-medium text-gray-900">{formatCurrency(cashTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t.cardSales}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(cardTotal)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-orange-300">
                    <span className="text-orange-900 font-medium">{t.expectedCash}</span>
                    <span className="font-bold text-orange-900">{formatCurrency(expectedCash)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sağ Kolon - Kasa Sayımı */}
            <div className="space-y-4">
              {/* Sayım Yöntemi Seçimi */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDenominationCounter(false)}
                  className={`flex-1 px-4 py-2 text-sm transition-all ${
                    !showDenominationCounter
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t.manualEntry}
                </button>
                <button
                  onClick={() => setShowDenominationCounter(true)}
                  className={`flex-1 px-4 py-2 text-sm transition-all ${
                    showDenominationCounter
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t.banknoteCount}
                </button>
              </div>

              {/* Manuel Giriş */}
              {!showDenominationCounter ? (
                <div className="bg-gray-50 border border-gray-200 p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">{t.countedCashAmount}</h4>
                  <input
                    type="text"
                    value={countedCash}
                    onChange={(e) => setCountedCash(formatNumberInput(e.target.value))}
                    placeholder={t.cashCountExample}
                    className="w-full px-3 py-3 text-lg border border-gray-300 focus:outline-none focus:border-blue-600 text-center font-bold"
                  />
                </div>
              ) : (
                /* Banknot/Madeni Para Sayımı */
                <div className="bg-gray-50 border border-gray-200 p-4 max-h-96 overflow-y-auto">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">{t.banknoteAndCoinCount}</h4>
                  <div className="space-y-2">
                    {denominations.map((denom, index) => (
                      <div key={denom.value} className="flex items-center gap-2">
                        <div className="w-20 text-sm font-medium text-center py-1 bg-green-100 text-green-800">
                          {denom.value}
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={denom.count === 0 ? '' : denom.count}
                          onFocus={(e) => {
                            // Select all text on focus for easy replacement
                            e.target.select();
                          }}
                          onChange={(e) => handleDenominationChange(index, parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 focus:outline-none focus:border-blue-600 text-center"
                        />
                        <div className="w-28 text-sm text-right font-medium">
                          {formatNumber(denom.value * denom.count, 0, false)}
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-gray-300 flex justify-between font-bold">
                      <span>{t.totalLabel}</span>
                      <span>{formatNumber(actualCash, 0, false)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Fark Göstergesi */}
              {actualCash > 0 && (
                <div className={`p-4 border ${
                  Math.abs(difference) < 0.01 
                    ? 'bg-green-50 border-green-500' 
                    : Math.abs(difference) < 10
                    ? 'bg-yellow-50 border-yellow-500'
                    : 'bg-red-50 border-red-500'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{t.cashDifference}</span>
                    <span className={`text-2xl font-bold ${
                      Math.abs(difference) < 0.01 
                        ? 'text-green-700' 
                        : difference > 0
                        ? 'text-blue-700'
                        : 'text-red-700'
                    }`}>
                      {difference > 0 ? '+' : ''}{formatNumber(difference)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {Math.abs(difference) < 0.01 ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-sm text-green-700">{t.cashBalanced}</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                        <span className="text-sm text-orange-700">
                          {difference > 0 ? t.excess : t.shortage}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Not Alanı */}
              <div className="bg-gray-50 border border-gray-200 p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">{t.noteOptional}</h4>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t.cashClosingNotePlaceholder}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {/* Numpad - Sağ Kolon */}
            {showNumpad && (
              <div>
                <POSNumpad
                  value={countedCash}
                  onChange={setCountedCash}
                  showSubmitButton={false}
                  allowDecimal={false}
                />
              </div>
            )}
          </div>

          {/* Oturum Bilgisi */}
          <div className="mt-4 bg-blue-50 border border-blue-200 p-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex gap-6">
                <div>
                  <span className="text-gray-600">{t.cashierLabel} </span>
                  <span className="font-medium text-gray-900">{currentStaff}</span>
                </div>
                <div>
                  <span className="text-gray-600">{t.cashRegisterLabel} </span>
                  <span className="font-medium text-gray-900">{t.cashRegister} #1</span>
                </div>
                <div>
                  <span className="text-gray-600">{t.session}: </span>
                  <span className="font-medium text-gray-900">{t.sessionDay}</span>
                </div>
              </div>
              <div className="text-gray-600">
                {new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR')}
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Actions */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
          >
            {t.cancel}
          </button>
          {onCashHandover && (
            <button
              onClick={() => {
                if (actualCash === 0) {
                  alert(t.cashHandoverCountRequired);
                  return;
                }
                // Para devri modal'ını aç
                setShowHandoverModal(true);
              }}
              disabled={!actualCash || actualCash === 0}
              className="px-4 py-2.5 text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Users className="w-4 h-4" />
              {t.transferToOtherCashier}
            </button>
          )}
          <button
            onClick={handlePrintReport}
            disabled={!actualCash || actualCash === 0}
            className="px-4 py-2.5 text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            {t.printReport}
          </button>
          <button
            onClick={handleCloseCashRegister}
            disabled={!actualCash || actualCash === 0}
            className="px-4 py-2.5 text-sm bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-4 h-4" />
            {t.closeCashRegister}
          </button>
        </div>
      </div>
      
      {showPrintPreview && (
        <POSClosePrintPreview
          onClose={() => setShowPrintPreview(false)}
          onPrint={handleActualPrint}
          printFormat={printFormat}
          setPrintFormat={setPrintFormat}
          sales={sales}
          currentStaff={currentStaff}
          openingCash={openingCash}
          actualCash={actualCash}
          expectedCash={expectedCash}
          difference={difference}
          note={note}
        />
      )}
      
      {showHandoverModal && onCashHandover && (
        <POSCashHandoverModal
          onClose={() => setShowHandoverModal(false)}
          onConfirmHandover={(toStaff, amount, handoverNote) => {
            onCashHandover(toStaff, amount, handoverNote);
            setShowHandoverModal(false);
            onClose();
          }}
          fromStaff={currentStaff}
          amount={actualCash}
          note={note}
        />
      )}
    </div>
  );
}
