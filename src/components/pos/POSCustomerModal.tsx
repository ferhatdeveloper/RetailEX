import { Users, Search, Plus, CreditCard, Wallet, X } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import type { Customer } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supplierAPI } from '../../services/api/suppliers';
import { FullscreenBodyPortal, MODAL_OVERLAY_Z } from '../shared/FullscreenBodyPortal';
import {
  POS_MODAL_HEADER,
  POS_PERCENT_MODAL_PORTAL_CLASS,
  POS_PERCENT_MODAL_SHELL,
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
  initialSearchQuery = '',
}: POSCustomerModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPaymentType, setSelectedPaymentType] = useState<'cash' | 'credit'>('cash');
  const [accountCards, setAccountCards] = useState<Customer[]>([]);
  const { t, tm } = useLanguage();
  const { darkMode } = useTheme();
  const codeLabel = tm('code') === 'code' ? 'Kod' : tm('code');

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
      const codeHit = customer.code?.toLocaleLowerCase('tr-TR').includes(qLower);
      const p1 = customer.phone || '';
      const p2 = customer.phone2 || '';
      const subHit =
        p1.toLowerCase().includes(q.toLowerCase()) ||
        p2.toLowerCase().includes(q.toLowerCase());
      if (!qDigits || qDigits.length < 7) {
        return nameHit || mailHit || subHit || codeHit;
      }
      const d1 = digitsOnly(p1);
      const d2 = digitsOnly(p2);
      const digitHit =
        (d1 && (d1.includes(qDigits) || qDigits.includes(d1) || d1.slice(-10) === qDigits.slice(-10))) ||
        (d2 && (d2.includes(qDigits) || qDigits.includes(d2) || d2.slice(-10) === qDigits.slice(-10)));
      return nameHit || mailHit || subHit || codeHit || digitHit;
    });
  }, [mergedCustomers, searchTerm]);

  const highlightNoCustomerRow =
    !selectedCustomer &&
    (searchTerm.trim() === '' || filteredCustomers.length === 0);

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

  const handleOpenCurrentAccountCreateModal = () => {
    const phone = searchTerm.trim();
    localStorage.setItem('callerid_customer_phone', phone);
    window.dispatchEvent(
      new CustomEvent('open-cari-account-create-modal', {
        detail: {
          phone,
          forceCreate: true,
        },
      }),
    );
    onClose();
  };

  const mutedLabel = darkMode ? 'text-gray-500' : 'text-gray-500';
  const bodyText = darkMode ? 'text-gray-300' : 'text-gray-800';

  return (
    <FullscreenBodyPortal
      zIndex={MODAL_OVERLAY_Z}
      className={POS_PERCENT_MODAL_PORTAL_CLASS}
      role="dialog"
      aria-modal
      aria-label={t.selectCustomerTitle}
      onClick={onClose}
    >
      <div
        className={POS_PERCENT_MODAL_SHELL(darkMode)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${POS_MODAL_HEADER} justify-between`}>
          <h3 className="text-base text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            {t.selectCustomerTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors"
            aria-label={t.close}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={`p-4 border-b shrink-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="relative">
            <Search
              className={`w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}
            />
            <input
              type="text"
              placeholder={t.customerSearchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 border rounded focus:outline-none ${
                darkMode
                  ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500'
                  : 'bg-white border-gray-300 focus:border-blue-600'
              }`}
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
              className={`p-4 rounded-lg border transition-all text-left ${
                highlightNoCustomerRow
                  ? darkMode
                    ? 'border-blue-500 bg-blue-900/30'
                    : 'border-blue-400 bg-blue-50'
                  : darkMode
                    ? 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <h4 className={`font-semibold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {t.noCustomerSale}
              </h4>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {t.noCustomerSaleDescription}
              </p>
            </button>

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
                  className={`p-4 rounded-lg border transition-all text-left ${
                    selectedCustomer?.id === customer.id
                      ? darkMode
                        ? 'border-blue-500 bg-blue-900/30'
                        : 'border-blue-500 bg-blue-50'
                      : darkMode
                        ? 'border-gray-700 bg-gray-800 hover:border-gray-600'
                        : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <h4 className={`font-semibold mb-1.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {customer.name}
                  </h4>
                  {customer.code ? (
                    <p className={`text-sm ${bodyText}`}>
                      <span className={mutedLabel}>{codeLabel}:</span> {customer.code}
                    </p>
                  ) : null}
                  {customer.phone ? (
                    <p className={`text-sm ${bodyText}`}>
                      <span className={mutedLabel}>{t.phoneLabel}:</span> {customer.phone}
                    </p>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        <div
          className={`px-4 py-3 border-t shrink-0 ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'} space-y-3`}
        >
          {allowPaymentTypeSelection && selectedCustomer && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Ödeme Türü Seçin</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
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
                  type="button"
                  onClick={() => setSelectedPaymentType('credit')}
                  className={`px-4 py-2.5 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                    selectedPaymentType === 'credit'
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="font-medium">Veresiye</span>
                </button>
              </div>
              <p className="text-xs text-blue-700 mt-2">
                {selectedPaymentType === 'cash'
                  ? 'Satış nakit olarak kapatılacak'
                  : 'Satış müşterinin cari hesabına veresiye olarak işlenecek'}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleOpenCurrentAccountCreateModal}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t.newCustomer}
            </button>
            <button
              type="button"
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
