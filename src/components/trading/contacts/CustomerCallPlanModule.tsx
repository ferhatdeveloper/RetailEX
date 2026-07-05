import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, Edit, FileText, MessageSquare, MessageSquarePlus, Phone, Plus, RefreshCw, Search, Send, Settings, StickyNote, User, Wallet, X, BarChart3, List } from 'lucide-react';
import { toast } from 'sonner';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { ContextMenu } from '../../shared/ContextMenu';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { WhatsAppBulkSendPreviewModal } from '../../shared/WhatsAppBulkSendPreviewModal';
import { createColumnHelper } from '@tanstack/react-table';
import { supplierAPI, type Supplier } from '../../../services/api/suppliers';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  buildCallPlanBulkPreviewList,
  buildCallPlanMessageText,
  normalizeCallPlanMessageLang,
  sendCallPlanCustomerWhatsApp,
  supplierHasWhatsAppPhone,
  type CallPlanWhatsAppPreset,
} from '../../../utils/callPlanWhatsAppSend';
import type { WhatsAppBulkPreviewItem } from '../../../utils/whatsappBulkSend';
import { CariAccountStatementPanel } from './CariAccountStatementPanel';
import { UniversalInvoiceForm } from '../invoices/UniversalInvoiceForm';
import { KasaIslemModal } from '../../accounting/cash-ops/KasaIslemModal';
import { fetchKasalar, type Kasa } from '../../../services/api/kasa';
import {
  customerCallPlanWeeklyAPI,
  type CustomerCallPlanWeeklyRow,
} from '../../../services/api/customerCallPlanWeekly';
import { formatCallPlanWeekRange } from '../../../utils/customerCallPlanWeek';
import {
  CUSTOMER_CALL_WEEKDAYS,
  CUSTOMER_CALL_STATUSES,
  customerCallStatusMeta,
  customerCallWeekdaysLabel,
  normalizeCustomerCallStatus,
  normalizeCustomerCallWeekdays,
  type CustomerCallStatus,
} from '../../../utils/customerCallPlan';

type DayFilter = 'all' | number;
type CallPlanTab = 'list' | 'report';

