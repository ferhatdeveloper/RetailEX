import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, Clapperboard, ImageIcon, Link2, MessageCircle } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { beautyService } from '../../../services/beautyService';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { formatLocalYmd } from '../../../utils/dateLocal';
import {
    SHARE_SLOTS_BRAND,
    SHARE_SLOTS_NAVY,
    SHARE_SLOTS_PRESETS,
    collectShareOpenSlotChips,
    composeShareSlotsMessage,
    downloadShareBlob,
    recordShareSlotsVideo,
    renderShareSlotsPng,
    shareSlotsDayCaption,
    shareSlotsDayYmds,
    shareSlotsFirmInitial,
    shareSlotsLinkCaption,
    shareSlotsPublicLink,
    shareSlotsForPickedDays,
    shareSlotsVideoPlan,
    shareSlotsWhatsAppUrl,
    type ShareSlotsBackground,
    type ShareSlotsDayPreset,
    type ShareSlotsPresetId,
} from '../share-slots/shareSlotsStory';

type Props = {
    onBack: () => void;
};

type OutputMode = 'video' | 'image';
type BackgroundKind = 'solid' | 'photo' | 'preset';
type TitleId = 'ours' | 'available' | 'room';

const DAY_PRESETS: { id: ShareSlotsDayPreset; labelKey: string }[] = [
    { id: 'today_tomorrow', labelKey: 'bShareOpenSlotsTodayTomorrow' },
    { id: 'three', labelKey: 'bShareOpenSlotsDays3' },
    { id: 'seven', labelKey: 'bShareOpenSlotsDays7' },
];

