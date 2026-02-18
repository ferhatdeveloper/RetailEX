import { useState, useEffect } from 'react';
import { formatNumber } from '../../../utils/formatNumber';
import { Truck, Users, Plus, X, Search, Edit, Trash2, Mail, Phone, MapPin } from 'lucide-react';
import { supplierAPI, type Supplier } from '../../../services/api/suppliers';
import { toast } from 'sonner';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { ContextMenu } from '../../shared/ContextMenu';

export function SupplierModule() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    supplier: Supplier | null;
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    payment_terms: 30,
    credit_limit: 0,
    tax_number: '',
    tax_office: '',
    notes: '',
    cardType: 'supplier' as 'customer' | 'supplier',
  });

  // Load suppliers on mount
  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const data = await supplierAPI.getAll();
      setSuppliers(data);
    } catch (error: any) {
      console.error('Error loading suppliers:', error);
      toast.error(error.message || 'Tedarikçiler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Filter suppliers
  const filteredSuppliers = suppliers.filter(s => {
    const searchLower = searchQuery.toLowerCase();
    return (s.name?.toLowerCase() || '').includes(searchLower) ||
      (s.code?.toLowerCase() || '').includes(searchLower) ||
      (s.phone || '').includes(searchQuery) ||
      (s.email?.toLowerCase() || '').includes(searchLower);
  });

  // Open add modal
  const handleAddClick = () => {
    setFormData({
      code: '',
      name: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      payment_terms: 30,
      credit_limit: 0,
      tax_number: '',
      tax_office: '',
      notes: '',
      cardType: 'supplier',
    });
    setEditingSupplier(null);
    setShowAddModal(true);

    // Generate code for the default type
    supplierAPI.generateCode('supplier')
      .then((code: string) => {
        setFormData(prev => ({ ...prev, code }));
      })
      .catch(() => {
        setFormData(prev => ({ ...prev, code: `TED${Date.now().toString().slice(-6)}` }));
      });
  };

  // Open edit modal
  const handleEditClick = (supplier: Supplier) => {
    setFormData({
      code: supplier.code || '',
      name: supplier.name,
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      city: supplier.city || '',
      payment_terms: supplier.payment_terms || 30,
      credit_limit: supplier.credit_limit || 0,
      tax_number: supplier.tax_number || '',
      tax_office: supplier.tax_office || '',
      notes: supplier.notes || '',
      cardType: supplier.cardType || 'supplier',
    });
    setEditingSupplier(supplier);
    setShowAddModal(true);
  };

  // Handle save
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error(`${formData.cardType === 'customer' ? 'Müşteri' : 'Tedarikçi'} adı gerekli!`);
      return;
    }

    try {
      if (editingSupplier) {
        await supplierAPI.update(editingSupplier.id, formData);
        toast.success('Cari hesap güncellendi');
      } else {
        await supplierAPI.create(formData);
        toast.success('Cari hesap eklendi');
      }
      setShowAddModal(false);
      loadSuppliers();
    } catch (error: any) {
      console.error('Error saving account:', error);
      toast.error(error.message || 'Kayıt başarısız oldu');
    }
  };

  // Handle delete
  const handleDelete = async (id: string, name: string, cardType: 'customer' | 'supplier') => {
    if (!confirm(`${name} ${cardType === 'customer' ? 'müşterisini' : 'tedarikçisini'} silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      await supplierAPI.delete(id, cardType);
      toast.success('Cari hesap silindi');
      loadSuppliers();
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error(error.message || 'Cari hesap silinemedi');
    }
  };

  // Handle row right click
  const handleRowRightClick = (e: React.MouseEvent, supplier: Supplier) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      supplier
    });
  };

  // Column definitions
  const columnHelper = createColumnHelper<Supplier>();
  const columns: any[] = [
    columnHelper.accessor('code', {
      header: 'KOD',
      cell: info => <span className="font-mono text-xs text-blue-600 font-medium">{info.getValue() || '-'}</span>,
      size: 100
    }),
    columnHelper.accessor('cardType', {
      header: 'HESAP TÜRÜ',
      cell: info => {
        const type = info.getValue() as 'customer' | 'supplier';
        return (
          <div className="flex items-center gap-2">
            {type === 'customer' ? (
              <Users className="w-4 h-4 text-blue-600" />
            ) : (
              <Truck className="w-4 h-4 text-orange-600" />
            )}
            <span className="text-[10px] font-black uppercase tracking-wider">
              {type === 'customer' ? 'Müşteri' : 'Tedarikçi'}
            </span>
          </div>
        );
      },
      size: 120
    }),
    columnHelper.accessor('name', {
      header: 'CARİ HESAP ÜNVANI',
      cell: info => <span className="font-bold text-gray-800">{info.getValue()}</span>
    }),
    columnHelper.accessor('phone', {
      header: 'İLETİŞİM',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex flex-col text-xs text-gray-600">
            {row.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {row.phone}</div>}
            {row.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> {row.email}</div>}
            {row.city && <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {row.city}</div>}
          </div>
        );
      }
    }),
    columnHelper.accessor('balance', {
      header: 'BAKİYE',
      cell: info => {
        const val = info.getValue() || 0;
        const absVal = Math.abs(val);
        const type = val > 0 ? 'B' : val < 0 ? 'A' : '';
        const colorClass = val > 0 ? 'text-green-600' : val < 0 ? 'text-red-700' : 'text-gray-600';

        return (
          <div className="flex items-center justify-end gap-1.5 font-bold">
            <span className={colorClass}>
              {formatNumber(absVal, 2, true)} IQD
            </span>
            {type && (
              <span className={`text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black ${val > 0 ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                {type}
              </span>
            )}
          </div>
        );
      },
      meta: {
        align: 'right'
      }
    }),
    columnHelper.display({
      id: 'actions',
      header: 'İŞLEMLER',
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleEditClick(row.original); }}
            className="p-1 hover:bg-blue-100 rounded transition-colors"
            title="Düzenle"
          >
            <Edit className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(row.original.id, row.original.name, row.original.cardType || 'supplier'); }}
            className="p-1 hover:bg-red-100 rounded transition-colors"
            title="Sil"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      )
    })
  ];

  return (
    <div className="h-full flex flex-col" onClick={() => setContextMenu(null)}>
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-4 py-4 flex-shrink-0 shadow-lg border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2 rounded-xl">
              <Users className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tighter uppercase">Cari Hesaplar / Tedarikçiler</h2>
              <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase -mt-1">Müşteri ve Tedarikçi Yönetim Konsolu</p>
            </div>
            <span className="bg-indigo-600/30 text-indigo-200 text-[10px] font-black px-3 py-1 rounded-full border border-indigo-500/30 ml-2">
              {suppliers.length} TOPLAM CARİ
            </span>
          </div>
          <button
            onClick={handleAddClick}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 transition-all text-white text-sm rounded-xl font-black shadow-lg shadow-indigo-500/20 active:scale-95 border border-indigo-400/50"
          >
            <Plus className="w-5 h-5" />
            <span className="uppercase tracking-tighter">Yeni Cari Hesap</span>
          </button>
        </div>
      </div>

      {/* Grid Area */}
      <div className="flex-1 overflow-hidden p-4 bg-gray-50 flex flex-col gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tedarikçi adı, kod, telefon veya e-posta ile ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          />
        </div>

        {/* Data Grid */}
        <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
          <DevExDataGrid
            data={filteredSuppliers}
            columns={columns}
            enableSorting
            enableFiltering={false}
            enableColumnResizing={true}
            onRowContextMenu={handleRowRightClick}
            onRowDoubleClick={handleEditClick}
          />
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onEdit={() => {
            if (contextMenu.supplier) handleEditClick(contextMenu.supplier);
            setContextMenu(null);
          }}
          onDelete={() => {
            if (contextMenu.supplier) handleDelete(contextMenu.supplier.id, contextMenu.supplier.name, contextMenu.supplier.cardType || 'supplier');
            setContextMenu(null);
          }}
        />
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] p-4 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">
                  {editingSupplier ? 'Cari Hesap Düzenle' : 'Yeni Cari Hesap Ekle'}
                </h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest -mt-0.5">
                  {formData.cardType === 'customer' ? 'Müşteri Kaydı' : 'Tedarikçi Kaydı'}
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg p-2 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto bg-slate-50/30">
              {/* Type Selection */}
              {!editingSupplier && (
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Hesap Türü Seçimi</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        const newCode = await supplierAPI.generateCode('customer');
                        setFormData({ ...formData, cardType: 'customer', code: newCode });
                      }}
                      className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all ${formData.cardType === 'customer'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md'
                        : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'
                        }`}
                    >
                      <Users className={`w-5 h-5 ${formData.cardType === 'customer' ? 'text-indigo-600' : 'text-gray-400'}`} />
                      <div className="text-left">
                        <div className="text-sm font-black uppercase">Müşteri</div>
                        <div className="text-[10px] font-bold opacity-60">Satış Yapılan Cari</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const newCode = await supplierAPI.generateCode('supplier');
                        setFormData({ ...formData, cardType: 'supplier', code: newCode });
                      }}
                      className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all ${formData.cardType === 'supplier'
                        ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-md'
                        : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'
                        }`}
                    >
                      <Truck className={`w-5 h-5 ${formData.cardType === 'supplier' ? 'text-orange-500' : 'text-gray-400'}`} />
                      <div className="text-left">
                        <div className="text-sm font-black uppercase">Tedarikçi</div>
                        <div className="text-[10px] font-bold opacity-60">Alım Yapılan Cari</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {formData.cardType === 'customer' ? 'Müşteri Kodu' : 'Tedarikçi Kodu'}
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Otomatik Üretilir"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {formData.cardType === 'customer' ? 'Müşteri Adı' : 'Tedarikçi Adı'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Şehir</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ödeme Vadesi (Gün)</label>
                  <input
                    type="number"
                    value={formData.payment_terms}
                    onChange={(e) => setFormData({ ...formData, payment_terms: parseInt(e.target.value) || 30 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kredi Limiti</label>
                  <input
                    type="number"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vergi Numarası</label>
                  <input
                    type="text"
                    value={formData.tax_number}
                    onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vergi Dairesi</label>
                <input
                  type="text"
                  value={formData.tax_office}
                  onChange={(e) => setFormData({ ...formData, tax_office: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  rows={3}
                />
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
              >
                {editingSupplier ? 'Değişiklikleri Kaydet' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

