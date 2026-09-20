import { useMemo, useState } from 'react';
import { X, User, Search, Truck, Plus, Loader2, ExternalLink } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { phoneMatchesQuery } from '../../../shared/utils/validators';
import { navigateToManagementScreen } from '../../../utils/navigateToManagementScreen';

export type InvoiceCariItem = {
  id: string;
  code?: string;
  name: string;
  phone?: string;
  email?: string;
};

interface InvoiceCariSelectModalProps {
  mode: 'customer' | 'supplier';
  items: InvoiceCariItem[];
  selectedId?: string;
  onSelect: (item: InvoiceCariItem | null) => void;
  onClose: () => void;
  onCreate?: (payload: { name: string; phone?: string }) => Promise<InvoiceCariItem | null>;
}

export function InvoiceCariSelectModal({
  mode,
  items,
  selectedId,
  onSelect,
  onClose,
  onCreate,
}: InvoiceCariSelectModalProps) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const isCustomer = mode === 'customer';
  const [searchTerm, setSearchTerm] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('tr-TR');
    if (!term) return items;
    const raw = searchTerm.trim();
    return items.filter((item) => {
      const code = (item.code || '').toLocaleLowerCase('tr-TR');
      const name = (item.name || '').toLocaleLowerCase('tr-TR');
      const phone = (item.phone || '').toLocaleLowerCase('tr-TR');
      const email = (item.email || '').toLocaleLowerCase('tr-TR');
      const textHit = code.includes(term) || name.includes(term) || phone.includes(term) || email.includes(term);
      if (textHit) return true;
      return phoneMatchesQuery(item.phone, raw);
    });
  }, [items, searchTerm]);

  const headerGradient = isCustomer ? 'from-blue-600 to-blue-700' : 'from-teal-600 to-teal-700';
  const accentBorder = darkMode
    ? isCustomer
      ? 'border-blue-500 bg-blue-900/40'
      : 'border-teal-500 bg-teal-900/40'
    : isCustomer
      ? 'border-blue-500 bg-blue-50'
      : 'border-teal-500 bg-teal-50';
  const hoverBorder = darkMode
    ? isCustomer
      ? 'hover:border-blue-500 hover:bg-blue-900/25'
      : 'hover:border-teal-500 hover:bg-teal-900/25'
    : isCustomer
      ? 'hover:border-blue-500 hover:bg-blue-50'
      : 'hover:border-teal-500 hover:bg-teal-50';
  const cardTitle = darkMode ? 'text-white' : 'text-gray-900';
  const cardSub = darkMode ? 'text-gray-300' : 'text-gray-600';
  const cardMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const idleBorder = darkMode ? 'border-gray-600' : 'border-gray-300';
  const inputCls = darkMode
    ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder:text-gray-500'
    : 'bg-white border-gray-300 text-gray-900';

  const manageScreen = isCustomer ? 'customers' : 'suppliers';
  const manageLabel = isCustomer ? tm('openCustomerManagement') : tm('openCariManagement');

  const goToManagement = () => {
    onClose();
    navigateToManagementScreen(manageScreen);
  };

  const handleQuickCreate = async () => {
    const name = quickName.trim();
    if (!name || !onCreate) return;
    setCreating(true);
    try {
      const created = await onCreate({ name, phone: quickPhone.trim() || undefined });
      if (created) {
        onSelect(created);
        onClose();
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <PercentBodyModal
      onClose={onClose}
      size="list"
      ariaLabel={isCustomer ? tm('selectMusteri') : tm('selectTedarikci')}
      shellClassName={darkMode ? 'bg-gray-900 text-gray-100' : ''}
    >
      <div
        className={`p-3 border-b flex items-center justify-between shrink-0 bg-gradient-to-r ${headerGradient} ${
          darkMode ? 'border-gray-700' : 'border-gray-200'
        }`}
      >
        <h3 className="text-base text-white flex items-center gap-2 font-semibold">
          {isCustomer ? <User className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
          {isCustomer ? tm('selectMusteri') : tm('selectTedarikci')}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToManagement}
            className="text-white/90 hover:text-white hover:bg-white/10 px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1"
            title={manageLabel}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {tm('pickerManagePage')}
          </button>
          <button type="button" onClick={onClose} className="text-white hover:text-gray-200 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className={`p-4 border-b shrink-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          <input
            type="text"
            placeholder={tm('cariSelectSearchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 ${inputCls}`}
            autoFocus
          />
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-4">
        {filtered.length === 0 && !showQuickAdd ? (
          <div className={`text-center py-10 ${cardMuted}`}>
            {isCustomer ? <User className="w-12 h-12 mx-auto mb-2 opacity-40" /> : <Truck className="w-12 h-12 mx-auto mb-2 opacity-40" />}
            <p className="text-sm font-medium">{tm('noRecordFound')}</p>
            {onCreate && (
              <button
                type="button"
                onClick={() => setShowQuickAdd(true)}
                className={`mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg border-2 border-dashed ${
                  darkMode
                    ? 'text-blue-300 border-blue-600 hover:bg-blue-900/30'
                    : 'text-blue-700 border-blue-300 hover:bg-blue-50'
                }`}
              >
                <Plus className="w-4 h-4" />
                {isCustomer ? tm('addNewCustomerCari') : tm('addNewSupplierCari')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
              className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                !selectedId ? accentBorder : `${idleBorder} ${hoverBorder}`
              }`}
            >
              <div className="flex items-center justify-between">
                <p className={`font-medium ${cardTitle}`}>{tm('cariSelectNone')}</p>
                {!selectedId && (
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isCustomer ? 'border-blue-600' : 'border-teal-600'
                    }`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full ${isCustomer ? 'bg-blue-600' : 'bg-teal-600'}`} />
                  </div>
                )}
              </div>
            </button>

            {filtered.map((item) => {
              const selected = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                    selected ? accentBorder : `${idleBorder} ${hoverBorder}`
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${cardTitle}`}>{item.name}</p>
                      <p className={`text-sm ${cardSub}`}>
                        {tm('code')}: {item.code || '—'}
                      </p>
                      {(item.phone || item.email) && (
                        <div className="mt-1 space-y-0.5">
                          {item.phone && (
                            <p className={`text-xs ${cardMuted}`}>
                              {tm('phoneLabel')}: {item.phone}
                            </p>
                          )}
                          {item.email && (
                            <p className={`text-xs truncate ${cardMuted}`}>
                              {tm('emailLabel')}: {item.email}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    {selected && (
                      <div
                        className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                          isCustomer ? 'border-blue-600' : 'border-teal-600'
                        }`}
                      >
                        <div className={`w-2.5 h-2.5 rounded-full ${isCustomer ? 'bg-blue-600' : 'bg-teal-600'}`} />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </PercentBodyModalScrollBody>

      <div
        className={`px-4 pb-3 border-t pt-3 shrink-0 ${
          darkMode ? 'border-gray-700 bg-gray-900/80' : 'border-gray-100 bg-gray-50/80'
        }`}
      >
        {showQuickAdd && onCreate ? (
          <div className="space-y-2">
            <input
              type="text"
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder={`${tm('currentAccountTitle')} *`}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 ${inputCls}`}
            />
            <input
              type="tel"
              value={quickPhone}
              onChange={(e) => setQuickPhone(e.target.value)}
              placeholder={tm('phoneLabel')}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 ${inputCls}`}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={creating || !quickName.trim()}
                onClick={() => void handleQuickCreate()}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {tm('add')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowQuickAdd(false);
                  setQuickName('');
                  setQuickPhone('');
                }}
                className={`px-4 py-2 border rounded-lg text-sm ${
                  darkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300'
                }`}
              >
                {tm('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {onCreate && (
              <button
                type="button"
                onClick={() => setShowQuickAdd(true)}
                className={`flex-1 py-2.5 border-2 border-dashed rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
                  darkMode
                    ? 'border-blue-600 text-blue-300 hover:bg-blue-900/30 bg-gray-800'
                    : 'border-blue-300 text-blue-700 hover:bg-blue-50 bg-white'
                }`}
              >
                <Plus className="w-4 h-4" />
                {isCustomer ? tm('addNewCustomerCari') : tm('addNewSupplierCari')}
              </button>
            )}
            <button
              type="button"
              onClick={goToManagement}
              className={`px-3 py-2.5 border rounded-lg text-sm font-medium inline-flex items-center gap-1.5 ${
                onCreate ? '' : 'flex-1 justify-center'
              } ${
                darkMode
                  ? 'border-gray-600 text-gray-200 hover:bg-gray-800'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100 bg-white'
              }`}
              title={manageLabel}
            >
              <ExternalLink className="w-4 h-4" />
              {tm('pickerManagePage')}
            </button>
          </div>
        )}
      </div>

      <div className={`p-4 border-t shrink-0 ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
        <button
          type="button"
          onClick={onClose}
          className={`w-full px-4 py-2 text-sm rounded-lg transition-colors font-medium ${
            darkMode
              ? 'bg-gray-700 text-gray-100 hover:bg-gray-600'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {tm('cancel')}
        </button>
      </div>
    </PercentBodyModal>
  );
}
