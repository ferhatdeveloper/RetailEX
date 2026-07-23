import { useMemo, useState } from 'react';
import { X, User, Search, Truck, Plus, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';

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
  const isCustomer = mode === 'customer';
  const [searchTerm, setSearchTerm] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('tr-TR');
    if (!term) return items;
    return items.filter((item) => {
      const code = (item.code || '').toLocaleLowerCase('tr-TR');
      const name = (item.name || '').toLocaleLowerCase('tr-TR');
      const phone = (item.phone || '').toLocaleLowerCase('tr-TR');
      const email = (item.email || '').toLocaleLowerCase('tr-TR');
      return code.includes(term) || name.includes(term) || phone.includes(term) || email.includes(term);
    });
  }, [items, searchTerm]);

  const headerGradient = isCustomer ? 'from-[var(--asin-primary,#0E2433)] to-[var(--asin-primary,#0E2433)]' : 'from-teal-600 to-teal-700';
  const accentBorder = isCustomer ? 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)]' : 'border-teal-500 bg-teal-50';
  const hoverBorder = isCustomer ? 'hover:border-[var(--asin-accent,#1FA8A0)] hover:bg-[var(--asin-accent-muted,#D5F0EE)]' : 'hover:border-teal-500 hover:bg-teal-50';

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
    >
      <div className={`p-3 border-b border-gray-200 flex items-center justify-between shrink-0 bg-gradient-to-r ${headerGradient}`}>
          <h3 className="text-base text-white flex items-center gap-2 font-semibold">
            {isCustomer ? <User className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
            {isCustomer ? tm('selectMusteri') : tm('selectTedarikci')}
          </h3>
          <button type="button" onClick={onClose} className="text-white hover:text-gray-200 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={tm('cariSelectSearchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-[var(--asin-accent,#1FA8A0)] focus:ring-1 focus:ring-[var(--asin-accent,#1FA8A0)]"
              autoFocus
            />
          </div>
        </div>

        <PercentBodyModalScrollBody className="p-4">
          {filtered.length === 0 && !showQuickAdd ? (
            <div className="text-center py-10 text-gray-500">
              {isCustomer ? <User className="w-12 h-12 mx-auto mb-2 opacity-40" /> : <Truck className="w-12 h-12 mx-auto mb-2 opacity-40" />}
              <p className="text-sm font-medium">{tm('noRecordFound')}</p>
              {onCreate && (
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-[var(--asin-primary,#0E2433)] border-2 border-dashed border-[var(--asin-accent,#1FA8A0)]/50 rounded-lg hover:bg-[var(--asin-accent-muted,#D5F0EE)]"
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
                  !selectedId ? accentBorder : `border-gray-300 ${hoverBorder}`
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{tm('cariSelectNone')}</p>
                  {!selectedId && (
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isCustomer ? 'border-[var(--asin-accent,#1FA8A0)]' : 'border-teal-600'}`}>
                      <div className={`w-2.5 h-2.5 rounded-full ${isCustomer ? 'bg-[var(--asin-accent,#1FA8A0)]' : 'bg-teal-600'}`} />
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
                      selected ? accentBorder : `border-gray-300 ${hoverBorder}`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{item.name}</p>
                        <p className="text-sm text-gray-600">
                          {tm('code')}: {item.code || '—'}
                        </p>
                        {(item.phone || item.email) && (
                          <div className="mt-1 space-y-0.5">
                            {item.phone && (
                              <p className="text-xs text-gray-500">
                                {tm('phoneLabel')}: {item.phone}
                              </p>
                            )}
                            {item.email && (
                              <p className="text-xs text-gray-500 truncate">
                                {tm('emailLabel')}: {item.email}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      {selected && (
                        <div className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center mt-0.5 ${isCustomer ? 'border-[var(--asin-accent,#1FA8A0)]' : 'border-teal-600'}`}>
                          <div className={`w-2.5 h-2.5 rounded-full ${isCustomer ? 'bg-[var(--asin-accent,#1FA8A0)]' : 'bg-teal-600'}`} />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </PercentBodyModalScrollBody>

        {onCreate && (
          <div className="px-4 pb-3 border-t border-gray-100 pt-3 bg-gray-50/80 shrink-0">
            {showQuickAdd ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder={`${tm('currentAccountTitle')} *`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--asin-accent,#1FA8A0)]"
                />
                <input
                  type="tel"
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  placeholder={tm('phoneLabel')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--asin-accent,#1FA8A0)]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={creating || !quickName.trim()}
                    onClick={() => void handleQuickCreate()}
                    className="flex-1 py-2 bg-[var(--asin-accent,#1FA8A0)] text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
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
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                  >
                    {tm('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowQuickAdd(true)}
                className="w-full py-2.5 border-2 border-dashed border-[var(--asin-accent,#1FA8A0)]/50 text-[var(--asin-primary,#0E2433)] rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-[var(--asin-accent-muted,#D5F0EE)] bg-white"
              >
                <Plus className="w-4 h-4" />
                {isCustomer ? tm('addNewCustomerCari') : tm('addNewSupplierCari')}
              </button>
            )}
          </div>
        )}

        <div className="p-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            {tm('cancel')}
          </button>
        </div>
    </PercentBodyModal>
  );
}
