import React, { useState, useEffect, useMemo } from 'react';
import { formatNumber } from '../../../utils/formatNumber';
import {
  Truck, Users, X, Search, Edit, Trash2, Mail, Phone, MapPin, Wallet,
  FileText, Loader2, Printer, RefreshCw, Download, CalendarClock, ArrowRightLeft
} from 'lucide-react';
import { supplierAPI, type Supplier } from '../../../services/api/suppliers';
import { toast } from 'sonner';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { ColumnVisibilityMenu } from '../../shared/ColumnVisibilityMenu';
import { createColumnHelper } from '@tanstack/react-table';
import { ContextMenu } from '../../shared/ContextMenu';
import { confirm as confirmDialog } from '../../shared/ConfirmDialog';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { getAppDefaultCurrency } from '../../../services/postgres';
import {
  exchangeRateAPI,
  convertAmountMainToReporting,
  type ExchangeRate,
} from '../../../services/api/masterData';
import { DEMO_CUSTOMER_CODES, DEMO_SUPPLIER_CODES } from '../../../utils/demoSeedCodes';
import { mapUnifiedSupplierToCurrentAccountExcelRow, saveCurrentAccountsAsXlsx } from '../../../utils/currentAccountsExcelExport';
import { FullscreenBodyPortal, MODAL_OVERLAY_Z } from '../../shared/FullscreenBodyPortal';
import { KasaIslemModal } from '../../accounting/cash-ops/KasaIslemModal';
import { fetchKasalar, type Kasa } from '../../../services/api/kasa';
import {
  CUSTOMER_CALL_WEEKDAYS,
  normalizeCustomerCallWeekdays,
  customerCallWeekdaysLabel,
} from '../../../utils/customerCallPlan';
import { consumeOpenSupplierEkstreRequest } from '../../../utils/openSupplierEkstre';
import {
  buildEkstreRows,
  defaultEkstreDateRange,
  getCariBalanceDirection,
  preferIntegerAmountDisplay,
  ficheTypeToInfo,
} from '../../../utils/cariAccountStatement';
import {
  SUPPLIER_LIST_COLUMN_ORDER,
  SUPPLIER_LIST_COLUMN_VISIBILITY_KEY,
  loadSupplierListColumnVisibility,
  supplierListColumnVisibilityMenuItems,
  type SupplierListColumnId,
} from './supplierListColumns';

