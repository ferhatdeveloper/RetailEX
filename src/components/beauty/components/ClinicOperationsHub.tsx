import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Building2, Globe, Bell, ClipboardList, Users, Briefcase,
    Package, Layers, Link2, Activity, FileWarning, Stethoscope, Camera, LayoutTemplate,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { beautyService } from '../../../services/beautyService';
import { useAuth } from '../../../contexts/AuthContext';
import { ERP_SETTINGS } from '../../../services/postgres';
import type { BeautyClinicAnalytics } from '../../../types/beauty';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ClinicSpecialtyModePanel } from './ClinicSpecialtyModePanel';
import { normalizeAllowStaffSlotOverlap } from '../../../utils/beautyPortalOverlap';

export function ClinicOperationsHub() {
    const { user } = useAuth();
    const { tm } = useLanguage();
    const TABS = useMemo(
        () =>
            [
                { id: 'overview' as const, label: 'Özet', icon: Activity },
                { id: 'specialty' as const, label: tm('bClinicSpecialtyTab'), icon: LayoutTemplate },
                { id: 'portal' as const, label: 'Portal & talepler', icon: Globe },
                { id: 'locations' as const, label: 'Şube / oda', icon: Building2 },
                { id: 'wait' as const, label: 'Bekleme & kurumsal', icon: Users },
                { id: 'clinical' as const, label: 'Klinik not & foto', icon: Stethoscope },
                { id: 'stock' as const, label: 'Sarf & parti', icon: Package },
                { id: 'biz' as const, label: 'Üyelik & kampanya', icon: Briefcase },
                { id: 'integrations' as const, label: 'Entegrasyon', icon: Link2 },
                { id: 'audit' as const, label: 'Denetim', icon: FileWarning },
            ] as const,
        [tm]
    );
    type HubTabId =
        | 'overview'
        | 'specialty'
        | 'portal'
        | 'locations'
        | 'wait'
        | 'clinical'
        | 'stock'
        | 'biz'
        | 'integrations'
        | 'audit';
    const [tab, setTab] = useState<HubTabId>('overview');
    const [analytics, setAnalytics] = useState<BeautyClinicAnalytics | null>(null);
    const [loading, setLoading] = useState(false);
    const [portalUrl, setPortalUrl] = useState('');

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const a = await beautyService.getClinicAnalytics();
            setAnalytics(a);
            const ps = await beautyService.getPortalSettings();
            if (ps?.public_token) {
                const base = typeof window !== 'undefined' ? window.location.origin : '';
                setPortalUrl(
                    `${base}/book/${ERP_SETTINGS.firmNr}?period=${ERP_SETTINGS.periodNr}&token=${encodeURIComponent(ps.public_token)}`
                );
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return (
        <div className="flex flex-col h-full min-h-0 gap-3 p-4 overflow-auto" style={{ background: '#f7f6fb' }}>
            <div className="flex flex-wrap gap-2 shrink-0">
                {TABS.map(t => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id as HubTabId)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                            style={{
                                background: active ? '#7c3aed' : '#fff',
                                color: active ? '#fff' : '#475569',
                                border: '1px solid ' + (active ? '#7c3aed' : '#e2e8f0'),
                            }}
                        >
                            <Icon size={16} />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {tab === 'overview' && (
                <OverviewPanel analytics={analytics} loading={loading} onRefresh={refresh} />
            )}
            {tab === 'specialty' && <ClinicSpecialtyModePanel />}
            {tab === 'portal' && (
                <PortalPanel portalUrl={portalUrl} onRefresh={refresh} userId={user?.id} />
            )}
            {tab === 'locations' && <LocationsPanel />}
            {tab === 'wait' && <WaitCorporatePanel />}
            {tab === 'clinical' && <ClinicalPanel userId={user?.id} />}
            {tab === 'stock' && <StockPanel />}
            {tab === 'biz' && <BizPanel />}
            {tab === 'integrations' && <IntegrationPanel />}
            {tab === 'audit' && <AuditPanel />}
        </div>
    );
}

function OverviewPanel({
    analytics,
    loading,
    onRefresh,
}: {
    analytics: BeautyClinicAnalytics | null;
    loading: boolean;
    onRefresh: () => void;
}) {
    const [queue, setQueue] = useState<{ id: string; channel: string; status: string }[]>([]);
    useEffect(() => {
        void (async () => {
            const q = await beautyService.listNotificationQueue(20);
            setQueue(q);
        })();
    }, [loading]);

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Klinik analitik (90 gün)</h3>
                    <Button size="sm" variant="outline" onClick={() => onRefresh()} disabled={loading}>
                        Yenile
                    </Button>
                </div>
                {analytics && (
                    <ul className="text-sm text-slate-600 space-y-1">
                        <li>Gelmeyen: <strong>{analytics.noShowCount}</strong></li>
                        <li>İptal: <strong>{analytics.cancelledCount}</strong></li>
                        <li>Tamamlanan: <strong>{analytics.completedCount}</strong></li>
                        <li>Aktif randevu: <strong>{analytics.scheduledCount}</strong></li>
                        <li>Bekleyen online talep: <strong>{analytics.pendingBookingRequests}</strong></li>
                        <li>Aktif bekleme listesi: <strong>{analytics.waitlistActive}</strong></li>
                        <li>Sarf kaydı (30g): <strong>{analytics.consumableUsage30d}</strong></li>
                    </ul>
                )}
            </Card>
            <Card className="p-4">
                <h3 className="font-bold text-slate-800 mb-2">Bildirim kuyruğu</h3>
                <ul className="text-xs space-y-1 max-h-48 overflow-auto">
                    {queue.map(q => (
                        <li key={q.id} className="flex justify-between border-b border-slate-100 py-1">
                            <span>{q.channel}</span>
                            <span className="text-slate-500">{q.status}</span>
                        </li>
                    ))}
                    {!queue.length && <li className="text-slate-400">Kayıt yok</li>}
                </ul>
                <Button
                    size="sm"
                    className="mt-2"
                    variant="secondary"
                    onClick={async () => {
                        const n = await beautyService.enqueueAppointmentReminders(24);
                        alert(`${n} hatırlatma kuyruğa alındı (yarınki randevular).`);
                        onRefresh();
                    }}
                >
                    Yarınki randevuları SMS kuyruğa al
                </Button>
            </Card>
        </div>
    );
}

function PortalPanel({
    portalUrl,
    onRefresh,
    userId,
}: {
    portalUrl: string;
    onRefresh: () => void;
    userId?: string;
}) {
    const [enabled, setEnabled] = useState(false);
    const [slug, setSlug] = useState('');
    const [hours, setHours] = useState(24);
    const [smsUser, setSmsUser] = useState('');
    const [smsPassword, setSmsPassword] = useState('');
    const [smsSender, setSmsSender] = useState('');
    const [smsTemplate, setSmsTemplate] = useState('');
    const [waTemplate, setWaTemplate] = useState('');
    const [waProvider, setWaProvider] = useState('NONE');
    const [waBaseUrl, setWaBaseUrl] = useState('');
    const [waToken, setWaToken] = useState('');
    const [waInstance, setWaInstance] = useState('');
    const [waPhoneId, setWaPhoneId] = useState('');
    const [defaultChannel, setDefaultChannel] = useState('sms');
    const [testPhone, setTestPhone] = useState('');
    const [atakCredit, setAtakCredit] = useState<number | null>(null);
    const [embedQr, setEmbedQr] = useState<string | null>(null);
    const [embedQrImg, setEmbedQrImg] = useState<string | null>(null);
    const [embedStatus, setEmbedStatus] = useState<string>('');
    const [embedErr, setEmbedErr] = useState<string | null>(null);
    const [requests, setRequests] = useState<Awaited<ReturnType<typeof beautyService.listBookingRequests>>>([]);
    const [allowStaffSlotOverlap, setAllowStaffSlotOverlap] = useState(false);
    const { tm } = useLanguage();

    const loadAll = useCallback(async () => {
        const p = await beautyService.getPortalSettings();
        if (p) {
            setEnabled(!!p.online_booking_enabled);
            setAllowStaffSlotOverlap(normalizeAllowStaffSlotOverlap(p));
            setSlug(p.public_slug ?? '');
            setHours(p.reminder_hours_before ?? 24);
            setSmsUser(p.sms_user ?? '');
            setSmsPassword(p.sms_password ?? '');
            setSmsSender(p.sms_sender ?? '');
            setSmsTemplate(p.sms_template ?? '');
            setWaTemplate(p.whatsapp_template ?? '');
            setWaProvider((p.whatsapp_provider || 'NONE').toString());
            setWaBaseUrl(p.whatsapp_base_url ?? '');
            setWaToken(p.whatsapp_token ?? '');
            setWaInstance(p.whatsapp_instance_id ?? '');
            setWaPhoneId(p.whatsapp_phone_id ?? '');
            setDefaultChannel((p.default_reminder_channel || 'sms').toString());
        }
        setRequests(await beautyService.listBookingRequests());
        const bal = await beautyService.getAtakSmsBalance();
        if (bal.success && typeof bal.credit === 'number') setAtakCredit(bal.credit);
        else setAtakCredit(null);
    }, []);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    /** QR köprüsü (EMBEDDED): formdaki URL ile /status yoklar */
    useEffect(() => {
        if (waProvider !== 'EMBEDDED' || !waBaseUrl.trim()) {
            setEmbedQr(null);
            setEmbedStatus('');
            setEmbedErr(null);
            return;
        }
        let cancelled = false;
        const tick = async () => {
            if (cancelled) return;
            const r = await beautyService.getEmbeddedWhatsAppStatus({
                whatsapp_base_url: waBaseUrl.trim(),
                whatsapp_token: waToken.trim() || null,
            });
            if (cancelled) return;
            if (r.ok) {
                setEmbedStatus(String(r.status ?? ''));
                setEmbedQr(r.qr ?? null);
                setEmbedErr(null);
            } else {
                setEmbedErr(r.error ?? 'Köprü yanıt vermedi');
                setEmbedQr(null);
            }
        };
        void tick();
        const id = window.setInterval(tick, 4000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [waProvider, waBaseUrl, waToken]);

    /** Ham QR metni (köprü JSON) → PNG data URL (whatshapp bazen yalnızca string döner) */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!embedQr) {
                setEmbedQrImg(null);
                return;
            }
            if (embedQr.startsWith('data:')) {
                setEmbedQrImg(embedQr);
                return;
            }
            try {
                const QRCode = (await import('qrcode')).default;
                const url = await QRCode.toDataURL(embedQr, { margin: 1, width: 220 });
                if (!cancelled) setEmbedQrImg(url);
            } catch {
                if (!cancelled) setEmbedQrImg(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [embedQr]);

    const saveAll = async () => {
        await beautyService.updatePortalSettings({
            online_booking_enabled: enabled,
            allow_staff_slot_overlap: allowStaffSlotOverlap,
            public_slug: slug || undefined,
            reminder_hours_before: hours,
            sms_template: smsTemplate || undefined,
            whatsapp_template: waTemplate || undefined,
            sms_user: smsUser || undefined,
            sms_password: smsPassword || undefined,
            sms_sender: smsSender || undefined,
            whatsapp_provider: waProvider,
            whatsapp_base_url: waBaseUrl || undefined,
            whatsapp_token: waToken || undefined,
            whatsapp_instance_id: waInstance || undefined,
            whatsapp_phone_id: waPhoneId || undefined,
            default_reminder_channel: defaultChannel,
        });
        onRefresh();
        void loadAll();
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('retailex-beauty-portal-updated'));
        }
        alert('Kaydedildi.');
    };

    return (
        <div className="space-y-4 max-w-3xl">
            <Card className="p-4 space-y-3">
                <h3 className="font-bold">Online randevu portalı</h3>
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                    Web üzerinden randevu talebi açık
                </label>
                <label className="flex items-start gap-2 text-sm">
                    <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={allowStaffSlotOverlap}
                        onChange={e => setAllowStaffSlotOverlap(e.target.checked)}
                    />
                    <span>
                        <span className="font-medium text-slate-800">{tm('bPortalAllowStaffSlotOverlap')}</span>
                        <span className="block text-xs text-slate-500 mt-1">{tm('bPortalAllowStaffSlotOverlapHint')}</span>
                    </span>
                </label>
                <div className="grid gap-2 md:grid-cols-2">
                    <div>
                        <label className="text-xs text-slate-500">Public slug (isteğe bağlı)</label>
                        <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="ornek-klinik" />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500">Hatırlatma (saat öncesi)</label>
                        <Input type="number" value={hours} onChange={e => setHours(Number(e.target.value))} />
                    </div>
                </div>
                {portalUrl && (
                    <p className="text-xs break-all text-slate-600">
                        Halka açık bağlantı: <strong>{portalUrl}</strong>
                    </p>
                )}
            </Card>

            <Card className="p-4 space-y-3 border-violet-200 bg-violet-50/30">
                <h3 className="font-bold text-violet-900">SMS (Atak) — whatshapp ile aynı API</h3>
                <p className="text-xs text-slate-600">
                    Panel: panel.ataksms.com — CORS nedeniyle tarayıcıdan gönderim bazı ortamlarda bloklanabilir; Tauri köprü veya sunucu tarafı proxy gerekebilir.
                </p>
                {atakCredit != null && (
                    <p className="text-xs font-semibold text-slate-700">Atak kredi: {atakCredit}</p>
                )}
                <div className="grid gap-2 md:grid-cols-2">
                    <div>
                        <label className="text-xs text-slate-500">Kullanıcı</label>
                        <Input value={smsUser} onChange={e => setSmsUser(e.target.value)} autoComplete="off" />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500">Şifre</label>
                        <Input type="password" value={smsPassword} onChange={e => setSmsPassword(e.target.value)} autoComplete="new-password" />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500">Gönderen (sender)</label>
                        <Input value={smsSender} onChange={e => setSmsSender(e.target.value)} placeholder="BILGI" />
                    </div>
                </div>
                <div>
                    <label className="text-xs text-slate-500">SMS şablonu — {'{name}'} {'{date}'} {'{time}'} {'{service}'}</label>
                    <textarea
                        className="w-full min-h-[56px] rounded-md border border-slate-200 p-2 text-sm"
                        value={smsTemplate}
                        onChange={e => setSmsTemplate(e.target.value)}
                        placeholder="Sayin {name}, {date} {time} randevu hatirlatmasi."
                    />
                </div>
            </Card>

            <Card className="p-4 space-y-3 border-emerald-200 bg-emerald-50/30">
                <h3 className="font-bold text-emerald-900">WhatsApp</h3>
                <p className="text-xs text-slate-600">
                    <strong>Doğrudan (QR):</strong> Yerelde Baileys çalışan bir HTTP köprüsü — <code className="text-[11px] bg-white/80 px-1 rounded">GET /status</code>,{' '}
                    <code className="text-[11px] bg-white/80 px-1 rounded">POST /send</code>. Geliştirme ortamında (npm run dev) <code className="text-[11px] bg-white/80 px-1 rounded">http://127.0.0.1:3000</code> otomatik olarak{' '}
                    <strong>aynı origin</strong> üzerinden Vite proxy ile iletilir; CORS sorunu olmaz.
                </p>
                <div>
                    <label className="text-xs text-slate-500">Sağlayıcı</label>
                    <select
                        className="w-full border rounded-md p-2 text-sm"
                        value={waProvider}
                        onChange={e => setWaProvider(e.target.value)}
                    >
                        <option value="NONE">Kapalı</option>
                        <option value="EMBEDDED">Doğrudan bağlantı (QR köprüsü)</option>
                        <option value="EVOLUTION">Evolution API</option>
                        <option value="META">Meta Cloud API</option>
                    </select>
                </div>

                {waProvider === 'EMBEDDED' && (
                    <div className="grid gap-2 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label className="text-xs text-slate-500">Köprü taban URL (whatshapp Next, varsayılan :3000)</label>
                            <Input
                                value={waBaseUrl}
                                onChange={e => setWaBaseUrl(e.target.value)}
                                placeholder="http://127.0.0.1:3000"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs text-slate-500">Bearer token (isteğe bağlı)</label>
                            <Input value={waToken} onChange={e => setWaToken(e.target.value)} type="password" autoComplete="off" />
                        </div>
                    </div>
                )}

                {waProvider === 'EMBEDDED' && (
                    <div className="rounded-lg border border-emerald-300 bg-white p-3 space-y-2">
                        <p className="text-xs font-semibold text-emerald-900">QR ile oturum</p>
                        <p className="text-[11px] text-slate-600">
                            Köprü URL’sini kaydetmeden de yüklenir. Önce whatshapp’ta <code className="text-[11px]">npm run dev</code> çalışsın; durum <strong>scanning</strong> iken QR görünür.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-700">Durum: <strong>{embedStatus || '—'}</strong></span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={async () => {
                                    const r = await beautyService.getEmbeddedWhatsAppStatus({
                                        whatsapp_base_url: waBaseUrl.trim(),
                                        whatsapp_token: waToken.trim() || null,
                                    });
                                    if (r.ok) {
                                        setEmbedStatus(String(r.status ?? ''));
                                        setEmbedQr(r.qr ?? null);
                                        setEmbedErr(null);
                                    } else {
                                        setEmbedErr(r.error ?? 'Hata');
                                    }
                                }}
                            >
                                Şimdi yenile
                            </Button>
                        </div>
                        {embedErr && <p className="text-xs text-amber-800">{embedErr}</p>}
                        {embedQrImg && (
                            <div className="flex justify-center p-2 bg-slate-50 rounded-md">
                                <img src={embedQrImg} alt="WhatsApp QR" className="max-w-[220px] h-auto" />
                            </div>
                        )}
                    </div>
                )}

                {waProvider !== 'EMBEDDED' && (
                    <div className="grid gap-2 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label className="text-xs text-slate-500">Evolution / Meta base URL</label>
                            <Input value={waBaseUrl} onChange={e => setWaBaseUrl(e.target.value)} placeholder="https://evo.example.com" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">API token / apikey</label>
                            <Input value={waToken} onChange={e => setWaToken(e.target.value)} type="password" autoComplete="off" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">Instance adı</label>
                            <Input value={waInstance} onChange={e => setWaInstance(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">Meta Phone ID</label>
                            <Input value={waPhoneId} onChange={e => setWaPhoneId(e.target.value)} placeholder="Meta için" />
                        </div>
                    </div>
                )}
                <div>
                    <label className="text-xs text-slate-500">WhatsApp şablonu</label>
                    <textarea
                        className="w-full min-h-[56px] rounded-md border border-slate-200 p-2 text-sm"
                        value={waTemplate}
                        onChange={e => setWaTemplate(e.target.value)}
                        placeholder="Merhaba {name}, {date} {time} — {service}"
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-500">Yarınki hatırlatmalar için kanal</label>
                    <select
                        className="w-full border rounded-md p-2 text-sm"
                        value={defaultChannel}
                        onChange={e => setDefaultChannel(e.target.value)}
                    >
                        <option value="sms">Yalnız SMS</option>
                        <option value="whatsapp">Yalnız WhatsApp</option>
                        <option value="both">SMS + WhatsApp</option>
                    </select>
                </div>
            </Card>

            <Card className="p-4 space-y-2">
                <h3 className="font-bold">Test gönderimi</h3>
                <Input placeholder="905551234567" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                            const r = await beautyService.sendTestSmsMessage(testPhone.trim());
                            alert(r.success ? 'SMS gönderildi.' : (r.error ?? 'Hata'));
                        }}
                    >
                        Test SMS
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                            const r = await beautyService.sendTestWhatsAppMessage(testPhone.trim());
                            alert(r.success ? 'WhatsApp gönderildi.' : (r.error ?? 'Hata'));
                        }}
                    >
                        Test WhatsApp
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                            const r = await beautyService.processPendingNotifications(20);
                            alert(`İşlenen: ${r.processed}. Hatalar: ${r.errors.length ? r.errors.slice(0, 3).join('; ') : 'yok'}`);
                            onRefresh();
                        }}
                    >
                        Kuyruğu gönder (SMS/WA)
                    </Button>
                </div>
            </Card>

            <Button className="w-full max-w-md" onClick={() => void saveAll()}>
                Tüm portal ayarlarını kaydet
            </Button>

            <Card className="p-4">
                <h3 className="font-bold mb-2">Bekleyen online talepler</h3>
                <ul className="space-y-2">
                    {requests.map(r => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-2 text-sm">
                            <span>{r.name} — {r.phone}</span>
                            <Button
                                size="sm"
                                onClick={async () => {
                                    await beautyService.approveBookingRequest(r.id, { userId });
                                    setRequests(await beautyService.listBookingRequests());
                                    onRefresh();
                                    alert('Randevu oluşturuldu.');
                                }}
                            >
                                Onayla
                            </Button>
                        </li>
                    ))}
                    {!requests.length && <li className="text-slate-400 text-sm">Bekleyen talep yok</li>}
                </ul>
            </Card>
        </div>
    );
}

