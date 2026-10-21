import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
    Bell, Building2, Calendar, Globe, List, Plus, Scissors, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { beautyService } from '../../../services/beautyService';
import { ERP_SETTINGS } from '../../../services/postgres';
import type { BeautyBranch, BeautyPortalSettings, BeautyRoom } from '../../../types/beauty';
import { ServiceManagement } from './ServiceManagement';
import { StaffManagement } from './StaffManagement';

/**
 * V2 ayar kabuğu. Soldaki sıra, kayıtlı karşılığı olan grupları izler.
 * Şube mesaisi, tatil günü, modül anahtarı, sesli asistan, kontör ve kurum logosu
 * için ayrı kayıt yoktur; o başlıklar burada yok.
 */
export type ClinicV2SettingsGroupId =
    | 'branch'
    | 'staff'
    | 'services'
    | 'online'
    | 'calendar'
    | 'notify'
    | 'branchList'
    | 'branchAdd';

export type ClinicV2SettingsGroup = {
    id: ClinicV2SettingsGroupId;
    labelKey: string;
    icon: LucideIcon;
    section?: 'org';
};

export const CLINIC_V2_SETTINGS_GROUPS: readonly ClinicV2SettingsGroup[] = [
    { id: 'branch', labelKey: 'bClinicV2SetBranchInfo', icon: Building2 },
    { id: 'staff', labelKey: 'bClinicV2SetStaff', icon: Users },
    { id: 'services', labelKey: 'bClinicV2OpenServices', icon: Scissors },
    { id: 'online', labelKey: 'bClinicV2QaOnline', icon: Globe },
    { id: 'calendar', labelKey: 'bClinicV2SetCalendar', icon: Calendar },
    { id: 'notify', labelKey: 'bClinicV2QaNotify', icon: Bell },
    { id: 'branchList', labelKey: 'bClinicV2SetBranchList', icon: List, section: 'org' },
    { id: 'branchAdd', labelKey: 'bClinicV2SetBranchAdd', icon: Plus, section: 'org' },
];

type BranchForm = { name: string; address: string; phone: string; is_active: boolean };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const EMPTY_BRANCH: BranchForm = { name: '', address: '', phone: '', is_active: true };

function toBranchForm(row: BeautyBranch): BranchForm {
    return {
        name: row.name ?? '',
        address: row.address ?? '',
        phone: row.phone ?? '',
        is_active: row.is_active !== false,
    };
}

function publicBookingUrl(token: string): string {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const firm = encodeURIComponent(String(ERP_SETTINGS.firmNr ?? ''));
    const period = encodeURIComponent(String(ERP_SETTINGS.periodNr ?? ''));
    return `${base}/book/${firm}?period=${period}&token=${encodeURIComponent(token)}`;
}

