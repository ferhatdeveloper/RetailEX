import { X, CreditCard, Wallet, Banknote, Building2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { dbPaymentMethodToFormCode } from '../../../utils/paymentMethodUtils';
import { PercentBodyModal } from '../../shared/PercentBodyModal';

interface PaymentMethod {
  code: string;
  nameKey: string;
  icon: typeof CreditCard;
}

interface InvoicePaymentInfoModalProps {
  currentPaymentMethod: string;
  onSelect: (method: string) => void;
  onClose: () => void;
  /** Perakende POS: yalnızca nakit / kart */
  retailPosMode?: boolean;
}

export function InvoicePaymentInfoModal({
  currentPaymentMethod,
  onSelect,
  onClose,
  retailPosMode = false,
}: InvoicePaymentInfoModalProps) {
  const { tm } = useLanguage();
  const initialCode =
    dbPaymentMethodToFormCode(currentPaymentMethod) || currentPaymentMethod || 'ACIK_CARI';
  const [selectedMethod, setSelectedMethod] = useState(initialCode);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setSelectedMethod(
      dbPaymentMethodToFormCode(currentPaymentMethod) || currentPaymentMethod || 'ACIK_CARI',
    );
  }, [currentPaymentMethod]);

  const paymentMethods: PaymentMethod[] = useMemo(
    () => {
      const all: PaymentMethod[] = [
        { code: 'NAKIT', nameKey: 'paymentCash', icon: Banknote },
        { code: 'KREDIKARTI', nameKey: 'paymentCreditCard', icon: CreditCard },
        { code: 'ACIK_CARI', nameKey: 'paymentOpenAccount', icon: Users },
        { code: 'HAVAL', nameKey: 'paymentTransfer', icon: Building2 },
        { code: 'CEK', nameKey: 'paymentCheck', icon: Wallet },
        { code: 'SENET', nameKey: 'paymentPromissory', icon: CreditCard },
      ];
      return retailPosMode
        ? all.filter((m) => m.code === 'NAKIT' || m.code === 'KREDIKARTI' || m.code === 'ACIK_CARI')
        : all;
    },
    [retailPosMode],
  );

  const handleSave = () => {
    onSelect(selectedMethod || 'ACIK_CARI');
    onClose();
  };

  return (
    <PercentBodyModal onClose={onClose} size="compact" ariaLabel={tm('paymentInfo')}>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between shrink-0 bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {tm('paymentInfo')}
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{tm('paymentMethodLabel')}</label>
            <div className="mb-2 text-xs text-gray-500">{tm('paymentMethodOpenAccountHint')}</div>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <button
                    key={method.code}
                    onClick={() => setSelectedMethod(method.code)}
                    className={`px-4 py-3 border-2 rounded-lg text-left transition-all flex items-center gap-2 ${
                      selectedMethod === method.code
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    <Icon className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-900">{tm(method.nameKey)}</span>
                    {selectedMethod === method.code && (
                      <div className="ml-auto w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{tm('notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tm('paymentNotesPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            {tm('cancel')}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            {tm('save')}
          </button>
        </div>
    </PercentBodyModal>
  );
}
