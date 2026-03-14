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

import { useState, useEffect } from 'react';
import {
  Receipt, Plus, Edit, Trash2, Search, Calendar, Building2,
  DollarSign, TrendingUp, Download, Filter, X, FileText, Upload
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCurrency } from '../../../utils/formatNumber';
import { expenseAPI, type Expense } from '../../../services/api/expenses';
import { costCenterAPI, type CostCenter } from '../../../services/api/costCenters';

interface ExpenseLocal extends Expense {
  store_name?: string;
  created_by_name?: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'rent', name: 'Kira', icon: 'ğŸ¢', color: 'bg-blue-100 text-blue-700' },
  { id: 'salary', name: 'Maaş', icon: 'ğŸ‘¥', color: 'bg-green-100 text-green-700' },
  { id: 'electricity', name: 'Elektrik', icon: '⚡', color: 'bg-yellow-100 text-yellow-700' },
  { id: 'water', name: 'Su', icon: 'ğŸ’§', color: 'bg-cyan-100 text-cyan-700' },
  { id: 'internet', name: 'İnternet', icon: 'ğŸŒ', color: 'bg-purple-100 text-purple-700' },
  { id: 'phone', name: 'Telefon', icon: 'ğŸ“', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'maintenance', name: 'Bakım-Onarım', icon: 'ğŸ”§', color: 'bg-orange-100 text-orange-700' },
  { id: 'cleaning', name: 'Temizlik', icon: 'ğŸ§¹', color: 'bg-pink-100 text-pink-700' },
  { id: 'marketing', name: 'Pazarlama', icon: 'ğŸ“¢', color: 'bg-red-100 text-red-700' },
  { id: 'supplies', name: 'Malzeme', icon: 'ğŸ“¦', color: 'bg-gray-100 text-gray-700' },
  { id: 'transport', name: 'Ulaşım', icon: 'ğŸš—', color: 'bg-teal-100 text-teal-700' },
  { id: 'tax', name: 'Vergi', icon: '💰', color: 'bg-amber-100 text-amber-700' },
  { id: 'insurance', name: 'Sigorta', icon: 'ğŸ›¡ï¸', color: 'bg-lime-100 text-lime-700' },
  { id: 'other', name: 'Diğer', icon: 'ğŸ“‹', color: 'bg-slate-100 text-slate-700' },
];

