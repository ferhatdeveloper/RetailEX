import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Download, Image as ImageIcon, Instagram, Link2, MessageCircle, Send, Video } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { beautyService } from '../../../services/beautyService';
import { ERP_SETTINGS } from '../../../services/postgres';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { formatLocalYmd } from '../../../utils/dateLocal';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import {
    SHARE_BG_PRESETS,
    SHARE_NAVY,
    SHARE_STORY_HEIGHT,
    SHARE_STORY_REVEAL_MS,
    SHARE_STORY_WIDTH,
    buildShareSlotsText,
    buildShareStoryPlan,
    groupShareSlotsByDay,
    listShareOpenSlots,
    paintShareStory,
    recordShareStory,
    shareCopyPayload,
    shareSpanYmds,
    type ShareBgPresetId,
    type ShareDaySpan,
} from './shareSlotsStory';
import { readClinicSocialConnect, rememberSocialConnectFocus, rememberWhatsAppRecipient, type PortalWhatsAppSnapshot, type SocialAccountHint, type SocialChatHint } from './socialConnect';
import { buildShareStoryPublishPlan, runInstagramStoryPublish, runWhatsAppMessagePublish, toPublishSecrets } from './shareSlotsPublish';

const TITLE_KEYS = ['bShareSlotsTitleOurs', 'bShareSlotsTitleOpen', 'bShareSlotsTitleBook'] as const;

type BgMode = 'solid' | 'photo' | 'preset';
type StoryTab = 'video' | 'image';

type Props = {
    staff: BeautySpecialist[];
    anchorYmd: string;
    onClose: () => void;
    onOpenConnect?: (channel: 'instagram' | 'whatsapp') => void;
};

function storyFileBase(ymd: string): string {
    return `RetailEX-bos-saatler-${ymd}`;
}

async function writeClipboard(value: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(value);
        return;
    } catch {
        /* yedek kopya */
    }
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', 'true');
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
}

function saveBlob(blob: Blob, filename: string): boolean {
    if (!blob.size) return false;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
}

