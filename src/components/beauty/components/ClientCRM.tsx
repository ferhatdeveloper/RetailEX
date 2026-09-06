import React, { useEffect, useMemo, useState } from 'react';
import {
    Table,
    Input,
    Button,
    Card,
    Space,
    Typography,
    Avatar,
    Tag,
    Select,
    Segmented,
} from 'antd';
import {
    RETAILEX_BORDER_SUBTLE,
    RETAILEX_PAGE_BG,
    RETAILEX_PRIMARY,
    RETAILEX_TEXT_PRIMARY,
} from '../../../theme/retailexAntdTheme';
import type { ColumnsType } from 'antd/es/table';
import { phoneMatchesQuery } from '../../../shared/utils/validators';
import {
    PlusOutlined,
    EditOutlined,
    PhoneOutlined,
    MailOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { User } from 'lucide-react';
import { RetailExFlatModal, RetailExFlatFieldLabel } from '../../shared/RetailExFlatModal';
import { useBeautyStore } from '../store/useBeautyStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import type { BeautyCustomer } from '../../../types/beauty';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { fetchCurrentAccounts } from '../../../services/api/currentAccounts';
import { ERP_SETTINGS } from '../../../services/postgres';
import { toast } from 'sonner';

const EMPTY_FORM: Partial<BeautyCustomer> = {
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    notes: '',
    customer_tier: 'normal',
    gender: null,
};

/** RetailExFlatModal (body portal) içindeki Select dropdown'ı overlay'in altında kalmadan
 *  en yüksek z-index'te gösterir. ServiceManagement.tsx ile aynı kalıp. */
const ANT_SELECT_POPUP_Z = 2147483647;
const antSelectInFlatModal = {
    getPopupContainer: () => document.body,
    styles: { popup: { root: { zIndex: ANT_SELECT_POPUP_Z } as React.CSSProperties } },
} as const;

/** DB'den gelen cinsiyet değerini Select'in beklediği 3 değerden birine map'ler.
 *  Eski/uyumsuz stringler (örn. "Kadın", "K", "F") için en yakın anlamlı karşılığı döner. */
function normalizeGender(
    raw: unknown
): 'female' | 'male' | 'other' | null {
    const s = String(raw ?? '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'female' || s === 'f' || s === 'kadın' || s === 'kadin' || s === 'k') return 'female';
    if (s === 'male' || s === 'm' || s === 'erkek' || s === 'e') return 'male';
    if (s === 'other' || s === 'diğer' || s === 'diger' || s === 'd') return 'other';
    return null;
}

/** DB'deki ham değeri kullanıcıya göstermek için — bilinmeyen/uyumsuz değerler için info notu. */
function genderRawLabel(raw: unknown): string {
    const s = String(raw ?? '').trim();
    return s;
}

export type ClientCRMProps = { onOpenCustomer: (customerId: string) => void };

export function ClientCRM({ onOpenCustomer }: ClientCRMProps) {
    const { customers, isLoading, loadCustomers, createCustomer, updateCustomer } = useBeautyStore();
    const { tm } = useLanguage();
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyCustomer>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [currentAccountCustomers, setCurrentAccountCustomers] = useState<BeautyCustomer[]>([]);

    useEffect(() => { loadCustomers(); }, []);

    useEffect(() => {
        void (async () => {
            try {
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
    }, []);

    const mergedCustomers = useMemo(() => {
        const map = new Map<string, BeautyCustomer>();
        for (const c of customers) map.set(c.id, c);
        for (const c of currentAccountCustomers) {
            if (!map.has(c.id)) map.set(c.id, c);
        }
        return Array.from(map.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'tr'));
    }, [customers, currentAccountCustomers]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return mergedCustomers;
        const trimmed = search.trim();
        return mergedCustomers.filter(c => {
            const textHit =
                c.name?.toLowerCase().includes(q) ||
                c.email?.toLowerCase().includes(q) ||
                (c.code ?? '').toLowerCase().includes(q);
            if (textHit) return true;
            // Telefon → rakam dışı karakterleri yoksayarak esnek eşleşme
            return (
                phoneMatchesQuery(c.phone, trimmed) ||
                phoneMatchesQuery(c.phone2, trimmed)
            );
        });
    }, [mergedCustomers, search]);

    const openCreate = () => {
        setEditing(EMPTY_FORM);
        setIsEdit(false);
        setShowModal(true);
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
                logger.error('ClientCRM', 'handleSave failed', e);
                toast.error(tm('bSaveCustomerFailed'), { description: msg, duration: 8000 });
            }
            throw e;
        } finally {
            setSaving(false);
        }
    };

    const initials = (name: string) =>
        name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

    const formatDate = (d?: string) =>
        d ? new Date(d).toLocaleDateString('tr-TR') : '-';

    const formatCurrency = (n?: number) =>
        formatMoneyAmount(n ?? 0, { minFrac: 0, maxFrac: 0 });

    const columns: ColumnsType<BeautyCustomer> = useMemo(
        () => [
            {
                title: tm('bCustomerHeader'),
                key: 'customer',
                ellipsis: true,
                render: (_, c) => (
                    <Space size={12}>
                        <Avatar
                            size={40}
                            style={{
                                background: '#fafafa',
                                color: '#595959',
                                border: '1px solid #d9d9d9',
                                fontWeight: 600,
                            }}
                        >
                            {initials(c.name ?? '?')}
                        </Avatar>
                        <div>
                            <Typography.Text strong className="block text-[#262626]">
                                {c.name}
                                {(c.customer_tier === 'vip' || Number(c.points ?? 0) >= 1000) && (
                                    <Tag color="gold" className="ml-1 align-middle text-[10px] leading-tight">
                                        {tm('bCustomerTierVip')}
                                    </Tag>
                                )}
                            </Typography.Text>
                            {c.balance != null && Number(c.balance) !== 0 && (
                                <Typography.Text type="secondary" className="text-xs">
                                    {tm('bBalance')}: {formatCurrency(c.balance)}
                                </Typography.Text>
                            )}
                        </div>
                    </Space>
                ),
            },
            {
                title: tm('bContactHeader'),
                key: 'contact',
                width: 260,
                render: (_, c) => (
                    <Space direction="vertical" size={4} className="w-full">
                        {c.phone ? (
                            <Space size={6} className="text-sm text-[#595959]">
                                <PhoneOutlined className="text-[#bfbfbf]" />
                                <span>{c.phone}</span>
                            </Space>
                        ) : null}
                        {c.email ? (
                            <Space size={6} className="text-sm text-[#595959]">
                                <MailOutlined className="text-[#bfbfbf]" />
                                <span className="break-all">{c.email}</span>
                            </Space>
                        ) : null}
                        {!c.phone && !c.email ? (
                            <Typography.Text type="secondary">—</Typography.Text>
                        ) : null}
                    </Space>
                ),
            },
            {
                title: tm('bLastServiceHeader'),
                key: 'last',
                width: 200,
                render: (_, c) => (
                    <Space direction="vertical" size={2}>
                        <Typography.Text className="text-sm text-[#262626]">
                            {c.last_service_name ?? '—'}
                        </Typography.Text>
                        <Typography.Text type="secondary" className="text-xs">
                            {formatDate(c.last_appointment_date)}
                        </Typography.Text>
                    </Space>
                ),
            },
            {
                title: tm('bVisitsHeader'),
                key: 'visits',
                width: 140,
                align: 'center',
                render: (_, c) => (
                    <Tag color={(c.appointment_count ?? 0) > 0 ? 'success' : 'default'} className="m-0">
                        {c.appointment_count ?? 0} {tm('bAppointmentWord')}
                    </Tag>
                ),
            },
            {
                title: '',
                key: 'actions',
                width: 52,
                fixed: 'right',
                align: 'center',
                render: (_, c) => (
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        className="text-[#bfbfbf] hover:text-[#722ed1]"
                        onClick={e => {
                            e.stopPropagation();
                            openEdit(c);
                        }}
                        aria-label={tm('bEditCustomer')}
                    />
                ),
            },
        ],
        [tm, formatCurrency],
    );

    return (
            <div className="flex min-h-0 w-full flex-col" style={{ backgroundColor: RETAILEX_PAGE_BG }}>
                <div className="w-full px-4 pb-4 pt-2">
                    <Card
                        bordered
                        className="!shadow-none"
                        styles={{ body: { padding: 0 } }}
                    >
                        <div
                            className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
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
                                        {isLoading ? tm('bLoading') : `${mergedCustomers.length} ${tm('bRegisteredCustomers')}`}
                                    </Typography.Text>
                                </div>
                            </Space>
                            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                                {tm('bNewCustomer')}
                            </Button>
                        </div>

                        <div className="border-b px-4 py-3" style={{ borderColor: RETAILEX_BORDER_SUBTLE }}>
                            <Input.Search
                                allowClear
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder={tm('bSearchPlaceholderCustomer')}
                                className="w-full"
                                size="middle"
                            />
                        </div>

                        <Table<BeautyCustomer>
                            rowKey="id"
                            size="middle"
                            bordered
                            loading={isLoading}
                            columns={columns}
                            dataSource={filtered}
                            pagination={{
                                defaultPageSize: 20,
                                showSizeChanger: true,
                                pageSizeOptions: [10, 20, 50, 100],
                                showTotal: (total, range) =>
                                    `${range[0]}-${range[1]} / ${total}`,
                                className: 'px-4 py-3',
                            }}
                            locale={{
                                emptyText: search ? tm('bNoCustomerResults') : tm('bNoCustomers'),
                            }}
                            onRow={record => ({
                                onClick: () => onOpenCustomer(record.id),
                                style: { cursor: 'pointer' },
                            })}
                            scroll={{ x: 900 }}
                        />
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
                                <RetailExFlatFieldLabel>{tm('bGender')}</RetailExFlatFieldLabel>
                                <Select
                                    {...antSelectInFlatModal}
                                    className="w-full [&_.ant-select-selector]:!rounded-2xl [&_.ant-select-selector]:!py-1"
                                    allowClear
                                    placeholder={tm('bGenderPlaceholder')}
                                    value={normalizeGender(editing.gender) ?? undefined}
                                    onChange={v =>
                                        setEditing(p => ({
                                            ...p,
                                            gender: (v as BeautyCustomer['gender']) ?? null,
                                        }))
                                    }
                                    options={[
                                        { value: 'female', label: tm('bGenderFemale') },
                                        { value: 'male', label: tm('bGenderMale') },
                                        { value: 'other', label: tm('bGenderOther') },
                                    ]}
                                />
                                {genderRawLabel(editing.gender) &&
                                    normalizeGender(editing.gender) === null && (
                                        <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                            DB'de kayıtlı değer: <b>"{genderRawLabel(editing.gender)}"</b> — lütfen listeden tekrar seçin.
                                        </p>
                                    )}
                            </div>
                            <div>
                                <RetailExFlatFieldLabel>{tm('bCustomerTier')}</RetailExFlatFieldLabel>
                                <Segmented
                                    block
                                    value={editing.customer_tier === 'vip' ? 'vip' : 'normal'}
                                    onChange={v =>
                                        setEditing(p => ({
                                            ...p,
                                            customer_tier: v === 'vip' ? 'vip' : 'normal',
                                        }))
                                    }
                                    options={[
                                        { label: tm('bCustomerTierNormal'), value: 'normal' },
                                        { label: tm('bCustomerTierVip'), value: 'vip' },
                                    ]}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <RetailExFlatFieldLabel>{tm('bPhone')}</RetailExFlatFieldLabel>
                                <Input
                                    className="!rounded-2xl !px-4 !py-2.5"
                                    value={editing.phone ?? ''}
                                    onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))}
                                    placeholder="0555 000 00 00"
                                />
                            </div>
                            <div>
                                <RetailExFlatFieldLabel>{tm('bCity')}</RetailExFlatFieldLabel>
                                <Input
                                    className="!rounded-2xl !px-4 !py-2.5"
                                    value={editing.city ?? ''}
                                    onChange={e => setEditing(p => ({ ...p, city: e.target.value }))}
                                    placeholder="İstanbul"
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
                                placeholder="ornek@email.com"
                            />
                        </div>
                        <div>
                            <RetailExFlatFieldLabel>{tm('bAddress')}</RetailExFlatFieldLabel>
                            <Input
                                className="!rounded-2xl !px-4 !py-2.5"
                                value={editing.address ?? ''}
                                onChange={e => setEditing(p => ({ ...p, address: e.target.value }))}
                                placeholder="Adres"
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
