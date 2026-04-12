import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Card,
    Button,
    Typography,
    Space,
    Avatar,
    Tag,
    Descriptions,
    Row,
    Col,
    Statistic,
    Tabs,
    Table,
    Input,
    Checkbox,
    Alert,
    Progress,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    ArrowLeftOutlined,
    EditOutlined,
    PlusOutlined,
    PhoneOutlined,
    MailOutlined,
    EnvironmentOutlined,
    CalendarOutlined,
    HistoryOutlined,
    SolutionOutlined,
    CommentOutlined,
    AccountBookOutlined,
    HeartOutlined,
    CheckCircleOutlined,
    StarOutlined,
    CreditCardOutlined,
    RiseOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import { useBeautyStore } from '../store/useBeautyStore';
import { beautyService, type BeautyCustomerProfileQueryOpts } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import type {
    BeautyCustomer,
    BeautyPackagePurchase,
    BeautyAppointment,
    BeautyLead,
    BeautyCustomerFeedback,
    BeautySale,
    BeautyCustomerHealth,
} from '../../../types/beauty';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { fetchCurrentAccounts } from '../../../services/api/currentAccounts';
import { ERP_SETTINGS } from '../../../services/postgres';
import { toast } from 'sonner';
import { User, Package } from 'lucide-react';
import { RetailExFlatModal, RetailExFlatFieldLabel } from '../../shared/RetailExFlatModal';
import {
    RETAILEX_BORDER_SUBTLE,
    RETAILEX_PAGE_BG,
    RETAILEX_PRIMARY,
    RETAILEX_TEXT_PRIMARY,
} from '../../../theme/retailexAntdTheme';

const EMPTY_FORM: Partial<BeautyCustomer> = {
    name: '', phone: '', email: '', address: '', city: '', notes: '',
};

const APT_STATUS_TM: Record<string, string> = {
    scheduled: 'bAppointmentScheduled',
    confirmed: 'bAppointmentConfirmed',
    in_progress: 'bAppointmentStarted',
    completed: 'bAppointmentCompleted',
    cancelled: 'bAppointmentCancelled',
    no_show: 'bAppointmentNoShow',
};

export type ClientCustomerDetailPageProps = {
    customerId: string;
    onBack: () => void;
};

function appointmentSortMs(a: BeautyAppointment): number {
    const d = a.appointment_date ?? a.date;
    if (!d) return 0;
    const t = (a.appointment_time ?? a.time ?? '12:00').slice(0, 5);
    const ms = Date.parse(`${d}T${t}:00`);
    if (!Number.isNaN(ms)) return ms;
    const d2 = Date.parse(d);
    return Number.isNaN(d2) ? 0 : d2;
}