function LocationsPanel() {
    const [branches, setBranches] = useState<Awaited<ReturnType<typeof beautyService.getBranches>>>([]);
    const [rooms, setRooms] = useState<Awaited<ReturnType<typeof beautyService.getRooms>>>([]);
    const [bName, setBName] = useState('');
    const [rName, setRName] = useState('');

    const load = useCallback(async () => {
        setBranches(await beautyService.getBranches());
        setRooms(await beautyService.getRooms());
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
            <Card className="p-4 space-y-2">
                <h3 className="font-bold">Şubeler</h3>
                <div className="flex gap-2">
                    <Input placeholder="Şube adı" value={bName} onChange={e => setBName(e.target.value)} />
                    <Button size="sm" onClick={async () => {
                        if (!bName.trim()) return;
                        await beautyService.upsertBranch({ name: bName.trim() });
                        setBName('');
                        void load();
                    }}>Ekle</Button>
                </div>
                <ul className="text-sm">{branches.map(b => <li key={b.id}>{b.name}</li>)}</ul>
            </Card>
            <Card className="p-4 space-y-2">
                <h3 className="font-bold">Odalar</h3>
                <div className="flex gap-2">
                    <Input placeholder="Oda adı" value={rName} onChange={e => setRName(e.target.value)} />
                    <Button size="sm" onClick={async () => {
                        if (!rName.trim()) return;
                        await beautyService.upsertRoom({ name: rName.trim() });
                        setRName('');
                        void load();
                    }}>Ekle</Button>
                </div>
                <ul className="text-sm">{rooms.map(r => <li key={r.id}>{r.name}</li>)}</ul>
            </Card>
        </div>
    );
}

function WaitCorporatePanel() {
    const [corp, setCorp] = useState<Awaited<ReturnType<typeof beautyService.listCorporateAccounts>>>([]);
    const [wl, setWl] = useState<Awaited<ReturnType<typeof beautyService.listWaitlist>>>([]);
    const [cname, setCname] = useState('');
    const [wlNote, setWlNote] = useState('');

    useEffect(() => {
        void (async () => {
            setCorp(await beautyService.listCorporateAccounts());
            setWl(await beautyService.listWaitlist());
        })();
    }, []);

    return (
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
            <Card className="p-4 space-y-2">
                <h3 className="font-bold">Kurumsal anlaşmalı hesaplar</h3>
                <div className="flex gap-2">
                    <Input placeholder="Kurum adı" value={cname} onChange={e => setCname(e.target.value)} />
                    <Button size="sm" onClick={async () => {
                        if (!cname.trim()) return;
                        await beautyService.saveCorporateAccount({ name: cname.trim() });
                        setCname('');
                        setCorp(await beautyService.listCorporateAccounts());
                    }}>Kaydet</Button>
                </div>
                <ul className="text-sm">{corp.map(c => <li key={c.id}>{c.name}</li>)}</ul>
            </Card>
            <Card className="p-4 space-y-2">
                <h3 className="font-bold">Bekleme listesi</h3>
                <div className="flex gap-2 flex-col">
                    <Input placeholder="Not / tercih" value={wlNote} onChange={e => setWlNote(e.target.value)} />
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                            await beautyService.addWaitlistEntry({ notes: wlNote.trim() || undefined });
                            setWlNote('');
                            setWl(await beautyService.listWaitlist());
                        }}
                    >
                        Listeye ekle
                    </Button>
                </div>
                <ul className="text-sm space-y-1 max-h-48 overflow-auto">
                    {wl.map(w => (
                        <li key={w.id} className="border-b border-slate-100 py-1">
                            {w.notes || w.id.slice(0, 8)}
                        </li>
                    ))}
                    {!wl.length && <li className="text-slate-400">Kayıt yok</li>}
                </ul>
            </Card>
        </div>
    );
}

