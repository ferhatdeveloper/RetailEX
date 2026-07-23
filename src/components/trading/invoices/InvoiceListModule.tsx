import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { printInvoice } from '../../../utils/printUtils';
import { FileText, Search, Filter as FilterIcon, Download, Eye, Calendar, User, CreditCard, Banknote, X, Edit, Trash2, Tag, Plus, FileCheck, FileMinus, Truck, ShoppingBag, FileSignature, Printer, Palette, RefreshCw, Send, ClipboardList, ChevronDown } from 'lucide-react';
import { ReportViewerModule } from '../../reports/ReportViewerModule';
import { ReportTemplate } from '../../reports/designerUtils';
import { TemplateManager } from '../../modules/TemplateManager';
import type { Sale, Invoice } from '../../../core/types';
import { formatNumber } from '../../../utils/formatNumber';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { ColumnVisibilityMenu } from '../../shared/ColumnVisibilityMenu';
import { UniversalInvoiceForm } from './UniversalInvoiceForm';
import {
  buildInvoiceListColumns,
  INVOICE_LIST_COLUMN_ORDER,
  INVOICE_LIST_COLUMN_VISIBILITY_KEY,
  invoiceListColumnVisibilityMenuItems,
  loadInvoiceListColumnVisibility,
  type ListInvoice,
} from './invoiceListColumns';
import { ContextMenu } from '../../shared/ContextMenu';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useResponsive } from '../../../hooks/useResponsive';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { enqueueSaleInvoice } from '../../../services/gibEdocumentQueueService';
import { invoiceMatchesModuleCategory, invoicesAPI } from '../../../services/api/invoices';
import type { TemplateUsageScope } from '../../../core/types/templates';
import { TEMPLATE_USAGE_SCOPE_LABELS } from '../../../core/types/templates';
import { useTemplateStore } from '../../../store';
import { buildInvoicePrintContext, convertTemplateToReportTemplate, invoiceScopeFromTrcode } from '../../../services/templateRenderService';
import { getBindingForScope } from '../../../services/printDesignBindingService';
import { enqueueFastReportFrxJob, enqueueFastReportTemplateJob, isWindowsPrinterServiceEnabled } from '../../../services/unifiedPrintQueueService';
import { PREFILL_PURCHASE_FROM_COUNT_STORAGE_KEY } from '../../../utils/countSlipPurchaseDraft';
import {
  buildPurchaseEditDataFromSayimInvoices,
  isSayimFazlasiAlisInvoice,
} from '../../../utils/countInvoicePurchaseDraft';
import { FullscreenBodyPortal, MODAL_OVERLAY_Z } from '../../shared/FullscreenBodyPortal';
import { localTodayDateKey } from '../../../utils/localCalendarDate';
import {
  invoiceListPrefsKey,
  loadInvoiceListPrefs,
  saveInvoiceListPrefs,
} from '../../../utils/invoiceListPrefs';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';

export type CountPurchaseDraftPrefill = {
  editData: Record<string, unknown>;
  skipProductStockUpdate?: boolean;
};

export type PosSalesReturnPrefill = {
  editData: Record<string, unknown>;
  openForm?: boolean;
};

export type { ListInvoice } from './invoiceListColumns';

