import { useState, useEffect } from 'react';
import { FileText, Plus, Edit, Trash2, RefreshCw, Archive } from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatNumber } from '../../../utils/formatNumber';
import { invoicesAPI, Invoice } from '../../../services/api/invoices';
import { UniversalInvoiceForm } from '../invoices/UniversalInvoiceForm';
import { ContextMenu } from '../../shared/ContextMenu';
import { ColumnVisibilityMenu } from '../../shared/ColumnVisibilityMenu';

interface InvoiceItem {
  id: string;
  type: string;
  code: string;
  description: string;
  description2: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  amount: number;
  netAmount: number;
}



interface PurchaseInvoiceModuleProps {
  onCreateInvoice?: () => void; // UnifiedInvoiceModule'den gelen callback
  onSwitchTab?: (tab: string) => void;
  activeTab?: string;
  onInvoiceClick?: (invoice: any) => void;
}

export function PurchaseInvoiceModule({ onCreateInvoice, onSwitchTab, activeTab: externalActiveTab, onInvoiceClick }: PurchaseInvoiceModuleProps = {}) {
  // ===== CONTEXT & HOOKS =====
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  const { tm } = useLanguage();

  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  /** Liste satırında kalemler yok; düzenlemede getById ile doldurulur (PostgREST dahil). */
  const [editInvoiceFull, setEditInvoiceFull] = useState<Invoice | null>(null);

  // Invoice list state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  type ListFilter = 'active' | 'deleted' | 'all';
  const [listFilter, setListFilter] = useState<ListFilter>('active');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    invoice: Invoice | null;
  } | null>(null);

  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState(() => {
    const saved = localStorage.getItem('purchaseInvoiceColumnVisibility');
    return saved ? JSON.parse(saved) : {
      invoice_no: true,
      supplier_name: true,
      invoice_date: true,
      total_amount: true,
      status: true,
    };
  });

  // Save column visibility to localStorage
  useEffect(() => {
    localStorage.setItem('purchaseInvoiceColumnVisibility', JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  // Fetch invoices
  const loadInvoices = async () => {
    setIsLoading(true);
    if (!selectedFirm || !selectedPeriod) {
      console.log('[PurchaseInvoiceModule] Firma veya dönem seçili değil', {
        selectedFirm: selectedFirm?.id,
        selectedPeriod: selectedPeriod?.id
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      console.log('[PurchaseInvoiceModule] Loading invoices with filters:', {
        invoiceType: 5,
        invoiceCategory: 'Alis',
        firmaId: selectedFirm.id,
        donemId: selectedPeriod.id,
        firmaName: selectedFirm.name,
        donemName: selectedPeriod.donem_adi
      });

      // Sadece Alış Faturalarını Getir (Type: 5, Category: 'Alis')
      // Client-side filtreleme artık invoicesAPI içinde yapılıyor
      const result = await invoicesAPI.getPaginated({
        page: 1,
        pageSize: 1000,
        invoiceCategory: 'Alis',
        firmNr: selectedFirm.firm_nr || selectedFirm.id,
        periodNr: selectedPeriod.nr || selectedPeriod.id,
        includeCancelled: true,
      });

      console.log('[PurchaseInvoiceModule] Alış Faturaları yüklendi:', {
        count: result.data.length,
        total: result.total,
        invoices: result.data.map(inv => ({
          id: inv.id,
          invoice_no: inv.invoice_no,
          supplier_name: inv.supplier_name,
          total_amount: inv.total_amount
        }))
      });

      setInvoices(result.data);

      if (result.data.length === 0) {
        console.warn('[PurchaseInvoiceModule] Hiç alış faturası bulunamadı. Filtreler:', {
          invoiceType: 5,
          invoiceCategory: 'Alis',
          firmaId: selectedFirm.id,
          donemId: selectedPeriod.id,
          listFilter,
        });
      }
    } catch (error) {
      console.error('[PurchaseInvoiceModule] Faturalar yüklenirken hata:', error);
      toast.error(tm('errorLoadingInvoices') || 'Faturalar yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedFirm && selectedPeriod) {
      loadInvoices();
    }

    // Listen for invoice creation events
    const handleInvoiceCreated = (e: CustomEvent) => {
      console.log('[PurchaseInvoiceModule] Invoice created, refreshing list...', e.detail);
      loadInvoices();
    };

    window.addEventListener('invoiceCreated', handleInvoiceCreated as EventListener);

    return () => {
      window.removeEventListener('invoiceCreated', handleInvoiceCreated as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFirm, selectedPeriod]);

  const isInvoiceDeleted = (inv: Invoice) =>
    inv.is_cancelled === true ||
    String(inv.status || '').toLowerCase() === 'silindi' ||
    String(inv.status || '').toLowerCase() === 'iptal';

  const activeInvoices = invoices.filter((inv) => !isInvoiceDeleted(inv));
  const deletedInvoices = invoices.filter((inv) => isInvoiceDeleted(inv));

  const filteredInvoices =
    listFilter === 'deleted'
      ? deletedInvoices
      : listFilter === 'all'
        ? invoices
        : activeInvoices;

  // CRUD Functions


  const handleDeleteInvoice = async (invoiceId: string) => {
    if (confirm(tm('deleteInvoiceConfirm') || 'Bu faturayı silmek istediğinizden emin misiniz?')) {
      try {
        const ok = await invoicesAPI.delete(invoiceId);
        if (!ok) {
          toast.error(tm('deleteError') || 'Silme işleminde hata oluştu');
          return;
        }
        toast.success(tm('invoiceSoftDeletedToast') || 'Fatura silindi. «Silinen» sekmesinden görebilirsiniz.');
        setListFilter('deleted');
        loadInvoices();
      } catch (error) {
        console.error('Silme hatası:', error);
        toast.error(tm('deleteError') || 'Silme işleminde hata oluştu');
      }
    }
  };

  const handleEditInvoice = (invoice: Invoice) => {
    const id = String(invoice.id || '').trim();
    if (!id) return;
    void (async () => {
      setEditingInvoiceId(id);
      setEditInvoiceFull(null);
      setShowNewInvoice(true);
      try {
        const full = await invoicesAPI.getById(id);
        setEditInvoiceFull(full ?? invoice);
      } catch (e) {
        console.error('[PurchaseInvoiceModule] getById failed:', e);
        setEditInvoiceFull(invoice);
      }
    })();
  };

  const columnHelper = createColumnHelper<Invoice>();
  const columns: ColumnDef<Invoice, any>[] = [
    columnHelper.accessor('invoice_no', {
      header: tm('invoiceNo'),
      cell: (info: any) => <span className="text-teal-600 font-medium">{info.getValue() || (info.row.original as any).id}</span>
    }),
    columnHelper.accessor('supplier_name', {
      header: tm('supplier'),
      cell: (info: any) => {
        const val = info.getValue() as string;
        // Eğer supplier_name boşsa, customer_name'e bak (bazen oraya kaydedilebilir)
        return val || (info.row.original as any).customer_name || '-';
      }
    }),
    columnHelper.accessor('invoice_date', {
      header: tm('date'),
      cell: (info: any) => {
        const date = info.getValue() as string;
        if (!date) return '-';
        return new Date(date).toLocaleDateString('tr-TR');
      }
    }),
    columnHelper.accessor('total_amount', {
      header: tm('amount'),
      cell: (info: any) => {
        const value = info.getValue() as number;
        return value ? `${formatNumber(value, 2, true)} IQD` : '0,00 IQD';
      }
    }),
    columnHelper.accessor('total', {
      header: tm('total'),
      cell: (info: any) => {
        const value = (info.getValue() as number) || (info.row.original as any).total_amount;
        return <span>{value ? `${formatNumber(value, 2, true)} IQD` : '0,00 IQD'}</span>;
      }
    }),
    columnHelper.accessor('status', {
      header: tm('status'),
      cell: (info: any) => {
        const status = info.getValue() as string;
        const colors: Record<string, string> = {
          'Ödendi': 'bg-green-100 text-green-700',
          'Beklemede': 'bg-yellow-100 text-yellow-700',
          'Onaylandı': 'bg-blue-100 text-blue-700',
          'Iptal': 'bg-red-100 text-red-700',
          'Silindi': 'bg-red-100 text-red-700 line-through',
        };
        const displayStatus =
          (info.row.original as Invoice).is_cancelled || status === 'Silindi'
            ? (tm('deleted') || 'Silindi')
            : status;
        return (
          <span className={`px-1.5 py-0.5 rounded text-[10px] ${colors[displayStatus] || colors[status] || 'bg-gray-100'}`}>
            {displayStatus}
          </span>
        );
      }
    }),
    columnHelper.display({
      id: 'actions',
      header: tm('actions'),
      cell: ({ row }: { row: any }) => {
        const inv = row.original as Invoice;
        if (isInvoiceDeleted(inv)) {
          return <span className="text-[10px] text-gray-400 px-1">{tm('deleted') || 'Silindi'}</span>;
        }
        return (
        <div className="flex gap-1">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              handleEditInvoice(inv);
            }}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title={tm('edit')}
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
        );
      },
    })
  ];

  // Handle row right-click
  const handleRowRightClick = (e: React.MouseEvent, invoice: Invoice) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      invoice: invoice,
    });
  };

  // Handle row double-click
  const handleRowDoubleClick = (invoice: Invoice) => {
    // Fatura tıklanıldığında işlemler modalını aç
    if (onInvoiceClick) {
      onInvoiceClick(invoice);
    } else {
      // Fallback: eski davranış (edit modu)
      handleEditInvoice(invoice);
    }
  };



  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-lg">
            <FileText className="w-6 h-6 text-teal-600" />
          </div>
          {tm('purchaseInvoices')}
        </h1>

        <div className="flex items-center gap-3">
          <ColumnVisibilityMenu
            columns={[
              { id: 'invoice_no', label: tm('invoiceNo'), visible: columnVisibility.invoice_no },
              { id: 'supplier_name', label: tm('supplier'), visible: columnVisibility.supplier_name },
              { id: 'invoice_date', label: tm('date'), visible: columnVisibility.invoice_date },
              { id: 'total_amount', label: tm('amount'), visible: columnVisibility.total_amount },
              { id: 'status', label: tm('status'), visible: columnVisibility.status },
            ]}
            onToggle={(columnId) => {
              setColumnVisibility((prev: any) => ({ ...prev, [columnId]: !prev[columnId] }));
            }}
            onShowAll={() => {
              setColumnVisibility({
                invoice_no: true,
                supplier_name: true,
                invoice_date: true,
                total_amount: true,
                status: true,
              });
            }}
            onHideAll={() => {
              setColumnVisibility({
                invoice_no: false,
                supplier_name: false,
                invoice_date: false,
                total_amount: false,
                status: false,
              });
            }}
          />

          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
            {(['active', 'deleted', 'all'] as const).map((key) => {
              const count =
                key === 'active'
                  ? activeInvoices.length
                  : key === 'deleted'
                    ? deletedInvoices.length
                    : invoices.length;
              const label =
                key === 'active'
                  ? tm('invoiceListFilterActive') || 'Aktif'
                  : key === 'deleted'
                    ? tm('invoiceListFilterDeleted') || 'Silinen'
                    : tm('invoiceListFilterAll') || 'Tümü';
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setListFilter(key)}
                  className={`px-3 py-2 text-sm border-r border-gray-200 last:border-r-0 flex items-center gap-1.5 transition-colors ${
                    listFilter === key
                      ? key === 'deleted'
                        ? 'bg-red-50 text-red-700 font-medium'
                        : 'bg-teal-50 text-teal-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {key === 'deleted' && <Archive className="w-3.5 h-3.5" />}
                  {label}
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{count}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => loadInvoices()}
            className="px-3 py-2 rounded text-sm border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center gap-2"
            title={tm('refresh') || 'Yenile'}
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setEditingInvoiceId(null);
              setEditInvoiceFull(null);
              setShowNewInvoice(true);
            }}
            className="px-4 py-2 bg-white text-teal-600 rounded hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm border border-teal-100 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {tm('newPurchaseInvoice')}
          </button>
        </div>
      </div>

      {/* Universal Invoice Form Integration */}
      {showNewInvoice && (
        <UniversalInvoiceForm
          invoiceType={{
            code: 5,
            name: tm('purchaseInvoice'),
            category: 'Alis',
            color: 'bg-teal-600'
          }}
          onClose={() => {
            setShowNewInvoice(false);
            setEditingInvoiceId(null);
            setEditInvoiceFull(null);
            loadInvoices(); // Refresh list after close
          }}
          editData={
            editingInvoiceId
              ? editInvoiceFull?.id === editingInvoiceId
                ? editInvoiceFull
                : invoices.find((i) => i.id === editingInvoiceId) ?? undefined
              : undefined
          }
        />
      )}

      {/* Table Area */}
      <div className="flex-1 overflow-auto p-6">
        {listFilter === 'deleted' && deletedInvoices.length === 0 && !isLoading && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {tm('deletedInvoicesHint') ||
              'Dün eski sürümle tamamen silinen faturalar burada görünmez. Güncel sürümde silinen kayıtlar bu sekmede kalır.'}
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-2" />
              <p className="text-gray-600 text-sm">{tm('loadingInvoices')}...</p>
            </div>
          </div>
        ) : (
          <div onContextMenu={(e) => e.preventDefault()}>
            <DevExDataGrid
              data={filteredInvoices}
              columns={columns}
              enableSorting
              enableFiltering
              enableColumnResizing
              enablePagination
              enableColumnVisibility
              showColumnVisibilityToolbar={false}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              onRowDoubleClick={handleRowDoubleClick}
              onRowContextMenu={handleRowRightClick}
            />
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onEdit={() => contextMenu.invoice && !contextMenu.invoice.is_cancelled && handleEditInvoice(contextMenu.invoice)}
          onDelete={() => {
            if (contextMenu.invoice?.is_cancelled) return;
            if (contextMenu.invoice?.id) handleDeleteInvoice(contextMenu.invoice.id);
          }}
        />
      )}
    </div>
  );
}