function ClinicalPanel({ userId }: { userId?: string }) {
    const [apptId, setApptId] = useState('');
    const [teleUrl, setTeleUrl] = useState('');
    const [soap, setSoap] = useState({ s: '', o: '', a: '', p: '' });
    const [custId, setCustId] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [templates, setTemplates] = useState<Awaited<ReturnType<typeof beautyService.listConsentTemplates>>>([]);

    useEffect(() => {
        void (async () => {
            setTemplates(await beautyService.listConsentTemplates());
        })();
    }, []);

    return (
        <div className="space-y-4 max-w-3xl">
            <Card className="p-4 space-y-2">
                <h3 className="font-bold flex items-center gap-2"><ClipboardList size={18} /> Tele-konsültasyon (video URL)</h3>
                <Input placeholder="Randevu UUID" value={apptId} onChange={e => setApptId(e.target.value)} />
                <Input placeholder="https://meet.google.com/..." value={teleUrl} onChange={e => setTeleUrl(e.target.value)} />
                <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                        if (!apptId.trim()) return;
                        await beautyService.patchAppointmentTele(
                            apptId.trim(),
                            teleUrl.trim() || null,
                            'tele'
                        );
                        alert('Video bağlantısı kaydedildi.');
                    }}
                >
                    URL kaydet
                </Button>
            </Card>
            <Card className="p-4 space-y-2">
                <h3 className="font-bold flex items-center gap-2"><ClipboardList size={18} /> SOAP not (aynı randevu UUID)</h3>
                <textarea className="w-full border rounded-md p-2 text-sm" rows={2} placeholder="Subjective" value={soap.s} onChange={e => setSoap({ ...soap, s: e.target.value })} />
                <textarea className="w-full border rounded-md p-2 text-sm" rows={2} placeholder="Objective" value={soap.o} onChange={e => setSoap({ ...soap, o: e.target.value })} />
                <textarea className="w-full border rounded-md p-2 text-sm" rows={2} placeholder="Assessment" value={soap.a} onChange={e => setSoap({ ...soap, a: e.target.value })} />
                <textarea className="w-full border rounded-md p-2 text-sm" rows={2} placeholder="Plan" value={soap.p} onChange={e => setSoap({ ...soap, p: e.target.value })} />
                <Button
                    size="sm"
                    onClick={async () => {
                        if (!apptId.trim()) return;
                        await beautyService.saveClinicalNote({
                            appointment_id: apptId.trim(),
                            subjective: soap.s,
                            objective: soap.o,
                            assessment: soap.a,
                            plan: soap.p,
                            created_by: userId,
                        });
                        alert('Not kaydedildi.');
                    }}
                >
                    Kaydet
                </Button>
            </Card>
            <Card className="p-4 space-y-2">
                <h3 className="font-bold flex items-center gap-2"><Camera size={18} /> Hasta foto URL</h3>
                <Input placeholder="Müşteri UUID" value={custId} onChange={e => setCustId(e.target.value)} />
                <Input placeholder="https://... görsel URL" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} />
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                        if (!custId.trim() || !photoUrl.trim()) return;
                        await beautyService.addPatientPhoto({
                            customer_id: custId.trim(),
                            storage_url: photoUrl.trim(),
                            kind: 'before',
                        });
                        alert('Foto kaydı eklendi.');
                    }}
                >
                    Foto kaydı ekle
                </Button>
            </Card>
            <Card className="p-4">
                <h3 className="font-bold mb-2">Onam şablonları</h3>
                <ul className="text-sm">{templates.map(t => <li key={t.id}>{t.title}</li>)}</ul>
            </Card>
        </div>
    );
}