export function ShareOpenSlotsStudio({ staff, anchorYmd, onClose, onOpenConnect }: Props) {
    const { tm } = useLanguage();
    const { selectedFirm } = useFirmaDonem();
    const locale = tm('localeCode') || 'tr-TR';
    const companyName = (selectedFirm?.firma_adi || selectedFirm?.title || selectedFirm?.name || 'RetailEX').trim() || 'RetailEX';

    const [staffId, setStaffId] = useState('');
    const [span, setSpan] = useState<ShareDaySpan>('todayTomorrow');
    const [appointments, setAppointments] = useState<BeautyAppointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [bgMode, setBgMode] = useState<BgMode>('preset');
    const [presetId, setPresetId] = useState<ShareBgPresetId>('navy');
    const [solidColor, setSolidColor] = useState(SHARE_NAVY);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
    const [titleKey, setTitleKey] = useState<(typeof TITLE_KEYS)[number]>('bShareSlotsTitleOurs');
    const [note, setNote] = useState('');
    const [tab, setTab] = useState<StoryTab>('video');
    const [bookingLink, setBookingLink] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [portalWa, setPortalWa] = useState<PortalWhatsAppSnapshot | null>(null);
    const [socialAccounts, setSocialAccounts] = useState<SocialAccountHint[]>([]);
    const [socialChats, setSocialChats] = useState<SocialChatHint[]>([]);
    const [socialTick, setSocialTick] = useState(0);
    const [recipient, setRecipient] = useState('');
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const photoUrlRef = useRef<string | null>(null);

    const todayYmd = formatLocalYmd(new Date());
    const people = useMemo(
        () => staff.filter((person) => person.is_active !== false).slice().sort((a, b) => a.name.localeCompare(b.name, 'tr')),
        [staff],
    );

    useEffect(() => {
        let cancel = false;
        const days = shareSpanYmds(anchorYmd, span);
        const start = days[0];
        const end = days[days.length - 1];
        if (!start || !end) return;
        setLoading(true);
        beautyService
            .getAppointmentsInRange(start, end)
            .then((rows) => {
                if (cancel) return;
                setAppointments(Array.isArray(rows) ? rows : []);
                setLoadFailed(false);
            })
            .catch(() => {
                if (cancel) return;
                setAppointments([]);
                setLoadFailed(true);
            })
            .finally(() => {
                if (!cancel) setLoading(false);
            });
        return () => {
            cancel = true;
        };
    }, [anchorYmd, span]);

    useEffect(() => {
        let cancel = false;
        beautyService
            .getPortalSettings()
            .then((settings) => {
                if (cancel) return;
                setPortalWa(settings ?? null);
                if (!settings?.online_booking_enabled || !settings.public_token) return;
                const firmNr = String(ERP_SETTINGS.firmNr || '').trim();
                const periodNr = String(ERP_SETTINGS.periodNr || '').trim();
                if (!firmNr || typeof window === 'undefined') return;
                const base = window.location.origin;
                setBookingLink(
                    `${base}/book/${encodeURIComponent(firmNr)}?period=${encodeURIComponent(periodNr)}&token=${encodeURIComponent(settings.public_token)}`,
                );
            })
            .catch(() => {
                if (!cancel) {
                    setBookingLink('');
                    setPortalWa(null);
                }
            });
        return () => {
            cancel = true;
        };
    }, []);

    useEffect(() => {
        photoUrlRef.current = photoUrl;
    }, [photoUrl]);

    useEffect(() => () => {
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    }, []);

    useEffect(() => {
        if (!photoUrl || bgMode !== 'photo') {
            setPhoto(null);
            return;
        }
        let cancel = false;
        const img = new Image();
        img.onload = () => {
            if (!cancel) setPhoto(img);
        };
        img.onerror = () => {
            if (!cancel) setPhoto(null);
        };
        img.src = photoUrl;
        return () => {
            cancel = true;
        };
    }, [photoUrl, bgMode]);

    const slots = useMemo(() => {
        if (loading) return [];
        return listShareOpenSlots({
            staff: people,
            appointments: loadFailed ? [] : appointments,
            startYmd: anchorYmd,
            span,
            staffId,
            todayYmd,
            labels: { today: tm('bShareSlotsToday'), tomorrow: tm('bShareSlotsTomorrow') },
            labelFor: (ymd) => {
                const [year, month, day] = ymd.split('-').map(Number);
                if (!year || !month || !day) return ymd;
                return new Date(year, month - 1, day).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
            },
        });
    }, [loadFailed, loading, people, appointments, anchorYmd, span, staffId, todayYmd, tm, locale]);

    const slotKey = slots.map((slot) => slot.id).join('|');
    useEffect(() => {
        setSelected(new Set(slots.map((slot) => slot.id)));
    }, [slotKey]);

    const backgroundColor = bgMode === 'solid'
        ? solidColor
        : (SHARE_BG_PRESETS.find((preset) => preset.id === presetId)?.color ?? SHARE_NAVY);
    const hasPhoto = bgMode === 'photo' && !!photo;

    const plan = useMemo(
        () => buildShareStoryPlan({
            companyName,
            title: tm(titleKey),
            note,
            cta: tm('bShareSlotsCta'),
            footer: tm('bShareSlotsFooter'),
            backgroundColor,
            hasPhoto,
            slots,
            selectedIds: selected,
        }),
        [companyName, tm, titleKey, note, backgroundColor, hasPhoto, slots, selected],
    );

    const shareText = useMemo(
        () => buildShareSlotsText({
            title: plan.title,
            days: plan.days,
            note: plan.note,
            link: bookingLink,
            footer: plan.footer,
        }),
        [plan, bookingLink],
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return undefined;
        const total = plan.selectedTimes.length;
        if (tab !== 'video') {
            paintShareStory(ctx, plan, { revealCount: total, photo, pillEnter: 1 });
            return undefined;
        }
        let raf = 0;
        let start = 0;
        const holdMs = 800;
        const cycle = SHARE_STORY_REVEAL_MS + holdMs;
        const tick = (now: number) => {
            if (!start) start = now;
            const elapsed = (now - start) % cycle;
            const progress = elapsed >= SHARE_STORY_REVEAL_MS ? 1 : elapsed / SHARE_STORY_REVEAL_MS;
            const visible = total === 0 ? 0 : Math.min(total, Math.max(1, Math.ceil(progress * total)));
            const scaled = progress * total;
            const enter = total === 0 || scaled <= 0 ? 1 : (Number.isInteger(scaled) ? 1 : scaled - Math.floor(scaled));
            paintShareStory(ctx, plan, { revealCount: visible, photo, pillEnter: enter });
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [plan, photo, tab]);

    const groups = groupShareSlotsByDay(slots);
    const selectedCount = slots.filter((slot) => selected.has(slot.id)).length;
    const canShare = plan.selectedTimes.length > 0;

    const toggle = (id: string) => {
        setNotice('');
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const onPhoto = (file: File | undefined) => {
        if (!file || !file.type.startsWith('image/')) return;
        const url = URL.createObjectURL(file);
        setPhotoUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
        });
        setBgMode('photo');
    };

    const downloadPng = async (): Promise<boolean> => {
        const canvas = document.createElement('canvas');
        canvas.width = SHARE_STORY_WIDTH;
        canvas.height = SHARE_STORY_HEIGHT;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setNotice(tm('bShareSlotsNoImage'));
            return false;
        }
        paintShareStory(ctx, plan, { revealCount: plan.selectedTimes.length, photo });
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((value) => resolve(value), 'image/png');
        });
        if (!blob || !saveBlob(blob, `${storyFileBase(anchorYmd)}.png`)) {
            setNotice(tm('bShareSlotsNoImage'));
            return false;
        }
        return true;
    };

    const download = async () => {
        if (!canShare || busy) return;
        setBusy(true);
        setNotice('');
        try {
            if (tab === 'image') {
                await downloadPng();
                return;
            }
            const recorded = await recordShareStory(plan, photo);
            if (!recorded || !recorded.blob.size) {
                const ok = await downloadPng();
                if (ok) setNotice(tm('bShareSlotsRecorderFallback'));
                return;
            }
            const saved = saveBlob(recorded.blob, `${storyFileBase(anchorYmd)}.${recorded.extension}`);
            if (!saved) {
                const ok = await downloadPng();
                if (ok) setNotice(tm('bShareSlotsRecorderFallback'));
            }
        } finally {
            setBusy(false);
        }
    };

    const copyLink = async () => {
        const payload = shareCopyPayload(bookingLink, shareText);
        if (!payload.value.trim()) return;
        await writeClipboard(payload.value);
        setNotice(tm('bShareSlotsCopied'));
    };

    const copyWhatsApp = async () => {
        if (!canShare) return;
        await writeClipboard(shareText);
        setNotice(tm('bShareSlotsCopied'));
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
        setNotice(tm('bShareOpenSlotsNotConnected'));
        rememberSocialConnectFocus(channel);
        onOpenConnect?.(channel);
    };

    const captureStoryFile = async (): Promise<{ kind: 'image' | 'video'; bytes: Uint8Array; mime: string } | null> => {
        if (tab === 'image') {
            const canvas = document.createElement('canvas');
            canvas.width = SHARE_STORY_WIDTH;
            canvas.height = SHARE_STORY_HEIGHT;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            paintShareStory(ctx, plan, { revealCount: plan.selectedTimes.length, photo });
            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((value) => resolve(value), 'image/png');
            });
            if (!blob?.size) return null;
            return { kind: 'image', bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png' };
        }
        const recorded = await recordShareStory(plan, photo);
        if (!recorded?.blob.size) return null;
        return {
            kind: 'video',
            bytes: new Uint8Array(await recorded.blob.arrayBuffer()),
            mime: recorded.blob.type || 'video/webm',
        };
    };

    const onInstagram = async () => {
        if (!canShare || busy) return;
        setNotice('');
        const current = readClinicSocialConnect({ portal: portalWa, accounts: socialAccounts, chats: socialChats });
        if (!current.instagram.connected) {
            askConnect('instagram');
            return;
        }
        setBusy(true);
        try {
            const file = await captureStoryFile();
            if (!file) {
                setNotice(tm('bShareSlotsNoImage'));
                return;
            }
            const secrets = toPublishSecrets(current);
            const publishPlan = buildShareStoryPublishPlan({
                media: { kind: file.kind, mime: file.mime, byteLength: file.bytes.byteLength },
                secrets,
            });
            const result = await runInstagramStoryPublish(publishPlan, {
                pageAccessToken: secrets.pageAccessToken,
                bytes: file.bytes,
            });
            if (result.status === 'not_connected') {
                askConnect('instagram');
                return;
            }
            if (result.status === 'media_url_required') {
                setNotice(tm('bShareOpenSlotsIgNeedUrl'));
                return;
            }
            if (result.status !== 'published') {
                setNotice(tm('bShareOpenSlotsPublishFail'));
                return;
            }
            setNotice(tm('bShareOpenSlotsIgOk'));
        } catch {
            setNotice(tm('bShareOpenSlotsPublishFail'));
        } finally {
            setBusy(false);
        }
    };

    const onWhatsAppSend = async () => {
        if (!canShare || busy) return;
        setNotice('');
        const current = readClinicSocialConnect({ portal: portalWa, accounts: socialAccounts, chats: socialChats });
        if (!current.whatsapp.connected) {
            askConnect('whatsapp');
            return;
        }
        const secrets = toPublishSecrets(current);
        const probe = buildShareStoryPublishPlan({
            media: { kind: tab === 'video' ? 'video' : 'image' },
            secrets,
            recipient,
        });
        if (probe.whatsapp.status === 'recipient_required') {
            setNotice(tm('bShareOpenSlotsNeedNumber'));
            return;
        }
        if (probe.whatsapp.status !== 'ready') {
            askConnect('whatsapp');
            return;
        }
        setBusy(true);
        try {
            const file = await captureStoryFile();
            if (!file) {
                setNotice(tm('bShareSlotsNoImage'));
                return;
            }
            const publishPlan = buildShareStoryPublishPlan({
                media: { kind: file.kind, mime: file.mime, byteLength: file.bytes.byteLength },
                secrets,
                recipient,
                caption: shareText,
            });
            const result = await runWhatsAppMessagePublish(publishPlan, {
                accessToken: secrets.whatsappAccessToken,
                bridgeToken: secrets.bridgeToken,
                bytes: file.bytes,
            });
            if (result.status === 'recipient_required') {
                setNotice(tm('bShareOpenSlotsNeedNumber'));
                return;
            }
            if (result.status !== 'sent') {
                setNotice(result.status === 'not_connected' ? tm('bShareOpenSlotsNotConnected') : tm('bShareOpenSlotsPublishFail'));
                if (result.status === 'not_connected') askConnect('whatsapp');
                return;
            }
            rememberWhatsAppRecipient(publishPlan.whatsapp.to);
            setSocialTick((value) => value + 1);
            setNotice(tm('bShareOpenSlotsWaOk'));
        } catch {
            setNotice(tm('bShareOpenSlotsPublishFail'));
        } finally {
            setBusy(false);
        }
    };

    const igLabel = tm('bShareOpenSlotsIgShare');
    const waSendLabel = tm('bShareOpenSlotsWaSend');

    const daySpans: { id: ShareDaySpan; label: string }[] = [
        { id: 'todayTomorrow', label: tm('bShareSlotsTodayTomorrow') },
        { id: 'threeDays', label: tm('bShareSlotsThreeDays') },
        { id: 'sevenDays', label: tm('bShareSlotsSevenDays') },
    ];
    const bgModes: { id: BgMode; label: string }[] = [
        { id: 'solid', label: tm('bShareSlotsBgSolid') },
        { id: 'photo', label: tm('bShareSlotsBgPhoto') },
        { id: 'preset', label: tm('bShareSlotsBgPreset') },
    ];

    return (
        <PercentBodyModal onClose={onClose} size="full" ariaLabel={tm('bShareSlotsTitle')} shellClassName="bg-[#f4f6f8]">
            <div data-testid="share-open-slots-studio" className="flex min-h-0 flex-1 flex-col bg-[#f4f6f8] text-slate-800 lg:flex-row">
                <section className="flex min-h-0 w-full max-w-full shrink-0 flex-col border-[#e6eaf0] bg-white lg:max-w-[440px] lg:border-r">
                    <div className="shrink-0 border-b border-[#e6eaf0] px-5 py-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex items-center gap-1.5 text-base font-bold text-slate-900 hover:text-[#2563eb]"
                        >
                            <ChevronLeft size={18} aria-hidden />
                            {tm('bShareSlotsTitle')}
                        </button>
                        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{tm('bShareSlotsIntro')}</p>
                    </div>
                    <PercentBodyModalScrollBody className="px-5 py-4">
                        <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="share-slots-staff">
                            {tm('bShareSlotsWhose')}
                        </label>
                        <div className="relative mb-4">
                            <select
                                id="share-slots-staff"
                                value={staffId}
                                onChange={(event) => setStaffId(event.target.value)}
                                className="h-11 w-full appearance-none rounded-xl border border-[#e6eaf0] bg-white px-3 pr-11 text-sm font-medium text-slate-800 outline-none focus:border-[#93c5fd]"
                            >
                                <option value="">{tm('bShareSlotsAllTeam')}</option>
                                {people.map((person) => (
                                    <option key={person.id} value={person.id}>{person.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
                        </div>

                        <p className="mb-2 text-sm font-semibold text-slate-800">{tm('bShareSlotsWhichDays')}</p>
                        <div className="mb-4 flex flex-wrap gap-2">
                            {daySpans.map((item) => {
                                const on = span === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => setSpan(item.id)}
                                        className={`h-9 rounded-full px-3 text-sm font-semibold ${
                                            on ? 'bg-[#2563eb] text-white' : 'bg-[#e8f1ff] text-[#3b82f6]'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-800">{tm('bShareSlotsHours')}</p>
                            <p className="text-xs font-medium tabular-nums text-slate-400">
                                {selectedCount} / {slots.length} {tm('bShareSlotsHoursSelected')}
                            </p>
                        </div>
                        {loading && <p className="mb-3 text-xs text-slate-400">{tm('bShareSlotsLoading')}</p>}
                        {loadFailed && <p className="mb-3 text-xs font-medium text-amber-800">{tm('bShareSlotsLoadError')}</p>}
                        <div className="mb-5 space-y-3">
                            {groups.map((group) => (
                                <div key={group.ymd}>
                                    <p className="mb-1.5 text-xs font-semibold text-slate-500">{group.label}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {group.slots.map((slot) => {
                                            const on = selected.has(slot.id);
                                            return (
                                                <button
                                                    key={slot.id}
                                                    type="button"
                                                    data-testid={`share-slot-${slot.dayYmd}-${slot.label}`}
                                                    aria-pressed={on}
                                                    onClick={() => toggle(slot.id)}
                                                    className={`h-9 rounded-full border px-3 text-sm font-semibold tabular-nums ${
                                                        on
                                                            ? 'border-[#2563eb] bg-[#2563eb] text-white'
                                                            : 'border-[#e6eaf0] bg-white text-slate-600'
                                                    }`}
                                                >
                                                    {slot.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <p className="mb-2 text-sm font-semibold text-slate-800">{tm('bShareSlotsBackground')}</p>
                        <div className="mb-3 flex flex-wrap gap-2">
                            {bgModes.map((item) => {
                                const on = bgMode === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => setBgMode(item.id)}
                                        className={`h-9 rounded-full px-3 text-sm font-semibold ${
                                            on ? 'bg-[#dbeafe] text-[#2563eb]' : 'bg-[#f3f5f9] text-slate-500'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                        {bgMode === 'solid' && (
                            <label className="mb-4 flex items-center gap-3 text-sm text-slate-600">
                                <input
                                    type="color"
                                    aria-label={tm('bShareSlotsColor')}
                                    value={solidColor}
                                    onChange={(event) => setSolidColor(event.target.value)}
                                    className="h-10 w-14 cursor-pointer rounded-lg border border-[#e6eaf0] bg-white"
                                />
                                <span className="font-mono text-xs">{solidColor}</span>
                            </label>
                        )}
                        {bgMode === 'photo' && (
                            <div className="mb-4">
                                <label className="inline-flex h-9 cursor-pointer items-center rounded-full bg-[#e8f1ff] px-3 text-sm font-semibold text-[#2563eb]">
                                    {tm('bShareSlotsPhotoPick')}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        onChange={(event) => onPhoto(event.target.files?.[0])}
                                    />
                                </label>
                                <p className="mt-2 text-xs text-slate-400">{tm('bShareSlotsPhotoHint')}</p>
                            </div>
                        )}
                        {bgMode === 'preset' && (
                            <div className="mb-4 flex gap-2">
                                {SHARE_BG_PRESETS.map((preset) => {
                                    const on = presetId === preset.id;
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            aria-label={tm(preset.labelKey)}
                                            aria-pressed={on}
                                            onClick={() => setPresetId(preset.id)}
                                            className={`h-10 w-16 rounded-xl border-2 ${on ? 'border-[#2563eb]' : 'border-transparent'}`}
                                            style={{ backgroundColor: preset.color }}
                                        />
                                    );
                                })}
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="share-slots-title">
                                    {tm('bShareSlotsHeading')}
                                </label>
                                <div className="relative">
                                    <select
                                        id="share-slots-title"
                                        value={titleKey}
                                        onChange={(event) => setTitleKey(event.target.value as (typeof TITLE_KEYS)[number])}
                                        className="h-11 w-full appearance-none rounded-xl border border-[#e6eaf0] bg-white px-3 pr-11 text-sm font-medium text-slate-800 outline-none focus:border-[#93c5fd]"
                                    >
                                        {TITLE_KEYS.map((key) => (
                                            <option key={key} value={key}>{tm(key)}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="share-slots-note">
                                    {tm('bShareSlotsNote')}
                                </label>
                                <input
                                    id="share-slots-note"
                                    value={note}
                                    onChange={(event) => setNote(event.target.value)}
                                    placeholder={tm('bShareSlotsNotePlaceholder')}
                                    className="h-11 w-full rounded-xl border border-[#e6eaf0] bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#93c5fd]"
                                />
                            </div>
                        </div>
                    </PercentBodyModalScrollBody>
                </section>

                <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fb]">
                    <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-[#e6eaf0] bg-white p-2">
                        <button
                            type="button"
                            aria-pressed={tab === 'video'}
                            onClick={() => setTab('video')}
                            className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${
                                tab === 'video' ? 'bg-[#dbeafe] text-[#2563eb]' : 'text-slate-500'
                            }`}
                        >
                            <Video size={16} aria-hidden />
                            {tm('bShareSlotsTabVideo')}
                        </button>
                        <button
                            type="button"
                            aria-pressed={tab === 'image'}
                            onClick={() => setTab('image')}
                            className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${
                                tab === 'image' ? 'bg-[#dbeafe] text-[#2563eb]' : 'text-slate-500'
                            }`}
                        >
                            <ImageIcon size={16} aria-hidden />
                            {tm('bShareSlotsTabImage')}
                        </button>
                    </div>
                    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-4">
                        <div className="h-full max-h-[640px] w-auto max-w-full overflow-hidden rounded-[28px] shadow-xl">
                            <canvas
                                ref={canvasRef}
                                data-testid="share-story-canvas"
                                width={SHARE_STORY_WIDTH}
                                height={SHARE_STORY_HEIGHT}
                                className="h-full w-auto max-w-full"
                            />
                        </div>
                    </div>
                    <div className="shrink-0 space-y-2 border-t border-[#e6eaf0] bg-white p-4">
                        <button
                            type="button"
                            onClick={() => { void download(); }}
                            disabled={!canShare || busy}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] text-sm font-bold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                        >
                            <Download size={16} aria-hidden />
                            {busy
                                ? tm('bShareSlotsPreparing')
                                : tm(tab === 'video' ? 'bShareSlotsDownloadVideo' : 'bShareSlotsDownloadImage')}
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                data-testid="share-studio-instagram"
                                onClick={() => { void onInstagram(); }}
                                disabled={!canShare || busy}
                                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e6eaf0] bg-white px-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                                <Instagram size={15} aria-hidden />
                                {igLabel}
                            </button>
                            <button
                                type="button"
                                data-testid="share-studio-whatsapp-send"
                                onClick={() => { void onWhatsAppSend(); }}
                                disabled={!canShare || busy}
                                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e6eaf0] bg-white px-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                                <Send size={15} aria-hidden />
                                {waSendLabel}
                            </button>
                        </div>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold text-slate-500">{tm('bShareOpenSlotsRecipient')}</span>
                            <input
                                data-testid="share-studio-wa-recipient"
                                list="share-studio-wa-chats"
                                inputMode="tel"
                                autoComplete="off"
                                value={recipient}
                                onChange={(event) => setRecipient(event.target.value)}
                                placeholder={tm('bShareOpenSlotsRecipientPh')}
                                aria-label={tm('bShareOpenSlotsRecipient')}
                                title={social.whatsapp.recentChats.length ? tm('bShareOpenSlotsRecent') : undefined}
                                className="h-10 w-full rounded-xl border border-[#e6eaf0] bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#93c5fd]"
                            />
                            <datalist id="share-studio-wa-chats">
                                {social.whatsapp.recentChats.map((chat) => (
                                    <option key={chat.number} value={chat.number}>{chat.label}</option>
                                ))}
                            </datalist>
                            <span className="mt-1 block text-[11px] leading-snug text-slate-500">{tm('bShareOpenSlotsWaChatHint')}</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => { void copyLink(); }}
                                disabled={!bookingLink && !canShare}
                                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e6eaf0] bg-[#f8fafc] text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                            >
                                <Link2 size={15} aria-hidden />
                                {tm('bShareSlotsCopyLink')}
                            </button>
                            <button
                                type="button"
                                onClick={() => { void copyWhatsApp(); }}
                                disabled={!canShare}
                                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e6eaf0] bg-[#f8fafc] text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                            >
                                <MessageCircle size={15} aria-hidden />
                                {tm('bShareSlotsWhatsApp')}
                            </button>
                        </div>
                        {notice ? <p role="status" className="text-center text-xs font-medium text-slate-500">{notice}</p> : null}
                    </div>
                </section>
            </div>
        </PercentBodyModal>
    );
}
