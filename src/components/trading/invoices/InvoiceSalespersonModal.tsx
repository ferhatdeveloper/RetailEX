import { X, User, Search, Plus, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import {
  createInvoiceSalesperson,
  listInvoiceSalespersons,
  type InvoicePickerMaster,
} from '../../../utils/invoiceDetailMasters';
import { suggestQuickAddCode } from '../../../utils/masterDataQuickAdd';

interface InvoiceSalespersonModalProps {
  currentSalesperson: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

export function InvoiceSalespersonModal({ currentSalesperson, onSelect, onClose }: InvoiceSalespersonModalProps) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [salespersons, setSalespersons] = useState<InvoicePickerMaster[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickCode, setQuickCode] = useState('');
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    const rows = await listInvoiceSalespersons();
    setSalespersons(rows);
    setLoaded(true);
  };

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

  const openQuickAdd = () => {
    const name = searchTerm.trim();
    setQuickName(name);
    setQuickCode(name ? suggestQuickAddCode(name) : '');
    setQuickPhone('');
    setShowQuickAdd(true);
  };

  const handleQuickCreate = async () => {
    const code = quickCode.trim();
    const name = quickName.trim();
    if (!code || !name) {
      toast.error(tm('codeAndNameRequired'));
      return;
    }
    setCreating(true);
    try {
      const created = await createInvoiceSalesperson({
        code,
        name,
        phone: quickPhone.trim() || undefined,
      });
      await reload();
      handleSelect(created.code);
      toast.success(tm('recordAdded'));
    } catch (err) {
      toast.error((err as Error)?.message || String(err));
    } finally {
      setCreating(false);
    }
  };

  const inputCls = darkMode
    ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder:text-gray-500'
    : 'bg-white border-gray-300 text-gray-900';
  const idleBorder = darkMode ? 'border-gray-600' : 'border-gray-300';
  const accentBorder = darkMode ? 'border-blue-500 bg-blue-900/40' : 'border-blue-500 bg-blue-50';
  const hoverBorder = darkMode
    ? 'hover:border-blue-500 hover:bg-blue-900/25'
    : 'hover:border-blue-500 hover:bg-blue-50';
  const cardTitle = darkMode ? 'text-white' : 'text-gray-900';
  const cardSub = darkMode ? 'text-gray-300' : 'text-gray-600';
  const cardMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <PercentBodyModal
      onClose={onClose}
      size="list"
      ariaLabel={tm('selectSalesperson')}
      shellClassName={darkMode ? 'bg-gray-900 text-gray-100' : ''}
    >
      <div
        className={`p-3 border-b flex items-center justify-between shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 ${
          darkMode ? 'border-gray-700' : 'border-gray-200'
        }`}
      >
        <h3 className="text-base text-white flex items-center gap-2 font-semibold">
          <User className="w-5 h-5" />
          {tm('selectSalesperson')}
        </h3>
        <button type="button" onClick={onClose} className="text-white hover:text-gray-200 p-1 rounded">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className={`p-4 border-b shrink-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          <input
            type="text"
            placeholder={tm('searchSalespersonPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 ${inputCls}`}
            autoFocus
          />
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-4">
        {loaded && filteredSalespersons.length === 0 && !showQuickAdd ? (
          <div className={`text-center py-10 ${cardMuted}`}>
            <User className="w-12 h-12 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">{tm('invoicePickerNoRecords')}</p>
            <button
              type="button"
              onClick={openQuickAdd}
              className={`mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg border-2 border-dashed ${
                darkMode
                  ? 'text-blue-300 border-blue-600 hover:bg-blue-900/30'
                  : 'text-blue-700 border-blue-300 hover:bg-blue-50'
              }`}
            >
              <Plus className="w-4 h-4" />
              {tm('addNewSalesperson')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSalespersons.map((person) => {
              const isSelected = currentSalesperson === person.code || currentSalesperson.includes(person.code);
              return (
                <button
                  key={person.code}
                  type="button"
                  onClick={() => handleSelect(person.code)}
                  className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                    isSelected ? accentBorder : `${idleBorder} ${hoverBorder}`
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium ${cardTitle}`}>{person.name}</p>
                      <p className={`text-sm ${cardSub}`}>
                        {tm('code')}: {person.code}
                      </p>
                      {person.phone && <p className={`text-xs mt-1 ${cardMuted}`}>{person.phone}</p>}
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
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
        {showQuickAdd ? (
          <div className="space-y-2">
            <input
              type="text"
              value={quickCode}
              onChange={(e) => setQuickCode(e.target.value)}
              placeholder={`${tm('code')} *`}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 ${inputCls}`}
            />
            <input
              type="text"
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder={`${tm('name')} *`}
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
                disabled={creating || !quickCode.trim() || !quickName.trim()}
                onClick={() => void handleQuickCreate()}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {tm('add')}
              </button>
              <button
                type="button"
                onClick={() => setShowQuickAdd(false)}
                className={`px-4 py-2 border rounded-lg text-sm ${
                  darkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300'
                }`}
              >
                {tm('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={openQuickAdd}
            className={`w-full py-2.5 border-2 border-dashed rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
              darkMode
                ? 'border-blue-600 text-blue-300 hover:bg-blue-900/30 bg-gray-800'
                : 'border-blue-300 text-blue-700 hover:bg-blue-50 bg-white'
            }`}
          >
            <Plus className="w-4 h-4" />
            {tm('addNewSalesperson')}
          </button>
        )}
      </div>

      <div
        className={`p-4 border-t shrink-0 ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}
      >
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
