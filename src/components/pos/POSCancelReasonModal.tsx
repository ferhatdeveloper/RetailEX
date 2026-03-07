import { X, FileX } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

interface POSCancelReasonModalProps {
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export function POSCancelReasonModal({ onConfirm, onClose }: POSCancelReasonModalProps) {
  const { t } = useLanguage();
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const reasons = [
    t.customerChangedMind,
    t.wrongProductAdded,
    t.priceProblem,
    t.paymentFailed,
    t.systemError,
    t.other
  ];

  const handleConfirm = () => {
    if (!selectedReason) {
      alert(t.pleaseSelectCancelReason);
      return;
    }

    if (selectedReason === t.other && !customReason.trim()) {
      alert(t.pleaseExplainCancelReason);
      return;
    }

    const finalReason = selectedReason === t.other ? customReason : selectedReason;
    onConfirm(finalReason);
  };

  // Keyboard listener
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const key = e.key;
      if (key >= '1' && key <= '6') {
        const index = parseInt(key) - 1;
        if (index < reasons.length) {
          setSelectedReason(reasons[index]);
        }
      } else if (key === 'Enter' && selectedReason) {
        handleConfirm();
      } else if (key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedReason, customReason]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="p-3 border-b border-gray-300 flex items-center justify-between bg-gradient-to-r from-red-600 to-red-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <FileX className="w-5 h-5" />
            {t.cancelReceiptTitle}
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3">
          {reasons.map((reason, index) => (
            <button
              key={reason}
              onClick={() => setSelectedReason(reason)}
              className={`w-full p-3 text-left border transition-all relative ${
                selectedReason === reason
                  ? 'border-red-600 bg-red-50 text-red-900'
                  : 'border-gray-300 bg-white hover:border-red-400 hover:bg-red-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 flex items-center justify-center border text-xs ${
                  selectedReason === reason 
                    ? 'bg-red-600 text-white border-red-600' 
                    : 'bg-gray-100 text-gray-600 border-gray-300'
                }`}>
                  {index + 1}
                </div>
                <span className="text-sm">{reason}</span>
              </div>
            </button>
          ))}

          {selectedReason === t.other && (
            <div className="mt-3">
              <label className="block text-sm text-gray-700 mb-2">{t.explainCancelReason}:</label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder={t.cancelReasonPlaceholder}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-300 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
          >
            {t.giveUp}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedReason || (selectedReason === t.other && !customReason.trim())}
            className="flex-1 px-4 py-2.5 text-sm border border-red-600 bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t.cancelReceipt}
          </button>
        </div>
      </div>
    </div>
  );
}


