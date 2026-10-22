import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Clapperboard, Clock, Download, ImageIcon, Instagram, Link2, MessageCircle, Send } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { beautyService } from '../../../services/beautyService';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { formatLocalYmd } from '../../../utils/dateLocal';
import {
    SHARE_SLOTS_BRAND,
    SHARE_SLOTS_NAVY,
    SHARE_SLOTS_PRESETS,
    SHARE_STORY_REVEAL_MS,
    collectShareOpenSlotChips,
    composeShareSlotsMessage,
    downloadShareBlob,
    recordShareSlotsVideo,
    renderShareSlotsPng,
    shareSlotsDayCaption,
    shareSlotsDayYmds,
    shareSlotsFirmInitial,
    shareSlotsPillMotion,
    shareSlotsPublicLink,
    shareSlotsForPickedDays,
    shareSlotsWhatsAppUrl,
    type ShareSlotsBackground,
    type ShareSlotsDayPreset,
    type ShareSlotsPresetId,
} from '../share-slots/shareSlotsStory';
import { readClinicSocialConnect, rememberSocialConnectFocus, rememberWhatsAppRecipient, type PortalWhatsAppSnapshot, type SocialAccountHint, type SocialChatHint } from '../share-slots/socialConnect';
import { buildShareStoryPublishPlan, buildShareWhatsAppStatusPlan, runInstagramStoryPublish, runWhatsAppMessagePublish, runWhatsAppStatusPublish, toPublishSecrets } from '../share-slots/shareSlotsPublish';

type Props = {
    onBack: () => void;
    onOpenConnect?: (channel: 'instagram' | 'whatsapp') => void;
};

type OutputMode = 'video' | 'image';
type BackgroundKind = 'solid' | 'photo' | 'preset';
type TitleId = 'ours' | 'available' | 'room';

const DAY_PRESETS: { id: ShareSlotsDayPreset; labelKey: string }[] = [
    { id: 'today_tomorrow', labelKey: 'bShareOpenSlotsTodayTomorrow' },
    { id: 'three', labelKey: 'bShareOpenSlotsDays3' },
    { id: 'seven', labelKey: 'bShareOpenSlotsDays7' },
];

