import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
    Bell, Building2, Calendar, Crown, Globe, List, Plus, Scissors, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { beautyService } from '../../../services/beautyService';
import { ERP_SETTINGS } from '../../../services/postgres';
import type { BeautyBranch, BeautyPortalSettings, BeautyRoom } from '../../../types/beauty';
import {
    EMPTY_BRANCH_PLACE,
    unpackBranchAddress,
    type BeautyBranchPlace,
} from '../../../services/beautyBranchPlace';
import { ServiceManagement } from './ServiceManagement';
import { StaffManagement } from './StaffManagement';

/**
 * V2 ayar kabuğu. Soldaki sıra, kayıtlı karşılığı olan grupları izler.
 * Şube mesaisi, tatil günü, modül anahtarı, sesli asistan ve kontör
 * için ayrı kayıt yoktur; o başlıklar burada yok.
 * Logo, ülke ve kapı numarası şube adres metninin yanında durur.
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

type BranchForm = {
    name: string;
    address: string;
    phone: string;
    is_active: boolean;
    place: Required<BeautyBranchPlace>;
};
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const EMPTY_BRANCH: BranchForm = {
    name: '',
    address: '',
    phone: '',
    is_active: true,
    place: { ...EMPTY_BRANCH_PLACE },
};

function toBranchForm(row: BeautyBranch): BranchForm {
    const parsed = unpackBranchAddress(row.address);
    return {
        name: row.name ?? '',
        address: parsed.address,
        phone: row.phone ?? '',
        is_active: row.is_active !== false,
        place: { ...EMPTY_BRANCH_PLACE, ...parsed.place, ...(row.place ?? {}) },
    };
}

function placeQuery(form: BranchForm): string {
    return [
        form.address,
        form.place.neighborhood,
        form.place.district,
        form.place.province,
        form.place.country,
    ].map((part) => part.trim()).filter(Boolean).join(', ');
}

function readLogoFile(file: File): Promise<string> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const max = 160;
            const scale = Math.min(1, max / Math.max(img.width, img.height, 1));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(url);
                resolve('');
                return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve('');
        };
        img.src = url;
    });
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
                    place: branchForm.place,
                });
                await reload(id);
            } else if (group === 'branchAdd') {
                const id = await beautyService.upsertBranch({
                    name: addForm.name.trim(),
                    address: addForm.address.trim() || undefined,
                    phone: addForm.phone.trim() || undefined,
                    is_active: addForm.is_active,
                    place: addForm.place,
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

    const branchRooms = rooms.filter((room) => !branchId || !room.branch_id || room.branch_id === branchId);
    const mainGroups = CLINIC_V2_SETTINGS_GROUPS.filter((item) => item.section !== 'org');
    const orgGroups = CLINIC_V2_SETTINGS_GROUPS.filter((item) => item.section === 'org');
    const openGroup = (id: ClinicV2SettingsGroupId) => {
        setGroup(id);
        setSaveState('idle');
    };

    return (
        <div
            data-testid="clinic-v2-settings"
            className="flex h-full min-h-0"
            style={{ gap: 20, background: '#fcfcfc', padding: 20 }}
        >
            <style>{SETTINGS_CSS}</style>
            <div className="cv2s-side flex shrink-0 flex-col overflow-y-auto">
                <div className="cv2s-card">
                    <div className="cv2s-identity">
                        <LogoBox
                            logo={branchForm.place.logo}
                            label={tm('bClinicV2SetLogo')}
                            onPick={(logo) => setBranchForm((prev) => ({ ...prev, place: { ...prev.place, logo } }))}
                        />
                        {!loading && branches.length > 1 ? (
                            <select
                                aria-label={tm('bCrcColBranch')}
                                className={`${inputClass} mb-2 text-left`}
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
                        ) : null}
                        <input
                            id="clinic-v2-branch-name"
                            className="w-full border-0 bg-transparent text-center outline-none"
                            style={{ fontSize: 15, fontWeight: 600, color: '#071437' }}
                            value={branchForm.name}
                            placeholder={tm('branchName')}
                            onChange={(event) => setBranchForm((prev) => ({ ...prev, name: event.target.value }))}
                        />
                        {branchForm.phone || branchForm.place.dial ? (
                            <p className="mt-0.5 text-[13px] text-[#7e8299]">
                                {[branchForm.place.dial, branchForm.phone].filter(Boolean).join(' ')}
                            </p>
                        ) : null}
                        {!loading ? (
                            <span
                                className="mt-2 inline-flex rounded px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                    background: branchForm.is_active ? '#e8fff3' : '#f1f1f4',
                                    color: branchForm.is_active ? '#50cd89' : '#7e8299',
                                }}
                            >
                                {branchForm.is_active ? tm('active') : tm('passive')}
                            </span>
                        ) : null}
                    </div>
                    <nav
                        aria-label={tm('bClinicV2RailSettings')}
                        data-testid="clinic-v2-settings-nav"
                        className="cv2s-nav flex flex-col"
                    >
                        {mainGroups.map((item) => (
                            <MenuLink
                                key={item.id}
                                item={item}
                                label={tm(item.labelKey)}
                                selected={group === item.id}
                                onClick={() => openGroup(item.id)}
                            />
                        ))}
                    </nav>
                </div>
                <div className="cv2s-card cv2s-org">
                    <p className="mb-2 flex items-center gap-2 px-[13px] text-[14px] font-semibold text-[#071437]">
                        <Crown size={16} color="#f6c000" aria-hidden />
                        {tm('bClinicV2SetOrg')}
                    </p>
                    {orgGroups.map((item) => (
                        <MenuLink
                            key={item.id}
                            item={item}
                            label={tm(item.labelKey)}
                            selected={group === item.id}
                            onClick={() => openGroup(item.id)}
                        />
                    ))}
                </div>
            </div>

            <section className="cv2s-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <header className="cv2s-head shrink-0">
                    <h1 className="cv2s-title">{tm(current.labelKey)}</h1>
                    <div className="flex items-center gap-3">
                        {saveState === 'saved' ? (
                            <span className="text-[13px] font-medium text-[#50cd89]">{tm('bClinicV2SetSaved')}</span>
                        ) : null}
                        {saveState === 'error' ? (
                            <span role="alert" className="text-[13px] font-medium text-[#f1416c]">{tm('bClinicV2SetSaveFailed')}</span>
                        ) : null}
                        {showSave ? (
                            <button
                                type="button"
                                onClick={() => void save()}
                                disabled={saveState === 'saving' || loading}
                                className="cv2s-save"
                            >
                                {tm('save')}
                            </button>
                        ) : null}
                    </div>
                </header>
                <div data-testid="clinic-v2-settings-panel" className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    {loading ? <p className="text-[13px] text-[#7e8299]">{tm('bLoading')}</p> : null}
                    {!loading && group === 'branch' ? (
                        <div>
                            <BranchPlaceFields
                                form={branchForm}
                                onAddress={(address) => setBranchForm((prev) => ({ ...prev, address }))}
                                onPhone={(phone) => setBranchForm((prev) => ({ ...prev, phone }))}
                                onPlace={(patch) => setBranchForm((prev) => ({ ...prev, place: { ...prev.place, ...patch } }))}
                            />
                            <FormRow label={tm('bClinicV2SetBranchStatus')}>
                                <StatusPair
                                    label={tm('bClinicV2SetBranchStatus')}
                                    on={branchForm.is_active}
                                    onLabel={tm('active')}
                                    offLabel={tm('passive')}
                                    onChange={(on) => setBranchForm((prev) => ({ ...prev, is_active: on }))}
                                />
                            </FormRow>
                            <FormRow label={tm('bClinicV2SetRooms')}>
                                <div className="flex max-w-xl gap-2">
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
                                        className="cv2s-ghost shrink-0"
                                    >
                                        {tm('add')}
                                    </button>
                                </div>
                                <ul className="mt-2 max-w-xl text-[13px] text-[#071437]">
                                    {branchRooms.map((room) => (
                                        <li key={room.id} className="border-b border-[#f1f1f4] py-2">{room.name}</li>
                                    ))}
                                    {!branchRooms.length ? <li className="text-[#a1a5b7]">{tm('bClinicV2SetEmpty')}</li> : null}
                                </ul>
                            </FormRow>
                        </div>
                    ) : null}
                    {!loading && group === 'staff' ? <StaffManagement /> : null}
                    {!loading && group === 'services' ? <ServiceManagement /> : null}
                    {!loading && group === 'online' && portal ? (
                        <div>
                            <FormRow label={tm('bClinicV2SetOnlineOpen')}>
                                <Switch
                                    label={tm('bClinicV2SetOnlineOpen')}
                                    on={!!portal.online_booking_enabled}
                                    onLabel={tm('active')}
                                    offLabel={tm('passive')}
                                    onChange={(on) => setPortal((prev) => (prev ? { ...prev, online_booking_enabled: on } : prev))}
                                />
                                <p className="mt-2 text-[13px] text-[#7e8299]">{tm('bClinicV2SetOnlineHint')}</p>
                            </FormRow>
                            <FormRow label={tm('bClinicV2SetSlug')}>
                                <input
                                    aria-label={tm('bClinicV2SetSlug')}
                                    className={inputClass}
                                    value={portal.public_slug ?? ''}
                                    onChange={(event) => setPortal((prev) => (prev ? { ...prev, public_slug: event.target.value } : prev))}
                                />
                                {portal.public_token ? (
                                    <p className="mt-2 break-all text-[13px] text-[#4b5675]">
                                        <span className="font-medium text-[#071437]">{tm('bClinicV2SetPublicLink')}: </span>
                                        {publicBookingUrl(portal.public_token)}
                                    </p>
                                ) : null}
                            </FormRow>
                        </div>
                    ) : null}
                    {!loading && group === 'calendar' && portal ? (
                        <div>
                            <FormRow label={tm('bClinicV2SetBusySlot')}>
                                <Choice
                                    label={tm('bClinicV2SetBusySlot')}
                                    value={portal.allow_staff_slot_overlap ? 'yes' : 'no'}
                                    options={[
                                        { id: 'yes', label: tm('bClinicV2SetAllowed') },
                                        { id: 'no', label: tm('bClinicV2SetDenied') },
                                    ]}
                                    onChange={(id) => setPortal((prev) => (prev ? { ...prev, allow_staff_slot_overlap: id === 'yes' } : prev))}
                                />
                                <p className="mt-2 text-[13px] text-[#7e8299]">{tm('bPortalAllowStaffSlotOverlap')}</p>
                                <p className="mt-1 text-[12px] text-[#a1a5b7]">{tm('bPortalAllowStaffSlotOverlapHint')}</p>
                            </FormRow>
                        </div>
                    ) : null}
                    {!loading && group === 'notify' && portal ? (
                        <NotifyFields portal={portal} onChange={setPortal} />
                    ) : null}
                    {!loading && group === 'branchList' ? (
                        <ul>
                            {branches.map((row) => (
                                <li key={row.id} className="flex items-center justify-between gap-3 border-b border-[#f1f1f4] py-3">
                                    <div>
                                        <p className="text-[14px] font-medium text-[#071437]">{row.name}</p>
                                        <p className="text-[13px] text-[#7e8299]">{[row.address, row.phone].filter(Boolean).join(' · ') || '—'}</p>
                                        <p className="mt-1 text-[12px] font-medium" style={{ color: row.is_active !== false ? '#50cd89' : '#7e8299' }}>
                                            {row.is_active !== false ? tm('active') : tm('passive')}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            applyBranch(row);
                                            setGroup('branch');
                                        }}
                                        className="text-[13px] font-medium text-[#1b84ff]"
                                    >
                                        {tm('edit')}
                                    </button>
                                </li>
                            ))}
                            {!branches.length ? <li className="text-[13px] text-[#a1a5b7]">{tm('bClinicV2SetEmpty')}</li> : null}
                        </ul>
                    ) : null}
                    {!loading && group === 'branchAdd' ? (
                        <div>
                            <FormRow label={tm('branchName')}>
                                <input
                                    aria-label={tm('bClinicV2SetBranchAdd')}
                                    className={inputClass}
                                    value={addForm.name}
                                    onChange={(event) => setAddForm((prev) => ({ ...prev, name: event.target.value }))}
                                />
                            </FormRow>
                            <FormRow label={tm('bClinicV2SetLogo')}>
                                <LogoBox
                                    logo={addForm.place.logo}
                                    label={tm('bClinicV2SetLogo')}
                                    testId="clinic-v2-branch-add-logo"
                                    onPick={(logo) => setAddForm((prev) => ({ ...prev, place: { ...prev.place, logo } }))}
                                />
                            </FormRow>
                            <BranchPlaceFields
                                form={addForm}
                                onAddress={(address) => setAddForm((prev) => ({ ...prev, address }))}
                                onPhone={(phone) => setAddForm((prev) => ({ ...prev, phone }))}
                                onPlace={(patch) => setAddForm((prev) => ({ ...prev, place: { ...prev.place, ...patch } }))}
                            />
                            <FormRow label={tm('bClinicV2SetBranchStatus')}>
                                <StatusPair
                                    label={tm('bClinicV2SetBranchStatus')}
                                    on={addForm.is_active}
                                    onLabel={tm('active')}
                                    offLabel={tm('passive')}
                                    onChange={(on) => setAddForm((prev) => ({ ...prev, is_active: on }))}
                                />
                            </FormRow>
                        </div>
                    ) : null}
                </div>
            </section>
        </div>
    );
}

const SETTINGS_CSS = `
.cv2s-side { width: 230px; flex-basis: 230px; gap: 20px; }
.cv2s-card { background: #fff; border: 1px solid #f1f1f4; border-radius: 8px; box-shadow: rgba(0,0,0,0.03) 0px 3px 4px 0px; }
.cv2s-nav { padding: 0 20px 16px; }
.cv2s-head { height: 70px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #f1f1f4; padding: 0 24px; }
.cv2s-title { margin: 0; font-size: 16.575px; font-weight: 500; line-height: 1; color: #071437; }
.cv2s-save { height: 44px; border: 0; border-radius: 6.175px; background: #1b84ff; color: #fff; font-size: 14.3px; font-weight: 500; padding: 0 20.5px; box-shadow: none; cursor: pointer; }
.cv2s-save:disabled { opacity: 0.6; cursor: default; }
.cv2s-input { height: 40px; width: 100%; max-width: 36rem; box-sizing: border-box; border: 1px solid #e1e3ea; border-radius: 6px; background: #f9f9f9; padding: 0 12px; font-size: 13px; color: #071437; }
textarea.cv2s-input { height: auto; padding-top: 8px; }
.cv2s-input:focus { border-color: #1b84ff; outline: none; }
.cv2s-label { width: 130px; flex: 0 0 130px; padding-top: 8px; text-align: right; font-size: 13.975px; font-weight: 500; color: #252f4a; }
.cv2s-ghost { height: 40px; border: 1px solid #e1e3ea; border-radius: 6px; background: #fff; padding: 0 16px; font-size: 13px; font-weight: 500; color: #4b5675; cursor: pointer; }
.cv2s-identity { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 20px 20px 8px; }
.cv2s-org { padding: 16px 20px; }
.cv2s-row { display: flex; align-items: flex-start; gap: 16px; margin-top: 16px; }
.cv2s-row:first-child { margin-top: 0; }
.cv2s-logo { width: 72px; height: 72px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid #f1f1f4; border-radius: 8px; background: #f9f9f9; cursor: pointer; position: relative; }
.cv2s-logo input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.cv2s-logo img { width: 100%; height: 100%; object-fit: contain; }
.cv2s-fields { display: flex; flex-wrap: wrap; gap: 8px; }
.cv2s-fields label { flex: 1 1 140px; min-width: 0; }
.cv2s-fields span { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500; color: #7e8299; }
.cv2s-fields .cv2s-input { max-width: none; }
.cv2s-map { margin-top: 12px; height: 280px; overflow: hidden; border: 1px solid #f1f1f4; border-radius: 8px; background: #f9f9f9; }
.cv2s-map iframe { width: 100%; height: 100%; border: 0; }
`;
const inputClass = 'cv2s-input';

function LogoBox({
    logo, label, onPick, testId = 'clinic-v2-branch-logo',
}: {
    logo: string;
    label: string;
    onPick: (logo: string) => void;
    testId?: string;
}) {
    const src = logo.startsWith('data:image/') ? logo : '';
    return (
        <label className="cv2s-logo" title={label}>
            {src ? <img src={src} alt={label} /> : <Building2 size={22} color="#1b84ff" aria-hidden />}
            <input
                data-testid={testId}
                type="file"
                accept="image/*"
                aria-label={label}
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    void readLogoFile(file).then((next) => {
                        if (next) onPick(next);
                    });
                }}
            />
        </label>
    );
}

function PlaceInput({
    label, value, onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label>
            <span>{label}</span>
            <input className={inputClass} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
    );
}

function BranchPlaceFields({
    form, onAddress, onPhone, onPlace,
}: {
    form: BranchForm;
    onAddress: (value: string) => void;
    onPhone: (value: string) => void;
    onPlace: (patch: Partial<BeautyBranchPlace>) => void;
}) {
    const { tm } = useLanguage();
    const set = (key: keyof BeautyBranchPlace) => (value: string) => onPlace({ [key]: value });
    return (
        <>
            <FormRow label={tm('bClinicV2SetAddressBlock')}>
                <div className="cv2s-fields">
                    <PlaceInput label={tm('bClinicV2SetCountry')} value={form.place.country} onChange={set('country')} />
                    <PlaceInput label={tm('bClinicV2SetProvince')} value={form.place.province} onChange={set('province')} />
                    <PlaceInput label={tm('bClinicV2SetDistrict')} value={form.place.district} onChange={set('district')} />
                    <PlaceInput label={tm('bClinicV2SetNeighborhood')} value={form.place.neighborhood} onChange={set('neighborhood')} />
                </div>
                <div className="cv2s-fields" style={{ marginTop: 12 }}>
                    <PlaceInput label={tm('bClinicV2SetStreet')} value={form.address} onChange={onAddress} />
                    <PlaceInput label={tm('bClinicV2SetOuterDoor')} value={form.place.outerDoor} onChange={set('outerDoor')} />
                    <PlaceInput label={tm('bClinicV2SetInnerDoor')} value={form.place.innerDoor} onChange={set('innerDoor')} />
                    <PlaceInput label={tm('bClinicV2SetDirections')} value={form.place.directions} onChange={set('directions')} />
                </div>
                <BranchMap query={placeQuery(form)} />
            </FormRow>
            <FormRow label={tm('bPhone')}>
                <div className="flex gap-2">
                    <input
                        className={inputClass}
                        style={{ maxWidth: 88 }}
                        aria-label={tm('bClinicV2SetDial')}
                        placeholder="+964"
                        value={form.place.dial}
                        onChange={(event) => onPlace({ dial: event.target.value })}
                    />
                    <input
                        className={inputClass}
                        value={form.phone}
                        onChange={(event) => onPhone(event.target.value)}
                    />
                </div>
            </FormRow>
        </>
    );
}

function BranchMap({ query }: { query: string }) {
    const { tm } = useLanguage();
    const [src, setSrc] = useState('');
    useEffect(() => {
        const q = query.trim();
        if (!q || import.meta.env.MODE === 'test') {
            setSrc('');
            return;
        }
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => {
            const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
            void fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
                .then((res) => res.json())
                .then((rows: { lat?: string; lon?: string }[]) => {
                    const lat = Number(rows?.[0]?.lat);
                    const lon = Number(rows?.[0]?.lon);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
                    const pad = 0.02;
                    const bbox = [lon - pad, lat - pad, lon + pad, lat + pad].map((n) => n.toFixed(5)).join(',');
                    setSrc(`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`);
                })
                .catch(() => undefined);
        }, 450);
        return () => {
            ctrl.abort();
            window.clearTimeout(timer);
        };
    }, [query]);
    return (
        <div className="cv2s-map" data-testid="clinic-v2-branch-map">
            {src ? <iframe title={tm('bClinicV2SetMap')} src={src} /> : null}
        </div>
    );
}

function MenuLink({
    item, label, selected, onClick,
}: {
    item: ClinicV2SettingsGroup;
    label: string;
    selected: boolean;
    onClick: () => void;
}) {
    const Icon = item.icon;
    return (
        <button
            type="button"
            data-testid={`clinic-v2-settings-group-${item.id}`}
            aria-pressed={selected}
            onClick={onClick}
            className="flex w-full items-center gap-2 text-left"
            style={{
                background: selected ? '#f9f9f9' : 'transparent',
                color: selected ? '#1b84ff' : '#4b5675',
                borderLeft: `3px solid ${selected ? '#1b84ff' : 'transparent'}`,
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                lineHeight: '18px',
                padding: '8px 13px',
                boxShadow: 'none',
            }}
        >
            <Icon size={16} color={selected ? '#1b84ff' : '#a1a5b7'} aria-hidden />
            <span className="truncate">{label}</span>
        </button>
    );
}

function FormRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="cv2s-row">
            <div className="cv2s-label">{label}</div>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

function StatusPair({
    label, on, onChange, onLabel, offLabel,
}: {
    label: string;
    on: boolean;
    onChange: (on: boolean) => void;
    onLabel: string;
    offLabel: string;
}) {
    const tone = (selected: boolean, activeTone: boolean) => ({
        borderColor: selected ? (activeTone ? '#50cd89' : '#7e8299') : '#e1e3ea',
        borderStyle: selected ? 'solid' as const : 'dashed' as const,
        color: selected ? (activeTone ? '#50cd89' : '#4b5675') : '#99a1b7',
        background: '#fff',
    });
    return (
        <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
            <button
                type="button"
                aria-pressed={on}
                onClick={() => onChange(true)}
                className="rounded-[6px] border px-3 py-1.5 text-[12px] font-semibold"
                style={tone(on, true)}
            >
                {onLabel}
            </button>
            <button
                type="button"
                aria-pressed={!on}
                onClick={() => onChange(false)}
                className="rounded-[6px] border px-3 py-1.5 text-[12px] font-semibold"
                style={tone(!on, false)}
            >
                {offLabel}
            </button>
        </div>
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
                style={{ background: on ? '#1b84ff' : '#dbdfe9' }}
            >
                <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white"
                    style={{ left: on ? 22 : 2 }}
                />
            </span>
            <span className="text-[13px] font-medium text-[#4b5675]">{on ? onLabel : offLabel}</span>
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
        <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
            {options.map((opt) => {
                const selected = value === opt.id;
                return (
                    <button
                        key={opt.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange(opt.id)}
                        className="rounded-[6px] border px-3 py-1.5 text-[12px] font-semibold"
                        style={{
                            borderColor: selected ? '#1b84ff' : '#e1e3ea',
                            borderStyle: selected ? 'solid' : 'dashed',
                            background: '#fff',
                            color: selected ? '#1b84ff' : '#99a1b7',
                        }}
                    >
                        {opt.label}
                    </button>
                );
            })}
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
        <div>
            <FormRow label={tm('bClinicV2SetReminderHours')}>
                <input
                    aria-label={tm('bClinicV2SetReminderHours')}
                    type="number"
                    min={1}
                    className={inputClass}
                    value={portal.reminder_hours_before ?? 24}
                    onChange={(event) => patch({ reminder_hours_before: Number(event.target.value) })}
                />
            </FormRow>
            <FormRow label={tm('bClinicV2SetChannel')}>
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
            </FormRow>
            <h2 className="mb-1 mt-6 text-[14px] font-medium text-[#071437]">SMS</h2>
            <FormRow label={tm('bClinicV2SetSmsUser')}>
                <input className={inputClass} autoComplete="off" value={portal.sms_user ?? ''} onChange={(event) => patch({ sms_user: event.target.value })} />
            </FormRow>
            <FormRow label={tm('bClinicV2SetSmsPassword')}>
                <input className={inputClass} type="password" autoComplete="new-password" value={portal.sms_password ?? ''} onChange={(event) => patch({ sms_password: event.target.value })} />
            </FormRow>
            <FormRow label={tm('bClinicV2SetSmsSender')}>
                <input className={inputClass} value={portal.sms_sender ?? ''} onChange={(event) => patch({ sms_sender: event.target.value })} />
            </FormRow>
            <FormRow label={tm('bClinicV2SetSmsTemplate')}>
                <textarea className={`${inputClass} min-h-[72px] py-2`} value={portal.sms_template ?? ''} onChange={(event) => patch({ sms_template: event.target.value })} />
            </FormRow>
            <h2 className="mb-1 mt-6 text-[14px] font-medium text-[#071437]">WhatsApp</h2>
            <FormRow label={tm('bClinicV2SetWaProvider')}>
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
            </FormRow>
            <FormRow label={tm('bClinicV2SetWaBase')}>
                <input className={inputClass} value={portal.whatsapp_base_url ?? ''} onChange={(event) => patch({ whatsapp_base_url: event.target.value })} />
            </FormRow>
            <FormRow label={tm('bClinicV2SetWaToken')}>
                <input className={inputClass} type="password" autoComplete="off" value={portal.whatsapp_token ?? ''} onChange={(event) => patch({ whatsapp_token: event.target.value })} />
            </FormRow>
            <FormRow label={tm('bClinicV2SetWaInstance')}>
                <input className={inputClass} value={portal.whatsapp_instance_id ?? ''} onChange={(event) => patch({ whatsapp_instance_id: event.target.value })} />
            </FormRow>
            <FormRow label={tm('bClinicV2SetWaPhone')}>
                <input className={inputClass} value={portal.whatsapp_phone_id ?? ''} onChange={(event) => patch({ whatsapp_phone_id: event.target.value })} />
            </FormRow>
            <FormRow label={tm('bClinicV2SetWaTemplate')}>
                <textarea className={`${inputClass} min-h-[72px] py-2`} value={portal.whatsapp_template ?? ''} onChange={(event) => patch({ whatsapp_template: event.target.value })} />
            </FormRow>
        </div>
    );
}
