import { X, User, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import {
  listInvoiceSalespersons,
  type InvoicePickerMaster,
} from '../../../utils/invoiceDetailMasters';

interface InvoiceSalespersonModalProps {
  currentSalesperson: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

export function InvoiceSalespersonModal({ currentSalesperson, onSelect, onClose }: InvoiceSalespersonModalProps) {
  const { tm } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [salespersons, setSalespersons] = useState<InvoicePickerMaster[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listInvoiceSalespersons();
      if (!cancelled) {
        setSalespersons(rows);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSalespersons = useMemo(() => {
    if (!searchTerm.trim()) return salespersons;
    const term = searchTerm.toLocaleLowerCase('tr-TR');
    return salespersons.filter(
      (person) =>
        person.code.toLocaleLowerCase('tr-TR').includes(term) ||
        person.name.toLocaleLowerCase('tr-TR').includes(term) ||
        person.phone?.toLocaleLowerCase('tr-TR').includes(term) ||
        person.email?.toLocaleLowerCase('tr-TR').includes(term),
    );
  }, [searchTerm, salespersons]);

  const handleSelect = (code: string) => {
    onSelect(code);
    onClose();
  };

  return (
    <PercentBodyModal onClose={onClose} size="list" ariaLabel={tm('selectSalesperson')}>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between shrink-0 bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <User className="w-5 h-5" />
            {tm('selectSalesperson')}
          </h3>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={tm('searchSalespersonPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
              autoFocus
            />
          </div>
        </div>

        <PercentBodyModalScrollBody className="p-4">
          <div className="space-y-2">
            <button
              onClick={() => handleSelect('')}
              className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                !currentSalesperson
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              <p className="font-medium text-gray-900">{tm('salespersonNotSelected')}</p>
            </button>
            {loaded && filteredSalespersons.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{tm('invoicePickerNoRecords')}</p>
              </div>
            ) : (
              filteredSalespersons.map((person) => (
                <button
                  key={person.code}
                  onClick={() => handleSelect(person.code)}
                  className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                    currentSalesperson === person.code
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{person.name}</p>
                      <p className="text-sm text-gray-600">{tm('code')}: {person.code}</p>
                      {(person.phone || person.email) && (
                        <div className="flex flex-col gap-1 mt-1">
                          {person.phone && (
                            <p className="text-xs text-gray-500">{tm('phoneShort')}: {person.phone}</p>
                          )}
                          {person.email && (
                            <p className="text-xs text-gray-500">{tm('emailLabel')}: {person.email}</p>
                          )}
                        </div>
                      )}
                    </div>
                    {currentSalesperson === person.code && (
                      <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center ml-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </PercentBodyModalScrollBody>

        <div className="p-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            {tm('cancel')}
          </button>
        </div>
    </PercentBodyModal>
  );
}
