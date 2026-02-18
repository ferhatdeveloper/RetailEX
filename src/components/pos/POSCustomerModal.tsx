import { X, Users, Search, UserCheck, Phone, Mail, MapPin, Plus, CreditCard, Wallet } from 'lucide-react';
import { useState } from 'react';
import type { Customer } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';

interface POSCustomerModalProps {
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer | null, paymentType?: 'cash' | 'credit') => void;
  onClose: () => void;
  allowPaymentTypeSelection?: boolean;
}

export function POSCustomerModal({
  customers,
  selectedCustomer,
  onSelect,
  onClose,
  allowPaymentTypeSelection = false
}: POSCustomerModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPaymentType, setSelectedPaymentType] = useState<'cash' | 'credit'>('cash');
  const { t } = useLanguage();
  const { darkMode } = useTheme();

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
        {/* Header */}
        <div className={`p-3 border-b flex items-center justify-between ${darkMode ? 'border-gray-700 bg-gradient-to-r from-gray-700 to-gray-600' : 'border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700'}`}>
          <h3 className="text-base text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            {t.selectCustomerTitle}
          </h3>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="relative">
            <Search className={`w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
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

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid gap-3">
            {/* No Customer Option */}
            <button
              onClick={() => {
                onSelect(null);
                onClose();
              }}
              className={`p-4 rounded border-2 transition-all text-left ${
                !selectedCustomer
                  ? darkMode ? 'border-blue-500 bg-blue-900/30' : 'border-blue-400 bg-blue-50'
                  : darkMode ? 'border-gray-700 bg-gray-800 hover:border-gray-600' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className={`mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t.noCustomerSale}</h4>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t.noCustomerSaleDescription}</p>
                </div>
                {!selectedCustomer && (
                  <div className="text-blue-600">
                    <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    </div>
                  </div>
                )}
              </div>
            </button>

            {/* Customer List */}
            {filteredCustomers.length === 0 ? (
              <div className={`text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t.customerNotFound}</p>
              </div>
            ) : (
              filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    onSelect(customer, allowPaymentTypeSelection ? selectedPaymentType : undefined);
                    onClose();
                  }}
                  className={`p-4 rounded border-2 transition-all text-left ${
                    selectedCustomer?.id === customer.id
                      ? darkMode ? 'border-blue-500 bg-blue-900/30' : 'border-blue-500 bg-blue-50'
                      : darkMode ? 'border-gray-700 bg-gray-800 hover:border-gray-600' : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className={darkMode ? 'text-white' : 'text-gray-900'}>{customer.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-xs ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                          {customer.type === 'individual' ? t.individual : t.corporate}
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
                          <span>{t.lastPurchase}: {customer.lastPurchaseDate ? new Date(customer.lastPurchaseDate).toLocaleDateString('tr-TR') : '-'}</span>
                        </div>
                      )}
                    </div>
                    {selectedCustomer?.id === customer.id && (
                      <div className="text-blue-600 ml-3">
                        <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
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
        <div className={`px-4 py-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} space-y-3`}>
          {/* Payment Type Selection */}
          {allowPaymentTypeSelection && selectedCustomer && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Ödeme Türü Seçin</h4>
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

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => {/* Add new customer modal */}}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
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
    </div>
  );
}
