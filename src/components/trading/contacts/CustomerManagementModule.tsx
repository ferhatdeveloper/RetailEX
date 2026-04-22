import { useState, useEffect, useMemo } from 'react';
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
import { DEMO_CUSTOMER_CODES } from '../../../utils/demoSeedCodes';

interface CustomerManagementModuleProps {
  customers: Customer[];
  setCustomers: (customers: Customer[]) => void;
  sales: Sale[];
}

const emptyCustomerForm = () => ({
  code: '',
  name: '',
  phone: '',
  city: '',
  phone2: '',
  age: '',
  file_id: '',
  gender: '',
  customer_tier: 'normal',
  heard_from: '',
  email: '',
  address: '',
  occupation: '',
  notes: '',
  taxNumber: '',
  taxOffice: '',
  company: ''
});

function parseAgeInput(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n) || n < 0 || n > 150) return undefined;
  return n;
}

export function CustomerManagementModule({ customers, setCustomers, sales }: CustomerManagementModuleProps) {
  const { t, tm, language } = useLanguage();
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
  const [formData, setFormData] = useState(emptyCustomerForm);

  const normalizePhoneCandidates = (rawPhone: string): string[] => {
    const digits = rawPhone.replace(/\D/g, '');
    const tail10 = digits.length >= 10 ? digits.slice(-10) : digits;
    return Array.from(
      new Set(
        [rawPhone, digits, tail10, `0${tail10}`, `90${tail10}`, `+90${tail10}`]
          .map((v) => v.trim())
          .filter(Boolean)
      )
    );
  };

  const openAddModalWithPhone = async (phone: string) => {
    setSelectedCustomer(null);
    setFormData({
      ...emptyCustomerForm(),
      phone: phone.trim()
    });
    setShowAddModal(true);
    try {
      const nextCode = await customerAPI.generateCode();
      setFormData(prev => ({ ...prev, code: nextCode }));
    } catch {
      // no-op
    }
  };

  const handleCallerIdCustomerOpen = async (rawPhone: string, forceCreate = false) => {
    const phone = rawPhone.trim();
    if (!phone) return;
    setSearchQuery(phone);
    if (forceCreate) {
      await openAddModalWithPhone(phone);
      return;
    }
    const candidates = normalizePhoneCandidates(phone);
    for (const c of candidates) {
      const found = await customerAPI.getByPhone(c);
      if (found) {
        setSelectedCustomer(found);
        setShowDetailModal(true);
        toast.success(tm('custCallerFound'), {
          description: `${found.name} ${tm('custCallerFoundDesc')}`,
        });
        return;
      }
    }
    toast.info(tm('custCallerNotFound'), {
      description: tm('custCallerNotFoundDesc'),
    });
    await openAddModalWithPhone(phone);
  };

  useEffect(() => {
    const fromStorage = localStorage.getItem('callerid_customer_phone')?.trim();
    if (fromStorage) {
      localStorage.removeItem('callerid_customer_phone');
      void handleCallerIdCustomerOpen(fromStorage);
    }
    const onCallerId = (ev: Event) => {
      const custom = ev as CustomEvent<{ phone?: string; forceCreate?: boolean }>;
      const phone = custom.detail?.phone?.trim();
      const forceCreate = custom.detail?.forceCreate === true;
      if (phone) void handleCallerIdCustomerOpen(phone, forceCreate);
    };
    window.addEventListener('callerid-open-customer', onCallerId);
    return () => window.removeEventListener('callerid-open-customer', onCallerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter customers
  const q = searchQuery.toLowerCase();
  /** Listede bulunan demo müşteriler — 001_demo_data.sql kodları */
  const demoCustomersInList = useMemo(
    () => customers.filter(c => c.code && DEMO_CUSTOMER_CODES.has(String(c.code).trim())),
    [customers]
  );

  const filteredCustomers = customers.filter(c =>
    (c.code && c.code.toLowerCase().includes(q)) ||
    c.name.toLowerCase().includes(q) ||
    c.phone.toLowerCase().includes(q) ||
    (c.phone2 && c.phone2.toLowerCase().includes(q)) ||
    (c.email && c.email.toLowerCase().includes(q)) ||
    (c.address && c.address.toLowerCase().includes(q)) ||
    (c.notes && c.notes.toLowerCase().includes(q)) ||
    (c.occupation && c.occupation.toLowerCase().includes(q)) ||
    (c.gender && c.gender.toLowerCase().includes(q)) ||
    (c.customer_tier && c.customer_tier.toLowerCase().includes(q)) ||
    (c.heard_from && c.heard_from.toLowerCase().includes(q)) ||
    (c.age != null && String(c.age).includes(searchQuery.trim()))
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
      toast.error(tm('custToastRequired'));
      return;
    }

    try {
      const addCustomer = useCustomerStore.getState().addCustomer;
      const trimmedAge = formData.age.trim();
      const ageVal =
        trimmedAge === '' ? undefined : parseAgeInput(formData.age);
      await addCustomer({
        code: formData.code,
        name: formData.name,
        phone: formData.phone,
        city: formData.city.trim() || undefined,
        phone2: formData.phone2.trim() || undefined,
        email: formData.email,
        address: formData.address,
        notes: formData.notes.trim() || undefined,
        occupation: formData.occupation.trim() || undefined,
        file_id: formData.file_id.trim() || undefined,
        age: ageVal,
        gender: formData.gender.trim() || undefined,
        customer_tier: formData.customer_tier === 'vip' ? 'vip' : 'normal',
        heard_from: formData.heard_from.trim() || undefined,
        taxNumber: formData.taxNumber,
        taxOffice: formData.taxOffice,
        company: formData.company,
        points: 0,
        totalSpent: 0
      } as any);

      toast.success(tm('custToastAdded'));
      setShowAddModal(false);
      setFormData(emptyCustomerForm());
    } catch (error) {
      console.error('Error adding customer:', error);
      toast.error(tm('custToastAddFail'));
    }
  };

  // Handle edit customer
  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      code: customer.code || '',
      name: customer.name,
      phone: customer.phone || '',
      city: customer.city || '',
      phone2: customer.phone2 || '',
      age: customer.age != null ? String(customer.age) : '',
      file_id: customer.file_id || '',
      gender: customer.gender || '',
      customer_tier: customer.customer_tier === 'vip' ? 'vip' : 'normal',
      heard_from: customer.heard_from || '',
      email: customer.email || '',
      address: customer.address || '',
      occupation: customer.occupation || '',
      notes: customer.notes || '',
      taxNumber: customer.taxNumber || '',
      taxOffice: (customer as any).taxOffice || '',
      company: customer.company || ''
    });
    setShowAddModal(true);
  };

  // Handle update customer
  const handleUpdateCustomer = async () => {
    if (!selectedCustomer || !formData.name || !formData.phone) {
      toast.error(tm('custToastRequired'));
      return;
    }

    try {
      const updateCustomer = useCustomerStore.getState().updateCustomer;
      const trimmedAge = formData.age.trim();
      const ageForDb =
        trimmedAge === '' ? null : (parseAgeInput(formData.age) ?? null);
      await updateCustomer(selectedCustomer.id, {
        code: formData.code,
        name: formData.name,
        phone: formData.phone,
        city: formData.city.trim() === '' ? (null as any) : formData.city.trim(),
        phone2: formData.phone2.trim() === '' ? (null as any) : formData.phone2.trim(),
        email: formData.email,
        address: formData.address,
        notes: formData.notes.trim() === '' ? (null as any) : formData.notes.trim(),
        occupation: formData.occupation.trim() === '' ? (null as any) : formData.occupation.trim(),
        file_id: formData.file_id.trim() === '' ? (null as any) : formData.file_id.trim(),
        age: ageForDb as any,
        gender: formData.gender.trim() === '' ? (null as any) : formData.gender.trim(),
        customer_tier: formData.customer_tier === 'vip' ? 'vip' : 'normal',
        heard_from: formData.heard_from.trim() === '' ? (null as any) : formData.heard_from.trim(),
        taxNumber: formData.taxNumber,
        taxOffice: formData.taxOffice,
        company: formData.company
      } as any);

      toast.success(tm('custToastUpdated'));
      setShowAddModal(false);
      setSelectedCustomer(null);
      setFormData(emptyCustomerForm());
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error(tm('custToastUpdateFail'));
    }
  };

  // Handle delete customer
  const handleDeleteCustomer = async (customerId: string, customerName: string) => {
    if (confirm(tm('custDeleteConfirm').replace('{name}', customerName))) {
      try {
        const deleteCustomer = useCustomerStore.getState().deleteCustomer;
        await deleteCustomer(customerId);
        toast.success(tm('custToastDeleted'));
      } catch (error) {
        console.error('Error deleting customer:', error);
        toast.error(tm('custToastDeleteFail'));
      }
    }
  };

  const handleBulkDeleteDemoCustomers = async () => {
    const n = demoCustomersInList.length;
    if (n === 0) return;
    if (!window.confirm(`${n} demo müşterisi silinecek. Emin misiniz?`)) return;
    setContextMenu(null);
    let ok = 0;
    for (const c of demoCustomersInList) {
      const success = await customerAPI.delete(c.id);
      if (success) ok++;
    }
    await useCustomerStore.getState().loadCustomers();
    setCustomers(useCustomerStore.getState().customers);
    if (ok > 0) toast.success(`${ok} demo müşteri silindi.`);
    if (ok < n) toast.error('Bazı kayıtlar silinemedi.');
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

  const dateLocale =
    language === 'tr' ? 'tr-TR' : language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-IQ' : 'en-US';

  // Column definitions
  const columnHelper = createColumnHelper<Customer>();
  const columns: ColumnDef<Customer, any>[] = [
    columnHelper.accessor('code', {
      header: tm('custColCode'),
      cell: info => <span className="font-mono text-xs text-blue-600 font-medium">{info.getValue() || '-'}</span >,
      size: 100
    }),
    columnHelper.accessor('name', {
      header: tm('custColName'),
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
      header: tm('custColContact'),
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3 text-gray-400" />
              {row.phone}
            </span>
            {row.phone2 && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Phone className="w-3 h-3 text-gray-400" />
                {row.phone2}
              </span>
            )}
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
      header: tm('custColCompanyTax'),
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
      header: tm('custColTotalPurchases'),
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
      header: tm('custColTotalAmount'),
      cell: ({ row }) => {
        const stats = getCustomerStats(row.original.id);
        return <span className="font-medium">{formatNumber(stats.totalSpent, 2, true)} IQD</span>;
      },
      meta: { align: 'right' }
    }),
    columnHelper.display({
      id: 'lastPurchase',
      header: tm('custColLastPurchase'),
      cell: ({ row }) => {
        const stats = getCustomerStats(row.original.id);
        if (!stats.lastPurchase) return <span className="text-gray-400 text-xs">-</span>;
        return (
          <div className="flex flex-col text-xs">
            <span>{stats.lastPurchase.toLocaleDateString(dateLocale)}</span>
            <span className="text-gray-500">{stats.lastPurchase.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        );
      }
    }),
    columnHelper.display({
      id: 'actions',
      header: tm('custColActions'),
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleViewDetails(row.original); }}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title={tm('custTooltipView')}
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleEditCustomer(row.original); }}
            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
            title={tm('custTooltipEdit')}
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteCustomer(row.original.id, row.original.name); }}
            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
            title={tm('custTooltipDelete')}
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
              {tm('custMgmtTitle')}
            </h2>
            <p className="text-sm text-gray-600 mt-1">{tm('custMgmtSubtitle')}</p>
          </div>
          <button
            onClick={async () => {
              setSelectedCustomer(null);
              setFormData(emptyCustomerForm());
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
            {tm('custMgmtNewBtn')}
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
            placeholder={tm('custMgmtSearchPh')}
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
              variant: 'danger',
              divider: demoCustomersInList.length > 0
            },
            ...(demoCustomersInList.length > 0
              ? [
                  {
                    id: 'delete-demo',
                    label: `Demo müşterileri toplu sil (${demoCustomersInList.length} adet)`,
                    icon: Trash2,
                    variant: 'danger' as const,
                    onClick: () => {
                      void handleBulkDeleteDemoCustomers();
                    }
                  }
                ]
              : [])
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
                {selectedCustomer ? tm('custModalEditTitle') : tm('custModalAddTitle')}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelCode')}</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tm('custPhCode')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelFullName')} <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tm('custPhName')}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelPhone1')} <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tm('custPhPhone')}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.cityLabel || 'Şehir'}</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t.cityLabel || 'Şehir'}
                  />
                </div>
              </div>

              <div className="md:w-1/2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelPhone2')}</label>
                  <input
                    type="tel"
                    value={formData.phone2}
                    onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tm('custPhPhone2')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelAge')}</label>
                  <input
                    type="number"
                    min={0}
                    max={150}
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tm('custPhAge')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelFileId')}</label>
                  <input
                    type="text"
                    value={formData.file_id}
                    onChange={(e) => setFormData({ ...formData, file_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tm('custPhFileId')}
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelGender')}</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">{tm('custGenderSelect')}</option>
                    <option value="male">{tm('custGenderMale')}</option>
                    <option value="female">{tm('custGenderFemale')}</option>
                    <option value="other">{tm('custGenderOther')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelTier')}</label>
                  <select
                    value={formData.customer_tier}
                    onChange={(e) => setFormData({ ...formData, customer_tier: e.target.value === 'vip' ? 'vip' : 'normal' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="normal">{tm('custTierNormal')}</option>
                    <option value="vip">{tm('custTierVip')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelAddress')}</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={tm('custPhAddress')}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelOccupation')}</label>
                  <input
                    type="text"
                    value={formData.occupation}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tm('custPhOccupation')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelEmail')}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tm('custPhEmail')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelHeardFrom')}</label>
                <input
                  type="text"
                  value={formData.heard_from}
                  onChange={(e) => setFormData({ ...formData, heard_from: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={tm('custPhHeardFrom')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelAbout')}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={tm('custPhAbout')}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelCompany')}</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tm('custPhCompany')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelTaxNo')}</label>
                  <input
                    type="text"
                    value={formData.taxNumber}
                    onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tm('custPhTaxNo')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tm('custLabelTaxOffice')}</label>
                  <input
                    type="text"
                    value={formData.taxOffice}
                    onChange={(e) => setFormData({ ...formData, taxOffice: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tm('custPhTaxOffice')}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedCustomer(null);
                  setFormData(emptyCustomerForm());
                }}
                className="px-4 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
              >
                {tm('custModalCancel')}
              </button>
              <button
                onClick={selectedCustomer ? handleUpdateCustomer : handleAddCustomer}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
              >
                {selectedCustomer ? tm('custBtnUpdate') : tm('custBtnAdd')}
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
              <h3 className="text-xl font-semibold text-gray-800">{tm('custDetailTitle')}</h3>
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
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custColName')}</p>
                    <p className="text-lg font-medium text-gray-900">{selectedCustomer.name}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custLabelPhone1')}</p>
                    <p className="text-gray-900">{selectedCustomer.phone}</p>
                  </div>
                  {selectedCustomer.phone2 && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custLabelPhone2')}</p>
                      <p className="text-gray-900">{selectedCustomer.phone2}</p>
                    </div>
                  )}
                  {(selectedCustomer.age != null || (selectedCustomer.file_id != null && String(selectedCustomer.file_id).trim() !== '')) && (
                    <div className="flex gap-4 flex-wrap">
                      {selectedCustomer.age != null && (
                        <div className="bg-gray-50 p-4 rounded-lg flex-1 min-w-[100px]">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custLabelAge')}</p>
                          <p className="text-gray-900">{selectedCustomer.age}</p>
                        </div>
                      )}
                      {selectedCustomer.file_id != null && String(selectedCustomer.file_id).trim() !== '' && (
                        <div className="bg-gray-50 p-4 rounded-lg flex-1 min-w-[100px]">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custLabelFileId')}</p>
                          <p className="text-gray-900">{selectedCustomer.file_id}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {(selectedCustomer.gender || selectedCustomer.customer_tier) && (
                    <div className="flex gap-4 flex-wrap">
                      {selectedCustomer.gender && (
                        <div className="bg-gray-50 p-4 rounded-lg flex-1 min-w-[140px]">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custLabelGender')}</p>
                          <p className="text-gray-900">
                            {selectedCustomer.gender === 'male'
                              ? tm('custGenderMale')
                              : selectedCustomer.gender === 'female'
                                ? tm('custGenderFemale')
                                : tm('custGenderOther')}
                          </p>
                        </div>
                      )}
                      {selectedCustomer.customer_tier && (
                        <div className="bg-gray-50 p-4 rounded-lg flex-1 min-w-[140px]">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custLabelTier')}</p>
                          <p className="text-gray-900">
                            {selectedCustomer.customer_tier === 'vip' ? tm('custTierVip') : tm('custTierNormal')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {selectedCustomer.heard_from && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custLabelHeardFrom')}</p>
                      <p className="text-gray-900">{selectedCustomer.heard_from}</p>
                    </div>
                  )}
                  <div className="flex gap-4 flex-wrap">
                    {selectedCustomer.email && (
                      <div className="bg-gray-50 p-4 rounded-lg flex-1 min-w-[140px]">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custLabelEmail')}</p>
                        <p className="text-gray-900 break-all">{selectedCustomer.email}</p>
                      </div>
                    )}
                    {selectedCustomer.occupation && (
                      <div className="bg-gray-50 p-4 rounded-lg flex-1 min-w-[140px]">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custLabelOccupation')}</p>
                        <p className="text-gray-900">{selectedCustomer.occupation}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {(selectedCustomer.company || selectedCustomer.taxNumber) && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custDetailCorp')}</p>
                      <div className="space-y-2">
                        {selectedCustomer.company && <p className="text-gray-900"><span className="text-gray-500 w-24 inline-block">{tm('custCompanyLabel')}</span> {selectedCustomer.company}</p>}
                        {selectedCustomer.taxNumber && <p className="text-gray-900"><span className="text-gray-500 w-24 inline-block">{tm('custTaxNoShort')}</span> {selectedCustomer.taxNumber}</p>}
                        {(selectedCustomer as any).taxOffice && <p className="text-gray-900"><span className="text-gray-500 w-24 inline-block">{tm('custTaxOfficeShort')}</span> {(selectedCustomer as any).taxOffice}</p>}
                      </div>
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custLabelAddress')}</p>
                      <p className="text-gray-900">{selectedCustomer.address}</p>
                    </div>
                  )}
                  {selectedCustomer.city && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t.cityLabel || 'Şehir'}</p>
                      <p className="text-gray-900">{selectedCustomer.city}</p>
                    </div>
                  )}
                  {selectedCustomer.notes && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{tm('custLabelAbout')}</p>
                      <p className="text-gray-900 whitespace-pre-wrap">{selectedCustomer.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Purchase History */}
              <div className="border-t pt-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  {tm('custHistoryTitle')}
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
                            <p className="text-sm font-medium text-gray-900">{tm('custReceiptLabel')} {sale.receiptNumber}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3" />
                              {new Date(sale.date).toLocaleString(dateLocale)}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-lg font-bold text-gray-900">{formatNumber(sale.total, 2, false)}</p>
                          <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
                            <span className="bg-white px-2 py-0.5 rounded border border-gray-200">
                              {tm('custSaleItemsCount').replace('{n}', String(sale.items.length))}
                            </span>
                            <span className="bg-white px-2 py-0.5 rounded border border-gray-200 uppercase">
                              {sale.paymentMethod === 'cash' ? tm('custPayCash') : tm('custPayCard')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  {sales.filter(s => s.customerId === selectedCustomer.id).length === 0 && (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      {tm('custNoSalesYet')}
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
                {tm('custCloseBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