export interface InvoiceListModuleProps {
  onInvoiceSelect?: (invoice: Invoice) => void;
  title?: string;
  description?: string;
  defaultInvoiceTypeFilter?: string;
  defaultCategory?: 'Satis' | 'Alis' | 'Iade' | 'Irsaliye' | 'Siparis' | 'Teklif' | 'Hizmet';
  /** Varsayılan kategori dışında listelenecek ek kategoriler (ör. Satış listesinde iade faturaları) */
  includeCategories?: Array<'Satis' | 'Alis' | 'Iade' | 'Irsaliye' | 'Siparis' | 'Teklif' | 'Hizmet'>;
  customers?: any[];
  products?: any[];
  /** Sayım → alış: ManagementModule navigasyonu ile gelen taslak (sessionStorage’dan bağımsız) */
  countPurchaseDraftPrefill?: CountPurchaseDraftPrefill | null;
  onCountPurchaseDraftPrefillConsumed?: () => void;
  /** POS → Satış İade: kasiyer ve mağaza ön doldurma */
  posSalesReturnPrefill?: PosSalesReturnPrefill | null;
  onPosSalesReturnPrefillConsumed?: () => void;
  /** POS iade sonrası fatura listesinde arama (ör. IADE-2026-…) */
  initialSearchQuery?: string | null;
  onInitialSearchConsumed?: () => void;
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

const LONG_PRESS_MS = 480;
const LONG_PRESS_MOVE_PX = 14;

/** Sunucu sayfalama (getPaginated) — satır başına kayıt seçenekleri */
const INVOICE_LIST_PAGE_SIZES = [200, 300, 400, 500, 1000, 2000] as const;

export function InvoiceListModule({
  customers = [],
  products = [],
  defaultInvoiceTypeFilter,
  defaultCategory,
  includeCategories,
  title,
  description,
  countPurchaseDraftPrefill = null,
  onCountPurchaseDraftPrefillConsumed,
  posSalesReturnPrefill = null,
  onPosSalesReturnPrefillConsumed,
  initialSearchQuery = null,
  onInitialSearchConsumed,
}: InvoiceListModuleProps) {
  const { tm } = useLanguage();
  const { isMobile } = useResponsive();
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  const firmNrKey = selectedFirm?.firm_nr != null ? String(selectedFirm.firm_nr) : '';
  const periodNrKey = selectedPeriod?.nr != null ? String(selectedPeriod.nr).padStart(2, '0') : '';
  const isSalesReturnList = defaultInvoiceTypeFilter === '3';
  const returnProcessorColumnLabel = isSalesReturnList ? tm('salesReturnProcessedBy') : tm('cashier');
  const showGibQueueAction = selectedFirm?.regulatory_region === 'TR';
  const [columnVisibility, setColumnVisibility] = useState(loadInvoiceListColumnVisibility);

  useEffect(() => {
    try {
      const payload = Object.fromEntries(
        INVOICE_LIST_COLUMN_ORDER.map((id) => [id, columnVisibility[id] !== false]),
      );
      localStorage.setItem(INVOICE_LIST_COLUMN_VISIBILITY_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [columnVisibility]);

  const INVOICE_TYPES: InvoiceType[] = [
    { code: 8, name: tm('wholesale'), category: 'Satis', color: 'bg-[var(--asin-accent-muted,#D5F0EE)] text-[var(--asin-primary,#0E2433)] border-[var(--asin-accent,#1FA8A0)]/50', icon: 'FileText', translationKey: 'wholesale' },
    { code: 7, name: tm('retailSale'), category: 'Satis', color: 'bg-[var(--asin-accent-muted,#D5F0EE)] text-[var(--asin-primary,#0E2433)] border-[var(--asin-accent,#1FA8A0)]/50', icon: 'FileText', translationKey: 'retailSale' },
    { code: 3, name: tm('salesReturn'), category: 'Iade', color: 'bg-red-100 text-red-700 border-red-300', icon: 'FileMinus', translationKey: 'salesReturn' },
    { code: 1, name: tm('purchaseInvoices'), category: 'Alis', color: 'bg-cyan-100 text-cyan-700 border-cyan-300', icon: 'FileCheck', translationKey: 'purchaseInvoices' },
    { code: 26, name: tm('invoiceTypeCountSurplus'), category: 'Alis', color: 'bg-amber-100 text-amber-800 border-amber-300', icon: 'FileCheck', translationKey: 'invoiceTypeCountSurplus' },
    { code: 6, name: tm('purchaseReturn'), category: 'Iade', color: 'bg-pink-100 text-pink-700 border-pink-300', icon: 'FileMinus', translationKey: 'purchaseReturn' },
    { code: 9, name: tm('serviceGiven'), category: 'Hizmet', color: 'bg-[var(--asin-accent-muted,#D5F0EE)] text-[var(--asin-primary,#0E2433)] border-[var(--asin-accent,#1FA8A0)]/50', icon: 'FileText', translationKey: 'serviceGiven' },
    { code: 4, name: tm('serviceReceived'), category: 'Hizmet', color: 'bg-teal-100 text-teal-700 border-teal-300', icon: 'FileCheck', translationKey: 'serviceReceived' },
    { code: 10, name: tm('salesWaybill'), category: 'Irsaliye', color: 'bg-teal-100 text-teal-700 border-teal-300', icon: 'Truck', translationKey: 'salesWaybill' },
    { code: 11, name: tm('purchaseWaybill'), category: 'Irsaliye', color: 'bg-sky-100 text-sky-700 border-sky-300', icon: 'Truck', translationKey: 'purchaseWaybill' },
    { code: 12, name: tm('warehouseTransferWaybill'), category: 'Irsaliye', color: 'bg-orange-100 text-orange-700 border-orange-300', icon: 'Truck', translationKey: 'warehouseTransferWaybill' },
    { code: 13, name: tm('wastageWaybill'), category: 'Irsaliye', color: 'bg-red-100 text-red-700 border-red-300', icon: 'Truck', translationKey: 'wastageWaybill' },
    { code: 20, name: tm('salesOrder'), category: 'Siparis', color: 'bg-green-100 text-green-700 border-green-300', icon: 'ShoppingBag', translationKey: 'salesOrder' },
    { code: 21, name: tm('purchaseOrder'), category: 'Siparis', color: 'bg-[var(--asin-accent-muted,#D5F0EE)] text-[var(--asin-primary,#0E2433)] border-[var(--asin-accent,#1FA8A0)]/50', icon: 'ShoppingBag', translationKey: 'purchaseOrder' },
    { code: 30, name: tm('salesQuote'), category: 'Teklif', color: 'bg-[var(--asin-accent-muted,#D5F0EE)] text-[var(--asin-primary,#0E2433)] border-[var(--asin-accent,#1FA8A0)]/50', icon: 'FileSignature', translationKey: 'salesQuote' },
    { code: 31, name: tm('purchaseQuote'), category: 'Teklif', color: 'bg-cyan-100 text-cyan-700 border-cyan-300', icon: 'FileSignature', translationKey: 'purchaseQuote' },
  ];
  const {
    templates: designTemplates,
    loadTemplatesFromDatabase,
    getTemplatesForScope,
    resolveTemplateForScope,
    setTemplateDefaultForScope,
  } = useTemplateStore();
  const [invoices, setInvoices] = useState<ListInvoice[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    invoice: ListInvoice | null;
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
  const handlePrintInvoice = async (invoice: ListInvoice) => {
    // Determine label based on invoice type
    const typeLabel = INVOICE_TYPES.find(t => t.code === (invoice.invoice_type || invoice.trcode))?.name?.toUpperCase() || tm('invoice').toUpperCase();
    await printInvoice(invoice as Invoice, typeLabel);
  };

  const printBoundInvoiceDesign = async (
    invoice: ListInvoice,
    scope: TemplateUsageScope,
    binding: Awaited<ReturnType<typeof getBindingForScope>>,
  ): Promise<boolean> => {
    if (!binding || binding.designKind === 'builtin' || !binding.designId) return false;
    if (!invoice.id) {
      toast.error('Fatura kimliği bulunamadı.');
      return true;
    }

    const fullInvoice = await invoicesAPI.getById(invoice.id);
    const invoiceData = (fullInvoice ?? invoice) as Invoice;
    const context = buildInvoicePrintContext(invoiceData);

    if (binding.designKind === 'fastreport_frx') {
      if (!(await isWindowsPrinterServiceEnabled())) {
        toast.error('FastReport .frx yazdırma için Windows yazıcı servisi açık olmalı.');
        return true;
      }
      await enqueueFastReportFrxJob({
        designId: binding.designId,
        designName: binding.designName,
        scope,
        data: context,
        connection: 'system',
        refType: 'invoice',
        refId: invoiceData.id ?? invoice.id ?? null,
        sourceSystem: 'web',
        priority: 85,
      });
      toast.success('FastReport .frx yazıcı kuyruğuna eklendi.');
      return true;
    }

    const selectedTemplate = designTemplates.find((t) => t.id === binding.designId);
    if (!selectedTemplate) {
      toast.error('Eşleşen Dizayn Merkezi şablonu bulunamadı.');
      return true;
    }
    const reportTemplate = convertTemplateToReportTemplate(selectedTemplate);
    if (await isWindowsPrinterServiceEnabled()) {
      await enqueueFastReportTemplateJob({
        templateId: selectedTemplate.id,
        type: 'invoice',
        data: context,
        connection: 'system',
        refType: 'invoice',
        refId: invoiceData.id ?? invoice.id ?? null,
        sourceSystem: 'web',
        priority: 85,
      });
      toast.success('Yazıcı kuyruğuna eklendi.');
      return true;
    }
    setActiveTemplate(reportTemplate);
    setViewerData(context);
    setShowViewer(true);
    return true;
  };

  const openSpecialPrint = async (invoice: ListInvoice) => {
    const trcode = Number(invoice.invoice_type || invoice.trcode || 0);
    const scope = invoiceScopeFromTrcode(trcode);
    try {
      const binding = await getBindingForScope(firmNrKey || undefined, scope);
      if (await printBoundInvoiceDesign(invoice, scope, binding)) {
        setContextMenu(null);
        return;
      }
    } catch (error) {
      console.warn('[InvoiceListModule] binding read failed, falling back to template resolver:', error);
    }
    const scopedTemplates = getTemplatesForScope('invoice', scope);
    const preferred = resolveTemplateForScope('invoice', scope) ?? scopedTemplates[0] ?? null;
    if (!preferred) {
      toast.error('Bu fatura türü için şablon bulunamadı. Önce Dizayn Merkezi üzerinden şablon ekleyin.');
      return;
    }
    setSpecialPrintState({
      invoice,
      scope,
      selectedTemplateId: preferred.id,
      makeDefault: false,
    });
  };

  const handleSpecialPrint = async () => {
    if (!specialPrintState) return;
    const selectedTemplate = designTemplates.find((t) => t.id === specialPrintState.selectedTemplateId);
    if (!selectedTemplate) {
      toast.error('Seçili şablon bulunamadı.');
      return;
    }
    if (!specialPrintState.invoice.id) {
      toast.error('Fatura kimliği bulunamadı.');
      return;
    }
    setSpecialPrintLoading(true);
    try {
      const fullInvoice = await invoicesAPI.getById(specialPrintState.invoice.id);
      const invoiceData = (fullInvoice ?? specialPrintState.invoice) as Invoice;
      const reportTemplate = convertTemplateToReportTemplate(selectedTemplate);
      const context = buildInvoicePrintContext(invoiceData);
      if (specialPrintState.makeDefault) {
        await setTemplateDefaultForScope(selectedTemplate.id, specialPrintState.scope);
      }
      if (await isWindowsPrinterServiceEnabled()) {
        await enqueueFastReportTemplateJob({
          templateId: selectedTemplate.id,
          type: 'invoice',
          data: context,
          connection: 'system',
          refType: 'invoice',
          refId: invoiceData.id ?? specialPrintState.invoice.id ?? null,
          sourceSystem: 'web',
          priority: 80,
        });
        toast.success('Yazıcı kuyruğuna eklendi.');
        setSpecialPrintState(null);
        setContextMenu(null);
        return;
      }
      setActiveTemplate(reportTemplate);
      setViewerData(context);
      setShowViewer(true);
      setSpecialPrintState(null);
      setContextMenu(null);
    } catch (error) {
      console.error('Özel yazdırma hazırlanırken hata:', error);
      toast.error('Özel yazdırma hazırlanamadı.');
    } finally {
      setSpecialPrintLoading(false);
    }
  };

  const handleRowRightClick = (e: React.MouseEvent, invoice: ListInvoice) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      invoice
    });
  };
  const prefsKey = invoiceListPrefsKey(defaultCategory, defaultInvoiceTypeFilter);
  const initialPrefs = useMemo(() => loadInvoiceListPrefs(prefsKey), [prefsKey]);

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialPrefs?.statusFilter ?? 'all');
  const [dateFilter, setDateFilter] = useState<string>(initialPrefs?.dateFilter ?? 'all');
  const [customDateFrom, setCustomDateFrom] = useState<string>(initialPrefs?.customDateFrom ?? '');
  const [customDateTo, setCustomDateTo] = useState<string>(initialPrefs?.customDateTo ?? '');
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<string>(
    initialPrefs?.invoiceTypeFilter ?? (defaultInvoiceTypeFilter || 'all'),
  );
  const [selectedInvoice, setSelectedInvoice] = useState<ListInvoice | null>(null);
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
  const [viewerData, setViewerData] = useState<Record<string, unknown> | null>(null);
  const [specialPrintState, setSpecialPrintState] = useState<{
    invoice: ListInvoice;
    scope: TemplateUsageScope;
    selectedTemplateId: string;
    makeDefault: boolean;
  } | null>(null);
  const [specialPrintLoading, setSpecialPrintLoading] = useState(false);

  // Sayfalama state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(INVOICE_LIST_PAGE_SIZES[0]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [mobileActionInvoice, setMobileActionInvoice] = useState<ListInvoice | null>(null);

  /** Alış listesi: çoklu seçim → sayım fazlasından taslak */
  const [bulkSelectedInvoices, setBulkSelectedInvoices] = useState<ListInvoice[]>([]);
  const [bulkPurchaseBuilding, setBulkPurchaseBuilding] = useState(false);
  const [invoiceGridNonce, setInvoiceGridNonce] = useState(0);
  const [purchaseCreateSaveOptions, setPurchaseCreateSaveOptions] = useState<{
    skipProductStockUpdate?: boolean;
  } | null>(null);

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
      case 'range': {
        // API: date::date >= start AND date::date <= end (bitiş dahil)
        let start = customDateFrom?.trim().substring(0, 10) || null;
        let end = customDateTo?.trim().substring(0, 10) || null;
        if (start && end && start > end) {
          const tmp = start;
          start = end;
          end = tmp;
        }
        return { start, end };
      }
      case 'all':
      default:
        return { start: null, end: null };
    }
  };

  // Faturaları yükle (sayfalama ile) — firma/dönem değişince yenile
  useEffect(() => {
    if (!firmNrKey) return;
    // Dönem henüz seçilmediyse (firma değişimi ara durumu) eski dönemle sorgu atma
    if (selectedFirm && !selectedPeriod && !periodNrKey) return;
    void loadInvoices();
  }, [currentPage, pageSize, dateFilter, customDateFrom, customDateTo, statusFilter, invoiceTypeFilter, defaultCategory, firmNrKey, periodNrKey]);

  useEffect(() => {
    void loadTemplatesFromDatabase();
  }, [loadTemplatesFromDatabase]);

  useEffect(() => {
    setBulkSelectedInvoices([]);
    setInvoiceGridNonce((n) => n + 1);
  }, [defaultCategory]);

  useEffect(() => {
    const q = initialSearchQuery?.trim();
    if (!q) return;
    setSearchQuery(q);
    setCurrentPage(1);
    onInitialSearchConsumed?.();
  }, [initialSearchQuery, onInitialSearchConsumed]);

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

  // Sync state with props when they change — kayıtlı tercih varsa üzerine yazma
  useEffect(() => {
    if (!initialPrefs?.invoiceTypeFilter) {
      setInvoiceTypeFilter(defaultInvoiceTypeFilter || 'all');
    }
  }, [defaultInvoiceTypeFilter, initialPrefs?.invoiceTypeFilter]);

  useEffect(() => {
    setSelectedCategory(defaultCategory || 'all');
    if (defaultCategory === 'Alis' && !initialPrefs?.dateFilter) {
      setDateFilter('all');
    }
  }, [defaultCategory, initialPrefs?.dateFilter]);

  useEffect(() => {
    saveInvoiceListPrefs(prefsKey, {
      dateFilter,
      customDateFrom,
      customDateTo,
      invoiceTypeFilter,
      statusFilter,
      detailInvoiceId: selectedInvoice?.id ?? null,
      showDetail: showDetailModal,
    });
  }, [prefsKey, dateFilter, customDateFrom, customDateTo, invoiceTypeFilter, statusFilter, selectedInvoice?.id, showDetailModal]);

  /** Sayım → alış taslak: önce props (navigasyon), yoksa sessionStorage (yedek). */
  useEffect(() => {
    if (defaultCategory !== 'Alis') return;

    const openCountPurchaseDraft = (editData: Record<string, unknown>, skipProductStockUpdate?: boolean) => {
      const purchaseType = INVOICE_TYPES.find((t) => t.code === 1);
      if (!purchaseType) return;
      setShowInvoiceTypeModal(false);
      setEditInvoiceData(editData as unknown as Invoice);
      setNewFormCounter((c) => c + 1);
      setSelectedInvoiceType(purchaseType);
      if (skipProductStockUpdate) {
        setPurchaseCreateSaveOptions({ skipProductStockUpdate: true });
      } else {
        setPurchaseCreateSaveOptions(null);
      }
    };

    const ext = countPurchaseDraftPrefill;
    if (ext?.editData) {
      openCountPurchaseDraft(ext.editData, !!ext.skipProductStockUpdate);
      try {
        sessionStorage.removeItem(PREFILL_PURCHASE_FROM_COUNT_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      /* React 18 Strict Mode: aynı effect iki kez; anında consume edilirse ikinci çalışmada prefill boş kalır */
      const clearPrefillTimer = window.setTimeout(() => {
        onCountPurchaseDraftPrefillConsumed?.();
      }, 0);
      return () => {
        window.clearTimeout(clearPrefillTimer);
      };
    }

    try {
      const raw = sessionStorage.getItem(PREFILL_PURCHASE_FROM_COUNT_STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw) as {
        editData?: Record<string, unknown>;
        skipProductStockUpdate?: boolean;
      };
      sessionStorage.removeItem(PREFILL_PURCHASE_FROM_COUNT_STORAGE_KEY);
      if (!payload?.editData) return;
      openCountPurchaseDraft(payload.editData, !!payload.skipProductStockUpdate);
    } catch {
      sessionStorage.removeItem(PREFILL_PURCHASE_FROM_COUNT_STORAGE_KEY);
    }
  }, [defaultCategory, countPurchaseDraftPrefill, onCountPurchaseDraftPrefillConsumed]);

  /** POS → Satış İade: kasiyer bilgisiyle formu otomatik aç */
  useEffect(() => {
    if (defaultInvoiceTypeFilter !== '3') return;
    const ext = posSalesReturnPrefill;
    if (!ext?.editData || ext.openForm === false) return;

    const returnType = INVOICE_TYPES.find((t) => t.code === 3);
    if (!returnType) return;

    setShowInvoiceTypeModal(false);
    setEditInvoiceData(ext.editData as unknown as Invoice);
    setNewFormCounter((c) => c + 1);
    setSelectedInvoiceType(returnType);
    setPurchaseCreateSaveOptions(null);

    const clearPrefillTimer = window.setTimeout(() => {
      onPosSalesReturnPrefillConsumed?.();
    }, 0);
    return () => {
      window.clearTimeout(clearPrefillTimer);
    };
  }, [defaultInvoiceTypeFilter, posSalesReturnPrefill, onPosSalesReturnPrefillConsumed]);

  const loadInvoicesRequestIdRef = useRef(0);

  const loadInvoices = async () => {
    const requestId = ++loadInvoicesRequestIdRef.current;
    setIsLoading(true);
    try {
      const { invoicesAPI } = await import('../../../services/api/invoices');

      const dateRange = getDateRange();

      const categoryFilterList = includeCategories?.length
        ? Array.from(new Set([defaultCategory, ...includeCategories].filter(Boolean))) as string[]
        : defaultCategory
          ? [defaultCategory]
          : [];

      const statusCancelled = statusFilter === 'cancelled';
      const firmNr = firmNrKey || undefined;
      const periodNr = periodNrKey || undefined;

      const result = await invoicesAPI.getPaginated({
        page: currentPage,
        pageSize: pageSize,
        search: searchQuery || undefined,
        status: statusFilter !== 'all' && !statusCancelled ? statusFilter : undefined,
        startDate: dateRange.start ? String(dateRange.start) : undefined,
        endDate: dateRange.end ? String(dateRange.end) : undefined,
        invoiceCategories: categoryFilterList.length > 0 ? categoryFilterList : undefined,
        invoiceCategory: categoryFilterList.length === 1 ? categoryFilterList[0] : undefined,
        invoiceType: invoiceTypeFilter && invoiceTypeFilter !== 'all' ? parseInt(invoiceTypeFilter) : 0,
        firmNr,
        periodNr,
        cancelledOnly: statusCancelled,
        includeCancelled: statusCancelled,
      });

      if (requestId !== loadInvoicesRequestIdRef.current) return;

      // Client-side fatura türü ve kategori filtresi
      let filteredData = result.data;

      // Fatura türü filtresi
      if (invoiceTypeFilter !== 'all') {
        filteredData = (filteredData as ListInvoice[]).filter(inv => {
          const invoiceType = inv.invoice_type ?? inv.trcode ?? 0;
          return invoiceType.toString() === invoiceTypeFilter;
        });
      }

      /* Kategori: API ile aynı Logo trcode grupları (INVOICE_TYPES tek kod=tek kategori değil; 4,13,6 çakışıyor) */
      if (categoryFilterList.length > 0) {
        filteredData = filteredData.filter((inv) =>
          categoryFilterList.some((cat) => invoiceMatchesModuleCategory(inv, cat)),
        );
      } else if (defaultCategory) {
        filteredData = filteredData.filter((inv) => invoiceMatchesModuleCategory(inv, defaultCategory));
      }

      setInvoices(filteredData as ListInvoice[]);
      // İstemci filtresi sonrası gerçek sayfa boyutu; total API'den (yaklaşık) — boş sayfa yanılsamasını azalt
      setTotalCount(result.total);
      setTotalPages(result.totalPages);

      if (result.data.length > 0 && filteredData.length === 0) {
        console.warn('[InvoiceListModule] Data exists in API but was filtered out on client!', {
          apiFirstRow: result.data[0],
          filters: { statusFilter, invoiceTypeFilter, defaultCategory }
        });
      }
    } catch (error) {
      if (requestId !== loadInvoicesRequestIdRef.current) return;
      console.error('Faturalar yüklenirken hata:', error);
      setInvoices([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally {
      if (requestId === loadInvoicesRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleViewDetail = (invoice: ListInvoice) => {
    setSelectedInvoice(invoice);
    setShowDetailModal(true);
  };

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }, []);

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  const startLongPress = useCallback(
    (clientX: number, clientY: number, invoice: ListInvoice) => {
      clearLongPress();
      longPressOriginRef.current = { x: clientX, y: clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressOriginRef.current = null;
        setMobileActionInvoice(invoice);
      }, LONG_PRESS_MS);
    },
    [clearLongPress]
  );

  const maybeCancelLongPressMove = useCallback(
    (clientX: number, clientY: number) => {
      const o = longPressOriginRef.current;
      if (!o || !longPressTimerRef.current) return;
      if (
        Math.abs(clientX - o.x) > LONG_PRESS_MOVE_PX ||
        Math.abs(clientY - o.y) > LONG_PRESS_MOVE_PX
      ) {
        clearLongPress();
      }
    },
    [clearLongPress]
  );

  const formatInvoiceDateStr = (dateValue: string | undefined) => {
    if (!dateValue) return '—';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return tm('invalidDate');
      return date.toLocaleDateString(tm('localeCode'), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return '—';
    }
  };

  const getInvoiceTypeMeta = (invoice: ListInvoice) => {
    let invoiceTypeCode: number | undefined = invoice.invoice_type;
    if (invoiceTypeCode === undefined || invoiceTypeCode === null) {
      if (invoice.source === 'pos' || invoice.cashier) {
        invoiceTypeCode = 1;
      } else {
        invoiceTypeCode = 0;
      }
    }
    const invoiceType = INVOICE_TYPES.find(t => t.code === invoiceTypeCode);
    if (invoiceType) {
      return { label: invoiceType.name, Icon: getIcon(invoiceType.icon) };
    }
    if (invoice.invoice_category) {
      const categoryType = INVOICE_TYPES.find(t => t.category === invoice.invoice_category);
      if (categoryType) {
        return { label: tm(categoryType.translationKey), Icon: getIcon(categoryType.icon) };
      }
    }
    return { label: tm('salesInvoices'), Icon: FileText };
  };

  const statusBadgeClass = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      refunded: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-100 text-gray-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const resolveInvoiceTypeForEdit = (inv: ListInvoice): InvoiceType => {
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

  const handleEditInvoice = async (invoice: ListInvoice) => {
    if (!invoice.id) {
      toast.error(tm('invoiceSaveError'));
      return;
    }
    setPurchaseCreateSaveOptions(null);

    try {
      const { invoicesAPI } = await import('../../../services/api/invoices');
      const fullInvoice = await invoicesAPI.getById(invoice.id);
      const raw = fullInvoice ?? invoice;
      /* Yeni referans: useEffect(items) tetiklensin; kalemler kopyalanmış olsun */
      const data = {
        ...raw,
        source: invoice.source === 'pos' ? 'pos' : (raw as any).source,
        items: Array.isArray(raw.items) ? raw.items.map((it: any) => ({ ...it })) : []
      };
      const invoiceType = resolveInvoiceTypeForEdit(data as ListInvoice);
      setEditInvoiceData(data as Invoice);
      setSelectedInvoiceType(invoiceType);
    } catch (error) {
      console.error('Fatura detayları yüklenirken hata:', error);
      const data = {
        ...invoice,
        items: Array.isArray(invoice.items) ? invoice.items.map((it: any) => ({ ...it })) : []
      };
      const invoiceType = resolveInvoiceTypeForEdit(data as ListInvoice);
      setEditInvoiceData(data as Invoice);
      setSelectedInvoiceType(invoiceType);
    }
  };

  const handleCreateInvoice = () => {
    setEditInvoiceData(null);
    setPurchaseCreateSaveOptions(null);
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
    setPurchaseCreateSaveOptions(null);
    setNewFormCounter((c) => c + 1);
    setSelectedInvoiceType(type);
    setShowInvoiceTypeModal(false);
  };

  const handleBulkPurchaseFromSayim = async () => {
    if (defaultCategory !== 'Alis') return;
    const rows = bulkSelectedInvoices;
    if (!rows.length) {
      toast.error(tm('invoiceBulkPurchaseFromSayimNeedSelect'));
      return;
    }
    if (!rows.every((r) => isSayimFazlasiAlisInvoice(r))) {
      toast.error(tm('invoiceBulkPurchaseFromSayimNotSayim'));
      return;
    }
    setBulkPurchaseBuilding(true);
    try {
      const { invoicesAPI } = await import('../../../services/api/invoices');
      const full = (
        await Promise.all(rows.map((r) => (r.id ? invoicesAPI.getById(String(r.id)) : Promise.resolve(null))))
      ).filter(Boolean) as Invoice[];
      const draft = buildPurchaseEditDataFromSayimInvoices(full, tm);
      if (!draft) {
        toast.error(tm('invoiceBulkPurchaseFromSayimNoLines'));
        return;
      }
      const purchaseType = INVOICE_TYPES.find((t) => t.code === 1);
      if (!purchaseType) return;
      setShowInvoiceTypeModal(false);
      setPurchaseCreateSaveOptions({ skipProductStockUpdate: true });
      setEditInvoiceData(draft as unknown as Invoice);
      setNewFormCounter((c) => c + 1);
      setSelectedInvoiceType(purchaseType);
      setBulkSelectedInvoices([]);
      setInvoiceGridNonce((n) => n + 1);
      toast.success(tm('countPurchaseFromSurplusSuccess'));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`${tm('countPurchaseFromSurplusError')}: ${msg}`);
    } finally {
      setBulkPurchaseBuilding(false);
    }
  };

  const handleCloseInvoiceForm = () => {
    setSelectedInvoiceType(null);
    setEditInvoiceData(null);
    setPurchaseCreateSaveOptions(null);
    setBulkSelectedInvoices([]);
    setInvoiceGridNonce((n) => n + 1);
    loadInvoices(); // Fatura oluşturulduktan sonra listeyi yenile
  };

  // Kategorilere göre filtreleme (alış iadesi TRCODE 6 → UI'da Iade; alış sekmesinde de görünsün)
  const invoiceTypeMatchesPickerCategory = (type: InvoiceType, category: string): boolean => {
    if (category === 'all') return true;
    if (type.category === category) return true;
    if (category === 'Alis' && type.code === 6) return true;
    if (category === 'Satis' && type.code === 3) return true;
    return false;
  };

  const categories = [
    { id: 'all', label: tm('all'), count: INVOICE_TYPES.length },
    { id: 'Satis', label: tm('sales'), count: INVOICE_TYPES.filter(t => invoiceTypeMatchesPickerCategory(t, 'Satis')).length },
    { id: 'Alis', label: tm('purchase'), count: INVOICE_TYPES.filter(t => invoiceTypeMatchesPickerCategory(t, 'Alis')).length },
    { id: 'Hizmet', label: tm('service'), count: INVOICE_TYPES.filter(t => t.category === 'Hizmet').length },
    { id: 'Irsaliye', label: tm('waybill'), count: INVOICE_TYPES.filter(t => t.category === 'Irsaliye').length },
    { id: 'Siparis', label: tm('order'), count: INVOICE_TYPES.filter(t => t.category === 'Siparis').length },
    { id: 'Teklif', label: tm('quote'), count: INVOICE_TYPES.filter(t => t.category === 'Teklif').length },
    { id: 'Iade', label: tm('return'), count: INVOICE_TYPES.filter(t => t.category === 'Iade').length },
  ];

  const filteredTypes = INVOICE_TYPES.filter((t) => invoiceTypeMatchesPickerCategory(t, selectedCategory));

  const resolveListRowCurrency = (inv: ListInvoice): string => {
    const c = String(inv.currency ?? '').trim().toUpperCase();
    if (c) return c;
    const firm = String(selectedFirm?.ana_para_birimi ?? selectedFirm?.raporlama_para_birimi ?? '').trim().toUpperCase();
    return firm || 'IQD';
  };

  const headerTotalsCurrency = useMemo(() => {
    const codes = invoices.map((i) => String(i.currency ?? '').trim().toUpperCase()).filter(Boolean);
    const uniq = new Set(codes);
    if (uniq.size === 1) return [...uniq][0];
    const firm = String(selectedFirm?.ana_para_birimi ?? selectedFirm?.raporlama_para_birimi ?? '').trim().toUpperCase();
    return firm || 'IQD';
  }, [invoices, selectedFirm]);

  const columnVisibilityItems = useMemo(
    () =>
      invoiceListColumnVisibilityMenuItems({
        columnVisibility,
        tm,
        cashierLabel: returnProcessorColumnLabel,
      }),
    [columnVisibility, tm, returnProcessorColumnLabel],
  );

  const columns = useMemo(
    () =>
      buildInvoiceListColumns({
        columnVisibility,
        tm,
        localeCode: tm('localeCode'),
        invoiceTypes: INVOICE_TYPES,
        getIcon,
        returnProcessorColumnLabel,
        resolveListRowCurrency,
        onViewDetail: handleViewDetail,
        onEdit: (inv) => void handleEditInvoice(inv),
      }),
    [
      columnVisibility,
      tm,
      returnProcessorColumnLabel,
      selectedFirm,
      INVOICE_TYPES,
      handleViewDetail,
      handleEditInvoice,
    ],
  );

  const totalAmount = useMemo(
    () => invoices.reduce((sum, inv) => sum + (inv.total ?? inv.total_amount ?? 0), 0),
    [invoices],
  );

  const listFooterTotals = useMemo(() => {
    const cur = headerTotalsCurrency;
    const fmt = (n: number) => `${formatNumber(n, 2, true)} ${cur}`;
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    let total = 0;
    let totalCost = 0;
    let grossProfit = 0;
    for (const inv of invoices) {
      subtotal += Number(inv.subtotal || 0);
      discount += Number(inv.discount || 0);
      tax += Number(inv.tax || 0);
      total += Number(inv.total_amount ?? inv.total ?? 0);
      totalCost += Number(inv.total_cost || 0);
      grossProfit += Number(inv.gross_profit || 0);
    }
    return { subtotal, discount, tax, total, totalCost, grossProfit, fmt, count: invoices.length };
  }, [invoices, headerTotalsCurrency]);

  const gridFooterSumColumns = useMemo(() => {
    const cur = headerTotalsCurrency;
    const formatMoney = (sum: number) => (
      <span className="tabular-nums">{formatNumber(sum, 2, true)} {cur}</span>
    );
    const defs: Array<{
      columnId: string;
      getValue: (row: ListInvoice) => number;
      format: (sum: number) => ReturnType<typeof formatMoney>;
    }> = [];
    const pushIfVisible = (
      id: string,
      visible: boolean,
      getValue: (row: ListInvoice) => number,
    ) => {
      if (!visible) return;
      defs.push({ columnId: id, getValue, format: formatMoney });
    };
    pushIfVisible('subtotal', columnVisibility.subtotal !== false, (inv) => Number(inv.subtotal || 0));
    pushIfVisible('discount', columnVisibility.discount !== false, (inv) => Number(inv.discount || 0));
    pushIfVisible('tax', columnVisibility.tax !== false, (inv) => Number(inv.tax || 0));
    pushIfVisible('total', columnVisibility.total !== false, (inv) => Number(inv.total_amount ?? inv.total ?? 0));
    pushIfVisible('total_cost', columnVisibility.total_cost !== false, (inv) => Number(inv.total_cost || 0));
    pushIfVisible('gross_profit', columnVisibility.gross_profit !== false, (inv) => Number(inv.gross_profit || 0));
    return defs;
  }, [columnVisibility, headerTotalsCurrency]);

  const invoiceGridFooterLabel = useMemo(() => {
    if (columnVisibility.total !== false) return tm('invoiceListDipTotal');
    return `${tm('invoiceListDipTotal')}: ${formatNumber(listFooterTotals.total, 2, true)} ${headerTotalsCurrency}`;
  }, [columnVisibility.total, listFooterTotals.total, headerTotalsCurrency, tm]);

  const columnVisibilityControl = !isMobile ? (
    <ColumnVisibilityMenu
      variant="filterBar"
      columns={columnVisibilityItems}
      onToggle={(columnId) => {
        setColumnVisibility((prev) => ({
          ...prev,
          [columnId]: !(prev[columnId] !== false),
        }));
      }}
      onShowAll={() => {
        setColumnVisibility(Object.fromEntries(INVOICE_LIST_COLUMN_ORDER.map((id) => [id, true])));
      }}
      onHideAll={() => {
        setColumnVisibility(Object.fromEntries(INVOICE_LIST_COLUMN_ORDER.map((id) => [id, false])));
      }}
    />
  ) : null;

  if (selectedInvoiceType) {
    return (
      <UniversalInvoiceForm
        key={editInvoiceData?.id ?? `draft-${newFormCounter}`}
        invoiceType={selectedInvoiceType}
        customers={customers}
        products={products}
        onClose={handleCloseInvoiceForm}
        editData={editInvoiceData}
        createSaveOptions={purchaseCreateSaveOptions ?? undefined}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--asin-accent,#1FA8A0)] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">{tm('loadingInvoices')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 theme-lock-light" data-theme-lock="light">
      {/* Header */}
      <div className="bg-[var(--asin-primary,#0E2433)] text-white px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">{title || tm('invoices')}</h2>
              <span className="text-[var(--asin-accent-muted,#D5F0EE)] text-[10px]">• {totalCount.toLocaleString(tm('localeCode'))} {tm('invoicesCount')}</span>
              <span className="text-[var(--asin-accent-muted,#D5F0EE)] text-[10px] ml-1">• {formatNumber(totalAmount, 2, true)} {headerTotalsCurrency}</span>
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
              className="flex items-center gap-1 px-3 py-1 bg-white text-[var(--asin-primary,#0E2433)] hover:bg-[var(--asin-accent-muted,#D5F0EE)] transition-colors text-[10px] font-bold"
            >
              <Plus className="w-3 h-3" />
              {tm('newInvoice')}
            </button>
            {defaultCategory === 'Alis' && !isMobile && (
              <button
                type="button"
                onClick={() => void handleBulkPurchaseFromSayim()}
                disabled={bulkPurchaseBuilding || bulkSelectedInvoices.length === 0}
                title={tm('invoiceBulkPurchaseFromSayimHint')}
                className="flex items-center gap-1 px-2 py-1 bg-white/15 hover:bg-white/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[10px] font-bold border border-white/30 rounded"
              >
                <ClipboardList className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[140px]">{tm('invoiceBulkPurchaseFromSayimBtn')}</span>
              </button>
            )}
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
                className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[var(--asin-accent,#1FA8A0)] focus:bg-white transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Date Filter */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded px-2 dark:bg-gray-800 dark:border-gray-600">
              <Calendar className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
              <select
                value={dateFilter}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === 'range') {
                    const today = localTodayDateKey();
                    const monthStart = `${today.slice(0, 7)}-01`;
                    if (!customDateFrom) setCustomDateFrom(monthStart);
                    if (!customDateTo) setCustomDateTo(today);
                  }
                  setDateFilter(next);
                  setCurrentPage(1);
                }}
                className="bg-transparent py-1.5 text-xs focus:outline-none min-w-[100px] dark:text-gray-200"
              >
                <option value="today">{tm('today')}</option>
                <option value="week">{tm('thisWeek')}</option>
                <option value="month">{tm('thisMonth')}</option>
                <option value="range">{tm('dateRange')}</option>
                <option value="all">{tm('all')}</option>
              </select>
            </div>

            {dateFilter === 'range' && (
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded px-2 dark:bg-gray-800 dark:border-gray-600">
                <label className="sr-only" htmlFor="invoice-list-date-from">{tm('dateFrom')}</label>
                <input
                  id="invoice-list-date-from"
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => {
                    setCustomDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  title={tm('dateFrom')}
                  className="bg-transparent py-1.5 text-xs focus:outline-none dark:text-gray-200 dark:[color-scheme:dark]"
                />
                <span className="text-gray-400 text-xs shrink-0">–</span>
                <label className="sr-only" htmlFor="invoice-list-date-to">{tm('dateTo')}</label>
                <input
                  id="invoice-list-date-to"
                  type="date"
                  value={customDateTo}
                  onChange={(e) => {
                    setCustomDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  title={tm('dateTo')}
                  className="bg-transparent py-1.5 text-xs focus:outline-none dark:text-gray-200 dark:[color-scheme:dark]"
                />
              </div>
            )}

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded px-2">
              <FilterIcon className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent py-1.5 text-xs focus:outline-none min-w-[110px]"
              >
                <option value="all">{tm('allStatuses')}</option>
                <option value="completed">{tm('completed')}</option>
                <option value="unpaid">{tm('unpaid') || 'Ödenmedi'}</option>
                <option value="pending">{tm('pending')}</option>
                <option value="refunded">{tm('refunded')}</option>
                <option value="cancelled">{tm('cancelled')}</option>
              </select>
            </div>

            {columnVisibilityControl}

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

      {/* Invoice Table — mobilde kart + uzun basma; masaüstünde grid */}
      <div className={`flex-1 min-h-0 flex flex-col ${isMobile ? 'overflow-hidden p-2' : 'overflow-auto p-6'}`}>
        {isMobile ? (
          <>
            <p className="text-[11px] text-gray-500 px-1 pb-2 shrink-0">{tm('invoiceMobileLongPressHint')}</p>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 touch-pan-y">
              {invoices.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">{tm('noDataFound')}</div>
              ) : (
                invoices.map((inv) => {
                  const meta = getInvoiceTypeMeta(inv);
                  const TypeIcon = meta.Icon;
                  const totalVal = inv.total_amount ?? inv.total ?? 0;
                  const rowCur = resolveListRowCurrency(inv);
                  const rowKey = String(inv.id ?? inv.invoice_no);
                  const st = inv.status || '';
                  return (
                    <div
                      key={rowKey}
                      className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm touch-manipulation select-none active:bg-gray-50/80"
                      onPointerDown={(e) => {
                        if (e.pointerType === 'mouse' && e.button !== 0) return;
                        try {
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        } catch {
                          /* ignore */
                        }
                        startLongPress(e.clientX, e.clientY, inv);
                      }}
                      onPointerMove={(e) => {
                        maybeCancelLongPressMove(e.clientX, e.clientY);
                      }}
                      onPointerUp={(e) => {
                        try {
                          const el = e.currentTarget as HTMLElement;
                          if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) {
                            el.releasePointerCapture(e.pointerId);
                          }
                        } catch {
                          /* ignore */
                        }
                        clearLongPress();
                      }}
                      onPointerCancel={(e) => {
                        try {
                          const el = e.currentTarget as HTMLElement;
                          if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) {
                            el.releasePointerCapture(e.pointerId);
                          }
                        } catch {
                          /* ignore */
                        }
                        clearLongPress();
                      }}
                    >
                      <div className="flex justify-between gap-2 items-start">
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">{tm('invoiceNo')}</div>
                          <div className="text-sm font-semibold text-[var(--asin-accent,#1FA8A0)] truncate">{inv.invoice_no}</div>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-gray-700">
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500 shrink-0">{tm('customerSupplier')}</span>
                          <span className="text-right font-medium truncate">{inv.customer_name || tm('noCustomer')}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500 shrink-0">{tm('date')}</span>
                          <span className="tabular-nums">{formatInvoiceDateStr(inv.invoice_date || inv.date)}</span>
                        </div>
                        <div className="flex items-center gap-2 pt-0.5">
                          <TypeIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden />
                          <span className="text-[11px] font-medium text-gray-800 truncate">{meta.label}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500 shrink-0">{tm('total')}</span>
                          <span className="font-semibold tabular-nums">
                            {totalVal > 0 ? `${formatNumber(totalVal, 2, true)} ${rowCur}` : `0 ${rowCur}`}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2 items-center">
                          <span className="text-gray-500 shrink-0">{tm('status')}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadgeClass(st)}`}>
                            {tm(st) || st}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500 shrink-0">{returnProcessorColumnLabel}</span>
                          <span>{inv.cashier || '—'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="shrink-0 border-t border-gray-200 bg-white px-2 py-2 mt-1 rounded-b-lg">
              <div className="flex items-center justify-between gap-2 px-1 pb-2 mb-1 border-b border-gray-100">
                <span className="text-[11px] font-bold text-[var(--asin-primary,#0E2433)]">
                  {tm('invoiceListDipTotal')}
                  <span className="ml-1 font-semibold text-[var(--asin-accent,#1FA8A0)]/80">({listFooterTotals.count})</span>
                </span>
                <span className="text-xs font-bold tabular-nums text-[var(--asin-primary,#0E2433)]">
                  {listFooterTotals.fmt(listFooterTotals.total)}
                </span>
              </div>
              {(columnVisibility.subtotal !== false ||
                columnVisibility.discount !== false ||
                columnVisibility.tax !== false) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-2 text-[10px] text-gray-600">
                  {columnVisibility.subtotal !== false && (
                    <span>
                      {tm('subtotal')}: <strong className="tabular-nums">{listFooterTotals.fmt(listFooterTotals.subtotal)}</strong>
                    </span>
                  )}
                  {columnVisibility.discount !== false && (
                    <span>
                      {tm('discount')}: <strong className="tabular-nums">{listFooterTotals.fmt(listFooterTotals.discount)}</strong>
                    </span>
                  )}
                  {columnVisibility.tax !== false && (
                    <span>
                      {tm('tax')}: <strong className="tabular-nums">{listFooterTotals.fmt(listFooterTotals.tax)}</strong>
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="flex-1 py-2.5 text-xs font-semibold rounded-lg border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                >
                  {tm('previous')}
                </button>
                <span className="text-[11px] text-gray-600 text-center px-1 flex-[1.4] leading-tight">
                  {tm('page')} {currentPage} / {totalPages || 1}
                  <span className="text-gray-400"> • </span>
                  {totalCount} {tm('records')}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= (totalPages || 1)}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages || 1, p + 1))}
                  className="flex-1 py-2.5 text-xs font-semibold rounded-lg border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                >
                  {tm('next')}
                </button>
              </div>
              <div className="mt-2 flex justify-center">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="max-w-[200px] w-full px-2 py-1.5 border border-gray-200 rounded-lg text-[11px] bg-gray-50"
                >
                  {INVOICE_LIST_PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {tm('show')} {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : (
          <>
            <DevExDataGrid
              key={`invlist-${invoiceGridNonce}`}
              data={invoices}
              columns={columns}
              density="comfortable"
              enableSorting={false}
              enableFiltering={true}
              enableColumnResizing
              enablePagination={false}
              enableSelection={defaultCategory === 'Alis' && !isMobile}
              onSelectionChange={(rows) => setBulkSelectedInvoices(rows as ListInvoice[])}
              onRowDoubleClick={(invoice) => handleEditInvoice(invoice)}
              onRowContextMenu={handleRowRightClick}
              footerSumColumns={gridFooterSumColumns.length > 0 ? gridFooterSumColumns : undefined}
              footerLabel={invoiceGridFooterLabel}
            />

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
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--asin-accent,#1FA8A0)]"
                >
                  {INVOICE_LIST_PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {tm('show')} {n}
                    </option>
                  ))}
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
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  {tm('previous')}
                </button>
                <span className="px-4 py-1.5 text-sm text-gray-700">
                  {tm('page')} {currentPage} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages || 1, p + 1))}
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
          </>
        )}
      </div>

      {/* Mobil: uzun basma işlem sayfası — body portal (üst çubuk altında kalmaması için) */}
      {mobileActionInvoice && (
        <FullscreenBodyPortal
          zIndex={MODAL_OVERLAY_Z}
          className="flex items-end justify-center bg-black/50 sm:items-center sm:p-4 overflow-hidden"
          role="dialog"
          aria-modal
          onClick={() => setMobileActionInvoice(null)}
        >
          <div
            className="w-full max-h-[88vh] rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl flex flex-col max-w-lg sm:max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{title || tm('invoices')}</p>
                <h3 className="text-base font-bold text-gray-900 leading-tight break-words">{mobileActionInvoice.invoice_no}</h3>
                <p className="text-xs text-gray-500 mt-1 truncate">{mobileActionInvoice.customer_name || tm('noCustomer')}</p>
              </div>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0"
                aria-label={tm('close')}
                onClick={() => setMobileActionInvoice(null)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
              {[
                [tm('invoiceNo'), mobileActionInvoice.invoice_no],
                [tm('customerSupplier'), mobileActionInvoice.customer_name || tm('noCustomer')],
                [tm('date'), formatInvoiceDateStr(mobileActionInvoice.invoice_date || mobileActionInvoice.date)],
                [tm('invoiceType'), getInvoiceTypeMeta(mobileActionInvoice).label],
                [
                  tm('total'),
                  (() => {
                    const v = mobileActionInvoice.total_amount ?? mobileActionInvoice.total ?? 0;
                    const cur = resolveListRowCurrency(mobileActionInvoice);
                    return v > 0 ? `${formatNumber(v, 2, true)} ${cur}` : `0 ${cur}`;
                  })()
                ],
                [tm('status'), tm(mobileActionInvoice.status || '') || mobileActionInvoice.status || '—'],
                [returnProcessorColumnLabel, mobileActionInvoice.cashier || '—']
              ].map(([label, val]) => (
                <div key={String(label)} className="flex justify-between gap-3 border-b border-gray-50 pb-2 last:border-0">
                  <span className="text-[10px] text-gray-500 font-semibold shrink-0">{label}</span>
                  <span className="text-right text-gray-900 break-all">{val}</span>
                </div>
              ))}
            </div>
            <div className="shrink-0 border-t border-gray-100 p-3 space-y-2 bg-gray-50 rounded-b-2xl">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="py-2.5 px-2 text-xs font-semibold rounded-lg bg-[var(--asin-accent,#1FA8A0)] text-white"
                  onClick={() => {
                    const inv = mobileActionInvoice;
                    setMobileActionInvoice(null);
                    handleViewDetail(inv);
                  }}
                >
                  {tm('viewDetails')}
                </button>
                <button
                  type="button"
                  className="py-2.5 px-2 text-xs font-semibold rounded-lg border border-gray-300 bg-white"
                  onClick={() => {
                    const inv = mobileActionInvoice;
                    setMobileActionInvoice(null);
                    void handleEditInvoice(inv);
                  }}
                >
                  {tm('edit')}
                </button>
                <button
                  type="button"
                  className={`py-2.5 px-2 text-xs font-semibold rounded-lg border border-gray-300 bg-white ${showGibQueueAction ? '' : 'col-span-2'}`}
                  onClick={() => {
                    const inv = mobileActionInvoice;
                    setMobileActionInvoice(null);
                    void handlePrintInvoice(inv);
                  }}
                >
                  {tm('print')}
                </button>
                {showGibQueueAction ? (
                  <button
                    type="button"
                    className="py-2.5 px-2 text-xs font-semibold rounded-lg border border-amber-200 bg-amber-50 text-amber-900"
                    onClick={async () => {
                      const inv = mobileActionInvoice;
                      setMobileActionInvoice(null);
                      if (!inv?.id) return;
                      const r = await enqueueSaleInvoice(inv.id);
                      if (r.ok) toast.success(r.message);
                      else toast.error(r.message);
                    }}
                  >
                    GİB kuyruğu
                  </button>
                ) : null}
                <button
                  type="button"
                  className="py-2.5 px-2 text-xs font-semibold rounded-lg bg-red-600 text-white col-span-2"
                  onClick={() => {
                    const inv = mobileActionInvoice;
                    if (!inv?.id) return;
                    setMobileActionInvoice(null);
                    void handleDeleteInvoice(inv.id, inv.invoice_no);
                  }}
                >
                  {tm('deleteAction')}
                </button>
              </div>
            </div>
          </div>
        </FullscreenBodyPortal>
      )}

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
            {
              id: 'special-print',
              label: 'Özel Yazdır',
              icon: Printer,
              onClick: () => {
                if (contextMenu.invoice) {
                  void openSpecialPrint(contextMenu.invoice);
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
              label: 'Dizayn Merkezi',
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
                if (contextMenu.invoice?.id) {
                  handleDeleteInvoice(contextMenu.invoice.id, contextMenu.invoice.invoice_no);
                }
              },
              variant: 'danger'
            }
          ]}
        />
      )}

      {specialPrintState && (
        <PercentBodyModal onClose={() => setSpecialPrintState(null)} size="list" ariaLabel="Özel Yazdır">
              <div className="bg-[var(--asin-primary,#0E2433)] px-8 py-6 text-white shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight">Özel Yazdır</h2>
                    <p className="text-[var(--asin-accent-muted,#D5F0EE)] text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90">
                      {specialPrintState.invoice.invoice_no || specialPrintState.invoice.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSpecialPrintState(null)}
                    className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <PercentBodyModalScrollBody className="p-8 space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Belge Türü</div>
                  <div className="text-base font-semibold text-slate-900">
                    {TEMPLATE_USAGE_SCOPE_LABELS[specialPrintState.scope]}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Tasarım Seçimi
                  </label>
                  <div className="relative">
                    <select
                      value={specialPrintState.selectedTemplateId}
                      onChange={(e) =>
                        setSpecialPrintState((prev) =>
                          prev
                            ? {
                                ...prev,
                                selectedTemplateId: e.target.value,
                              }
                            : prev,
                        )
                      }
                      className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[var(--asin-accent,#1FA8A0)] focus:border-[var(--asin-accent,#1FA8A0)] outline-none appearance-none bg-white text-slate-800 font-medium"
                    >
                      {getTemplatesForScope('invoice', specialPrintState.scope).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" aria-hidden />
                  </div>
                </div>
                <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-2xl bg-white">
                  <input
                    type="checkbox"
                    checked={specialPrintState.makeDefault}
                    onChange={(e) =>
                      setSpecialPrintState((prev) =>
                        prev
                          ? {
                              ...prev,
                              makeDefault: e.target.checked,
                            }
                          : prev,
                      )
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--asin-accent,#1FA8A0)]"
                  />
                  <span className="text-sm text-slate-700 font-medium">
                    Bu belge türü için varsayılan tasarım olarak kaydet
                  </span>
                </label>
              </PercentBodyModalScrollBody>
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setSpecialPrintState(null)}
                  className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100 active:scale-[0.98]"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => void handleSpecialPrint()}
                  disabled={specialPrintLoading}
                  className="flex-1 rounded-2xl bg-[var(--asin-accent,#1FA8A0)] text-white font-bold uppercase text-sm tracking-wider shadow-lg shadow-[var(--asin-accent,#1FA8A0)]/25 hover:bg-[#178f88] disabled:opacity-50 active:scale-[0.98]"
                >
                  {specialPrintLoading ? 'Hazırlanıyor...' : 'Özel Yazdır'}
                </button>
              </div>
        </PercentBodyModal>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedInvoice && (
        <PercentBodyModal onClose={() => setShowDetailModal(false)} size="wide" ariaLabel={tm('invoiceDetails')}>
            <div className="bg-[var(--asin-primary,#0E2433)] text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xl font-semibold">{tm('invoiceDetails')}</h3>
                <p className="text-[var(--asin-accent-muted,#D5F0EE)] text-sm">{selectedInvoice.invoice_no}</p>
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

            <PercentBodyModalScrollBody className="p-6 bg-gray-50">
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
                  <div className="border-b-4 border-[var(--asin-accent,#1FA8A0)] pb-6 mb-8">
                    <h1 className="text-4xl font-bold text-[var(--asin-accent,#1FA8A0)] mb-6">{tm('invoice').toUpperCase()}</h1>
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
                      {(isSalesReturnList || selectedInvoice.invoice_type === 3 || selectedInvoice.trcode === 3) && (
                        <div>
                          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{tm('salesReturnProcessedBy')}</div>
                          <div className="text-base font-semibold text-gray-900">{selectedInvoice.cashier || '—'}</div>
                        </div>
                      )}
                      {!isSalesReturnList && selectedInvoice.invoice_type !== 3 && selectedInvoice.trcode !== 3 && selectedInvoice.cashier && (
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
                              {formatNumber(selectedInvoice.campaign_discount, 2, true)} {resolveListRowCurrency(selectedInvoice)}
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
                        <span className="font-semibold text-gray-900">{formatNumber(selectedInvoice.subtotal || 0, 2, true)} {resolveListRowCurrency(selectedInvoice)}</span>
                      </div>
                      {selectedInvoice.discount > 0 && (
                        <div className="flex justify-between text-sm text-red-600">
                          <span>{tm('discount')}:</span>
                          <span className="font-semibold">-{formatNumber(selectedInvoice.discount, 2, true)} {resolveListRowCurrency(selectedInvoice)}</span>
                        </div>
                      )}
                      {selectedInvoice.tax > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">{tm('tax')}:</span>
                          <span className="font-semibold text-gray-900">{formatNumber(selectedInvoice.tax, 2, true)} {resolveListRowCurrency(selectedInvoice)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-2xl font-bold border-t-2 border-[var(--asin-accent,#1FA8A0)] pt-4 mt-4">
                        <span className="text-gray-900">{tm('grandTotal')}:</span>
                        <span className="text-[var(--asin-accent,#1FA8A0)]">{formatNumber(selectedInvoice.total || selectedInvoice.total_amount || 0, 2, true)} {resolveListRowCurrency(selectedInvoice)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PercentBodyModalScrollBody>

            <div className="border-t px-6 py-4 flex justify-end gap-3 bg-white shrink-0">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {tm('close')}
              </button>
            </div>
        </PercentBodyModal>
      )}

      {/* Fatura Türü Seçim Modalı */}
      {showInvoiceTypeModal && (
        <PercentBodyModal onClose={() => setShowInvoiceTypeModal(false)} size="wide" ariaLabel={tm('selectInvoiceType')}>
            <div className="p-4 border-b border-gray-200 bg-[var(--asin-primary,#0E2433)] flex items-center justify-between shrink-0">
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

            <PercentBodyModalScrollBody className="p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Sol Panel - Fatura Türleri */}
                <div className="space-y-3">
                  {/* Kategori Filtreleri */}
                  <div className="border border-gray-300 bg-[var(--asin-accent-muted,#D5F0EE)] p-3 rounded-lg">
                    <h4 className="text-sm text-[var(--asin-primary,#0E2433)] mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      {tm('invoiceCategories')}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-3 py-1.5 text-xs border transition-colors rounded ${selectedCategory === cat.id
                            ? 'bg-[var(--asin-accent,#1FA8A0)] text-white border-[var(--asin-accent,#1FA8A0)]'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-[var(--asin-accent,#1FA8A0)]'
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
                              ? 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)] shadow-md'
                              : 'border-gray-200 bg-white hover:border-[var(--asin-accent,#1FA8A0)]/50 hover:bg-[var(--asin-accent-muted,#D5F0EE)]/50'
                              }`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <Icon className={`w-5 h-5 ${isHovered ? 'text-[var(--asin-accent,#1FA8A0)]' : 'text-gray-600'}`} />
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
                      <div className="border-2 border-[var(--asin-accent,#1FA8A0)]/50 bg-gradient-to-br from-[var(--asin-accent-muted,#D5F0EE)] to-[#c5e8e5] p-5 shadow-sm rounded-lg">
                        <h4 className="text-xs uppercase tracking-wide mb-3 text-gray-600 font-medium">
                          {tm('invoiceTypeDetails').toUpperCase()}
                        </h4>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 mb-3">
                            {(() => {
                              const Icon = getIcon(hoveredInvoiceType.icon);
                              return <Icon className="w-10 h-10 text-[var(--asin-accent,#1FA8A0)]" />;
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
            </PercentBodyModalScrollBody>
        </PercentBodyModal>
      )}

      {/* Custom Report Designer Overlay */}
      {showDesigner && (
        <FullscreenBodyPortal className="bg-white">
          <div className="h-full flex flex-col">
            <div className="p-2 border-b flex justify-end bg-gray-50">
              <button onClick={() => setShowDesigner(false)} className="px-3 py-1 bg-red-500 text-white rounded text-xs font-bold">{tm('close').toUpperCase()}</button>
            </div>
            <div className="flex-1">
              <TemplateManager />
            </div>
          </div>
        </FullscreenBodyPortal>
      )}

      {/* Custom Report Viewer Overlay */}
      {showViewer && activeTemplate && viewerData && (
        <ReportViewerModule
          template={activeTemplate}
          data={viewerData}
          onClose={() => {
            setShowViewer(false);
            setViewerData(null);
          }}
        />
      )}
    </div>
  );
}




