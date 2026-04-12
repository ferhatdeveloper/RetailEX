import { X, Banknote, CheckCircle, Calculator, Users } from 'lucide-react';
import { useState } from 'react';
import { formatNumberInput, parseFormattedNumber, formatNumberOnBlur } from '../../utils/numberFormatter';
import { formatNumber } from '../../utils/formatNumber';
import { POSNumpad } from './POSNumpad';
import { useLanguage } from '../../contexts/LanguageContext';

interface POSOpenCashRegisterModalProps {
  onClose: () => void;
  onOpenRegister: (openingCash: number, note: string) => void;
  currentStaff: string;
  pendingHandover?: {
    fromStaff: string;
    amount: number;
    note: string;
  } | null;
}

interface DenominationCount {
  value: number;
  count: number;
}

// Helper function to format number with thousand separators
const formatNumberWithThousandSeparators = (value: string): string => {
  // Remove all non-digit characters except decimal point
  const cleanValue = value.replace(/[^\d.]/g, '');
  
  // Split by decimal point
  const parts = cleanValue.split('.');
  
  // Format the integer part with thousand separators
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  // Return formatted value (limit to 2 decimal places)
  return parts.length > 1 ? `${parts[0]}.${parts[1].slice(0, 2)}` : parts[0];
};

export function POSOpenCashRegisterModal({ 
  onClose, 
  onOpenRegister,
  currentStaff,
  pendingHandover
}: POSOpenCashRegisterModalProps) {
  const { t } = useLanguage();
  const [openingCash, setOpeningCash] = useState(pendingHandover ? pendingHandover.amount.toString() : '');
  const [displayValue, setDisplayValue] = useState('');
  const [showDenominationCounter, setShowDenominationCounter] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);
  const [note, setNote] = useState(pendingHandover ? pendingHandover.note : '');
  
  // Banknot sayımı
  const [denominations, setDenominations] = useState<DenominationCount[]>([
    { value: 50000, count: 0 },
    { value: 25000, count: 0 },
    { value: 10000, count: 0 },
    { value: 5000, count: 0 },
    { value: 1000, count: 0 },
    { value: 500, count: 0 },
    { value: 250, count: 0 },
  ]);

  const actualCash = showDenominationCounter 
    ? denominations.reduce((sum, d) => sum + (d.value * d.count), 0)
    : parseFormattedNumber(openingCash) || 0;

  const handleDenominationChange = (index: number, count: number) => {
    const newDenominations = [...denominations];
    newDenominations[index].count = Math.max(0, count);
    setDenominations(newDenominations);
  };

  const handleOpenCashRegister = () => {
    if (!actualCash || actualCash === 0) {
      if (!confirm(t.zeroOpeningCashConfirm)) {
        return;
      }
    }

    onOpenRegister(actualCash, note);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className={`p-4 border-b border-gray-200 flex items-center justify-between ${
          pendingHandover 
            ? 'bg-gradient-to-r from-purple-600 to-purple-700' 
            : 'bg-gradient-to-r from-green-600 to-green-700'
        }`}>
          <h3 className="text-lg text-white flex items-center gap-2">
            <Banknote className="w-6 h-6" />
            {pendingHandover ? t.cashHandoverAccept : t.openCashRegisterProcess}
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

        <div className="flex-1 overflow-y-auto p-6">
          {/* Para Devri Bildirimi */}
          {pendingHandover && (
            <div className="bg-purple-50 border-2 border-purple-500 p-4 mb-4 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="bg-purple-600 rounded-full p-2">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-purple-900 mb-2">{t.cashHandoverAvailable}</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t.handoverFromCashier}</span>
                      <span className="font-medium text-gray-900">{pendingHandover.fromStaff}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t.handoverAmount}</span>
                      <span className="text-xl font-bold text-purple-900">{formatNumber(pendingHandover.amount)}</span>
                    </div>
                    {pendingHandover.note && (
                      <div className="mt-2 pt-2 border-t border-purple-200">
                        <span className="text-xs text-gray-600">Not:</span>
                        <p className="text-sm text-gray-900 mt-1">{pendingHandover.note}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Oturum Bilgisi */}
          <div className="bg-blue-50 border border-blue-200 p-4 mb-4">
            <h4 className="text-sm text-blue-900 mb-3">{t.sessionInformation}</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{t.cashierLabel}</span>
                <span className="text-gray-900">Sistem Yöneticisi</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{t.cashRegisterLabel}</span>
                <span className="text-gray-900">KASA #1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{t.dateLabel}</span>
                <span className="text-gray-900">{new Date().toLocaleDateString('tr-TR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{t.timeLabel}</span>
                <span className="text-gray-900">{new Date().toLocaleTimeString('tr-TR')}</span>
              </div>
            </div>
          </div>

          {/* Sayım Yöntemi Seçimi */}
          <div className="flex gap-0 mb-4">
            <button
              onClick={() => setShowDenominationCounter(false)}
              className={`flex-1 px-4 py-2.5 text-sm transition-all border-b-2 ${
                !showDenominationCounter
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t.manualEntry}
            </button>
            <button
              onClick={() => setShowDenominationCounter(true)}
              className={`flex-1 px-4 py-2.5 text-sm transition-all border-b-2 ${
                showDenominationCounter
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t.banknoteCount}
            </button>
          </div>

          {/* Manuel Giriş */}
          {!showDenominationCounter ? (
            <div className="bg-white border border-gray-300 p-6 mb-4">
              <h4 className="text-sm text-gray-900 mb-3">{t.openingCashAmount}</h4>
              <input
                type="text"
                value={openingCash}
                onChange={(e) => {
                  const formatted = formatNumberInput(e.target.value);
                  setOpeningCash(formatted);
                }}
                onBlur={(e) => {
                  const formatted = formatNumberOnBlur(e.target.value);
                  if (formatted) {
                    setOpeningCash(formatted);
                  }
                }}
                placeholder="0"
                className="w-full px-4 py-6 text-4xl border border-gray-300 focus:outline-none focus:border-blue-500 text-center text-gray-400"
              />
            </div>
          ) : (
            /* Banknot Sayımı */
            <div className="bg-white border border-gray-300 p-4 max-h-80 overflow-y-auto mb-4">
              <h4 className="text-sm text-gray-900 mb-3">{t.banknoteAndCoinCount}</h4>
              <div className="space-y-2">
                {denominations.map((denom, index) => (
                  <div key={denom.value} className="flex items-center gap-2">
                    <div className="w-20 text-sm text-center py-1 bg-green-100 text-green-800">
                      {denom.value}
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={denom.count === 0 ? '' : denom.count}
                      placeholder="0"
                      onFocus={(e) => {
                        e.target.select();
                      }}
                      onChange={(e) => handleDenominationChange(index, parseInt(e.target.value) || 0)}
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 focus:outline-none focus:border-blue-600 text-center"
                    />
                    <div className="w-28 text-sm text-right">
                      {formatNumber(denom.value * denom.count)}
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-300 flex justify-between">
                  <span>{t.totalLabel}</span>
                  <span>{formatNumber(actualCash)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Açılış Tutarı Gösterge */}
          <div className="bg-green-50 border border-green-500 p-4 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-900">{t.openingCashRegister}</span>
              <span className="text-3xl text-green-700">
                {formatNumber(actualCash)}
              </span>
            </div>
            <p className="text-xs text-green-700 mt-2">
              {t.openingCashDescription}
            </p>
          </div>

          {/* Not Alanı */}
          <div className="bg-white border border-gray-300 p-4">
            <h4 className="text-sm text-gray-900 mb-2">{t.noteOptional}</h4>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.cashOpeningNotePlaceholder}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:border-blue-500 placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Footer - Actions */}
        <div className="p-4 border-t border-gray-300 bg-gray-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleOpenCashRegister}
            className="flex-1 px-6 py-3 text-sm bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            {t.openCashRegister}
          </button>
        </div>
      </div>
    </div>
  );
}
