import { useState } from 'react';
import { Users, Search, Plus, Edit, Trash2, Phone, Mail, MapPin, TrendingUp, Calendar, FileText, Eye, X } from 'lucide-react';
import type { Customer, Sale } from '../../../App';
import { formatNumber } from '../../../utils/formatNumber';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { ContextMenu } from '../../shared/ContextMenu';
import { useCustomerStore } from '../../../store/useCustomerStore';
import { customerAPI } from '../../../services/api/customers';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';

interface CustomerManagementModuleProps {
  customers: Customer[];
  setCustomers: (customers: Customer[]) => void;
  sales: Sale[];
}

export function CustomerManagementModule({ customers, setCustomers, sales }: CustomerManagementModuleProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    customer: Customer | null;
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    taxNumber: '',
    taxOffice: '',
    company: ''
  });

  // Filter customers
  const filteredCustomers = customers.filter(c =>
    (c.code && c.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Calculate customer statistics
  const getCustomerStats = (customerId: string) => {
    const customerSales = sales.filter(s => s.customerId === customerId);
    const totalSpent = customerSales.reduce((sum, s) => sum + s.total, 0);
    const lastPurchase = customerSales.length > 0
      ? new Date(Math.max(...customerSales.map(s => new Date(s.date).getTime())))
      : null;

    return {
      totalPurchases: customerSales.length,
      totalSpent,
      lastPurchase,
      averageSpent: customerSales.length > 0 ? totalSpent / customerSales.length : 0
    };
  };

  // Handle add customer
  const handleAddCustomer = async () => {
    if (!formData.name || !formData.phone) {
      toast.error('Lütfen zorunlu alanları doldurun');
      return;
    }

    try {
      const addCustomer = useCustomerStore.getState().addCustomer;
      await addCustomer({
        code: formData.code,
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        taxNumber: formData.taxNumber,
        taxOffice: formData.taxOffice,
        company: formData.company,
        points: 0,
        totalSpent: 0
      } as any);

      toast.success('Müşteri eklendi');
      setShowAddModal(false);
      setFormData({
        code: '',
        name: '',
        phone: '',
        email: '',
        address: '',
        taxNumber: '',
        taxOffice: '',
        company: ''
      });
    } catch (error) {
      console.error('Error adding customer:', error);
      toast.error('Müşteri eklenemedi');
    }
  };

  // Handle edit customer
  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      code: customer.code || '',
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      taxNumber: customer.taxNumber || '',
      taxOffice: (customer as any).taxOffice || '',
      company: customer.company || ''
    });
    setShowAddModal(true);
  };

  // Handle update customer
  const handleUpdateCustomer = async () => {
    if (!selectedCustomer || !formData.name || !formData.phone) {
      toast.error('Lütfen zorunlu alanları doldurun');
      return;
    }

    try {
      const updateCustomer = useCustomerStore.getState().updateCustomer;
      await updateCustomer(selectedCustomer.id, {
        code: formData.code,
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        taxNumber: formData.taxNumber,
        taxOffice: formData.taxOffice,
        company: formData.company
      } as any);

      toast.success('Müşteri güncellendi');
      setShowAddModal(false);
      setSelectedCustomer(null);
      setFormData({
        code: '',
        name: '',
        phone: '',
        email: '',
        address: '',
        taxNumber: '',
        taxOffice: '',
        company: ''
      });
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('Müşteri güncellenemedi');
    }
  };

  // Handle delete customer
  const handleDeleteCustomer = async (customerId: string, customerName: string) => {
    if (confirm(`${customerName} müşterisini silmek istediğinize emin misiniz?`)) {
      try {
        const deleteCustomer = useCustomerStore.getState().deleteCustomer;
        await deleteCustomer(customerId);
        toast.success('Müşteri silindi');
      } catch (error) {
        console.error('Error deleting customer:', error);
        toast.error('Müşteri silinemedi');
      }
    }
  };

  // View customer details
  const handleViewDetails = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetailModal(true);
  };

  // Handle row right click
  const handleRowRightClick = (e: React.MouseEvent, customer: Customer) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      customer
    });
  };

  // Column definitions
  const columnHelper = createColumnHelper<Customer>();
  const columns: ColumnDef<Customer, any>[] = [
    columnHelper.accessor('code', {
      header: 'Kod',
      cell: info => <span className="font-mono text-xs text-blue-600 font-medium">{info.getValue() || '-'}</span >,
      size: 100
    }),
    columnHelper.accessor('name', {
      header: 'Müşteri Adı',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex flex-col">
            <span className="font-medium text-gray-900">{row.name}</span>
            {row.address && (
              <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />
                {row.address}
              </span>
            )}
          </div>
        );
      }
    }),
    columnHelper.accessor('phone', {
      header: 'İletişim',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3 text-gray-400" />
              {row.phone}
            </span>
            {row.email && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Mail className="w-3 h-3 text-gray-400" />
                {row.email}
              </span>
            )}
          </div>
        );
      }
    }),
    columnHelper.accessor('company', {
      header: 'Şirket/Vergi',
      cell: info => {
        const row = info.row.original;
        const taxOffice = row.taxOffice;
        return (
          <div className="flex flex-col text-sm">
            <span>{row.company || '-'}</span>
            <div className="flex gap-1">
              {row.taxNumber && <span className="text-xs text-gray-500">{row.taxNumber}</span>}
              {taxOffice && <span className="text-xs text-gray-400">({taxOffice})</span>}
            </div>
          </div>
        );
      }
    }),
    columnHelper.display({
      id: 'totalPurchases',
      header: 'Toplam Alışveriş',
      cell: ({ row }) => {
        const stats = getCustomerStats(row.original.id);
        return (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
            {stats.totalPurchases}
          </span>
        );
      },
      meta: { align: 'right' }
    }),
    columnHelper.display({
      id: 'totalSpent',
      header: 'Toplam Tutar',
      cell: ({ row }) => {
        const stats = getCustomerStats(row.original.id);
        return <span className="font-medium">{formatNumber(stats.totalSpent, 2, true)} IQD</span>;
      },
      meta: { align: 'right' }
    }),
    columnHelper.display({
      id: 'lastPurchase',
      header: 'Son Alışveriş',
      cell: ({ row }) => {
        const stats = getCustomerStats(row.original.id);
        if (!stats.lastPurchase) return <span className="text-gray-400 text-xs">-</span>;
        return (
          <div className="flex flex-col text-xs">
            <span>{stats.lastPurchase.toLocaleDateString('tr-TR')}</span>
            <span className="text-gray-500">{stats.lastPurchase.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        );
      }
    }),
    columnHelper.display({
      id: 'actions',
      header: 'İşlemler',
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleViewDetails(row.original); }}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Detayları Gör"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleEditCustomer(row.original); }}
            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
            title="Düzenle"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteCustomer(row.original.id, row.original.name); }}
            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Sil"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    })
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50" onClick={() => setContextMenu(null)}>
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl flex items-center gap-2 font-bold text-gray-800">
              <Users className="w-6 h-6 text-blue-600" />
              Müşteri Yönetimi
            </h2>
            <p className="text-sm text-gray-600 mt-1">Müşteri kayıtları ve işlem geçmişi</p>
          </div>
          <button
            onClick={async () => {
              setSelectedCustomer(null);
              setFormData({
                code: '',
                name: '',
                phone: '',
                email: '',
                address: '',
                taxNumber: '',
                taxOffice: '',
                company: ''
              });
              setShowAddModal(true);

              // Generate code
              try {
                const nextCode = await customerAPI.generateCode();
                setFormData(prev => ({ ...prev, code: nextCode }));
              } catch (err) {
                console.error('Failed to generate customer code:', err);
              }
            }}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 shadow-lg transition-all hover:shadow-xl font-medium"
          >
            <Plus className="w-5 h-5" />
            Yeni Müşteri
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Müşteri adı, telefon veya e-posta ile ara..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500 bg-white shadow-sm"
          />
        </div>
      </div>

      {/* Customer List */}
      <div className="flex-1 overflow-hidden px-6 pb-6 flex flex-col">
        <div className="flex-1 bg-white border rounded-lg shadow-sm overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
          <DevExDataGrid
            data={filteredCustomers}
            columns={columns}
            enableSorting
            enableFiltering={false}
            enableColumnResizing={true}
            onRowContextMenu={handleRowRightClick}
            onRowDoubleClick={handleViewDetails}
          />
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'view',
              label: t.viewDetails || 'Detayları Gör',
              icon: Eye,
              onClick: () => {
                if (contextMenu.customer) handleViewDetails(contextMenu.customer);
                setContextMenu(null);
              }
            },
            {
              id: 'edit',
              label: t.edit || 'Düzenle',
              icon: Edit,
              onClick: () => {
                if (contextMenu.customer) handleEditCustomer(contextMenu.customer);
                setContextMenu(null);
              }
            },
            {
              id: 'delete',
              label: t.deleteAction || 'Sil',
              icon: Trash2,
              onClick: () => {
                if (contextMenu.customer) handleDeleteCustomer(contextMenu.customer.id, contextMenu.customer.name);
                setContextMenu(null);
              },
              variant: 'danger'
            }
          ]}
        />
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] backdrop-blur-md" onClick={(e) => {
          if (e.target === e.currentTarget) setShowAddModal(false);
        }}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-800">
                {selectedCustomer ? 'Müşteri Düzenle' : 'Yeni Müşteri Ekle'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full p-1 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri Kodu</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Müşteri kodunu girin"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri Adı <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Müşteri adını girin"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0(555) 555 55 55"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="musteri@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Adres bilgisi"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Şirket Adı</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Şirket adı"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vergi Numarası</label>
                  <input
                    type="text"
                    value={formData.taxNumber}
                    onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Vergi/TC No"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vergi Dairesi</label>
                  <input
                    type="text"
                    value={formData.taxOffice}
                    onChange={(e) => setFormData({ ...formData, taxOffice: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Vergi dairesi"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedCustomer(null);
                  setFormData({
                    code: '',
                    name: '',
                    phone: '',
                    email: '',
                    address: '',
                    taxNumber: '',
                    taxOffice: '',
                    company: ''
                  });
                }}
                className="px-4 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
              >
                İptal
              </button>
              <button
                onClick={selectedCustomer ? handleUpdateCustomer : handleAddCustomer}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
              >
                {selectedCustomer ? 'Güncelle' : 'Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] backdrop-blur-md" onClick={(e) => {
          if (e.target === e.currentTarget) setShowDetailModal(false);
        }}>
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-800">Müşteri Detayları</h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full p-1 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Müşteri Adı</p>
                    <p className="text-lg font-medium text-gray-900">{selectedCustomer.name}</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg flex-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Telefon</p>
                      <p className="text-gray-900">{selectedCustomer.phone}</p>
                    </div>
                    {selectedCustomer.email && (
                      <div className="bg-gray-50 p-4 rounded-lg flex-1">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">E-posta</p>
                        <p className="text-gray-900">{selectedCustomer.email}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {(selectedCustomer.company || selectedCustomer.taxNumber) && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Kurumsal Bilgiler</p>
                      <div className="space-y-2">
                        {selectedCustomer.company && <p className="text-gray-900"><span className="text-gray-500 w-24 inline-block">Şirket:</span> {selectedCustomer.company}</p>}
                        {selectedCustomer.taxNumber && <p className="text-gray-900"><span className="text-gray-500 w-24 inline-block">Vergi No:</span> {selectedCustomer.taxNumber}</p>}
                        {(selectedCustomer as any).taxOffice && <p className="text-gray-900"><span className="text-gray-500 w-24 inline-block">Vergi Dairesi:</span> {(selectedCustomer as any).taxOffice}</p>}
                      </div>
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Adres</p>
                      <p className="text-gray-900">{selectedCustomer.address}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Purchase History */}
              <div className="border-t pt-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  Alışveriş Geçmişi
                </h4>
                <div className="space-y-3">
                  {sales
                    .filter(s => s.customerId === selectedCustomer.id)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map(sale => (
                      <div key={sale.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className="bg-white p-2 rounded-full shadow-sm text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">Fiş No: {sale.receiptNumber}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3" />
                              {new Date(sale.date).toLocaleString('tr-TR')}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-lg font-bold text-gray-900">{formatNumber(sale.total, 2, false)}</p>
                          <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
                            <span className="bg-white px-2 py-0.5 rounded border border-gray-200">
                              {sale.items.length} ürün
                            </span>
                            <span className="bg-white px-2 py-0.5 rounded border border-gray-200 uppercase">
                              {sale.paymentMethod === 'cash' ? 'Nakit' : 'Kart'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  {sales.filter(s => s.customerId === selectedCustomer.id).length === 0 && (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      Bu müşteriye ait henüz alışveriş kaydı bulunmamaktadır.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedCustomer(null);
                }}
                className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-sm font-medium"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
