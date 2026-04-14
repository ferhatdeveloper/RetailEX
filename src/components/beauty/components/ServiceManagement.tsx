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
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ClockCircleOutlined,
    ScissorOutlined,
    FormOutlined,
} from '@ant-design/icons';
import { Scissors } from 'lucide-react';
import { RetailExFlatModal, RetailExFlatFieldLabel } from '../../shared/RetailExFlatModal';
import { useBeautyStore } from '../store/useBeautyStore';
import { BeautyService, ServiceCategory } from '../../../types/beauty';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { useLanguage } from '../../../contexts/LanguageContext';
import { toast } from 'sonner';
import { beautyService } from '../../../services/beautyService';
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
    duration_min: 60,
    price: 0,
    cost_price: 0,
    commission_rate: 0,
    color: '#722ed1',
    description: '',
    requires_device: false,
    default_sessions: 1,
    is_active: true,
};

export function ServiceManagement() {
    const { services, isLoading, loadServices, createService, updateService, deleteService } = useBeautyStore();
    const { tm } = useLanguage();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const [bulkUpdateModalOpen, setBulkUpdateModalOpen] = useState(false);
    const [bulkUpdateDuration, setBulkUpdateDuration] = useState(60);
    const [bulkUpdateSessions, setBulkUpdateSessions] = useState(1);
    const [bulkUpdateSaving, setBulkUpdateSaving] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyService>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadServices();
    }, []);

    useEffect(() => {
        setSelectedRowKeys(keys => keys.filter(k => services.some(s => s.id === k)));
    }, [services]);

    const categories = Object.values(ServiceCategory);

    const filteredServices = useMemo(
        () =>
            services.filter(s => {
                const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
                return matchesSearch && matchesCategory;
            }),
        [services, searchTerm, selectedCategory],
    );

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
                            {CATEGORY_LABELS[s.category] ?? s.category}
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
                            <Space wrap size={[8, 8]}>
                                <Button
                                    type={selectedCategory === 'all' ? 'primary' : 'default'}
                                    size="small"
                                    onClick={() => setSelectedCategory('all')}
                                >
                                    {tm('all')}
                                </Button>
                                {categories.map(cat => (
                                    <Button
                                        key={cat}
                                        type={selectedCategory === cat ? 'primary' : 'default'}
                                        size="small"
                                        onClick={() => setSelectedCategory(cat)}
                                    >
                                        {CATEGORY_LABELS[cat] ?? cat}
                                    </Button>
                                ))}
                            </Space>
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
                                            {searchTerm || selectedCategory !== 'all' ? tm('bServiceNotFound') : tm('bNoServicesDefined')}
                                        </Typography.Text>
                                        {!searchTerm && selectedCategory === 'all' && (
                                            <Button type="primary" className="mt-4" icon={<PlusOutlined />} onClick={openCreate}>
                                                {tm('bNewServiceAdd')}
                                            </Button>
                                        )}
                                    </div>
                                ),
                            }}
                            scroll={{ x: 960 }}
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
                    maxWidthClass="max-w-2xl"
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
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <RetailExFlatFieldLabel required>{tm('bServiceLabel')}</RetailExFlatFieldLabel>
                                <Input
                                    className="!rounded-2xl !px-4 !py-2.5"
                                    value={editing.name ?? ''}
                                    onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Lazer epilasyon"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <RetailExFlatFieldLabel>{tm('category')}</RetailExFlatFieldLabel>
                                <Select
                                    {...antSelectInFlatModal}
                                    className="w-full [&_.ant-select-selector]:!rounded-2xl [&_.ant-select-selector]:!min-h-[46px] [&_.ant-select-selector]:!px-4 [&_.ant-select-selector]:!py-2"
                                    value={editing.category ?? ServiceCategory.BEAUTY}
                                    onChange={v => setEditing(p => ({ ...p, category: v }))}
                                    options={categories.map(c => ({ value: c, label: CATEGORY_LABELS[c] ?? c }))}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                            <div>
                                <RetailExFlatFieldLabel>{tm('bServiceDefaultSessions')}</RetailExFlatFieldLabel>
                                <InputNumber
                                    className="w-full !rounded-2xl"
                                    min={1}
                                    max={99}
                                    value={editing.default_sessions ?? 1}
                                    onChange={v => setEditing(p => ({ ...p, default_sessions: Math.max(1, Number(v) || 1) }))}
                                />
                            </div>
                            <div>
                                <RetailExFlatFieldLabel>{tm('bDurationMin')}</RetailExFlatFieldLabel>
                                <InputNumber
                                    className="w-full !rounded-2xl"
                                    min={5}
                                    value={editing.duration_min ?? 60}
                                    onChange={v => setEditing(p => ({ ...p, duration_min: Number(v) || 0 }))}
                                />
                            </div>
                            <div>
                                <RetailExFlatFieldLabel>{tm('price')}</RetailExFlatFieldLabel>
                                <InputNumber
                                    className="w-full !rounded-2xl"
                                    min={0}
                                    value={editing.price ?? 0}
                                    onChange={v => setEditing(p => ({ ...p, price: Number(v) || 0 }))}
                                />
                            </div>
                            <div>
                                <RetailExFlatFieldLabel>{tm('purchasePrice')}</RetailExFlatFieldLabel>
                                <InputNumber
                                    className="w-full !rounded-2xl"
                                    min={0}
                                    value={editing.cost_price ?? 0}
                                    onChange={v => setEditing(p => ({ ...p, cost_price: Number(v) || 0 }))}
                                />
                            </div>
                            <div>
                                <RetailExFlatFieldLabel>{tm('bCommissionPercentShort')}</RetailExFlatFieldLabel>
                                <InputNumber
                                    className="w-full !rounded-2xl"
                                    min={0}
                                    max={100}
                                    value={editing.commission_rate ?? 0}
                                    onChange={v => setEditing(p => ({ ...p, commission_rate: Number(v) || 0 }))}
                                />
                            </div>
                        </div>
                        <div>
                            <RetailExFlatFieldLabel>{tm('bColorLabel')}</RetailExFlatFieldLabel>
                            <Space>
                                <input
                                    type="color"
                                    value={editing.color ?? RETAILEX_PRIMARY}
                                    onChange={e => setEditing(p => ({ ...p, color: e.target.value }))}
                                    className="h-9 w-14 cursor-pointer rounded-xl border border-slate-200 bg-transparent"
                                />
                                <Typography.Text type="secondary" className="font-mono text-xs">
                                    {editing.color ?? RETAILEX_PRIMARY}
                                </Typography.Text>
                            </Space>
                        </div>
                        <div>
                            <RetailExFlatFieldLabel>{tm('description')}</RetailExFlatFieldLabel>
                            <Input.TextArea
                                className="!rounded-2xl !px-4 !py-2.5"
                                rows={2}
                                value={editing.description ?? ''}
                                onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                            />
                        </div>
                        <Space direction="vertical" className="w-full">
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
                        </Space>
                    </div>
                </RetailExFlatModal>
            </div>
    );
}
