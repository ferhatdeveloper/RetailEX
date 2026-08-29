import { X, CreditCard, Wallet, Banknote, Building2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  dbPaymentMethodToFormCode,
  paymentMethodImpliesPaidNow,
} from '../../../utils/paymentMethodUtils';
import { PercentBodyModal } from '../../shared/PercentBodyModal';
import { fetchKasalar, type Kasa } from '../../../services/api/kasa';

interface PaymentMethod {
  code: string;
  nameKey: string;
  icon: typeof CreditCard;
}

export interface InvoicePaymentInfoSelection {
  paymentMethod: string;
  /** Nakit / kart seçildiğinde seçilen kasa ID'si (açık cari / veresiye için null) */
  cashRegisterId: string | null;
  cashRegisterName?: string | null;
  cashRegisterCode?: string | null;
  notes?: string;
}

interface InvoicePaymentInfoModalProps {
  currentPaymentMethod: string;
  /**
   * Eski çağrı biçimi: `onSelect(method: string)`.
   * Yeni imza: `onSelect(method, extra)` — extra.notes ve extra.cashRegister* alanlarını içerir.
   * Parent ikinci parametreyi kullanmıyorsa yalnızca method işlenir.
   */
  onSelect: (method: string, extra?: InvoicePaymentInfoSelection) => void;
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

  // Aktif kasalar — nakit / kart seçildiğinde kullanıcıya kasa seçtirilir
  const [cashRegisters, setCashRegisters] = useState<Kasa[]>([]);
  const [cashRegistersLoading, setCashRegistersLoading] = useState(false);
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<string>('');

  useEffect(() => {
    setSelectedMethod(
      dbPaymentMethodToFormCode(currentPaymentMethod) || currentPaymentMethod || 'ACIK_CARI',
    );
  }, [currentPaymentMethod]);

  // Aktif kasaları yükle
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
        // sessizce geç — kasa seçimi opsiyonel (uyarı konsola)
        // eslint-disable-next-line no-console
        console.warn('[InvoicePaymentInfoModal] fetchKasalar failed:', e);
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

  // Nakit / kart seçildiğinde varsayılan olarak listenin ilk kasa öğesi seçilir
  // (DB'ye ilk eklenen kasa — fetchKasalar created_at'e göre sıralı döner).
  // Anahtar kelime eşleşmesi (nakit/kart otomatik önerisi) kaldırıldı.
  const showCashRegisterPicker = paymentMethodImpliesPaidNow(selectedMethod);

  useEffect(() => {
    if (!showCashRegisterPicker) {
      setSelectedCashRegisterId('');
      return;
    }
    if (cashRegisters.length === 0) return;
    if (selectedCashRegisterId && cashRegisters.some((k) => k.id === selectedCashRegisterId)) return;
    // Varsayılan: listenin ilk öğesi (DB'ye ilk eklenmiş kasa)
    setSelectedCashRegisterId(cashRegisters[0]?.id || '');
  }, [selectedMethod, cashRegisters, selectedCashRegisterId, showCashRegisterPicker]);

  const selectedCashRegister = cashRegisters.find((k) => k.id === selectedCashRegisterId) || null;

  const handleSave = () => {
    const method = selectedMethod || 'ACIK_CARI';
    onSelect(method, {
      paymentMethod: method,
      cashRegisterId: showCashRegisterPicker ? selectedCashRegister?.id || null : null,
      cashRegisterName: showCashRegisterPicker ? selectedCashRegister?.kasa_adi || null : null,
      cashRegisterCode: showCashRegisterPicker ? selectedCashRegister?.kasa_kodu || null : null,
      notes,
    });
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <button
                    key={method.code}
                    onClick={() => setSelectedMethod(method.code)}
                    className={`w-full min-h-[60px] px-3 py-2.5 border-2 rounded-lg text-left transition-all flex items-center gap-2 ${
                      selectedMethod === method.code
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0 text-gray-600" />
                    <span className="font-medium text-gray-900 text-sm leading-tight break-words flex-1">
                      {tm(method.nameKey)}
                    </span>
                    {selectedMethod === method.code && (
                      <div className="ml-auto w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {showCashRegisterPicker && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {tm('cashRegisterLabel')}
              </label>
              <div className="mb-1 text-xs text-gray-500">
                {tm('cashRegisterSelectHint')}
              </div>
              <div className="relative">
                <select
                  aria-label={tm('cashRegisterLabel')}
                  value={selectedCashRegisterId}
                  onChange={(e) => setSelectedCashRegisterId(e.target.value)}
                  disabled={cashRegistersLoading || cashRegisters.length === 0}
                  className="w-full px-3 py-2 pr-9 border border-gray-300 rounded appearance-none bg-white focus:outline-none focus:border-blue-600 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {cashRegistersLoading
                      ? tm('loading')
                      : tm('selectCashRegister')}
                  </option>
                  {cashRegisters.map((k) => (
                    <option key={k.id} value={k.id}>
                      {`${k.kasa_adi} — ${k.kasa_kodu}`}
                    </option>
                  ))}
                </select>
                <svg
                  aria-hidden
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              {selectedCashRegister && (
                <p className="mt-1 text-[11px] text-gray-600">
                  {`${selectedCashRegister.kasa_adi} · ${selectedCashRegister.kasa_kodu}`}
                </p>
              )}
            </div>
          )}

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
