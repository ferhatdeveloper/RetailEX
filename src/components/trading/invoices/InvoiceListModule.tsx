import { useState, useEffect } from 'react';
import { printInvoice } from '../../../utils/printUtils';
import { FileText, Search, Filter as FilterIcon, Download, Eye, Calendar, User, CreditCard, Banknote, X, Edit, Trash2, Tag, Plus, FileCheck, FileMinus, Truck, ShoppingBag, FileSignature, Printer, Palette, RefreshCw, Send } from 'lucide-react';
import { ReportViewerModule } from '../../reports/ReportViewerModule';
import { ReportDesignerModule } from '../../reports/ReportDesignerModule';
import { ReportTemplate } from '../../reports/designerUtils';
import { salesAPI } from '../../../services/api/sales';
import { supabase } from '../../../utils/supabase/client';
import type { Sale } from '../../../core/types';
import { formatNumber } from '../../../utils/formatNumber';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { UniversalInvoiceForm } from './UniversalInvoiceForm';
import { ContextMenu } from '../../shared/ContextMenu';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { enqueueSaleInvoice } from '../../../services/gibEdocumentQueueService';
import { invoiceMatchesModuleCategory } from '../../../services/api/invoices';

export interface InvoiceListModuleProps {
  onInvoiceSelect?: (invoice: Invoice) => void;
  title?: string;
  description?: string;
  defaultInvoiceTypeFilter?: string;
  defaultCategory?: 'Satis' | 'Alis' | 'Iade' | 'Irsaliye' | 'Siparis' | 'Teklif' | 'Hizmet';
  customers?: any[];
  products?: any[];
}

interface InvoiceType {
  code: number;
  name: string;
  category: 'Satis' | 'Alis' | 'Iade' | 'Irsaliye' | 'Siparis' | 'Teklif' | 'Hizmet';
  color: string;
  icon: 'FileText' | 'FileCheck' | 'FileMinus' | 'Truck' | 'ShoppingBag' | 'FileSignature';
  translationKey: string;
}

const getIcon = (iconName: string) => {
  switch (iconName) {
    case 'FileCheck': return FileCheck;
    case 'FileMinus': return FileMinus;
    case 'Truck': return Truck;
    case 'ShoppingBag': return ShoppingBag;
    case 'FileSignature': return FileSignature;
    default: return FileText;
  }
};

interface Invoice {
  id?: string;
  invoice_no: string;
  invoice_date: string;
  date?: string;
  invoice_type?: number;
  trcode?: number; // Added trcode matching DB column
  invoice_category?: string;
  source?: 'pos' | 'invoice';
  customer_name?: string;
  customer_id?: string;
  total: number;
  total_amount?: number;
  total_cost?: number;
  gross_profit?: number;
  profit_margin?: number;
  subtotal: number;
  discount: number;
  tax: number;
  payment_method: string;
  currency?: string;
  currency_rate?: number;
  cashier?: string;
  cashier_id?: string;
  cash_register_id?: string;
  status: string;
  items?: any[];
  campaign_id?: string;
  campaign_name?: string;
  campaign_discount?: number;
}