export function ExpenseManagement() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStore, setFilterStore] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
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
    expense_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  useEffect(() => {
    loadExpenses();
    loadCostCenters();
  }, []);

  const loadCostCenters = async () => {
    try {
      const centers = await costCenterAPI.getAll();
      setCostCenters(centers);
    } catch (error) {
      console.error('Error loading cost centers:', error);
    }
  };

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const data = await expenseAPI.getAll({
        startDate: filterDateFrom,
        endDate: filterDateTo
      });
      setExpenses(data as ExpenseLocal[]);
    } catch (error) {
      console.error('Error loading expenses:', error);
    } finally {
      setLoading(false);
    }
  };

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
      expense_date: expense.expense_date,
      notes: expense.notes || '',
    });
    setShowExpenseModal(true);
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm('Bu gideri silmek istediğinizden emin misiniz?')) return;

    try {
      // TODO: API call
      // await supabase.from('expenses').delete().eq('id', expenseId);
      await loadExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
    }
  };

  const handleSaveExpense = async () => {
    try {
      const data = {
        ...formData,
        amount: parseFloat(formData.amount),
        created_by: '00000000-0000-0000-0000-000000000000' // Placeholder
      };

      if (editingExpense) {
        await expenseAPI.update(editingExpense.id, data as any);
      } else {
        await expenseAPI.create(data as any);
      }
      
      setShowExpenseModal(false);
      await loadExpenses();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Gider kaydedilirken bir hata oluştu.');
    }
  };

  const getCategoryInfo = (categoryId: string) => {
    return EXPENSE_CATEGORIES.find(c => c.id === categoryId) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
  };

  const columnHelper = createColumnHelper<ExpenseLocal>();

  const columns = [
    columnHelper.accessor('expense_date', {
      header: 'TARİH',
      cell: info => new Date(info.getValue()).toLocaleDateString('tr-TR'),
      size: 100
    }),
    columnHelper.accessor('category', {
      header: 'KATEGORİ',
      cell: info => {
        const cat = getCategoryInfo(info.getValue());
        return (
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${cat.color} inline-flex items-center gap-1`}>
            <span>{cat.icon}</span>
            <span>{cat.name}</span>
          </span>
        );
      },
      size: 150
    }),
    columnHelper.accessor('description', {
      header: 'AÇIKLAMA',
      cell: info => info.getValue(),
      size: 250
    }),
    columnHelper.accessor('amount', {
      header: 'TUTAR',
      cell: info => (
        <span className="font-medium text-red-600">
          {formatCurrency(info.getValue())}
        </span>
      ),
      size: 120
    }),
    columnHelper.accessor('payment_method', {
      header: 'ÖDEME',
      cell: info => {
        const method = info.getValue();
        const methods: Record<string, string> = {
          cash: 'Nakit',
          bank_transfer: 'Havale',
          credit_card: 'Kredi Kartı',
          check: 'Çek',
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
      header: 'MAĞAZA',
      cell: info => info.getValue() || '-',
      size: 120
    }),
    columnHelper.accessor('cost_center_name', {
      header: 'MASRAF MERKEZİ',
      cell: info => info.getValue() || '-',
      size: 150
    }),
    columnHelper.accessor('document_number', {
      header: 'BELGE NO',
      cell: info => info.getValue() || '-',
      size: 120
    }),
    columnHelper.display({
      id: 'actions',
      header: 'İŞLEMLER',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEditExpense(row.original)}
            className="p-2 hover:bg-blue-50 rounded transition-colors"
            title="Düzenle"
          >
            <Edit className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={() => handleDeleteExpense(row.original.id)}
            className="p-2 hover:bg-red-50 rounded transition-colors"
            title="Sil"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      ),
      size: 100
    }),
  ];

  // Calculate statistics
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const thisMonthExpenses = expenses
    .filter(e => new Date(e.expense_date).getMonth() === new Date().getMonth())
    .reduce((sum, e) => sum + e.amount, 0);
  const categoryBreakdown = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  // Filter expenses
  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = expense.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.document_number?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || expense.category === filterCategory;
    const matchesStore = filterStore === 'all' || expense.store_id === filterStore;
    const matchesDate = (!filterDateFrom || expense.expense_date >= filterDateFrom) &&
      (!filterDateTo || expense.expense_date <= filterDateTo);

    return matchesSearch && matchesCategory && matchesStore && matchesDate;
  });

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 p-6 bg-gradient-to-r from-red-50 to-orange-50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
              <Receipt className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Gider Yönetimi</h1>
              <p className="text-sm text-gray-600">Tüm giderleri takip edin ve yönetin</p>
            </div>
          </div>
          <button
            onClick={handleAddExpense}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Yeni Gider
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Gider ara (açıklama, belge no)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 border rounded-lg flex items-center gap-2 transition-colors ${showFilters ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-300 hover:bg-gray-50'
              }`}
          >
            <Filter className="w-5 h-5" />
            Filtrele
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                >
                  <option value="all">Tüm Kategoriler</option>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Başlangıç Tarihi</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bitiş Tarihi</label>
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
                    setFilterStore('all');
                    setFilterDateFrom('');
                    setFilterDateTo('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Temizle
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Statistics */}
      <div className="flex-shrink-0 p-6 grid grid-cols-4 gap-4 border-b border-gray-200">
        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 mb-1">Toplam Gider</p>
              <p className="text-2xl font-bold text-red-900">{formatCurrency(totalExpenses)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-red-600" />
          </div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-600 mb-1">Bu Ay</p>
              <p className="text-2xl font-bold text-orange-900">{formatCurrency(thisMonthExpenses)}</p>
            </div>
            <Calendar className="w-8 h-8 text-orange-600" />
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 mb-1">Gider Sayısı</p>
              <p className="text-2xl font-bold text-purple-900">{expenses.length}</p>
            </div>
            <Receipt className="w-8 h-8 text-purple-600" />
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 mb-1">Ortalama</p>
              <p className="text-2xl font-bold text-blue-900">
                {expenses.length > 0 ? formatCurrency(totalExpenses / expenses.length) : '-'}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 overflow-hidden p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Giderler yükleniyor...</p>
            </div>
          </div>
        ) : (
          <DevExDataGrid
            data={filteredExpenses}
            columns={columns}
            enablePagination={true}
            enableSorting={true}
            enableFiltering={false}
            pageSize={20}
          />
        )}
      </div>

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">
                  {editingExpense ? 'Gider Düzenle' : 'Yeni Gider Ekle'}
                </h2>
                <button
                  onClick={() => setShowExpenseModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kategori *
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">Kategori Seçin</option>
                      {EXPENSE_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tarih *
                    </label>
                    <input
                      type="date"
                      value={formData.expense_date}
                      onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Açıklama *
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Gider açıklaması"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tutar (IQD) *
                    </label>
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ödeme Yöntemi *
                    </label>
                    <select
                      value={formData.payment_method}
                      onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    >
                      <option value="cash">Nakit</option>
                      <option value="bank_transfer">Havale/EFT</option>
                      <option value="credit_card">Kredi Kartı</option>
                      <option value="check">Çek</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Belge No
                    </label>
                    <input
                      type="text"
                      value={formData.document_number}
                      onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                      placeholder="Fatura/Makbuz No"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Masraf Merkezi
                    </label>
                    <select
                      value={formData.cost_center_id}
                      onChange={(e) => setFormData({ ...formData, cost_center_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">Merkez Seçin</option>
                      {costCenters.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.name} ({cc.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notlar
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Ek notlar"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-2">Belge Yükle (Fatura, Makbuz)</p>
                  <button className="text-sm text-red-600 hover:text-red-700">
                    Dosya Seç
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowExpenseModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleSaveExpense}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  {editingExpense ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