function StockPanel() {
    const [svc, setSvc] = useState('');
    const [pid, setPid] = useState('');
    const [qty, setQty] = useState('1');
    const [batches, setBatches] = useState<Awaited<ReturnType<typeof beautyService.listProductBatches>>>([]);

    useEffect(() => {
        void (async () => {
            setBatches(await beautyService.listProductBatches());
        })();
    }, []);

    return (
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
            <Card className="p-4 space-y-2">
                <h3 className="font-bold">Hizmet → ürün sarf</h3>
                <Input placeholder="Hizmet UUID" value={svc} onChange={e => setSvc(e.target.value)} />
                <Input placeholder="Ürün UUID" value={pid} onChange={e => setPid(e.target.value)} />
                <Input placeholder="Miktar" value={qty} onChange={e => setQty(e.target.value)} />
                <Button size="sm" onClick={async () => {
                    if (!svc || !pid) return;
                    await beautyService.setServiceConsumable({
                        service_id: svc,
                        product_id: pid,
                        qty_per_service: Number(qty) || 1,
                    });
                    alert('Tanım kaydedildi.');
                }}>Kaydet</Button>
            </Card>
            <Card className="p-4">
                <h3 className="font-bold mb-2 flex items-center gap-2"><Layers size={18} /> Parti / SKT</h3>
                <ul className="text-xs max-h-64 overflow-auto space-y-1">
                    {batches.map(b => (
                        <li key={b.id}>{b.product_id.slice(0, 8)}… lot {b.lot_code} SKT {b.expiry_date} stok {b.qty}</li>
                    ))}
                    {!batches.length && <li className="text-slate-400">Parti kaydı yok</li>}
                </ul>
            </Card>
        </div>
    );
}

