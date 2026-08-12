import React, { useEffect, useMemo, useState } from 'react';
import {
    Card,
    Button,
    Input,
    Tag,
    List,
    Space,
    Typography,
    Avatar,
    Progress,
    Select,
    Spin,
    Tooltip,
} from 'antd';
import {
    PlusOutlined,
    SearchOutlined,
    ArrowRightOutlined,
    CheckCircleOutlined,
    RightOutlined,
} from '@ant-design/icons';
import {
    Megaphone,
    MessageCircle,
    Facebook,
    Instagram,
    PhoneCall,
    MapPin,
    Star,
    Users,
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LeadSource, LeadStatus } from '../../../types/beauty';
import type { BeautyLead } from '../../../types/beauty';
import {
    RETAILEX_BORDER_SUBTLE,
    RETAILEX_PAGE_BG,
    RETAILEX_PRIMARY,
    RETAILEX_TEXT_PRIMARY,
} from '../../../theme/retailexAntdTheme';
import { RetailExFlatModal, RetailExFlatFieldLabel } from '../../shared/RetailExFlatModal';

const SOURCE_CONFIG_BASE: Record<string, { icon: React.ElementType; avatarBg: string; avatarColor: string }> = {
    whatsapp: { icon: MessageCircle, avatarBg: '#f6ffed', avatarColor: '#52c41a' },
    facebook: { icon: Facebook, avatarBg: '#e6f4ff', avatarColor: '#1677ff' },
    instagram: { icon: Instagram, avatarBg: '#fff0f6', avatarColor: '#eb2f96' },
    phone_call: { icon: PhoneCall, avatarBg: '#f9f0ff', avatarColor: '#722ed1' },
    walk_in: { icon: MapPin, avatarBg: '#fff7e6', avatarColor: '#fa8c16' },
    referral: { icon: Star, avatarBg: '#fffbe6', avatarColor: '#faad14' },
    other: { icon: Users, avatarBg: '#f5f5f5', avatarColor: '#595959' },
};

/** Ant Design Tag renk önsetleri */
const STATUS_TAG_COLOR: Record<string, string> = {
    new: 'blue',
    contacted: 'geekblue',
    qualified: 'purple',
    appointment_scheduled: 'gold',
    converted: 'success',
    lost: 'error',
};

const STATUS_PROGRESS_COLOR: Record<string, string> = {
    new: '#1677ff',
    contacted: '#2f54eb',
    qualified: '#722ed1',
    appointment_scheduled: '#faad14',
    converted: '#52c41a',
    lost: '#ff4d4f',
};

const PIPELINE_ORDER = ['new', 'contacted', 'qualified', 'appointment_scheduled', 'converted', 'lost'];

const EMPTY_FORM: Partial<BeautyLead> = {
    name: '',
    phone: '',
    email: '',
    source: LeadSource.OTHER,
    status: LeadStatus.NEW,
    notes: '',
};

