import { Users, Search, Phone, Mail, MapPin, Plus, CreditCard, Wallet } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import type { Customer } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supplierAPI } from '../../services/api/suppliers';
import { FullscreenBodyPortal, MODAL_OVERLAY_Z } from '../shared/FullscreenBodyPortal';
import {
  POS_CUSTOMER_MODAL_PORTAL_CLASS,
  POS_CUSTOMER_MODAL_SHELL,
  POS_MODAL_HEADER,
} from './posUiConstants';

interface POSCustomerModalProps {
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer | null, paymentType?: 'cash' | 'credit') => void;
  onClose: () => void;
  allowPaymentTypeSelection?: boolean;
  /** Caller ID vb. ile arama kutusunu doldurur */
  initialSearchQuery?: string;
}

export function POSCustomerModal({
  customers,
  selectedCustomer,
  onSelect,
  onClose,
  allowPaymentTypeSelection = false,
  initialSearchQuery = ''
}: POSCustomerModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPaymentType, setSelectedPaymentType] = useState<'cash' | 'credit'>('cash');
  const [accountCards, setAccountCards] = useState<Customer[]>([]);
  const { t } = useLanguage();
  const { darkMode } = useTheme();

  useEffect(() => {
    if (initialSearchQuery) {
      setSearchTerm(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    const loadAccountCards = async () => {
      try {
        const allAccounts = await supplierAPI.getAll();
        const mapped: Customer[] = allAccounts.map((acc) => ({
          id: acc.id,
          code: acc.code,
          name: acc.name || '',
          phone: acc.phone || '',
          phone2: acc.phone2 || '',
          email: acc.email || '',
          address: acc.address || '',
          city: acc.city,
          district: acc.district,
          postal_code: acc.postal_code,
          country: acc.country,
          balance: acc.balance || 0,
          totalPurchases: 0,
          lastPurchase: '',
          cardType: acc.cardType || 'customer',
        }));
        setAccountCards(mapped);
      } catch (err) {
        console.error('[POSCustomerModal] cari hesaplar yüklenemedi:', err);
      }
    };

    void loadAccountCards();
  }, []);

  const mergedCustomers = useMemo(() => {
    const merged = [...customers];
    accountCards.forEach((acc) => {
      if (!merged.some((c) => c.id === acc.id)) merged.push(acc);
    });
    return merged;
  }, [customers, accountCards]);

  const digitsOnly = (s: string) => s.replace(/\D/g, '');

  const filteredCustomers = useMemo(() => {
    const q = searchTerm.trim();
    const qLower = q.toLocaleLowerCase('tr-TR');
    const qDigits = digitsOnly(q);
    return mergedCustomers.filter((customer) => {
      const nameHit = customer.name.toLocaleLowerCase('tr-TR').includes(qLower);
      const mailHit = customer.email?.toLocaleLowerCase('tr-TR').includes(qLower);
      const p1 = customer.phone || '';
      const p2 = customer.phone2 || '';
      const subHit =
        p1.toLowerCase().includes(q.toLowerCase()) ||
        p2.toLowerCase().includes(q.toLowerCase());
      if (!qDigits || qDigits.length < 7) {
        return nameHit || mailHit || subHit;
      }
      const d1 = digitsOnly(p1);
      const d2 = digitsOnly(p2);
      const digitHit =
        (d1 && (d1.includes(qDigits) || qDigits.includes(d1) || d1.slice(-10) === qDigits.slice(-10))) ||
        (d2 && (d2.includes(qDigits) || qDigits.includes(d2) || d2.slice(-10) === qDigits.slice(-10)));
      return nameHit || mailHit || subHit || digitHit;
    });
  }, [mergedCustomers, searchTerm]);

  /** Arama sonucu varken üst kutuyu «seçili» gösterme; yalnızca boş sonuç / boş aramada müşterisiz vurgusu */
  const highlightNoCustomerRow =
    !selectedCustomer &&
    (searchTerm.trim() === '' || filteredCustomers.length === 0);

  /** Tek net eşleşmede üst seviyeye seçimi ilet (modal açık kalır) */
  useEffect(() => {
    const q = searchTerm.trim();
    if (q.length < 4 || filteredCustomers.length !== 1) return;
    const only = filteredCustomers[0];
    if (selectedCustomer?.id === only.id) return;
    onSelect(only, allowPaymentTypeSelection ? selectedPaymentType : undefined);
  }, [
    searchTerm,
    filteredCustomers,
    selectedCustomer?.id,
    allowPaymentTypeSelection,
    selectedPaymentType,
    onSelect,
  ]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleOpenCurrentAccountCreateModal = () => {
    const phone = searchTerm.trim();
    localStorage.setItem('callerid_customer_phone', phone);
    window.dispatchEvent(
      new CustomEvent('open-cari-account-create-modal', {
        detail: {
          phone,
          forceCreate: true,
        },
      })
    );
    onClose();
  };

  return (
    <FullscreenBodyPortal
      zIndex={MODAL_OVERLAY_Z}
      className={POS_CUSTOMER_MODAL_PORTAL_CLASS}
      role="dialog"
      aria-modal
      aria-label={t.selectCustomerTitle}
      onClick={onClose}
    >
      <div
        className={POS_CUSTOMER_MODAL_SHELL(darkMode)}
        style={{
          width: 'min(92vw, 56rem)',
          height: 'min(85vh, calc(100dvh - 2rem))',
          maxHeight: 'calc(100dvh - 2rem)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={POS_MODAL_HEADER}>
          <h3 className="text-base text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            {t.selectCustomerTitle}
          </h3>
        </div>

        {/* Search */}
        <div className={`p-4 border-b shrink-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="relative">
            <Search className={`w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              placeholder={t.customerSearchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 border rounded focus:outline-none ${
                darkMode 
                  ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500 focus:border-[var(--asin-accent,#1FA8A0)]' 
                  : 'bg-white border-gray-300 focus:border-[var(--asin-accent,#1FA8A0)]'
              }`}
              autoFocus
            />
          </div>
        </div>

        {/* Müşterisiz satış — sabit */}
        <div className={`px-4 pt-4 shrink-0 ${darkMode ? '' : ''}`}>
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            className={`w-full p-4 rounded border-2 transition-all text-left ${
              highlightNoCustomerRow
                ? darkMode ? 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-primary,#0E2433)]/40' : 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)]'
                : darkMode ? 'border-gray-700 bg-gray-800 hover:border-gray-600' : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t.noCustomerSale}</h4>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t.noCustomerSaleDescription}</p>
              </div>
              {highlightNoCustomerRow && (
                <div className="text-[var(--asin-accent,#1FA8A0)]">
                  <div className="w-5 h-5 rounded-full border-2 border-[var(--asin-accent,#1FA8A0)] flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--asin-accent,#1FA8A0)]" />
                  </div>
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Müşteri listesi — kaydırılabilir */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 [scrollbar-gutter:stable]">
          <div className="grid gap-3">
            {filteredCustomers.length === 0 ? (
              <div className={`text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t.customerNotFound}</p>
              </div>
            ) : (
              filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => {
                    onSelect(customer, allowPaymentTypeSelection ? selectedPaymentType : undefined);
                    onClose();
                  }}
                  className={`p-4 rounded border-2 transition-all text-left ${
                    selectedCustomer?.id === customer.id
                      ? darkMode ? 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-primary,#0E2433)]/40' : 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)]'
                      : darkMode ? 'border-gray-700 bg-gray-800 hover:border-gray-600' : 'border-gray-200 bg-white hover:border-[var(--asin-accent,#1FA8A0)]/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className={darkMode ? 'text-white' : 'text-gray-900'}>{customer.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          customer.cardType === 'supplier'
                            ? darkMode ? 'bg-orange-900/40 text-orange-300' : 'bg-orange-100 text-orange-700'
                            : darkMode ? 'bg-[var(--asin-primary,#0E2433)]/40 text-[var(--asin-accent-muted,#D5F0EE)]' : 'bg-[var(--asin-accent-muted,#D5F0EE)] text-[var(--asin-primary,#0E2433)]'
                        }`}>
                          {customer.cardType === 'supplier' ? 'Tedarikçi' : 'Müşteri'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                          {customer.company?.trim() ? t.corporate : t.individual}
                        </span>
                      </div>
                      
                      <div className={`grid grid-cols-2 gap-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {customer.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className={`w-3.5 h-3.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                            <span>{customer.phone}</span>
                          </div>
                        )}
                        {customer.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className={`w-3.5 h-3.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                            <span className="truncate">{customer.email}</span>
                          </div>
                        )}
                        {customer.address && (
                          <div className="flex items-center gap-1.5 col-span-2">
                            <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                            <span className="truncate">{customer.address}</span>
                          </div>
                        )}
                      </div>

                      {customer.totalPurchases > 0 && (
                        <div className={`mt-2 pt-2 border-t flex items-center gap-4 text-xs ${darkMode ? 'border-gray-700 text-gray-500' : 'border-gray-200 text-gray-500'}`}>
                          <span>{t.totalPurchases}: {customer.totalPurchases.toFixed(2)}</span>
                          <span>{t.lastPurchase}: {customer.lastPurchase ? new Date(customer.lastPurchase).toLocaleDateString('tr-TR') : '-'}</span>
                        </div>
                      )}
                    </div>
                    {selectedCustomer?.id === customer.id && (
                      <div className="text-[var(--asin-accent,#1FA8A0)] ml-3">
                        <div className="w-5 h-5 rounded-full border-2 border-[var(--asin-accent,#1FA8A0)] flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-[var(--asin-accent,#1FA8A0)]" />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`px-4 py-3 border-t shrink-0 ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'} space-y-3`}>
          {/* Payment Type Selection */}
          {allowPaymentTypeSelection && selectedCustomer && (
            <div className="bg-[var(--asin-accent-muted,#D5F0EE)] border border-[var(--asin-accent,#1FA8A0)]/40 p-3 rounded-lg">
              <h4 className="text-sm font-medium text-[var(--asin-primary,#0E2433)] mb-2">Ödeme Türü Seçin</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedPaymentType('cash')}
                  className={`px-4 py-2.5 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                    selectedPaymentType === 'cash'
                      ? 'border-green-600 bg-green-50 text-green-900'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                  }`}
                >
                  <Wallet className="w-5 h-5" />
                  <span className="font-medium">Nakit</span>
                </button>
                <button
                  onClick={() => setSelectedPaymentType('credit')}
                  className={`px-4 py-2.5 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                    selectedPaymentType === 'credit'
                      ? 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)] text-[var(--asin-primary,#0E2433)]'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-[var(--asin-accent,#1FA8A0)]'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="font-medium">Veresiye</span>
                </button>
              </div>
              <p className="text-xs text-[var(--asin-primary,#0E2433)] mt-2">
                {selectedPaymentType === 'cash' 
                  ? 'Satış nakit olarak kapatılacak' 
                  : 'Satış müşterinin cari hesabına veresiye olarak işlenecek'}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleOpenCurrentAccountCreateModal}
              className="px-4 py-2 text-sm rounded bg-[var(--asin-accent,#1FA8A0)] text-white hover:bg-[#178f88] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t.newCustomer}
            </button>
            <button
              onClick={onClose}
              className={`px-4 py-2 text-sm rounded border transition-colors ${
                darkMode 
                  ? 'border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600' 
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t.close}
            </button>
          </div>
        </div>
      </div>
    </FullscreenBodyPortal>
  );
}
