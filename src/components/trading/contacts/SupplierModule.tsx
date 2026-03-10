import React, { useState, useEffect } from 'react';
import { formatNumber } from '../../../utils/formatNumber';
import {
  Truck, Users, Plus, X, Search, Edit, Trash2, Mail, Phone, MapPin,
  FileText, Loader2, Printer, RefreshCw, ChevronDown
} from 'lucide-react';
import { supplierAPI, type Supplier } from '../../../services/api/suppliers';
import { toast } from 'sonner';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { ContextMenu } from '../../shared/ContextMenu';
import { useLanguage } from '../../../contexts/LanguageContext';

export function SupplierModule() {
  const { t, tm } = useLanguage();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; supplier: Supplier | null } | null>(null);

  // Master-detail: selected account + ekstresi data
  const [selectedAccount, setSelectedAccount] = useState<Supplier | null>(null);
  const [ekstresiData, setEkstresiData] = useState<any[]>([]);
  const [ekstresiLoading, setEkstresiLoading] = useState(false);
  const [ekstresiStart, setEkstresiStart] = useState(new Date().getFullYear() + '-01-01');
  const [ekstresiEnd, setEkstresiEnd] = useState(new Date().toISOString().split('T')[0]);

  // Form state
  const [formData, setFormData] = useState({
    code: '', name: '', phone: '', email: '', address: '', city: '',
    payment_terms: 30, credit_limit: 0, tax_number: '', tax_office: '', notes: '',
    cardType: 'supplier' as 'customer' | 'supplier',
  });

  useEffect(() => { loadSuppliers(); }, []);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      setSuppliers(await supplierAPI.getAll());
    } catch (e: any) {
      toast.error(e.message || 'Cari hesaplar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadEkstresi = async (supplier: Supplier, start: string, end: string) => {
    setEkstresiLoading(true);
    try {
      setEkstresiData(await supplierAPI.getAccountStatement(supplier.id, start, end));
    } catch {
      setEkstresiData([]);
    } finally {
      setEkstresiLoading(false);
    }
  };

  const selectAccount = (supplier: Supplier) => {
    setSelectedAccount(supplier);
    setEkstresiData([]);
    loadEkstresi(supplier, ekstresiStart, ekstresiEnd);
  };

  const filteredSuppliers = suppliers.filter(s => {
    const q = searchQuery.toLowerCase();
    return (s.name?.toLowerCase() || '').includes(q) ||
      (s.code?.toLowerCase() || '').includes(q) ||
      (s.phone || '').includes(searchQuery) ||
      (s.email?.toLowerCase() || '').includes(q);
  });

  const handleAddClick = () => {
    setFormData({ code: '', name: '', phone: '', email: '', address: '', city: '', payment_terms: 30, credit_limit: 0, tax_number: '', tax_office: '', notes: '', cardType: 'supplier' });
    setEditingSupplier(null);
    setShowAddModal(true);
    supplierAPI.generateCode('supplier').then(code => setFormData(prev => ({ ...prev, code }))).catch(() => { });
  };

  const handleEditClick = (supplier: Supplier) => {
    setFormData({
      code: supplier.code || '', name: supplier.name, phone: supplier.phone || '',
      email: supplier.email || '', address: supplier.address || '', city: supplier.city || '',
      payment_terms: supplier.payment_terms || 30, credit_limit: supplier.credit_limit || 0,
      tax_number: supplier.tax_number || '', tax_office: supplier.tax_office || '',
      notes: supplier.notes || '', cardType: supplier.cardType || 'supplier',
    });
    setEditingSupplier(supplier);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('Ad zorunludur'); return; }
    try {
      if (editingSupplier) { await supplierAPI.update(editingSupplier.id, formData); toast.success('Güncellendi'); }
      else { await supplierAPI.create(formData); toast.success('Eklendi'); }
      setShowAddModal(false);
      loadSuppliers();
    } catch (e: any) { toast.error(e.message || 'Kayıt başarısız'); }
  };

  const handleDelete = async (id: string, name: string, cardType: 'customer' | 'supplier') => {
    if (!confirm(t.confirmDeleteAccount || `${name} silinsin mi?`)) return;
    try {
      await supplierAPI.delete(id, cardType);
      toast.success(tm('deleted'));
      if (selectedAccount?.id === id) setSelectedAccount(null);
      loadSuppliers();
    } catch (e: any) { toast.error(e.message || tm('deleteFailed')); }
  };

  const columnHelper = createColumnHelper<Supplier>();
  const columns: any[] = [
    columnHelper.accessor('code', {
      header: tm('code'),
      cell: info => <span className="font-mono text-xs text-blue-600 font-bold">{info.getValue() || '-'}</span>,
      size: 100
    }),
    columnHelper.accessor('cardType', {
      header: tm('type'),
      cell: info => {
        const type = info.getValue() as 'customer' | 'supplier';
        return (
          <div className="flex items-center gap-1.5">
            {type === 'customer' ? <Users className="w-3.5 h-3.5 text-blue-600" /> : <Truck className="w-3.5 h-3.5 text-orange-600" />}
            <span className={`text-[10px] font-black uppercase ${type === 'customer' ? 'text-blue-700' : 'text-orange-700'}`}>
              {type === 'customer' ? tm('customer') : tm('supplierLabel')}
            </span>
          </div>
        );
      },
      size: 110
    }),
    columnHelper.accessor('name', {
      header: tm('currentAccountTitle'),
      cell: info => <span className="font-semibold text-gray-800">{info.getValue()}</span>
    }),
    columnHelper.accessor('phone', {
      header: tm('contact'),
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex flex-col text-xs text-gray-500">
            {row.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{row.phone}</span>}
            {row.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{row.email}</span>}
            {row.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{row.city}</span>}
          </div>
        );
      }
    }),
    columnHelper.accessor('balance', {
      header: tm('crmBalance'),
      cell: info => {
        const val = info.getValue() || 0;
        const isSupplier = info.row.original.cardType === 'supplier';
        // Standart Muhasebe: Bakiye > 0 ise B (Borçlu), Bakiye < 0 ise A (Alacaklı)
        const label = val === 0 ? '' : val > 0 ? 'B' : 'A';
        const colorClass = label === 'B' ? 'text-red-600' : 'text-orange-600';
        const badgeClass = label === 'B' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700';
        return (
          <div className="flex items-center justify-end gap-1.5 font-bold">
            <span className={colorClass}>{formatNumber(Math.abs(val), 2, false)} IQD</span>
            {label && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${badgeClass}`}>{label}</span>}
          </div>
        );
      },
      meta: { align: 'right' }
    }),
    columnHelper.display({
      id: 'actions',
      header: tm('actions'),
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={e => { e.stopPropagation(); handleEditClick(row.original); }} className="p-1 hover:bg-blue-100 rounded" title={tm('edit')}>
            <Edit className="w-3.5 h-3.5 text-blue-600" />
          </button>
          <button onClick={e => { e.stopPropagation(); selectAccount(row.original); }} className="p-1 hover:bg-indigo-100 rounded" title={tm('extractTitle')}>
            <FileText className="w-3.5 h-3.5 text-indigo-600" />
          </button>
          <button onClick={e => { e.stopPropagation(); handleDelete(row.original.id, row.original.name, row.original.cardType || 'supplier'); }} className="p-1 hover:bg-red-100 rounded" title={tm('deleteAction')}>
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>
      )
    })
  ];

  // Ekstresi computed values
  let runningBalance = 0;
  // fiche_type → category eşleştirmesi (invoice_category DB'de saklanmaz)
  const ficheTypeToInfo = (ficheType: string, trcode: number) => {
    if (ficheType === 'purchase_invoice') return { label: 'Alış', color: 'bg-orange-100 text-orange-700', isReturn: false };
    if (ficheType === 'return_invoice') return { label: 'İade', color: 'bg-red-100 text-red-700', isReturn: true };
    if (ficheType === 'waybill') return { label: 'İrsaliye', color: 'bg-purple-100 text-purple-700', isReturn: false };
    if (ficheType === 'order') return { label: 'Sipariş', color: 'bg-gray-100 text-gray-600', isReturn: false };
    // Kasa işlemleri — isReturn=true: ödeme/tahsilat her iki hesap tipi için bakiyeyi düşürür
    if (ficheType === 'CH_ODEME') return { label: 'Ödeme', color: 'bg-green-100 text-green-700', isReturn: true };
    if (ficheType === 'CH_TAHSILAT') return { label: 'Tahsilat', color: 'bg-teal-100 text-teal-700', isReturn: true };
    // sales_invoice: trcode 9 = Hizmet
    if (trcode === 9) return { label: 'Hizmet', color: 'bg-indigo-100 text-indigo-700', isReturn: false };
    return { label: 'Satış', color: 'bg-blue-100 text-blue-700', isReturn: false };
  };

  const isSupplierAccount = selectedAccount?.cardType === 'supplier';
  const ekstresiRows = ekstresiData.map(row => {
    const amount = parseFloat(row.total_amount || 0);
    const { isReturn } = ficheTypeToInfo(row.fiche_type || '', Number(row.trcode));
    // Müşteri: satış → BORÇ (onlar bize borçlu), iade → ALACAK
    // Tedarikçi: alış → ALACAK (biz onlara borçluyuz), iade → BORÇ
    const isBorcEntry = isSupplierAccount ? isReturn : !isReturn;
    const delta = isBorcEntry ? +amount : -amount;
    runningBalance += delta;
    return {
      ...row,
      borcAmount: isBorcEntry ? amount : 0,
      alacakAmount: isBorcEntry ? 0 : amount,
      balance: runningBalance
    };
  });
  const totalBorc = ekstresiRows.reduce((s, r) => s + r.borcAmount, 0);
  const totalAlacak = ekstresiRows.reduce((s, r) => s + r.alacakAmount, 0);
  const netBalance = totalBorc - totalAlacak;

  const typeInfo = (row: any) => ficheTypeToInfo(row.fiche_type || '', Number(row.trcode));

  return (
    <div className="h-full flex flex-col" onClick={() => setContextMenu(null)}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <h2 className="text-sm font-semibold">{t.menu?.currentAccountPersonel || 'Cari Hesap / Personel'}</h2>
            <span className="text-blue-100 text-[10px] ml-2">• {suppliers.length} {tm('account')}</span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={loadSuppliers} className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>{tm('refreshData')}</span>
            </button>
            <button onClick={handleAddClick} className="flex items-center gap-1 px-2 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px] font-bold">
              <Plus className="w-3 h-3" />
              <span>{tm('newCustomer')} / {tm('supplierLabel')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main split area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 p-3 gap-3">
        {/* Search */}
        <div className="bg-white px-3 py-2 border border-gray-200 rounded flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={tm('searchCurrentAccountPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Grid (takes remaining space or half when ekstresi open) */}
        <div className={`bg-white border border-gray-200 rounded overflow-hidden flex-shrink-0 ${selectedAccount ? 'h-[40%]' : 'flex-1'}`}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
              <span className="text-sm text-gray-500">{tm('loadingData')}</span>
            </div>
          ) : (
            <DevExDataGrid
              data={filteredSuppliers}
              columns={columns}
              enableSorting
              enableFiltering={false}
              enableColumnResizing={true}
              onRowClick={selectAccount}
              onRowContextMenu={(e, supplier) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, supplier }); }}
              onRowDoubleClick={handleEditClick}
              pageSize={50}
            />
          )}
        </div>

        {/* Inline Ekstresi Panel */}
        {selectedAccount && (
          <div className="flex-1 bg-white border border-gray-200 rounded overflow-hidden flex flex-col min-h-0">
            {/* Panel Header */}
            <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-bold text-gray-700">{selectedAccount.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${selectedAccount.cardType === 'customer' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                  {selectedAccount.cardType === 'customer' ? tm('customer') : tm('supplierLabel')}
                </span>
                <span className="text-xs text-gray-400 ml-1">— {tm('accountStatement')}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Date filters */}
                <input type="date" value={ekstresiStart} onChange={e => setEkstresiStart(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <span className="text-gray-400 text-xs">—</span>
                <input type="date" value={ekstresiEnd} onChange={e => setEkstresiEnd(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <button onClick={() => loadEkstresi(selectedAccount, ekstresiStart, ekstresiEnd)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded transition-colors">
                  {tm('bring')}
                </button>
                {/* Summary chips */}
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="bg-red-50 border border-red-200 text-red-600 text-xs font-black px-2 py-0.5 rounded">B: {formatNumber(totalBorc, 2, false)}</span>
                  <span className="bg-orange-50 border border-orange-200 text-orange-600 text-xs font-black px-2 py-0.5 rounded">A: {formatNumber(totalAlacak, 2, false)}</span>
                  {(() => {
                    // netBalance > 0 = B (taraf bize borçlu), < 0 = A (biz borçluyuz)
                    const netLabel = netBalance > 0 ? 'B' : netBalance < 0 ? 'A' : '';
                    const netCls = netBalance > 0 ? 'bg-red-50 border-red-200 text-red-700' : netBalance < 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-500';
                    return (
                      <span className={`border text-xs font-black px-2 py-0.5 rounded ${netCls}`}>
                        {tm('netAmount')}: {formatNumber(Math.abs(netBalance), 2, false)} {netLabel}
                      </span>
                    );
                  })()}
                </div>
                <button onClick={() => window.print()} className="p-1 hover:bg-gray-100 rounded" title={tm('print')}><Printer className="w-3.5 h-3.5 text-gray-400" /></button>
                <button onClick={() => setSelectedAccount(null)} className="p-1 hover:bg-gray-100 rounded" title={tm('close')}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
            </div>

            {/* Ekstresi Table */}
            <div className="flex-1 overflow-auto">
              {ekstresiLoading ? (
                <div className="flex items-center justify-center h-20 gap-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">{tm('loading')}</span>
                </div>
              ) : ekstresiRows.length === 0 ? (
                <div className="flex items-center justify-center h-20 gap-2 text-gray-300">
                  <FileText className="w-5 h-5" />
                  <span className="text-xs">{tm('noRecordFound')}</span>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 border-b">
                    <tr>
                      {[tm('dateLabel'), tm('ficheNo'), tm('type'), tm('description'), tm('debtor'), tm('creditor'), tm('balance')].map(h => (
                        <th key={h} className={`px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider ${[tm('debtor'), tm('creditor'), tm('balance')].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ekstresiRows.map((row, idx) => {
                      const { label, color } = typeInfo(row);
                      return (
                        <tr key={idx} className={`border-b border-gray-100 hover:bg-blue-50/30 ${idx % 2 ? 'bg-gray-50/40' : ''}`}>
                          <td className="px-3 py-1.5 font-mono text-gray-500">{row.date ? String(row.date).split('T')[0] : '-'}</td>
                          <td className="px-3 py-1.5 font-mono text-blue-600 font-bold">{row.fiche_no || '-'}</td>
                          <td className="px-3 py-1.5"><span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${color}`}>{label}</span></td>
                          <td className="px-3 py-1.5 text-gray-400 max-w-[150px] truncate">{row.notes || ''}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-red-600">{row.borcAmount > 0 ? formatNumber(row.borcAmount, 2, false) : ''}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-green-600">{row.alacakAmount > 0 ? formatNumber(row.alacakAmount, 2, false) : ''}</td>
                          <td className={`px-3 py-1.5 text-right font-black ${row.balance > 0 ? 'text-red-600' : row.balance < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                            {formatNumber(Math.abs(row.balance), 2, false)}
                            {row.balance !== 0 && <span className="ml-0.5 text-[9px]">{row.balance > 0 ? 'B' : 'A'}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { id: 'edit', label: tm('edit'), icon: Edit, onClick: () => { if (contextMenu.supplier) handleEditClick(contextMenu.supplier); setContextMenu(null); } },
            { id: 'extract', label: tm('accountStatement'), icon: FileText, onClick: () => { if (contextMenu.supplier) selectAccount(contextMenu.supplier); setContextMenu(null); } },
            { id: 'delete', label: tm('deleteAction'), icon: Trash2, variant: 'danger' as const, onClick: () => { if (contextMenu.supplier) handleDelete(contextMenu.supplier.id, contextMenu.supplier.name, contextMenu.supplier.cardType || 'supplier'); setContextMenu(null); } }
          ]}
        />
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] p-4 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-tighter">{editingSupplier ? tm('edit') : tm('newCurrentAccount')}</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase">{formData.cardType === 'customer' ? tm('customer') : tm('supplierLabel')}</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-200 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {!editingSupplier && (
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={async () => { const c = await supplierAPI.generateCode('customer'); setFormData({ ...formData, cardType: 'customer', code: c }); }}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${formData.cardType === 'customer' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                    <Users className={`w-5 h-5 ${formData.cardType === 'customer' ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className={`text-sm font-bold ${formData.cardType === 'customer' ? 'text-blue-700' : 'text-gray-500'}`}>{tm('customer')}</span>
                  </button>
                  <button type="button" onClick={async () => { const c = await supplierAPI.generateCode('supplier'); setFormData({ ...formData, cardType: 'supplier', code: c }); }}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${formData.cardType === 'supplier' ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
                    <Truck className={`w-5 h-5 ${formData.cardType === 'supplier' ? 'text-orange-500' : 'text-gray-400'}`} />
                    <span className={`text-sm font-bold ${formData.cardType === 'supplier' ? 'text-orange-700' : 'text-gray-500'}`}>{tm('supplierLabel')}</span>
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field label={tm('code')}><input type="text" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="Otomatik" /></Field>
                <Field label={`${tm('currentAccountTitle')} *`}><input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label={tm('phoneLabel')}><input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></Field>
                <Field label={tm('emailLabel')}><input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} /></Field>
              </div>
              <Field label={tm('address')}><input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={tm('city')}><input type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} /></Field>
                <Field label={tm('paymentTermDays')}><input type="number" value={formData.payment_terms} onChange={e => setFormData({ ...formData, payment_terms: parseInt(e.target.value) || 30 })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label={tm('creditLimit')}><input type="number" value={formData.credit_limit} onChange={e => setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })} /></Field>
                <Field label={tm('taxNumberLabel')}><input type="text" value={formData.tax_number} onChange={e => setFormData({ ...formData, tax_number: e.target.value })} /></Field>
              </div>
              <Field label={tm('notesLabel')}><textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} /></Field>
            </div>

            <div className="p-4 border-t bg-gray-50 flex gap-3 justify-end">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">{tm('cancel')}</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold">{editingSupplier ? tm('save') : tm('add')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small helper to reduce input boilerplate
function Field({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">{label}</label>
      {React.cloneElement(children, {
        className: 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
      })}
    </div>
  );
}