function BizPanel() {
    const [mname, setMname] = useState('');
    const [price, setPrice] = useState('0');
    const [camp, setCamp] = useState('');
    const [subCust, setSubCust] = useState('');
    const [subMem, setSubMem] = useState('');
    const [memberships, setMemberships] = useState<Awaited<ReturnType<typeof beautyService.listMemberships>>>([]);
    const [campaigns, setCampaigns] = useState<Awaited<ReturnType<typeof beautyService.listMarketingCampaigns>>>([]);

    const load = useCallback(async () => {
        setMemberships(await beautyService.listMemberships());
        setCampaigns(await beautyService.listMarketingCampaigns());
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
            <Card className="p-4 space-y-2">
                <h3 className="font-bold">Üyelik planları</h3>
                <div className="flex gap-2 flex-wrap">
                    <Input placeholder="Ad" value={mname} onChange={e => setMname(e.target.value)} />
                    <Input placeholder="Aylık ücret" value={price} onChange={e => setPrice(e.target.value)} />
                    <Button size="sm" onClick={async () => {
                        if (!mname.trim()) return;
                        await beautyService.saveMembership({ name: mname.trim(), monthly_price: Number(price) });
                        setMname('');
                        void load();
                    }}>Kaydet</Button>
                </div>
                <ul className="text-sm">{memberships.map(m => <li key={m.id}>{m.name} — {m.monthly_price}</li>)}</ul>
                <div className="pt-3 border-t border-slate-100 space-y-2">
                    <p className="text-xs font-bold text-slate-600">Üyelik ata</p>
                    <Input placeholder="Müşteri UUID" value={subCust} onChange={e => setSubCust(e.target.value)} className="text-xs" />
                    <Input placeholder="Üyelik planı UUID" value={subMem} onChange={e => setSubMem(e.target.value)} className="text-xs" />
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                            if (!subCust.trim() || !subMem.trim()) return;
                            await beautyService.createMembershipSubscription(subCust.trim(), subMem.trim());
                            setSubCust('');
                            setSubMem('');
                            alert('Üyelik kaydı oluşturuldu.');
                        }}
                    >
                        Aboneliği başlat
                    </Button>
                </div>
            </Card>
            <Card className="p-4 space-y-2">
                <h3 className="font-bold">Kampanyalar</h3>
                <div className="flex gap-2">
                    <Input placeholder="Kampanya adı" value={camp} onChange={e => setCamp(e.target.value)} />
                    <Button size="sm" onClick={async () => {
                        if (!camp.trim()) return;
                        await beautyService.saveMarketingCampaign({ name: camp.trim(), status: 'draft' });
                        setCamp('');
                        void load();
                    }}>Taslak kaydet</Button>
                </div>
                <ul className="text-sm">{campaigns.map(c => <li key={c.id}>{c.name} ({c.status})</li>)}</ul>
            </Card>
        </div>
    );
}

