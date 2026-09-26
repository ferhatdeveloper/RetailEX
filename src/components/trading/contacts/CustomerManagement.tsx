import { useState, useMemo } from 'react';
import { Users, Plus, Search, Mail, Phone, Edit, Trash2, MapPin, TrendingUp, ShoppingBag, User } from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import type { Customer, Sale } from '../../../App';
import { useCustomerStore } from '../../../store/useCustomerStore';
import { compareFileIdAsc, sortByFileIdAsc } from '../../../utils/customerFileIdSort';
import { useLanguage } from '../../../contexts/LanguageContext';

interface CustomerManagementProps {
  customers: Customer[];
  setCustomers: (customers: Customer[]) => void;
  sales?: Sale[];
}

export function CustomerManagement({ customers, setCustomers, sales = [] }: CustomerManagementProps) {
  const { tm } = useLanguage();
  const defaultHeardFrom = ['Instagram', tm('custHeardReferral'), 'Google', 'Facebook', tm('custHeardOther')];
  const addCustomer = useCustomerStore((state) => state.addCustomer);
  const updateCustomer = useCustomerStore((state) => state.updateCustomer);
  const deleteCustomerFromStore = useCustomerStore((state) => state.deleteCustomer);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [heardFromOptions, setHeardFromOptions] = useState<string[]>(defaultHeardFrom);
  const [heardFromDraft, setHeardFromDraft] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    phone2: '',
    birth_date: '',
    file_id: '',
    gender: '',
    customer_tier: 'normal',
    occupation: '',
    heard_from: '',
    email: '',
    address: '',
    notes: ''
  });

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const list = customers.filter(customer =>
      customer.name.toLowerCase().includes(q) ||
      customer.phone.includes(searchQuery) ||
      (customer.email || '').toLowerCase().includes(q) ||
      (customer.file_id || '').includes(searchQuery)
    );
    return sortByFileIdAsc(list);
  }, [customers, searchQuery]);

  const openModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone,
        phone2: customer.phone2 || '',
        birth_date: customer.birth_date ? String(customer.birth_date).slice(0, 10) : '',
        file_id: customer.file_id || '',
        gender: customer.gender || '',
        customer_tier: customer.customer_tier || 'normal',
        occupation: customer.occupation || '',
        heard_from: customer.heard_from || '',
        email: customer.email,
        address: customer.address,
        notes: customer.notes || ''
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: '',
        phone: '',
        phone2: '',
        birth_date: '',
        file_id: '',
        gender: '',
        customer_tier: 'normal',
        occupation: '',
        heard_from: '',
        email: '',
        address: '',
        notes: ''
      });
    }
    setShowModal(true);
  };

  const addHeardFromOption = () => {
    const candidate = heardFromDraft.trim();
    if (!candidate) return;
    setHeardFromOptions((prev) => (prev.includes(candidate) ? prev : [...prev, candidate]));
    setFormData((prev) => ({ ...prev, heard_from: candidate }));
    setHeardFromDraft('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingCustomer) {
      updateCustomer(editingCustomer.id, {
        ...formData,
        birth_date: formData.birth_date.trim() === '' ? null : formData.birth_date.trim(),
      });
    } else {
      const newCustomer: Customer = {
        ...formData,
        id: String(Date.now()),
        birth_date: formData.birth_date.trim() === '' ? null : formData.birth_date.trim(),
        totalPurchases: 0
      };
      addCustomer(newCustomer);
    }
    
    setShowModal(false);
  };

  const deleteCustomer = (id: string) => {
    if (confirm(tm('custDeleteConfirmSimple'))) {
      setCustomers(customers.filter(c => c.id !== id));
      deleteCustomerFromStore(id);
      if (selectedCustomer?.id === id) {
        setSelectedCustomer(null);
      }
    }
  };

  const getCustomerSales = (customerId: string) => {
    return sales.filter(sale => sale.customerId === customerId);
  };

  const columnHelper = createColumnHelper<Customer>();

  const columns = [
    columnHelper.accessor('file_id', {
      header: tm('custColFileNo'),
      cell: info => info.getValue() || '—',
      sortingFn: (a, b) => compareFileIdAsc(a.original.file_id, b.original.file_id),
      size: 90,
    }),
    columnHelper.accessor('name', {
      header: tm('custColNameUpper'),
      cell: info => info.getValue(),
      size: 200
    }),
    columnHelper.accessor('phone', {
      header: tm('custColPhone'),
      cell: info => info.getValue(),
      size: 140
    }),
    columnHelper.accessor('email', {
      header: tm('custColEmail'),
      cell: info => info.getValue(),
      size: 200
    }),
    columnHelper.accessor('address', {
      header: tm('custColAddress'),
      cell: info => info.getValue(),
      size: 250
    }),
    columnHelper.accessor('totalPurchases', {
      header: tm('custColPurchasesUpper'),
      cell: info => info.getValue()?.toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
      size: 160
    }),
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <h2 className="text-sm">{tm('custMgmtTitle')}</h2>
            <span className="text-blue-100 text-[10px] ml-2">• {tm('custCountLabel').replace('{count}', String(customers.length))}</span>
          </div>
          <button
            onClick={() => openModal()}
            className="flex items-center gap-1 px-2 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px]"
          >
            <Plus className="w-3 h-3" />
            <span>{tm('custMgmtNewBtn')}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-3 bg-gray-50">
        <div className="bg-white border border-gray-200">
          <DevExDataGrid
            data={filteredCustomers}
            columns={columns}
            onRowDoubleClick={(customer) => openModal(customer)}
            height="calc(100vh - 120px)"
            pageSize={50}
            enableSelection={true}
            initialSorting={[{ id: 'file_id', desc: false }]}
          />
        </div>
      </div>

      {/* Customer Detail Panel */}
      {selectedCustomer && (
        <div className="w-96 bg-white border-l flex flex-col">
          <div className="p-6 border-b bg-gradient-to-br from-blue-600 to-blue-700 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-2xl">
                {selectedCustomer.name.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-white/80 hover:text-white"
              >
                ✕
              </button>
            </div>
            <h3 className="text-xl mb-1">{selectedCustomer.name}</h3>
            <p className="text-blue-100 text-sm">{tm('custDetails')}</p>
          </div>

          <div className="p-6 border-b bg-gray-50">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-gray-600" />
                <span className="text-gray-700">{selectedCustomer.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-gray-600" />
                <span className="text-gray-700">{selectedCustomer.email}</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 text-gray-600 mt-0.5" />
                <span className="text-gray-700">{selectedCustomer.address}</span>
              </div>
            </div>
          </div>

          <div className="p-6 border-b">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-green-500 to-green-600 p-4 rounded-lg text-white">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4" />
                  <p className="text-sm opacity-90">{tm('custColTotalPurchases')}</p>
                </div>
                <p className="text-2xl">{selectedCustomer.totalPurchases.toFixed(2)}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-lg text-white">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingBag className="w-4 h-4" />
                  <p className="text-sm opacity-90">{tm('custPurchaseCount')}</p>
                </div>
                <p className="text-2xl">{getCustomerSales(selectedCustomer.id).length}</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <h4 className="mb-4 text-gray-700">{tm('custSalesHistory')}</h4>
            <div className="space-y-3">
              {getCustomerSales(selectedCustomer.id).map(sale => (
                <div key={sale.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm text-gray-600">
                        {new Date(sale.date).toLocaleDateString('tr-TR')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(sale.date).toLocaleTimeString('tr-TR')}
                      </p>
                    </div>
                    <span className="text-blue-600">{sale.total.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>{tm('custSlipNo')} {sale.id}</p>
                    <p>{tm('custSaleItemsLine').replace('{count}', String(sale.items.length)).replace('{method}', String(sale.paymentMethod))}</p>
                  </div>
                </div>
              ))}
              {getCustomerSales(selectedCustomer.id).length === 0 && (
                <p className="text-gray-400 text-sm text-center py-8">
                  {tm('custNoSalesYet')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal - Minimal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl">
            <div className="p-3 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white flex items-center justify-between">
              <h3 className="text-base">
                {editingCustomer ? tm('custModalEditTitle') : tm('custNewRecord')}
              </h3>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{tm('custFullNameRequired')}</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">{tm('custPhone1Required')}</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">{tm('custPhone2Optional')}</label>
                    <input
                      type="tel"
                      value={formData.phone2}
                      onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
                      placeholder={tm('custPhPhone2')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">{tm('custLabelBirthDate')}</label>
                    <input
                      type="date"
                      value={formData.birth_date}
                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">{tm('custColFileNo')}</label>
                    <input
                      type="text"
                      value={formData.file_id}
                      onChange={(e) => setFormData({ ...formData, file_id: e.target.value })}
                      placeholder={tm('custPhFileId')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">{tm('custLabelGender')}</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">{tm('custGenderSelect')}</option>
                      <option value="erkek">{tm('custGenderMale')}</option>
                      <option value="kadin">{tm('custGenderFemale')}</option>
                      <option value="diger">{tm('custGenderOther')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">{tm('custLabelTier')}</label>
                    <select
                      value={formData.customer_tier}
                      onChange={(e) => setFormData({ ...formData, customer_tier: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="normal">{tm('custTierNormal')}</option>
                      <option value="vip">{tm('custTierVip')}</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">{tm('custLabelOccupation')}</label>
                    <input
                      type="text"
                      value={formData.occupation}
                      onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                      placeholder={tm('custPhOccupation')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">{tm('custEmailRequired')}</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{tm('custLabelHeardFrom')}</label>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <select
                      value={formData.heard_from}
                      onChange={(e) => setFormData({ ...formData, heard_from: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">{tm('custGenderSelect')}</option>
                      {heardFromOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addHeardFromOption}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-semibold"
                    >
                      + {tm('add')}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={heardFromDraft}
                    onChange={(e) => setHeardFromDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addHeardFromOption();
                      }
                    }}
                    placeholder={tm('custPhHeardFrom')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{tm('custLabelAddress')}</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{tm('custLabelAbout')}</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    placeholder={tm('custPhAbout')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {tm('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingCustomer ? tm('update') : tm('custSaveCustomer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