function saleSortMs(s: BeautySale): number {
    const ms = new Date(s.created_at).getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

function packageSortMs(p: BeautyPackagePurchase): number {
    const ms = new Date(p.purchase_date).getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

type UnifiedHistoryRow =
    | { key: string; kind: 'appointment'; sortMs: number; appointment: BeautyAppointment }
    | { key: string; kind: 'sale'; sortMs: number; sale: BeautySale }
    | { key: string; kind: 'package'; sortMs: number; purchase: BeautyPackagePurchase };

export function ClientCustomerDetailPage({ customerId, onBack }: ClientCustomerDetailPageProps) {
    const { customers, packages, isLoading, loadCustomers, loadPackages, updateCustomer } = useBeautyStore();
    const { tm } = useLanguage();
    const dateLocale = tm('localeCode');
    const [erpAccountsLoaded, setErpAccountsLoaded] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyCustomer>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [currentAccountCustomers, setCurrentAccountCustomers] = useState<BeautyCustomer[]>([]);

    const [customerPackages, setCustomerPackages] = useState<BeautyPackagePurchase[]>([]);
    const [showPkgModal, setShowPkgModal] = useState(false);
    const [selectedPkg, setSelectedPkg] = useState('');
    const [pkgBuying, setPkgBuying] = useState(false);
    const [pkgLoading, setPkgLoading] = useState(false);

    const [detailTab, setDetailTab] = useState<'overview' | 'appointments' | 'crm' | 'feedback' | 'payments' | 'health'>('overview');
    const [healthForm, setHealthForm] = useState<Partial<BeautyCustomerHealth>>({});
    const [healthSaving, setHealthSaving] = useState(false);
    const [pastAppointments, setPastAppointments] = useState<BeautyAppointment[]>([]);
    const [leadRecords, setLeadRecords] = useState<BeautyLead[]>([]);
    const [feedbacks, setFeedbacks] = useState<BeautyCustomerFeedback[]>([]);
    const [salesHistory, setSalesHistory] = useState<BeautySale[]>([]);
    const [histLoading, setHistLoading] = useState(false);

    useEffect(() => {
        loadCustomers();
        loadPackages();
    }, []);

    useEffect(() => {
        void (async () => {
            try {
                const accounts = await fetchCurrentAccounts(ERP_SETTINGS.firmNr, 'MUSTERI');
                setCurrentAccountCustomers(
                    accounts
                        .filter(a => a.tip === 'MUSTERI' || a.tip === 'HER_IKISI')
                        .map(
                            a =>
                                ({
                                    id: a.id,
                                    code: a.kod,
                                    name: a.unvan,
                                    phone: a.telefon,
                                    email: a.email,
                                    address: a.adres,
                                    is_active: a.aktif,
                                    balance: a.bakiye,
                                    created_at: a.created_at,
                                }) as BeautyCustomer,
                        ),
                );
            } catch (e) {
                logger.error('ClientCustomerDetailPage', 'fetchCurrentAccounts failed', e);
            } finally {
                setErpAccountsLoaded(true);
            }
        })();
    }, []);

    const mergedCustomers = useMemo(() => {
        const map = new Map<string, BeautyCustomer>();
        for (const c of customers) map.set(c.id, c);
        for (const c of currentAccountCustomers) {
            if (!map.has(c.id)) map.set(c.id, c);
        }
        return Array.from(map.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'tr'));
    }, [customers, currentAccountCustomers]);

    const selected = useMemo(() => mergedCustomers.find(c => c.id === customerId) ?? null, [mergedCustomers, customerId]);

    const profileQueryOpts: BeautyCustomerProfileQueryOpts = useMemo(
        () => ({
            phone: selected?.phone,
            email: selected?.email,
            code: selected?.code,
            name: selected?.name,
        }),
        [selected?.phone, selected?.email, selected?.code, selected?.name],
    );

    useEffect(() => {
        if (!selected) {
            setCustomerPackages([]);
            return;
        }
        setPkgLoading(true);
        beautyService
            .getCustomerPackages(selected.id, profileQueryOpts)
            .then(setCustomerPackages)
            .catch(() => setCustomerPackages([]))
            .finally(() => setPkgLoading(false));
    }, [selected?.id, profileQueryOpts]);

    useEffect(() => {
        if (!selected) {
            setPastAppointments([]);
            setLeadRecords([]);
            setFeedbacks([]);
            setSalesHistory([]);
            setDetailTab('overview');
            return;
        }
        setDetailTab('overview');
        setHistLoading(true);
        void (async () => {
            const settled = await Promise.allSettled([
                beautyService.getAppointmentsByCustomer(selected.id, profileQueryOpts),
                beautyService.getLeadsLinkedToCustomer(selected.id, selected.phone, selected.email),
                beautyService.getFeedbackByCustomer(selected.id, profileQueryOpts),
                beautyService.getSalesByCustomer(selected.id, profileQueryOpts),
            ]);
            const [rApt, rLead, rFb, rSale] = settled;
            if (rApt.status === 'fulfilled') setPastAppointments(rApt.value);
            else {
                logger.error('ClientCustomerDetailPage', 'getAppointmentsByCustomer failed', rApt.reason);
                setPastAppointments([]);
            }
            if (rLead.status === 'fulfilled') setLeadRecords(rLead.value);
            else {
                logger.error('ClientCustomerDetailPage', 'getLeadsLinkedToCustomer failed', rLead.reason);
                setLeadRecords([]);
            }
            if (rFb.status === 'fulfilled') setFeedbacks(rFb.value);
            else {
                logger.error('ClientCustomerDetailPage', 'getFeedbackByCustomer failed', rFb.reason);
                setFeedbacks([]);
            }
            if (rSale.status === 'fulfilled') setSalesHistory(rSale.value);
            else {
                logger.error('ClientCustomerDetailPage', 'getSalesByCustomer failed', rSale.reason);
                setSalesHistory([]);
            }
            setHistLoading(false);
        })();
    }, [selected?.id, selected?.phone, selected?.email, profileQueryOpts]);

    useEffect(() => {
        if (!selected) {
            setHealthForm({});
            return;
        }
        void beautyService.getCustomerHealth(selected.id).then(h => setHealthForm(h ?? {}));
    }, [selected?.id]);

    const handleBuyPackage = async () => {
        if (!selected || !selectedPkg) return;
        const pkg = packages.find(p => p.id === selectedPkg);
        if (!pkg) return;
        setPkgBuying(true);
        try {
            const finalPrice = pkg.price * (1 - (pkg.discount_pct ?? 0) / 100);
            await beautyService.purchasePackage({
                customer_id: selected.id,
                package_id: pkg.id,
                total_sessions: pkg.total_sessions,
                sale_price: finalPrice,
                expiry_date: new Date(Date.now() + (pkg.validity_days ?? 365) * 86400000).toISOString().split('T')[0],
            });
            await beautyService.createSale(
                {
                    customer_id: selected.id,
                    customer_name: selected.name,
                    subtotal: finalPrice,
                    discount: pkg.price - finalPrice,
                    tax: 0,
                    total: finalPrice,
                    payment_method: 'cash',
                    payment_status: 'paid',
                    paid_amount: finalPrice,
                    remaining_amount: 0,
                    notes: tm('bPackagePurchaseNote').replace('{name}', pkg.name),
                },
                [
                    {
                        item_type: 'package',
                        item_id: pkg.id,
                        name: pkg.name,
                        quantity: 1,
                        unit_price: finalPrice,
                        discount: pkg.price - finalPrice,
                        total: finalPrice,
                        commission_amount: 0,
                    },
                ],
            );
            const updated = await beautyService.getCustomerPackages(selected.id, profileQueryOpts);
            setCustomerPackages(updated);
            setShowPkgModal(false);
            setSelectedPkg('');
            toast.success(tm('operationSavedSuccessfully'));
        } catch (e) {
            logger.crudError('ClientCustomerDetailPage', 'purchasePackage', e);
            toast.error(String(e instanceof Error ? e.message : e));
        } finally {
            setPkgBuying(false);
        }
    };

    const openEdit = (c: BeautyCustomer) => {
        setEditing({ ...c });
        setIsEdit(true);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!editing.name?.trim()) {
            toast.error(tm('bFillNameToSave'));
            throw new Error('validation');
        }
        setSaving(true);
        try {
            if (isEdit && editing.id) await updateCustomer(editing.id, editing);
            setShowModal(false);
            toast.success(tm('bSaveCustomerOk'));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg !== 'validation') {
                logger.error('ClientCustomerDetailPage', 'handleSave failed', e);
                toast.error(tm('bSaveCustomerFailed'), { description: msg, duration: 8000 });
            }
            throw e;
        } finally {
            setSaving(false);
        }
    };

    const initials = (name: string) =>
        name
            .split(' ')
            .slice(0, 2)
            .map(w => w[0])
            .join('')
            .toUpperCase();

    const formatDate = (d?: string) => (d ? new Date(d).toLocaleDateString(dateLocale) : '-');

    const formatDateTime = (d?: string, t?: string) => {
        if (!d) return '-';
        const datePart = new Date(d).toLocaleDateString(dateLocale);
        if (t) return `${datePart} ${t.slice(0, 5)}`;
        return datePart;
    };

    const formatIsoDateTime = (iso?: string) => {
        if (!iso) return '-';
        const dt = new Date(iso);
        if (Number.isNaN(dt.getTime())) return '-';
        return dt.toLocaleString(dateLocale, { dateStyle: 'short', timeStyle: 'short' });
    };

    const paymentMethodLabel = useCallback(
        (m: string) => {
            const map: Record<string, string> = {
                cash: 'bPaymentMethodCash',
                card: 'bPaymentMethodCard',
                credit_card: 'bPaymentMethodCard',
                transfer: 'bPaymentMethodTransfer',
                bank_transfer: 'bPaymentMethodTransfer',
            };
            const k = map[m];
            return k ? tm(k) : m;
        },
        [tm],
    );

    const paymentStatusLabel = useCallback((s: string) => {
        const map: Record<string, string> = {
            paid: 'bPaymentStatusPaid',
            pending: 'bPaymentStatusPending',
            partial: 'bPaymentStatusPartial',
        };
        const k = map[s];
        return k ? tm(k) : s;
    }, [tm]);

    const unifiedCustomerHistory = useMemo((): UnifiedHistoryRow[] => {
        const rows: UnifiedHistoryRow[] = [];
        for (const a of pastAppointments) {
            rows.push({
                key: `apt-${a.id}`,
                kind: 'appointment',
                sortMs: appointmentSortMs(a),
                appointment: a,
            });
        }
        for (const s of salesHistory) {
            rows.push({ key: `sale-${s.id}`, kind: 'sale', sortMs: saleSortMs(s), sale: s });
        }
        for (const p of customerPackages) {
            rows.push({
                key: `pkg-${p.id}`,
                kind: 'package',
                sortMs: packageSortMs(p),
                purchase: p,
            });
        }
        return rows.sort((x, y) => y.sortMs - x.sortMs);
    }, [pastAppointments, salesHistory, customerPackages]);

    const formatCurrency = (n?: number) => formatMoneyAmount(n ?? 0, { minFrac: 0, maxFrac: 0 });

    const aptStatusLabel = useCallback((status: string) => {
        const k = APT_STATUS_TM[status];
        return k ? tm(k) : status;
    }, [tm]);

    const showLoader = !selected && (isLoading || !erpAccountsLoaded);
    const showMissing = !selected && erpAccountsLoaded && !isLoading;

    /** Karttaki total_spent / appointment_count güncellenmemiş olsa bile yüklenen satış ve randevulardan özet göster */
    const profileStats = useMemo(() => {
        if (!selected) {
            return { totalSpent: 0, appointmentCount: 0, lastVisitLabel: '-' };
        }
        const paidSales = salesHistory.filter(s => (s.payment_status || 'paid') === 'paid');
        const sumSales = paidSales.reduce((acc, s) => acc + Number(s.total ?? 0), 0);
        const totalSpent = sumSales > 0 ? sumSales : Number(selected.total_spent ?? 0);
        const appointmentCount =
            pastAppointments.length > 0 ? pastAppointments.length : Number(selected.appointment_count ?? 0);
        let bestYmd: string | undefined;
        for (const a of pastAppointments) {
            const raw = a.appointment_date ?? a.date;
            const y = raw ? String(raw).slice(0, 10) : undefined;
            if (!y) continue;
            if (!bestYmd || y > bestYmd) bestYmd = y;
        }
        const fromSel = selected.last_appointment_date ? String(selected.last_appointment_date).slice(0, 10) : undefined;
        if (fromSel && (!bestYmd || fromSel > bestYmd)) bestYmd = fromSel;
        const lastVisitLabel = bestYmd ? new Date(bestYmd).toLocaleDateString(dateLocale) : '-';
        return { totalSpent, appointmentCount, lastVisitLabel };
    }, [selected, salesHistory, pastAppointments, dateLocale]);

    const historyColumns: ColumnsType<UnifiedHistoryRow> = useMemo(
        () => [
            {
                title: tm('bHistoryColDate'),
                key: 'when',
                width: 200,
                render: (_, row) => {
                    if (row.kind === 'appointment') {
                        const a = row.appointment;
                        return formatDateTime(a.appointment_date ?? a.date, a.appointment_time ?? a.time);
                    }
                    if (row.kind === 'sale') return formatIsoDateTime(row.sale.created_at);
                    return formatDate(row.purchase.purchase_date);
                },
            },
            {
                title: tm('bHistoryColType'),
                key: 'typ',
                width: 120,
                render: (_, row) => {
                    const label =
                        row.kind === 'appointment'
                            ? tm('bHistoryTypeAppointment')
                            : row.kind === 'sale'
                              ? tm('bHistoryTypeSale')
                              : tm('bHistoryTypePackage');
                    const color =
                        row.kind === 'appointment' ? 'purple' : row.kind === 'sale' ? 'blue' : 'geekblue';
                    return <Tag color={color}>{label}</Tag>;
                },
            },
            {
                title: tm('bHistoryColDescription'),
                key: 'desc',
                ellipsis: true,
                render: (_, row) => {
                    if (row.kind === 'appointment') {
                        return row.appointment.service_name ?? '—';
                    }
                    if (row.kind === 'sale') {
                        const s = row.sale;
                        const inv = s.invoice_number ? `${s.invoice_number} · ` : '';
                        return `${inv}${formatCurrency(s.total)}`;
                    }
                    const p = row.purchase;
                    return `${p.package_name ?? tm('bPackage')} · ${p.used_sessions}/${p.total_sessions} ${tm('bSessions')}`;
                },
            },
            {
                title: tm('bHistoryColDetails'),
                key: 'det',
                ellipsis: true,
                render: (_, row) => {
                    if (row.kind === 'appointment') {
                        const a = row.appointment;
                        return `${aptStatusLabel(String(a.status))} · ${a.specialist_name ?? '—'}`;
                    }
                    if (row.kind === 'sale') {
                        const s = row.sale;
                        return `${paymentMethodLabel(String(s.payment_method ?? ''))} · ${paymentStatusLabel(String(s.payment_status))}`;
                    }
                    const p = row.purchase;
                    const isExpired = p.expiry_date && new Date(p.expiry_date) < new Date();
                    const st = isExpired
                        ? tm('bExpired')
                        : p.status === 'active'
                          ? tm('bStatusActive')
                          : tm('bConsumed');
                    return `${tm('bExpiry')}: ${p.expiry_date ? formatDate(p.expiry_date) : '—'} · ${st}`;
                },
            },
        ],
        [tm, formatDate, formatDateTime, formatIsoDateTime, formatCurrency, paymentMethodLabel, paymentStatusLabel, aptStatusLabel],
    );

    const leadColumns: ColumnsType<BeautyLead> = useMemo(
        () => [
            { title: tm('bCustomerHeader'), dataIndex: 'name', key: 'n' },
            {
                title: tm('bLeadSource'),
                key: 'src',
                render: (_, r) => String(r.source),
            },
            {
                title: tm('bStatus'),
                key: 'st',
                render: (_, r) => String(r.status),
            },
            {
                title: tm('bDate'),
                key: 'd',
                render: (_, r) => formatDate(r.first_contact_date),
            },
        ],
        [tm, formatDate],
    );

    const paymentColumns: ColumnsType<BeautySale> = useMemo(
        () => [
            {
                title: tm('price'),
                key: 'tot',
                width: 120,
                align: 'right' as const,
                render: (_, r) => <Typography.Text strong>{formatCurrency(r.total)}</Typography.Text>,
            },
            {
                title: tm('bPaymentMethod'),
                dataIndex: 'payment_method',
                width: 120,
                render: (v: string) => paymentMethodLabel(String(v ?? '')),
            },
            {
                title: tm('bDate'),
                key: 'c',
                width: 120,
                render: (_, r) => formatDate(r.created_at),
            },
            {
                title: tm('status'),
                key: 'ps',
                width: 100,
                render: (_, r) => (
                    <Tag color={r.payment_status === 'paid' ? 'success' : 'warning'}>{paymentStatusLabel(String(r.payment_status))}</Tag>
                ),
            },
            {
                title: tm('bSaleInvoice'),
                dataIndex: 'invoice_number',
                ellipsis: true,
            },
        ],
        [tm, formatDate, formatCurrency, paymentMethodLabel, paymentStatusLabel],
    );

    const pkgColumns: ColumnsType<BeautyPackagePurchase> = useMemo(
        () => [
            {
                title: tm('bPackage'),
                key: 'nm',
                render: (_, pp) => pp.package_name ?? tm('bPackage'),
            },
            {
                title: tm('bSessions'),
                key: 'sess',
                width: 120,
                render: (_, pp) => `${pp.used_sessions}/${pp.total_sessions}`,
            },
            {
                title: tm('bExpiry'),
                key: 'ex',
                width: 120,
                render: (_, pp) => (pp.expiry_date ? formatDate(pp.expiry_date) : '—'),
            },
            {
                title: tm('status'),
                key: 'st',
                width: 110,
                render: (_, pp) => {
                    const isExpired = pp.expiry_date && new Date(pp.expiry_date) < new Date();
                    return (
                        <Tag color={isExpired ? 'error' : pp.status === 'active' ? 'success' : 'default'}>
                            {isExpired ? tm('bExpired') : pp.status === 'active' ? tm('bStatusActive') : tm('bConsumed')}
                        </Tag>
                    );
                },
            },
            {
                title: '',
                key: 'prog',
                width: 160,
                render: (_, pp) => {
                    const usedPct = pp.total_sessions > 0 ? (pp.used_sessions / pp.total_sessions) * 100 : 0;
                    return <Progress percent={Math.min(usedPct, 100)} size="small" showInfo={false} />;
                },
            },
        ],
        [tm, formatDate],
    );

    const tabItems = selected
        ? [
              {
                  key: 'overview',
                  label: (
                      <span>
                          <CalendarOutlined /> {tm('bTabOverview')}
                      </span>
                  ),
                  children: (
                      <Space direction="vertical" size={16} className="w-full">
                          {selected.last_service_name && (
                              <Card size="small" bordered className="!shadow-none" title={tm('bLastService')}>
                                  <Space>
                                      <CalendarOutlined className="text-[#722ed1]" />
                                      <div>
                                          <Typography.Text strong>{selected.last_service_name}</Typography.Text>
                                          <div>
                                              <Typography.Text type="secondary" className="text-xs">
                                                  {formatDate(selected.last_appointment_date)}
                                              </Typography.Text>
                                          </div>
                                      </div>
                                  </Space>
                              </Card>
                          )}
                          <Card
                              bordered
                              className="!shadow-none"
                              title={
                                  <Space>
                                      <span>{tm('bPackages')}</span>
                                      {customerPackages.length > 0 ? (
                                          <Tag color="purple">{customerPackages.length}</Tag>
                                      ) : null}
                                  </Space>
                              }
                              extra={
                                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setShowPkgModal(true)}>
                                      {tm('bSellPackage')}
                                  </Button>
                              }
                          >
                              <Table<BeautyPackagePurchase>
                                  size="small"
                                  bordered
                                  rowKey="id"
                                  loading={pkgLoading}
                                  columns={pkgColumns}
                                  dataSource={customerPackages}
                                  pagination={false}
                                  locale={{ emptyText: tm('bNoPackagesForCustomer') }}
                              />
                          </Card>
                      </Space>
                  ),
              },
              {
                  key: 'appointments',
                  label: (
                      <span>
                          <HistoryOutlined /> {tm('bTabCustomerHistory')}
                      </span>
                  ),
                  children: (
                      <Card bordered className="!shadow-none" styles={{ body: { padding: 0 } }}>
                          <Table<UnifiedHistoryRow>
                              size="middle"
                              bordered
                              rowKey="key"
                              loading={histLoading || pkgLoading}
                              columns={historyColumns}
                              dataSource={unifiedCustomerHistory}
                              pagination={{ pageSize: 10, showSizeChanger: true }}
                              locale={{ emptyText: tm('bEmptyHistorySection') }}
                          />
                      </Card>
                  ),
              },
              {
                  key: 'crm',
                  label: (
                      <span>
                          <SolutionOutlined /> {tm('bTabCRMLeads')}
                      </span>
                  ),
                  children: (
                      <Card bordered className="!shadow-none" styles={{ body: { padding: 0 } }}>
                          <Table<BeautyLead>
                              size="middle"
                              bordered
                              rowKey="id"
                              loading={histLoading}
                              columns={leadColumns}
                              dataSource={leadRecords}
                              pagination={{ pageSize: 10, showSizeChanger: true }}
                              locale={{ emptyText: tm('bEmptyHistorySection') }}
                          />
                      </Card>
                  ),
              },
              {
                  key: 'feedback',
                  label: (
                      <span>
                          <CommentOutlined /> {tm('bTabFeedbacks')}
                      </span>
                  ),
                  children: (
                      <Card bordered className="!shadow-none">
                          {histLoading ? (
                              <Typography.Text type="secondary">{tm('bLoading')}</Typography.Text>
                          ) : feedbacks.length === 0 ? (
                              <Typography.Text type="secondary">{tm('bEmptyHistorySection')}</Typography.Text>
                          ) : (
                              <Space direction="vertical" size="middle" className="w-full">
                                  {feedbacks.map(fb => (
                                      <Card key={fb.id} size="small" bordered className="!shadow-none bg-[#fafafa]">
                                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                              <Typography.Text strong>
                                                  {fb.survey_answers && fb.survey_answers.length > 0
                                                      ? tm('bSurveyFeedbackRecorded')
                                                      : `★ ${fb.overall_rating}/5 · ${tm('bFeedbackService')} ${fb.service_rating}`}
                                              </Typography.Text>
                                              <Typography.Text type="secondary" className="text-xs">
                                                  {formatDate(fb.created_at)}
                                              </Typography.Text>
                                          </div>
                                          {fb.survey_answers && fb.survey_answers.length > 0 ? (
                                              <Space direction="vertical" size="small" className="w-full">
                                                  {fb.survey_answers.map((a, i) => (
                                                      <div key={i} className="border-l-2 border-[#d3adf7] pl-2 text-sm">
                                                          <div className="font-medium">{a.label_snapshot ?? a.question_id}</div>
                                                          {a.rating != null && <div className="text-[#595959]">★ {a.rating}</div>}
                                                          {a.text != null && a.text !== '' && (
                                                              <div className="whitespace-pre-wrap text-[#595959]">{a.text}</div>
                                                          )}
                                                          {a.yes_no != null && (
                                                              <div className="text-[#595959]">
                                                                  {a.yes_no ? tm('bSurveyYes') : tm('bSurveyNo')}
                                                              </div>
                                                          )}
                                                      </div>
                                                  ))}
                                              </Space>
                                          ) : (
                                              <Typography.Text type="secondary" className="text-sm">
                                                  {tm('bFeedbackService')} {fb.service_rating} · {tm('bSpecialist')} {fb.staff_rating} ·{' '}
                                                  {tm('bFeedbackGeneral')} {fb.overall_rating}
                                              </Typography.Text>
                                          )}
                                          {fb.comment && (
                                              <Typography.Paragraph className="mb-0 mt-2 border-t border-[#f0f0f0] pt-2 text-sm">
                                                  {fb.comment}
                                              </Typography.Paragraph>
                                          )}
                                      </Card>
                                  ))}
                              </Space>
                          )}
                      </Card>
                  ),
              },
              {
                  key: 'payments',
                  label: (
                      <span>
                          <AccountBookOutlined /> {tm('bTabPaymentHistory')}
                      </span>
                  ),
                  children: (
                      <Card bordered className="!shadow-none" styles={{ body: { padding: 0 } }}>
                          <Table<BeautySale>
                              size="middle"
                              bordered
                              rowKey="id"
                              loading={histLoading}
                              columns={paymentColumns}
                              dataSource={salesHistory}
                              pagination={{ pageSize: 10, showSizeChanger: true }}
                              expandable={{
                                  expandedRowRender: sale =>
                                      sale.items && sale.items.length > 0 ? (
                                          <Typography.Text type="secondary" className="text-xs">
                                              {sale.items.map(i => i.name).filter(Boolean).join(', ')}
                                          </Typography.Text>
                                      ) : null,
                                  rowExpandable: sale => !!(sale.items && sale.items.length),
                              }}
                              locale={{ emptyText: tm('bEmptyHistorySection') }}
                          />
                      </Card>
                  ),
              },
              {
                  key: 'health',
                  label: (
                      <span>
                          <HeartOutlined /> {tm('bHealthTab')}
                      </span>
                  ),
                  children: (
                      <Card bordered className="!shadow-none">
                          {healthForm.warnings_banner && (
                              <Alert type="warning" showIcon className="mb-4" message={healthForm.warnings_banner} />
                          )}
                          <Space direction="vertical" size="middle" className="w-full">
                              <div>
                                  <Typography.Text type="secondary" className="mb-1 block text-xs">
                                      {tm('bHealthAllergies')}
                                  </Typography.Text>
                                  <Input.TextArea
                                      rows={2}
                                      value={healthForm.allergies ?? ''}
                                      onChange={e => setHealthForm(f => ({ ...f, allergies: e.target.value }))}
                                  />
                              </div>
                              <div>
                                  <Typography.Text type="secondary" className="mb-1 block text-xs">
                                      {tm('bHealthMedications')}
                                  </Typography.Text>
                                  <Input.TextArea
                                      rows={2}
                                      value={healthForm.medications ?? ''}
                                      onChange={e => setHealthForm(f => ({ ...f, medications: e.target.value }))}
                                  />
                              </div>
                              <Checkbox
                                  checked={!!healthForm.pregnancy}
                                  onChange={e => setHealthForm(f => ({ ...f, pregnancy: e.target.checked }))}
                              >
                                  {tm('bHealthPregnancy')}
                              </Checkbox>
                              <div>
                                  <Typography.Text type="secondary" className="mb-1 block text-xs">
                                      {tm('bHealthChronicNotes')}
                                  </Typography.Text>
                                  <Input.TextArea
                                      rows={2}
                                      value={healthForm.chronic_notes ?? ''}
                                      onChange={e => setHealthForm(f => ({ ...f, chronic_notes: e.target.value }))}
                                  />
                              </div>
                              <div>
                                  <Typography.Text type="secondary" className="mb-1 block text-xs">
                                      {tm('bHealthWarningBannerLabel')}
                                  </Typography.Text>
                                  <Input.TextArea
                                      rows={2}
                                      value={healthForm.warnings_banner ?? ''}
                                      onChange={e => setHealthForm(f => ({ ...f, warnings_banner: e.target.value }))}
                                      placeholder={tm('bHealthWarningBannerPlaceholder')}
                                  />
                              </div>
                              <Button
                                  type="primary"
                                  loading={healthSaving}
                                  onClick={async () => {
                                      if (!selected) return;
                                      setHealthSaving(true);
                                      try {
                                          await beautyService.saveCustomerHealth(selected.id, {
                                              ...healthForm,
                                              kvkk_consent_at: healthForm.kvkk_consent_at ?? new Date().toISOString(),
                                          });
                                          toast.success(tm('operationSavedSuccessfully'));
                                      } finally {
                                          setHealthSaving(false);
                                      }
                                  }}
                              >
                                  {tm('save')}
                              </Button>
                          </Space>
                      </Card>
                  ),
              },
          ]
        : [];

    return (
            <div className="flex min-h-0 w-full flex-col" style={{ backgroundColor: RETAILEX_PAGE_BG }}>
                <div
                    className="sticky top-0 z-20 shrink-0 border-b bg-white px-4 py-3"
                    style={{ borderColor: RETAILEX_BORDER_SUBTLE }}
                >
                    <Space wrap className="w-full">
                        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
                            {tm('bShellNavClients')}
                        </Button>
                        {selected && (
                            <Typography.Text strong style={{ color: RETAILEX_TEXT_PRIMARY }}>
                                {selected.name}
                            </Typography.Text>
                        )}
                    </Space>
                </div>

                {showLoader && (
                    <div className="flex flex-1 items-center justify-center py-24 text-[#8c8c8c]">{tm('bLoading')}</div>
                )}

                {showMissing && (
                    <div className="flex flex-col items-center gap-4 py-16">
                        <Typography.Text type="secondary">{tm('bNoCustomerResults')}</Typography.Text>
                        <Button onClick={onBack}>{tm('bShellNavClients')}</Button>
                    </div>
                )}

                {selected && (
                    <div className="w-full px-4 pb-4 pt-2">
                        <Space direction="vertical" size={16} className="w-full">
                            <Card bordered className="!shadow-none">
                                <Space align="start" size={16} wrap className="w-full">
                                    <Avatar
                                        size={64}
                                        style={{
                                            background: '#fafafa',
                                            color: '#595959',
                                            border: '1px solid #d9d9d9',
                                            fontWeight: 700,
                                        }}
                                    >
                                        {initials(selected.name)}
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <Space wrap size={8}>
                                            <Typography.Title level={4} className="!mb-1 !text-lg">
                                                {selected.name}
                                            </Typography.Title>
                                            {(selected.points ?? 0) >= 1000 && <Tag color="gold">{tm('bVipCustomer')}</Tag>}
                                        </Space>
                                        {selected.code && (
                                            <Typography.Text type="secondary" className="text-sm">
                                                #{selected.code}
                                            </Typography.Text>
                                        )}
                                    </div>
                                    <Button type="default" icon={<EditOutlined />} onClick={() => openEdit(selected)}>
                                        {tm('bEditInfo')}
                                    </Button>
                                </Space>

                                <Descriptions
                                    bordered
                                    size="small"
                                    column={{ xs: 1, sm: 2, md: 3 }}
                                    className="mt-4"
                                    items={[
                                        {
                                            key: 'phone',
                                            label: (
                                                <Space>
                                                    <PhoneOutlined /> {tm('bPhone')}
                                                </Space>
                                            ),
                                            children: selected.phone || '—',
                                        },
                                        {
                                            key: 'email',
                                            label: (
                                                <Space>
                                                    <MailOutlined /> {tm('bEmail')}
                                                </Space>
                                            ),
                                            children: selected.email || '—',
                                        },
                                        {
                                            key: 'city',
                                            label: (
                                                <Space>
                                                    <EnvironmentOutlined /> {tm('bCity')}
                                                </Space>
                                            ),
                                            children: selected.city || '—',
                                        },
                                        {
                                            key: 'balance',
                                            label: (
                                                <Space>
                                                    <AccountBookOutlined /> {tm('bBalance')}
                                                </Space>
                                            ),
                                            children: formatCurrency(selected.balance ?? 0),
                                        },
                                    ]}
                                />

                                <Row gutter={[16, 16]} className="mt-4">
                                    <Col xs={24} sm={12} lg={6}>
                                        <Card size="small" bordered className="!shadow-none h-full">
                                            <Statistic
                                                title={tm('bLoyaltyPoints')}
                                                value={selected.points ?? 0}
                                                prefix={<StarOutlined className="text-amber-500" />}
                                            />
                                        </Card>
                                    </Col>
                                    <Col xs={24} sm={12} lg={6}>
                                        <Card size="small" bordered className="!shadow-none h-full">
                                            <Statistic
                                                title={tm('bTotalSpent')}
                                                value={formatCurrency(profileStats.totalSpent)}
                                                prefix={<CreditCardOutlined className="text-[#722ed1]" />}
                                            />
                                        </Card>
                                    </Col>
                                    <Col xs={24} sm={12} lg={6}>
                                        <Card size="small" bordered className="!shadow-none h-full">
                                            <Statistic
                                                title={tm('bAppointmentCountLabel')}
                                                value={profileStats.appointmentCount}
                                                prefix={<RiseOutlined className="text-green-600" />}
                                            />
                                        </Card>
                                    </Col>
                                    <Col xs={24} sm={12} lg={6}>
                                        <Card size="small" bordered className="!shadow-none h-full">
                                            <Statistic
                                                title={tm('bLastVisit')}
                                                value={profileStats.lastVisitLabel}
                                                prefix={<CalendarOutlined className="text-[#1677ff]" />}
                                            />
                                        </Card>
                                    </Col>
                                </Row>

                                {selected.notes && (
                                    <Alert
                                        className="mt-4"
                                        type="info"
                                        showIcon
                                        icon={<FileTextOutlined />}
                                        message={tm('bNotes')}
                                        description={<span className="whitespace-pre-wrap">{selected.notes}</span>}
                                    />
                                )}
                            </Card>

                            <Tabs activeKey={detailTab} onChange={k => setDetailTab(k as typeof detailTab)} items={tabItems} />
                        </Space>
                    </div>
                )}

                <RetailExFlatModal
                    open={showPkgModal}
                    onClose={() => {
                        setShowPkgModal(false);
                        setSelectedPkg('');
                    }}
                    title={tm('bSellPackage')}
                    subtitle={selected?.name}
                    headerIcon={<Package className="h-5 w-5" aria-hidden />}
                    cancelLabel={tm('cancel')}
                    confirmLabel={pkgBuying ? tm('bSaving') : tm('bConfirmSale')}
                    confirmLoading={pkgBuying}
                    confirmDisabled={!selectedPkg}
                    onConfirm={handleBuyPackage}
                >
                    {packages.length === 0 ? (
                        <Typography.Text type="secondary">{tm('bNoPackagesDefined')}</Typography.Text>
                    ) : (
                        <Space direction="vertical" className="w-full">
                            {packages.map(pkg => {
                                const fp = pkg.price * (1 - (pkg.discount_pct ?? 0) / 100);
                                const active = selectedPkg === pkg.id;
                                return (
                                    <Card
                                        key={pkg.id}
                                        size="small"
                                        bordered
                                        className="!shadow-none cursor-pointer transition-colors"
                                        style={
                                            active
                                                ? {
                                                      borderColor: RETAILEX_PRIMARY,
                                                      background: '#f9f0ff',
                                                  }
                                                : undefined
                                        }
                                        onClick={() => setSelectedPkg(pkg.id)}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <Typography.Text strong>{pkg.name}</Typography.Text>
                                                <div>
                                                    <Typography.Text type="secondary" className="text-xs">
                                                        {pkg.total_sessions} {tm('bSessions')} · {pkg.validity_days}{' '}
                                                        {tm('bValidDaysLabel')}
                                                    </Typography.Text>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <Typography.Text strong style={{ color: RETAILEX_PRIMARY }}>
                                                    {formatCurrency(fp)}
                                                </Typography.Text>
                                                {(pkg.discount_pct ?? 0) > 0 && (
                                                    <div>
                                                        <Typography.Text delete type="secondary" className="text-xs">
                                                            {formatCurrency(pkg.price)}
                                                        </Typography.Text>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {active && <CheckCircleOutlined className="mt-2" style={{ color: RETAILEX_PRIMARY }} />}
                                    </Card>
                                );
                            })}
                        </Space>
                    )}
                </RetailExFlatModal>

                <RetailExFlatModal
                    open={showModal}
                    onClose={() => setShowModal(false)}
                    title={isEdit ? tm('bEditCustomer') : tm('bNewCustomer')}
                    headerIcon={<User className="h-5 w-5" aria-hidden />}
                    cancelLabel={tm('cancel')}
                    confirmLabel={saving ? tm('bSaving') : tm('save')}
                    confirmLoading={saving}
                    onConfirm={async () => {
                        try {
                            await handleSave();
                        } catch {
                            /* handled */
                        }
                    }}
                >
                    <div className="flex w-full flex-col gap-4">
                        <div>
                            <RetailExFlatFieldLabel required>{tm('bCustomerName')}</RetailExFlatFieldLabel>
                            <Input
                                className="!rounded-2xl !px-4 !py-2.5"
                                value={editing.name ?? ''}
                                onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                                placeholder={tm('bCustomerNamePlaceholder')}
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <RetailExFlatFieldLabel>{tm('bPhone')}</RetailExFlatFieldLabel>
                                <Input
                                    className="!rounded-2xl !px-4 !py-2.5"
                                    value={editing.phone ?? ''}
                                    onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))}
                                    placeholder={tm('bPlaceholderPhoneExample')}
                                />
                            </div>
                            <div>
                                <RetailExFlatFieldLabel>{tm('bCity')}</RetailExFlatFieldLabel>
                                <Input
                                    className="!rounded-2xl !px-4 !py-2.5"
                                    value={editing.city ?? ''}
                                    onChange={e => setEditing(p => ({ ...p, city: e.target.value }))}
                                    placeholder={tm('bPlaceholderCity')}
                                />
                            </div>
                        </div>
                        <div>
                            <RetailExFlatFieldLabel>{tm('bEmail')}</RetailExFlatFieldLabel>
                            <Input
                                className="!rounded-2xl !px-4 !py-2.5"
                                type="email"
                                value={editing.email ?? ''}
                                onChange={e => setEditing(p => ({ ...p, email: e.target.value }))}
                                placeholder={tm('bPlaceholderEmailExample')}
                            />
                        </div>
                        <div>
                            <RetailExFlatFieldLabel>{tm('bAddress')}</RetailExFlatFieldLabel>
                            <Input
                                className="!rounded-2xl !px-4 !py-2.5"
                                value={editing.address ?? ''}
                                onChange={e => setEditing(p => ({ ...p, address: e.target.value }))}
                                placeholder={tm('bPlaceholderAddress')}
                            />
                        </div>
                        <div>
                            <RetailExFlatFieldLabel>{tm('bNotes')}</RetailExFlatFieldLabel>
                            <Input.TextArea
                                className="!rounded-2xl !px-4 !py-2.5"
                                value={editing.notes ?? ''}
                                onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))}
                                placeholder={tm('bFeedbackComment')}
                                rows={3}
                            />
                        </div>
                    </div>
                </RetailExFlatModal>
            </div>
    );
}