function IntegrationPanel() {
    const [gcal, setGcal] = useState('');
    useEffect(() => {
        void (async () => {
            const i = await beautyService.getIntegrationSettings();
            setGcal(i?.google_calendar_id ?? '');
        })();
    }, []);
    return (
        <Card className="p-4 max-w-lg space-y-2">
            <h3 className="font-bold">Takvim / harici</h3>
            <label className="text-xs text-slate-500">Google Calendar ID</label>
            <Input value={gcal} onChange={e => setGcal(e.target.value)} />
            <Button size="sm" onClick={async () => {
                await beautyService.updateIntegrationSettings({ google_calendar_id: gcal || undefined });
                alert('Kaydedildi.');
            }}>Kaydet</Button>
            <p className="text-xs text-slate-500">
                Gerçek SMS/WhatsApp gönderimi için harici sağlayıcı entegrasyonu bu ekranın ötesinde yapılandırılmalıdır; kuyruk kayıtları operasyon takibi içindir.
            </p>
        </Card>
    );
}

function AuditPanel() {
    const [rows, setRows] = useState<Awaited<ReturnType<typeof beautyService.listAuditLog>>>([]);
    useEffect(() => {
        void (async () => {
            setRows(await beautyService.listAuditLog(80));
        })();
    }, []);
    return (
        <Card className="p-4 max-w-3xl">
            <h3 className="font-bold mb-2">Denetim günlüğü</h3>
            <ul className="text-xs font-mono space-y-1 max-h-96 overflow-auto">
                {rows.map(r => (
                    <li key={r.id}>
                        {r.created_at} {r.action} {r.table_name} {r.record_id?.slice(0, 8)}
                    </li>
                ))}
                {!rows.length && <li className="text-slate-400">Kayıt yok</li>}
            </ul>
        </Card>
    );
}
