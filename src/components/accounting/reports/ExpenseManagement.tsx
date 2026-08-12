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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Receipt, Plus, Edit, Trash2, Search, Calendar,
  Banknote, TrendingUp, Filter, X, Upload, ChevronDown
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCurrency } from '../../../utils/formatNumber';
import { InlineLanguageSwitcher } from '../../shared/InlineLanguageSwitcher';
import { expenseAPI, ExpenseSaveError, type Expense } from '../../../services/api/expenses';
import { fetchKasalar, type Kasa } from '../../../services/api/kasa';
import { useLanguage } from '../../../contexts/LanguageContext';

interface ExpenseLocal extends Expense {
  store_name?: string;
  created_by_name?: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
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
  name: 'Özel Kategori',
  color: 'bg-slate-100 text-slate-700'
};

function parseExpenseAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    amount: '',
    payment_method: 'cash',
    document_number: '',
    store_id: '',
    cost_center_id: '',
    cash_register_id: '',
    expense_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [kasalar, setKasalar] = useState<Kasa[]>([]);
  const [savingExpense, setSavingExpense] = useState(false);

  useEffect(() => {
    void loadKasalar();
  }, []);

  const loadKasalar = async () => {
    try {
      const data = await fetchKasalar({ aktif: true });
      setKasalar(data);
    } catch (error) {
      console.error('Error loading cash registers:', error);
    }
  };

  useEffect(() => {
    if (!showExpenseModal || editingExpense || !kasalar.length) return;
    setFormData(prev => prev.cash_register_id ? prev : { ...prev, cash_register_id: kasalar[0].id });
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

  const handleAddExpense = () => {
    setEditingExpense(null);
    setFormData({
      category: '',
      description: '',
      amount: '',
      payment_method: 'cash',
      document_number: '',
      store_id: '',
      cost_center_id: '',
      cash_register_id: kasalar[0]?.id || '',
      expense_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setShowExpenseModal(true);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      category: expense.category,
      description: expense.description,
      amount: expense.amount.toString(),
      payment_method: expense.payment_method,
      document_number: expense.document_number || '',
      store_id: expense.store_id,
      cost_center_id: expense.cost_center_id || '',
      cash_register_id: expense.cash_register_id || '',
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
      if (!formData.amount || Number.isNaN(parseFloat(formData.amount))) {
        alert(tm('pleaseEnterValidAmount'));
        return;
      }
      const data = {
        ...formData,
        amount: parseFloat(formData.amount),
        store_id: formData.store_id || undefined,
        cost_center_id: formData.cost_center_id || undefined,
        cash_register_id: formData.cash_register_id || undefined,
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
    return (
      EXPENSE_CATEGORIES.find(c =>
        c.id === trimmed ||
        normalizeCategory(c.name) === normalizeCategory(trimmed) ||
        normalizeCategory(tm(`expenseCategory_${c.id}`)) === normalizeCategory(trimmed)
      ) ||
      CATEGORY_FALLBACK
    );
  };

  const categoryLabel = (categoryValue: string) => {
    const trimmed = String(categoryValue || '').trim();
    if (!trimmed) return tm('expenseCategoryCustom');
    const info = getCategoryInfo(trimmed);
    if (info.id === 'custom') return trimmed;
    return tm(`expenseCategory_${info.id}`);
  };

  const categoryKey = (categoryValue: string) => {
    const trimmed = String(categoryValue || '').trim();
    if (!trimmed) return '';
    const info = getCategoryInfo(trimmed);
    return info.id === 'custom' ? normalizeCategory(trimmed) : info.id;
  };

  const columnHelper = createColumnHelper<ExpenseLocal>();

  const columns = [
    columnHelper.accessor('expense_date', {
      header: tm('date').toUpperCase(),
      cell: info => new Date(info.getValue()).toLocaleDateString('tr-TR'),
      size: 100
    }),
    columnHelper.accessor('category', {
      header: tm('category').toUpperCase(),
      cell: info => {
        const cat = getCategoryInfo(info.getValue());
        return (
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${cat.color} inline-flex items-center gap-1`}>
            <span>{categoryLabel(info.getValue())}</span>
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
      cell: info => (
        <span className="font-medium text-red-600">
          {formatCurrency(parseExpenseAmount(info.getValue()))}
        </span>
      ),
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
    const matchesSearch = expense.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.document_number?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || categoryKey(expense.category) === categoryKey(filterCategory);
    const matchesStore = filterStore === 'all' || expense.store_id === filterStore;
    const expenseDay = String(expense.expense_date || '').slice(0, 10);
    const matchesDate = (!filterDateFrom || expenseDay >= filterDateFrom) &&
      (!filterDateTo || expenseDay <= filterDateTo);

    return matchesSearch && matchesCategory && matchesStore && matchesDate;
  }), [expenses, searchQuery, filterCategory, filterStore, filterDateFrom, filterDateTo]);

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
  }, [filterDateFrom, filterDateTo, filterCategory, searchQuery, tm]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white overscroll-y-contain touch-pan-y">
      <div className={showExpenseModal ? 'hidden' : 'contents'} aria-hidden={showExpenseModal}>
      {/* Header */}
      <div
        className={`sticky top-0 z-30 flex-shrink-0 border-b border-gray-200 shadow-sm ${
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
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{tm(`expenseCategory_${cat.id}`)}</option>
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
              enableFiltering={false}
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

      {showExpenseModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[2147483647] flex flex-col bg-white min-h-0 overflow-hidden animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-red-600 to-orange-600 px-6 py-5 text-white shrink-0 sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">
                  {editingExpense ? tm('editExpense') : tm('newExpense')}
                </h2>
                <p className="text-red-100 text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90">
                  {tm('expenseManagementSubtitle')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <InlineLanguageSwitcher variant="onColor" />
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                  aria-label={tm('close')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 sm:p-8">
            <div className="mx-auto w-full max-w-4xl space-y-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {tm('category')} *
                  </label>
                  <input
                    list="expense-category-options"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder={tm('expenseCategoryPlaceholder')}
                    className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:border-red-400 outline-none text-slate-800 font-medium"
                  />
                  <datalist id="expense-category-options">
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat.id} value={tm(`expenseCategory_${cat.id}`)} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {tm('date')} *
                  </label>
                  <input
                    type="date"
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:border-red-400 outline-none text-slate-800 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {tm('description')} *
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={tm('expenseDescriptionPlaceholder')}
                  className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:border-red-400 outline-none text-slate-800 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {tm('amount')} (IQD) *
                  </label>
                  <input
                    type="number"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:border-red-400 outline-none text-slate-800 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {tm('paymentMethod')} *
                  </label>
                  <div className="relative">
                    <select
                      value={formData.payment_method}
                      onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                      className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-2xl appearance-none bg-white focus:ring-2 focus:ring-red-500 focus:border-red-400 outline-none text-slate-800 font-medium"
                    >
                      <option value="cash">{tm('cash')}</option>
                      <option value="bank_transfer">{tm('bankTransferEft')}</option>
                      <option value="credit_card">{tm('creditCard')}</option>
                      <option value="check">{tm('check')}</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" aria-hidden />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {tm('documentNo')}
                  </label>
                  <input
                    type="text"
                    value={formData.document_number}
                    onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                    placeholder={tm('expenseDocumentNoPlaceholder')}
                    className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:border-red-400 outline-none text-slate-800 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {tm('costCenterCashRegister')}
                  </label>
                  <div className="relative">
                    <select
                      value={formData.cash_register_id}
                      onChange={(e) => setFormData({ ...formData, cash_register_id: e.target.value })}
                      className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-2xl appearance-none bg-white focus:ring-2 focus:ring-red-500 focus:border-red-400 outline-none text-slate-800 font-medium"
                    >
                      {kasalar.length === 0 && <option value="">{tm('noCashRegisterFound')}</option>}
                      {kasalar.map(kasa => (
                        <option key={kasa.id} value={kasa.id}>{kasa.kasa_kodu} - {kasa.kasa_adi}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" aria-hidden />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {tm('notes')}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={tm('additionalNotes')}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:border-red-400 outline-none text-slate-800 font-medium resize-none"
                />
              </div>

              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600 mb-2">{tm('uploadDocumentInvoiceReceipt')}</p>
                <button type="button" className="text-sm text-red-600 hover:text-red-700 font-semibold">
                  {tm('selectFile')}
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
            <button
              type="button"
              onClick={() => setShowExpenseModal(false)}
              className="flex-1 px-4 py-3 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100 active:scale-[0.98] transition-colors"
            >
              {tm('cancel')}
            </button>
            <button
              type="button"
              onClick={handleSaveExpense}
              disabled={savingExpense}
              className="flex-1 px-4 py-3 rounded-2xl bg-red-600 text-white font-bold uppercase text-sm tracking-wider shadow-lg shadow-red-200/50 hover:bg-red-700 active:scale-[0.98] transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {savingExpense ? tm('loading') : (editingExpense ? tm('update') : tm('save'))}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

