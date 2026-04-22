import { useState } from 'react';
import { Users, Plus, Search, Mail, Phone, Edit, Trash2, MapPin, TrendingUp, ShoppingBag, User } from 'lucide-react';
import { DevExDataGrid } from './DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import type { Customer, Sale } from '../../../App';
import { useCustomerStore } from '../store';

interface CustomerManagementProps {
  customers: Customer[];
  setCustomers: (customers: Customer[]) => void;
  sales?: Sale[];
}

const DEFAULT_HEARD_FROM_OPTIONS = ['Instagram', 'Tavsiye', 'Google', 'Facebook', 'Diğer'];

export function CustomerManagement({ customers, setCustomers, sales = [] }: CustomerManagementProps) {
  const addCustomer = useCustomerStore((state) => state.addCustomer);
  const updateCustomer = useCustomerStore((state) => state.updateCustomer);
  const deleteCustomerFromStore = useCustomerStore((state) => state.deleteCustomer);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [heardFromOptions, setHeardFromOptions] = useState<string[]>(DEFAULT_HEARD_FROM_OPTIONS);
  const [heardFromDraft, setHeardFromDraft] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    phone2: '',
    age: '',
    file_id: '',
    gender: '',
    customer_tier: 'normal',
    occupation: '',
    heard_from: '',
    email: '',
    address: '',
    notes: ''
  });

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.phone.includes(searchQuery) ||
    customer.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone,
        phone2: customer.phone2 || '',
        age: customer.age != null ? String(customer.age) : '',
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
        age: '',
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
        age: formData.age.trim() === '' ? null : Number(formData.age)
      });
    } else {
      const newCustomer: Customer = {
        ...formData,
        id: String(Date.now()),
        age: formData.age.trim() === '' ? null : Number(formData.age),
        totalPurchases: 0
      };
      addCustomer(newCustomer);
    }
    
    setShowModal(false);
  };

  const deleteCustomer = (id: string) => {
    if (confirm('Bu müşteriyi silmek istediğinizden emin misiniz?')) {
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
    columnHelper.accessor('name', {
      header: 'MÜŞTERİ ADI',
      cell: info => info.getValue(),
      size: 200
    }),
    columnHelper.accessor('phone', {
      header: 'TELEFON',
      cell: info => info.getValue(),
      size: 140
    }),
    columnHelper.accessor('email', {
      header: 'E-POSTA',
      cell: info => info.getValue(),
      size: 200
    }),
    columnHelper.accessor('address', {
      header: 'ADRES',
      cell: info => info.getValue(),
      size: 250
    }),
    columnHelper.accessor('totalPurchases', {
      header: 'TOPLAM ALIŞVERİŞ',
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
            <h2 className="text-sm">Müşteri Yönetimi</h2>
            <span className="text-blue-100 text-[10px] ml-2">• {customers.length} müşteri</span>
          </div>
          <button
            onClick={() => openModal()}
            className="flex items-center gap-1 px-2 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px]"
          >
            <Plus className="w-3 h-3" />
            <span>Yeni Müşteri</span>
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
            <p className="text-blue-100 text-sm">Müşteri Detayları</p>
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
                  <p className="text-sm opacity-90">Toplam Alışveriş</p>
                </div>
                <p className="text-2xl">{selectedCustomer.totalPurchases.toFixed(2)}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-lg text-white">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingBag className="w-4 h-4" />
                  <p className="text-sm opacity-90">Alışveriş Sayısı</p>
                </div>
                <p className="text-2xl">{getCustomerSales(selectedCustomer.id).length}</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <h4 className="mb-4 text-gray-700">Satış Geçmişi</h4>
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
                    <p>Fiş No: {sale.id}</p>
                    <p>{sale.items.length} ürün - {sale.paymentMethod}</p>
                  </div>
                </div>
              ))}
              {getCustomerSales(selectedCustomer.id).length === 0 && (
                <p className="text-gray-400 text-sm text-center py-8">
                  Henüz satış geçmişi yok
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
                {editingCustomer ? 'Müşteri Düzenle' : 'Yeni Kayıt'}
              </h3>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Ad Soyad *</label>
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
                    <label className="block text-sm text-gray-700 mb-1">Telefon 1 *</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Telefon 2 (isteğe bağlı)</label>
                    <input
                      type="tel"
                      value={formData.phone2}
                      onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
                      placeholder="İkinci telefon (isteğe bağlı)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Yaş</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.age}
                      onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                      placeholder="Örn. 35"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Dosya No</label>
                    <input
                      type="text"
                      value={formData.file_id}
                      onChange={(e) => setFormData({ ...formData, file_id: e.target.value })}
                      placeholder="Dosya / kart no"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Cinsiyet</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Seçiniz</option>
                      <option value="erkek">Erkek</option>
                      <option value="kadin">Kadın</option>
                      <option value="diger">Diğer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Müşteri Tipi</label>
                    <select
                      value={formData.customer_tier}
                      onChange={(e) => setFormData({ ...formData, customer_tier: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="normal">Normal</option>
                      <option value="vip">VIP</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Meslek</label>
                    <input
                      type="text"
                      value={formData.occupation}
                      onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                      placeholder="Meslek veya unvan"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">E-posta *</label>
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
                  <label className="block text-sm text-gray-700 mb-1">Bizi nereden duydunuz?</label>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <select
                      value={formData.heard_from}
                      onChange={(e) => setFormData({ ...formData, heard_from: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Seçiniz</option>
                      {heardFromOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addHeardFromOption}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-semibold"
                    >
                      + Ekle
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
                    placeholder="Örn. Instagram, tavsiye, Google..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Adres</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Müşteri Hakkında</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    placeholder="Tercihler, notlar, özel durumlar..."
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
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingCustomer ? 'Güncelle' : 'Müşteriyi Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