export function LeadManagement() {
    const { leads, isLoading, loadLeads, createLead, updateLead, convertLead } = useBeautyStore();
    const { tm } = useLanguage();

    const SOURCE_CONFIG: Record<string, { label: string; icon: React.ElementType; avatarBg: string; avatarColor: string }> = {
        whatsapp: { ...SOURCE_CONFIG_BASE.whatsapp, label: 'WhatsApp' },
        facebook: { ...SOURCE_CONFIG_BASE.facebook, label: 'Facebook' },
        instagram: { ...SOURCE_CONFIG_BASE.instagram, label: 'Instagram' },
        phone_call: { ...SOURCE_CONFIG_BASE.phone_call, label: tm('bSourcePhone') },
        walk_in: { ...SOURCE_CONFIG_BASE.walk_in, label: tm('bSourceWalkIn') },
        referral: { ...SOURCE_CONFIG_BASE.referral, label: tm('bSourceReferral') },
        other: { ...SOURCE_CONFIG_BASE.other, label: tm('bSourceOther') },
    };

    const STATUS_CONFIG: Record<string, { label: string; next?: string }> = {
        new: { label: tm('bStatusNew'), next: 'contacted' },
        contacted: { label: tm('bStatusContacted'), next: 'qualified' },
        qualified: { label: tm('bStatusQualified'), next: 'appointment_scheduled' },
        appointment_scheduled: { label: tm('bStatusAppointmentScheduled'), next: 'converted' },
        converted: { label: tm('bStatusConverted') },
        lost: { label: tm('bStatusLost') },
    };

    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyLead>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [converting, setConverting] = useState<string | null>(null);

    useEffect(() => {
        void loadLeads();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount’ta bir kez
    }, []);

    const filtered = useMemo(
        () =>
            leads.filter(l => {
                const matchSearch =
                    !search ||
                    l.name?.toLowerCase().includes(search.toLowerCase()) ||
                    l.phone?.includes(search) ||
                    l.email?.toLowerCase().includes(search.toLowerCase());
                const matchStatus = filterStatus === 'all' || l.status === filterStatus;
                return matchSearch && matchStatus;
            }),
        [leads, search, filterStatus],
    );

    const openCreate = () => {
        setEditing(EMPTY_FORM);
        setIsEdit(false);
        setShowModal(true);
    };
    const openEdit = (l: BeautyLead) => {
        setEditing({ ...l });
        setIsEdit(true);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            if (isEdit && editing.id) await updateLead(editing.id, editing);
            else await createLead(editing);
            setShowModal(false);
        } finally {
            setSaving(false);
        }
    };

    const handleAdvanceStatus = async (lead: BeautyLead) => {
        const cfg = STATUS_CONFIG[lead.status];
        if (!cfg?.next) return;
        await updateLead(lead.id, { ...lead, status: cfg.next });
    };

    const handleConvert = async (leadId: string) => {
        setConverting(leadId);
        try {
            await convertLead(leadId);
        } finally {
            setConverting(null);
        }
    };

    const pipelineCount = (status: string) => leads.filter(l => l.status === status).length;
    const formatDate = (d?: string) => (d ? new Date(d).toLocaleDateString('tr-TR') : '-');

    const pipelineFilterButtons = (
        <Space wrap size={[8, 8]} className="w-full">
            <Button
                type={filterStatus === 'all' ? 'primary' : 'default'}
                shape="round"
                size="middle"
                onClick={() => setFilterStatus('all')}
            >
                {tm('bAll')} ({leads.length})
            </Button>
            {PIPELINE_ORDER.map(status => {
                const cfg = STATUS_CONFIG[status];
                const count = pipelineCount(status);
                if (count === 0 && filterStatus !== status) return null;
                return (
                    <Button
                        key={status}
                        type={filterStatus === status ? 'primary' : 'default'}
                        shape="round"
                        size="middle"
                        onClick={() => setFilterStatus(status)}
                    >
                        {cfg.label} ({count})
                    </Button>
                );
            })}
        </Space>
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
                            <div
                                className="flex h-12 w-12 items-center justify-center rounded-xl border"
                                style={{
                                    background: '#fff0f6',
                                    borderColor: '#ffadd2',
                                    color: '#eb2f96',
                                }}
                                aria-hidden
                            >
                                <Megaphone className="h-6 w-6" />
                            </div>
                            <div>
                                <Typography.Title
                                    level={5}
                                    className="!mb-0.5 !text-base !font-semibold"
                                    style={{ color: RETAILEX_TEXT_PRIMARY }}
                                >
                                    {tm('bLeadManagement')}
                                </Typography.Title>
                                <Typography.Text type="secondary" className="text-xs">
                                    {isLoading
                                        ? tm('bLoading')
                                        : `${leads.length} lead · ${leads.filter(l => l.status === 'converted').length} ${tm('bLeadConverted')}`}
                                </Typography.Text>
                            </div>
                        </Space>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} size="middle">
                            {tm('bLeadCreate')}
                        </Button>
                    </div>

                    <div className="border-b px-4 py-3" style={{ borderColor: RETAILEX_BORDER_SUBTLE }}>
                        {pipelineFilterButtons}
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-stretch">
                        <div className="min-h-0 w-full min-w-0 flex-1 lg:max-w-[60%]">
                            <div
                                className="flex flex-col overflow-hidden rounded-lg border bg-white"
                                style={{ borderColor: RETAILEX_BORDER_SUBTLE, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                            >
                                <div className="border-b px-4 py-3" style={{ borderColor: RETAILEX_BORDER_SUBTLE }}>
                                    <Input
                                        allowClear
                                        size="middle"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder={tm('bLeadSearchPlaceholder')}
                                        prefix={<SearchOutlined className="text-slate-400" />}
                                        className="!rounded-lg"
                                    />
                                </div>
                                <div className="min-h-[280px] flex-1 overflow-y-auto">
                                    {isLoading ? (
                                        <div className="flex h-48 items-center justify-center">
                                            <Spin />
                                        </div>
                                    ) : (
                                        <List
                                            dataSource={filtered}
                                            locale={{
                                                emptyText: (
                                                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
                                                        <Megaphone className="h-8 w-8 opacity-50" />
                                                        <Typography.Text type="secondary">
                                                            {search ? tm('bNoResults') : tm('bNoLeads')}
                                                        </Typography.Text>
                                                    </div>
                                                ),
                                            }}
                                            renderItem={lead => {
                                                const srcCfg = SOURCE_CONFIG[lead.source] ?? SOURCE_CONFIG.other;
                                                const stsCfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.new;
                                                const SrcIcon = srcCfg.icon;
                                                const isConverted = lead.status === 'converted';
                                                const tagColor = STATUS_TAG_COLOR[lead.status] ?? 'default';
                                                return (
                                                    <List.Item
                                                        className="!px-4 !py-3 cursor-pointer transition-colors hover:bg-slate-50"
                                                        style={{ borderBlockColor: RETAILEX_BORDER_SUBTLE }}
                                                        onClick={() => openEdit(lead)}
                                                        actions={[
                                                            <Space key="meta" size={8} className="items-center">
                                                                <Typography.Text type="secondary" className="!text-[11px]">
                                                                    {formatDate(lead.first_contact_date)}
                                                                </Typography.Text>
                                                                {!isConverted && stsCfg.next && (
                                                                    <Tooltip title={tm('bAdvanceStatus')}>
                                                                        <Button
                                                                            type="text"
                                                                            size="small"
                                                                            icon={<ArrowRightOutlined />}
                                                                            onClick={e => {
                                                                                e.stopPropagation();
                                                                                void handleAdvanceStatus(lead);
                                                                            }}
                                                                        />
                                                                    </Tooltip>
                                                                )}
                                                                {lead.status === 'appointment_scheduled' && (
                                                                    <Button
                                                                        type="primary"
                                                                        size="small"
                                                                        loading={converting === lead.id}
                                                                        onClick={e => {
                                                                            e.stopPropagation();
                                                                            void handleConvert(lead.id);
                                                                        }}
                                                                    >
                                                                        {tm('bConvertToCustomer')}
                                                                    </Button>
                                                                )}
                                                                <RightOutlined className="text-slate-300" />
                                                            </Space>,
                                                        ]}
                                                    >
                                                        <List.Item.Meta
                                                            avatar={
                                                                <Avatar
                                                                    size={44}
                                                                    className="!flex !items-center !justify-center shrink-0"
                                                                    style={{
                                                                        backgroundColor: srcCfg.avatarBg,
                                                                        color: srcCfg.avatarColor,
                                                                    }}
                                                                >
                                                                    <SrcIcon size={20} strokeWidth={2} />
                                                                </Avatar>
                                                            }
                                                            title={
                                                                <Space size={6} wrap>
                                                                    <Typography.Text strong className="!text-[#262626]">
                                                                        {lead.name}
                                                                    </Typography.Text>
                                                                    {isConverted && (
                                                                        <CheckCircleOutlined className="text-green-500" />
                                                                    )}
                                                                </Space>
                                                            }
                                                            description={
                                                                <Space size={8} wrap className="mt-0.5">
                                                                    {lead.phone && (
                                                                        <Typography.Text
                                                                            type="secondary"
                                                                            className="!text-xs"
                                                                        >
                                                                            {lead.phone}
                                                                        </Typography.Text>
                                                                    )}
                                                                    <Tag color={tagColor} className="!m-0 !rounded-md !text-[11px]">
                                                                        {stsCfg.label}
                                                                    </Tag>
                                                                </Space>
                                                            }
                                                        />
                                                    </List.Item>
                                                );
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="hidden w-full min-w-0 flex-shrink-0 flex-col gap-4 lg:flex lg:w-[40%] lg:max-w-md">
                            <Card
                                bordered
                                size="small"
                                className="!shadow-none"
                                title={
                                    <Typography.Text strong className="text-xs uppercase tracking-wider text-slate-600">
                                        {tm('bPipelineSummary')}
                                    </Typography.Text>
                                }
                                styles={{ body: { paddingTop: 12 } }}
                            >
                                <Space direction="vertical" size="middle" className="w-full">
                                    {PIPELINE_ORDER.map(status => {
                                        const cfg = STATUS_CONFIG[status];
                                        const count = pipelineCount(status);
                                        const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                                        const stroke = STATUS_PROGRESS_COLOR[status] ?? RETAILEX_PRIMARY;
                                        return (
                                            <div key={status}>
                                                <div className="mb-1 flex items-center justify-between">
                                                    <Typography.Text className="text-xs font-medium text-slate-700">
                                                        {cfg.label}
                                                    </Typography.Text>
                                                    <Typography.Text type="secondary" className="text-xs font-semibold">
                                                        {count}
                                                    </Typography.Text>
                                                </div>
                                                <Progress
                                                    percent={pct}
                                                    showInfo={false}
                                                    strokeColor={stroke}
                                                    trailColor="#f0f0f0"
                                                    size="small"
                                                />
                                            </div>
                                        );
                                    })}
                                </Space>
                            </Card>

                            <Card
                                bordered
                                size="small"
                                className="!shadow-none"
                                title={
                                    <Typography.Text strong className="text-xs uppercase tracking-wider text-slate-600">
                                        {tm('bChannelDistribution')}
                                    </Typography.Text>
                                }
                                styles={{ body: { paddingTop: 12 } }}
                            >
                                <Space direction="vertical" size="small" className="w-full">
                                    {Object.entries(SOURCE_CONFIG).map(([src, cfg]) => {
                                        const count = leads.filter(l => l.source === src).length;
                                        if (count === 0) return null;
                                        const Icon = cfg.icon;
                                        return (
                                            <div key={src} className="flex items-center gap-3">
                                                <Avatar
                                                    size={36}
                                                    className="!flex !items-center !justify-center shrink-0"
                                                    style={{
                                                        backgroundColor: cfg.avatarBg,
                                                        color: cfg.avatarColor,
                                                    }}
                                                >
                                                    <Icon size={16} strokeWidth={2} />
                                                </Avatar>
                                                <Typography.Text className="flex-1 text-sm font-medium text-slate-700">
                                                    {cfg.label}
                                                </Typography.Text>
                                                <Typography.Text strong className="text-sm">
                                                    {count}
                                                </Typography.Text>
                                            </div>
                                        );
                                    })}
                                </Space>
                            </Card>
                        </div>
                    </div>
                </Card>
            </div>

            <RetailExFlatModal
                open={showModal}
                onClose={() => setShowModal(false)}
                title={isEdit ? tm('bLeadEdit') : tm('bLeadNew')}
                subtitle={tm('bLeadManagement')}
                headerIcon={<Megaphone className="h-5 w-5" aria-hidden />}
                cancelLabel={tm('cancel')}
                confirmLabel={saving ? tm('bSaving') : tm('save')}
                confirmLoading={saving}
                confirmDisabled={!editing.name?.trim()}
                onConfirm={handleSave}
            >
                <div className="flex w-full flex-col gap-4">
                    <div>
                        <RetailExFlatFieldLabel required>{tm('bLeadName')}</RetailExFlatFieldLabel>
                        <Input
                            className="!rounded-2xl !px-4 !py-2.5"
                            value={editing.name ?? ''}
                            onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                            placeholder="Aday ismi"
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <RetailExFlatFieldLabel>{tm('bLeadPhone')}</RetailExFlatFieldLabel>
                            <Input
                                className="!rounded-2xl !px-4 !py-2.5"
                                type="tel"
                                value={editing.phone ?? ''}
                                onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))}
                                placeholder="0555 000 0000"
                            />
                        </div>
                        <div>
                            <RetailExFlatFieldLabel>{tm('bLeadEmail')}</RetailExFlatFieldLabel>
                            <Input
                                className="!rounded-2xl !px-4 !py-2.5"
                                type="email"
                                value={editing.email ?? ''}
                                onChange={e => setEditing(p => ({ ...p, email: e.target.value }))}
                                placeholder="email@domain.com"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <RetailExFlatFieldLabel>{tm('bLeadSource')}</RetailExFlatFieldLabel>
                            <Select
                                className="w-full [&_.ant-select-selector]:!rounded-2xl [&_.ant-select-selector]:!min-h-[46px] [&_.ant-select-selector]:!px-4 [&_.ant-select-selector]:!py-2"
                                value={editing.source ?? 'other'}
                                onChange={v => setEditing(p => ({ ...p, source: v }))}
                                options={Object.entries(SOURCE_CONFIG).map(([v, c]) => ({
                                    value: v,
                                    label: c.label,
                                }))}
                            />
                        </div>
                        <div>
                            <RetailExFlatFieldLabel>{tm('bLeadStage')}</RetailExFlatFieldLabel>
                            <Select
                                className="w-full [&_.ant-select-selector]:!rounded-2xl [&_.ant-select-selector]:!min-h-[46px] [&_.ant-select-selector]:!px-4 [&_.ant-select-selector]:!py-2"
                                value={editing.status ?? 'new'}
                                onChange={v => setEditing(p => ({ ...p, status: v }))}
                                options={Object.entries(STATUS_CONFIG).map(([v, c]) => ({
                                    value: v,
                                    label: c.label,
                                }))}
                            />
                        </div>
                    </div>
                    {editing.status === 'lost' && (
                        <div>
                            <RetailExFlatFieldLabel>{tm('bLeadLostReason')}</RetailExFlatFieldLabel>
                            <Input
                                className="!rounded-2xl !px-4 !py-2.5"
                                value={editing.lost_reason ?? ''}
                                onChange={e => setEditing(p => ({ ...p, lost_reason: e.target.value }))}
                                placeholder="Fiyat, zaman, rekabet..."
                            />
                        </div>
                    )}
                    <div>
                        <RetailExFlatFieldLabel>{tm('bLeadNotes')}</RetailExFlatFieldLabel>
                        <Input.TextArea
                            className="!rounded-2xl !px-4 !py-2.5"
                            value={editing.notes ?? ''}
                            onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))}
                            rows={3}
                            placeholder="İlgilendiği hizmetler, notlar..."
                        />
                    </div>
                </div>
            </RetailExFlatModal>
        </div>
    );
}