export function InvoiceListModule({ customers = [], products = [], defaultInvoiceTypeFilter, defaultCategory, title, description }: InvoiceListModuleProps) {
  const { tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const showGibQueueAction = selectedFirm?.regulatory_region === 'TR';

  const INVOICE_TYPES: InvoiceType[] = [
    { code: 8, name: tm('wholesale'), category: 'Satis', color: 'bg-purple-100 text-purple-700 border-purple-300', icon: 'FileText', translationKey: 'wholesale' },
    { code: 7, name: tm('retailSale'), category: 'Satis', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: 'FileText', translationKey: 'retailSale' },
    { code: 3, name: tm('salesReturn'), category: 'Iade', color: 'bg-red-100 text-red-700 border-red-300', icon: 'FileMinus', translationKey: 'salesReturn' },
    { code: 1, name: tm('purchaseInvoices'), category: 'Alis', color: 'bg-cyan-100 text-cyan-700 border-cyan-300', icon: 'FileCheck', translationKey: 'purchaseInvoices' },
    { code: 6, name: tm('purchaseReturn'), category: 'Iade', color: 'bg-pink-100 text-pink-700 border-pink-300', icon: 'FileMinus', translationKey: 'purchaseReturn' },
    { code: 9, name: tm('serviceGiven'), category: 'Hizmet', color: 'bg-indigo-100 text-indigo-700 border-indigo-300', icon: 'FileText', translationKey: 'serviceGiven' },
    { code: 4, name: tm('serviceReceived'), category: 'Hizmet', color: 'bg-violet-100 text-violet-700 border-violet-300', icon: 'FileCheck', translationKey: 'serviceReceived' },
    { code: 10, name: tm('salesWaybill'), category: 'Irsaliye', color: 'bg-teal-100 text-teal-700 border-teal-300', icon: 'Truck', translationKey: 'salesWaybill' },
    { code: 11, name: tm('purchaseWaybill'), category: 'Irsaliye', color: 'bg-sky-100 text-sky-700 border-sky-300', icon: 'Truck', translationKey: 'purchaseWaybill' },
    { code: 12, name: tm('warehouseTransferWaybill'), category: 'Irsaliye', color: 'bg-orange-100 text-orange-700 border-orange-300', icon: 'Truck', translationKey: 'warehouseTransferWaybill' },
    { code: 13, name: tm('wastageWaybill'), category: 'Irsaliye', color: 'bg-red-100 text-red-700 border-red-300', icon: 'Truck', translationKey: 'wastageWaybill' },
    { code: 20, name: tm('salesOrder'), category: 'Siparis', color: 'bg-green-100 text-green-700 border-green-300', icon: 'ShoppingBag', translationKey: 'salesOrder' },
    { code: 21, name: tm('purchaseOrder'), category: 'Siparis', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: 'ShoppingBag', translationKey: 'purchaseOrder' },
    { code: 30, name: tm('salesQuote'), category: 'Teklif', color: 'bg-purple-100 text-purple-700 border-purple-300', icon: 'FileSignature', translationKey: 'salesQuote' },
    { code: 31, name: tm('purchaseQuote'), category: 'Teklif', color: 'bg-cyan-100 text-cyan-700 border-cyan-300', icon: 'FileSignature', translationKey: 'purchaseQuote' },
  ];
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    invoice: Invoice | null;
  } | null>(null);

  const handleDeleteInvoice = async (id: string, invoiceNo: string) => {
    if (!confirm(tm('confirmDeleteInvoice').replace('{invoiceNo}', invoiceNo))) {
      return;
    }

    try {
      const { invoicesAPI } = await import('../../../services/api/invoices');
      await invoicesAPI.delete(id);
      const { useSaleStore } = await import('../../../store');
      useSaleStore.getState().removeSaleById(id);
      void useSaleStore.getState().loadSales(500);
      toast.success(tm('invoiceDeleteSuccess'));
      loadInvoices();
    } catch (error: any) {
      console.error('Fatura silinirken hata:', error);
      toast.error(tm('invoiceDeleteError') + ': ' + (error.message || 'Bilinmeyen hata'));
    }
  };

  // Helper for printing
  const handlePrintInvoice = async (invoice: Invoice) => {
    // Determine label based on invoice type
    const typeLabel = INVOICE_TYPES.find(t => t.code === (invoice.invoice_type || invoice.trcode))?.name?.toUpperCase() || tm('invoice').toUpperCase();
    await printInvoice(invoice, typeLabel);
  };

  const handleRowRightClick = (e: React.MouseEvent, invoice: Invoice) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      invoice
    });
  };
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<string>(defaultInvoiceTypeFilter || 'all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showInvoiceTypeModal, setShowInvoiceTypeModal] = useState(false);
  const [selectedInvoiceType, setSelectedInvoiceType] = useState<InvoiceType | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory || 'all');
  const [hoveredInvoiceType, setHoveredInvoiceType] = useState<InvoiceType | null>(null);
  const [editInvoiceData, setEditInvoiceData] = useState<Invoice | null>(null);
  /** Yeni fatura formu her seferinde remount olsun (önceki taslak state kalmasın) */
  const [newFormCounter, setNewFormCounter] = useState(0);
  const [showDesigner, setShowDesigner] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<ReportTemplate | null>(null);

  // Sayfalama state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Debounce için
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);

  // Tarih filtreleri
  const getDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const formatDateLocal = (date: Date) => {
      const offset = date.getTimezoneOffset() * 60000;
      const localDate = new Date(date.getTime() - offset);
      return localDate.toISOString().split('T')[0];
    };

    switch (dateFilter) {
      case 'today':
        return {
          start: formatDateLocal(today),
          end: formatDateLocal(new Date(today.getTime() + 24 * 60 * 60 * 1000))
        };
      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
        return {
          start: formatDateLocal(weekStart),
          end: formatDateLocal(new Date(today.getTime() + 24 * 60 * 60 * 1000))
        };
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          start: formatDateLocal(monthStart),
          end: formatDateLocal(new Date(today.getTime() + 24 * 60 * 60 * 1000))
        };
      case 'all':
      default:
        return { start: null, end: null };
    }
  };

  // Faturaları yükle (sayfalama ile)
  useEffect(() => {
    loadInvoices();
  }, [currentPage, pageSize, dateFilter, statusFilter, invoiceTypeFilter, defaultCategory]);

  // Arama için debounce
  useEffect(() => {
    if (searchDebounce) {
      clearTimeout(searchDebounce);
    }

    const timeout = setTimeout(() => {
      setCurrentPage(1); // Arama yapıldığında ilk sayfaya dön
      loadInvoices();
    }, 500); // 500ms debounce

    setSearchDebounce(timeout);

    return () => {
      if (searchDebounce) {
        clearTimeout(searchDebounce);
      }
    };
  }, [searchQuery]);

  // Sync state with props when they change
  useEffect(() => {
    setInvoiceTypeFilter(defaultInvoiceTypeFilter || 'all');
  }, [defaultInvoiceTypeFilter]);

  useEffect(() => {
    setSelectedCategory(defaultCategory || 'all');
  }, [defaultCategory]);

  const loadInvoices = async () => {
    setIsLoading(true);
    try {
      const { invoicesAPI } = await import('../../../services/api/invoices');

      const dateRange = getDateRange();

      const result = await invoicesAPI.getPaginated({
        page: currentPage,
        pageSize: pageSize,
        search: searchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        startDate: dateRange.start ? String(dateRange.start) : undefined,
        endDate: dateRange.end ? String(dateRange.end) : undefined,
        invoiceCategory: defaultCategory || undefined,
        invoiceType: invoiceTypeFilter && invoiceTypeFilter !== 'all' ? parseInt(invoiceTypeFilter) : 0
      });

      // Client-side fatura türü ve kategori filtresi
      let filteredData = result.data;

      // Fatura türü filtresi
      if (invoiceTypeFilter !== 'all') {
        filteredData = filteredData.filter(inv => {
          const invoiceType = inv.invoice_type || inv.trcode || 0;
          return invoiceType.toString() === invoiceTypeFilter;
        });
      }

      /* Kategori: API ile aynı Logo trcode grupları (INVOICE_TYPES tek kod=tek kategori değil; 4,13,6 çakışıyor) */
      if (defaultCategory) {
        filteredData = filteredData.filter((inv) => invoiceMatchesModuleCategory(inv, defaultCategory));
      }

      setInvoices(filteredData);
      setTotalCount(result.total);
      setTotalPages(result.totalPages);

      console.log('[InvoiceListModule] result.data count:', result.data.length);
      console.log('[InvoiceListModule] filteredData count:', filteredData.length);
      if (result.data.length > 0 && filteredData.length === 0) {
        console.warn('[InvoiceListModule] Data exists in API but was filtered out on client!', {
          apiFirstRow: result.data[0],
          filters: { statusFilter, invoiceTypeFilter, defaultCategory }
        });
      }
    } catch (error) {
      console.error('Faturalar yüklenirken hata:', error);
      setInvoices([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetail = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowDetailModal(true);
  };

  const resolveInvoiceTypeForEdit = (inv: Invoice): InvoiceType => {
    const code = Number(inv.invoice_type ?? inv.trcode ?? 0);
    let t = INVOICE_TYPES.find(x => x.code === code);
    if (t) return t;
    /* Logo trcode (4,5,13…) listede yoksa kategori / fiche ile en uygun form türü */
    const cat = inv.invoice_category;
    if (cat === 'Alis') return INVOICE_TYPES.find(x => x.code === 1) || INVOICE_TYPES.find(x => x.category === 'Alis') || INVOICE_TYPES[0];
    if (cat === 'Satis') return INVOICE_TYPES.find(x => x.code === 8) || INVOICE_TYPES.find(x => x.category === 'Satis') || INVOICE_TYPES[0];
    if (cat === 'Iade') return INVOICE_TYPES.find(x => x.code === 3) || INVOICE_TYPES.find(x => x.category === 'Iade') || INVOICE_TYPES[0];
    if (cat === 'Irsaliye') return INVOICE_TYPES.find(x => x.code === 10) || INVOICE_TYPES.find(x => x.category === 'Irsaliye') || INVOICE_TYPES[0];
    if (cat === 'Siparis') return INVOICE_TYPES.find(x => x.code === 20) || INVOICE_TYPES.find(x => x.category === 'Siparis') || INVOICE_TYPES[0];
    if (cat === 'Teklif') return INVOICE_TYPES.find(x => x.code === 30) || INVOICE_TYPES.find(x => x.category === 'Teklif') || INVOICE_TYPES[0];
    if (cat === 'Hizmet') return INVOICE_TYPES.find(x => x.code === 9) || INVOICE_TYPES.find(x => x.category === 'Hizmet') || INVOICE_TYPES[0];
    return INVOICE_TYPES.find(x => x.code === 8) || INVOICE_TYPES[0];
  };

  const handleEditInvoice = async (invoice: Invoice) => {
    if (!invoice.id) {
      toast.error(tm('invoiceSaveError'));
      return;
    }

    try {
      const { invoicesAPI } = await import('../../../services/api/invoices');
      const fullInvoice = await invoicesAPI.getById(invoice.id);
      const raw = fullInvoice ?? invoice;
      /* Yeni referans: useEffect(items) tetiklensin; kalemler kopyalanmış olsun */
      const data = {
        ...raw,
        items: Array.isArray(raw.items) ? raw.items.map((it: any) => ({ ...it })) : []
      };
      const invoiceType = resolveInvoiceTypeForEdit(data);
      setEditInvoiceData(data);
      setSelectedInvoiceType(invoiceType);
    } catch (error) {
      console.error('Fatura detayları yüklenirken hata:', error);
      const data = {
        ...invoice,
        items: Array.isArray(invoice.items) ? invoice.items.map((it: any) => ({ ...it })) : []
      };
      const invoiceType = resolveInvoiceTypeForEdit(data);
      setEditInvoiceData(data);
      setSelectedInvoiceType(invoiceType);
    }
  };

  const handleCreateInvoice = () => {
    setEditInvoiceData(null);
    // Eğer varsayılan fatura türü filtresi varsa, direkt o türle form aç
    if (defaultInvoiceTypeFilter && defaultInvoiceTypeFilter !== 'all') {
      const invoiceTypeCode = parseInt(defaultInvoiceTypeFilter);
      const invoiceType = INVOICE_TYPES.find(t => t.code === invoiceTypeCode);
      if (invoiceType) {
        setNewFormCounter((c) => c + 1);
        setSelectedInvoiceType(invoiceType);
        return;
      }
    }
    // Yoksa fatura türü seçim modalını aç
    setShowInvoiceTypeModal(true);
    setSelectedCategory(defaultCategory || 'all');
  };

  const handleSelectInvoiceType = (type: InvoiceType) => {
    setEditInvoiceData(null);
    setNewFormCounter((c) => c + 1);
    setSelectedInvoiceType(type);
    setShowInvoiceTypeModal(false);
  };

  const handleCloseInvoiceForm = () => {
    setSelectedInvoiceType(null);
    setEditInvoiceData(null);
    loadInvoices(); // Fatura oluşturulduktan sonra listeyi yenile
  };

  // Kategorilere göre filtreleme
  const categories = [
    { id: 'all', label: tm('all'), count: INVOICE_TYPES.length },
    { id: 'Satis', label: tm('sales'), count: INVOICE_TYPES.filter(t => t.category === 'Satis').length },
    { id: 'Alis', label: tm('purchase'), count: INVOICE_TYPES.filter(t => t.category === 'Alis').length },
    { id: 'Hizmet', label: tm('service'), count: INVOICE_TYPES.filter(t => t.category === 'Hizmet').length },
    { id: 'Irsaliye', label: tm('waybill'), count: INVOICE_TYPES.filter(t => t.category === 'Irsaliye').length },
    { id: 'Siparis', label: tm('order'), count: INVOICE_TYPES.filter(t => t.category === 'Siparis').length },
    { id: 'Teklif', label: tm('quote'), count: INVOICE_TYPES.filter(t => t.category === 'Teklif').length },
    { id: 'Iade', label: tm('return'), count: INVOICE_TYPES.filter(t => t.category === 'Iade').length },
  ];

  const filteredTypes = selectedCategory === 'all'
    ? INVOICE_TYPES
    : INVOICE_TYPES.filter(t => t.category === selectedCategory);

  // Fatura formu açıksa UniversalInvoiceForm'u göster
  if (selectedInvoiceType) {
    return (
      <UniversalInvoiceForm
        key={editInvoiceData?.id ?? `draft-${newFormCounter}`}
        invoiceType={selectedInvoiceType}
        customers={customers}
        products={products}
        onClose={handleCloseInvoiceForm}
        editData={editInvoiceData}
      />
    );
  }

  const totalAmount = invoices.reduce((sum, inv) => sum + inv.total, 0);

  // Table columns
  const columnHelper = createColumnHelper<Invoice>();
  const columns = [
    columnHelper.accessor('invoice_no', {
      header: tm('invoiceNo'),
      cell: info => <span className="text-blue-600 font-medium">{info.getValue()}</span>
    }),
    columnHelper.accessor('customer_name', {
      header: tm('customerSupplier'),
      cell: info => {
        const value = info.getValue();
        return <span>{value || tm('noCustomer')}</span>;
      }
    }),
    columnHelper.accessor('invoice_date', {
      header: tm('date'),
      cell: info => {
        const dateValue = info.getValue();
        if (!dateValue) return <span className="text-gray-400">-</span>;
        try {
          const date = new Date(dateValue);
          if (isNaN(date.getTime())) return <span className="text-gray-400">{tm('invalidDate')}</span>;
          return date.toLocaleDateString(tm('localeCode'), {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
        } catch {
          return <span className="text-gray-400">-</span>;
        }
      }
    }),
    columnHelper.display({
      id: 'invoice_type',
      header: () => <span className="font-semibold">{tm('invoiceType')}</span>,
      cell: ({ row }) => {
        const invoice = row.original;
        // invoice_type kontrolü - hem invoice_type hem de invoice_category'den türü belirle
        let invoiceTypeCode: number | undefined = invoice.invoice_type;

        // Eğer invoice_type yoksa veya 0 ise, source'a göre varsayılan değer
        if (invoiceTypeCode === undefined || invoiceTypeCode === null) {
          if (invoice.source === 'pos' || invoice.cashier) {
            invoiceTypeCode = 1; // POS satışları için Perakende Satış
          } else {
            invoiceTypeCode = 0; // Varsayılan Satış Faturası
          }
        }

        const invoiceType = INVOICE_TYPES.find(t => t.code === invoiceTypeCode);
        if (invoiceType) {
          const IconComponent = getIcon(invoiceType.icon);
          return (
            <div className="flex items-center gap-2 min-w-[120px]">
              <IconComponent className="w-4 h-4 text-gray-600 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-900">{invoiceType.name}</span>
            </div>
          );
        }
        // Fallback: invoice_category'ye göre
        if (invoice.invoice_category) {
          const categoryType = INVOICE_TYPES.find(t => t.category === invoice.invoice_category);
          if (categoryType) {
            const IconComponent = getIcon(categoryType.icon);
            return (
              <div className="flex items-center gap-2 min-w-[120px]">
                <IconComponent className="w-4 h-4 text-gray-600 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-900">{tm(categoryType.translationKey)}</span>
              </div>
            );
          }
        }
        // Son fallback
        return (
          <div className="flex items-center gap-2 min-w-[120px]">
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-600">{tm('salesInvoices')}</span>
          </div>
        );
      },
      enableSorting: false,
    }),
    columnHelper.accessor('total', {
      header: tm('total'),
      cell: info => {
        const invoice = info.row.original;
        // total_amount varsa onu kullan, yoksa total kullan
        const value = invoice.total_amount || invoice.total || 0;
        return <span className="font-semibold">{value > 0 ? `${formatNumber(value, 2, true)} IQD` : '0,00 IQD'}</span>;
      }
    }),
    columnHelper.accessor('status', {
      header: tm('status'),
      cell: info => {
        const status = info.getValue();
        const colors: Record<string, string> = {
          'completed': 'bg-green-100 text-green-700',
          'pending': 'bg-yellow-100 text-yellow-700',
          'refunded': 'bg-red-100 text-red-700',
          'cancelled': 'bg-gray-100 text-gray-700',
        };
        const colorClass = colors[status] || 'bg-gray-100 text-gray-700';
        const localizedStatus = tm(status) || status;
        return <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>{localizedStatus}</span>;
      }
    }),
    columnHelper.accessor('cashier', {
      header: tm('cashier'),
      cell: info => {
        const value = info.getValue();
        return <span className="text-sm">{value || '-'}</span>;
      }
    }),
    columnHelper.display({
      id: 'actions',
      header: tm('actions'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleViewDetail(row.original);
            }}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title={tm('viewDetails')}
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditInvoice(row.original);
            }}
            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
            title={tm('edit')}
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      )
    }),
  ];

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">{tm('loadingInvoices')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">{title || tm('invoices')}</h2>
              <span className="text-blue-100 text-[10px]">• {totalCount.toLocaleString(tm('localeCode'))} {tm('invoicesCount')}</span>
              <span className="text-blue-100 text-[10px] ml-1">• {formatNumber(totalAmount, 2, true)} {tm('currencyCode')}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]"
              onClick={loadInvoices}
            >
              <RefreshCw className="w-3 h-3" />
              <span>{tm('refresh')}</span>
            </button>
            <button
              onClick={handleCreateInvoice}
              className="flex items-center gap-1 px-3 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px] font-bold"
            >
              <Plus className="w-3 h-3" />
              {tm('newInvoice')}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b px-4 py-2 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
              <input
                type="text"
                placeholder={tm('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Date Filter */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded px-2">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-transparent py-1.5 text-xs focus:outline-none min-w-[100px]"
              >
                <option value="today">{tm('today')}</option>
                <option value="week">{tm('thisWeek')}</option>
                <option value="month">{tm('thisMonth')}</option>
                <option value="all">{tm('all')}</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded px-2">
              <FilterIcon className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent py-1.5 text-xs focus:outline-none min-w-[110px]"
              >
                <option value="all">{tm('allStatuses')}</option>
                <option value="completed">{tm('completed')}</option>
                <option value="pending">{tm('pending')}</option>
                <option value="refunded">{tm('refunded')}</option>
                <option value="cancelled">{tm('cancelled')}</option>
              </select>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded px-2">
              <FileText className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={invoiceTypeFilter}
                onChange={(e) => {
                  setInvoiceTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent py-1.5 text-xs focus:outline-none min-w-[140px]"
              >
                <option value="all">{tm('allInvoiceTypes')}</option>
                <optgroup label={tm('salesInvoices')}>
                  <option value="8">{tm('salesInvoices')}</option>
                  <option value="7">{tm('retailSale')}</option>
                  <option value="8">{tm('wholesale')}</option>
                  <option value="8">{tm('consignmentSale')}</option>
                </optgroup>
                <optgroup label={tm('purchaseInvoices')}>
                  <option value="1">{tm('purchaseInvoices')}</option>
                </optgroup>
                <optgroup label={tm('return')}>
                  <option value="3">{tm('salesReturn')}</option>
                  <option value="6">{tm('purchaseReturn')}</option>
                </optgroup>
                <optgroup label={tm('service')}>
                  <option value="9">{tm('serviceGiven')}</option>
                  <option value="4">{tm('serviceReceived')}</option>
                </optgroup>
                <optgroup label={tm('waybill')}>
                  <option value="10">{tm('salesWaybill')}</option>
                  <option value="11">{tm('purchaseWaybill')}</option>
                  <option value="12">{tm('warehouseTransferWaybill')}</option>
                  <option value="13">{tm('wastageWaybill')}</option>
                </optgroup>
                <optgroup label={tm('order')}>
                  <option value="20">{tm('salesOrder')}</option>
                  <option value="21">{tm('purchaseOrder')}</option>
                </optgroup>
                <optgroup label={tm('quote')}>
                  <option value="30">{tm('salesQuote')}</option>
                  <option value="31">{tm('purchaseQuote')}</option>
                </optgroup>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="flex-1 overflow-auto p-6">
        <DevExDataGrid
          data={invoices}
          columns={columns}
          enableSorting={false} // Backend'de sıralama yapılıyor
          enableFiltering={true}
          enableColumnResizing
          enablePagination={false} // Custom pagination kullanıyoruz
          onRowDoubleClick={(invoice) => handleEditInvoice(invoice)}
          onRowContextMenu={handleRowRightClick}
        />

        {/* Custom Pagination */}
        <div className="mt-4 flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {tm('totalUppercase')} {totalCount} {tm('records')}
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={25}>25 / sayfa</option>
              <option value={50}>50 / sayfa</option>
              <option value={100}>100 / sayfa</option>
              <option value={200}>200 / sayfa</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              {tm('first')}
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              {tm('previous')}
            </button>
            <span className="px-4 py-1.5 text-sm text-gray-700">
              {tm('page')} {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              {tm('next')}
            </button>
            <button
              onClick={() => setCurrentPage(totalPages || 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              {tm('last')}
            </button>
          </div>
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
              id: 'detail',
              label: tm('viewDetails'),
              icon: Eye,
              onClick: () => {
                if (contextMenu.invoice) handleViewDetail(contextMenu.invoice);
              }
            },
            {
              id: 'edit',
              label: tm('edit'),
              icon: Edit,
              onClick: () => {
                if (contextMenu.invoice) handleEditInvoice(contextMenu.invoice);
              }
            },
            {
              id: 'print',
              label: tm('print'),
              icon: Printer,
              onClick: () => {
                if (contextMenu.invoice) {
                  handlePrintInvoice(contextMenu.invoice);
                }
              }
            },
            ...(showGibQueueAction
              ? [
                  {
                    id: 'gib-queue',
                    label: 'GİB kuyruğuna ekle (E-Dönüşüm)',
                    icon: Send,
                    onClick: async () => {
                      const inv = contextMenu.invoice;
                      setContextMenu(null);
                      if (!inv?.id) return;
                      const r = await enqueueSaleInvoice(inv.id);
                      if (r.ok) toast.success(r.message);
                      else toast.error(r.message);
                    }
                  }
                ]
              : []),
            {
              id: 'design',
              label: tm('design'),
              icon: Palette,
              onClick: () => {
                setShowDesigner(true);
                setContextMenu(null);
              },
              divider: true
            },
            {
              id: 'delete',
              label: tm('deleteAction'),
              icon: Trash2,
              onClick: () => {
                if (contextMenu.invoice) handleDeleteInvoice(contextMenu.invoice.id, contextMenu.invoice.invoice_no);
              },
              variant: 'danger'
            }
          ]}
        />
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">{tm('invoiceDetails')}</h3>
                <p className="text-blue-100 text-sm">{selectedInvoice.invoice_no}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrintInvoice(selectedInvoice)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm font-medium"
                >
                  <Printer className="w-4 h-4" />
                  {tm('print')}
                </button>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal Content - A4 Format Preview */}
            <div className="flex-1 overflow-auto p-6 bg-gray-50">
              <div className="max-w-4xl mx-auto">
                {/* A4 Container */}
                <div
                  id="invoice-preview"
                  className="bg-white shadow-lg"
                  style={{
                    width: '210mm',
                    minHeight: '297mm',
                    padding: '20mm',
                    margin: '0 auto'
                  }}
                >
                  {/* Modern Invoice Header */}
                  <div className="border-b-4 border-blue-600 pb-6 mb-8">
                    <h1 className="text-4xl font-bold text-blue-600 mb-6">{tm('invoice').toUpperCase()}</h1>
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{tm('invoiceNo')}</div>
                        <div className="text-lg font-semibold text-gray-900">{selectedInvoice.invoice_no}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{tm('date')}</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {new Date(selectedInvoice.invoice_date || selectedInvoice.date || '').toLocaleDateString(tm('localeCode'), {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{tm('status')}</div>
                        <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${selectedInvoice.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : selectedInvoice.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                          }`}>
                          {selectedInvoice.status === 'completed' ? tm('completed') :
                            selectedInvoice.status === 'pending' ? tm('pending') :
                              selectedInvoice.status === 'refunded' ? tm('refunded') : selectedInvoice.status}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-6 mt-6">
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{tm('customer')}</div>
                        <div className="text-lg font-semibold text-gray-900">{selectedInvoice.customer_name || tm('noCustomer')}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{tm('paymentMethod')}</div>
                        <div className="text-base font-semibold text-gray-900">{selectedInvoice.payment_method || '-'}</div>
                      </div>
                      {selectedInvoice.cashier && (
                        <div>
                          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{tm('cashier')}</div>
                          <div className="text-base font-semibold text-gray-900">{selectedInvoice.cashier}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Kampanya Bilgileri */}
                  {(selectedInvoice.campaign_name || selectedInvoice.campaign_discount) && (
                    <div className="bg-orange-50 border-l-4 border-orange-400 rounded-lg p-4 mb-6">
                      <h4 className="font-semibold mb-3 text-orange-800 flex items-center gap-2 text-sm">
                        <Tag className="w-4 h-4" />
                        {tm('campaignInfo')}
                      </h4>
                      <div className="space-y-1 text-sm">
                        {selectedInvoice.campaign_name && (
                          <div>
                            <span className="text-gray-600">{tm('campaign')}:</span>
                            <span className="font-medium ml-2 text-orange-700">{selectedInvoice.campaign_name}</span>
                          </div>
                        )}
                        {selectedInvoice.campaign_discount && selectedInvoice.campaign_discount > 0 && (
                          <div>
                            <span className="text-gray-600">{tm('campaignDiscountLabel')}:</span>
                            <span className="font-medium text-orange-600 ml-2">
                              {formatNumber(selectedInvoice.campaign_discount, 2, true)} IQD
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Ürünler Tablosu */}
                  {selectedInvoice.items && selectedInvoice.items.length > 0 && (
                    <div className="mb-8">
                      <h3 className="text-lg font-bold text-gray-900 mb-4 uppercase tracking-wide">{tm('productsLabel')}</h3>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{tm('product')}</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">{tm('quantity')}</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">{tm('unitPrice')}</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">{tm('discount')}</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">{tm('total')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedInvoice.items.map((item: any, index: number) => (
                              <tr key={index} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.productName || '-'}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-700">{item.quantity || 0}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-700">{formatNumber(item.price || 0, 2, true)}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-700">
                                  {item.discount > 0 ? `%${item.discount}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                                  {formatNumber(item.total || 0, 2, true)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Toplamlar */}
                  <div className="border-t-2 border-gray-300 pt-6 mt-8">
                    <div className="space-y-3 max-w-md ml-auto">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{tm('subtotal')}:</span>
                        <span className="font-semibold text-gray-900">{formatNumber(selectedInvoice.subtotal || 0, 2, true)} IQD</span>
                      </div>
                      {selectedInvoice.discount > 0 && (
                        <div className="flex justify-between text-sm text-red-600">
                          <span>{tm('discount')}:</span>
                          <span className="font-semibold">-{formatNumber(selectedInvoice.discount, 2, true)} IQD</span>
                        </div>
                      )}
                      {selectedInvoice.tax > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">{tm('tax')}:</span>
                          <span className="font-semibold text-gray-900">{formatNumber(selectedInvoice.tax, 2, true)} IQD</span>
                        </div>
                      )}
                      <div className="flex justify-between text-2xl font-bold border-t-2 border-blue-600 pt-4 mt-4">
                        <span className="text-gray-900">{tm('grandTotal')}:</span>
                        <span className="text-blue-600">{formatNumber(selectedInvoice.total || selectedInvoice.total_amount || 0, 2, true)} IQD</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t px-6 py-4 flex justify-end gap-3 bg-white">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {tm('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fatura Türü Seçim Modalı */}
      {showInvoiceTypeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl bg-white rounded-xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-white" />
                <h3 className="text-xl font-semibold text-white">{tm('selectInvoiceType')}</h3>
              </div>
              <button
                onClick={() => setShowInvoiceTypeModal(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            {/* Modal Content - İki Panelli */}
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Sol Panel - Fatura Türleri */}
                <div className="space-y-3">
                  {/* Kategori Filtreleri */}
                  <div className="border border-gray-300 bg-blue-50 p-3 rounded-lg">
                    <h4 className="text-sm text-blue-800 mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      {tm('invoiceCategories')}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-3 py-1.5 text-xs border transition-colors rounded ${selectedCategory === cat.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                            }`}
                        >
                          {cat.label} ({cat.count})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fatura Türleri Listesi */}
                  <div className="border border-gray-300 bg-white p-3 rounded-lg">
                    <h4 className="text-sm text-gray-700 mb-3 font-medium">{tm('invoiceTypes')}</h4>
                    <div className="space-y-2 max-h-[400px] overflow-auto">
                      {filteredTypes.map((type) => {
                        const Icon = getIcon(type.icon);
                        const isHovered = hoveredInvoiceType?.code === type.code;
                        return (
                          <button
                            key={type.code}
                            onClick={() => handleSelectInvoiceType(type)}
                            onMouseEnter={() => setHoveredInvoiceType(type)}
                            onMouseLeave={() => setHoveredInvoiceType(null)}
                            className={`w-full p-3 rounded border-2 transition-all text-left ${isHovered
                              ? 'border-blue-600 bg-blue-50 shadow-md'
                              : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
                              }`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <Icon className={`w-5 h-5 ${isHovered ? 'text-blue-600' : 'text-gray-600'}`} />
                                <span className="font-semibold text-sm text-gray-900">{type.name}</span>
                              </div>
                              <span className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                                TRCODE {type.code}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">{type.category}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Sağ Panel - Seçilen Fatura Türü Detayları */}
                <div className="space-y-3">
                  {hoveredInvoiceType ? (
                    <>
                      {/* Seçilen Tür Özeti */}
                      <div className="border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 p-5 shadow-sm rounded-lg">
                        <h4 className="text-xs uppercase tracking-wide mb-3 text-gray-600 font-medium">
                          {tm('invoiceTypeDetails').toUpperCase()}
                        </h4>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 mb-3">
                            {(() => {
                              const Icon = getIcon(hoveredInvoiceType.icon);
                              return <Icon className="w-10 h-10 text-blue-600" />;
                            })()}
                            <div>
                              <div className="text-xl font-bold text-gray-900">{hoveredInvoiceType.name}</div>
                              <div className="text-sm text-gray-600">TRCODE: {hoveredInvoiceType.code}</div>
                            </div>
                          </div>

                          <div className="border-t border-gray-300 pt-3">
                            <div className="flex justify-between mb-2">
                              <span className="text-sm text-gray-600">{tm('categoryLabel')}:</span>
                              <span className="text-sm font-medium text-gray-900">{hoveredInvoiceType.category}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">{tm('status')}:</span>
                              <span className="text-sm font-medium text-green-600">{tm('ready')}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bilgilendirme */}
                      <div className="border border-gray-300 bg-white p-4 rounded-lg">
                        <h4 className="text-sm text-gray-700 mb-2 font-medium">{tm('description')}</h4>
                        <div className="text-xs text-gray-600">
                          {hoveredInvoiceType.code === 0 && (
                            <p>Standart satış işlemlerinizi kayıt altına almak için kullanılır. Müşterilere mal/hizmet satışı yapıldığında bu fatura türü ile fatura kesilir.</p>
                          )}
                          {hoveredInvoiceType.code === 1 && (
                            <p>Perakende satış işlemleri için kullanılır. Mağaza veya satış noktasından yapılan bireysel satışlar için kesilir.</p>
                          )}
                          {hoveredInvoiceType.code === 5 && (
                            <p>Tedarikçilerden yapılan alış işlemlerini kayıt altına almak için kullanılır. Satın alınan mal/hizmetlerin muhasebe kaydı yapılır.</p>
                          )}
                          {!hoveredInvoiceType.code || (hoveredInvoiceType.code !== 0 && hoveredInvoiceType.code !== 1 && hoveredInvoiceType.code !== 5) && (
                            <p>Bu fatura türü ile işlemlerinizi kayıt altına alabilirsiniz.</p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="border border-gray-300 bg-gray-50 p-8 rounded-lg text-center">
                      <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-sm">{tm('selectOrHoverInvoiceType')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Report Designer Overlay */}
      {showDesigner && (
        <div className="fixed inset-0 z-[12000] bg-white">
          <div className="h-full flex flex-col">
            <div className="p-2 border-b flex justify-end bg-gray-50">
              <button onClick={() => setShowDesigner(false)} className="px-3 py-1 bg-red-500 text-white rounded text-xs font-bold">{tm('close').toUpperCase()}</button>
            </div>
            <div className="flex-1">
              <ReportDesignerModule />
            </div>
          </div>
        </div>
      )}

      {/* Custom Report Viewer Overlay */}
      {showViewer && activeTemplate && contextMenu?.invoice && (
        <ReportViewerModule
          template={activeTemplate}
          data={{ invoice: contextMenu.invoice }}
          onClose={() => setShowViewer(false)}
        />
      )}
    </div>
  );
}