export function ClinicV2SettingsShell() {
    const { tm } = useLanguage();
    const [group, setGroup] = useState<ClinicV2SettingsGroupId>('branch');
    const [loading, setLoading] = useState(true);
    const [branches, setBranches] = useState<BeautyBranch[]>([]);
    const [rooms, setRooms] = useState<BeautyRoom[]>([]);
    const [branchId, setBranchId] = useState<string | null>(null);
    const [branchForm, setBranchForm] = useState<BranchForm>(EMPTY_BRANCH);
    const [addForm, setAddForm] = useState<BranchForm>(EMPTY_BRANCH);
    const [roomName, setRoomName] = useState('');
    const [portal, setPortal] = useState<BeautyPortalSettings | null>(null);
    const [saveState, setSaveState] = useState<SaveState>('idle');

    const applyBranch = useCallback((row: BeautyBranch) => {
        setBranchId(row.id);
        setBranchForm(toBranchForm(row));
    }, []);

    const reload = useCallback(async (preferId?: string | null) => {
        const [nextBranches, nextRooms, nextPortal] = await Promise.all([
            beautyService.getBranches(),
            beautyService.getRooms(),
            beautyService.getPortalSettings(),
        ]);
        setBranches(nextBranches);
        setRooms(nextRooms);
        setPortal(nextPortal);
        const picked = nextBranches.find((row) => row.id === preferId) ?? nextBranches[0];
        if (picked) applyBranch(picked);
        else {
            setBranchId(null);
            setBranchForm(EMPTY_BRANCH);
        }
    }, [applyBranch]);

    useEffect(() => {
        let cancel = false;
        void (async () => {
            try {
                const [nextBranches, nextRooms, nextPortal] = await Promise.all([
                    beautyService.getBranches(),
                    beautyService.getRooms(),
                    beautyService.getPortalSettings(),
                ]);
                if (cancel) return;
                setBranches(nextBranches);
                setRooms(nextRooms);
                setPortal(nextPortal);
                if (nextBranches[0]) applyBranch(nextBranches[0]);
            } finally {
                if (!cancel) setLoading(false);
            }
        })();
        return () => {
            cancel = true;
        };
    }, [applyBranch]);

    const current = CLINIC_V2_SETTINGS_GROUPS.find((item) => item.id === group) ?? CLINIC_V2_SETTINGS_GROUPS[0];
    const showSave = group === 'branch' || group === 'branchAdd' || group === 'online' || group === 'calendar' || group === 'notify';

    const save = async () => {
        if ((group === 'branch' && !branchForm.name.trim()) || (group === 'branchAdd' && !addForm.name.trim())) return;
        if ((group === 'online' || group === 'calendar' || group === 'notify') && !portal) {
            setSaveState('error');
            return;
        }
        setSaveState('saving');
        try {
            if (group === 'branch') {
                const id = await beautyService.upsertBranch({
                    id: branchId ?? undefined,
                    name: branchForm.name.trim(),
                    address: branchForm.address.trim() || undefined,
                    phone: branchForm.phone.trim() || undefined,
                    is_active: branchForm.is_active,
                });
                await reload(id);
            } else if (group === 'branchAdd') {
                const id = await beautyService.upsertBranch({
                    name: addForm.name.trim(),
                    address: addForm.address.trim() || undefined,
                    phone: addForm.phone.trim() || undefined,
                    is_active: addForm.is_active,
                });
                setAddForm(EMPTY_BRANCH);
                await reload(id);
                setGroup('branch');
            } else if (group === 'online' && portal) {
                await beautyService.updatePortalSettings({
                    online_booking_enabled: !!portal.online_booking_enabled,
                    public_slug: portal.public_slug?.trim() || undefined,
                });
                await reload(branchId);
            } else if (group === 'calendar' && portal) {
                await beautyService.updatePortalSettings({
                    allow_staff_slot_overlap: !!portal.allow_staff_slot_overlap,
                });
                await reload(branchId);
            } else if (group === 'notify' && portal) {
                await beautyService.updatePortalSettings({
                    reminder_hours_before: Number(portal.reminder_hours_before) || 24,
                    default_reminder_channel: portal.default_reminder_channel || 'sms',
                    sms_user: portal.sms_user || undefined,
                    sms_password: portal.sms_password || undefined,
                    sms_sender: portal.sms_sender || undefined,
                    sms_template: portal.sms_template || undefined,
                    whatsapp_provider: portal.whatsapp_provider || 'NONE',
                    whatsapp_template: portal.whatsapp_template || undefined,
                    whatsapp_base_url: portal.whatsapp_base_url || undefined,
                    whatsapp_token: portal.whatsapp_token || undefined,
                    whatsapp_instance_id: portal.whatsapp_instance_id || undefined,
                    whatsapp_phone_id: portal.whatsapp_phone_id || undefined,
                });
                await reload(branchId);
            }
            setSaveState('saved');
        } catch {
            setSaveState('error');
        }
    };

    const addRoom = async () => {
        const name = roomName.trim();
        if (!name) return;
        await beautyService.upsertRoom({ name, branch_id: branchId ?? undefined });
        setRoomName('');
        setRooms(await beautyService.getRooms());
    };

    let orgHeading = false;
    const branchRooms = rooms.filter((room) => !branchId || !room.branch_id || room.branch_id === branchId);

    return (
        <div
            data-testid="clinic-v2-settings"
            className="flex h-full min-h-0 gap-4 bg-[#f3f4f6] p-3 sm:p-4"
        >
            <nav
                aria-label={tm('bClinicV2RailSettings')}
                data-testid="clinic-v2-settings-nav"
                className="flex w-[248px] shrink-0 flex-col gap-1 overflow-y-auto rounded-2xl border border-[#e5e7eb] bg-white p-2"
            >
                {CLINIC_V2_SETTINGS_GROUPS.map((item) => {
                    const Icon = item.icon;
                    const selected = group === item.id;
                    const heading = item.section === 'org' && !orgHeading;
                    if (heading) orgHeading = true;
                    return (
                        <div key={item.id}>
                            {heading ? (
                                <p className="mb-1 mt-3 px-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                    {tm('bClinicV2SetOrg')}
                                </p>
                            ) : null}
                            <button
                                type="button"
                                data-testid={`clinic-v2-settings-group-${item.id}`}
                                aria-pressed={selected}
                                onClick={() => {
                                    setGroup(item.id);
                                    setSaveState('idle');
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold"
                                style={{
                                    background: selected ? '#f3f4f6' : 'transparent',
                                    color: selected ? '#111827' : '#4b5563',
                                    boxShadow: selected ? 'inset 3px 0 0 #2563eb' : undefined,
                                }}
                            >
                                <Icon size={16} color={selected ? '#2563eb' : '#64748b'} aria-hidden />
                                {tm(item.labelKey)}
                            </button>
                        </div>
                    );
                })}
            </nav>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#eef0f3] px-5 py-4">
                    <h1 className="text-lg font-semibold text-slate-900">{tm(current.labelKey)}</h1>
                    <div className="flex items-center gap-3">
                        {saveState === 'saved' ? (
                            <span className="text-sm font-medium text-emerald-600">{tm('bClinicV2SetSaved')}</span>
                        ) : null}
                        {saveState === 'error' ? (
                            <span role="alert" className="text-sm font-medium text-rose-600">{tm('bClinicV2SetSaveFailed')}</span>
                        ) : null}
                        {showSave ? (
                            <button
                                type="button"
                                onClick={() => void save()}
                                disabled={saveState === 'saving' || loading}
                                className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                            >
                                {tm('save')}
                            </button>
                        ) : null}
                    </div>
                </header>
                <div data-testid="clinic-v2-settings-panel" className="min-h-0 flex-1 overflow-y-auto p-5">
                    {loading ? <p className="text-sm text-slate-500">{tm('bLoading')}</p> : null}
                    {!loading && group === 'branch' ? (
                        <div className="mx-auto flex max-w-3xl flex-col gap-4">
                            {branches.length > 1 ? (
                                <Field label={tm('bCrcColBranch')}>
                                    <select
                                        aria-label={tm('bCrcColBranch')}
                                        className={inputClass}
                                        value={branchId ?? ''}
                                        onChange={(event) => {
                                            const found = branches.find((row) => row.id === event.target.value);
                                            if (found) applyBranch(found);
                                        }}
                                    >
                                        {branches.map((row) => (
                                            <option key={row.id} value={row.id}>{row.name}</option>
                                        ))}
                                    </select>
                                </Field>
                            ) : null}
                            <div className="grid gap-3 rounded-xl border border-[#e5e7eb] p-4 sm:grid-cols-2">
                                <Field label={tm('branchName')}>
                                    <input
                                        id="clinic-v2-branch-name"
                                        className={inputClass}
                                        value={branchForm.name}
                                        onChange={(event) => setBranchForm((prev) => ({ ...prev, name: event.target.value }))}
                                    />
                                </Field>
                                <Field label={tm('bPhone')}>
                                    <input
                                        className={inputClass}
                                        value={branchForm.phone}
                                        onChange={(event) => setBranchForm((prev) => ({ ...prev, phone: event.target.value }))}
                                    />
                                </Field>
                                <div className="sm:col-span-2">
                                    <Field label={tm('bAddress')}>
                                        <input
                                            className={inputClass}
                                            value={branchForm.address}
                                            onChange={(event) => setBranchForm((prev) => ({ ...prev, address: event.target.value }))}
                                        />
                                    </Field>
                                </div>
                                <Switch
                                    label={tm('bClinicV2SetBranchStatus')}
                                    on={branchForm.is_active}
                                    onLabel={tm('active')}
                                    offLabel={tm('passive')}
                                    onChange={(on) => setBranchForm((prev) => ({ ...prev, is_active: on }))}
                                />
                            </div>
                            <div className="rounded-xl border border-[#e5e7eb] p-4">
                                <h2 className="mb-3 text-sm font-semibold text-slate-800">{tm('bClinicV2SetRooms')}</h2>
                                <div className="mb-3 flex gap-2">
                                    <input
                                        aria-label={tm('bClinicV2SetRoomName')}
                                        placeholder={tm('bClinicV2SetRoomName')}
                                        className={inputClass}
                                        value={roomName}
                                        onChange={(event) => setRoomName(event.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void addRoom()}
                                        className="shrink-0 rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm font-semibold text-slate-700"
                                    >
                                        {tm('add')}
                                    </button>
                                </div>
                                <ul className="space-y-1 text-sm text-slate-700">
                                    {branchRooms.map((room) => (
                                        <li key={room.id} className="rounded-lg bg-[#f8fafc] px-3 py-2">{room.name}</li>
                                    ))}
                                    {!branchRooms.length ? <li className="text-slate-400">{tm('bClinicV2SetEmpty')}</li> : null}
                                </ul>
                            </div>
                        </div>
                    ) : null}
                    {!loading && group === 'staff' ? <StaffManagement /> : null}
                    {!loading && group === 'services' ? <ServiceManagement /> : null}
                    {!loading && group === 'online' && portal ? (
                        <div className="mx-auto flex max-w-3xl flex-col gap-4">
                            <div className="rounded-xl border border-[#e5e7eb] p-4">
                                <Switch
                                    label={tm('bClinicV2SetOnlineOpen')}
                                    on={!!portal.online_booking_enabled}
                                    onLabel={tm('active')}
                                    offLabel={tm('passive')}
                                    onChange={(on) => setPortal((prev) => (prev ? { ...prev, online_booking_enabled: on } : prev))}
                                />
                                <p className="mt-2 text-sm text-slate-500">{tm('bClinicV2SetOnlineHint')}</p>
                            </div>
                            <div className="rounded-xl border border-[#e5e7eb] p-4">
                                <Field label={tm('bClinicV2SetSlug')}>
                                    <input
                                        aria-label={tm('bClinicV2SetSlug')}
                                        className={inputClass}
                                        value={portal.public_slug ?? ''}
                                        onChange={(event) => setPortal((prev) => (prev ? { ...prev, public_slug: event.target.value } : prev))}
                                    />
                                </Field>
                                {portal.public_token ? (
                                    <p className="mt-3 break-all text-sm text-slate-600">
                                        <span className="font-semibold text-slate-800">{tm('bClinicV2SetPublicLink')}: </span>
                                        {publicBookingUrl(portal.public_token)}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                    {!loading && group === 'calendar' && portal ? (
                        <div className="mx-auto max-w-3xl rounded-xl border border-[#e5e7eb] p-4">
                            <Choice
                                label={tm('bClinicV2SetBusySlot')}
                                value={portal.allow_staff_slot_overlap ? 'yes' : 'no'}
                                options={[
                                    { id: 'yes', label: tm('bClinicV2SetAllowed') },
                                    { id: 'no', label: tm('bClinicV2SetDenied') },
                                ]}
                                onChange={(id) => setPortal((prev) => (prev ? { ...prev, allow_staff_slot_overlap: id === 'yes' } : prev))}
                            />
                            <p className="mt-3 text-sm text-slate-500">{tm('bPortalAllowStaffSlotOverlap')}</p>
                            <p className="mt-1 text-xs text-slate-400">{tm('bPortalAllowStaffSlotOverlapHint')}</p>
                        </div>
                    ) : null}
                    {!loading && group === 'notify' && portal ? (
                        <NotifyFields portal={portal} onChange={setPortal} />
                    ) : null}
                    {!loading && group === 'branchList' ? (
                        <ul className="mx-auto flex max-w-3xl flex-col gap-3">
                            {branches.map((row) => (
                                <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] p-4">
                                    <div>
                                        <p className="font-semibold text-slate-900">{row.name}</p>
                                        <p className="text-sm text-slate-500">{[row.address, row.phone].filter(Boolean).join(' · ') || '—'}</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-600">
                                            {row.is_active !== false ? tm('active') : tm('passive')}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            applyBranch(row);
                                            setGroup('branch');
                                        }}
                                        className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm font-semibold text-[#1d4ed8]"
                                    >
                                        {tm('edit')}
                                    </button>
                                </li>
                            ))}
                            {!branches.length ? <li className="text-sm text-slate-400">{tm('bClinicV2SetEmpty')}</li> : null}
                        </ul>
                    ) : null}
                    {!loading && group === 'branchAdd' ? (
                        <div className="mx-auto grid max-w-3xl gap-3 rounded-xl border border-[#e5e7eb] p-4 sm:grid-cols-2">
                            <Field label={tm('branchName')}>
                                <input
                                    aria-label={tm('bClinicV2SetBranchAdd')}
                                    className={inputClass}
                                    value={addForm.name}
                                    onChange={(event) => setAddForm((prev) => ({ ...prev, name: event.target.value }))}
                                />
                            </Field>
                            <Field label={tm('bPhone')}>
                                <input
                                    className={inputClass}
                                    value={addForm.phone}
                                    onChange={(event) => setAddForm((prev) => ({ ...prev, phone: event.target.value }))}
                                />
                            </Field>
                            <div className="sm:col-span-2">
                                <Field label={tm('bAddress')}>
                                    <input
                                        className={inputClass}
                                        value={addForm.address}
                                        onChange={(event) => setAddForm((prev) => ({ ...prev, address: event.target.value }))}
                                    />
                                </Field>
                            </div>
                            <Switch
                                label={tm('bClinicV2SetBranchStatus')}
                                on={addForm.is_active}
                                onLabel={tm('active')}
                                offLabel={tm('passive')}
                                onChange={(on) => setAddForm((prev) => ({ ...prev, is_active: on }))}
                            />
                        </div>
                    ) : null}
                </div>
            </section>
        </div>
    );
}

const inputClass = 'w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#2563eb]';

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
            {children}
        </label>
    );
}

function Switch({
    label, on, onChange, onLabel, offLabel,
}: {
    label: string;
    on: boolean;
    onChange: (on: boolean) => void;
    onLabel: string;
    offLabel: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={() => onChange(!on)}
            className="inline-flex items-center gap-3 bg-transparent text-left"
        >
            <span
                aria-hidden
                className="relative h-6 w-11 rounded-full"
                style={{ background: on ? '#2563eb' : '#d1d5db' }}
            >
                <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white"
                    style={{ left: on ? 22 : 2 }}
                />
            </span>
            <span>
                <span className="block text-sm font-semibold text-slate-800">{label}</span>
                <span className="block text-xs text-slate-500">{on ? onLabel : offLabel}</span>
            </span>
        </button>
    );
}

function Choice({
    label, value, options, onChange,
}: {
    label: string;
    value: string;
    options: { id: string; label: string }[];
    onChange: (id: string) => void;
}) {
    return (
        <div>
            <p className="mb-2 text-sm font-semibold text-slate-800">{label}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
                {options.map((opt) => {
                    const selected = value === opt.id;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onChange(opt.id)}
                            className="rounded-lg border px-3 py-2 text-sm font-semibold"
                            style={{
                                borderColor: selected ? '#2563eb' : '#e5e7eb',
                                background: selected ? '#eff6ff' : '#fff',
                                color: selected ? '#1d4ed8' : '#334155',
                            }}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function NotifyFields({
    portal, onChange,
}: {
    portal: BeautyPortalSettings;
    onChange: (next: BeautyPortalSettings | null) => void;
}) {
    const { tm } = useLanguage();
    const patch = (partial: Partial<BeautyPortalSettings>) => {
        onChange({ ...portal, ...partial });
    };
    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="grid gap-4 rounded-xl border border-[#e5e7eb] p-4">
                <Field label={tm('bClinicV2SetReminderHours')}>
                    <input
                        aria-label={tm('bClinicV2SetReminderHours')}
                        type="number"
                        min={1}
                        className={inputClass}
                        value={portal.reminder_hours_before ?? 24}
                        onChange={(event) => patch({ reminder_hours_before: Number(event.target.value) })}
                    />
                </Field>
                <Choice
                    label={tm('bClinicV2SetChannel')}
                    value={(portal.default_reminder_channel || 'sms').toLowerCase()}
                    options={[
                        { id: 'sms', label: tm('bClinicV2SetChSms') },
                        { id: 'whatsapp', label: tm('bClinicV2SetChWa') },
                        { id: 'both', label: tm('bClinicV2SetChBoth') },
                    ]}
                    onChange={(id) => patch({ default_reminder_channel: id })}
                />
            </div>
            <div className="grid gap-3 rounded-xl border border-[#e5e7eb] p-4 sm:grid-cols-2">
                <h2 className="sm:col-span-2 text-sm font-semibold text-slate-800">SMS</h2>
                <Field label={tm('bClinicV2SetSmsUser')}>
                    <input className={inputClass} autoComplete="off" value={portal.sms_user ?? ''} onChange={(event) => patch({ sms_user: event.target.value })} />
                </Field>
                <Field label={tm('bClinicV2SetSmsPassword')}>
                    <input className={inputClass} type="password" autoComplete="new-password" value={portal.sms_password ?? ''} onChange={(event) => patch({ sms_password: event.target.value })} />
                </Field>
                <Field label={tm('bClinicV2SetSmsSender')}>
                    <input className={inputClass} value={portal.sms_sender ?? ''} onChange={(event) => patch({ sms_sender: event.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                    <Field label={tm('bClinicV2SetSmsTemplate')}>
                        <textarea className={`${inputClass} min-h-[72px]`} value={portal.sms_template ?? ''} onChange={(event) => patch({ sms_template: event.target.value })} />
                    </Field>
                </div>
            </div>
            <div className="grid gap-3 rounded-xl border border-[#e5e7eb] p-4">
                <h2 className="text-sm font-semibold text-slate-800">WhatsApp</h2>
                <Field label={tm('bClinicV2SetWaProvider')}>
                    <select
                        aria-label={tm('bClinicV2SetWaProvider')}
                        className={inputClass}
                        value={(portal.whatsapp_provider || 'NONE').toUpperCase()}
                        onChange={(event) => patch({ whatsapp_provider: event.target.value })}
                    >
                        <option value="NONE">{tm('bClinicV2SetWaOff')}</option>
                        <option value="EMBEDDED">{tm('bClinicV2SetWaBridge')}</option>
                        <option value="EVOLUTION">Evolution API</option>
                        <option value="META">Meta Cloud API</option>
                    </select>
                </Field>
                <Field label={tm('bClinicV2SetWaBase')}>
                    <input className={inputClass} value={portal.whatsapp_base_url ?? ''} onChange={(event) => patch({ whatsapp_base_url: event.target.value })} />
                </Field>
                <Field label={tm('bClinicV2SetWaToken')}>
                    <input className={inputClass} type="password" autoComplete="off" value={portal.whatsapp_token ?? ''} onChange={(event) => patch({ whatsapp_token: event.target.value })} />
                </Field>
                <Field label={tm('bClinicV2SetWaInstance')}>
                    <input className={inputClass} value={portal.whatsapp_instance_id ?? ''} onChange={(event) => patch({ whatsapp_instance_id: event.target.value })} />
                </Field>
                <Field label={tm('bClinicV2SetWaPhone')}>
                    <input className={inputClass} value={portal.whatsapp_phone_id ?? ''} onChange={(event) => patch({ whatsapp_phone_id: event.target.value })} />
                </Field>
                <Field label={tm('bClinicV2SetWaTemplate')}>
                    <textarea className={`${inputClass} min-h-[72px]`} value={portal.whatsapp_template ?? ''} onChange={(event) => patch({ whatsapp_template: event.target.value })} />
                </Field>
            </div>
        </div>
    );
}
