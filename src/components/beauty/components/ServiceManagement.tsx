import React, { useEffect, useMemo, useState } from 'react';
import {
    Table,
    Input,
    Button,
    Card,
    Space,
    Typography,
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
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { beautyService } from '../../../services/beautyService';
import { categoryAPI, type Category } from '../../../services/api/masterData';
import {
    RETAILEX_BORDER_SUBTLE,
    RETAILEX_PAGE_BG,
    RETAILEX_PRIMARY,
    RETAILEX_TEXT_PRIMARY,
} from '../../../theme/retailexAntdTheme';
import { ERP_SETTINGS } from '../../../services/postgres';
import { normalizeFirmEnabledModules } from '../../../utils/firmShellModules';

/** Sabit etiketler — yalnızca görüntüleme; CRUD serbest metin / masterData ile çalışır */
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
    facial: 'Yüz Bakımı',
    hair: 'Saç',
    nail: 'Tırnak',
};

function categoryDisplayLabel(key: string, masterByKey?: Map<string, string>): string {
    const k = String(key || '').trim();
    if (!k) return k;
    if (masterByKey?.has(k)) return masterByKey.get(k)!;
    return CATEGORY_LABELS[k] ?? k;
}

function slugCategoryCode(name: string): string {
    const base = String(name || '')
        .trim()
        .toLocaleLowerCase('tr-TR')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    return base || `cat_${Date.now().toString(36)}`;
}

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
    const { services, isLoading, error, loadServices, createService, updateService, deleteService } = useBeautyStore();
    const { tm } = useLanguage();
    const { selectedFirm } = useFirmaDonem();
    const firmNr = String(selectedFirm?.firm_nr || ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0');
    const firmName = String(selectedFirm?.name || '').trim();
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
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [categoryModalMode, setCategoryModalMode] = useState<'create' | 'edit'>('create');
    const [categoryModalName, setCategoryModalName] = useState('');
    const [categoryModalKey, setCategoryModalKey] = useState('');
    const [categoryModalSaving, setCategoryModalSaving] = useState(false);
    /** Yeni kategori hangi alana yazılsın: hizmet formu ana/alt veya liste filtresi */
    const [categoryCreateTarget, setCategoryCreateTarget] = useState<'parent' | 'sub' | 'filter'>('filter');
    const [reassignModalOpen, setReassignModalOpen] = useState(false);
    const [reassignFromKey, setReassignFromKey] = useState('');
    const [reassignTargetKey, setReassignTargetKey] = useState('');
    const [reassignSaving, setReassignSaving] = useState(false);

    const reloadBackofficeCategories = async () => {
        try {
            const rows = await categoryAPI.getAll();
            setBackofficeCategories(rows.filter(r => String(r.name ?? '').trim().length > 0));
        } catch {
            setBackofficeCategories([]);
        }
    };

    useEffect(() => {
        // Yanlış firmada (001 Market) boş liste çekilmesin — MainLayout ensureBeautyFirm sonrası yükle
        const hasBeauty = !!normalizeFirmEnabledModules(selectedFirm?.enabled_modules)?.includes('beauty');
        if (!hasBeauty) return;
        loadServices();
    }, [firmNr, selectedFirm?.enabled_modules, loadServices]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const rows = await categoryAPI.getAll();
                if (!mounted) return;
                setBackofficeCategories(rows.filter(r => String(r.name ?? '').trim().length > 0));
            } catch {
                if (!mounted) return;
                setBackofficeCategories([]);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        setSelectedRowKeys(keys => keys.filter(k => services.some(s => s.id === k)));
    }, [services]);

    const masterLabelByKey = useMemo(() => {
        const map = new Map<string, string>();
        for (const cat of backofficeCategories) {
            const code = String(cat.code ?? '').trim();
            const name = String(cat.name ?? '').trim();
            if (code) map.set(code, name || code);
            if (name) map.set(name, name);
        }
        return map;
    }, [backofficeCategories]);

    const categories = useMemo(() => {
        const byValue = new Map<string, string>();
        for (const c of Object.values(ServiceCategory)) {
            byValue.set(c, CATEGORY_LABELS[c] ?? c);
        }
        for (const cat of backofficeCategories) {
            const code = String(cat.code ?? '').trim();
            const name = String(cat.name ?? '').trim();
            const value = code || name;
            if (value) byValue.set(value, name || code);
        }
        for (const s of services) {
            const leaf = beautyServiceSubKey(s);
            if (leaf && !byValue.has(leaf)) byValue.set(leaf, categoryDisplayLabel(leaf, masterLabelByKey));
            const main = beautyServiceMainKey(s);
            if (main && !byValue.has(main)) byValue.set(main, categoryDisplayLabel(main, masterLabelByKey));
        }
        return Array.from(byValue.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
    }, [backofficeCategories, services, masterLabelByKey]);

    const findMasterCategory = (key: string): Category | undefined => {
        const k = String(key || '').trim();
        if (!k) return undefined;
        return backofficeCategories.find(
            c => String(c.code ?? '').trim() === k || String(c.name ?? '').trim() === k,
        );
    };

    const openCreateCategory = (target: 'parent' | 'sub' | 'filter' = 'filter') => {
        setCategoryCreateTarget(target);
        setCategoryModalMode('create');
        setCategoryModalName('');
        setCategoryModalKey('');
        setCategoryModalOpen(true);
    };

    const openEditCategory = (key: string) => {
        const k = String(key || '').trim();
        if (!k || k === 'all') return;
        setCategoryCreateTarget('filter');
        setCategoryModalMode('edit');
        setCategoryModalKey(k);
        setCategoryModalName(categoryDisplayLabel(k, masterLabelByKey));
        setCategoryModalOpen(true);
    };

    /** Açık hizmet formundaki ana/alt kategori alanlarını yeniden adlandırma / silme ile hizala */
    const syncEditingCategoryKey = (from: string, to: string | null) => {
        const fromKey = String(from || '').trim();
        if (!fromKey) return;
        setEditing(p => {
            if (!p) return p;
            const next = { ...p };
            if (String(p.parent_category ?? '').trim() === fromKey) {
                next.parent_category = to?.trim() ? to.trim() : undefined;
            }
            if (String(p.category ?? '').trim() === fromKey) {
                next.category = (to?.trim()
                    ? to.trim()
                    : ServiceCategory.BEAUTY) as BeautyService['category'];
            }
            return next;
        });
    };

    const handleCategoryModalSave = async () => {
        const name = categoryModalName.trim();
        if (!name) {
            toast.error(tm('bCategoryNameRequired'));
            throw new Error('validation');
        }
        setCategoryModalSaving(true);
        try {
            if (categoryModalMode === 'create') {
                const code = slugCategoryCode(name);
                const created = await categoryAPI.create({ code, name });
                if (!created) {
                    toast.error(tm('error') || 'Kategori oluşturulamadı');
                    throw new Error('create failed');
                }
                const createdKey = String(created.code || created.name || name).trim() || name;
                await reloadBackofficeCategories();
                if (categoryCreateTarget === 'parent') {
                    setEditing(p => ({ ...p, parent_category: createdKey }));
                } else if (categoryCreateTarget === 'sub') {
                    setEditing(p => ({
                        ...p,
                        category: createdKey as BeautyService['category'],
                    }));
                } else {
                    setSelectedMain(createdKey);
                    setSelectedSub('all');
                }
                toast.success(tm('bCategorySaved'));
            } else {
                const oldKey = categoryModalKey;
                const master = findMasterCategory(oldKey);
                if (master?.id) {
                    const updated = await categoryAPI.update(master.id, { name, code: master.code || slugCategoryCode(name) });
                    if (!updated) {
                        toast.error(tm('error') || 'Kategori güncellenemedi');
                        throw new Error('update failed');
                    }
                }
                // Hizmetlerde ana/alt anahtarı yeniden adlandır
                const toRename = services.filter(
                    s => beautyServiceMainKey(s) === oldKey || beautyServiceSubKey(s) === oldKey,
                );
                if (toRename.length > 0) {
                    await Promise.allSettled(
                        toRename.map(s => {
                            const patch: Partial<BeautyService> = { ...s };
                            if (String(s.parent_category ?? '').trim() === oldKey) patch.parent_category = name;
                            if (String(s.category ?? '').trim() === oldKey) patch.category = name as BeautyService['category'];
                            return updateService(s.id, patch);
                        }),
                    );
                    await loadServices();
                }
                syncEditingCategoryKey(oldKey, name);
                await reloadBackofficeCategories();
                if (selectedMain === oldKey) setSelectedMain(name);
                if (selectedSub === oldKey) setSelectedSub(name);
                toast.success(tm('bCategorySaved'));
            }
            setCategoryModalOpen(false);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg !== 'validation' && msg !== 'create failed' && msg !== 'update failed') {
                toast.error(msg);
            }
            throw e;
        } finally {
            setCategoryModalSaving(false);
        }
    };

    const finishDeleteCategoryKey = async (k: string, replaceWith: string | null = null) => {
        const master = findMasterCategory(k);
        if (master?.id) {
            const ok = await categoryAPI.delete(master.id);
            if (!ok) {
                toast.error(tm('error') || 'Kategori silinemedi');
                return false;
            }
        }
        await reloadBackofficeCategories();
        syncEditingCategoryKey(k, replaceWith);
        if (selectedMain === k) {
            setSelectedMain(replaceWith?.trim() || 'all');
            setSelectedSub('all');
        }
        if (selectedSub === k) setSelectedSub(replaceWith?.trim() || 'all');
        toast.success(tm('bCategoryDeleted'));
        return true;
    };

    const handleDeleteCategory = async (key: string) => {
        const k = String(key || '').trim();
        if (!k || k === 'all') return;
        const used = services.filter(s => beautyServiceMainKey(s) === k || beautyServiceSubKey(s) === k);
        if (used.length > 0) {
            setReassignFromKey(k);
            setReassignTargetKey('');
            setReassignModalOpen(true);
            return;
        }
        await finishDeleteCategoryKey(k);
    };

    const handleReassignAndDelete = async () => {
        const from = reassignFromKey.trim();
        const to = reassignTargetKey.trim();
        if (!from || !to || from === to) {
            toast.error(tm('bCategoryReassignRequired'));
            throw new Error('validation');
        }
        setReassignSaving(true);
        try {
            const toRename = services.filter(
                s => beautyServiceMainKey(s) === from || beautyServiceSubKey(s) === from,
            );
            if (toRename.length > 0) {
                await Promise.allSettled(
                    toRename.map(s => {
                        const patch: Partial<BeautyService> = { ...s };
                        if (String(s.parent_category ?? '').trim() === from) patch.parent_category = to;
                        if (String(s.category ?? '').trim() === from) patch.category = to as BeautyService['category'];
                        return updateService(s.id, patch);
                    }),
                );
                await loadServices();
            }
            const ok = await finishDeleteCategoryKey(from, to);
            if (!ok) throw new Error('delete failed');
            setReassignModalOpen(false);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg !== 'validation' && msg !== 'delete failed') toast.error(msg);
            throw e;
        } finally {
            setReassignSaving(false);
        }
    };

    const serviceMainKeys = useMemo(() => {
        const set = new Set<string>();
        for (const s of services) {
            set.add(beautyServiceMainKey(s));
        }
        for (const cat of backofficeCategories) {
            const code = String(cat.code ?? '').trim();
            const name = String(cat.name ?? '').trim();
            if (code) set.add(code);
            else if (name) set.add(name);
        }
        return Array.from(set).sort((a, b) =>
            categoryDisplayLabel(a, masterLabelByKey).localeCompare(categoryDisplayLabel(b, masterLabelByKey), 'tr'),
        );
    }, [services, backofficeCategories, masterLabelByKey]);

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
                                ? `${categoryDisplayLabel(String(s.parent_category), masterLabelByKey)} › ${categoryDisplayLabel(s.category, masterLabelByKey)}`
                                : categoryDisplayLabel(s.category, masterLabelByKey)}
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
        [tm, masterLabelByKey],
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
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Typography.Text type="secondary" className="text-xs font-semibold">
                                        {tm('bServiceMainCategoryFilter')}
                                    </Typography.Text>
                                    <Space size={4} wrap>
                                        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={openCreateCategory}>
                                            {tm('bNewCategory')}
                                        </Button>
                                        {selectedMain !== 'all' && (
                                            <>
                                                <Button
                                                    size="small"
                                                    icon={<EditOutlined />}
                                                    onClick={() => openEditCategory(selectedMain)}
                                                    aria-label={tm('bEditCategory')}
                                                >
                                                    {tm('edit')}
                                                </Button>
                                                <Popconfirm
                                                    title={tm('bCategoryDeleteConfirm').replace(
                                                        '{name}',
                                                        categoryDisplayLabel(selectedMain, masterLabelByKey),
                                                    )}
                                                    okText={tm('delete')}
                                                    cancelText={tm('cancel')}
                                                    onConfirm={() => handleDeleteCategory(selectedMain)}
                                                >
                                                    <Button size="small" danger icon={<DeleteOutlined />} aria-label={tm('bDeleteCategory')}>
                                                        {tm('delete')}
                                                    </Button>
                                                </Popconfirm>
                                            </>
                                        )}
                                    </Space>
                                </div>
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
                                            {categoryDisplayLabel(mk, masterLabelByKey)}
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
                                                    {categoryDisplayLabel(sk, masterLabelByKey)}
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
                                            <>
                                                <Typography.Text type="secondary" className="mt-2 block text-xs">
                                                    {String(tm('bNoServicesFirmHint') || '')
                                                        .replace('{firmNr}', firmNr)
                                                        .replace('{firmName}', firmName || firmNr)
                                                        .replace('{table}', `beauty.rex_${firmNr}_beauty_services`)}
                                                </Typography.Text>
                                                {error ? (
                                                    <Typography.Text type="danger" className="mt-2 block text-xs">
                                                        {error}
                                                    </Typography.Text>
                                                ) : null}
                                                <Button type="primary" className="mt-4" icon={<PlusOutlined />} onClick={openCreate}>
                                                    {tm('bNewServiceAdd')}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                ),
                            }}
                            scroll={{ x: 1080 }}
                        />
                    </Card>
                </div>

                <RetailExFlatModal
                    open={categoryModalOpen}
                    onClose={() => setCategoryModalOpen(false)}
                    title={categoryModalMode === 'edit' ? tm('bEditCategory') : tm('bNewCategory')}
                    headerIcon={<FormOutlined className="text-xl" aria-hidden />}
                    maxWidthClass="max-w-md"
                    cancelLabel={tm('cancel')}
                    confirmLabel={categoryModalSaving ? tm('bSaving') : tm('save')}
                    confirmLoading={categoryModalSaving}
                    onConfirm={async () => {
                        try {
                            await handleCategoryModalSave();
                        } catch {
                            /* handled */
                        }
                    }}
                >
                    <div className="flex w-full flex-col gap-4">
                        <div>
                            <RetailExFlatFieldLabel required>{tm('bCategoryName')}</RetailExFlatFieldLabel>
                            <Input
                                className="!rounded-2xl !px-4 !py-2.5"
                                value={categoryModalName}
                                onChange={e => setCategoryModalName(e.target.value)}
                                placeholder="Lazer"
                                autoFocus
                            />
                        </div>
                    </div>
                </RetailExFlatModal>

                <RetailExFlatModal
                    open={reassignModalOpen}
                    onClose={() => setReassignModalOpen(false)}
                    title={tm('bCategoryReassignTitle')}
                    subtitle={tm('bCategoryInUse').replace(
                        '{n}',
                        String(
                            services.filter(
                                s =>
                                    beautyServiceMainKey(s) === reassignFromKey ||
                                    beautyServiceSubKey(s) === reassignFromKey,
                            ).length,
                        ),
                    )}
                    headerIcon={<FormOutlined className="text-xl" aria-hidden />}
                    maxWidthClass="max-w-md"
                    cancelLabel={tm('cancel')}
                    confirmLabel={reassignSaving ? tm('bSaving') : tm('bCategoryReassignDelete')}
                    confirmLoading={reassignSaving}
                    onConfirm={async () => {
                        try {
                            await handleReassignAndDelete();
                        } catch {
                            /* handled */
                        }
                    }}
                >
                    <div className="flex w-full flex-col gap-4">
                        <div>
                            <RetailExFlatFieldLabel required>{tm('bCategoryReassignTarget')}</RetailExFlatFieldLabel>
                            <select
                                className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-2.5 pr-11 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500"
                                value={reassignTargetKey}
                                onChange={e => setReassignTargetKey(e.target.value)}
                            >
                                <option value="">{tm('bCategoryReassignPick')}</option>
                                {categories
                                    .filter(c => c.value !== reassignFromKey)
                                    .map(c => (
                                        <option key={c.value} value={c.value}>
                                            {c.label}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    </div>
                </RetailExFlatModal>

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
                                    <div className="flex items-center gap-2">
                                        <Input
                                            className="min-w-0 flex-1 !rounded-2xl !px-4 !py-2.5"
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
                                        <Space size={4} className="shrink-0">
                                            <Tooltip title={tm('bNewCategory')}>
                                                <Button
                                                    type="dashed"
                                                    icon={<PlusOutlined />}
                                                    onClick={() => openCreateCategory('parent')}
                                                    aria-label={tm('bNewCategory')}
                                                />
                                            </Tooltip>
                                            <Tooltip title={tm('bEditCategory')}>
                                                <Button
                                                    type="default"
                                                    icon={<EditOutlined />}
                                                    disabled={!String(editing.parent_category ?? '').trim()}
                                                    onClick={() =>
                                                        openEditCategory(String(editing.parent_category ?? ''))
                                                    }
                                                    aria-label={tm('bEditCategory')}
                                                />
                                            </Tooltip>
                                            <Popconfirm
                                                title={tm('bCategoryDeleteConfirm').replace(
                                                    '{name}',
                                                    categoryDisplayLabel(
                                                        String(editing.parent_category ?? ''),
                                                        masterLabelByKey,
                                                    ),
                                                )}
                                                okText={tm('delete')}
                                                cancelText={tm('cancel')}
                                                disabled={!String(editing.parent_category ?? '').trim()}
                                                onConfirm={() =>
                                                    handleDeleteCategory(String(editing.parent_category ?? ''))
                                                }
                                            >
                                                <Tooltip title={tm('bDeleteCategory')}>
                                                    <Button
                                                        danger
                                                        icon={<DeleteOutlined />}
                                                        disabled={!String(editing.parent_category ?? '').trim()}
                                                        aria-label={tm('bDeleteCategory')}
                                                    />
                                                </Tooltip>
                                            </Popconfirm>
                                        </Space>
                                    </div>
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
                                    <div className="flex items-center gap-2">
                                        <Input
                                            className="min-w-0 flex-1 !rounded-2xl !px-4 !py-2.5"
                                            list="beauty-service-sub-cat-suggestions"
                                            value={String(editing.category ?? '')}
                                            onChange={e =>
                                                setEditing(p => ({
                                                    ...p,
                                                    category: (e.target.value.trim()
                                                        ? e.target.value
                                                        : ServiceCategory.BEAUTY) as BeautyService['category'],
                                                }))
                                            }
                                            placeholder="Lazer"
                                        />
                                        <Space size={4} className="shrink-0">
                                            <Tooltip title={tm('bNewCategory')}>
                                                <Button
                                                    type="dashed"
                                                    icon={<PlusOutlined />}
                                                    onClick={() => openCreateCategory('sub')}
                                                    aria-label={tm('bNewCategory')}
                                                />
                                            </Tooltip>
                                            <Tooltip title={tm('bEditCategory')}>
                                                <Button
                                                    type="default"
                                                    icon={<EditOutlined />}
                                                    disabled={!String(editing.category ?? '').trim()}
                                                    onClick={() => openEditCategory(String(editing.category ?? ''))}
                                                    aria-label={tm('bEditCategory')}
                                                />
                                            </Tooltip>
                                            <Popconfirm
                                                title={tm('bCategoryDeleteConfirm').replace(
                                                    '{name}',
                                                    categoryDisplayLabel(
                                                        String(editing.category ?? ''),
                                                        masterLabelByKey,
                                                    ),
                                                )}
                                                okText={tm('delete')}
                                                cancelText={tm('cancel')}
                                                disabled={!String(editing.category ?? '').trim()}
                                                onConfirm={() =>
                                                    handleDeleteCategory(String(editing.category ?? ''))
                                                }
                                            >
                                                <Tooltip title={tm('bDeleteCategory')}>
                                                    <Button
                                                        danger
                                                        icon={<DeleteOutlined />}
                                                        disabled={!String(editing.category ?? '').trim()}
                                                        aria-label={tm('bDeleteCategory')}
                                                    />
                                                </Tooltip>
                                            </Popconfirm>
                                        </Space>
                                    </div>
                                    <datalist id="beauty-service-sub-cat-suggestions">
                                        {categories.map(c => (
                                            <option key={c.value} value={c.value}>
                                                {c.label}
                                            </option>
                                        ))}
                                    </datalist>
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
