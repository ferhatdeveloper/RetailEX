import { useState, useEffect } from 'react';
import { FileText, Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
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

  // Invoice list state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
        invoiceCategory: 'Alis'
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
          donemId: selectedPeriod.id
        });
        toast.info(tm('noInvoicesFound') || 'Listelenecek alış faturası bulunamadı.');
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

  // Filtered invoices (state zaten filtrelenmiş geliyor ama emin olmak için)
  const filteredInvoices = invoices;

  // CRUD Functions


  const handleDeleteInvoice = async (invoiceId: string) => {
    if (confirm(tm('deleteInvoiceConfirm') || 'Bu faturayı silmek istediğinizden emin misiniz?')) {
      try {
        // Soft delete: status='iptal' or just delete?
        // Let's mark it as status 'Deleted' for now or use delete endpoint if available
        // For now using update to set status to "Iptal" as a safe approach unless delete is preferred
        // Wait, invoicesAPI has delete? No, but use update.
        // Or if we want real delete:
        // await invoicesAPI.delete(invoiceId); // Assuming delete exists or we implemented it
        // Actually, check invoicesAPI... it has update.
        // Let's just assume we want to update status to "Iptal"
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (invoice) {
          await invoicesAPI.update(invoiceId, { ...invoice, status: 'Iptal' });
          toast.success(tm('invoiceCancelled') || 'Fatura iptal edildi');
          loadInvoices();
        }
      } catch (error) {
        console.error('Silme hatası:', error);
        toast.error(tm('deleteError') || 'Silme işleminde hata oluştu');
      }
    }
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setEditingInvoiceId(invoice.id!);
    setShowNewInvoice(true);
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
        };
        // Normalize status for translation lookup if needed, or translate display
        return <span className={`px-1.5 py-0.5 rounded text-[10px] ${colors[status] || 'bg-gray-100'}`}>{status}</span>;
      }
    }),
    columnHelper.display({
      id: 'actions',
      header: tm('actions'),
      cell: ({ row }: { row: any }) => (
        <div className="flex gap-1">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              handleEditInvoice(row.original);
            }}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title={tm('edit')}
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      ),
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

          <button
            onClick={() => {
              setEditingInvoiceId(null);
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
        <div className="fixed inset-0 z-50 bg-white">
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
              loadInvoices(); // Refresh list after close
            }}
            editData={editingInvoiceId ? invoices.find(i => i.id === editingInvoiceId) : undefined}
          />
        </div>
      )}

      {/* Table Area */}
      <div className="flex-1 overflow-auto p-6">
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
          onEdit={() => contextMenu.invoice && handleEditInvoice(contextMenu.invoice)}
          onDelete={() => contextMenu.invoice?.id && handleDeleteInvoice(contextMenu.invoice.id)}
        />
      )}
    </div>
  );
}