export function CustomerCallPlanModule() {
  const { tm, language } = useLanguage();
  const [customers, setCustomers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dayFilter, setDayFilter] = useState<DayFilter>('all');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [planNote, setPlanNote] = useState('');
  const [lastStatus, setLastStatus] = useState('planned');
  const [lastNote, setLastNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; customer: Supplier } | null>(null);
  const [customNoteCustomer, setCustomNoteCustomer] = useState<Supplier | null>(null);
  const [customNoteText, setCustomNoteText] = useState('');
  const [customNoteSaving, setCustomNoteSaving] = useState(false);
  const [waCustomCustomer, setWaCustomCustomer] = useState<Supplier | null>(null);
  const [waCustomText, setWaCustomText] = useState('');
  const [waCustomSending, setWaCustomSending] = useState(false);
  const [waBulkOpen, setWaBulkOpen] = useState(false);
  const [waBulkItems, setWaBulkItems] = useState<WhatsAppBulkPreviewItem[]>([]);
  const [waBulkPreparing, setWaBulkPreparing] = useState(false);
  const [ekstreAccount, setEkstreAccount] = useState<Supplier | null>(null);
  const [ekstreLoading, setEkstreLoading] = useState(false);
  const [saleInvoiceCustomer, setSaleInvoiceCustomer] = useState<Supplier | null>(null);
  const [saleInvoiceFormKey, setSaleInvoiceFormKey] = useState(0);
  const [defaultKasa, setDefaultKasa] = useState<Kasa | null>(null);
  const [cashAction, setCashAction] = useState<{ type: 'CH_TAHSILAT'; account: Supplier } | null>(null);
  const [activeTab, setActiveTab] = useState<CallPlanTab>('list');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => customerCallPlanWeeklyAPI.getCurrentWeekStart());
  const [reportWeekStart, setReportWeekStart] = useState(() => customerCallPlanWeeklyAPI.getCurrentWeekStart());
  const [archivedWeeks, setArchivedWeeks] = useState<string[]>([]);
  const [reportRows, setReportRows] = useState<CustomerCallPlanWeeklyRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const messageLang = useMemo(() => normalizeCallPlanMessageLang(language), [language]);

  const wholesaleInvoiceType = useMemo(
    () => ({
      code: 8,
      name: tm('wholesale'),
      category: 'Satis' as const,
      color: 'bg-purple-100 text-purple-700 border-purple-300',
      icon: 'FileText' as const,
    }),
    [tm],
  );

  const load = async () => {
    setLoading(true);
    try {
      const rollover = await customerCallPlanWeeklyAPI.ensureWeekRollover();
      setCurrentWeekStart(rollover.currentWeekStart);
      setReportWeekStart(prev => {
        const oldCurrent = currentWeekStart;
        if (!prev || prev === oldCurrent) return rollover.currentWeekStart;
        return prev;
      });
      if (rollover.archivedWeeks > 0) {
        toast.success(
          tm('callPlanWeekRolled').replace('{weeks}', String(rollover.archivedWeeks)),
        );
      }
      const weeks = await customerCallPlanWeeklyAPI.listArchivedWeeks();
      setArchivedWeeks(weeks);
      const rows = await supplierAPI.getAll({ cardType: 'customer' });
      setCustomers(rows.filter(row =>
        row.call_plan_enabled === true &&
        normalizeCustomerCallWeekdays(row.call_plan_weekdays).length > 0
      ));
    } catch (error: any) {
      toast.error(error?.message || tm('callPlanLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadReport = useCallback(async (weekStart: string, sourceCustomers: Supplier[]) => {
    setReportLoading(true);
    try {
      const isCurrent = weekStart === customerCallPlanWeeklyAPI.getCurrentWeekStart();
      if (isCurrent) {
        setReportRows(customerCallPlanWeeklyAPI.customersToCurrentWeekRows(sourceCustomers, weekStart));
      } else {
        setReportRows(await customerCallPlanWeeklyAPI.getWeeklyReport(weekStart));
      }
    } catch (error: any) {
      setReportRows([]);
      toast.error(error?.message || tm('callPlanReportLoadFailed'));
    } finally {
      setReportLoading(false);
    }
  }, [tm]);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (activeTab !== 'report') return;
    void loadReport(reportWeekStart, customers);
  }, [activeTab, reportWeekStart, customers, loadReport]);

  useEffect(() => {
    void (async () => {
      try {
        const kasalar = await fetchKasalar({ aktif: true });
        setDefaultKasa(kasalar[0] ?? null);
      } catch {
        setDefaultKasa(null);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return customers.filter(customer => {
      const days = normalizeCustomerCallWeekdays(customer.call_plan_weekdays);
      if (dayFilter !== 'all' && !days.includes(dayFilter as any)) return false;
      if (!q) return true;
      return (
        String(customer.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(customer.code || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(customer.phone || '').includes(search.trim()) ||
        String(customer.email || '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [customers, dayFilter, search]);

  const openEdit = (customer: Supplier) => {
    setEditing(customer);
    setSelectedDays(normalizeCustomerCallWeekdays(customer.call_plan_weekdays));
    setPlanNote(String(customer.call_plan_note ?? ''));
    setLastStatus(normalizeCustomerCallStatus(customer.call_last_status));
    setLastNote(String(customer.call_last_note ?? ''));
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day)
        ? prev.filter(v => v !== day)
        : [...prev, day].sort((a, b) => a - b)
    );
  };

  const savePlan = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const nextDays = normalizeCustomerCallWeekdays(selectedDays);
      await supplierAPI.update(editing.id, {
        ...editing,
        cardType: 'customer',
        call_plan_enabled: nextDays.length > 0,
        call_plan_weekdays: nextDays,
        call_plan_note: planNote.trim() || null,
        call_last_status: normalizeCustomerCallStatus(lastStatus),
        call_last_note: lastNote.trim() || null,
        call_last_at: new Date().toISOString(),
      });
      toast.success(tm('callPlanUpdated'));
      setEditing(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || tm('callPlanSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const saveQuickNote = async (customer: Supplier, note: string, status: CustomerCallStatus) => {
    try {
      await supplierAPI.update(customer.id, {
        ...customer,
        cardType: 'customer',
        call_last_status: status,
        call_last_note: note.trim() || null,
        call_last_at: new Date().toISOString(),
      });
      toast.success(tm('callPlanCtxNoteSaved'));
      setContextMenu(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || tm('callPlanSaveFailed'));
    }
  };

  const handleRowContextMenu = (e: React.MouseEvent, customer: Supplier) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, customer });
  };

  const openCustomNote = (customer: Supplier) => {
    setCustomNoteCustomer(customer);
    setCustomNoteText(String(customer.call_last_note ?? ''));
    setContextMenu(null);
  };

  const saveCustomNote = async () => {
    if (!customNoteCustomer) return;
    const text = customNoteText.trim();
    if (!text) return;
    setCustomNoteSaving(true);
    try {
      await saveQuickNote(customNoteCustomer, text, 'called');
      setCustomNoteCustomer(null);
      setCustomNoteText('');
    } finally {
      setCustomNoteSaving(false);
    }
  };

  const openNewSaleInvoice = (customer: Supplier) => {
    setContextMenu(null);
    setSaleInvoiceCustomer(customer);
    setSaleInvoiceFormKey(k => k + 1);
  };

  const openAccountStatement = async (customer: Supplier) => {
    setContextMenu(null);
    setEkstreLoading(true);
    try {
      const fresh = await supplierAPI.getById(customer.id);
      setEkstreAccount(fresh ?? customer);
    } catch (error: any) {
      toast.error(error?.message || tm('errorLoadingOperations'));
      setEkstreAccount(customer);
    } finally {
      setEkstreLoading(false);
    }
  };

  const openCollection = async (customer: Supplier) => {
    setContextMenu(null);
    let kasa = defaultKasa;
    if (!kasa) {
      try {
        const kasalar = await fetchKasalar({ aktif: true });
        kasa = kasalar[0] ?? null;
        setDefaultKasa(kasa);
      } catch {
        kasa = null;
      }
    }
    if (!kasa) {
      toast.error(tm('noCashRegisterFound'));
      return;
    }
    setCashAction({ type: 'CH_TAHSILAT', account: customer });
  };

  const openWhatsAppSettings = () => {
    setContextMenu(null);
    window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: 'whatsapp' }));
  };

  const handleWhatsAppSend = useCallback(async (
    customer: Supplier,
    preset: CallPlanWhatsAppPreset,
    customText?: string,
  ) => {
    if (!supplierHasWhatsAppPhone(customer)) {
      toast.error(tm('callPlanWaNoPhone'));
      return;
    }
    setContextMenu(null);
    const result = await sendCallPlanCustomerWhatsApp(customer, {
      preset,
      lang: messageLang,
      customText,
      allowWebFallback: true,
    });
    if (result.success) {
      toast.success(result.usedWeb ? tm('callPlanWaSentWeb') : tm('callPlanWaSent'));
    } else {
      toast.error(result.error || tm('callPlanWaFailed'));
    }
  }, [messageLang, tm]);

  const openWaCustomMessage = (customer: Supplier) => {
    setWaCustomCustomer(customer);
    setWaCustomText(buildCallPlanMessageText(customer, 'greeting', { lang: messageLang }));
    setContextMenu(null);
  };

  const sendWaCustomMessage = async () => {
    if (!waCustomCustomer) return;
    const text = waCustomText.trim();
    if (!text) return;
    setWaCustomSending(true);
    try {
      await handleWhatsAppSend(waCustomCustomer, 'custom', text);
      setWaCustomCustomer(null);
      setWaCustomText('');
    } finally {
      setWaCustomSending(false);
    }
  };

  const prepareBulkWhatsApp = async () => {
    const withPhone = filtered.filter(supplierHasWhatsAppPhone);
    if (withPhone.length === 0) {
      toast.error(tm('callPlanWaNoPhone'));
      return;
    }
    setWaBulkPreparing(true);
    try {
      const items = await buildCallPlanBulkPreviewList(withPhone, {
        preset: 'call_reminder',
        lang: messageLang,
      });
      if (!items.length) {
        toast.error(tm('callPlanWaNoPhone'));
        return;
      }
      setWaBulkItems(items);
      setWaBulkOpen(true);
    } catch (error: any) {
      toast.error(error?.message || tm('callPlanWaFailed'));
    } finally {
      setWaBulkPreparing(false);
    }
  };

  const rebuildWaBulkItems = useCallback(async (lang: typeof messageLang) => {
    const withPhone = filtered.filter(supplierHasWhatsAppPhone);
    return buildCallPlanBulkPreviewList(withPhone, { preset: 'call_reminder', lang });
  }, [filtered, messageLang]);

  const reportWeekOptions = useMemo(() => {
    const current = customerCallPlanWeeklyAPI.getCurrentWeekStart();
    const merged = Array.from(new Set([current, ...archivedWeeks])).sort((a, b) => b.localeCompare(a));
    return merged;
  }, [archivedWeeks, currentWeekStart]);

  const reportSummary = useMemo(() => {
    const counts: Record<string, number> = { total: reportRows.length };
    for (const row of reportRows) {
      const key = normalizeCustomerCallStatus(row.call_last_status);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [reportRows]);

  const filteredReportRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return reportRows.filter(row => {
      if (!q) return true;
      return (
        String(row.customer_name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(row.customer_code || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(row.call_last_note || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(row.call_plan_note || '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [reportRows, search]);

  const columnHelper = createColumnHelper<Supplier>();
  const columns = [
    columnHelper.accessor('code', {
      header: tm('code'),
      cell: info => <span className="font-mono text-xs font-bold text-blue-700">{info.getValue() || '-'}</span>,
      size: 90,
    }),
    columnHelper.accessor('name', {
      header: tm('customer'),
      cell: info => <span className="font-semibold text-slate-900">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'contact',
      header: tm('contact'),
      cell: ({ row }) => (
        <div className="flex flex-col gap-1 text-xs text-slate-600">
          {row.original.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{row.original.phone}</span> : '-'}
          {row.original.email ? <span>{row.original.email}</span> : null}
        </div>
      ),
      size: 160,
    }),
    columnHelper.display({
      id: 'days',
      header: tm('callPlanSelectDays'),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
          <CalendarClock className="h-3.5 w-3.5" />
          {customerCallWeekdaysLabel(row.original.call_plan_weekdays, true)}
        </span>
      ),
      size: 180,
    }),
    columnHelper.display({
      id: 'note',
      header: tm('callPlanNote'),
      cell: ({ row }) => (
        row.original.call_plan_note ? (
          <span className="block max-w-[220px] truncate text-xs font-semibold text-slate-600" title={row.original.call_plan_note}>
            {row.original.call_plan_note}
          </span>
        ) : <span className="text-xs text-slate-400">—</span>
      ),
      size: 220,
    }),
    columnHelper.display({
      id: 'lastStatus',
      header: tm('callPlanLastStatus'),
      cell: ({ row }) => {
        const meta = customerCallStatusMeta(row.original.call_last_status);
        return (
          <div className="flex flex-col gap-1">
            <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${meta.tone}`}>
              {tm(meta.label)}
            </span>
            {row.original.call_last_at ? (
              <span className="text-[10px] font-semibold text-slate-400">
                {new Date(row.original.call_last_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
            {row.original.call_last_note ? (
              <span className="max-w-[180px] truncate text-[10px] text-slate-500" title={row.original.call_last_note}>
                {row.original.call_last_note}
              </span>
            ) : null}
          </div>
        );
      },
      size: 170,
    }),
    columnHelper.display({
      id: 'actions',
      header: tm('actions'),
      cell: ({ row }) => (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            openEdit(row.original);
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100"
        >
          <Edit className="h-3.5 w-3.5" />
          {tm('edit')}
        </button>
      ),
      size: 100,
    }),
  ];

  const reportColumnHelper = createColumnHelper<CustomerCallPlanWeeklyRow>();
  const reportColumns = [
    reportColumnHelper.accessor('customer_code', {
      header: tm('code'),
      cell: info => <span className="font-mono text-xs font-bold text-blue-700">{info.getValue() || '-'}</span>,
      size: 90,
    }),
    reportColumnHelper.accessor('customer_name', {
      header: tm('customer'),
      cell: info => <span className="font-semibold text-slate-900">{info.getValue()}</span>,
    }),
    reportColumnHelper.display({
      id: 'days',
      header: tm('callPlanSelectDays'),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
          <CalendarClock className="h-3.5 w-3.5" />
          {customerCallWeekdaysLabel(row.original.call_plan_weekdays, true)}
        </span>
      ),
      size: 160,
    }),
    reportColumnHelper.display({
      id: 'note',
      header: tm('callPlanNote'),
      cell: ({ row }) => (
        row.original.call_plan_note ? (
          <span className="block max-w-[200px] truncate text-xs font-semibold text-slate-600" title={row.original.call_plan_note}>
            {row.original.call_plan_note}
          </span>
        ) : <span className="text-xs text-slate-400">—</span>
      ),
      size: 180,
    }),
    reportColumnHelper.display({
      id: 'lastStatus',
      header: tm('callPlanLastStatus'),
      cell: ({ row }) => {
        const meta = customerCallStatusMeta(row.original.call_last_status);
        return (
          <div className="flex flex-col gap-1">
            <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${meta.tone}`}>
              {tm(meta.label)}
            </span>
            {row.original.call_last_at ? (
              <span className="text-[10px] font-semibold text-slate-400">
                {new Date(row.original.call_last_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
            {row.original.call_last_note ? (
              <span className="max-w-[180px] truncate text-[10px] text-slate-500" title={row.original.call_last_note}>
                {row.original.call_last_note}
              </span>
            ) : null}
          </div>
        );
      },
      size: 200,
    }),
  ];

  const isReportCurrentWeek = reportWeekStart === customerCallPlanWeeklyAPI.getCurrentWeekStart();

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50" onClick={() => setContextMenu(null)}>
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-6 w-6 text-amber-600" />
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">
                {activeTab === 'list' ? tm('customerCallListTitle') : tm('callPlanReportTitle')}
              </h2>
              <p className="text-xs font-semibold text-slate-500">
                {activeTab === 'list'
                  ? tm('customerCallListSubtitle')
                  : tm('callPlanReportSubtitle').replace('{week}', formatCallPlanWeekRange(reportWeekStart))}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-black uppercase tracking-wide ${activeTab === 'list' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <List className="h-3.5 w-3.5" />
                {tm('callPlanTabList')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('report')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-black uppercase tracking-wide ${activeTab === 'report' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                {tm('callPlanTabReport')}
              </button>
            </div>
            {activeTab === 'list' ? (
              <button
                type="button"
                onClick={() => void prepareBulkWhatsApp()}
                disabled={waBulkPreparing || filtered.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className={`h-4 w-4 ${waBulkPreparing ? 'animate-pulse' : ''}`} />
                {waBulkPreparing ? tm('saving') : tm('callPlanWaBulk')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {tm('refreshData')}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 p-4">
        {activeTab === 'report' ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{tm('callPlanWeekSelect')}</label>
                  <select
                    value={reportWeekStart}
                    onChange={e => setReportWeekStart(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {reportWeekOptions.map(week => (
                      <option key={week} value={week}>
                        {week === customerCallPlanWeeklyAPI.getCurrentWeekStart()
                          ? `${tm('callPlanCurrentWeek')} (${formatCallPlanWeekRange(week)})`
                          : formatCallPlanWeekRange(week)}
                      </option>
                    ))}
                  </select>
                </div>
                {isReportCurrentWeek ? (
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-indigo-700">
                    {tm('callPlanLiveWeekBadge')}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  {tm('callPlanReportTotal')}: {reportSummary.total ?? 0}
                </span>
                {CUSTOMER_CALL_STATUSES.map(status => (
                  <span key={status.value} className={`rounded-full px-3 py-1 text-xs font-bold ${status.tone}`}>
                    {tm(status.label)}: {reportSummary[status.value] ?? 0}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={tm('callPlanSearchPlaceholder')}
                  className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {reportLoading ? (
                <div className="flex h-full min-h-[240px] items-center justify-center text-sm font-semibold text-slate-500">
                  {tm('loading')}
                </div>
              ) : filteredReportRows.length === 0 ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
                  <BarChart3 className="h-10 w-10 text-slate-300" />
                  <p className="text-sm font-semibold">{tm('callPlanReportEmpty')}</p>
                </div>
              ) : (
                <DevExDataGrid
                  data={filteredReportRows}
                  columns={reportColumns}
                  enableSorting
                  enableFiltering={false}
                  enableColumnResizing
                  pageSize={50}
                />
              )}
            </div>
          </>
        ) : (
          <>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDayFilter('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-black ${dayFilter === 'all' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {tm('all')}
            </button>
            {CUSTOMER_CALL_WEEKDAYS.map(day => (
              <button
                key={day.value}
                type="button"
                onClick={() => setDayFilter(day.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-black ${dayFilter === day.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {day.tr}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tm('callPlanSearchPlaceholder')}
              className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <DevExDataGrid
            data={filtered}
            columns={columns}
            enableSorting
            enableFiltering={false}
            enableColumnResizing
            pageSize={50}
            onRowContextMenu={handleRowContextMenu}
            onRowDoubleClick={openEdit}
          />
        </div>
          </>
        )}
      </div>

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'customer-details',
              label: tm('callPlanCtxCustomerDetails'),
              icon: User,
              onClick: () => openEdit(contextMenu.customer),
            },
            {
              id: 'account-statement',
              label: tm('accountStatement'),
              icon: FileText,
              onClick: () => openAccountStatement(contextMenu.customer),
              divider: true,
            },
            {
              id: 'new',
              label: tm('callPlanCtxNew'),
              icon: Plus,
              items: [
                {
                  id: 'new-sale-invoice',
                  label: tm('callPlanCtxNewSaleInvoice'),
                  icon: FileText,
                  onClick: () => openNewSaleInvoice(contextMenu.customer),
                },
                {
                  id: 'new-collection',
                  label: tm('callPlanCtxNewCollection'),
                  icon: Wallet,
                  onClick: () => void openCollection(contextMenu.customer),
                },
              ],
              divider: true,
            },
            {
              id: 'add-notes',
              label: tm('callPlanCtxAddNotes'),
              icon: StickyNote,
              items: [
                {
                  id: 'note-no-order',
                  label: tm('callPlanCtxNoOrderToday'),
                  onClick: () => void saveQuickNote(contextMenu.customer, tm('callPlanCtxNoOrderToday'), 'called'),
                },
                {
                  id: 'note-busy',
                  label: tm('callPlanCtxBusyCallLater'),
                  onClick: () => void saveQuickNote(contextMenu.customer, tm('callPlanCtxBusyCallLater'), 'callback'),
                  divider: true,
                },
                {
                  id: 'note-custom',
                  label: tm('callPlanCtxCustomNote'),
                  onClick: () => openCustomNote(contextMenu.customer),
                },
              ],
              divider: true,
            },
            {
              id: 'whatsapp',
              label: tm('callPlanCtxWhatsApp'),
              icon: MessageSquare,
              items: [
                {
                  id: 'wa-greeting',
                  label: tm('callPlanCtxWaGreeting'),
                  onClick: () => void handleWhatsAppSend(contextMenu.customer, 'greeting'),
                },
                {
                  id: 'wa-call-reminder',
                  label: tm('callPlanCtxWaCallReminder'),
                  onClick: () => void handleWhatsAppSend(contextMenu.customer, 'call_reminder'),
                },
                {
                  id: 'wa-custom',
                  label: tm('callPlanCtxWaCustomMessage'),
                  onClick: () => openWaCustomMessage(contextMenu.customer),
                  divider: true,
                },
                {
                  id: 'wa-settings',
                  label: tm('callPlanCtxWaSettings'),
                  icon: Settings,
                  onClick: openWhatsAppSettings,
                },
              ],
            },
          ]}
        />
      ) : null}

      <WhatsAppBulkSendPreviewModal
        open={waBulkOpen}
        items={waBulkItems}
        title={tm('callPlanWaBulkTitle')}
        initialMessageLang={messageLang}
        onRebuildItems={rebuildWaBulkItems}
        onClose={() => setWaBulkOpen(false)}
        onComplete={() => void load()}
      />

      {waCustomCustomer ? (
        <PercentBodyModal onClose={() => setWaCustomCustomer(null)} size="compact" ariaLabel={tm('callPlanWaCustomTitle')}>
          <div className="bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-4 text-white shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-100">{tm('callPlanWaCustomTitle')}</p>
                  <h3 className="text-base font-black">{waCustomCustomer.name}</h3>
                </div>
              </div>
              <button type="button" onClick={() => setWaCustomCustomer(null)} className="rounded-lg p-2 hover:bg-white/15">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <PercentBodyModalScrollBody className="p-6">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">{tm('callPlanWaCustomTitle')}</label>
            <textarea
              value={waCustomText}
              onChange={e => setWaCustomText(e.target.value)}
              rows={5}
              autoFocus
              placeholder={tm('callPlanWaCustomPlaceholder')}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="mt-2 text-xs text-slate-500">{waCustomCustomer.phone || '—'}</p>
          </PercentBodyModalScrollBody>
          <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 p-4 shrink-0">
            <button type="button" onClick={() => setWaCustomCustomer(null)} className="rounded-2xl border-2 border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
              {tm('cancel')}
            </button>
            <button
              type="button"
              onClick={() => void sendWaCustomMessage()}
              disabled={waCustomSending || !waCustomText.trim()}
              className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {waCustomSending ? tm('saving') : tm('sendViaWhatsapp')}
            </button>
          </div>
        </PercentBodyModal>
      ) : null}

      {customNoteCustomer ? (
        <PercentBodyModal onClose={() => setCustomNoteCustomer(null)} size="compact" ariaLabel={tm('callPlanCtxCustomNoteTitle')}>
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 text-white shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="h-5 w-5" />
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-amber-100">{tm('callPlanCtxCustomNoteTitle')}</p>
                  <h3 className="text-base font-black">{customNoteCustomer.name}</h3>
                </div>
              </div>
              <button type="button" onClick={() => setCustomNoteCustomer(null)} className="rounded-lg p-2 hover:bg-white/15">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <PercentBodyModalScrollBody className="p-6">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">{tm('callPlanLastStatusNote')}</label>
            <textarea
              value={customNoteText}
              onChange={e => setCustomNoteText(e.target.value)}
              rows={4}
              autoFocus
              placeholder={tm('callPlanCtxCustomNote')}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500"
            />
          </PercentBodyModalScrollBody>
          <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 p-4 shrink-0">
            <button type="button" onClick={() => setCustomNoteCustomer(null)} className="rounded-2xl border-2 border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
              {tm('cancel')}
            </button>
            <button
              type="button"
              onClick={() => void saveCustomNote()}
              disabled={customNoteSaving || !customNoteText.trim()}
              className="rounded-2xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {customNoteSaving ? tm('saving') : tm('save')}
            </button>
          </div>
        </PercentBodyModal>
      ) : null}

      {editing ? (
        <PercentBodyModal onClose={() => setEditing(null)} size="list" ariaLabel={tm('callPlanEditTitle')}>
          <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white sm:px-8 sm:py-6">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-blue-100">{tm('callPlanEditTitle')}</p>
              <h3 className="truncate text-lg font-black sm:text-xl">{editing.name}</h3>
            </div>
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl p-2 hover:bg-white/15" aria-label={tm('cancel')}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <PercentBodyModalScrollBody className="p-6 sm:p-8">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{tm('callPlanSelectDays')}</p>
            <div className="flex flex-wrap gap-2">
              {CUSTOMER_CALL_WEEKDAYS.map(day => {
                const selected = selectedDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleDay(day.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-black transition-all ${
                      selected
                        ? 'border-blue-600 bg-blue-600 text-white shadow-md ring-2 ring-blue-200'
                        : 'border-amber-200 bg-white text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    {selected ? `✓ ${day.tr}` : day.tr}
                  </button>
                );
              })}
            </div>
            {selectedDays.length > 0 ? (
              <p className="mt-3 rounded-2xl bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700">
                {tm('callPlanSelectedDays').replace('{days}', customerCallWeekdaysLabel(selectedDays))}
              </p>
            ) : (
              <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-500">
                {tm('callPlanNoDaysHint')}
              </p>
            )}

            <div className="mt-6">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">{tm('callPlanNote')}</label>
              <textarea
                value={planNote}
                onChange={e => setPlanNote(e.target.value)}
                rows={3}
                placeholder={tm('callPlanNote')}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">{tm('callPlanLastStatus')}</label>
                <div className="relative">
                  <select
                    value={lastStatus}
                    onChange={e => setLastStatus(normalizeCustomerCallStatus(e.target.value))}
                    className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500"
                  >
                    {CUSTOMER_CALL_STATUSES.map(status => (
                      <option key={status.value} value={status.value}>{tm(status.label)}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">{tm('callPlanLastStatusNote')}</label>
                <input
                  value={lastNote}
                  onChange={e => setLastNote(e.target.value)}
                  placeholder={tm('callPlanLastStatusNote')}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </PercentBodyModalScrollBody>

          <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 bg-slate-50/50 p-4 sm:p-6">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-2xl border-2 border-slate-200 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 active:scale-[0.98]"
            >
              {tm('cancel')}
            </button>
            <button
              type="button"
              onClick={() => void savePlan()}
              disabled={saving}
              className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98]"
            >
              {saving ? tm('saving') : tm('save')}
            </button>
          </div>
        </PercentBodyModal>
      ) : null}

      {ekstreLoading ? (
        <div className="fixed inset-0 z-[2147483645] flex items-center justify-center bg-black/40">
          <div className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-slate-700 shadow-xl">
            {tm('loading')}
          </div>
        </div>
      ) : null}

      {ekstreAccount ? (
        <CariAccountStatementPanel
          account={ekstreAccount}
          onClose={() => setEkstreAccount(null)}
        />
      ) : null}

      {saleInvoiceCustomer ? (
        <UniversalInvoiceForm
          key={`call-plan-sale-${saleInvoiceCustomer.id}-${saleInvoiceFormKey}`}
          invoiceType={wholesaleInvoiceType}
          onClose={() => setSaleInvoiceCustomer(null)}
          editData={{
            customer_id: saleInvoiceCustomer.id,
            customer_name: saleInvoiceCustomer.name,
            customer_code: saleInvoiceCustomer.code || '',
          }}
        />
      ) : null}

      {cashAction && defaultKasa ? (
        <KasaIslemModal
          kasa={defaultKasa}
          islemTipi={cashAction.type}
          initialCari={{
            id: cashAction.account.id,
            kod: cashAction.account.code || '',
            unvan: cashAction.account.name,
            bakiye: cashAction.account.balance || 0,
          }}
          initialDescription={`Tahsilat: ${cashAction.account.code || ''} - ${cashAction.account.name}`}
          onClose={() => setCashAction(null)}
          onSuccess={() => setCashAction(null)}
        />
      ) : null}
    </div>
  );
}
