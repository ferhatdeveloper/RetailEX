import React, { useEffect, useMemo, useState } from 'react';
import {
    Table,
    Input,
    Button,
    Card,
    Space,
    Typography,
    Select,
    InputNumber,
    Checkbox,
    Popconfirm,
    Tag,
    Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ClockCircleOutlined,
    ScissorOutlined,
    FormOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import { Scissors } from 'lucide-react';
import { RetailExFlatModal, RetailExFlatFieldLabel } from '../../shared/RetailExFlatModal';
import { useBeautyStore } from '../store/useBeautyStore';
import { BeautyService, ServiceCategory } from '../../../types/beauty';
import { beautyServiceMainKey, beautyServiceSubKey } from '../beautyServiceCategoryUtils';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { useLanguage } from '../../../contexts/LanguageContext';
import { toast } from 'sonner';
import { beautyService } from '../../../services/beautyService';
import { categoryAPI, type Category } from '../../../services/api/masterData';
import {
    RETAILEX_BORDER_SUBTLE,
    RETAILEX_PAGE_BG,
    RETAILEX_PRIMARY,
    RETAILEX_TEXT_PRIMARY,
} from '../../../theme/retailexAntdTheme';

/** RetailExFlatModal z≈2147483646; antd Select varsayılan popup daha altta kalıyor */
const ANT_SELECT_POPUP_Z = 2147483647;
const antSelectInFlatModal = {
    getPopupContainer: () => document.body,
    styles: { popup: { root: { zIndex: ANT_SELECT_POPUP_Z } as React.CSSProperties } },
} as const;

const CATEGORY_LABELS: Record<string, string> = {
    laser: 'Lazer',
    hair_salon: 'Kuaför',
    beauty: 'Güzellik',
    hair_transplant: 'Saç Ekimi',
    botox: 'Botoks',
    filler: 'Dolgu',
    physical_therapy: 'Fizyoterapi',
    massage: 'Masaj',
    skincare: 'Cilt Bakımı',
    makeup: 'Makyaj',
    nails: 'Tırnak',
    spa: 'Spa',
};

const EMPTY_FORM: Partial<BeautyService> = {
    name: '',
    category: ServiceCategory.BEAUTY,
    parent_category: undefined,
    duration_min: 60,
    price: 0,
    cost_price: 0,
    commission_rate: 0,
    color: '#722ed1',
    description: '',
    requires_device: false,
    default_sessions: 1,
    follow_up_reminder_days: undefined,
    is_active: true,
};

export function ServiceManagement() {
    const { services, isLoading, loadServices, createService, updateService, deleteService } = useBeautyStore();
    const { tm } = useLanguage();
    const [backofficeCategories, setBackofficeCategories] = useState<Category[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const [bulkUpdateModalOpen, setBulkUpdateModalOpen] = useState(false);
    const [bulkUpdateDuration, setBulkUpdateDuration] = useState(60);
    const [bulkUpdateSessions, setBulkUpdateSessions] = useState(1);
    const [bulkUpdateSaving, setBulkUpdateSaving] = useState(false);
    const [selectedMain, setSelectedMain] = useState<string>('all');
    const [selectedSub, setSelectedSub] = useState<string>('all');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyService>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadServices();
    }, []);

    useEffect(() => {
        let mounted = true;
        const loadBackofficeCategories = async () => {
            try {
                const rows = await categoryAPI.getAll();
                if (!mounted) return;
                setBackofficeCategories(rows.filter(r => String(r.name ?? '').trim().length > 0));
            } catch {
                if (!mounted) return;
                setBackofficeCategories([]);
            }
        };
        loadBackofficeCategories();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        setSelectedRowKeys(keys => keys.filter(k => services.some(s => s.id === k)));
    }, [services]);

    const categories = useMemo(() => {
        const staticFallback = Object.values(ServiceCategory).map(c => ({
            value: c,
            label: CATEGORY_LABELS[c] ?? c,
        }));
        if (backofficeCategories.length === 0) return staticFallback;
        return backofficeCategories.map(cat => {
            const code = String(cat.code ?? '').trim();
            const name = String(cat.name ?? '').trim();
            return {
                value: code.length ? code : name,
                label: name || code,
            };
        });
    }, [backofficeCategories]);

    const serviceMainKeys = useMemo(() => {
        const set = new Set<string>();
        for (const s of services) {
            set.add(beautyServiceMainKey(s));
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
    }, [services]);

    const serviceSubKeysForMain = useMemo(() => {
        if (selectedMain === 'all') return [] as string[];
        const set = new Set<string>();
        for (const s of services) {
            if (beautyServiceMainKey(s) !== selectedMain) continue;
            set.add(beautyServiceSubKey(s));
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
    }, [services, selectedMain]);

    const filteredServices = useMemo(
        () =>
            services.filter(s => {
                const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
                const mainOk = selectedMain === 'all' || beautyServiceMainKey(s) === selectedMain;
                const subOk = selectedSub === 'all' || beautyServiceSubKey(s) === selectedSub;
                return matchesSearch && mainOk && subOk;
            }),
        [services, searchTerm, selectedMain, selectedSub],
    );

    useEffect(() => {
        if (selectedMain === 'all') setSelectedSub('all');
    }, [selectedMain]);

    const openCreate = () => {
        setEditing({ ...EMPTY_FORM });
        setIsEdit(false);
        setShowModal(true);
    };

    const openEdit = (svc: BeautyService) => {
        setEditing({ ...svc });
        setIsEdit(true);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!editing.name?.trim()) {
            toast.error(tm('bFillServiceNameToSave'));
            throw new Error('validation');
        }
        setSaving(true);
        try {
            if (isEdit && editing.id) await updateService(editing.id, editing);
            else await createService(editing);
            setShowModal(false);
            toast.success(tm('bServiceSaved'));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg !== 'validation') toast.error(msg);
            throw e;
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteService(id);
            toast.success(tm('bServiceDeleted'));
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        }
    };

    const openBulkUpdateModal = () => {
        const firstKey = selectedRowKeys.length ? String(selectedRowKeys[0]) : '';
        const sample = firstKey ? services.find(s => s.id === firstKey) : undefined;
        setBulkUpdateDuration(Math.max(5, Number(sample?.duration_min) || 60));
        setBulkUpdateSessions(Math.max(1, Math.min(99, Math.round(Number(sample?.default_sessions ?? 1)))));
        setBulkUpdateModalOpen(true);
    };

    const handleBulkUpdateSave = async () => {
        const durRounded = Math.round(Number(bulkUpdateDuration));
        const sessionsRounded = Math.round(Number(bulkUpdateSessions));
        if (!Number.isFinite(durRounded) || durRounded < 5) {
            toast.error(tm('bBulkUpdateValidationDuration'));
            throw new Error('validation');
        }
        const dur = durRounded;
        const sessions = Number.isFinite(sessionsRounded)
            ? Math.max(1, Math.min(99, sessionsRounded))
            : 1;
        const keys = selectedRowKeys.map(String);
        if (keys.length === 0) {
            setBulkUpdateModalOpen(false);
            return;
        }
        setBulkUpdateSaving(true);
        try {
            const results = await Promise.allSettled(
                keys.map(async id => {
                    const s = services.find(x => x.id === id);
                    if (!s) throw new Error('notfound');
                    await beautyService.updateService(id, {
                        ...s,
                        duration_min: dur,
                        default_sessions: sessions,
                    });
                }),
            );
            await loadServices();
            const ok = results.filter(r => r.status === 'fulfilled').length;
            const fail = results.length - ok;
            if (ok > 0) {
                toast.success(tm('bBulkUpdateSuccess').replace('{n}', String(ok)));
            }
            if (fail > 0) {
                toast.error(tm('bBulkUpdatePartial').replace('{ok}', String(ok)).replace('{fail}', String(fail)));
            }
            setBulkUpdateModalOpen(false);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg !== 'validation') toast.error(msg);
            throw e;
        } finally {
            setBulkUpdateSaving(false);
        }
    };

    const handleBulkDelete = async () => {
        const keys = selectedRowKeys.map(String);
        if (keys.length === 0) return;
        setBulkActionLoading(true);
        try {
            const results = await Promise.allSettled(keys.map(id => deleteService(id)));
            const ok = results.filter(r => r.status === 'fulfilled').length;
            const fail = results.length - ok;
            if (ok > 0) {
                toast.success(tm('bBulkServicesDeleted').replace('{n}', String(ok)));
            }
            if (fail > 0) {
                toast.error(tm('bBulkServicesDeletePartial').replace('{ok}', String(ok)).replace('{fail}', String(fail)));
            }
            setSelectedRowKeys(prev => {
                if (fail === 0) return [];
                const failedIds = new Set(
                    keys.filter((_, i) => results[i].status === 'rejected'),
                );
                return prev.filter(k => failedIds.has(String(k)));
            });
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setBulkActionLoading(false);
        }
    };

    const formatCurrency = (amount: number) => formatMoneyAmount(amount, { minFrac: 0, maxFrac: 0 });

    const columns: ColumnsType<BeautyService> = useMemo(
        () => [
            {
                title: tm('bServiceLabel'),
                key: 'name',
                ellipsis: true,
                render: (_, s) => (
                    <Space direction="vertical" size={0}>
                        <Typography.Text strong className={!s.is_active ? 'text-[#bfbfbf]' : 'text-[#262626]'}>
                            {s.name}
                        </Typography.Text>
                        <Typography.Text type="secondary" className="text-xs">
                            {String(s.parent_category ?? '').trim()
                                ? `${CATEGORY_LABELS[String(s.parent_category)] ?? s.parent_category} › ${CATEGORY_LABELS[s.category] ?? s.category}`
                                : CATEGORY_LABELS[s.category] ?? s.category}
                        </Typography.Text>
                    </Space>
                ),
            },
            {
                title: tm('bDurationHeader'),
                dataIndex: 'duration_min',
                key: 'duration',
                width: 110,
                align: 'center',
                render: (min: number) => (
                    <Space size={6}>
                        <ClockCircleOutlined className="text-[#bfbfbf]" />
                        <span>{min} dk</span>
                    </Space>
                ),
            },
            {
                title: tm('bServiceDefaultSessionsCol'),
                dataIndex: 'default_sessions',
                key: 'default_sessions',
                width: 96,
                align: 'center',
                render: (n: number | undefined) => (
                    <Typography.Text>{Math.max(1, Math.round(Number(n ?? 1)))}</Typography.Text>
                ),
            },
            {
                title: tm('bServiceFollowUpDaysShort'),
                dataIndex: 'follow_up_reminder_days',
                key: 'follow_up_reminder_days',
                width: 120,
                align: 'center',
                render: (d: number | null | undefined) => {
                    const n = Number(d);
                    if (!Number.isFinite(n) || n <= 0) return <Typography.Text type="secondary">—</Typography.Text>;
                    return <Typography.Text>{Math.round(n)}</Typography.Text>;
                },
            },
            {
                title: tm('price'),
                dataIndex: 'price',
                key: 'price',
                width: 120,
                align: 'right',
                render: (p: number) => <Typography.Text strong>{formatCurrency(p)}</Typography.Text>,
            },
            {
                title: tm('purchasePrice'),
                dataIndex: 'cost_price',
                key: 'cost',
                width: 110,
                align: 'right',
                render: (p: number) => formatCurrency(p ?? 0),
            },
            {
                title: tm('bDiagDevice'),
                key: 'device',
                width: 120,
                align: 'center',
                render: (_, s) =>
                    s.requires_device ? <Tag color="blue">{tm('bDiagDevice')}</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
            },
            {
                title: tm('status'),
                key: 'active',
                width: 100,
                align: 'center',
                render: (_, s) =>
                    s.is_active ? (
                        <Tag color="success">{tm('bStatusActive')}</Tag>
                    ) : (
                        <Tag>{tm('inactive')}</Tag>
                    ),
            },
            {
                title: '',
                key: 'actions',
                width: 100,
                fixed: 'right',
                align: 'center',
                render: (_, s) => (
                    <Space size={0}>
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(s)} aria-label={tm('edit')} />
                        <Popconfirm
                            title={tm('bServiceDeleteConfirm')}
                            okText={tm('delete')}
                            cancelText={tm('cancel')}
                            onConfirm={() => handleDelete(s.id)}
                        >
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={tm('delete')} />
                        </Popconfirm>
                    </Space>
                ),
            },
        ],
        [tm],
    );

    const definedSubtitle = tm('bServicesPageSubtitle').replace('{n}', String(services.length));

    return (
            <div className="flex min-h-0 w-full flex-col" style={{ backgroundColor: RETAILEX_PAGE_BG }}>
                <div className="w-full px-4 pb-4 pt-2">
                    <Card bordered className="!shadow-none" styles={{ body: { padding: 0 } }}>
                        <div
                            className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
                            style={{ borderColor: RETAILEX_BORDER_SUBTLE }}
                        >
                            <Space align="start" size={12}>
                                <div
                                    className="flex h-12 w-12 items-center justify-center rounded-md border bg-[#fafafa]"
                                    style={{ borderColor: RETAILEX_BORDER_SUBTLE, color: RETAILEX_PRIMARY }}
                                    aria-hidden
                                >
                                    <ScissorOutlined className="text-xl" />
                                </div>
                                <div>
                                    <Typography.Title
                                        level={5}
                                        className="!mb-0.5 !text-base !font-semibold"
                                        style={{ color: RETAILEX_TEXT_PRIMARY }}
                                    >
                                        {tm('bServiceDefinitionsTitle')}
                                    </Typography.Title>
                                    <Typography.Text type="secondary" className="text-xs">
                                        {isLoading ? tm('bLoading') : definedSubtitle}
                                    </Typography.Text>
                                </div>
                            </Space>
                            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                                {tm('bNewServiceAdd')}
                            </Button>
                        </div>

                        <div className="space-y-3 border-b px-4 py-3" style={{ borderColor: RETAILEX_BORDER_SUBTLE }}>
                            <Input.Search
                                allowClear
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder={tm('bSearchServicesPlaceholder')}
                                className="w-full"
                                size="middle"
                            />
                            <div className="space-y-2">
                                <Typography.Text type="secondary" className="text-xs font-semibold">
                                    {tm('bServiceMainCategoryFilter')}
                                </Typography.Text>
                                <Space wrap size={[8, 8]}>
                                    <Button
                                        type={selectedMain === 'all' ? 'primary' : 'default'}
                                        size="small"
                                        onClick={() => {
                                            setSelectedMain('all');
                                            setSelectedSub('all');
                                        }}
                                    >
                                        {tm('all')}
                                    </Button>
                                    {serviceMainKeys.map(mk => (
                                        <Button
                                            key={mk}
                                            type={selectedMain === mk ? 'primary' : 'default'}
                                            size="small"
                                            onClick={() => {
                                                setSelectedMain(mk);
                                                setSelectedSub('all');
                                            }}
                                        >
                                            {CATEGORY_LABELS[mk] ?? mk}
                                        </Button>
                                    ))}
                                </Space>
                                {selectedMain !== 'all' && serviceSubKeysForMain.length > 1 && (
                                    <>
                                        <Typography.Text type="secondary" className="text-xs font-semibold block pt-1">
                                            {tm('bServiceSubCategoryFilter')}
                                        </Typography.Text>
                                        <Space wrap size={[8, 8]}>
                                            <Button
                                                type={selectedSub === 'all' ? 'primary' : 'default'}
                                                size="small"
                                                onClick={() => setSelectedSub('all')}
                                            >
                                                {tm('all')}
                                            </Button>
                                            {serviceSubKeysForMain.map(sk => (
                                                <Button
                                                    key={sk}
                                                    type={selectedSub === sk ? 'primary' : 'default'}
                                                    size="small"
                                                    onClick={() => setSelectedSub(sk)}
                                                >
                                                    {CATEGORY_LABELS[sk] ?? sk}
                                                </Button>
                                            ))}
                                        </Space>
                                    </>
                                )}
                            </div>
                        </div>

                        {selectedRowKeys.length > 0 && (
                            <div
                                className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5"
                                style={{ borderColor: RETAILEX_BORDER_SUBTLE, backgroundColor: 'rgba(114, 46, 209, 0.06)' }}
                            >
                                <Typography.Text className="text-sm" style={{ color: RETAILEX_TEXT_PRIMARY }}>
                                    {tm('bBulkServicesSelected').replace('{n}', String(selectedRowKeys.length))}
                                </Typography.Text>
                                <Space wrap size="small">
                                    <Button size="small" onClick={() => setSelectedRowKeys([])}>
                                        {tm('bBulkClearSelection')}
                                    </Button>
                                    <Button size="small" type="primary" ghost icon={<FormOutlined />} onClick={openBulkUpdateModal}>
                                        {tm('bBulkUpdateDurationSessions')}
                                    </Button>
                                    <Popconfirm
                                        title={tm('bBulkDeleteServicesConfirm').replace('{n}', String(selectedRowKeys.length))}
                                        okText={tm('delete')}
                                        cancelText={tm('cancel')}
                                        okButtonProps={{ loading: bulkActionLoading }}
                                        onConfirm={handleBulkDelete}
                                    >
                                        <Button size="small" danger type="primary" ghost>
                                            {tm('bBulkDeleteSelected')}
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            </div>
                        )}

                        <Table<BeautyService>
                            rowKey="id"
                            size="middle"
                            bordered
                            loading={isLoading}
                            columns={columns}
                            dataSource={filteredServices}
                            rowSelection={{
                                selectedRowKeys,
                                onChange: setSelectedRowKeys,
                                preserveSelectedRowKeys: true,
                                columnWidth: 48,
                            }}
                            rowClassName={record => (!record.is_active ? 'opacity-60' : '')}
                            pagination={{
                                defaultPageSize: 20,
                                showSizeChanger: true,
                                pageSizeOptions: [10, 20, 50, 100],
                                showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
                                className: 'px-4 py-3',
                            }}
                            locale={{
                                emptyText: (
                                    <div className="py-12">
                                        <ScissorOutlined className="mb-2 text-3xl text-[#d9d9d9]" />
                                        <Typography.Text type="secondary" className="block">
                                            {searchTerm || selectedMain !== 'all' || selectedSub !== 'all'
                                                ? tm('bServiceNotFound')
                                                : tm('bNoServicesDefined')}
                                        </Typography.Text>
                                        {!searchTerm && selectedMain === 'all' && selectedSub === 'all' && (
                                            <Button type="primary" className="mt-4" icon={<PlusOutlined />} onClick={openCreate}>
                                                {tm('bNewServiceAdd')}
                                            </Button>
                                        )}
                                    </div>
                                ),
                            }}
                            scroll={{ x: 1080 }}
                        />
                    </Card>
                </div>

                <RetailExFlatModal
                    open={bulkUpdateModalOpen}
                    onClose={() => setBulkUpdateModalOpen(false)}
                    title={tm('bBulkUpdateModalTitle')}
                    subtitle={tm('bBulkUpdateModalSubtitle').replace('{n}', String(selectedRowKeys.length))}
                    headerIcon={<ClockCircleOutlined className="text-xl" aria-hidden />}
                    maxWidthClass="max-w-md"
                    cancelLabel={tm('cancel')}
                    confirmLabel={bulkUpdateSaving ? tm('bSaving') : tm('bBulkUpdateApply')}
                    confirmLoading={bulkUpdateSaving}
                    onConfirm={async () => {
                        try {
                            await handleBulkUpdateSave();
                        } catch {
                            /* handled */
                        }
                    }}
                >
                    <div className="flex w-full flex-col gap-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <RetailExFlatFieldLabel required>{tm('bDurationMin')}</RetailExFlatFieldLabel>
                                <InputNumber
                                    className="w-full !rounded-2xl"
                                    min={5}
                                    value={bulkUpdateDuration}
                                    onChange={v => setBulkUpdateDuration(Math.max(5, Number(v) || 5))}
                                />
                            </div>
                            <div>
                                <RetailExFlatFieldLabel required>{tm('bServiceDefaultSessions')}</RetailExFlatFieldLabel>
                                <InputNumber
                                    className="w-full !rounded-2xl"
                                    min={1}
                                    max={99}
                                    value={bulkUpdateSessions}
                                    onChange={v => setBulkUpdateSessions(Math.max(1, Math.min(99, Number(v) || 1)))}
                                />
                            </div>
                        </div>
                    </div>
                </RetailExFlatModal>

                <RetailExFlatModal
                    open={showModal}
                    onClose={() => setShowModal(false)}
                    title={isEdit ? tm('bEditServiceTitle') : tm('bNewServiceTitle')}
                    headerIcon={<Scissors className="h-5 w-5" aria-hidden />}
                    maxWidthClass="max-w-3xl"
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
                    <div className="flex w-full flex-col gap-6">
                        <section className="space-y-4">
                            <div>
                                <RetailExFlatFieldLabel required useSentenceCase>
                                    {tm('bServiceLabel')}
                                </RetailExFlatFieldLabel>
                                <Input
                                    className="!rounded-2xl !px-4 !py-2.5"
                                    value={editing.name ?? ''}
                                    onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Lazer epilasyon"
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
                                <div className="min-w-0">
                                    <RetailExFlatFieldLabel useSentenceCase>
                                        <span className="inline-flex items-center gap-1.5">
                                            {tm('bServiceParentCategoryField')}
                                            <Tooltip title={tm('bServiceParentCategoryHint')}>
                                                <InfoCircleOutlined
                                                    className="text-slate-400 hover:text-blue-500 transition-colors"
                                                    aria-label={tm('bServiceParentCategoryHint')}
                                                />
                                            </Tooltip>
                                        </span>
                                    </RetailExFlatFieldLabel>
                                    <Input
                                        className="!rounded-2xl !px-4 !py-2.5"
                                        list="beauty-service-main-cat-suggestions"
                                        value={String(editing.parent_category ?? '')}
                                        onChange={e =>
                                            setEditing(p => ({
                                                ...p,
                                                parent_category: e.target.value.trim() ? e.target.value : undefined,
                                            }))
                                        }
                                        placeholder="Candela"
                                    />
                                    <datalist id="beauty-service-main-cat-suggestions">
                                        {serviceMainKeys.map(k => (
                                            <option key={k} value={k} />
                                        ))}
                                    </datalist>
                                </div>
                                <div className="min-w-0">
                                    <RetailExFlatFieldLabel useSentenceCase>
                                        {tm('bServiceSubCategoryFilter')}
                                    </RetailExFlatFieldLabel>
                                    <Select
                                        {...antSelectInFlatModal}
                                        className="w-full [&_.ant-select-selector]:!rounded-2xl [&_.ant-select-selector]:!min-h-[46px] [&_.ant-select-selector]:!px-4 [&_.ant-select-selector]:!py-2"
                                        value={editing.category ?? ServiceCategory.BEAUTY}
                                        onChange={v => setEditing(p => ({ ...p, category: v }))}
                                        options={categories}
                                    />
                                </div>
                            </div>
                        </section>

                        <div className="h-px shrink-0 bg-slate-100 dark:bg-slate-700/80" aria-hidden />

                        <section className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="min-w-0">
                                    <RetailExFlatFieldLabel useSentenceCase>
                                        {tm('bServiceDefaultSessions')}
                                    </RetailExFlatFieldLabel>
                                    <InputNumber
                                        className="w-full !rounded-2xl"
                                        min={1}
                                        max={99}
                                        value={editing.default_sessions ?? 1}
                                        onChange={v =>
                                            setEditing(p => ({ ...p, default_sessions: Math.max(1, Number(v) || 1) }))
                                        }
                                    />
                                </div>
                                <div className="min-w-0">
                                    <RetailExFlatFieldLabel useSentenceCase>
                                        <span className="inline-flex items-center gap-1.5">
                                            {tm('bServiceFollowUpDaysShort')}
                                            <Tooltip title={tm('bServiceFollowUpDaysHint')}>
                                                <InfoCircleOutlined
                                                    className="text-slate-400 hover:text-blue-500 transition-colors"
                                                    aria-label={tm('bServiceFollowUpDaysHint')}
                                                />
                                            </Tooltip>
                                        </span>
                                    </RetailExFlatFieldLabel>
                                    <InputNumber
                                        className="w-full !rounded-2xl"
                                        min={1}
                                        max={3650}
                                        placeholder="—"
                                        value={
                                            editing.follow_up_reminder_days != null &&
                                            Number.isFinite(Number(editing.follow_up_reminder_days)) &&
                                            Number(editing.follow_up_reminder_days) > 0
                                                ? Math.round(Number(editing.follow_up_reminder_days))
                                                : null
                                        }
                                        onChange={v =>
                                            setEditing(p => ({
                                                ...p,
                                                follow_up_reminder_days:
                                                    v == null || !Number.isFinite(Number(v)) || Number(v) <= 0
                                                        ? undefined
                                                        : Math.min(3650, Math.round(Number(v))),
                                            }))
                                        }
                                    />
                                </div>
                                <div className="min-w-0">
                                    <RetailExFlatFieldLabel useSentenceCase>
                                        {tm('bDurationMin')}
                                    </RetailExFlatFieldLabel>
                                    <InputNumber
                                        className="w-full !rounded-2xl"
                                        min={5}
                                        value={editing.duration_min ?? 60}
                                        onChange={v => setEditing(p => ({ ...p, duration_min: Number(v) || 0 }))}
                                    />
                                </div>
                                <div className="min-w-0">
                                    <RetailExFlatFieldLabel useSentenceCase>
                                        {tm('price')}
                                    </RetailExFlatFieldLabel>
                                    <InputNumber
                                        className="w-full !rounded-2xl"
                                        min={0}
                                        value={editing.price ?? 0}
                                        onChange={v => setEditing(p => ({ ...p, price: Number(v) || 0 }))}
                                    />
                                </div>
                                <div className="min-w-0">
                                    <RetailExFlatFieldLabel useSentenceCase>
                                        {tm('purchasePrice')}
                                    </RetailExFlatFieldLabel>
                                    <InputNumber
                                        className="w-full !rounded-2xl"
                                        min={0}
                                        value={editing.cost_price ?? 0}
                                        onChange={v => setEditing(p => ({ ...p, cost_price: Number(v) || 0 }))}
                                    />
                                </div>
                                <div className="min-w-0">
                                    <RetailExFlatFieldLabel useSentenceCase>
                                        {tm('bCommissionPercentShort')}
                                    </RetailExFlatFieldLabel>
                                    <InputNumber
                                        className="w-full !rounded-2xl"
                                        min={0}
                                        max={100}
                                        value={editing.commission_rate ?? 0}
                                        onChange={v => setEditing(p => ({ ...p, commission_rate: Number(v) || 0 }))}
                                    />
                                </div>
                            </div>
                        </section>

                        <div className="h-px shrink-0 bg-slate-100 dark:bg-slate-700/80" aria-hidden />

                        <section className="space-y-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                <div className="min-w-0 shrink-0 sm:w-48">
                                    <RetailExFlatFieldLabel useSentenceCase>
                                        {tm('bColorLabel')}
                                    </RetailExFlatFieldLabel>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="color"
                                            value={editing.color ?? RETAILEX_PRIMARY}
                                            onChange={e => setEditing(p => ({ ...p, color: e.target.value }))}
                                            className="h-10 w-16 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-transparent dark:border-slate-600"
                                        />
                                        <Typography.Text
                                            type="secondary"
                                            className="font-mono text-sm tabular-nums"
                                        >
                                            {editing.color ?? RETAILEX_PRIMARY}
                                        </Typography.Text>
                                    </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <RetailExFlatFieldLabel useSentenceCase>
                                        {tm('description')}
                                    </RetailExFlatFieldLabel>
                                    <Input.TextArea
                                        className="!rounded-2xl !px-4 !py-2.5"
                                        rows={3}
                                        value={editing.description ?? ''}
                                        onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
                                <Checkbox
                                    checked={editing.requires_device ?? false}
                                    onChange={e => setEditing(p => ({ ...p, requires_device: e.target.checked }))}
                                >
                                    {tm('bDeviceZorunlu') ?? 'Cihaz zorunlu'}
                                </Checkbox>
                                <Checkbox
                                    checked={editing.is_active ?? true}
                                    onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))}
                                >
                                    {tm('active')}
                                </Checkbox>
                            </div>
                        </section>
                    </div>
                </RetailExFlatModal>
            </div>
    );
}