export function ShareOpenSlotsPage({ onBack, onOpenConnect }: Props) {
    const { tm } = useLanguage();
    const locale = tm('localeCode') || 'tr-TR';
    const { selectedFirm, selectedPeriod } = useFirmaDonem();
    const [staff, setStaff] = useState<BeautySpecialist[]>([]);
    const [staffReady, setStaffReady] = useState(false);
    const [appointments, setAppointments] = useState<BeautyAppointment[]>([]);
    const [appointmentsReady, setAppointmentsReady] = useState(false);
    const [staffFilter, setStaffFilter] = useState('');
    const [preset, setPreset] = useState<ShareSlotsDayPreset>('today_tomorrow');
    const [picked, setPicked] = useState<Set<string>>(() => new Set());
    const [backgroundKind, setBackgroundKind] = useState<BackgroundKind>('preset');
    const [solidColor, setSolidColor] = useState(SHARE_SLOTS_NAVY);
    const [presetId, setPresetId] = useState<ShareSlotsPresetId>('navy');
    const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
    const [titleId, setTitleId] = useState<TitleId>('ours');
    const [note, setNote] = useState('');
    const [mode, setMode] = useState<OutputMode>('video');
    const [focusDay, setFocusDay] = useState('');
    const [token, setToken] = useState('');
    const [portalWa, setPortalWa] = useState<PortalWhatsAppSnapshot | null>(null);
    const [socialAccounts, setSocialAccounts] = useState<SocialAccountHint[]>([]);
    const [socialChats, setSocialChats] = useState<SocialChatHint[]>([]);
    const [socialTick, setSocialTick] = useState(0);
    const [recipient, setRecipient] = useState('');
    const [copied, setCopied] = useState(false);
    const [exportError, setExportError] = useState('');
    const [publishNote, setPublishNote] = useState('');
    const [busy, setBusy] = useState(false);
    const pillRefs = useRef<HTMLSpanElement[]>([]);
    const today = formatLocalYmd(new Date());

    useEffect(() => {
        let cancel = false;
        beautyService.getSpecialists().then((rows) => {
            if (!cancel) setStaff(Array.isArray(rows) ? rows : []);
        }).catch(() => {
            if (!cancel) setStaff([]);
        }).finally(() => {
            if (!cancel) setStaffReady(true);
        });
        beautyService.getPortalSettings().then((settings) => {
            if (cancel) return;
            setToken(settings?.public_token?.trim() || '');
            setPortalWa(settings ?? null);
        }).catch(() => {
            if (!cancel) {
                setToken('');
                setPortalWa(null);
            }
        });
        return () => {
            cancel = true;
        };
    }, []);

    const days = useMemo(() => shareSlotsDayYmds(today, preset), [today, preset]);

    useEffect(() => {
        let cancel = false;
        setAppointmentsReady(false);
        const end = days[days.length - 1] || today;
        beautyService.getAppointmentsInRange(days[0] || today, end).then((rows) => {
            if (!cancel) setAppointments(Array.isArray(rows) ? rows : []);
        }).catch(() => {
            if (!cancel) setAppointments([]);
        }).finally(() => {
            if (!cancel) setAppointmentsReady(true);
        });
        return () => {
            cancel = true;
        };
    }, [days, today]);

    const chips = useMemo(
        () => {
            if (!staffReady || !appointmentsReady) return [];
            return collectShareOpenSlotChips({
                staff,
                appointments,
                days,
                staffFilterId: staffFilter,
                unassignedName: tm('bClinicBoardUnassigned'),
            });
        },
        [staffReady, appointmentsReady, staff, appointments, days, staffFilter, tm],
    );
    const chipKey = chips.map((chip) => chip.id).join('|');

    useEffect(() => {
        setPicked(new Set(chips.map((chip) => chip.id)));
        setFocusDay(days[0] || '');
    }, [chipKey, days]);

    const firmName = (selectedFirm?.firma_adi || selectedFirm?.title || selectedFirm?.name || SHARE_SLOTS_BRAND).trim() || SHARE_SLOTS_BRAND;
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
    const footer = tm('bShareSlotsFooter');
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

    const pillKey = previewPills.join('|');
    useEffect(() => {
        let raf = 0;
        let start = 0;
        const holdMs = 800;
        const cycle = SHARE_STORY_REVEAL_MS + holdMs;
        const paint = (progress: number) => {
            const nodes = pillRefs.current;
            const count = nodes.length;
            nodes.forEach((el, index) => {
                if (!el) return;
                const motion = mode === 'video'
                    ? shareSlotsPillMotion(index, count, progress)
                    : { opacity: 1, scale: 1 };
                el.style.opacity = String(motion.opacity);
                el.style.transform = `scale(${motion.scale})`;
            });
        };
        if (mode !== 'video') {
            paint(1);
            return undefined;
        }
        const frame = window.requestAnimationFrame ?? ((cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16));
        const cancel = window.cancelAnimationFrame ?? ((id: number) => window.clearTimeout(id));
        const tick = (now: number) => {
            if (!start) start = now;
            const elapsed = (now - start) % cycle;
            const progress = elapsed >= SHARE_STORY_REVEAL_MS ? 1 : elapsed / SHARE_STORY_REVEAL_MS;
            paint(progress);
            raf = frame(tick);
        };
        raf = frame(tick);
        return () => cancel(raf);
    }, [mode, previewDay, pillKey]);

    const background: ShareSlotsBackground = backgroundKind === 'preset'
        ? {
            kind: 'preset',
            from: SHARE_SLOTS_PRESETS.find((item) => item.id === presetId)?.from || SHARE_SLOTS_NAVY,
            to: SHARE_SLOTS_PRESETS.find((item) => item.id === presetId)?.to || '#12315c',
        }
        : { kind: 'solid', color: solidColor || SHARE_SLOTS_NAVY };
    const phoneStyle = photo && backgroundKind === 'photo'
        ? { backgroundImage: `linear-gradient(rgba(7,24,51,0.55), rgba(7,24,51,0.55)), url(${photo.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : background.kind === 'preset'
            ? { backgroundImage: `linear-gradient(180deg, ${background.from}, ${background.to})` }
            : { backgroundColor: background.kind === 'solid' ? background.color : SHARE_SLOTS_NAVY };

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
        linkLabel: firmName,
        brand: footer,
        note,
        background,
        photo: backgroundKind === 'photo' ? photo : null,
        width: 1080,
        height: 1920,
    });

    const onDownload = async () => {
        setExportError('');
        setBusy(true);
        const frame = storyFrame();
        try {
            if (mode === 'image') {
                const blob = await renderShareSlotsPng(frame);
                if (!blob.size) throw new Error('empty');
                downloadShareBlob(blob, 'RetailEX-bos-saatler.png');
                return;
            }
            try {
                const blob = await recordShareSlotsVideo(frame);
                if (!blob.size) throw new Error('empty');
                const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
                downloadShareBlob(blob, `RetailEX-bos-saatler.${ext}`);
            } catch {
                setExportError(tm('bShareSlotsRecorderFallback'));
                const blob = await renderShareSlotsPng(frame);
                if (blob.size) downloadShareBlob(blob, 'RetailEX-bos-saatler.png');
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

    const social = useMemo(
        () => readClinicSocialConnect({ portal: portalWa, accounts: socialAccounts, chats: socialChats }),
        [portalWa, socialTick, socialAccounts, socialChats],
    );

    useEffect(() => {
        let cancel = false;
        void import('../../../services/messaging/clinicSocialRepository').then(async (mod) => {
            const [accounts, messages] = await Promise.all([
                mod.listSocialAccounts(),
                mod.listSocialMessages(),
            ]);
            if (cancel) return;
            setSocialAccounts(accounts);
            setSocialChats(messages.map((row) => ({ channel: row.channel, counterparty: row.counterparty })));
        }).catch(() => {
            if (!cancel) {
                setSocialAccounts([]);
                setSocialChats([]);
            }
        });
        return () => {
            cancel = true;
        };
    }, [socialTick]);

    useEffect(() => {
        const onFocus = () => setSocialTick((value) => value + 1);
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    useEffect(() => {
        if (!social.whatsapp.savedNumber) return;
        setRecipient((current) => current || social.whatsapp.savedNumber);
    }, [social.whatsapp.savedNumber]);

    const askConnect = (channel: 'instagram' | 'whatsapp') => {
        setPublishNote(tm('bShareOpenSlotsNotConnected'));
        rememberSocialConnectFocus(channel);
        onOpenConnect?.(channel);
    };

    const captureStoryFile = async (): Promise<{ kind: 'image' | 'video'; bytes: Uint8Array; mime: string } | null> => {
        const frame = storyFrame();
        if (mode === 'image') {
            const blob = await renderShareSlotsPng(frame);
            if (!blob.size) return null;
            return { kind: 'image', bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || 'image/png' };
        }
        const blob = await recordShareSlotsVideo(frame);
        if (!blob.size) return null;
        const mime = blob.type || 'video/webm';
        return { kind: 'video', bytes: new Uint8Array(await blob.arrayBuffer()), mime };
    };

    const onInstagram = async () => {
        setPublishNote('');
        const current = readClinicSocialConnect({ portal: portalWa, accounts: socialAccounts, chats: socialChats });
        if (!current.instagram.connected) {
            askConnect('instagram');
            return;
        }
        setBusy(true);
        try {
            const file = await captureStoryFile();
            if (!file) {
                setExportError(tm('bShareOpenSlotsExportError'));
                return;
            }
            const secrets = toPublishSecrets(current);
            const plan = buildShareStoryPublishPlan({
                media: { kind: file.kind, mime: file.mime, byteLength: file.bytes.byteLength },
                secrets,
            });
            const result = await runInstagramStoryPublish(plan, {
                pageAccessToken: secrets.pageAccessToken,
                bytes: file.bytes,
            });
            if (result.status === 'not_connected') {
                askConnect('instagram');
                return;
            }
            if (result.status === 'media_url_required') {
                setPublishNote(tm('bShareOpenSlotsIgNeedUrl'));
                return;
            }
            if (result.status !== 'published') {
                setPublishNote(tm('bShareOpenSlotsPublishFail'));
                return;
            }
            setPublishNote(tm('bShareOpenSlotsIgOk'));
        } catch {
            setPublishNote(tm('bShareOpenSlotsPublishFail'));
        } finally {
            setBusy(false);
        }
    };

    const onWhatsAppSend = async () => {
        setPublishNote('');
        const current = readClinicSocialConnect({ portal: portalWa, accounts: socialAccounts, chats: socialChats });
        if (!current.whatsapp.connected) {
            askConnect('whatsapp');
            return;
        }
        const secrets = toPublishSecrets(current);
        const probe = buildShareStoryPublishPlan({
            media: { kind: mode === 'video' ? 'video' : 'image', mime: mode === 'video' ? 'video/webm' : 'image/png' },
            secrets,
            recipient,
        });
        if (probe.whatsapp.status === 'not_connected') {
            askConnect('whatsapp');
            return;
        }
        if (probe.whatsapp.status === 'recipient_required') {
            setPublishNote(tm('bShareOpenSlotsNeedNumber'));
            return;
        }
        setBusy(true);
        try {
            const file = await captureStoryFile();
            if (!file) {
                setExportError(tm('bShareOpenSlotsExportError'));
                return;
            }
            const plan = buildShareStoryPublishPlan({
                media: { kind: file.kind, mime: file.mime, byteLength: file.bytes.byteLength },
                secrets,
                recipient,
                caption: message(),
            });
            const result = await runWhatsAppMessagePublish(plan, {
                accessToken: secrets.whatsappAccessToken,
                bridgeToken: secrets.bridgeToken,
                evolutionToken: secrets.evolutionToken,
                bytes: file.bytes,
            });
            if (result.status === 'not_connected') {
                askConnect('whatsapp');
                return;
            }
            if (result.status === 'recipient_required') {
                setPublishNote(tm('bShareOpenSlotsNeedNumber'));
                return;
            }
            if (result.status !== 'sent') {
                setPublishNote(tm('bShareOpenSlotsPublishFail'));
                return;
            }
            rememberWhatsAppRecipient(plan.whatsapp.to);
            setSocialTick((value) => value + 1);
            setPublishNote(tm('bShareOpenSlotsWaOk'));
        } catch {
            setPublishNote(tm('bShareOpenSlotsPublishFail'));
        } finally {
            setBusy(false);
        }
    };

    const onWhatsAppStatus = async () => {
        setPublishNote('');
        const current = readClinicSocialConnect({ portal: portalWa, accounts: socialAccounts, chats: socialChats });
        if (!current.whatsapp.connected) {
            askConnect('whatsapp');
            return;
        }
        const secrets = toPublishSecrets(current);
        const probe = buildShareWhatsAppStatusPlan({
            media: { kind: mode === 'video' ? 'video' : 'image', mime: mode === 'video' ? 'video/webm' : 'image/png', byteLength: 1 },
            secrets,
            caption: message(),
        });
        if (probe.status === 'not_connected') {
            askConnect('whatsapp');
            return;
        }
        if (probe.status === 'unsupported') {
            setPublishNote(tm('bShareOpenSlotsWaStatusCloud'));
            return;
        }
        if (probe.status === 'media_url_required') {
            setPublishNote(tm('bShareOpenSlotsWaStatusNeedUrl'));
            return;
        }
        if (probe.status !== 'ready') {
            setPublishNote(tm('bShareOpenSlotsPublishFail'));
            return;
        }
        setBusy(true);
        try {
            const file = await captureStoryFile();
            if (!file) {
                setExportError(tm('bShareOpenSlotsExportError'));
                return;
            }
            const plan = buildShareWhatsAppStatusPlan({
                media: { kind: file.kind, mime: file.mime, byteLength: file.bytes.byteLength },
                secrets,
                caption: message(),
            });
            const result = await runWhatsAppStatusPublish(plan, {
                bridgeToken: secrets.bridgeToken,
                evolutionToken: secrets.evolutionToken,
                bytes: file.bytes,
            });
            if (result.status === 'not_connected') {
                askConnect('whatsapp');
                return;
            }
            if (result.status === 'unsupported') {
                setPublishNote(tm('bShareOpenSlotsWaStatusCloud'));
                return;
            }
            if (result.status === 'media_url_required') {
                setPublishNote(tm('bShareOpenSlotsWaStatusNeedUrl'));
                return;
            }
            if (result.status !== 'posted') {
                setPublishNote(tm('bShareOpenSlotsPublishFail'));
                return;
            }
            setPublishNote(tm('bShareOpenSlotsWaStatusOk'));
        } catch {
            setPublishNote(tm('bShareOpenSlotsPublishFail'));
        } finally {
            setBusy(false);
        }
    };

    const igLabel = tm('bShareOpenSlotsIgShare');
    const waSendLabel = tm('bShareOpenSlotsWaSend');
    const waStatusLabel = tm('bShareOpenSlotsWaStatus');

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

    pillRefs.current = [];

    return (
        <div data-testid="share-open-slots-page" className="min-h-full bg-[#eef2f6] p-3 sm:p-5">
            <div
                className="mx-auto grid max-w-[1180px] items-start gap-4"
                style={{ gridTemplateColumns: 'minmax(0, 1fr) 400px' }}
            >
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
                                    className="rounded-lg px-3 py-1.5 text-sm font-semibold"
                                    style={on
                                        ? { backgroundColor: '#2f6bff', color: '#fff' }
                                        : { backgroundColor: '#e8f1ff', color: '#3b82f6' }}
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
                                                className="rounded-lg border px-3 py-1.5 text-sm font-semibold tabular-nums"
                                                style={on
                                                    ? { backgroundColor: '#2f6bff', borderColor: '#2f6bff', color: '#fff' }
                                                    : { backgroundColor: '#fff', borderColor: '#d5dbe3', color: '#475569' }}
                                            >
                                                {chip.label}
                                            </button>
                                        );
                                    })}
                                </div>
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
                        <label
                            onClick={() => setBackgroundKind('photo')}
                            className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold ${
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
                    {backgroundKind === 'solid' && (
                        <label className="mb-4 flex items-center gap-3 text-sm text-slate-600">
                            <input
                                type="color"
                                aria-label={tm('bShareOpenSlotsBgSolid')}
                                value={solidColor}
                                onChange={(event) => setSolidColor(event.target.value)}
                                className="h-10 w-14 cursor-pointer rounded-lg border border-[#e6eaf0] bg-white"
                            />
                            <span className="font-mono text-xs">{solidColor}</span>
                        </label>
                    )}
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
                            className="flex flex-col rounded-[28px] px-4 py-6 text-white shadow-lg"
                            style={{ ...phoneStyle, width: 280, aspectRatio: '9 / 16' }}
                        >
                            <div className="mb-6 flex items-center gap-2">
                                <span
                                    className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
                                    style={{ backgroundColor: '#fff', color: '#071833' }}
                                >
                                    {shareSlotsFirmInitial(firmName)}
                                </span>
                                <span className="text-sm font-semibold">{firmName}</span>
                            </div>
                            <p className="mb-2 text-[26px] font-extrabold leading-tight">{title}</p>
                            <p className="mb-2 text-sm font-bold text-[#f0b429]">{previewCard?.label}</p>
                            {note.trim() ? (
                                <p data-testid="share-slots-note-preview" className="mb-3 text-center text-[11px] font-semibold text-white">
                                    {note.trim()}
                                </p>
                            ) : null}
                            <div className="flex flex-wrap justify-center gap-1.5">
                                {previewPills.map((pill, index) => (
                                    <span
                                        key={`${previewDay}-${pill}-${index}`}
                                        ref={(node) => {
                                            if (node) pillRefs.current[index] = node;
                                        }}
                                        className="inline-flex items-center justify-center rounded-full text-[11px] font-bold"
                                        style={{
                                            width: 54,
                                            height: 28,
                                            backgroundColor: '#fff',
                                            color: '#0f172a',
                                            opacity: mode === 'video' ? 0 : 1,
                                            transform: mode === 'video' ? 'scale(0.84)' : 'scale(1)',
                                        }}
                                    >
                                        {pill}
                                    </span>
                                ))}
                            </div>
                            <div className="mt-auto flex flex-col items-center gap-2 pb-2 text-center">
                                <p className="text-xs font-medium text-slate-200">{tm('bShareOpenSlotsTapLink')}</p>
                                <span aria-hidden className="text-sm">↓</span>
                                <span
                                    className="max-w-full truncate rounded-full px-4 py-2 text-xs font-bold"
                                    style={{ backgroundColor: '#fff', color: '#0f172a' }}
                                >
                                    {firmName}
                                </span>
                                <span className="text-[10px] font-semibold tracking-wide text-slate-300">{footer}</span>
                            </div>
                        </div>
                    </div>

                    {exportError ? <p className="mb-2 text-center text-xs font-medium text-red-600">{exportError}</p> : null}
                    {publishNote ? <p role="status" className="mb-2 text-center text-xs font-medium text-slate-600">{publishNote}</p> : null}
                    <button
                        type="button"
                        data-testid="share-slots-download"
                        onClick={() => { void onDownload(); }}
                        disabled={busy}
                        className="mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:opacity-60"
                        style={{ backgroundColor: '#2f6bff', color: '#fff' }}
                    >
                        <Download size={16} aria-hidden />
                        {mode === 'video' ? tm('bShareOpenSlotsDownloadVideo') : tm('bShareOpenSlotsDownloadImage')}
                    </button>
                    {!social.instagram.connected ? (
                        <p data-testid="share-slots-ig-off" className="mb-2 text-center text-[11px] font-medium text-amber-800">
                            {tm('bShareOpenSlotsNotConnected')}
                        </p>
                    ) : null}
                    <div className="mb-2 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            data-testid="share-slots-instagram"
                            onClick={() => { void onInstagram(); }}
                            disabled={busy}
                            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#e6eaf0] px-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                            <Instagram size={14} aria-hidden />
                            {igLabel}
                        </button>
                        <button
                            type="button"
                            data-testid="share-slots-whatsapp-send"
                            onClick={() => { void onWhatsAppSend(); }}
                            disabled={busy}
                            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#e6eaf0] px-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                            <Send size={14} aria-hidden />
                            {waSendLabel}
                        </button>
                    </div>
                    <button
                        type="button"
                        data-testid="share-slots-whatsapp-status"
                        onClick={() => { void onWhatsAppStatus(); }}
                        disabled={busy}
                        className="mb-1 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-[#e6eaf0] px-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                        <Clock size={14} aria-hidden />
                        {waStatusLabel}
                    </button>
                    <p className="mb-2 text-[11px] leading-snug text-slate-500">{tm('bShareOpenSlotsWaStatusHint')}</p>
                    <label className="mb-2 block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-500">{tm('bShareOpenSlotsRecipient')}</span>
                        <input
                            data-testid="share-slots-wa-recipient"
                            list="share-slots-wa-chats"
                            inputMode="tel"
                            autoComplete="off"
                            value={recipient}
                            onChange={(event) => setRecipient(event.target.value)}
                            placeholder={tm('bShareOpenSlotsRecipientPh')}
                            aria-label={tm('bShareOpenSlotsRecipient')}
                            title={social.whatsapp.recentChats.length ? tm('bShareOpenSlotsRecent') : undefined}
                            className="h-10 w-full rounded-xl border border-[#e6eaf0] bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#93c5fd]"
                        />
                        <datalist id="share-slots-wa-chats">
                            {social.whatsapp.recentChats.map((chat) => (
                                <option key={chat.number} value={chat.number}>{chat.label}</option>
                            ))}
                        </datalist>
                        <span className="mt-1 block text-[11px] leading-snug text-slate-500">{tm('bShareOpenSlotsWaChatHint')}</span>
                    </label>
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
