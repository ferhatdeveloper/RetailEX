/**
 * Expense Management Module - Gider Yönetimi
 * 
 * Features:
 * - Gider CRUD operations (Ekle, Düzenle, Sil, Listele)
 * - Kategori bazlı filtreleme
 * - Tarih aralığı filtreleme
 * - Mağaza bazlı filtreleme
 * - Gider raporları ve grafikler
 * - Belge yükleme (fatura, makbuz)
 * - Export (PDF, Excel)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Receipt, Plus, Edit, Trash2, Search, Calendar,
  Banknote, TrendingUp, Filter, X, Upload, ChevronDown
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { PercentBodyModal } from '../../shared/PercentBodyModal';
import { ExpenseCategoryManagerModal } from './ExpenseCategoryManagerModal';
import {
  isSystemExpenseCategory,
  resolveExpenseCategoryLabel,
  uniqueExpenseCategoryCode,
} from '../../../utils/expenseCategoryLabel';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCurrency } from '../../../utils/formatNumber';
import { formatMoneyWithCode, getGlobalCurrency } from '../../../utils/currency';
import { expenseAPI, ExpenseSaveError, parseExpenseAmount, type Expense } from '../../../services/api/expenses';
import { postExpenseToRegister } from '../../../utils/cashFxPosting';
import { resolveCashFxHatwanQuote } from '../../../services/marketRatesService';
import {
  EXPENSE_ATTACHMENT_ACCEPT,
  readExpenseAttachmentDataUrl,
  recordExpenseAttachmentFromList,
  type ExpenseAttachmentPick,
} from '../../../utils/expenseAttachment';
import { formatStoredExpenseFiche } from '../../../utils/expenseFicheNo';
import { fetchKasalar, type Kasa } from '../../../services/api/kasa';
import { expenseCategoryAPI, type ExpenseCategory as ApiExpenseCategory } from '../../../services/api/masterData';
import { useLanguage } from '../../../contexts/LanguageContext';
import { currentLoginDisplayName, currentLoginUserId } from '../../../utils/loginCashierName';

interface ExpenseLocal extends Expense {
  store_name?: string;
  created_by_name?: string;
}

// Görüntü için DB'den gelen kategori (id/code/name/color/sort_order/is_active)
type ExpenseCategory = ApiExpenseCategory;

// Sabit liste fallback'i — DB henüz yüklenmediyse kullanılır
const CATEGORY_FALLBACK_PRESETS: Array<{ id: string; name: string; color: string }> = [
  { id: 'rent', name: 'Kira', color: 'bg-blue-100 text-blue-700' },
  { id: 'salary', name: 'Maaş', color: 'bg-green-100 text-green-700' },
  { id: 'electricity', name: 'Elektrik', color: 'bg-yellow-100 text-yellow-700' },
  { id: 'water', name: 'Su', color: 'bg-cyan-100 text-cyan-700' },
  { id: 'internet', name: 'İnternet', color: 'bg-purple-100 text-purple-700' },
  { id: 'phone', name: 'Telefon', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'maintenance', name: 'Bakım-Onarım', color: 'bg-orange-100 text-orange-700' },
  { id: 'cleaning', name: 'Temizlik', color: 'bg-pink-100 text-pink-700' },
  { id: 'marketing', name: 'Pazarlama', color: 'bg-red-100 text-red-700' },
  { id: 'supplies', name: 'Malzeme', color: 'bg-gray-100 text-gray-700' },
  { id: 'transport', name: 'Ulaşım', color: 'bg-teal-100 text-teal-700' },
  { id: 'tax', name: 'Vergi', color: 'bg-amber-100 text-amber-700' },
  { id: 'insurance', name: 'Sigorta', color: 'bg-lime-100 text-lime-700' },
  { id: 'other', name: 'Diğer', color: 'bg-slate-100 text-slate-700' },
];

const CATEGORY_FALLBACK: ExpenseCategory = {
  id: 'custom',
  firm_nr: '',
  code: 'custom',
  name: 'Özel Kategori',
  color: 'bg-slate-100 text-slate-700',
  sort_order: 9999,
  is_active: true,
};

const getCurrentMonthDateRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const from = new Date(year, month, 1).toISOString().split('T')[0];
  const to = new Date(year, month + 1, 0).toISOString().split('T')[0];

  return { from, to };
};

export function ExpenseManagement({ embeddedInPos = false }: { embeddedInPos?: boolean }) {
  const { tm } = useLanguage();
  const defaultDateRange = getCurrentMonthDateRange();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStore] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>(defaultDateRange.from);
  const [filterDateTo, setFilterDateTo] = useState<string>(defaultDateRange.to);
  const [showFilters, setShowFilters] = useState(false);

  // Form state
  const fichePreviewSeq = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<ExpenseAttachmentPick | null>(null);
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    amount: '',
    payment_method: 'cash',
    document_number: '',
    document_url: '',
    fiche_no: '',
    store_id: '',
    cost_center_id: '',
    cash_register_id: '',
    amount_currency: '',
    expense_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [kasalar, setKasalar] = useState<Kasa[]>([]);
  const [savingExpense, setSavingExpense] = useState(false);
  // Gider kategorileri — DB'den (migration 189 / public.expense_categories)
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  useEffect(() => {
    void loadKasalar();
    void loadExpenseCategories();
  }, []);

  const loadKasalar = async () => {
    try {
      const data = await fetchKasalar({ aktif: true });
      setKasalar(data);
    } catch (error) {
      console.error('Error loading cash registers:', error);
    }
  };

  const loadExpenseCategories = async () => {
    try {
      const list = await expenseCategoryAPI.getAll();
      setExpenseCategories(list);
    } catch (error) {
      console.error('Error loading expense categories:', error);
    }
  };

  const handleCreateExpenseCategory = async (displayName: string): Promise<boolean> => {
    const name = displayName.trim();
    if (!name) return false;
    const code = uniqueExpenseCategoryCode(name, expenseCategories.map((row) => row.code));
    try {
      const createdByName = currentLoginDisplayName();
      const created = await expenseCategoryAPI.create({
        code,
        name,
        color: 'bg-slate-100 text-slate-700',
        sort_order: 100,
        created_by_name: createdByName || null,
      });
      if (created) {
        await loadExpenseCategories();
        return true;
      }
      alert(
        tm('expenseCategorySaveFailed') ||
        'Gider kategorisi eklenemedi. Veritabanı bağlantısını veya yetkileri kontrol edin.',
      );
      return false;
    } catch (e: unknown) {
      const msg = (e as Error)?.message || String(e);
      console.error('[ExpenseManagement] handleCreateExpenseCategory error:', e);
      alert(
        (tm('expenseCategorySaveFailed') || 'Gider kategorisi eklenemedi.') +
        '\n\n' +
        msg,
      );
      return false;
    }
  };

  const handleRenameExpenseCategory = async (
    id: string,
    displayName: string,
    isActive: boolean,
  ): Promise<boolean> => {
    const name = displayName.trim();
    const row = expenseCategories.find((item) => item.id === id);
    if (!name || !row || isSystemExpenseCategory(row)) return false;
    try {
      const ok = await expenseCategoryAPI.update(id, { name, is_active: isActive });
      if (ok) {
        await loadExpenseCategories();
        return true;
      }
      alert(tm('expenseCategoryUpdateFailed') || 'Kategori güncellenemedi.');
      return false;
    } catch (e: unknown) {
      const msg = (e as Error)?.message || String(e);
      console.error('[ExpenseManagement] handleRenameExpenseCategory error:', e);
      alert(
        (tm('expenseCategoryUpdateFailed') || 'Kategori güncellenemedi.') +
        '\n\n' +
        msg,
      );
      return false;
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const row = expenseCategories.find((item) => item.id === id);
    if (!row || isSystemExpenseCategory(row)) return;
    if (!confirm(tm('expenseCategoryDeleteConfirm') || 'Bu kategoriyi silmek istiyor musunuz? Eski gider kayıtları ve tutarları durur.')) return;
    try {
      const ok = await expenseCategoryAPI.remove(id);
      if (ok) {
        void loadExpenseCategories();
      } else {
        alert(tm('expenseCategoryDeleteFailed') || 'Kategori silinemedi.');
      }
    } catch (e: unknown) {
      const msg = (e as Error)?.message || String(e);
      console.error('[ExpenseManagement] handleDeleteCategory error:', e);
      alert(
        (tm('expenseCategoryDeleteFailed') || 'Kategori silinemedi.') +
        '\n\n' +
        msg,
      );
    }
  };

  useEffect(() => {
    if (!showExpenseModal || editingExpense || !kasalar.length) return;
    setFormData(prev => {
      if (prev.cash_register_id) return prev;
      const first = kasalar[0];
      const cur = String(first.id_doviz_kodu || '').trim().toUpperCase();
      return {
        ...prev,
        cash_register_id: first.id,
        amount_currency: prev.amount_currency || cur,
      };
    });
  }, [showExpenseModal, editingExpense, kasalar]);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const filters: { startDate?: string; endDate?: string } = {};
      if (filterDateFrom) filters.startDate = filterDateFrom;
      if (filterDateTo) filters.endDate = filterDateTo;
      const data = await expenseAPI.getAll(filters);
      setExpenses(
        (data as ExpenseLocal[]).map(row => ({
          ...row,
          amount: parseExpenseAmount(row.amount),
        })),
      );
    } catch (error) {
      console.error('Error loading expenses:', error);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [filterDateFrom, filterDateTo]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  const attachmentReadSeq = useRef(0);
  const applyExpenseAttachmentPick = (picked: ExpenseAttachmentPick | null) => {
    const seq = attachmentReadSeq.current + 1;
    attachmentReadSeq.current = seq;
    setAttachment(picked);
    setFormData((prev) => ({ ...prev, document_url: '' }));
    if (!picked) return;
    void readExpenseAttachmentDataUrl(picked.file).then((url) => {
      if (attachmentReadSeq.current !== seq) return;
      setFormData((prev) => ({ ...prev, document_url: url }));
    }).catch(() => {
      if (attachmentReadSeq.current !== seq) return;
      setFormData((prev) => ({ ...prev, document_url: '' }));
    });
  };

  const handleAddExpense = () => {
    const seq = fichePreviewSeq.current + 1;
    fichePreviewSeq.current = seq;
    setEditingExpense(null);
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFormData({
      category: '',
      description: '',
      amount: '',
      payment_method: 'cash',
      document_number: '',
      document_url: '',
      fiche_no: '',
      store_id: '',
      cost_center_id: '',
      cash_register_id: kasalar[0]?.id || '',
      amount_currency: String(kasalar[0]?.id_doviz_kodu || '').trim().toUpperCase(),
      expense_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setShowExpenseModal(true);
    void expenseAPI.peekNextFicheNo().then((no) => {
      if (fichePreviewSeq.current !== seq) return;
      setFormData((prev) => ({ ...prev, fiche_no: no }));
    });
  };

  const handleEditExpense = (expense: Expense) => {
    fichePreviewSeq.current += 1;
    setEditingExpense(expense);
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFormData({
      category: expense.category,
      description: expense.description,
      amount: expense.amount.toString(),
      payment_method: expense.payment_method,
      document_number: expense.document_number || '',
      document_url: expense.document_url || '',
      fiche_no: formatStoredExpenseFiche(expense.fiche_no) || '—',
      store_id: expense.store_id,
      cost_center_id: expense.cost_center_id || '',
      cash_register_id: expense.cash_register_id || '',
      amount_currency: String(
        expense.currency_code
        || kasalar.find((kasa) => kasa.id === expense.cash_register_id)?.id_doviz_kodu
        || 'IQD',
      ).trim().toUpperCase(),
      expense_date: expense.expense_date,
      notes: expense.notes || '',
    });
    setShowExpenseModal(true);
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm(tm('expenseDeleteConfirm'))) return;

    try {
      await expenseAPI.delete(expenseId);
      await loadExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert(tm('expenseSaveError'));
    }
  };

  const reloadExpensesForDate = useCallback(async (expenseDate?: string) => {
    let from = filterDateFrom;
    let to = filterDateTo;
    const day = String(expenseDate || '').slice(0, 10);
    if (day) {
      if (from && day < from) from = day;
      if (to && day > to) to = day;
    }
    if (from !== filterDateFrom) setFilterDateFrom(from);
    if (to !== filterDateTo) setFilterDateTo(to);

    setLoading(true);
    try {
      const filters: { startDate?: string; endDate?: string } = {};
      if (from) filters.startDate = from;
      if (to) filters.endDate = to;
      const data = await expenseAPI.getAll(filters);
      setExpenses(
        (data as ExpenseLocal[]).map(row => ({
          ...row,
          amount: parseExpenseAmount(row.amount),
        })),
      );
    } catch (error) {
      console.error('Error loading expenses:', error);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [filterDateFrom, filterDateTo]);

  const selectedKasa = useMemo(
    () => kasalar.find((kasa) => kasa.id === formData.cash_register_id) || null,
    [kasalar, formData.cash_register_id],
  );
  const registerCurrency = String(selectedKasa?.id_doviz_kodu || '').trim().toUpperCase();
  const entryCurrency = String(formData.amount_currency || registerCurrency || '').trim().toUpperCase();
  const bookCurrency = getGlobalCurrency();
  const [enteredToRegisterRate, setEnteredToRegisterRate] = useState<number | null>(null);
  const [registerToBaseRate, setRegisterToBaseRate] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEnteredToRegisterRate(null);
    setRegisterToBaseRate(null);
    if (!registerCurrency) return undefined;
    const asOf = String(formData.expense_date || new Date().toISOString()).slice(0, 10);
    void (async () => {
      try {
        if (entryCurrency && entryCurrency !== registerCurrency) {
          const quote = await resolveCashFxHatwanQuote(entryCurrency, registerCurrency, asOf, 'Satış');
          if (!cancelled) {
            setEnteredToRegisterRate(quote && quote.documentToLedger > 0 ? quote.documentToLedger : null);
          }
        }
        if (bookCurrency && registerCurrency !== bookCurrency) {
          const quote = await resolveCashFxHatwanQuote(registerCurrency, bookCurrency, asOf, 'Satış');
          if (!cancelled) {
            setRegisterToBaseRate(quote && quote.documentToLedger > 0 ? quote.documentToLedger : null);
          }
        }
      } catch {
        /* önizleme; kayıt sunucuda aynı kuru yeniden okur */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryCurrency, registerCurrency, bookCurrency, formData.expense_date]);

  const expenseFxPreview = useMemo(() => {
    const amount = parseExpenseAmount(formData.amount);
    if (!(amount > 0) || !registerCurrency) return null;
    return postExpenseToRegister({
      enteredAmount: amount,
      enteredCurrency: entryCurrency || registerCurrency,
      registerCurrency,
      baseCurrency: bookCurrency,
      enteredToRegisterRate: entryCurrency && entryCurrency !== registerCurrency ? enteredToRegisterRate : null,
      registerToBaseRate: registerCurrency !== bookCurrency ? registerToBaseRate : null,
    });
  }, [
    formData.amount,
    entryCurrency,
    registerCurrency,
    bookCurrency,
    enteredToRegisterRate,
    registerToBaseRate,
  ]);

  const entryCurrencyChoices = useMemo(() => {
    const codes = new Set<string>();
    if (registerCurrency) codes.add(registerCurrency);
    if (entryCurrency) codes.add(entryCurrency);
    ['IQD', 'USD', 'EUR'].forEach((code) => codes.add(code));
    return [...codes];
  }, [registerCurrency, entryCurrency]);

  const handleSaveExpense = async () => {
    if (savingExpense) return;
    try {
      if (!formData.category.trim()) {
        alert(tm('expenseCategoryRequired'));
        return;
      }
      if (!formData.description.trim()) {
        alert(tm('descriptionRequired'));
        return;
      }
      const parsedAmount = parseExpenseAmount(formData.amount);
      if (!formData.amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        alert(tm('pleaseEnterValidAmount'));
        return;
      }
      const payIsCash = formData.payment_method === 'cash' || formData.payment_method === 'nakit';
      if (payIsCash && !formData.cash_register_id) {
        alert(tm('noCashRegisterFound'));
        return;
      }
      if (
        payIsCash
        && registerCurrency
        && entryCurrency
        && entryCurrency !== registerCurrency
        && !expenseFxPreview?.converted
      ) {
        alert(tm('expenseFxUnavailable'));
        return;
      }
      let documentUrl = formData.document_url;
      if (attachment?.file && !documentUrl) {
        try {
          documentUrl = await readExpenseAttachmentDataUrl(attachment.file);
        } catch {
          documentUrl = '';
        }
      }
      const data = {
        category: formData.category,
        description: formData.description,
        amount: parsedAmount,
        payment_method: formData.payment_method,
        document_number: formData.document_number,
        document_url: documentUrl,
        store_id: formData.store_id || undefined,
        cost_center_id: formData.cost_center_id || undefined,
        cash_register_id: formData.cash_register_id || undefined,
        amount_currency: entryCurrency || undefined,
        expense_date: formData.expense_date,
        notes: formData.notes,
        ...(editingExpense ? {} : { created_by: currentLoginUserId() || '' }),
      };

      setSavingExpense(true);

      if (editingExpense) {
        await expenseAPI.update(editingExpense.id, data as any);
        setShowExpenseModal(false);
        await reloadExpensesForDate(data.expense_date);
      } else {
        await expenseAPI.create(data as any);
        setShowExpenseModal(false);
        await reloadExpensesForDate(data.expense_date);
      }
    } catch (error) {
      console.error('Error saving expense:', error);
      const partialSave = error instanceof ExpenseSaveError && error.expenseSaved;
      if (partialSave) {
        setShowExpenseModal(false);
        await reloadExpensesForDate(formData.expense_date);
      }
      const msg = (error as Error)?.message || tm('expenseSaveError');
      alert(msg);
    } finally {
      setSavingExpense(false);
    }
  };

  const normalizeCategory = (value: string) => value.trim().toLocaleLowerCase('tr-TR');

  const getCategoryInfo = (categoryValue: string) => {
    const trimmed = String(categoryValue || '').trim();
    if (!trimmed) return CATEGORY_FALLBACK;
    // DB'den yüklenen listede code / name ile eşleş
    return (
      expenseCategories.find(c =>
        c.code === trimmed ||
        c.id === trimmed ||
        normalizeCategory(c.name) === normalizeCategory(trimmed) ||
        normalizeCategory(tm(`expenseCategory_${c.code}`)) === normalizeCategory(trimmed)
      ) ||
      // Hardcoded preset fallback (DB boşsa)
      CATEGORY_FALLBACK_PRESETS.find(c =>
        c.id === trimmed ||
        normalizeCategory(c.name) === normalizeCategory(trimmed) ||
        normalizeCategory(tm(`expenseCategory_${c.id}`)) === normalizeCategory(trimmed)
      ) ||
      CATEGORY_FALLBACK
    );
  };

  const activeExpenseCategories = useMemo(
    () => expenseCategories.filter((row) => row.is_active !== false),
    [expenseCategories],
  );

  const categoryLabel = (categoryValue: string) => {
    const label = resolveExpenseCategoryLabel(categoryValue, {
      translate: tm,
      categories: expenseCategories,
    });
    return label || tm('expenseCategoryCustom');
  };

  const expenseCategorySelectOptions = (selectedValue: string) => {
    const opts = activeExpenseCategories.map((cat) => ({
      value: cat.code,
      label: resolveExpenseCategoryLabel(cat.name || cat.code, {
        translate: tm,
        categories: expenseCategories,
      }),
    }));
    const current = String(selectedValue || '').trim();
    if (current && current !== 'all' && !opts.some((row) => row.value === current)) {
      opts.unshift({
        value: current,
        label: resolveExpenseCategoryLabel(current, {
          translate: tm,
          categories: expenseCategories,
        }),
      });
    }
    return opts;
  };

  const categoryKey = (categoryValue: string) => {
    const trimmed = String(categoryValue || '').trim();
    if (!trimmed) return '';
    const info = getCategoryInfo(trimmed);
    return info.code === 'custom' ? normalizeCategory(trimmed) : info.code;
  };

  const columnHelper = createColumnHelper<ExpenseLocal>();

  const columns = [
    columnHelper.accessor('expense_date', {
      header: tm('date').toUpperCase(),
      cell: info => new Date(info.getValue()).toLocaleDateString('tr-TR'),
      size: 100,
      meta: { filterKind: 'date', format: 'date', type: 'date' },
    }),
    columnHelper.accessor((row) => categoryLabel(row.category), {
      id: 'category',
      header: tm('category').toUpperCase(),
      cell: (info) => {
        const cat = getCategoryInfo(String(info.row.original.category || ''));
        return (
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${cat.color} inline-flex items-center gap-1`}>
            <span>{info.getValue()}</span>
          </span>
        );
      },
      size: 150
    }),
    columnHelper.accessor('description', {
      header: tm('description').toUpperCase(),
      cell: info => info.getValue(),
      size: 250
    }),
    columnHelper.accessor('amount', {
      header: tm('amount').toUpperCase(),
      cell: info => {
        const code = String(info.row.original.currency_code || '').trim().toUpperCase();
        const amount = parseExpenseAmount(info.getValue());
        return (
          <span className="font-medium text-red-600">
            {code ? formatCurrency(amount, code) : formatCurrency(amount)}
          </span>
        );
      },
      size: 120
    }),
    columnHelper.accessor('payment_method', {
      header: tm('payment').toUpperCase(),
      cell: info => {
        const method = info.getValue();
        const methods: Record<string, string> = {
          cash: tm('cash'),
          bank_transfer: tm('bankTransfer'),
          credit_card: tm('creditCard'),
          check: tm('check'),
        };
        return (
          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
            {methods[method] || method}
          </span>
        );
      },
      size: 100
    }),
    columnHelper.accessor(row => row.store_name, {
      id: 'store_name',
      header: tm('store').toUpperCase(),
      cell: info => info.getValue() || '-',
      size: 120
    }),
    columnHelper.accessor('cost_center_name', {
      header: tm('costCenter').toUpperCase(),
      cell: info => info.getValue() || '-',
      size: 150
    }),
    columnHelper.accessor('fiche_no', {
      header: tm('ficheNo').toUpperCase(),
      cell: info => formatStoredExpenseFiche(info.getValue()) || '—',
      size: 110,
    }),
    columnHelper.accessor('document_number', {
      header: tm('documentNo').toUpperCase(),
      cell: info => info.getValue() || '-',
      size: 120
    }),
    columnHelper.display({
      id: 'actions',
      header: tm('actions').toUpperCase(),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEditExpense(row.original)}
            className="p-2 hover:bg-blue-50 rounded transition-colors"
            title={tm('edit')}
          >
            <Edit className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={() => handleDeleteExpense(row.original.id)}
            className="p-2 hover:bg-red-50 rounded transition-colors"
            title={tm('delete')}
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      ),
      size: 100
    }),
  ];

  // Filter expenses (tarih aralığı DB'den yüklenir; kategori/arama istemci tarafında)
  const filteredExpenses = useMemo(() => expenses.filter(expense => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    const matchesSearch = !q || expense.description.toLocaleLowerCase('tr-TR').includes(q)
      || (expense.document_number || '').toLocaleLowerCase('tr-TR').includes(q)
      || (expense.fiche_no || '').toLocaleLowerCase('tr-TR').includes(q)
      || categoryLabel(expense.category).toLocaleLowerCase('tr-TR').includes(q)
      || String(expense.category || '').toLocaleLowerCase('tr-TR').includes(q);
    const matchesCategory = filterCategory === 'all' || categoryKey(expense.category) === categoryKey(filterCategory);
    const matchesStore = filterStore === 'all' || expense.store_id === filterStore;
    const expenseDay = String(expense.expense_date || '').slice(0, 10);
    const matchesDate = (!filterDateFrom || expenseDay >= filterDateFrom) &&
      (!filterDateTo || expenseDay <= filterDateTo);

    return matchesSearch && matchesCategory && matchesStore && matchesDate;
  }), [expenses, searchQuery, filterCategory, filterStore, filterDateFrom, filterDateTo, expenseCategories]);

  const totalExpenses = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + parseExpenseAmount(e.amount), 0),
    [filteredExpenses],
  );

  const cashExpenses = useMemo(
    () =>
      filteredExpenses.reduce((sum, e) => {
        const method = String(e.payment_method ?? '').trim().toLowerCase();
        const isCash = method === 'cash' || method === 'nakit';
        return isCash ? sum + parseExpenseAmount(e.amount) : sum;
      }, 0),
    [filteredExpenses],
  );

  const hasActiveFilters = useMemo(() => {
    const monthRange = getCurrentMonthDateRange();
    return (
      filterCategory !== 'all' ||
      searchQuery.trim().length > 0 ||
      filterDateFrom !== monthRange.from ||
      filterDateTo !== monthRange.to
    );
  }, [filterCategory, searchQuery, filterDateFrom, filterDateTo]);

  const filterSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (filterDateFrom && filterDateTo) {
      parts.push(
        tm('expenseFilterDateRange')
          .replace('{from}', new Date(filterDateFrom).toLocaleDateString('tr-TR'))
          .replace('{to}', new Date(filterDateTo).toLocaleDateString('tr-TR')),
      );
    }
    if (filterCategory !== 'all') {
      parts.push(`${tm('category')}: ${categoryLabel(filterCategory)}`);
    }
    if (searchQuery.trim()) {
      parts.push(`${tm('search')}: "${searchQuery.trim()}"`);
    }
    return parts.length ? parts.join(' · ') : tm('expenseFilterAllRecords');
  }, [filterDateFrom, filterDateTo, filterCategory, searchQuery, tm, expenseCategories]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white overscroll-y-contain touch-pan-y">
      <div className="contents">
      {/* Header */}
      <div
        className={`sticky top-0 z-10 flex-shrink-0 border-b border-gray-200 shadow-sm ${
          embeddedInPos
            ? 'bg-white p-2 sm:p-3'
            : 'bg-gradient-to-r from-red-50 to-orange-50 p-3 sm:p-5'
        }`}
      >
        {!embeddedInPos ? (
          <div className="mb-2 flex items-center justify-between gap-2 sm:mb-4 sm:gap-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-600 sm:h-12 sm:w-12">
                <Receipt className="h-5 w-5 text-white sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-gray-900 sm:text-2xl">{tm('expenseManagement')}</h1>
                <p className="hidden text-sm text-gray-600 sm:block">{tm('expenseManagementSubtitle')}</p>
              </div>
            </div>
            <button
              onClick={handleAddExpense}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm text-white shadow-sm transition-colors hover:bg-red-700 sm:gap-2 sm:px-4"
            >
              <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">{tm('newExpense')}</span>
              <span className="sm:hidden">+</span>
            </button>
          </div>
        ) : null}

        {/* Search and Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 sm:h-5 sm:w-5" />
            <input
              type="text"
              placeholder={tm('expenseSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-red-500 sm:py-2 sm:pl-10 sm:pr-4"
            />
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm transition-colors sm:flex-none sm:px-4 sm:py-2 ${
                showFilters ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-300 bg-white hover:bg-gray-50'
              }`}
              aria-expanded={showFilters}
            >
              <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>{tm('filter')}</span>
            </button>
            {embeddedInPos ? (
              <button
                onClick={handleAddExpense}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2.5 text-sm text-white shadow-sm transition-colors hover:bg-red-700 sm:flex-none sm:px-4 sm:py-2"
              >
                <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="truncate">{tm('newExpense')}</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 sm:mt-4 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tm('category')}</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                >
                  <option value="all">{tm('allCategories')}</option>
                  {activeExpenseCategories.map((cat) => (
                    <option key={cat.id} value={cat.code}>
                      {resolveExpenseCategoryLabel(cat.name || cat.code, {
                        translate: tm,
                        categories: expenseCategories,
                      })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tm('startDate')}</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tm('endDate')}</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setFilterCategory('all');
                    const currentMonthRange = getCurrentMonthDateRange();
                    setFilterDateFrom(currentMonthRange.from);
                    setFilterDateTo(currentMonthRange.to);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  {tm('clear')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filtrelenmiş toplam — kompakt mobil */}
      <div className="flex-shrink-0 border-b border-red-700 bg-gradient-to-r from-red-600 to-orange-600 px-3 py-3 text-white sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-100 sm:text-xs">
              {hasActiveFilters ? tm('expenseFilteredTotal') : tm('totalExpense')}
            </p>
            <p className="mt-0.5 truncate text-xs text-red-50 sm:text-sm">{filterSummaryText}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-black tracking-tight sm:text-3xl">{formatCurrency(totalExpenses)}</p>
            <p className="mt-0.5 text-[10px] text-red-100 sm:text-xs">
              {filteredExpenses.length} {tm('expenseCount').toLowerCase()}
            </p>
          </div>
        </div>
      </div>

      {/* Statistics — masaüstü; mobilde üst banner yeterli */}
      <div className="hidden flex-shrink-0 grid-cols-2 gap-3 border-b border-gray-200 p-4 md:grid md:grid-cols-4 md:gap-4 md:p-6">
        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 mb-1">{tm('expenseFilteredTotal')}</p>
              <p className="text-2xl font-bold text-red-900">{formatCurrency(totalExpenses)}</p>
            </div>
            <Banknote className="w-8 h-8 text-red-600" />
          </div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-600 mb-1">{tm('expenseCashTotal')}</p>
              <p className="text-2xl font-bold text-orange-900">{formatCurrency(cashExpenses)}</p>
            </div>
            <Calendar className="w-8 h-8 text-orange-600" />
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 mb-1">{tm('expenseCount')}</p>
              <p className="text-2xl font-bold text-purple-900">{filteredExpenses.length}</p>
            </div>
            <Receipt className="w-8 h-8 text-purple-600" />
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 mb-1">{tm('average')}</p>
              <p className="text-2xl font-bold text-blue-900">
                {filteredExpenses.length > 0 ? formatCurrency(totalExpenses / filteredExpenses.length) : '-'}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Data Grid */}
      <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">{tm('loadingExpenses')}</p>
            </div>
          </div>
        ) : (
          <>
            <DevExDataGrid
              data={filteredExpenses}
              columns={columns}
              enablePagination={true}
              enableSorting={true}
              enableFiltering
              pageSize={20}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <span className="text-sm font-semibold text-red-800">
                {tm('expenseListFooterTotal')}
              </span>
              <div className="text-right">
                <p className="text-xl font-bold text-red-900">{formatCurrency(totalExpenses)}</p>
                <p className="text-xs text-red-600">
                  {filteredExpenses.length} {tm('expenseCount').toLowerCase()}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
      </div>

      {showExpenseModal ? (
        <PercentBodyModal
          onClose={() => setShowExpenseModal(false)}
          size="list"
          shellClassName="!h-auto"
          ariaLabel={editingExpense ? tm('editExpense') : tm('newExpense')}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 shrink-0">
            <h2 className="text-base font-semibold text-slate-900">
              {editingExpense ? tm('editExpense') : tm('newExpense')}
            </h2>
            <button
              type="button"
              onClick={() => setShowExpenseModal(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label={tm('close')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="shrink-0 overflow-y-auto overscroll-contain px-5 py-4 max-h-[min(70vh,calc(100dvh-10rem))]">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-6">
              <div className="sm:col-span-2" data-expense-field="category">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {tm('category')} *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCategoryManager(true)}
                    className="text-[11px] font-semibold text-blue-700 hover:underline"
                  >
                    {tm('expenseCategoryManage')}
                  </button>
                </div>
                <div className="relative">
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 font-medium text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">{tm('expenseCategoryPlaceholder')}</option>
                    {expenseCategorySelectOptions(formData.category).map((row) => (
                      <option key={row.value} value={row.value}>{row.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                </div>
              </div>

              <div className="sm:col-span-2" data-expense-field="amount">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {entryCurrency ? `${tm('amount')} (${entryCurrency}) *` : `${tm('amount')} *`}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="45.000"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-medium text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500"
                />
                <div className="relative mt-1.5">
                  <select
                    aria-label={tm('currency')}
                    value={entryCurrency}
                    onChange={(e) => setFormData({ ...formData, amount_currency: e.target.value })}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm font-medium text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500"
                  >
                    {!entryCurrency ? <option value="">{tm('currency')}</option> : null}
                    {entryCurrencyChoices.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                </div>
                {expenseFxPreview?.converted ? (
                  <p className="mt-1.5 text-[11px] font-medium text-slate-600">
                    {tm('expenseEnteredCashAmount').replace('{currency}', expenseFxPreview.enteredCurrency)}
                    {': '}
                    {formatMoneyWithCode(expenseFxPreview.enteredAmount, expenseFxPreview.enteredCurrency)}
                    {' · '}
                    {tm('expenseRegisterCashAmount').replace('{currency}', expenseFxPreview.registerCurrency)}
                    {': '}
                    {formatMoneyWithCode(expenseFxPreview.registerAmount, expenseFxPreview.registerCurrency)}
                  </p>
                ) : null}
                {expenseFxPreview && registerCurrency && bookCurrency && registerCurrency !== bookCurrency && expenseFxPreview.baseAmount != null ? (
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    {tm('fxBaseEquivalent')}
                    {': '}
                    {formatMoneyWithCode(expenseFxPreview.baseAmount, bookCurrency)}
                  </p>
                ) : null}
              </div>

              <div className="sm:col-span-2" data-expense-field="paymentMethod">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {tm('paymentMethod')} *
                </label>
                <div className="relative">
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 font-medium text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500"
                  >
                    <option value="cash">{tm('cash')}</option>
                    <option value="bank_transfer">{tm('bankTransferEft')}</option>
                    <option value="credit_card">{tm('creditCard')}</option>
                    <option value="check">{tm('check')}</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                </div>
              </div>

              <div className="sm:col-span-2" data-expense-field="date">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {tm('date')} *
                </label>
                <input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-medium text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="sm:col-span-4" data-expense-field="description">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {tm('description')} *
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={tm('expenseDescriptionPlaceholder')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-medium text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="sm:col-span-3" data-expense-field="ficheNo">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {tm('ficheNo')}
                </label>
                <input
                  type="text"
                  readOnly
                  tabIndex={-1}
                  value={formData.fiche_no}
                  aria-readonly="true"
                  title={tm('expenseFicheReadonly')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-medium tabular-nums text-slate-700 outline-none"
                />
              </div>

              <div className="sm:col-span-3" data-expense-field="cashRegister">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {tm('costCenterCashRegister')}
                </label>
                <div className="relative">
                  <select
                    value={formData.cash_register_id}
                    onChange={(e) => {
                      const id = e.target.value;
                      const next = kasalar.find((kasa) => kasa.id === id);
                      const nextCur = String(next?.id_doviz_kodu || '').trim().toUpperCase();
                      setFormData((prev) => {
                        const prevEntry = String(prev.amount_currency || registerCurrency || '').trim().toUpperCase();
                        const followRegister = !editingExpense && (!prevEntry || prevEntry === registerCurrency);
                        return {
                          ...prev,
                          cash_register_id: id,
                          amount_currency: followRegister ? (nextCur || prevEntry) : prevEntry,
                        };
                      });
                    }}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 font-medium text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500"
                  >
                    {kasalar.length === 0 && <option value="">{tm('noCashRegisterFound')}</option>}
                    {kasalar.map(kasa => (
                      <option key={kasa.id} value={kasa.id}>
                        {kasa.kasa_kodu} - {kasa.kasa_adi}{kasa.id_doviz_kodu ? ` (${kasa.id_doviz_kodu})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                </div>
              </div>

              <div className="sm:col-span-3" data-expense-field="documentNo">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {tm('documentNo')}
                </label>
                <input
                  type="text"
                  value={formData.document_number}
                  onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                  placeholder={tm('expenseDocumentNoPlaceholder')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-medium text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="sm:col-span-3" data-expense-field="notes">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {tm('notes')}
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={tm('additionalNotes')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-medium text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div
                className="sm:col-span-6"
                data-expense-field="attachment"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const picked = recordExpenseAttachmentFromList(e.dataTransfer.files);
                  applyExpenseAttachmentPick(picked);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={EXPENSE_ATTACHMENT_ACCEPT}
                  data-expense-file-input=""
                  aria-label={tm('expenseReceiptDropLabel')}
                  className="sr-only"
                  onChange={(e) => {
                    const picked = recordExpenseAttachmentFromList(e.target.files);
                    applyExpenseAttachmentPick(picked);
                    e.currentTarget.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const picked = recordExpenseAttachmentFromList(e.dataTransfer.files);
                    applyExpenseAttachmentPick(picked);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-4 py-4 text-left"
                >
                  <Upload className="h-5 w-5 shrink-0 text-slate-400" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-700">{tm('expenseReceiptDropLabel')}</span>
                    {attachment?.name ? (
                      <span className="block truncate text-sm text-slate-900">{attachment.name}</span>
                    ) : formData.document_url ? (
                      <span className="block truncate text-sm text-slate-900">{tm('expenseReceiptOnFile')}</span>
                    ) : null}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowExpenseModal(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              {tm('giveUp')}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveExpense()}
              disabled={savingExpense}
              className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-60"
            >
              {savingExpense ? tm('loading') : (editingExpense ? tm('update') : tm('save'))}
            </button>
          </div>
        </PercentBodyModal>
      ) : null}

      {showCategoryManager ? (
        <ExpenseCategoryManagerModal
          categories={expenseCategories}
          onClose={() => setShowCategoryManager(false)}
          onCreate={handleCreateExpenseCategory}
          onRename={handleRenameExpenseCategory}
          onRemove={handleDeleteCategory}
        />
      ) : null}
    </div>
  );
}
