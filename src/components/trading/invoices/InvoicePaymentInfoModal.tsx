import { X, CreditCard, Wallet, Banknote, Building2, Users, Plus, Trash2, ShoppingCart } from 'lucide-react';
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
  /**
   * Çoklu ödeme (Market POS pattern). Boşsa yalnızca tek-ödeme modu
   * kullanılır ve bilgiler paymentMethod / cashRegisterId alanlarından alınır.
   * Doluysa her satır bağımsız bir ödeme olarak işlenir; her biri kendi
   * yöntemini, tutarını, kasasını taşır. Tek-ödeme alanları geriye dönük
   * uyumluluk için ilk satırla doldurulur.
   */
  payments?: InvoicePaymentRow[];
}

export interface InvoicePaymentRow {
  method: string;
  amount: number;
  currency: 'IQD' | 'USD' | 'EUR';
  cashRegisterId: string | null;
  cashRegisterName?: string | null;
  cashRegisterCode?: string | null;
  /** Opsiyonel serbest not (Market POS'taki 'transactionId' karşılığı değil) */
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

  // Çoklu ödeme (Market POS pattern). enabled=true ise kullanıcı
  // birden fazla ödeme satırı ekleyebilir; false ise mevcut tek-ödeme
  // akışı korunur (geriye dönük uyumluluk).
  const [multiPaymentEnabled, setMultiPaymentEnabled] = useState(false);
  // Geçici "yeni satır" form state'i
  const [draftAmount, setDraftAmount] = useState('');
  const [draftMethod, setDraftMethod] = useState(initialCode);
  const [draftCurrency, setDraftCurrency] = useState<'IQD' | 'USD' | 'EUR'>('IQD');
  const [draftRegisterId, setDraftRegisterId] = useState<string>('');
  // Eklenen ödeme satırları
  const [addedPayments, setAddedPayments] = useState<InvoicePaymentRow[]>([]);

