import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Space, Typography, Avatar, Tag } from 'antd';
import {
    RETAILEX_BORDER_SUBTLE,
    RETAILEX_PAGE_BG,
    RETAILEX_PRIMARY,
    RETAILEX_TEXT_PRIMARY,
} from '../../../theme/retailexAntdTheme';
import { ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { phoneMatchesQuery } from '../../../shared/utils/validators';
import { PlusOutlined, UserOutlined } from '@ant-design/icons';
import { Edit, Phone, Mail, Search, User } from 'lucide-react';
import { RetailExFlatModal } from '../../shared/RetailExFlatModal';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { useBeautyStore } from '../store/useBeautyStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import type { BeautyCustomer } from '../../../types/beauty';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { fetchCurrentAccounts } from '../../../services/api/currentAccounts';
import { ERP_SETTINGS } from '../../../services/postgres';
import { beautyService } from '../../../services/beautyService';
import { toast } from 'sonner';
import {
    BEAUTY_CUSTOMER_EMPTY_FORM,
    BeautyCustomerEditFormFields,
} from './BeautyCustomerEditFormFields';
import { CustomerFileIdDuplicatesPanel } from './CustomerFileIdDuplicatesPanel';
import { CustomerPhoneDuplicatesPanel } from './CustomerPhoneDuplicatesPanel';
import {
    buildFileIdRangeOptions,
    compareFileIdAsc,
    fileIdInRange,
    parseFileIdNumber,
    sortByFileIdAsc,
    type FileIdRangeKey,
} from '../../../utils/customerFileIdSort';
import {
    findActiveCustomersByPhones,
    PhoneAlreadyRegisteredError,
    type PhoneMatchCustomer,
} from '../../../utils/customerPhoneDuplicate';
import { phoneQueryDigits } from '../../../shared/utils/validators';

export type ClientCRMProps = { onOpenCustomer: (customerId: string) => void };

const columnHelper = createColumnHelper<BeautyCustomer>();

export function ClientCRM({ onOpenCustomer }: ClientCRMProps) {
    const { customers, isLoading, loadCustomers, createCustomer, updateCustomer } = useBeautyStore();
    const { tm } = useLanguage();
    const [search, setSearch] = useState('');
    const [fileIdRange, setFileIdRange] = useState<FileIdRangeKey>('all');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyCustomer>>(BEAUTY_CUSTOMER_EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [phoneDupMatches, setPhoneDupMatches] = useState<PhoneMatchCustomer[] | null>(null);
    const [currentAccountCustomers, setCurrentAccountCustomers] = useState<BeautyCustomer[]>([]);

    useEffect(() => {
        void (async () => {
            try {
                const { repairCariLedgerConsistency } = await import(
                    '../../../services/api/accountLedgerRepair'
                );
                await repairCariLedgerConsistency().catch(() => {
                    /* sessiz — liste yine defter bakiyesi ile güncellenir */
                });
                await loadCustomers();
                const accounts = await fetchCurrentAccounts(ERP_SETTINGS.firmNr, 'MUSTERI');
                setCurrentAccountCustomers(
                    accounts
                        .filter(a => a.tip === 'MUSTERI' || a.tip === 'HER_IKISI')
                        .map(a => ({
                            id: a.id,
                            code: a.kod,
                            name: a.unvan,
                            phone: a.telefon,
                            email: a.email,
                            address: a.adres,
                            is_active: a.aktif,
                            balance: a.bakiye,
                            created_at: a.created_at,
                        } as BeautyCustomer))
                );
            } catch (e) {
                logger.error('ClientCRM', 'fetchCurrentAccounts failed', e);
            }
        })();
    }, [loadCustomers]);

    const mergedCustomers = useMemo(() => {
        const map = new Map<string, BeautyCustomer>();
        for (const c of customers) map.set(c.id, c);
        for (const c of currentAccountCustomers) {
            const existing = map.get(c.id);
            if (existing) {
                map.set(c.id, { ...existing, balance: c.balance });
            } else {
                map.set(c.id, c);
            }
        }
        return sortByFileIdAsc(Array.from(map.values()));
    }, [customers, currentAccountCustomers]);

    const fileIdRangeOptions = useMemo(() => {
        let max = 0;
        for (const c of mergedCustomers) {
            const n = parseFileIdNumber(c.file_id);
            if (n != null && n > max) max = n;
        }
        return buildFileIdRangeOptions(max, 100, tm('bFileIdRangeAll'));
    }, [mergedCustomers, tm]);

    useEffect(() => {
        if (!fileIdRangeOptions.some(o => o.key === fileIdRange)) {
            setFileIdRange('all');
        }
    }, [fileIdRangeOptions, fileIdRange]);

    const activeFileRange = useMemo(
        () => fileIdRangeOptions.find(o => o.key === fileIdRange) ?? fileIdRangeOptions[0],
        [fileIdRangeOptions, fileIdRange],
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const trimmed = search.trim();
        return mergedCustomers.filter(c => {
            if (!fileIdInRange(c.file_id, activeFileRange?.from ?? null, activeFileRange?.to ?? null)) {
                return false;
            }
            if (!q) return true;
            const textHit =
                c.name?.toLowerCase().includes(q) ||
                c.email?.toLowerCase().includes(q) ||
                (c.code ?? '').toLowerCase().includes(q) ||
                (c.file_id ?? '').toLowerCase().includes(q);
            if (textHit) return true;
            return (
                phoneMatchesQuery(c.phone, trimmed) ||
                phoneMatchesQuery(c.phone2, trimmed)
            );
        });
    }, [mergedCustomers, search, activeFileRange]);

    const openCreate = () => {
        setEditing(BEAUTY_CUSTOMER_EMPTY_FORM);
        setIsEdit(false);
        setShowModal(true);
        void beautyService.generateNextFileId().then(next => {
            setEditing(p => ({ ...p, file_id: p.file_id?.trim() ? p.file_id : next }));
        }).catch(() => { /* no-op */ });
    };

    const openEdit = (c: BeautyCustomer) => {
        setEditing({
            ...BEAUTY_CUSTOMER_EMPTY_FORM,
            ...c,
            file_id: c.file_id ?? '',
            phone2: c.phone2 ?? '',
            occupation: c.occupation ?? '',
            heard_from: c.heard_from ?? '',
            age: c.age ?? null,
        });
        setIsEdit(true);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!editing.name?.trim()) {
            toast.error(tm('bFillNameToSave'));
            throw new Error('validation');
        }
        const phones = [editing.phone, editing.phone2];
        const hasPhone = phones.some(p => phoneQueryDigits(p).length >= 7);
        if (hasPhone) {
            try {
                const matches = await findActiveCustomersByPhones(
                    phones,
                    isEdit && editing.id ? editing.id : null,
                );
                if (matches.length > 0) {
                    setPhoneDupMatches(matches);
                    toast.error(tm('bPhoneAlreadyRegistered'));
                    throw new Error('validation');
                }
            } catch (e) {
                if (e instanceof Error && e.message === 'validation') throw e;
                if (e instanceof PhoneAlreadyRegisteredError) {
                    setPhoneDupMatches(e.matches);
                    toast.error(tm('bPhoneAlreadyRegistered'));
                    throw new Error('validation');
                }
                throw e;
            }
        }
        setSaving(true);
        try {
            if (isEdit && editing.id) {
                await updateCustomer(editing.id, editing);
            } else {
                await createCustomer(editing);
            }
            setShowModal(false);
            toast.success(tm('bSaveCustomerOk'));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg !== 'validation') {
                if (e instanceof PhoneAlreadyRegisteredError) {
                    setPhoneDupMatches(e.matches);
                    toast.error(tm('bPhoneAlreadyRegistered'));
                } else {
                    logger.error('ClientCRM', 'handleSave failed', e);
                    toast.error(tm('bSaveCustomerFailed'), { description: msg, duration: 8000 });
                }
            }
            throw e;
        } finally {
            setSaving(false);
        }
    };

    const formatDate = (d?: string) =>
        d ? new Date(d).toLocaleDateString(tm('localeCode') || 'tr-TR') : '-';

    const formatCurrency = (n?: number) =>
        formatMoneyAmount(n ?? 0, { minFrac: 0, maxFrac: 0 });

    const columns: ColumnDef<BeautyCustomer, any>[] = useMemo(
        () => [
            columnHelper.accessor('file_id', {
                header: tm('custColFileNo'),
                cell: info => {
                    const c = info.row.original;
                    const v = String(info.getValue() ?? '').trim();
                    const inactive = c.is_active === false;
                    return (
                        <span className="inline-flex items-center gap-1">
                            {v
                                ? (
                                    <span
                                        className={`font-mono text-xs font-semibold tabular-nums ${
                                            inactive ? 'text-gray-400' : 'text-violet-700'
                                        }`}
                                    >
                                        {v}
                                    </span>
                                )
                                : <span className="text-gray-300 text-xs">—</span>}
                        </span>
                    );
                },
                sortingFn: (rowA, rowB) =>
                    compareFileIdAsc(rowA.original.file_id, rowB.original.file_id),
                size: 110,
            }),
            columnHelper.accessor('name', {
                header: tm('bCustomerHeader'),
                cell: info => {
                    const c = info.row.original;
                    const vip = c.customer_tier === 'vip' || Number(c.points ?? 0) >= 1000;
                    const inactive = c.is_active === false;
                    const merged = Boolean(c.merged_into_id);
                    return (
                        <div className={`flex flex-col min-w-0 ${inactive ? 'opacity-80' : ''}`}>
                            <span className={`font-medium truncate ${inactive ? 'text-gray-500' : 'text-gray-900'}`}>
                                {c.name}
                                {vip && !inactive ? (
                                    <Tag color="gold" className="ml-1 align-middle text-[10px] leading-tight">
                                        {tm('bCustomerTierVip')}
                                    </Tag>
                                ) : null}
                                {inactive ? (
                                    <Tag
                                        color={merged ? 'purple' : 'default'}
                                        className="ml-1 align-middle text-[10px] leading-tight"
                                    >
                                        {merged ? tm('bCustomerMerged') : tm('bCustomerPassive')}
                                    </Tag>
                                ) : null}
                            </span>
                            {c.balance != null && Number(c.balance) !== 0 ? (
                                <span className="text-xs text-gray-500">
                                    {tm('bBalance')}: {formatCurrency(c.balance)}
                                </span>
                            ) : null}
                        </div>
                    );
                },
            }),
            columnHelper.display({
                id: 'contact',
                header: tm('bContactHeader'),
                cell: ({ row }) => {
                    const c = row.original;
                    return (
                        <div className="flex flex-col gap-0.5 text-sm text-gray-700">
                            {c.phone ? (
                                <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                                    {c.phone}
                                </span>
                            ) : null}
                            {c.email ? (
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                    <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                                    <span className="truncate">{c.email}</span>
                                </span>
                            ) : null}
                            {!c.phone && !c.email ? <span className="text-gray-300 text-xs">—</span> : null}
                        </div>
                    );
                },
                size: 200,
                enableColumnFilter: false,
            }),
            columnHelper.accessor('last_service_name', {
                header: tm('bLastServiceHeader'),
                cell: info => {
                    const c = info.row.original;
                    return (
                        <div className="flex flex-col text-sm">
                            <span className="text-gray-800">{c.last_service_name ?? '—'}</span>
                            <span className="text-xs text-gray-500">{formatDate(c.last_appointment_date)}</span>
                        </div>
                    );
                },
                size: 180,
            }),
            columnHelper.accessor('appointment_count', {
                header: tm('bVisitsHeader'),
                cell: info => {
                    const n = Number(info.getValue() ?? 0);
                    return (
                        <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                                n > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                            }`}
                        >
                            {n} {tm('bAppointmentWord')}
                        </span>
                    );
                },
                size: 130,
                meta: { align: 'center' },
            }),
            columnHelper.display({
                id: 'actions',
                header: '',
                cell: ({ row }) => (
                    <button
                        type="button"
                        className="p-1.5 text-gray-400 hover:text-violet-700 hover:bg-violet-50 rounded transition-colors"
                        onClick={e => {
                            e.stopPropagation();
                            openEdit(row.original);
                        }}
                        aria-label={tm('bEditCustomer')}
                        title={tm('bEditCustomer')}
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                ),
                size: 56,
                enableColumnFilter: false,
                enableSorting: false,
            }),
        ],
        [tm],
    );

    return (
        <div className="flex min-h-0 w-full flex-col" style={{ backgroundColor: RETAILEX_PAGE_BG }}>
            <div className="w-full px-4 pb-4 pt-2 flex flex-col min-h-0">
                <Card
                    bordered
                    className="!shadow-none flex flex-col min-h-0"
                    styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 } }}
                >
                    <div
                        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 shrink-0"
                        style={{ borderColor: RETAILEX_BORDER_SUBTLE }}
                    >
                        <Space align="start" size={12}>
                            <Avatar
                                size={48}
                                icon={<UserOutlined />}
                                style={{
                                    background: RETAILEX_PAGE_BG,
                                    color: RETAILEX_PRIMARY,
                                    border: `1px solid ${RETAILEX_BORDER_SUBTLE}`,
                                }}
                            />
                            <div>
                                <Typography.Title
                                    level={5}
                                    className="!mb-0.5 !text-base !font-semibold"
                                    style={{ color: RETAILEX_TEXT_PRIMARY }}
                                >
                                    {tm('bClientCRM')}
                                </Typography.Title>
                                <Typography.Text type="secondary" className="text-xs">
                                    {isLoading
                                        ? tm('bLoading')
                                        : (() => {
                                              const passive = mergedCustomers.filter(c => c.is_active === false).length;
                                              const active = mergedCustomers.length - passive;
                                              return passive > 0
                                                  ? `${active} ${tm('bRegisteredCustomers')} · ${passive} ${tm('bCustomerPassiveCount')}`
                                                  : `${mergedCustomers.length} ${tm('bRegisteredCustomers')}`;
                                          })()}
                                </Typography.Text>
                            </div>
                        </Space>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                            {tm('bNewCustomer')}
                        </Button>
                    </div>

                    <CustomerFileIdDuplicatesPanel
                        customers={mergedCustomers}
                        onChanged={async () => {
                            await loadCustomers();
                        }}
                    />
                    <CustomerPhoneDuplicatesPanel
                        customers={mergedCustomers}
                        onChanged={async () => {
                            await loadCustomers();
                        }}
                        onOpenCustomer={onOpenCustomer}
                    />

                    <div
                        className="border-b px-4 py-3 shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center"
                        style={{ borderColor: RETAILEX_BORDER_SUBTLE }}
                    >
                        <div className="relative flex-1 min-w-0">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="search"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder={tm('bSearchPlaceholderCustomer')}
                                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-800 shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                                aria-label={tm('bSearchPlaceholderCustomer')}
                            />
                        </div>
                        <label className="flex items-center gap-2 shrink-0 text-xs text-gray-600">
                            <span className="whitespace-nowrap font-medium">{tm('bFileIdRangeLabel')}</span>
                            <select
                                value={fileIdRange}
                                onChange={e => setFileIdRange(e.target.value as FileIdRangeKey)}
                                className="min-w-[9.5rem] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                                aria-label={tm('bFileIdRangeLabel')}
                            >
                                {fileIdRangeOptions.map(o => (
                                    <option key={o.key} value={o.key}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="flex-1 min-h-0 px-2 pb-2 pt-1" style={{ minHeight: '28rem' }}>
                        <DevExDataGrid
                            data={filtered}
                            columns={columns}
                            enableSorting
                            initialSorting={[{ id: 'file_id', desc: false }]}
                            enableFiltering
                            enablePagination
                            pageSize={100}
                            pageSizeOptions={[50, 100, 200]}
                            enableColumnResizing
                            enableExcelExport={false}
                            storageNamespace="beautyClientCrmList"
                            height="calc(100vh - 240px)"
                            onRefresh={() => loadCustomers()}
                            getRowClassName={row =>
                                row.is_active === false ? 'opacity-70 bg-gray-50' : undefined
                            }
                            onRowClick={row => {
                                if (row.id) onOpenCustomer(row.id);
                            }}
                            onRowDoubleClick={row => {
                                if (row.id) onOpenCustomer(row.id);
                            }}
                        />
                    </div>
                </Card>
            </div>

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
                            /* toast / validation */
                        }
                    }}
                >
                    <BeautyCustomerEditFormFields
                        value={editing}
                        onChange={setEditing}
                        summary={
                            isEdit
                                ? {
                                      appointmentCount: editing.appointment_count ?? 0,
                                      lastServiceName: editing.last_service_name,
                                      lastAppointmentDate: editing.last_appointment_date,
                                  }
                                : undefined
                        }
                    />
                </RetailExFlatModal>

                {phoneDupMatches && phoneDupMatches.length > 0 && (
                    <PercentBodyModal
                        onClose={() => setPhoneDupMatches(null)}
                        size="list"
                        ariaLabel={tm('bPhoneAlreadyRegistered')}
                    >
                        <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-4 text-white shrink-0">
                            <h3 className="text-lg font-bold">{tm('bPhoneAlreadyRegistered')}</h3>
                            <p className="text-sm text-amber-100 mt-1">{tm('bPhoneAlreadyRegisteredHint')}</p>
                        </div>
                        <PercentBodyModalScrollBody className="p-4 space-y-2">
                            {phoneDupMatches.map(m => (
                                <button
                                    key={m.id}
                                    type="button"
                                    className="w-full text-left rounded-xl border border-gray-200 px-4 py-3 hover:border-violet-400 hover:bg-violet-50 transition-colors"
                                    onClick={() => {
                                        setPhoneDupMatches(null);
                                        setShowModal(false);
                                        onOpenCustomer(m.id);
                                    }}
                                >
                                    <div className="font-semibold text-gray-900">{m.name}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {m.file_id ? `${tm('custColFileNo')}: ${m.file_id}` : null}
                                        {m.file_id && m.phone ? ' · ' : null}
                                        {m.phone || m.phone2 || ''}
                                    </div>
                                    <div className="text-[11px] font-bold uppercase tracking-wide text-violet-700 mt-2">
                                        {tm('bPhoneSelectExisting')}
                                    </div>
                                </button>
                            ))}
                        </PercentBodyModalScrollBody>
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
                            <button
                                type="button"
                                onClick={() => setPhoneDupMatches(null)}
                                className="w-full rounded-2xl border-2 border-slate-200 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                            >
                                {tm('cancel')}
                            </button>
                        </div>
                    </PercentBodyModal>
                )}
            </div>
    );
}