export function SupplierModule({ initialFilter = 'all' }: { initialFilter?: 'all' | 'customer' | 'supplier' | 'duplicates' }) {
  const { t, tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const mainCurrency = useMemo(
    () => String(selectedFirm?.ana_para_birimi || getAppDefaultCurrency()).trim().toUpperCase().slice(0, 10) || 'IQD',
    [selectedFirm?.ana_para_birimi]
  );
  const reportingCurrency = useMemo(() => {
    const r = String(selectedFirm?.raporlama_para_birimi || mainCurrency).trim().toUpperCase().slice(0, 10);
    return r || mainCurrency;
  }, [selectedFirm?.raporlama_para_birimi, mainCurrency]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [latestRates, setLatestRates] = useState<ExchangeRate[]>([]);
  /** Ekstre tablosunda birincil sütunları raporlama dövizinde göster */
  const [showReportingPrimary, setShowReportingPrimary] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  /** Liste filtresi: tümü / müşteri (alıcı) / satıcı (tedarikçi) */
  const [accountTypeFilter, setAccountTypeFilter] = useState<'all' | 'customer' | 'supplier' | 'duplicates'>(initialFilter);
  const [columnVisibility, setColumnVisibility] = useState(loadSupplierListColumnVisibility);

  useEffect(() => {
    setAccountTypeFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    try {
      const payload = Object.fromEntries(
        SUPPLIER_LIST_COLUMN_ORDER.map((id) => [id, columnVisibility[id] !== false])
      );
      localStorage.setItem(SUPPLIER_LIST_COLUMN_VISIBILITY_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [columnVisibility]);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        setLatestRates(await exchangeRateAPI.getLatestRates());
      } catch (e) {
        console.error('Exchange rate fetch failed:', e);
      }
    };
    void fetchRates();
  }, [selectedFirm?.logicalref, mainCurrency, reportingCurrency]);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; supplier: Supplier | null } | null>(null);
  const [defaultKasa, setDefaultKasa] = useState<Kasa | null>(null);
  const [cashAction, setCashAction] = useState<{
    type: 'CH_TAHSILAT' | 'CH_ODEME';
    account: Supplier;
  } | null>(null);

  // Master-detail: selected account + ekstresi data
  const [selectedAccount, setSelectedAccount] = useState<Supplier | null>(null);
  const [ekstresiData, setEkstresiData] = useState<any[]>([]);
  const [ekstresiLoading, setEkstresiLoading] = useState(false);
  const defaultEkstre = useMemo(() => defaultEkstreDateRange(), []);
  const [ekstresiStart, setEkstresiStart] = useState(defaultEkstre.start);
  const [ekstresiEnd, setEkstresiEnd] = useState(defaultEkstre.end);

  // Form state
  const [formData, setFormData] = useState({
    code: '', name: '', phone: '', email: '', address: '', city: '',
    payment_terms: 30, credit_limit: 0, tax_number: '', tax_office: '', notes: '',
    call_plan_enabled: false,
    call_plan_weekdays: [] as number[],
    call_plan_note: '',
    cardType: 'supplier' as 'customer' | 'supplier',
  });

  useEffect(() => { loadSuppliers(); }, []);

  useEffect(() => {
    const pending = consumeOpenSupplierEkstreRequest();
    if (!pending || suppliers.length === 0) return;
    const account = suppliers.find(s => s.id === pending.id);
    if (account) void selectAccount(account);
  }, [suppliers]);

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

  useEffect(() => {
    const openCallerForm = async (rawPhone: string, forceCreate?: boolean) => {
      const phone = rawPhone.trim();
      if (!phone) return;
      if (!forceCreate) {
        setSearchQuery(phone);
      }
      setFormData({
        code: '',
        name: '',
        phone,
        email: '',
        address: '',
        city: '',
        payment_terms: 30,
        credit_limit: 0,
        tax_number: '',
        tax_office: '',
        notes: '',
        call_plan_enabled: false,
        call_plan_weekdays: [],
        call_plan_note: '',
        cardType: 'customer',
      });
      setEditingSupplier(null);
      setShowAddModal(true);
      try {
        const code = await supplierAPI.generateCode('customer');
        setFormData(prev => ({ ...prev, code }));
      } catch {
        // no-op
      }
    };

    const fromStorage = localStorage.getItem('callerid_customer_phone')?.trim();
    if (fromStorage) {
      localStorage.removeItem('callerid_customer_phone');
      void openCallerForm(fromStorage, true);
    }

    const onCaller = (ev: Event) => {
      const custom = ev as CustomEvent<{ phone?: string; forceCreate?: boolean }>;
      const phone = custom.detail?.phone?.trim();
      if (!phone) return;
      void openCallerForm(phone, custom.detail?.forceCreate === true);
    };
    window.addEventListener('callerid-open-customer', onCaller);
    return () => window.removeEventListener('callerid-open-customer', onCaller);
  }, []);

  useEffect(() => {
    if (!selectedAccount) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedAccount(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedAccount]);

  useEffect(() => {
    if (!selectedAccount && !showAddModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selectedAccount, showAddModal]);

  const loadSuppliers = async (): Promise<Supplier[]> => {
    setLoading(true);
    try {
      const { repairCariLedgerConsistency } = await import('../../../services/api/accountLedgerRepair');
      await repairCariLedgerConsistency().catch(() => { /* sessiz */ });
      const all = await supplierAPI.getAll();
      setSuppliers(all);
      setSelectedAccount((prev) => {
        if (!prev) return prev;
        return all.find((s) => s.id === prev.id) ?? prev;
      });
      return all;
    } catch (e: any) {
      toast.error(e.message || 'Cari hesaplar yüklenemedi');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const loadEkstresi = async (supplier: Supplier, start: string, end: string) => {
    setEkstresiLoading(true);
    try {
      setEkstresiData(
        await supplierAPI.getAccountStatement(
          supplier.id,
          start,
          end,
          supplier.name,
          supplier.cardType,
        ),
      );
    } catch (e: any) {
      setEkstresiData([]);
      toast.error(e?.message || 'Hesap ekstresi yüklenemedi');
    } finally {
      setEkstresiLoading(false);
    }
  };

  const selectAccount = async (supplier: Supplier) => {
    let fresh = supplier;
    try {
      const all = await supplierAPI.getAll();
      fresh = all.find((s) => s.id === supplier.id) ?? supplier;
    } catch {
      /* listedeki bakiye ile devam */
    }
    setSelectedAccount(fresh);
    setEkstresiData([]);
    loadEkstresi(fresh, ekstresiStart, ekstresiEnd);
  };

  const duplicateAccountKeys = useMemo(() => {
    const counts = new Map<string, number>();
    const keysById = new Map<string, string[]>();
    const normName = (v: unknown) => String(v ?? '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
    const normPhone = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10);
    for (const s of suppliers) {
      const keys = [
        normPhone(s.phone) ? `phone:${normPhone(s.phone)}` : '',
        normName(s.name) ? `name:${normName(s.name)}` : '',
      ].filter(Boolean);
      keysById.set(s.id, keys);
      keys.forEach(key => counts.set(key, (counts.get(key) || 0) + 1));
    }
    return new Set(
      [...keysById.entries()]
        .filter(([, keys]) => keys.some(key => (counts.get(key) || 0) > 1))
        .map(([id]) => id)
    );
  }, [suppliers]);

  const filteredSuppliers = suppliers.filter(s => {
    if (accountTypeFilter === 'duplicates' && !duplicateAccountKeys.has(s.id)) return false;
    if (accountTypeFilter === 'customer' && s.cardType !== 'customer') return false;
    if (accountTypeFilter === 'supplier' && s.cardType !== 'supplier') return false;
    const q = searchQuery.toLowerCase();
    return (s.name?.toLowerCase() || '').includes(q) ||
      (s.code?.toLowerCase() || '').includes(q) ||
      (s.phone || '').includes(searchQuery) ||
      (s.email?.toLowerCase() || '').includes(q);
  });

  /** Cari listesindeki demo kayıtlar (müşteri + tedarikçi) */
  const demoAccountsInList = useMemo(() => {
    return suppliers.filter(s => {
      const code = String(s.code || '').trim();
      if (!code) return false;
      const ct = s.cardType || 'supplier';
      if (ct === 'supplier') return DEMO_SUPPLIER_CODES.has(code);
      return DEMO_CUSTOMER_CODES.has(code);
    });
  }, [suppliers]);

  const openAddModal = (cardType: 'customer' | 'supplier') => {
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
      call_plan_enabled: false,
      call_plan_weekdays: [],
      call_plan_note: '',
      cardType,
    });
    setEditingSupplier(null);
    setShowAddModal(true);
    void supplierAPI.generateCode(cardType).then((code) => setFormData((prev) => ({ ...prev, code }))).catch(() => { });
  };

  const handleAddCustomerClick = () => openAddModal('customer');
  const handleAddSupplierClick = () => openAddModal('supplier');

  const handleEditClick = (supplier: Supplier) => {
    setFormData({
      code: supplier.code || '', name: supplier.name, phone: supplier.phone || '',
      email: supplier.email || '', address: supplier.address || '', city: supplier.city || '',
      payment_terms: supplier.payment_terms || 30, credit_limit: supplier.credit_limit || 0,
      tax_number: supplier.tax_number || '', tax_office: supplier.tax_office || '',
      notes: supplier.notes || '',
      call_plan_enabled: supplier.call_plan_enabled === true,
      call_plan_weekdays: normalizeCustomerCallWeekdays(supplier.call_plan_weekdays),
      call_plan_note: supplier.call_plan_note || '',
      cardType: supplier.cardType || 'supplier',
    });
    setEditingSupplier(supplier);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('Ad zorunludur'); return; }
    const saveData = {
      ...formData,
      call_plan_enabled:
        formData.cardType === 'customer' &&
        formData.call_plan_enabled === true &&
        normalizeCustomerCallWeekdays(formData.call_plan_weekdays).length > 0,
      call_plan_weekdays:
        formData.cardType === 'customer' && formData.call_plan_enabled
          ? normalizeCustomerCallWeekdays(formData.call_plan_weekdays)
          : [],
      call_plan_note:
        formData.cardType === 'customer' && formData.call_plan_enabled
          ? formData.call_plan_note.trim() || null
          : null,
    };
    try {
      if (editingSupplier) {
        const prevType = editingSupplier.cardType || 'supplier';
        if (prevType !== saveData.cardType) {
          await supplierAPI.transferCardType(editingSupplier.id, prevType, saveData.cardType, saveData);
          toast.success(tm('accountTypeChanged') || 'Cari tipi değiştirildi');
        } else {
          await supplierAPI.update(editingSupplier.id, saveData);
          toast.success('Güncellendi');
        }
        setShowAddModal(false);
        await loadSuppliers();
      } else {
        const created = await supplierAPI.create(saveData);
        toast.success(saveData.cardType === 'customer' ? 'Müşteri cari hesabı eklendi' : 'Satıcı cari hesabı eklendi');
        setShowAddModal(false);
        await loadSuppliers();
        void selectAccount({ ...created, cardType: saveData.cardType, balance: 0 });
      }
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

  const handleExportExcel = async () => {
    const list = filteredSuppliers;
    if (list.length === 0) {
      toast.error(tm('noRecordFound') || 'Dışa aktarılacak kayıt yok.');
      return;
    }
    setExportingExcel(true);
    try {
      const rows = list.map(mapUnifiedSupplierToCurrentAccountExcelRow);
      const saved = await saveCurrentAccountsAsXlsx(
        rows,
        `CariHesaplar_${new Date().toISOString().split('T')[0]}.xlsx`
      );
      if (saved) {
        toast.success(`${list.length} cari hesap Excel şablonuna uygun kaydedildi.`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Excel oluşturulamadı.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleBulkDeleteDemoAccounts = async () => {
    const n = demoAccountsInList.length;
    if (n === 0) return;
    const confirmed = await confirmDialog({
      variant: 'danger',
      title: tm('deleteDemoSuppliers') || 'Demo cari kayıtlarını sil',
      description: (tm('confirmBulkDemoSupplierDelete') || '{count} demo cari kaydı silinecek. Emin misiniz?').replace('{count}', String(n)),
      confirmLabel: tm('deleteAction') || 'Sil',
      cancelLabel: tm('cancel') || 'İptal',
    });
    if (!confirmed) return;
    setContextMenu(null);
    let deletedCount = 0;
    for (const a of demoAccountsInList) {
      try {
        await supplierAPI.delete(a.id, a.cardType || 'supplier');
        deletedCount++;
      } catch {
        // devam
      }
    }
    if (selectedAccount && demoAccountsInList.some(d => d.id === selectedAccount.id)) {
      setSelectedAccount(null);
    }
    await loadSuppliers();
    if (deletedCount > 0) toast.success(`${deletedCount} demo cari kaydı silindi.`);
    if (deletedCount < n) toast.error('Bazı kayıtlar silinemedi.');
  };

  const mainDec = preferIntegerAmountDisplay(mainCurrency) ? 0 : 2;
  const mainShowDec = !preferIntegerAmountDisplay(mainCurrency);
  const repDec = preferIntegerAmountDisplay(reportingCurrency) ? 0 : 2;
  const repShowDec = !preferIntegerAmountDisplay(reportingCurrency);

  const toReporting = (amountMain: number) =>
    convertAmountMainToReporting(amountMain, mainCurrency, reportingCurrency, latestRates);

  /** Ekstre: varsayılan ana para; isteğe raporlama birimine geçiş */
  const fmtEkstreAmount = (amountMain: number) => {
    const rep = reportingCurrency !== mainCurrency ? toReporting(amountMain) : null;
    if (rep == null || reportingCurrency === mainCurrency) {
      return {
        primary: formatNumber(amountMain, mainDec, mainShowDec),
        code: mainCurrency,
        secondary: null as string | null,
      };
    }
    if (showReportingPrimary) {
      return {
        primary: formatNumber(rep, repDec, repShowDec),
        code: reportingCurrency,
        secondary: `${formatNumber(amountMain, mainDec, mainShowDec)} ${mainCurrency}`,
      };
    }
    return {
      primary: formatNumber(amountMain, mainDec, mainShowDec),
      code: mainCurrency,
      secondary: `${formatNumber(rep, repDec, repShowDec)} ${reportingCurrency}`,
    };
  };

  const isColumnVisible = (id: SupplierListColumnId) => columnVisibility[id] !== false;

  const columnVisibilityItems = useMemo(
    () => supplierListColumnVisibilityMenuItems({ columnVisibility, tm }),
    [columnVisibility, tm]
  );

  const columnHelper = createColumnHelper<Supplier>();

  const formatCallStatus = (status?: string | null) => {
    const s = String(status || '').toLowerCase();
    if (s === 'planned') return tm('callPlanPlanned');
    if (s === 'called') return tm('callPlanCalled');
    if (s === 'no_answer') return tm('callPlanNoAnswer');
    if (s === 'callback') return tm('callPlanCallback');
    if (s === 'not_interested') return tm('callPlanNotInterested');
    if (s === 'done') return tm('callPlanDone');
    return status || '—';
  };

  const formatGender = (g?: string | null) => {
    const v = String(g || '').toLowerCase();
    if (v === 'male' || v === 'm' || v === 'erkek') return tm('custGenderMale');
    if (v === 'female' || v === 'f' || v === 'kadın' || v === 'kadin') return tm('custGenderFemale');
    if (v === 'other' || v === 'diğer' || v === 'diger') return tm('custGenderOther');
    return g || '—';
  };

  const formatTier = (tier?: string | null) => {
    const v = String(tier || '').toLowerCase();
    if (v === 'vip') return tm('custTierVip');
    if (v === 'normal') return tm('custTierNormal');
    return tier || '—';
  };

  const textCell = (value: unknown, className = 'text-xs text-gray-700') => (
    <span className={className}>{value != null && String(value).trim() !== '' ? String(value) : '—'}</span>
  );

  const columns = useMemo(() => {
    const cols: any[] = [];
    if (isColumnVisible('code')) {
      cols.push(
        columnHelper.accessor('code', {
          header: tm('code'),
          cell: info => <span className="font-mono text-xs text-blue-600 font-bold">{info.getValue() || '-'}</span>,
          size: 100
        })
      );
    }
    if (isColumnVisible('cardType')) {
      cols.push(
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
        })
      );
    }
    if (isColumnVisible('name')) {
      cols.push(
        columnHelper.accessor('name', {
          header: tm('currentAccountTitle'),
          cell: info => {
            const row = info.row.original;
            const isCustomer = row.cardType === 'customer';
            return (
              <div className="min-w-0">
                <span className="font-semibold text-gray-800">{info.getValue()}</span>
                <span className={`ml-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${isCustomer ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                  {row.code || '—'}
                </span>
              </div>
            );
          }
        })
      );
    }
    if (isColumnVisible('contact')) {
      cols.push(
        columnHelper.accessor('phone', {
          id: 'contact',
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
        })
      );
    }
    if (isColumnVisible('phone')) {
      cols.push(columnHelper.accessor('phone', { id: 'phone', header: tm('phoneLabel'), cell: info => textCell(info.getValue()), size: 120 }));
    }
    if (isColumnVisible('phone2')) {
      cols.push(columnHelper.accessor('phone2', { header: tm('custLabelPhone2'), cell: info => textCell(info.getValue()), size: 120 }));
    }
    if (isColumnVisible('email')) {
      cols.push(columnHelper.accessor('email', { header: tm('emailLabel'), cell: info => textCell(info.getValue()), size: 160 }));
    }
    if (isColumnVisible('address')) {
      cols.push(columnHelper.accessor('address', { header: tm('custLabelAddress'), cell: info => textCell(info.getValue()), size: 180 }));
    }
    if (isColumnVisible('city')) {
      cols.push(columnHelper.accessor('city', { header: tm('cariColCity'), cell: info => textCell(info.getValue()), size: 100 }));
    }
    if (isColumnVisible('district')) {
      cols.push(columnHelper.accessor('district', { header: tm('cariColDistrict'), cell: info => textCell(info.getValue()), size: 100 }));
    }
    if (isColumnVisible('neighborhood')) {
      cols.push(columnHelper.accessor('neighborhood', { header: tm('cariColNeighborhood'), cell: info => textCell(info.getValue()), size: 100 }));
    }
    if (isColumnVisible('taxNumber')) {
      cols.push(columnHelper.accessor(row => row.tax_number || row.taxNumber, {
        id: 'taxNumber',
        header: tm('custLabelTaxNo'),
        cell: info => textCell(info.getValue()),
        size: 120,
      }));
    }
    if (isColumnVisible('taxOffice')) {
      cols.push(columnHelper.accessor(row => row.tax_office || row.taxOffice, {
        id: 'taxOffice',
        header: tm('custLabelTaxOffice'),
        cell: info => textCell(info.getValue()),
        size: 120,
      }));
    }
    if (isColumnVisible('notes')) {
      cols.push(columnHelper.accessor('notes', {
        header: tm('notes'),
        cell: info => <span className="text-xs text-gray-600 line-clamp-2 max-w-[200px]">{info.getValue() || '—'}</span>,
        size: 160,
      }));
    }
    if (isColumnVisible('creditLimit')) {
      cols.push(columnHelper.accessor('credit_limit', {
        header: tm('cariColCreditLimit'),
        cell: info => {
          const val = Number(info.getValue() || 0);
          return <span className="text-xs font-semibold tabular-nums">{formatNumber(val, mainDec, mainShowDec)}</span>;
        },
        meta: { align: 'right' },
        size: 110,
      }));
    }
    if (isColumnVisible('paymentTerms')) {
      cols.push(columnHelper.accessor('payment_terms', {
        header: tm('cariColPaymentTerms'),
        cell: info => textCell(info.getValue()),
        size: 100,
      }));
    }
    if (isColumnVisible('contactPerson')) {
      cols.push(columnHelper.accessor('contact_person', {
        header: tm('cariColContactPerson'),
        cell: info => textCell(info.getValue()),
        size: 120,
      }));
    }
    if (isColumnVisible('contactPersonPhone')) {
      cols.push(columnHelper.accessor('contact_person_phone', {
        header: tm('cariColContactPersonPhone'),
        cell: info => textCell(info.getValue()),
        size: 120,
      }));
    }
    if (isColumnVisible('points')) {
      cols.push(columnHelper.accessor('points', {
        header: tm('cariColPoints'),
        cell: info => {
          const val = info.getValue();
          return <span className="text-xs tabular-nums">{val != null ? formatNumber(Number(val), 0, false) : '—'}</span>;
        },
        meta: { align: 'right' },
        size: 80,
      }));
    }
    if (isColumnVisible('totalSpent')) {
      cols.push(columnHelper.accessor('total_spent', {
        header: tm('cariColTotalSpent'),
        cell: info => {
          const val = info.getValue();
          return <span className="text-xs tabular-nums">{val != null ? formatNumber(Number(val), mainDec, mainShowDec) : '—'}</span>;
        },
        meta: { align: 'right' },
        size: 110,
      }));
    }
    if (isColumnVisible('age')) {
      cols.push(columnHelper.accessor('age', {
        header: tm('custLabelAge'),
        cell: info => textCell(info.getValue()),
        size: 60,
      }));
    }
    if (isColumnVisible('gender')) {
      cols.push(columnHelper.accessor('gender', {
        header: tm('custLabelGender'),
        cell: info => textCell(formatGender(info.getValue())),
        size: 80,
      }));
    }
    if (isColumnVisible('customerTier')) {
      cols.push(columnHelper.accessor('customer_tier', {
        header: tm('custLabelTier'),
        cell: info => textCell(formatTier(info.getValue())),
        size: 90,
      }));
    }
    if (isColumnVisible('occupation')) {
      cols.push(columnHelper.accessor('occupation', {
        header: tm('custLabelOccupation'),
        cell: info => textCell(info.getValue()),
        size: 120,
      }));
    }
    if (isColumnVisible('heardFrom')) {
      cols.push(columnHelper.accessor('heard_from', {
        header: tm('custLabelHeardFrom'),
        cell: info => textCell(info.getValue()),
        size: 140,
      }));
    }
    if (isColumnVisible('fileId')) {
      cols.push(columnHelper.accessor('file_id', {
        header: tm('custLabelFileId'),
        cell: info => textCell(info.getValue()),
        size: 100,
      }));
    }
    if (isColumnVisible('callPlanEnabled')) {
      cols.push(columnHelper.accessor('call_plan_enabled', {
        header: tm('cariColCallPlanEnabled'),
        cell: info => (
          <span className={`text-[10px] font-bold uppercase ${info.getValue() ? 'text-emerald-700' : 'text-gray-400'}`}>
            {info.getValue() ? tm('active') : tm('passive')}
          </span>
        ),
        size: 90,
      }));
    }
    if (isColumnVisible('callPlanWeekdays')) {
      cols.push(columnHelper.accessor('call_plan_weekdays', {
        header: tm('cariColCallPlanWeekdays'),
        cell: info => {
          const days = normalizeCustomerCallWeekdays(info.getValue());
          return textCell(days.length ? customerCallWeekdaysLabel(days, true) : '—');
        },
        size: 140,
      }));
    }
    if (isColumnVisible('callPlanNote')) {
      cols.push(columnHelper.accessor('call_plan_note', {
        header: tm('callPlanNote'),
        cell: info => <span className="text-xs text-gray-600 line-clamp-2 max-w-[160px]">{info.getValue() || '—'}</span>,
        size: 140,
      }));
    }
    if (isColumnVisible('callLastStatus')) {
      cols.push(columnHelper.accessor('call_last_status', {
        header: tm('callPlanLastStatus'),
        cell: info => textCell(formatCallStatus(info.getValue())),
        size: 110,
      }));
    }
    if (isColumnVisible('callLastNote')) {
      cols.push(columnHelper.accessor('call_last_note', {
        header: tm('callPlanLastStatusNote'),
        cell: info => <span className="text-xs text-gray-600 line-clamp-2 max-w-[160px]">{info.getValue() || '—'}</span>,
        size: 140,
      }));
    }
    if (isColumnVisible('callLastAt')) {
      cols.push(columnHelper.accessor('call_last_at', {
        header: tm('cariColCallLastAt'),
        cell: info => {
          const raw = info.getValue();
          if (!raw) return textCell('—');
          try {
            return textCell(new Date(String(raw)).toLocaleString());
          } catch {
            return textCell(raw);
          }
        },
        size: 140,
      }));
    }
    if (isColumnVisible('balance')) {
      cols.push(
        columnHelper.accessor('balance', {
          header: tm('crmBalance'),
          cell: info => {
            const val = info.getValue() || 0;
            const rep = reportingCurrency !== mainCurrency ? toReporting(Math.abs(val)) : null;
            const { side, sideLabel, hint } = getCariBalanceDirection(info.row.original.cardType, val, tm);
            const colorClass = side === 'B' ? 'text-red-600' : 'text-orange-600';
            const badgeClass = side === 'B' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700';
            return (
              <div className="flex flex-col items-end gap-0.5 font-bold">
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span className={colorClass}>
                    {formatNumber(Math.abs(val), mainDec, mainShowDec)} {mainCurrency}
                  </span>
                  {sideLabel && (
                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-black whitespace-nowrap ${badgeClass}`} title={hint}>
                      {sideLabel}
                    </span>
                  )}
                </div>
                {hint && sideLabel && (
                  <span className="text-[9px] text-gray-500 font-medium max-w-[140px] text-right leading-tight">{hint}</span>
                )}
                {rep != null && reportingCurrency !== mainCurrency && (
                  <span className="text-[10px] text-gray-400 font-medium">
                    ({formatNumber(rep, repDec, repShowDec)} {reportingCurrency})
                  </span>
                )}
              </div>
            );
          },
          meta: { align: 'right' }
        })
      );
    }
    if (isColumnVisible('isActive')) {
      cols.push(columnHelper.accessor('is_active', {
        header: tm('active'),
        cell: info => (
          <span className={`text-[10px] font-bold uppercase ${info.getValue() !== false ? 'text-emerald-700' : 'text-gray-400'}`}>
            {info.getValue() !== false ? tm('active') : tm('passive')}
          </span>
        ),
        size: 80,
      }));
    }
    if (isColumnVisible('createdAt')) {
      cols.push(columnHelper.accessor('created_at', {
        header: tm('createdAt'),
        cell: info => {
          const raw = info.getValue();
          if (!raw) return textCell('—');
          try {
            return textCell(new Date(String(raw)).toLocaleDateString());
          } catch {
            return textCell(raw);
          }
        },
        size: 110,
      }));
    }
    if (isColumnVisible('refId')) {
      cols.push(columnHelper.accessor('ref_id', {
        header: tm('cariColRefId'),
        cell: info => textCell(info.getValue(), 'font-mono text-xs text-gray-600'),
        size: 90,
      }));
    }
    if (isColumnVisible('actions')) {
      cols.push(
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
      );
    }
    return cols;
  }, [
    columnVisibility,
    tm,
    mainCurrency,
    reportingCurrency,
    mainDec,
    mainShowDec,
    repDec,
    repShowDec,
    toReporting,
  ]);

  const columnVisibilityControl = (
    <ColumnVisibilityMenu
      variant="toolbar"
      columns={columnVisibilityItems}
      onToggle={(columnId) => {
        setColumnVisibility((prev) => ({
          ...prev,
          [columnId]: !(prev[columnId] !== false),
        }));
      }}
      onShowAll={() => {
        setColumnVisibility(Object.fromEntries(SUPPLIER_LIST_COLUMN_ORDER.map((id) => [id, true])));
      }}
      onHideAll={() => {
        setColumnVisibility(Object.fromEntries(SUPPLIER_LIST_COLUMN_ORDER.map((id) => [id, false])));
      }}
    />
  );

  // Ekstresi — ortak yardımcı (CH_TAHSILAT/CH_ODEME alacak; satış gibi borç yazılmaz)
  const isSupplierAccount = selectedAccount?.cardType === 'supplier';
  const ekstresiRows = buildEkstreRows(ekstresiData, selectedAccount?.cardType);
  const totalBorc = ekstresiRows.reduce((s, r) => s + r.borcAmount, 0);
  const totalAlacak = ekstresiRows.reduce((s, r) => s + r.alacakAmount, 0);
  const netBalance = isSupplierAccount ? totalAlacak - totalBorc : totalBorc - totalAlacak;
  const netBalanceDir = getCariBalanceDirection(selectedAccount?.cardType, netBalance, tm);

  const fmtEkstreSignedNet = () => {
    if (reportingCurrency === mainCurrency) {
      return {
        primary: formatNumber(Math.abs(netBalance), mainDec, mainShowDec),
        code: mainCurrency,
        secondary: null as string | null,
      };
    }
    const rep = toReporting(netBalance);
    if (rep == null) {
      return {
        primary: formatNumber(Math.abs(netBalance), mainDec, mainShowDec),
        code: mainCurrency,
        secondary: null as string | null,
      };
    }
    if (showReportingPrimary) {
      return {
        primary: formatNumber(Math.abs(rep), repDec, repShowDec),
        code: reportingCurrency,
        secondary: `${formatNumber(Math.abs(netBalance), mainDec, mainShowDec)} ${mainCurrency}`,
      };
    }
    return {
      primary: formatNumber(Math.abs(netBalance), mainDec, mainShowDec),
      code: mainCurrency,
      secondary: `${formatNumber(Math.abs(rep), repDec, repShowDec)} ${reportingCurrency}`,
    };
  };

  const openInvoiceFromStatement = (row: any) => {
    const ficheNo = String(row?.fiche_no || '').trim();
    if (!ficheNo) return;
    const type = String(row?.fiche_type || '').toLowerCase();
    const purchase = type.includes('purchase');
    window.dispatchEvent(new CustomEvent('navigateToScreen', {
      detail: {
        screen: purchase ? 'purchaseinvoice' : 'salesinvoice',
        invoiceSearch: ficheNo,
      },
    }));
  };

  const typeInfo = (row: any) => ficheTypeToInfo(row.fiche_type || '', Number(row.trcode), row.is_cancelled === true);

  const borcHdr = fmtEkstreAmount(totalBorc);
  const alacHdr = fmtEkstreAmount(totalAlacak);
  const netHdr = fmtEkstreSignedNet();

  const currentBalanceHdr = selectedAccount
    ? fmtEkstreAmount(Math.abs(
        ekstresiData.length > 0 ? netBalance : (selectedAccount.balance || 0)
      ))
    : null;
  const currentBalanceDir = selectedAccount
    ? getCariBalanceDirection(
        selectedAccount.cardType,
        ekstresiData.length > 0 ? netBalance : (selectedAccount.balance || 0),
        tm
      )
    : { side: '' as const, sideLabel: '', hint: '' };

  return (
    <div className="h-full min-h-0 flex flex-col" onClick={() => setContextMenu(null)}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <h2 className="text-sm font-semibold">{t.menu?.currentAccounts || 'Cari Hesap / Personel'}</h2>
            <span className="text-blue-100 text-[10px] ml-2">• {suppliers.length} {tm('account')}</span>
          </div>
          <div className="flex gap-1.5 items-center">
            <button onClick={loadSuppliers} className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>{tm('refreshData')}</span>
            </button>
            {columnVisibilityControl}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: 'cari-devir' }))}
              className="flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-900 hover:bg-indigo-50 transition-colors text-[10px] font-bold"
              title="Eski programdan cari borç devri"
            >
              <ArrowRightLeft className="w-3 h-3" />
              <span>Devir Fişi</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              disabled={exportingExcel || filteredSuppliers.length === 0}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] disabled:opacity-40 disabled:pointer-events-none"
              title="Excel modülü cari içe aktarım şablonu ile aynı sütunlar"
            >
              <Download className={`w-3 h-3 ${exportingExcel ? 'animate-pulse' : ''}`} />
              <span>{tm('export')} Excel</span>
            </button>
            <button
              type="button"
              onClick={handleAddCustomerClick}
              className="flex items-center gap-1 px-2 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px] font-bold"
            >
              <Users className="w-3 h-3" />
              <span>{tm('newCustomer')}</span>
            </button>
            <button
              type="button"
              onClick={handleAddSupplierClick}
              className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 hover:bg-orange-50 transition-colors text-[10px] font-bold"
            >
              <Truck className="w-3 h-3" />
              <span>{tm('newSupplier') || tm('supplierLabel')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50 p-3 gap-3">
        <div className="bg-white px-3 py-2 border border-gray-200 rounded flex-shrink-0 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { key: 'all' as const, label: tm('all') },
                { key: 'customer' as const, label: tm('buyersLabel') || `${tm('customer')} (Alıcı)` },
                { key: 'duplicates' as const, label: 'Mükerrerler' },
                { key: 'supplier' as const, label: tm('sellersLabel') || `${tm('supplierLabel')} (Satıcı)` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setAccountTypeFilter(tab.key)}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${
                  accountTypeFilter === tab.key
                    ? tab.key === 'supplier'
                      ? 'bg-orange-600 text-white'
                      : tab.key === 'duplicates'
                        ? 'bg-red-600 text-white'
                      : 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
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

        <div className="flex-1 min-h-0 flex flex-col rounded border border-gray-200 bg-white overflow-hidden">
          <p className="text-[10px] text-gray-500 px-3 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0">
            {tm('accountStatementClickHint') || 'Ekstre için satıra tıklayın veya dosya ikonuna basın'}
          </p>
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
              enableExcelExport={false}
              onRowClick={selectAccount}
              onRowContextMenu={(e, supplier) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, supplier }); }}
              onRowDoubleClick={selectAccount}
              pageSize={50}
              height="100%"
            />
          )}
        </div>
      </div>

      {/* Tam ekran — hesap hareketleri / ekstre (body portalı — üst layout üstünde) */}
      {selectedAccount && (
        <FullscreenBodyPortal
          className="flex flex-col bg-white"
          zIndex={MODAL_OVERLAY_Z}
          role="dialog"
          aria-modal="true"
          aria-labelledby="supplier-ekstre-title"
        >
          <div className="flex-shrink-0 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-gray-50 shadow-sm">
            <div className="px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 min-w-0" id="supplier-ekstre-title">
                <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('accountStatement')}</p>
                  <p className="text-base font-bold text-gray-900 truncate">{selectedAccount.name}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ${selectedAccount.cardType === 'customer' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                  {selectedAccount.cardType === 'customer' ? tm('customer') : tm('supplierLabel')}
                </span>
                {currentBalanceHdr && (
                  <span
                    className={`shrink-0 border text-xs font-black px-2.5 py-1 rounded-lg ${
                      currentBalanceDir.side === 'B'
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : currentBalanceDir.side === 'A'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                    title={currentBalanceDir.hint}
                  >
                    {tm('custColBalance')}: {currentBalanceHdr.primary} {currentBalanceHdr.code}
                    {currentBalanceDir.sideLabel ? ` · ${currentBalanceDir.sideLabel}` : ''}
                    {currentBalanceDir.hint ? (
                      <span className="block text-[9px] font-medium normal-case opacity-90 mt-0.5">{currentBalanceDir.hint}</span>
                    ) : null}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={ekstresiStart} onChange={e => setEkstresiStart(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-gray-400 text-xs">—</span>
                <input type="date" value={ekstresiEnd} onChange={e => setEkstresiEnd(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" onClick={() => loadEkstresi(selectedAccount, ekstresiStart, ekstresiEnd)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded transition-colors">
                  {tm('bring')}
                </button>
                <div className="hidden sm:flex flex-wrap items-center gap-1.5">
                  <span className="bg-red-50 border border-red-200 text-red-600 text-xs font-black px-2 py-0.5 rounded">B: {borcHdr.primary} {borcHdr.code}</span>
                  <span className="bg-orange-50 border border-orange-200 text-orange-600 text-xs font-black px-2 py-0.5 rounded">A: {alacHdr.primary} {alacHdr.code}</span>
                  {(() => {
                    const netCls = netBalanceDir.side === 'B' ? 'bg-red-50 border-red-200 text-red-700' : netBalanceDir.side === 'A' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-500';
                    return (
                      <span className={`border text-xs font-black px-2 py-0.5 rounded ${netCls}`} title={netBalanceDir.hint}>
                        {tm('netAmount')}: {netHdr.primary} {netHdr.code}{netBalanceDir.sideLabel ? ` · ${netBalanceDir.sideLabel}` : ''}
                      </span>
                    );
                  })()}
                </div>
                {reportingCurrency !== mainCurrency && (
                  <button
                    type="button"
                    onClick={() => setShowReportingPrimary(!showReportingPrimary)}
                    className={`px-2 py-1.5 rounded text-[10px] font-black uppercase transition-all ${showReportingPrimary ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}
                  >
                    {showReportingPrimary ? reportingCurrency : mainCurrency}
                  </button>
                )}
                <button type="button" onClick={() => window.print()} className="p-2 hover:bg-gray-200 rounded-lg border border-transparent hover:border-gray-300" title={tm('print')}><Printer className="w-4 h-4 text-gray-600" /></button>
                <button
                  type="button"
                  onClick={() => setSelectedAccount(null)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-lg"
                  title={tm('close')}
                >
                  <X className="w-4 h-4" />
                  {tm('close')}
                </button>
              </div>
            </div>
            <div className="sm:hidden px-3 pb-3 flex flex-wrap gap-1.5">
              <span className="bg-red-50 border border-red-200 text-red-600 text-xs font-black px-2 py-0.5 rounded">B: {borcHdr.primary} {borcHdr.code}</span>
              <span className="bg-orange-50 border border-orange-200 text-orange-600 text-xs font-black px-2 py-0.5 rounded">A: {alacHdr.primary} {alacHdr.code}</span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {ekstresiLoading ? (
              <div className="flex items-center justify-center min-h-[40vh] gap-2 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">{tm('loading')}</span>
              </div>
            ) : ekstresiRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-gray-500 px-6 text-center">
                <FileText className="w-10 h-10 text-gray-300" />
                <p className="text-sm font-medium">{tm('noRecordFound')}</p>
                <p className="text-xs text-gray-400 max-w-md">
                  {tm('accountStatementEmptyHint') ||
                    'Seçili tarih aralığında hareket yok. Bitiş tarihini ileri alıp «Getir»e basın (varsayılan: yıl başı–yıl sonu).'}
                </p>
                <button
                  type="button"
                  onClick={() => loadEkstresi(selectedAccount, ekstresiStart, ekstresiEnd)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg"
                >
                  {tm('bring')}
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[1] bg-gray-100 border-b border-gray-200">
                  <tr>
                    {[tm('dateLabel'), tm('ficheNo'), tm('type'), tm('description'), tm('debtor'), tm('creditor'), tm('balance')].map(h => (
                      <th key={h} className={`px-4 py-3 text-[11px] font-black text-gray-600 uppercase tracking-wider ${[tm('debtor'), tm('creditor'), tm('balance')].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ekstresiRows.map((row, idx) => {
                    const { label, color } = typeInfo(row);
                    const borcD = row.borcAmount > 0 ? fmtEkstreAmount(row.borcAmount) : null;
                    const alacD = row.alacakAmount > 0 ? fmtEkstreAmount(row.alacakAmount) : null;
                    const balD = row.balance !== 0 ? fmtEkstreAmount(Math.abs(row.balance)) : null;
                    const rowBalDir = getCariBalanceDirection(selectedAccount?.cardType, row.balance, tm);
                    return (
                      <tr key={idx} className={`border-b border-gray-100 hover:bg-blue-50/40 ${idx % 2 ? 'bg-gray-50/50' : ''}`}>
                        <td className="px-4 py-2 font-mono text-gray-600">{row.date ? String(row.date).split('T')[0] : '-'}</td>
                        <td className="px-4 py-2">
                          {row.fiche_no ? (
                            <button
                              type="button"
                              onClick={() => openInvoiceFromStatement(row)}
                              className="font-mono text-blue-600 font-bold underline underline-offset-2 hover:text-blue-800"
                              title="Faturayı aç"
                            >
                              {row.fiche_no}
                            </button>
                          ) : (
                            <span className="font-mono text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${color}`}>{label}</span></td>
                        <td className="px-4 py-2 text-gray-700 max-w-md break-words align-top">{row.notes || ''}</td>
                        <td className="px-4 py-2 text-right font-bold text-red-600 whitespace-nowrap">
                          {borcD ? (
                            <div className="flex flex-col items-end">
                              <span>{borcD.primary} {borcD.code}</span>
                              {borcD.secondary ? <span className="text-[10px] opacity-50 font-normal">{borcD.secondary}</span> : null}
                            </div>
                          ) : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-green-600 whitespace-nowrap">
                          {alacD ? (
                            <div className="flex flex-col items-end">
                              <span>{alacD.primary} {alacD.code}</span>
                              {alacD.secondary ? <span className="text-[10px] opacity-50 font-normal">{alacD.secondary}</span> : null}
                            </div>
                          ) : ''}
                        </td>
                        <td className={`px-4 py-2 text-right font-black whitespace-nowrap ${row.balance > 0 ? 'text-red-600' : row.balance < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          <div className="flex flex-col items-end">
                            {balD ? (
                              <>
                                <span>{balD.primary} {balD.code}{rowBalDir.sideLabel ? <span className="ml-1 text-[9px] font-black whitespace-nowrap" title={rowBalDir.hint}>{rowBalDir.sideLabel}</span> : null}</span>
                                {balD.secondary ? <span className="text-[10px] opacity-50 font-normal">{balD.secondary}</span> : null}
                              </>
                            ) : (
                              <span className="text-gray-400">{formatNumber(0, mainDec, mainShowDec)} {mainCurrency}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
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
            contextMenu.supplier?.cardType === 'customer'
              ? {
                  id: 'collection',
                  label: tm('cashActionCollect'),
                  icon: Download,
                  onClick: () => {
                    if (contextMenu.supplier) {
                      setCashAction({ type: 'CH_TAHSILAT', account: contextMenu.supplier });
                    }
                    setContextMenu(null);
                  }
                }
              : {
                  id: 'payment',
                  label: tm('cashActionPay'),
                  icon: Wallet,
                  onClick: () => {
                    if (contextMenu.supplier) {
                      setCashAction({ type: 'CH_ODEME', account: contextMenu.supplier });
                    }
                    setContextMenu(null);
                  }
                },
            { id: 'edit', label: tm('edit'), icon: Edit, onClick: () => { if (contextMenu.supplier) handleEditClick(contextMenu.supplier); setContextMenu(null); } },
            { id: 'extract', label: tm('accountStatement'), icon: FileText, onClick: () => { if (contextMenu.supplier) selectAccount(contextMenu.supplier); setContextMenu(null); } },
            {
              id: 'delete',
              label: tm('deleteAction'),
              icon: Trash2,
              variant: 'danger' as const,
              divider: demoAccountsInList.length > 0,
              onClick: () => {
                if (contextMenu.supplier) handleDelete(contextMenu.supplier.id, contextMenu.supplier.name, contextMenu.supplier.cardType || 'supplier');
                setContextMenu(null);
              }
            },
            ...(demoAccountsInList.length > 0
              ? [
                  {
                    id: 'delete-demo',
                    label: `Demo cari kayıtlarını toplu sil (${demoAccountsInList.length} adet)`,
                    icon: Trash2,
                    variant: 'danger' as const,
                    onClick: () => { void handleBulkDeleteDemoAccounts(); }
                  }
                ]
              : [])
          ]}
        />
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <FullscreenBodyPortal
          className="bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm"
          zIndex={MODAL_OVERLAY_Z}
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div
            className="bg-white rounded-xl w-full max-w-2xl max-h-[min(90vh,100dvh)] overflow-hidden shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-tighter">{editingSupplier ? tm('edit') : tm('newCurrentAccount')}</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase">{formData.cardType === 'customer' ? tm('customer') : tm('supplierLabel')}</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-200 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={async () => {
                  if (!editingSupplier) {
                    const c = await supplierAPI.generateCode('customer');
                    setFormData((prev) => ({ ...prev, cardType: 'customer', code: c }));
                    return;
                  }
                  setFormData((prev) => ({ ...prev, cardType: 'customer' }));
                }}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${formData.cardType === 'customer' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                  <Users className={`w-5 h-5 ${formData.cardType === 'customer' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className={`text-sm font-bold ${formData.cardType === 'customer' ? 'text-blue-700' : 'text-gray-500'}`}>{tm('customer')}</span>
                </button>
                <button type="button" onClick={async () => {
                  if (!editingSupplier) {
                    const c = await supplierAPI.generateCode('supplier');
                    setFormData((prev) => ({ ...prev, cardType: 'supplier', code: c }));
                    return;
                  }
                  setFormData((prev) => ({ ...prev, cardType: 'supplier' }));
                }}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${formData.cardType === 'supplier' ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
                  <Truck className={`w-5 h-5 ${formData.cardType === 'supplier' ? 'text-orange-500' : 'text-gray-400'}`} />
                  <span className={`text-sm font-bold ${formData.cardType === 'supplier' ? 'text-orange-700' : 'text-gray-500'}`}>{tm('supplierLabel')}</span>
                </button>
              </div>
              {editingSupplier && editingSupplier.cardType !== formData.cardType && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {tm('accountTypeChanged') || 'Kayıt yeni tipe taşınacak; fişler yeni cari kartına aktarılır.'}
                </p>
              )}
              {formData.cardType === 'customer' && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <div className="mb-3 flex items-start gap-2">
                    <CalendarClock className="mt-0.5 h-4 w-4 text-amber-700" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-amber-900">Müşteri arama planı</p>
                      <p className="text-[11px] font-medium text-amber-700">Bu müşteri haftanın hangi günü aranacak?</p>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-amber-900">Aranacak günler</p>
                    <div className="flex flex-wrap gap-2">
                      {CUSTOMER_CALL_WEEKDAYS.map(day => {
                        const selectedDays = normalizeCustomerCallWeekdays(formData.call_plan_weekdays);
                        const selected = selectedDays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => {
                              const nextDays = selected
                                ? formData.call_plan_weekdays.filter(v => v !== day.value)
                                : [...formData.call_plan_weekdays, day.value].sort((a, b) => a - b);
                              setFormData({
                                ...formData,
                                call_plan_enabled: nextDays.length > 0,
                                call_plan_weekdays: nextDays,
                              });
                            }}
                            aria-pressed={selected}
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
                    {normalizeCustomerCallWeekdays(formData.call_plan_weekdays).length > 0 ? (
                      <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700">
                        Seçili günler: {customerCallWeekdaysLabel(formData.call_plan_weekdays)}
                      </p>
                    ) : null}
                    <div className="mt-3">
                      <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-amber-900">Plan notu</label>
                      <textarea
                        value={formData.call_plan_note}
                        onChange={e => setFormData({ ...formData, call_plan_note: e.target.value })}
                        rows={2}
                        placeholder="Örn. Kampanya, rutin kontrol veya özel arama sebebi"
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-amber-700">Birden fazla gün seçebilirsiniz; seçili müşteriler Arama Listesi ekranında görünür.</p>
                  </div>
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
                {formData.cardType === 'supplier' && (
                  <Field label={tm('paymentTermDays')}><input type="number" value={formData.payment_terms} onChange={e => setFormData({ ...formData, payment_terms: parseInt(e.target.value) || 30 })} /></Field>
                )}
              </div>
              {formData.cardType === 'supplier' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label={tm('creditLimit')}><input type="number" value={formData.credit_limit} onChange={e => setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })} /></Field>
                <Field label={tm('taxNumberLabel')}><input type="text" value={formData.tax_number} onChange={e => setFormData({ ...formData, tax_number: e.target.value })} /></Field>
              </div>
              )}
              {formData.cardType === 'customer' && (
              <Field label={tm('taxNumberLabel')}><input type="text" value={formData.tax_number} onChange={e => setFormData({ ...formData, tax_number: e.target.value })} /></Field>
              )}
              <Field label={tm('notesLabel')}><textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} /></Field>
            </div>

            <div className="p-4 border-t bg-gray-50 flex gap-3 justify-end">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">{tm('cancel')}</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold">{editingSupplier ? tm('save') : tm('add')}</button>
            </div>
          </div>
        </FullscreenBodyPortal>
      )}
      {cashAction && defaultKasa && (
        <KasaIslemModal
          kasa={defaultKasa}
          islemTipi={cashAction.type}
          initialCari={{
            id: cashAction.account.id,
            kod: cashAction.account.code || '',
            unvan: cashAction.account.name,
            bakiye: cashAction.account.balance || 0,
            cardType: cashAction.account.cardType,
            ledgerBalance: cashAction.account.balance || 0,
          }}
          initialDescription={`${cashAction.type === 'CH_TAHSILAT' ? 'Tahsilat' : 'Ödeme'}: ${cashAction.account.code || ''} - ${cashAction.account.name}`}
          onClose={() => setCashAction(null)}
          onSuccess={() => {
            setCashAction(null);
            const acctId = selectedAccount?.id;
            void loadSuppliers().then((all) => {
              const fresh = acctId ? all.find((s) => s.id === acctId) : null;
              if (fresh) void loadEkstresi(fresh, ekstresiStart, ekstresiEnd);
            });
          }}
        />
      )}
    </div>
  );
}

// Small helper to reduce input boilerplate
function Field({ label, children }: { label: string; children: React.ReactElement<React.HTMLAttributes<HTMLElement>> }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">{label}</label>
      {React.cloneElement(children, {
        className: 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
      } satisfies React.HTMLAttributes<HTMLElement>)}
    </div>
  );
}