  useEffect(() => {
    setSelectedMethod(
      dbPaymentMethodToFormCode(currentPaymentMethod) || currentPaymentMethod || 'ACIK_CARI',
    );
    setDraftMethod(
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

  // Çoklu ödeme için "yeni satır ekle" — Market POS pattern.
  // Yalnızca kasa bağlantısı olan yöntemler (nakit / kart / havale / çek / senet)
  // kasaya yazılır; ACIK_CARI kasaya yansımaz (cari borç olarak işlenir).
  const parseAmount = (raw: string): number => {
    if (!raw) return 0;
    const s = String(raw).replace(/\./g, '').replace(/,/g, '.').trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  const handleAddPaymentRow = () => {
    const amount = parseAmount(draftAmount);
    if (amount <= 0) return;
    const method = draftMethod || 'NAKIT';
    const impliesCash = paymentMethodImpliesPaidNow(method);
    const regId = impliesCash
      ? draftRegisterId || cashRegisters[0]?.id || null
      : null;
    const reg = cashRegisters.find((k) => k.id === regId) || null;
    setAddedPayments((prev) => [
      ...prev,
      {
        method,
        amount,
        currency: draftCurrency,
        cashRegisterId: reg?.id || null,
        cashRegisterName: reg?.kasa_adi || null,
        cashRegisterCode: reg?.kasa_kodu || null,
      },
    ]);
    setDraftAmount('');
    // Sonraki satır için varsayılan: aynı yöntem + kasa, sıfır tutar.
    setDraftMethod(method);
    if (reg?.id) setDraftRegisterId(reg.id);
  };

  const handleRemovePaymentRow = (index: number) => {
    setAddedPayments((prev) => prev.filter((_, i) => i !== index));
  };

  // Çoklu ödeme taslak tutarı (referans para biriminde kabaca)
  const totalDraftAmount = useMemo(
    () => addedPayments.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0),
    [addedPayments],
  );

  const handleSave = () => {
    // Çoklu ödeme modu açıksa ve en az 1 satır eklendiyse, bu satırlar
    // birincil bilgi kaynağıdır. Tek-ödeme alanları (paymentMethod /
    // cashRegisterId) yalnızca geriye dönük uyumluluk için ilk satırdan
    // doldurulur — yeni createInvoice akışı payments[] dizisini kullanır.
    if (multiPaymentEnabled && addedPayments.length > 0) {
      const first = addedPayments[0];
      const method = first.method;
      onSelect(method, {
        paymentMethod: method,
        cashRegisterId: first.cashRegisterId || null,
        cashRegisterName: first.cashRegisterName || null,
        cashRegisterCode: first.cashRegisterCode || null,
        notes,
        payments: addedPayments,
      });
      onClose();
      return;
    }
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
    <PercentBodyModal onClose={onClose} size={multiPaymentEnabled ? 'list' : 'compact'} ariaLabel={tm('paymentInfo')}>
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

          {/* Çoklu ödeme (Market POS pattern) — opsiyonel */}
          <div className="mb-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={multiPaymentEnabled}
                onChange={(e) => {
                  setMultiPaymentEnabled(e.target.checked);
                  if (!e.target.checked) {
                    setAddedPayments([]);
                    setDraftAmount('');
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <ShoppingCart className="w-4 h-4 text-gray-500" />
              <span>{tm('multiplePaymentToggle') || 'Birden fazla ödeme yöntemi kullan'}</span>
            </label>

            {multiPaymentEnabled && (
              <div className="space-y-2">
                <div className="text-xs text-gray-500">
                  {tm('multiplePaymentHint') ||
                    'Birden fazla yöntemle ödeme alabilirsiniz (ör. yarısı nakit, yarısı kart). Her satır kendi kasasına yazılır.'}
                </div>

                {/* Eklenen ödemeler listesi */}
                {addedPayments.length > 0 && (
                  <div className="space-y-1">
                    {addedPayments.map((p, idx) => {
                      const regLabel = p.cashRegisterName
                        ? `${p.cashRegisterName}`
                        : '—';
                      const methodLabel =
                        paymentMethods.find((m) => m.code === p.method)?.nameKey
                          ? tm(paymentMethods.find((m) => m.code === p.method)!.nameKey)
                          : p.method;
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-medium text-gray-900 truncate">
                              {methodLabel}
                            </span>
                            <span className="text-gray-500">·</span>
                            <span className="font-mono font-semibold text-gray-900">
                              {p.amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {p.currency}
                            </span>
                            {paymentMethodImpliesPaidNow(p.method) && (
                              <>
                                <span className="text-gray-500">·</span>
                                <span className="text-emerald-700 truncate">{regLabel}</span>
                              </>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePaymentRow(idx)}
                            className="text-red-500 hover:text-red-700 shrink-0"
                            aria-label="Satırı sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    <div className="text-[11px] text-gray-600 text-right pt-1 border-t border-gray-200">
                      {tm('total') || 'Toplam'}: <span className="font-mono font-semibold">{totalDraftAmount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} IQD</span>
                    </div>
                  </div>
                )}

                {/* Yeni satır formu */}
                <div className="grid grid-cols-12 gap-2 pt-2 border-t border-gray-200">
                  <select
                    aria-label="Yöntem"
                    value={draftMethod}
                    onChange={(e) => setDraftMethod(e.target.value)}
                    className="col-span-4 px-2 py-1.5 text-xs border border-gray-300 rounded bg-white"
                  >
                    {paymentMethods.map((m) => (
                      <option key={m.code} value={m.code}>
                        {tm(m.nameKey)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    aria-label="Tutar"
                    value={draftAmount}
                    onChange={(e) => setDraftAmount(e.target.value)}
                    placeholder="0"
                    className="col-span-3 px-2 py-1.5 text-xs border border-gray-300 rounded text-right font-mono bg-white"
                  />
                  <select
                    aria-label="Para birimi"
                    value={draftCurrency}
                    onChange={(e) => setDraftCurrency(e.target.value as 'IQD' | 'USD' | 'EUR')}
                    className="col-span-2 px-2 py-1.5 text-xs border border-gray-300 rounded bg-white"
                  >
                    <option value="IQD">IQD</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                  {paymentMethodImpliesPaidNow(draftMethod) ? (
                    <select
                      aria-label="Kasa"
                      value={draftRegisterId}
                      onChange={(e) => setDraftRegisterId(e.target.value)}
                      disabled={cashRegistersLoading || cashRegisters.length === 0}
                      className="col-span-2 px-2 py-1.5 text-xs border border-gray-300 rounded bg-white"
                    >
                      <option value="">
                        {cashRegistersLoading ? '…' : tm('selectCashRegister') || 'Kasa seçin'}
                      </option>
                      {cashRegisters.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.kasa_adi}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="col-span-2" />
                  )}
                  <button
                    type="button"
                    onClick={handleAddPaymentRow}
                    disabled={parseAmount(draftAmount) <= 0}
                    className="col-span-1 px-2 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    aria-label="Ödeme ekle"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
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