export function ShareOpenSlotsPage({ onBack }: Props) {
    const { tm } = useLanguage();
    const locale = tm('localeCode') || 'tr-TR';
    const { selectedFirm, selectedPeriod } = useFirmaDonem();
    const [staff, setStaff] = useState<BeautySpecialist[]>([]);
    const [appointments, setAppointments] = useState<BeautyAppointment[]>([]);
    const [staffFilter, setStaffFilter] = useState('');
    const [preset, setPreset] = useState<ShareSlotsDayPreset>('today_tomorrow');
    const [picked, setPicked] = useState<Set<string>>(() => new Set());
    const [backgroundKind, setBackgroundKind] = useState<BackgroundKind>('solid');
    const [presetId, setPresetId] = useState<ShareSlotsPresetId>('navy');
    const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
    const [titleId, setTitleId] = useState<TitleId>('ours');
    const [note, setNote] = useState('');
    const [mode, setMode] = useState<OutputMode>('video');
    const [focusDay, setFocusDay] = useState('');
    const [token, setToken] = useState('');
    const [copied, setCopied] = useState(false);
    const [exportError, setExportError] = useState('');
    const [busy, setBusy] = useState(false);
    const [reveal, setReveal] = useState(0);
    const today = formatLocalYmd(new Date());

    useEffect(() => {
        let cancel = false;
        beautyService.getSpecialists().then((rows) => {
            if (!cancel) setStaff(Array.isArray(rows) ? rows : []);
        }).catch(() => {
            if (!cancel) setStaff([]);
        });
        beautyService.getPortalSettings().then((settings) => {
            if (!cancel) setToken(settings?.public_token?.trim() || '');
        }).catch(() => {
            if (!cancel) setToken('');
        });
        return () => {
            cancel = true;
        };
    }, []);

    const days = useMemo(() => shareSlotsDayYmds(today, preset), [today, preset]);

    useEffect(() => {
        let cancel = false;
        const end = days[days.length - 1] || today;
        beautyService.getAppointmentsInRange(days[0] || today, end).then((rows) => {
            if (!cancel) setAppointments(Array.isArray(rows) ? rows : []);
        }).catch(() => {
            if (!cancel) setAppointments([]);
        });
        return () => {
            cancel = true;
        };
    }, [days, today]);

    const chips = useMemo(
        () => collectShareOpenSlotChips({
            staff,
            appointments,
            days,
            staffFilterId: staffFilter,
            unassignedName: tm('bClinicBoardUnassigned'),
        }),
        [staff, appointments, days, staffFilter, tm],
    );
    const chipKey = chips.map((chip) => chip.id).join('|');

    useEffect(() => {
        setPicked(new Set(chips.map((chip) => chip.id)));
        setFocusDay(days[0] || '');
    }, [chipKey, days]);

    const firmName = (selectedFirm?.name || selectedFirm?.title || SHARE_SLOTS_BRAND).trim() || SHARE_SLOTS_BRAND;
    const title = titleId === 'available'
        ? tm('bShareOpenSlotsTitleAvailable')
        : titleId === 'room'
            ? tm('bShareOpenSlotsTitleRoom')
            : tm('bShareOpenSlotsTitleOurs');
    const link = shareSlotsPublicLink({
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        firmNr: String(selectedFirm?.firm_nr || '001'),
        periodNr: String(selectedPeriod?.nr ?? 1).padStart(2, '0'),
        token,
    });
    const linkLabel = shareSlotsLinkCaption(link, firmName);
    const activeStaff = staff.filter((person) => person.is_active !== false);
    const dayCards = days.map((day, index) => ({
        day,
        label: shareSlotsDayCaption(
            index,
            { today: tm('bClinicBoardToday'), tomorrow: tm('bShareOpenSlotsTomorrow') },
            day,
            locale,
        ),
        chips: chips.filter((chip) => chip.dayYmd === day),
    }));
    const previewDay = dayCards.some((card) => card.day === focusDay) ? focusDay : (dayCards[0]?.day || '');
    const previewCard = dayCards.find((card) => card.day === previewDay) ?? dayCards[0];
    const previewPills = (previewCard?.chips ?? []).filter((chip) => picked.has(chip.id)).map((chip) => chip.label);
    const selectedCount = chips.filter((chip) => picked.has(chip.id)).length;
    const counter = tm('bShareOpenSlotsSelected')
        .replace('{picked}', String(selectedCount))
        .replace('{total}', String(chips.length));

    useEffect(() => {
        if (mode !== 'video') {
            setReveal(previewPills.length);
            return undefined;
        }
        const plan = shareSlotsVideoPlan(previewPills.length);
        let step = 0;
        setReveal(plan.counts[0] ?? 0);
        const timer = window.setInterval(() => {
            step += 1;
            if (step >= plan.counts.length) {
                window.clearInterval(timer);
                return;
            }
            setReveal(plan.counts[step] ?? previewPills.length);
        }, 320);
        return () => window.clearInterval(timer);
    }, [mode, previewDay, previewPills.join('|')]);

    const visiblePills = mode === 'video' ? previewPills.slice(0, reveal) : previewPills;
    const background: ShareSlotsBackground = backgroundKind === 'preset'
        ? {
            kind: 'preset',
            from: SHARE_SLOTS_PRESETS.find((item) => item.id === presetId)?.from || SHARE_SLOTS_NAVY,
            to: SHARE_SLOTS_PRESETS.find((item) => item.id === presetId)?.to || '#12315c',
        }
        : { kind: 'solid', color: SHARE_SLOTS_NAVY };
    const phoneStyle = photo && backgroundKind === 'photo'
        ? { backgroundImage: `linear-gradient(rgba(7,24,51,0.55), rgba(7,24,51,0.55)), url(${photo.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : background.kind === 'preset'
            ? { backgroundImage: `linear-gradient(180deg, ${background.from}, ${background.to})` }
            : { backgroundColor: SHARE_SLOTS_NAVY };

    const toggle = (id: string) => {
        setPicked((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const message = () => composeShareSlotsMessage({
        firmName,
        heading: title,
        note,
        groups: shareSlotsForPickedDays({
            staff,
            appointments,
            days: dayCards.map((card) => ({ ymd: card.day, label: card.label })),
            staffFilterId: staffFilter,
            unassignedName: tm('bClinicBoardUnassigned'),
            picked,
        }),
        link,
        brand: SHARE_SLOTS_BRAND,
    });

    const storyFrame = () => ({
        firmName,
        initial: shareSlotsFirmInitial(firmName),
        title,
        dayLabel: previewCard?.label || tm('bClinicBoardToday'),
        pills: previewPills,
        visiblePills: previewPills.length,
        cta: tm('bShareOpenSlotsTapLink'),
        linkLabel,
        brand: SHARE_SLOTS_BRAND,
        background,
        photo: backgroundKind === 'photo' ? photo : null,
        width: 1080,
        height: 1920,
    });

    const onDownload = async () => {
        setExportError('');
        setBusy(true);
        try {
            if (mode === 'image') {
                const blob = await renderShareSlotsPng(storyFrame());
                downloadShareBlob(blob, 'RetailEX-bos-saatler.png');
            } else {
                const blob = await recordShareSlotsVideo(storyFrame());
                downloadShareBlob(blob, 'RetailEX-bos-saatler.webm');
            }
        } catch {
            setExportError(tm('bShareOpenSlotsExportError'));
        } finally {
            setBusy(false);
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(link);
        } catch {
            const area = document.createElement('textarea');
            area.value = link;
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
        }
        setCopied(true);
    };

    const openWhatsApp = () => {
        window.open(shareSlotsWhatsAppUrl(message()), '_blank', 'noopener,noreferrer');
    };

    const onPhoto = (file: File | undefined) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                setPhoto(image);
                setBackgroundKind('photo');
            };
            image.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
    };

    return (
        <div data-testid="share-open-slots-page" className="min-h-full bg-[#eef2f6] p-3 sm:p-5">
            <div className="mx-auto grid max-w-[1180px] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
                <section className="rounded-2xl border border-[#e6eaf0] bg-white p-4 shadow-sm sm:p-5">
                    <div className="mb-3 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onBack}
                            aria-label={tm('bShareOpenSlotsBack')}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                        >
                            <ChevronLeft size={18} aria-hidden />
                        </button>
                        <h1 className="text-lg font-bold text-slate-900">{tm('bShareOpenSlotsNav')}</h1>
                    </div>
                    <p className="mb-5 text-sm leading-relaxed text-slate-500">{tm('bShareOpenSlotsLead')}</p>

                    <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="share-slots-staff">
                        {tm('bShareOpenSlotsWho')}
                    </label>
                    <div className="relative mb-4">
                        <select
                            id="share-slots-staff"
                            aria-label={tm('bShareOpenSlotsWho')}
                            value={staffFilter}
                            onChange={(event) => setStaffFilter(event.target.value)}
                            className="h-11 w-full appearance-none rounded-xl border border-[#e6eaf0] bg-[#f8fafc] px-3 pr-10 text-sm font-medium text-slate-800"
                        >
                            <option value="">{tm('bShareOpenSlotsAllTeam')}</option>
                            {activeStaff.map((person) => (
                                <option key={person.id} value={person.id}>{person.name}</option>
                            ))}
                        </select>
                        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                    </div>

                    <p className="mb-2 text-sm font-semibold text-slate-800">{tm('bShareOpenSlotsWhichDays')}</p>
                    <div className="mb-4 flex flex-wrap gap-2">
                        {DAY_PRESETS.map((item) => {
                            const on = preset === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    data-testid={`share-slots-preset-${item.id}`}
                                    aria-pressed={on}
                                    onClick={() => setPreset(item.id)}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                                        on ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'
                                    }`}
                                >
                                    {tm(item.labelKey)}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-800">{tm('bShareOpenSlotsHours')}</p>
                        <p className="text-xs font-medium text-slate-400" data-testid="share-slots-counter">{counter}</p>
                    </div>
                    <div className="mb-5 space-y-3">
                        {dayCards.map((card) => (
                            <div key={card.day}>
                                <button
                                    type="button"
                                    onClick={() => setFocusDay(card.day)}
                                    className={`mb-2 text-sm font-semibold ${card.day === previewDay ? 'text-slate-800' : 'text-slate-500'}`}
                                >
                                    {card.label}
                                </button>
                                {card.chips.length === 0 ? (
                                    <p className="text-xs text-slate-400">{tm('bShareOpenSlotsEmpty')}</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {card.chips.map((chip) => {
                                            const on = picked.has(chip.id);
                                            return (
                                                <button
                                                    key={chip.id}
                                                    type="button"
                                                    data-testid={`share-slot-${chip.dayYmd}-${chip.label}`}
                                                    aria-pressed={on}
                                                    onClick={() => toggle(chip.id)}
                                                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums ${
                                                        on ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-500'
                                                    }`}
                                                >
                                                    {chip.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <p className="mb-2 text-sm font-semibold text-slate-800">{tm('bShareOpenSlotsBackground')}</p>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            aria-pressed={backgroundKind === 'solid'}
                            onClick={() => setBackgroundKind('solid')}
                            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                                backgroundKind === 'solid' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-slate-50 text-slate-600'
                            }`}
                        >
                            {tm('bShareOpenSlotsBgSolid')}
                        </button>
                        <label className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold ${
                            backgroundKind === 'photo' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-slate-50 text-slate-600'
                        }`}
                        >
                            {tm('bShareOpenSlotsBgPhoto')}
                            <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={(event) => onPhoto(event.target.files?.[0])}
                            />
                        </label>
                        <button
                            type="button"
                            aria-pressed={backgroundKind === 'preset'}
                            onClick={() => setBackgroundKind('preset')}
                            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                                backgroundKind === 'preset' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-slate-50 text-slate-600'
                            }`}
                        >
                            {tm('bShareOpenSlotsBgPreset')}
                        </button>
                    </div>
                    {backgroundKind === 'preset' && (
                        <div className="mb-4 flex gap-2">
                            {SHARE_SLOTS_PRESETS.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    aria-label={item.id}
                                    aria-pressed={presetId === item.id}
                                    onClick={() => setPresetId(item.id)}
                                    className={`h-8 w-14 rounded-lg border ${presetId === item.id ? 'border-blue-600' : 'border-transparent'}`}
                                    style={{ backgroundImage: `linear-gradient(90deg, ${item.from}, ${item.to})` }}
                                />
                            ))}
                        </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="share-slots-title">
                                {tm('bShareOpenSlotsTitle')}
                            </label>
                            <div className="relative">
                                <select
                                    id="share-slots-title"
                                    aria-label={tm('bShareOpenSlotsTitle')}
                                    value={titleId}
                                    onChange={(event) => setTitleId(event.target.value as TitleId)}
                                    className="h-11 w-full appearance-none rounded-xl border border-[#e6eaf0] bg-white px-3 pr-10 text-sm font-medium text-slate-800"
                                >
                                    <option value="ours">{tm('bShareOpenSlotsTitleOurs')}</option>
                                    <option value="available">{tm('bShareOpenSlotsTitleAvailable')}</option>
                                    <option value="room">{tm('bShareOpenSlotsTitleRoom')}</option>
                                </select>
                                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="share-slots-note">
                                {tm('bShareOpenSlotsNote')}
                            </label>
                            <input
                                id="share-slots-note"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder={tm('bShareOpenSlotsNotePh')}
                                className="h-11 w-full rounded-xl border border-[#e6eaf0] px-3 text-sm text-slate-800 outline-none focus:border-blue-400"
                            />
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border border-[#e6eaf0] bg-white p-3 shadow-sm sm:p-4">
                    <div className="mb-4 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            data-testid="share-slots-mode-video"
                            aria-pressed={mode === 'video'}
                            onClick={() => setMode('video')}
                            className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold ${
                                mode === 'video' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'
                            }`}
                        >
                            <Clapperboard size={16} aria-hidden />
                            {tm('bShareOpenSlotsVideo')}
                        </button>
                        <button
                            type="button"
                            data-testid="share-slots-mode-image"
                            aria-pressed={mode === 'image'}
                            onClick={() => setMode('image')}
                            className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold ${
                                mode === 'image' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'
                            }`}
                        >
                            <ImageIcon size={16} aria-hidden />
                            {tm('bShareOpenSlotsImage')}
                        </button>
                    </div>

                    <div className="mb-4 flex justify-center">
                        <div
                            data-testid="share-slots-phone"
                            className="flex aspect-[9/16] w-[280px] flex-col rounded-[28px] px-4 py-6 text-white shadow-lg"
                            style={phoneStyle}
                        >
                            <div className="mb-6 flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-[#071833]">
                                    {shareSlotsFirmInitial(firmName)}
                                </span>
                                <span className="text-sm font-semibold">{firmName}</span>
                            </div>
                            <p className="mb-2 text-2xl font-extrabold leading-tight">{title}</p>
                            <p className="mb-4 text-sm font-bold text-[#f0b429]">{previewCard?.label}</p>
                            <div className="flex flex-wrap justify-center gap-1.5">
                                {visiblePills.map((pill) => (
                                    <span
                                        key={pill}
                                        className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-900"
                                    >
                                        {pill}
                                    </span>
                                ))}
                            </div>
                            <div className="mt-auto flex flex-col items-center gap-2 pb-2 text-center">
                                <p className="text-xs font-medium text-slate-200">{tm('bShareOpenSlotsTapLink')}</p>
                                <span aria-hidden className="text-sm">↓</span>
                                <span className="max-w-full truncate rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-900">
                                    {linkLabel}
                                </span>
                                <span className="text-[10px] font-semibold tracking-wide text-slate-300">{SHARE_SLOTS_BRAND}</span>
                            </div>
                        </div>
                    </div>

                    {exportError ? <p className="mb-2 text-center text-xs font-medium text-red-600">{exportError}</p> : null}
                    <button
                        type="button"
                        data-testid="share-slots-download"
                        onClick={() => { void onDownload(); }}
                        disabled={busy}
                        className="mb-2 flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                        {mode === 'video' ? tm('bShareOpenSlotsDownloadVideo') : tm('bShareOpenSlotsDownloadImage')}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            data-testid="share-slots-copy-link"
                            onClick={() => { void copyLink(); }}
                            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#e6eaf0] text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                            <Link2 size={14} aria-hidden />
                            {copied ? tm('bShareOpenSlotsCopied') : tm('bShareOpenSlotsCopyLink')}
                        </button>
                        <button
                            type="button"
                            data-testid="share-slots-whatsapp"
                            onClick={openWhatsApp}
                            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#e6eaf0] text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                            <MessageCircle size={14} aria-hidden />
                            {tm('bShareOpenSlotsWhatsApp')}
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}
