
/**
 * AppointmentPOS — Randevu + Kasa birleşik sayfası
 *
 * Sol  : Hizmet / Paket seçim grid'i
 * Sağ  : Sepet (staff) + üst çubukta tarih/saat/cihaz/durum; altta not + Ödeme
 *
 * Akışlar:
 *   [Randevu Oluştur] → yalnızca sepette en az bir hizmet varken randevu kaydı
 *   [Ödeme Tamamla]   → hizmet varsa randevu + satış; sadece ürün/paket ise yalnızca beauty satışı (+ ürün stok düşümü)
 */
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
    ArrowLeft, Plus, Minus, X, Search, User, UserPlus, UserRound, Users,
    CalendarDays, Clock, Cpu, Activity, CheckCircle2, Scissors, Package,
    Sparkles, Receipt, ChevronDown, ChevronUp, MoreHorizontal, ShoppingBag,
    AlertTriangle,
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { AppointmentStatus } from '../../../types/beauty';
import type { BeautyAppointment, BeautyCustomer } from '../../../types/beauty';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import { POSPaymentModal } from '../../pos/POSPaymentModal';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { useProductStore } from '../../../store/useProductStore';
import type { Product } from '../../../core/types';
import { fetchCurrentAccounts } from '../../../services/api/currentAccounts';
import { ERP_SETTINGS } from '../../../services/postgres';
import '../ClinicStyles.css';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CartLine {
    uid: string;
    type: 'service' | 'package' | 'product';
    item_id: string;
    name: string;
    unit_price: number;
    qty: number;
    staff_id?: string;
    color?: string;
    duration_min?: number;
}

interface BookingBlockModalState {
    open: boolean;
    title: string;
    intro: string;
    steps: string[];
    technical?: string;
    diagnostics: { label: string; ok: boolean }[];
}


// ─── Helpers ─────────────────────────────────────────────────────────────────
let _uid = 0;
const uid = () => `line_${++_uid}`;

const fmt = (n: number) => formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });

/** Kısa uzman etiketi (chip içi) */
const specInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** PG time için güvenli HH:mm */
const safeTimeHHmm = (v: unknown, fallback = '09:00') => {
    if (typeof v !== 'string') return fallback;
    const s = v.trim().split('.')[0];
    const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!m) return fallback;
    const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

/** PG date için güvenli YYYY-MM-DD */
const safeDateYmd = (v: unknown, fallback = new Date().toISOString().slice(0, 10)) => {
    if (typeof v !== 'string') return fallback;
    const s = v.trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return fallback;
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const da = parseInt(m[3], 10);
    if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || da < 1 || da > 31) return fallback;
    return `${m[1]}-${m[2]}-${m[3]}`;
};

/** Dokunmatik ekran: ~44px minimum dokunma alanı, çift dokunma yakınlaştırmayı azaltır */
const UZMAN_CHIP_TOUCH: React.CSSProperties = {
    minWidth: 44,
    minHeight: 44,
    padding: '0 10px',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'rgba(124, 58, 237, 0.15)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 800,
    boxSizing: 'border-box',
    cursor: 'pointer',
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
    return (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.09em', display: 'block', marginBottom: 4 }}>
            {children}
        </span>
    );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div style={{ display: 'flex', flexDirection: 'column' }}><Label>{label}</Label>{children}</div>;
}
const iStyle: React.CSSProperties = {
    height: 34, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 5,
    fontSize: 12, fontWeight: 500, color: '#111827', background: '#fafafa', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const selStyle: React.CSSProperties = { ...iStyle, cursor: 'pointer' };

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
    prefillDate?: string;
    prefillTime?: string;
    existingAppointment?: BeautyAppointment | null;
    onBack?: () => void;      // undefined = standalone POS mode
}

export function AppointmentPOS({ prefillDate, prefillTime, existingAppointment, onBack }: Props) {
    const {
        services, packages, specialists, customers, devices,
        loadServices, loadPackages, loadSpecialists, loadCustomers, loadDevices,
        createAppointment, updateAppointment,
    } = useBeautyStore();
    const { products, loadProducts, updateStock } = useProductStore();
    const { tm } = useLanguage();

    const STATUS_OPTS = [
        { value: AppointmentStatus.SCHEDULED, label: tm('bAppointmentScheduled') },
        { value: AppointmentStatus.CONFIRMED, label: tm('bAppointmentConfirmed') },
        { value: AppointmentStatus.IN_PROGRESS, label: tm('bAppointmentStarted') },
    ];

    const CATEGORY_TR: Record<string, string> = {
        laser: tm('bCatLaser'), hair_salon: tm('bCatHairSalon'), beauty: tm('bCatBeauty'),
        botox: tm('bCatBotox'), filler: tm('bCatFiller'), massage: tm('bCatMassage'),
        skincare: tm('bCatSkincare'), makeup: tm('bCatMakeup'), nails: tm('bCatNails'), spa: tm('bCatSpa'),
    };

    // ── Left panel state ─────────────────────────────────────────────────
    const [tab, setTab] = useState<'services' | 'packages' | 'products'>('services');
    const [category, setCategory] = useState('all');
    const [svcQ, setSvcQ] = useState('');

    // ── Cart ─────────────────────────────────────────────────────────────
    const [cart, setCart] = useState<CartLine[]>([]);
    const [discount, setDiscount] = useState(0);

    // ── Customer ─────────────────────────────────────────────────────────
    const [customer, setCustomer] = useState<BeautyCustomer | null>(null);
    const [showCustModal, setShowCustModal] = useState(false);
    const [custModalQ, setCustModalQ] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [newCust, setNewCust] = useState({ name: '', phone: '', email: '' });
    const [savingCust, setSavingCust] = useState(false);
    const [currentAccountCustomers, setCurrentAccountCustomers] = useState<BeautyCustomer[]>([]);
    /** Yeni eklenen hizmet satırlarına otomatik atanır; randevu için zorunlu. */
    const [defaultSpecialistId, setDefaultSpecialistId] = useState('');
    const [bookingBlockModal, setBookingBlockModal] = useState<BookingBlockModalState>({
        open: false,
        title: '',
        intro: '',
        steps: [],
        diagnostics: [],
    });
    /** Sepet satırındaki hizmet için personel — liste modalı (uid) */
    const [staffLinePickerUid, setStaffLinePickerUid] = useState<string | null>(null);

    // ── Appointment details ───────────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];
    const [aptDate, setAptDate] = useState(prefillDate ?? today);
    const [aptTime, setAptTime] = useState(safeTimeHHmm(prefillTime ?? '09:00'));
    const [aptDevice, setAptDevice] = useState('');
    const [aptNotes, setAptNotes] = useState('');
    const [aptStatus, setAptStatus] = useState<AppointmentStatus>(AppointmentStatus.SCHEDULED);
    const [aptOpen, setAptOpen] = useState(true);  // section collapse
    const [hydratedAppointmentId, setHydratedAppointmentId] = useState<string | null>(null);

    // ── Payment modal ─────────────────────────────────────────────────────
    const [showPay, setShowPay] = useState(false);

    // ── Done state ────────────────────────────────────────────────────────
    const [doneMsg, setDoneMsg] = useState('');

    useEffect(() => {
        loadServices(); loadPackages(); loadSpecialists();
        loadCustomers(); loadDevices();
        void loadProducts(true);
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
                logger.error('fetchCurrentAccounts failed in AppointmentPOS', e);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount sync
    }, []);

    /** Sepet satırı silinirse personel modalını kapat */
    useEffect(() => {
        if (!staffLinePickerUid) return;
        const ok = cart.some(l => l.uid === staffLinePickerUid && l.type === 'service');
        if (!ok) setStaffLinePickerUid(null);
    }, [cart, staffLinePickerUid]);

    /** Tek aktif uzman varsa varsayılan personel olarak seç */
    useEffect(() => {
        const act = specialists.filter(s => s.is_active);
        if (act.length === 1) {
            setDefaultSpecialistId(prev => prev || act[0].id);
        }
    }, [specialists]);

    // ── Derived ──────────────────────────────────────────────────────────
    const subtotal = cart.reduce((s, l) => s + l.unit_price * l.qty, 0);
    const discAmt = subtotal * (discount / 100);
    const total = subtotal - discAmt;
    const totalDur = cart.filter(l => l.type === 'service').reduce((s, l) => s + (l.duration_min ?? 0) * l.qty, 0);

    const filteredSvcs = useMemo(() => services.filter(s => {
        const activeOk = s.is_active !== false;
        const catOk = category === 'all' || s.category === category;
        const q = svcQ.trim().toLowerCase();
        const name = (s.name ?? '').toLowerCase();
        const searchOk = !q || name.includes(q);
        return activeOk && catOk && searchOk;
    }), [services, category, svcQ]);

    const categories = useMemo(() => Array.from(new Set(services.map(s => s.category))), [services]);

    /** Stok / mağaza ürünleri (hizmet kartlarından ayrı) */
    const retailProducts = useMemo(() => products.filter(p => {
        if (p.isService === true) return false;
        if (p.is_active === false || p.isActive === false) return false;
        return true;
    }), [products]);

    const productCategories = useMemo(
        () => Array.from(new Set(retailProducts.map(p => p.category).filter(Boolean))) as string[],
        [retailProducts]
    );

    const filteredRetailProducts = useMemo(() => {
        const q = svcQ.trim().toLowerCase();
        return retailProducts.filter(p => {
            const catOk = category === 'all' || (p.category || '') === category;
            const searchOk = !q ||
                (p.name || '').toLowerCase().includes(q) ||
                (p.barcode || '').toLowerCase().includes(q) ||
                (p.code || '').toLowerCase().includes(q);
            return catOk && searchOk;
        });
    }, [retailProducts, category, svcQ]);

    const mergedCustomers = useMemo(() => {
        const map = new Map<string, BeautyCustomer>();
        for (const c of customers) map.set(c.id, c);
        for (const c of currentAccountCustomers) {
            if (!map.has(c.id)) map.set(c.id, c);
        }
        return Array.from(map.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'tr'));
    }, [customers, currentAccountCustomers]);

    const filteredCusts = useMemo(() => {
        const q = custModalQ.toLowerCase();
        if (!q) return mergedCustomers;
        return mergedCustomers.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.phone ?? '').includes(custModalQ) ||
            (c.email ?? '').toLowerCase().includes(q) ||
            (c.code ?? '').toLowerCase().includes(q)
        );
    }, [mergedCustomers, custModalQ]);

    useEffect(() => {
        if (!existingAppointment?.id) {
            setHydratedAppointmentId(null);
            return;
        }
        if (hydratedAppointmentId === existingAppointment.id) return;

        const rawDate = String(existingAppointment.date ?? existingAppointment.appointment_date ?? '').trim();
        const rawTime = String(existingAppointment.appointment_time ?? existingAppointment.time ?? '').trim();
        const customerId = String(existingAppointment.customer_id ?? existingAppointment.client_id ?? '').trim();
        const staffId = String(existingAppointment.staff_id ?? existingAppointment.specialist_id ?? '').trim() || undefined;
        const serviceId = String(existingAppointment.service_id ?? '').trim();

        if (customerId) {
            const picked = mergedCustomers.find(c => String(c.id) === customerId);
            setCustomer(
                picked ?? {
                    id: customerId,
                    name: String(existingAppointment.customer_name ?? 'Müşteri'),
                    is_active: true,
                } as BeautyCustomer
            );
        }

        const mappedService = serviceId ? services.find(s => String(s.id) === serviceId) : undefined;
        if (mappedService) {
            setCart([{
                uid: uid(),
                type: 'service',
                item_id: mappedService.id,
                name: mappedService.name,
                unit_price: Number(existingAppointment.total_price ?? mappedService.price ?? 0),
                qty: 1,
                color: mappedService.color,
                duration_min: Number(existingAppointment.duration ?? mappedService.duration_min ?? 30),
                staff_id: staffId,
            }]);
        }

        setDefaultSpecialistId(staffId ?? '');
        setAptDate(safeDateYmd(rawDate, safeDateYmd(prefillDate ?? new Date().toISOString().slice(0, 10))));
        setAptTime(safeTimeHHmm(rawTime || prefillTime || '09:00'));
        setAptDevice(String(existingAppointment.device_id ?? '').trim());
        setAptNotes(String(existingAppointment.notes ?? ''));
        setAptStatus(existingAppointment.status ?? AppointmentStatus.CONFIRMED);
        setHydratedAppointmentId(existingAppointment.id);
    }, [existingAppointment, hydratedAppointmentId, mergedCustomers, services, prefillDate, prefillTime]);

    const handleSaveNewCustomer = async () => {
        if (!newCust.name.trim()) return;
        setSavingCust(true);
        try {
            const id = await beautyService.createCustomer({ name: newCust.name.trim(), phone: newCust.phone.trim() || undefined, email: newCust.email.trim() || undefined, is_active: true });
            await loadCustomers();
            const accounts = await fetchCurrentAccounts(ERP_SETTINGS.firmNr, 'MUSTERI');
            setCurrentAccountCustomers(
                accounts.map(a => ({
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
            const created = { id, name: newCust.name.trim(), phone: newCust.phone.trim() || undefined, is_active: true } as BeautyCustomer;
            setCustomer(created);
            setShowCustModal(false);
            setShowAddForm(false);
            setNewCust({ name: '', phone: '', email: '' });
        } catch (e) {
            logger.error('createCustomer failed', e);
        } finally {
            setSavingCust(false);
        }
    };

    // ── Cart actions ──────────────────────────────────────────────────────
    const addService = (svc: typeof services[0]) => {
        setCart(c => {
            const ex = c.find(l => l.type === 'service' && l.item_id === svc.id);
            if (ex) return c.map(l => l.uid === ex.uid ? { ...l, qty: l.qty + 1 } : l);
            const staffId = defaultSpecialistId || undefined;
            return [...c, {
                uid: uid(),
                type: 'service',
                item_id: svc.id,
                name: svc.name,
                unit_price: svc.price,
                qty: 1,
                color: svc.color,
                duration_min: svc.duration_min,
                staff_id: staffId,
            }];
        });
    };
    const addPackage = (pkg: typeof packages[0]) => {
        setCart(c => {
            if (c.find(l => l.type === 'package' && l.item_id === pkg.id)) return c;
            const fp = pkg.price * (1 - (pkg.discount_pct ?? 0) / 100);
            return [...c, { uid: uid(), type: 'package', item_id: pkg.id, name: pkg.name, unit_price: fp, qty: 1, color: pkg.color }];
        });
    };

    const addRetailProduct = (p: Product) => {
        setCart(c => {
            const ex = c.find(l => l.type === 'product' && l.item_id === p.id);
            if (ex) return c.map(l => l.uid === ex.uid ? { ...l, qty: l.qty + 1 } : l);
            return [...c, {
                uid: uid(),
                type: 'product',
                item_id: p.id,
                name: p.name,
                unit_price: p.price,
                qty: 1,
                color: '#0d9488',
            }];
        });
    };
    const chgQty = (uid: string, d: number) => setCart(c => c.map(l => l.uid === uid ? { ...l, qty: Math.max(1, l.qty + d) } : l));
    const remLine = (uid: string) => setCart(c => c.filter(l => l.uid !== uid));
    const setStaff = (uid: string, sid: string) => setCart(c => c.map(l => l.uid === uid ? { ...l, staff_id: sid } : l));
    const pickDefaultSpecialist = (id: string) => {
        setDefaultSpecialistId(id);
        setCart(c =>
            c.map(l => (l.type === 'service' && !l.staff_id?.trim() ? { ...l, staff_id: id } : l))
        );
    };
    const clearDefaultSpecialist = () => setDefaultSpecialistId('');
    const clearCart = () => { setCart([]); setCustomer(null); setDiscount(0); };

    // ── Save actions ──────────────────────────────────────────────────────
    const canSave = cart.length > 0 && !!customer;
    const serviceLines = useMemo(() => cart.filter(l => l.type === 'service'), [cart]);
    /** Randevu: en az bir hizmet + her hizmet satırında personel (ürün/paket tek başına randevu oluşturmaz). */
    const allServicesStaffed = serviceLines.length === 0 || serviceLines.every(l => !!l.staff_id?.trim());
    const canBookApt = serviceLines.length > 0 && allServicesStaffed;

    const activeSpecialists = useMemo(() => specialists.filter(s => s.is_active), [specialists]);

    const buildDiagnostics = useCallback((): { label: string; ok: boolean }[] => {
        const deviceTrim = typeof aptDevice === 'string' ? aptDevice.trim() : '';
        const deviceLabel = deviceTrim
            ? (devices.find(d => String(d.id) === String(deviceTrim))?.name ?? deviceTrim.slice(0, 8) + '…')
            : '—';
        const rows: { label: string; ok: boolean }[] = [
            {
                label: `${tm('bDiagCustomer')}: ${customer?.name || '—'}`,
                ok: !!customer?.id,
            },
            {
                label: `${tm('bDiagDevice')}: ${deviceLabel}`,
                ok: !deviceTrim || devices.some(d => String(d.id) === String(deviceTrim) && d.is_active),
            },
        ];
        for (const l of serviceLines) {
            rows.push({
                label: `${tm('bDiagService')}: ${l.name}`,
                ok: true,
            });
            const sid = l.staff_id?.trim();
            const sname = sid ? (specialists.find(s => s.id === sid)?.name ?? sid.slice(0, 8) + '…') : '—';
            rows.push({
                label: `${tm('bDiagSpecialist')}: ${sname}`,
                ok: !!sid,
            });
        }
        return rows;
    }, [aptDevice, customer, devices, serviceLines, specialists, tm]);

    const openBookingBlockModal = useCallback(
        (kind: 'customer' | 'service' | 'staff' | 'no_specialists' | 'api_error', apiTechnical?: string) => {
            const diag = buildDiagnostics();
            let title: string;
            let intro: string;
            let steps: string[];
            switch (kind) {
                case 'customer':
                    title = tm('bBookingModalTitleCustomer');
                    intro = tm('bBookingModalIntroCustomer');
                    steps = [tm('bBookingModalStepCustomer1'), tm('bBookingModalStepCustomer2')];
                    break;
                case 'service':
                    title = tm('bBookingModalTitleService');
                    intro = tm('bBookingModalIntroService');
                    steps = [tm('bBookingModalStepService1')];
                    break;
                case 'no_specialists':
                    title = tm('bBookingModalTitleNoSpecialists');
                    intro = tm('bBookingModalIntroNoSpecialists');
                    steps = [tm('bBookingModalStepNoSpecialists1'), tm('bBookingModalStepNoSpecialists2')];
                    break;
                case 'staff':
                    title = tm('bBookingModalTitleStaff');
                    intro = tm('bBookingModalIntroStaff');
                    steps = [
                        tm('bBookingModalStepStaff1'),
                        tm('bBookingModalStepStaff2'),
                        ...serviceLines
                            .filter(l => !l.staff_id?.trim())
                            .map(l => `→ ${l.name}: ${tm('bBookingModalStepStaffPerLine')}`),
                    ];
                    break;
                case 'api_error':
                    title = tm('bBookingModalTitleApi');
                    intro = tm('bBookingModalIntroApi');
                    steps = [tm('bBookingModalStepApi1'), tm('bBookingModalStepApi2')];
                    break;
                default:
                    title = '';
                    intro = '';
                    steps = [];
            }
            setBookingBlockModal({
                open: true,
                title,
                intro,
                steps,
                technical: apiTechnical,
                diagnostics: diag,
            });
        },
        [buildDiagnostics, serviceLines, tm]
    );

    /** Hata objesi farklı formatta gelse bile teknik detayı üret */
    const extractTechnicalError = (e: unknown): string => {
        if (!e) return '';
        if (typeof e === 'string') return e;
        if (typeof e === 'number' || typeof e === 'boolean') return String(e);
        if (e instanceof Error && e.message?.trim()) return e.message;

        if (typeof e === 'object') {
            const anyErr = e as Record<string, unknown>;
            const parts = [
                anyErr.message,
                anyErr.code,
                anyErr.detail,
                anyErr.hint,
                anyErr.context,
            ]
                .filter(v => typeof v === 'string' && v.trim().length > 0)
                .map(v => String(v).trim());
            if (parts.length) return parts.join(' | ');
            try {
                return JSON.stringify(anyErr);
            } catch {
                return String(anyErr);
            }
        }
        return '';
    };

    const buildAptPayload = () => {
        const firstSvc = cart.find(l => l.type === 'service');
        const rawStaff = firstSvc?.staff_id;
        const staffTrim = typeof rawStaff === 'string' ? rawStaff.trim() : '';
        const aptTimeSafe = safeTimeHHmm(aptTime);
        const aptDateSafe = safeDateYmd(aptDate);
        return {
            customer_id: customer!.id,
            service_id: firstSvc?.item_id,
            staff_id: staffTrim || undefined,
            device_id: aptDevice || undefined,
            date: aptDateSafe,
            appointment_date: aptDateSafe,
            time: aptTimeSafe,
            appointment_time: aptTimeSafe,
            duration: totalDur || 30,
            total_price: total,
            status: aptStatus,
            notes: aptNotes,
            type: 'regular',
            is_package_session: false,
        };
    };

    const hhmmToMin = (t: string): number | null => {
        const m = String(t ?? '').trim().match(/^(\d{1,2}):(\d{2})/);
        if (!m) return null;
        const hh = Number(m[1]); const mm = Number(m[2]);
        if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
        return hh * 60 + mm;
    };
    const minToHhmm = (m: number): string => {
        const n = Math.max(0, Math.min(23 * 60 + 59, Math.floor(m)));
        const hh = Math.floor(n / 60).toString().padStart(2, '0');
        const mm = (n % 60).toString().padStart(2, '0');
        return `${hh}:${mm}`;
    };
    const overlaps = (aStart: number, aDur: number, bStart: number, bDur: number): boolean => {
        const aEnd = aStart + Math.max(1, aDur);
        const bEnd = bStart + Math.max(1, bDur);
        return aStart < bEnd && bStart < aEnd;
    };

    const buildServiceAppointmentPayloads = (statusForCreate?: AppointmentStatus) => {
        const dateSafe = safeDateYmd(aptDate);
        const baseStart = hhmmToMin(safeTimeHHmm(aptTime)) ?? 9 * 60;
        const perStaffOffset = new Map<string, number>();
        const planned: ReturnType<typeof buildAptPayload>[] = [];

        for (const line of serviceLines) {
            const sid = String(line.staff_id ?? '').trim();
            const d = Math.max(1, Number(line.duration_min ?? 30) * Math.max(1, Number(line.qty ?? 1)));
            const offset = sid ? (perStaffOffset.get(sid) ?? 0) : 0;
            const startMin = baseStart + offset;
            if (sid) perStaffOffset.set(sid, offset + d);
            const startHhmm = minToHhmm(startMin);
            planned.push({
                customer_id: customer!.id,
                service_id: line.item_id,
                staff_id: sid || undefined,
                device_id: aptDevice || undefined,
                date: dateSafe,
                appointment_date: dateSafe,
                time: startHhmm,
                appointment_time: startHhmm,
                duration: d,
                total_price: Number(line.unit_price ?? 0) * Math.max(1, Number(line.qty ?? 1)),
                status: statusForCreate ?? aptStatus,
                notes: aptNotes,
                type: 'regular',
                is_package_session: false,
            });
        }
        return planned;
    };

    const ensureNoStaffConflicts = async (planned: ReturnType<typeof buildAptPayload>[]) => {
        const day = safeDateYmd(aptDate);
        const existing = await beautyService.getAppointmentsInRange(day, day);
        for (const p of planned) {
            const sid = String(p.staff_id ?? '').trim();
            if (!sid) continue;
            const pStart = hhmmToMin(String(p.time ?? p.appointment_time ?? ''));
            const pDur = Math.max(1, Number(p.duration ?? 30));
            if (pStart == null) continue;
            const clash = existing.find(e => {
                const eSid = String(e.staff_id ?? e.specialist_id ?? '').trim();
                if (eSid !== sid) return false;
                if (existingAppointment?.id && String(e.id) === String(existingAppointment.id)) return false;
                const eStart = hhmmToMin(String(e.appointment_time ?? e.time ?? ''));
                const eDur = Math.max(1, Number(e.duration ?? 30));
                return eStart != null && overlaps(pStart, pDur, eStart, eDur);
            });
            if (clash) {
                const staffName = specialists.find(s => s.id === sid)?.name ?? sid;
                throw new Error(`Saat çakışması: ${staffName} için ${String(p.time)} zamanında randevu var.`);
            }
        }
    };

    const handleBookOnly = async () => {
        if (!canSave || !canBookApt) return;
        try {
            const planned = buildServiceAppointmentPayloads(aptStatus);
            await ensureNoStaffConflicts(planned);
            for (const p of planned) {
                await createAppointment(p);
            }
            setDoneMsg(tm('bAppointmentCreated'));
            setTimeout(() => { setDoneMsg(''); clearCart(); onBack?.(); }, 1400);
        } catch (e: unknown) {
            logger.crudError('AppointmentPOS', 'bookAppointment', e);
            const msg = extractTechnicalError(e);
            openBookingBlockModal('api_error', msg || tm('bBookingErrorGeneric'));
        }
    };

    /** Randevu Oluştur — eksikleri modalda göster */
    const tryBookAppointment = () => {
        if (!customer) {
            openBookingBlockModal('customer');
            return;
        }
        if (serviceLines.length === 0) {
            openBookingBlockModal('service');
            return;
        }
        if (activeSpecialists.length === 0) {
            openBookingBlockModal('no_specialists');
            return;
        }
        if (!allServicesStaffed) {
            openBookingBlockModal('staff');
            return;
        }
        void handleBookOnly();
    };

    const tryOpenPay = () => {
        if (!customer) {
            openBookingBlockModal('customer');
            return;
        }
        if (!cart.length) return;
        if (serviceLines.length > 0 && activeSpecialists.length === 0) {
            openBookingBlockModal('no_specialists');
            return;
        }
        if (serviceLines.length > 0 && !allServicesStaffed) {
            openBookingBlockModal('staff');
            return;
        }
        setShowPay(true);
    };

    const handlePayComplete = async (paymentData: any) => {
        if (!canSave) return;
        if (serviceLines.length > 0 && !allServicesStaffed) {
            setShowPay(false);
            openBookingBlockModal('staff');
            return;
        }
        if (serviceLines.length > 0 && activeSpecialists.length === 0) {
            setShowPay(false);
            openBookingBlockModal('no_specialists');
            return;
        }
        try {
            if (existingAppointment?.id) {
                await updateAppointment(existingAppointment.id, {
                    appointment_date: safeDateYmd(aptDate),
                    appointment_time: safeTimeHHmm(aptTime),
                    date: safeDateYmd(aptDate),
                    time: safeTimeHHmm(aptTime),
                    device_id: aptDevice || null,
                    notes: aptNotes || null,
                    status: AppointmentStatus.COMPLETED,
                    total_price: total,
                    duration: totalDur || existingAppointment.duration || 30,
                });
            } else if (canBookApt) {
                const planned = buildServiceAppointmentPayloads(AppointmentStatus.CONFIRMED);
                await ensureNoStaffConflicts(planned);
                for (const p of planned) {
                    await createAppointment(p);
                }
            }

            const saleItems = cart.map(line => ({
                item_type: line.type,
                item_id: line.item_id,
                name: line.name,
                quantity: line.qty,
                unit_price: line.unit_price,
                discount: 0,
                total: line.unit_price * line.qty,
                staff_id: line.staff_id ?? null,
                commission_amount: 0,
            }));
            await beautyService.createSale({
                customer_id: customer!.id,
                subtotal,
                discount: discAmt,
                tax: 0,
                total,
                payment_method: paymentData?.payments?.[0]?.method ?? 'cash',
                payment_status: 'paid',
                paid_amount: total,
                remaining_amount: 0,
            }, saleItems);

            for (const line of cart) {
                if (line.type !== 'product') continue;
                const p = useProductStore.getState().products.find(x => x.id === line.item_id);
                if (p) await updateStock(p.id, Math.max(0, (p.stock ?? 0) - line.qty));
            }

            setDoneMsg(tm('bPaymentCompleted'));
            setShowPay(false);
            setTimeout(() => { setDoneMsg(''); clearCart(); onBack?.(); }, 1400);
        } catch (e: unknown) {
            logger.crudError('AppointmentPOS', 'payAndBook', e);
            setShowPay(false);
            const msg = extractTechnicalError(e);
            openBookingBlockModal('api_error', msg || tm('bBookingErrorGeneric'));
        }
    };

    // ── Done splash ───────────────────────────────────────────────────────
    if (doneMsg) return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#f7f6fb' }}>
            <CheckCircle2 size={56} color="#059669" />
            <p style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{doneMsg}</p>
        </div>
    );

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f7f6fb', overflow: 'hidden' }}>

            {/* ── TOP BAR: tarih + saat + cihaz + durum (altta yalnızca not) ── */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
                {onBack && (
                    <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 5, background: '#f9fafb', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        <ArrowLeft size={13} /> Takvim
                    </button>
                )}
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0 }}>
                        {onBack ? tm('bAppointmentPOS') : 'Kasa / POS'}
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '4px 10px' }}>
                        <CalendarDays size={12} color="#7c3aed" />
                        <input type="date" value={aptDate} onChange={e => setAptDate(e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, color: '#4c1d95', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '4px 10px' }}>
                        <Clock size={12} color="#7c3aed" />
                        <input type="time" value={aptTime} onChange={e => setAptTime(e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, color: '#4c1d95', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '2px 8px 2px 10px', minWidth: 0, maxWidth: 220 }}>
                        <Cpu size={12} color="#7c3aed" style={{ flexShrink: 0 }} />
                        <select
                            value={aptDevice}
                            onChange={e => setAptDevice(String(e.target.value))}
                            title={tm('bDiagDevice')}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#4c1d95',
                                outline: 'none',
                                cursor: 'pointer',
                                minWidth: 100,
                                maxWidth: 180,
                                flex: 1,
                            }}
                        >
                            <option value="">{tm('bDeviceSelectPlaceholder')}</option>
                            {devices.filter(d => d.is_active).map(d => (
                                <option key={d.id} value={String(d.id)}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '2px 8px 2px 10px', minWidth: 0, maxWidth: 200 }}>
                        <Activity size={12} color="#7c3aed" style={{ flexShrink: 0 }} />
                        <select
                            value={aptStatus}
                            onChange={e => setAptStatus(e.target.value as AppointmentStatus)}
                            title={tm('bStatus')}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#4c1d95',
                                outline: 'none',
                                cursor: 'pointer',
                                minWidth: 88,
                                maxWidth: 160,
                                flex: 1,
                            }}
                        >
                            {STATUS_OPTS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* ── BODY ────────────────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* ── LEFT: Item grid ─────────────────────────────── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #e8e4f0' }}>
                    {/* Tabs + search (+ hizmetlerde kategori + varsayılan uzman tek satır) */}
                    <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '8px 12px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 0, flexWrap: 'wrap' }}>
                            {([
                                { id: 'services' as const, label: 'Hizmetler', Icon: Scissors },
                                { id: 'packages' as const, label: 'Paketler', Icon: Package },
                                { id: 'products' as const, label: 'Ürünler', Icon: ShoppingBag },
                            ]).map(({ id, label, Icon }) => (
                                <button key={id} onClick={() => { setTab(id); setCategory('all'); setSvcQ(''); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 5,
                                    border: tab === id ? 'none' : '1px solid #e5e7eb',
                                    background: tab === id ? '#7c3aed' : '#f9fafb',
                                    color: tab === id ? '#fff' : '#6b7280',
                                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                }}>
                                    <Icon size={12} />{label}
                                </button>
                            ))}
                            <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
                                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                <input value={svcQ} onChange={e => setSvcQ(e.target.value)}
                                    placeholder={tab === 'products' ? 'Ürün, barkod ara...' : tab === 'packages' ? 'Paket ara...' : 'Hizmet ara...'}
                                    style={{ ...iStyle, paddingLeft: 26, height: 30 }} />
                            </div>
                        </div>
                        {tab === 'services' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flex: '1 1 120px', minWidth: 0, scrollbarWidth: 'none' }}>
                                    {['all', ...categories].map(cat => (
                                        <button key={cat} onClick={() => setCategory(cat)} style={{
                                            flexShrink: 0, padding: '2px 8px', borderRadius: 4,
                                            border: category === cat ? 'none' : '1px solid #e5e7eb',
                                            background: category === cat ? '#ede9fe' : '#f9fafb',
                                            color: category === cat ? '#7c3aed' : '#6b7280',
                                            fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                                        }}>
                                            {cat === 'all' ? tm('bAll') : (CATEGORY_TR[cat] ?? cat)}
                                        </button>
                                    ))}
                                </div>
                                <div
                                    title={`${tm('bDefaultSpecialist')}: ${tm('bDefaultSpecialistHint')}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        flexShrink: 0,
                                        paddingLeft: 8,
                                        borderLeft: '1px solid #e8e4f0',
                                        touchAction: 'manipulation',
                                    }}
                                >
                                    <UserRound size={16} color="#7c3aed" style={{ flexShrink: 0, pointerEvents: 'none' }} />
                                    <button
                                        type="button"
                                        title={tm('bDefaultSpecialistPlaceholder')}
                                        onClick={() => clearDefaultSpecialist()}
                                        style={{
                                            ...UZMAN_CHIP_TOUCH,
                                            width: 44,
                                            height: 44,
                                            padding: 0,
                                            flexShrink: 0,
                                            border: !defaultSpecialistId ? 'none' : '1px solid #e5e7eb',
                                            background: !defaultSpecialistId ? '#7c3aed' : '#f3f4f6',
                                            color: !defaultSpecialistId ? '#fff' : '#6b7280',
                                            fontSize: 14,
                                            lineHeight: 1,
                                        }}
                                    >
                                        —
                                    </button>
                                    {activeSpecialists.map(s => {
                                        const sel = defaultSpecialistId === s.id;
                                        return (
                                            <button
                                                key={s.id}
                                                type="button"
                                                title={s.name}
                                                onClick={() => pickDefaultSpecialist(s.id)}
                                                style={{
                                                    ...UZMAN_CHIP_TOUCH,
                                                    flexShrink: 0,
                                                    border: sel ? 'none' : '1px solid #e5e7eb',
                                                    background: sel ? '#7c3aed' : '#f3f4f6',
                                                    color: sel ? '#fff' : '#374151',
                                                    letterSpacing: '0.02em',
                                                }}
                                            >
                                                {specInitials(s.name)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {tab === 'products' && (
                            <div style={{ display: 'flex', gap: 5, overflowX: 'auto', scrollbarWidth: 'none', marginTop: 6 }}>
                                {['all', ...productCategories].map(cat => (
                                    <button key={cat} onClick={() => setCategory(cat)} style={{
                                        flexShrink: 0, padding: '3px 9px', borderRadius: 4,
                                        border: category === cat ? 'none' : '1px solid #e5e7eb',
                                        background: category === cat ? '#ccfbf1' : '#f9fafb',
                                        color: category === cat ? '#0d9488' : '#6b7280',
                                        fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                                    }}>
                                        {cat === 'all' ? tm('bAll') : cat}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Grid */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px,1fr))', gap: 8, alignContent: 'start' }} className="custom-scrollbar">
                        {tab === 'services' && filteredSvcs.map(svc => (
                            <button key={svc.id} onClick={() => addService(svc)} style={{
                                background: '#fff', border: '1px solid #e8e4f0',
                                borderTop: `3px solid ${svc.color ?? '#7c3aed'}`,
                                borderRadius: 7, padding: '10px', textAlign: 'left', cursor: 'pointer',
                                transition: 'box-shadow 0.1s',
                            }}
                                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(124,58,237,0.15)')}
                                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                            >
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 3, lineHeight: 1.3 }}>{svc.name}</p>
                                <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase' }}>
                                    {CATEGORY_TR[svc.category] ?? svc.category} · {svc.duration_min}dk
                                </p>
                                <p style={{ fontSize: 13, fontWeight: 800, color: svc.color ?? '#7c3aed' }}>{fmt(svc.price)}</p>
                            </button>
                        ))}
                        {tab === 'packages' && packages.filter(pkg => !svcQ.trim() || pkg.name.toLowerCase().includes(svcQ.toLowerCase())).map(pkg => {
                            const fp = pkg.price * (1 - (pkg.discount_pct ?? 0) / 100);
                            return (
                                <button key={pkg.id} onClick={() => addPackage(pkg)} style={{
                                    background: '#fff', border: '1px solid #e8e4f0',
                                    borderTop: `3px solid ${pkg.color ?? '#7c3aed'}`,
                                    borderRadius: 7, padding: '10px', textAlign: 'left', cursor: 'pointer',
                                }}>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 3 }}>{pkg.name}</p>
                                    <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>{pkg.total_sessions} seans · {pkg.validity_days}g</p>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                                        <span style={{ fontSize: 13, fontWeight: 800, color: pkg.color ?? '#7c3aed' }}>{fmt(fp)}</span>
                                        {(pkg.discount_pct ?? 0) > 0 && <span style={{ fontSize: 10, color: '#9ca3af', textDecoration: 'line-through' }}>{fmt(pkg.price)}</span>}
                                    </div>
                                </button>
                            );
                        })}
                        {tab === 'products' && filteredRetailProducts.map(p => (
                            <button key={p.id} onClick={() => addRetailProduct(p)} style={{
                                background: '#fff', border: '1px solid #e8e4f0',
                                borderTop: '3px solid #0d9488',
                                borderRadius: 7, padding: '10px', textAlign: 'left', cursor: 'pointer',
                                transition: 'box-shadow 0.1s',
                            }}
                                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(13,148,136,0.2)')}
                                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                            >
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 3, lineHeight: 1.3 }}>{p.name}</p>
                                <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
                                    {(p.category || 'Genel')}{(p.barcode ? ` · ${p.barcode}` : '')}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0d9488' }}>{fmt(p.price)}</span>
                                    <span style={{ fontSize: 10, fontWeight: 600, color: (p.stock ?? 0) <= 0 ? '#ef4444' : '#6b7280' }}>
                                        Stok: {p.stock ?? 0}
                                    </span>
                                </div>
                            </button>
                        ))}
                        {tab === 'services' && filteredSvcs.length === 0 && (
                            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', color: '#d1d5db', gap: 8 }}>
                                <Scissors size={28} />
                                <p style={{ fontSize: 12, fontWeight: 600 }}>Hizmet bulunamadı</p>
                            </div>
                        )}
                        {tab === 'products' && filteredRetailProducts.length === 0 && (
                            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', color: '#d1d5db', gap: 8 }}>
                                <ShoppingBag size={28} />
                                <p style={{ fontSize: 12, fontWeight: 600 }}>Ürün bulunamadı</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Cart + Appointment + Checkout ─────────── */}
                <div style={{ width: 400, height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>

                    {/* Customer Section - Compact & Modern */}
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 14px',
                            background: customer ? '#f5f3ff' : '#fafafa',
                            borderRadius: 12,
                            border: `1px solid ${customer ? '#ddd6fe' : '#e5e7eb'}`,
                            transition: 'all 0.2s ease',
                            boxShadow: customer ? '0 2px 4px rgba(124, 58, 237, 0.05)' : 'none'
                        }}>
                            <div style={{
                                width: 36,
                                height: 36,
                                background: customer ? '#7c3aed' : '#f3f4f6',
                                borderRadius: 10,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: customer ? '#fff' : '#9ca3af',
                                fontSize: 14,
                                fontWeight: 800,
                                flexShrink: 0
                            }}>
                                {customer ? customer.name.charAt(0).toUpperCase() : <User size={18} />}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                {customer ? (
                                    <>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>{customer.name}</p>
                                        {customer.phone && <p style={{ fontSize: 11, color: '#6b7280', margin: 0, marginTop: 2 }}>{customer.phone}</p>}
                                    </>
                                ) : (
                                    <button
                                        onClick={() => { setShowCustModal(true); setCustModalQ(''); setShowAddForm(false); }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: 0,
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: '#6b7280',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            width: '100%'
                                        }}
                                    >
                                        {tm('bSelectCustomer')}...
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {customer && (
                                    <button
                                        onClick={() => setCustomer(null)}
                                        style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: 8,
                                            border: 'none',
                                            background: '#fee2e2',
                                            color: '#ef4444',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                                <button
                                    onClick={() => { setShowCustModal(true); setCustModalQ(''); setShowAddForm(false); }}
                                    style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 8,
                                        border: '1px solid #e5e7eb',
                                        background: '#fff',
                                        color: '#374151',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.1s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                >
                                    <MoreHorizontal size={14} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Modern Customer Modal */}
                    {showCustModal && (
                        <div style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(17, 24, 39, 0.4)',
                            backdropFilter: 'blur(8px)',
                            zIndex: 200,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 20
                        }}>
                            <div style={{
                                background: '#fff',
                                borderRadius: 20,
                                width: '100%',
                                maxWidth: 480,
                                maxHeight: '85vh',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}>
                                {/* Header */}
                                <div style={{
                                    padding: '24px 24px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div>
                                        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>{tm('bSelectCustomer')}</h3>
                                        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Satış için bir müşteri seçin veya ekleyin.</p>
                                    </div>
                                    <button
                                        onClick={() => setShowCustModal(false)}
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 10,
                                            background: '#f3f4f6',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: '#6b7280',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Search Bar */}
                                <div style={{ padding: '0 24px 16px' }}>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                        <input
                                            autoFocus
                                            value={custModalQ}
                                            onChange={e => setCustModalQ(e.target.value)}
                                            placeholder="İsim, telefon veya e-posta..."
                                            style={{
                                                width: '100%',
                                                height: 46,
                                                padding: '0 16px 0 44px',
                                                background: '#f9fafb',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: 14,
                                                fontSize: 14,
                                                fontWeight: 500,
                                                color: '#111827',
                                                outline: 'none',
                                                boxSizing: 'border-box',
                                                transition: 'all 0.2s'
                                            }}
                                            onFocus={e => e.currentTarget.style.borderColor = '#7c3aed'}
                                            onBlur={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                                        />
                                    </div>
                                </div>

                                {/* List Section */}
                                <div style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '0 12px 12px',
                                    minHeight: 200
                                }} className="custom-scrollbar">
                                    {filteredCusts.length === 0 ? (
                                        <div style={{ padding: '40px 0', textAlign: 'center' }}>
                                            <div style={{
                                                width: 48, height: 48, background: '#f3f4f6', borderRadius: 16,
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#9ca3af', marginBottom: 12
                                            }}>
                                                <User size={24} />
                                            </div>
                                            <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>Müşteri bulunamadı</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {filteredCusts.map(c => (
                                                <button key={c.id}
                                                    onClick={() => { setCustomer(c); setShowCustModal(false); setCustModalQ(''); }}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 12,
                                                        width: '100%',
                                                        padding: '12px',
                                                        background: 'transparent',
                                                        border: 'none',
                                                        borderRadius: 12,
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.background = '#f5f3ff';
                                                        e.currentTarget.style.transform = 'translateX(4px)';
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.background = 'transparent';
                                                        e.currentTarget.style.transform = 'translateX(0)';
                                                    }}
                                                >
                                                    <div style={{
                                                        width: 40,
                                                        height: 40,
                                                        background: '#ede9fe',
                                                        borderRadius: 10,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#7c3aed',
                                                        fontSize: 14,
                                                        fontWeight: 800,
                                                        flexShrink: 0
                                                    }}>
                                                        {c.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 }}>{c.name}</p>
                                                        {c.phone && <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>{c.phone}</p>}
                                                    </div>
                                                    <div style={{ color: '#d1d5db' }}>
                                                        <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Quick Add / Footer */}
                                <div style={{
                                    padding: '16px 24px 24px',
                                    borderTop: '1px solid #f3f4f6',
                                    background: '#fafafa'
                                }}>
                                    {!showAddForm ? (
                                        <button
                                            onClick={() => setShowAddForm(true)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8,
                                                width: '100%',
                                                height: 44,
                                                background: '#7c3aed',
                                                border: 'none',
                                                borderRadius: 12,
                                                cursor: 'pointer',
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 700,
                                                boxShadow: '0 4px 12px rgba(124, 58, 237, 0.2)'
                                            }}
                                        >
                                            <UserPlus size={18} />
                                            {tm('bNewCustomer')}
                                        </button>
                                    ) : (
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 10,
                                            background: '#fff',
                                            padding: 16,
                                            borderRadius: 14,
                                            border: '1px solid #e5e7eb'
                                        }}>
                                            <h4 style={{ margin: '0 0 5px', fontSize: 13, fontWeight: 700, color: '#374151' }}>Yeni Kayıt</h4>
                                            <input value={newCust.name} onChange={e => setNewCust(p => ({ ...p, name: e.target.value }))} placeholder="Ad Soyad *" style={{ ...iStyle, borderRadius: 10, height: 40 }} />
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                <input value={newCust.phone} onChange={e => setNewCust(p => ({ ...p, phone: e.target.value }))} placeholder="Telefon" style={{ ...iStyle, borderRadius: 10, height: 40 }} />
                                                <input value={newCust.email} onChange={e => setNewCust(p => ({ ...p, email: e.target.value }))} placeholder="E-posta" style={{ ...iStyle, borderRadius: 10, height: 40 }} />
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                                                <button onClick={() => { setShowAddForm(false); setNewCust({ name: '', phone: '', email: '' }); }} style={{ flex: 1, height: 38, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>İptal</button>
                                                <button onClick={handleSaveNewCustomer} disabled={!newCust.name.trim() || savingCust} style={{ flex: 1.5, height: 38, border: 'none', borderRadius: 10, background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: (!newCust.name.trim() || savingCust) ? 0.6 : 1 }}>
                                                    {savingCust ? '...' : 'Müşteriyi Kaydet'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Cart Section (Scrollable) */}
                    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="custom-scrollbar">
                        {cart.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#d1d5db', gap: 8 }}>
                                <Sparkles size={32} />
                                <p style={{ fontSize: 12, fontWeight: 600 }}>Hizmet, paket veya ürün ekleyin</p>
                            </div>
                        ) : cart.map(line => (
                            <div key={line.uid} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ width: 3, height: 32, borderRadius: 2, background: line.color ?? '#7c3aed', flexShrink: 0, marginTop: 2 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <span style={{
                                                    fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
                                                    color: line.type === 'product' ? '#0d9488' : line.type === 'package' ? '#7c3aed' : '#6366f1',
                                                    display: 'block', marginBottom: 3,
                                                }}>
                                                    {line.type === 'product' ? 'ÜRÜN' : line.type === 'package' ? 'PAKET' : 'HİZMET'}
                                                </span>
                                                <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{line.name}</p>
                                            </div>
                                            <button type="button" onClick={() => remLine(line.uid)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', flexShrink: 0 }}><X size={12} /></button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <button onClick={() => chgQty(line.uid, -1)} style={{ width: 20, height: 20, border: '1px solid #e5e7eb', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f9fafb', color: '#6b7280' }}><Minus size={9} /></button>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', minWidth: 14, textAlign: 'center' }}>{line.qty}</span>
                                                <button onClick={() => chgQty(line.uid, 1)} style={{ width: 20, height: 20, border: '1px solid #e5e7eb', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f9fafb', color: '#6b7280' }}><Plus size={9} /></button>
                                            </div>
                                            <span style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>{fmt(line.unit_price * line.qty)}</span>
                                        </div>
                                        {line.type === 'service' && (
                                            <div
                                                style={{
                                                    marginTop: 6,
                                                    display: 'flex',
                                                    gap: 6,
                                                    alignItems: 'stretch',
                                                    touchAction: 'manipulation',
                                                }}
                                            >
                                                <select
                                                    value={line.staff_id ?? ''}
                                                    onChange={e => setStaff(line.uid, e.target.value)}
                                                    title={!line.staff_id?.trim() ? tm('bLineStaffRequired') : undefined}
                                                    style={{
                                                        flex: 1,
                                                        minWidth: 0,
                                                        minHeight: 44,
                                                        padding: '0 10px',
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        borderRadius: 8,
                                                        border: line.staff_id?.trim()
                                                            ? '1px solid #e5e7eb'
                                                            : '1px solid #fcd34d',
                                                        background: line.staff_id?.trim() ? '#fafafa' : '#fffbeb',
                                                        color: line.staff_id?.trim() ? '#374151' : '#b45309',
                                                        outline: 'none',
                                                        cursor: 'pointer',
                                                        boxSizing: 'border-box',
                                                    }}
                                                >
                                                    <option value="">{tm('bLineStaffRequired')}</option>
                                                    {activeSpecialists.map(s => (
                                                        <option key={s.id} value={s.id}>{s.name}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    title={tm('bStaffPickModalTitle')}
                                                    onClick={() => setStaffLinePickerUid(line.uid)}
                                                    style={{
                                                        width: 44,
                                                        height: 44,
                                                        flexShrink: 0,
                                                        borderRadius: 8,
                                                        border: '1px solid #ddd6fe',
                                                        background: '#f5f3ff',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#7c3aed',
                                                        touchAction: 'manipulation',
                                                    }}
                                                >
                                                    <Users size={18} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Bottom Fixed Section: Appointment Details + Totals + Actions */}
                    <div style={{ borderTop: '1px solid #e5e7eb', flexShrink: 0, background: '#fff' }}>
                        {/* Appointment details (collapsible) */}
                        <div style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <button
                                onClick={() => setAptOpen(o => !o)}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CalendarDays size={13} color="#7c3aed" />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Randevu Detayları</span>
                                    {totalDur > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af' }}>· {totalDur}dk</span>}
                                </div>
                                {aptOpen ? <ChevronUp size={14} color="#9ca3af" /> : <ChevronDown size={14} color="#9ca3af" />}
                            </button>

                            {aptOpen && (
                                <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }} className="custom-scrollbar">
                                    <Field label={tm('bNotes')}>
                                        <textarea value={aptNotes} onChange={e => setAptNotes(e.target.value)}
                                            placeholder={tm('bAppointmentNotesPlaceholder')}
                                            rows={2}
                                            style={{ ...iStyle, height: 'auto', padding: '6px 10px', resize: 'none', lineHeight: 1.5 }} />
                                    </Field>
                                </div>
                            )}
                        </div>

                        {/* Totals + Checkout */}
                        <div style={{ padding: '12px 14px' }}>
                            {/* Discount */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>İndirim (%)</span>
                                <input type="number" min={0} max={100} value={discount} onChange={e => setDiscount(Number(e.target.value))}
                                    style={{ width: 52, height: 26, textAlign: 'right', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 12, fontWeight: 700, paddingRight: 5, outline: 'none' }} />
                            </div>

                            {/* Summary */}
                            <div style={{ background: '#f7f6fb', borderRadius: 5, padding: '8px 10px', marginBottom: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Ara toplam</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{fmt(subtotal)}</span>
                                </div>
                                {discount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>İndirim -%{discount}</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>-{fmt(discAmt)}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e8e4f0', paddingTop: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: '#111827' }}>Toplam</span>
                                    <span style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed' }}>{fmt(total)}</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {/* Actions */}
                            <div style={{ display: 'grid', gridTemplateColumns: existingAppointment ? '1fr' : '1fr 1fr', gap: 8 }}>
                                {!existingAppointment && (
                                    <button
                                        type="button"
                                        onClick={tryBookAppointment}
                                        title={tm('bBookingHintTitle')}
                                        style={{
                                            height: 38, borderRadius: 5, border: (canSave && canBookApt) ? '2px solid #7c3aed' : '1px solid #e5e7eb',
                                            background: (canSave && canBookApt) ? '#fff' : '#f9fafb',
                                            color: (canSave && canBookApt) ? '#7c3aed' : '#9ca3af',
                                            fontSize: 11, fontWeight: 800, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                        }}
                                    >
                                        <CalendarDays size={13} /> Randevu Oluştur
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={tryOpenPay}
                                    style={{
                                        height: 38, borderRadius: 5, border: 'none',
                                        background: canSave ? '#7c3aed' : '#e5e7eb',
                                        color: canSave ? '#fff' : '#9ca3af',
                                        fontSize: 11, fontWeight: 800, cursor: canSave ? 'pointer' : 'not-allowed',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                        transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => { if (canSave) e.currentTarget.style.background = '#6d28d9'; }}
                                    onMouseLeave={e => { if (canSave) e.currentTarget.style.background = '#7c3aed'; }}
                                >
                                    <Receipt size={13} /> {existingAppointment ? 'Ödeme Al ve Tamamla' : 'Ödeme Al'}
                                </button>
                            </div>
                            </div>
                        </div>
                    </div>{/* end scrollable bottom section */}
                </div>
            </div>

            {/* ── Sepet satırı: personel liste modalı (dokunmatik) ─────────────── */}
            {staffLinePickerUid && (() => {
                const pickLine = cart.find(l => l.uid === staffLinePickerUid);
                if (!pickLine || pickLine.type !== 'service') return null;
                return (
                    <div
                        role="presentation"
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 250,
                            background: 'rgba(17, 24, 39, 0.5)',
                            backdropFilter: 'blur(4px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 16,
                        }}
                        onClick={() => setStaffLinePickerUid(null)}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="staff-line-picker-title"
                            onClick={e => e.stopPropagation()}
                            style={{
                                width: '100%',
                                maxWidth: 400,
                                maxHeight: '85vh',
                                display: 'flex',
                                flexDirection: 'column',
                                background: '#fff',
                                borderRadius: 16,
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
                                border: '1px solid #e8e4f0',
                                overflow: 'hidden',
                            }}
                        >
                            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 10,
                                    background: '#ede9fe',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <Users size={20} color="#7c3aed" />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h2 id="staff-line-picker-title" style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111827' }}>
                                        {tm('bStaffPickModalTitle')}
                                    </h2>
                                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {pickLine.name}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    aria-label="close"
                                    onClick={() => setStaffLinePickerUid(null)}
                                    style={{
                                        border: 'none',
                                        background: '#f3f4f6',
                                        width: 36,
                                        height: 36,
                                        borderRadius: 8,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    <X size={16} color="#6b7280" />
                                </button>
                            </div>
                            <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }} className="custom-scrollbar">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStaff(pickLine.uid, '');
                                        setStaffLinePickerUid(null);
                                    }}
                                    style={{
                                        width: '100%',
                                        minHeight: 48,
                                        marginBottom: 6,
                                        borderRadius: 10,
                                        border: '1px solid #fcd34d',
                                        background: '#fffbeb',
                                        color: '#92400e',
                                        fontSize: 13,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {tm('bStaffClearSelection')}
                                </button>
                                {activeSpecialists.map(s => {
                                    const sel = pickLine.staff_id === s.id;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => {
                                                setStaff(pickLine.uid, s.id);
                                                setStaffLinePickerUid(null);
                                            }}
                                            style={{
                                                width: '100%',
                                                minHeight: 52,
                                                marginBottom: 6,
                                                padding: '0 14px',
                                                borderRadius: 10,
                                                border: sel ? 'none' : '1px solid #e5e7eb',
                                                background: sel ? '#7c3aed' : '#f9fafb',
                                                color: sel ? '#fff' : '#111827',
                                                fontSize: 14,
                                                fontWeight: 700,
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                            }}
                                        >
                                            <span style={{
                                                width: 36,
                                                height: 36,
                                                borderRadius: 8,
                                                background: sel ? 'rgba(255,255,255,0.2)' : '#ede9fe',
                                                color: sel ? '#fff' : '#7c3aed',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 12,
                                                fontWeight: 800,
                                                flexShrink: 0,
                                            }}>
                                                {specInitials(s.name)}
                                            </span>
                                            <span style={{ flex: 1 }}>{s.name}</span>
                                            {sel && <CheckCircle2 size={18} color="#fff" style={{ flexShrink: 0 }} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Randevu engeli / hata — teşhis modal ───────────────── */}
            {bookingBlockModal.open && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 240,
                        background: 'rgba(17, 24, 39, 0.55)',
                        backdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 20,
                    }}
                    onClick={() => setBookingBlockModal(s => ({ ...s, open: false }))}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: 440,
                            maxHeight: '90vh',
                            overflow: 'auto',
                            background: '#fff',
                            borderRadius: 16,
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
                            border: '1px solid #fecaca',
                        }}
                    >
                        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{
                                width: 44,
                                height: 44,
                                borderRadius: 12,
                                background: '#fef2f2',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <AlertTriangle size={22} color="#dc2626" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#991b1b', lineHeight: 1.3 }}>
                                    {bookingBlockModal.title}
                                </h2>
                                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>
                                    {bookingBlockModal.intro}
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label="close"
                                onClick={() => setBookingBlockModal(s => ({ ...s, open: false }))}
                                style={{
                                    border: 'none',
                                    background: '#f3f4f6',
                                    width: 32,
                                    height: 32,
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                <X size={16} color="#6b7280" />
                            </button>
                        </div>
                        <div style={{ padding: '14px 20px' }}>
                            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
                                {tm('bBookingModalDoThis')}
                            </p>
                            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#374151', lineHeight: 1.55 }}>
                                {bookingBlockModal.steps.map((step, i) => (
                                    <li key={i} style={{ marginBottom: 6 }}>{step}</li>
                                ))}
                            </ol>
                            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 8px' }}>
                                {tm('bBookingModalStatus')}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {bookingBlockModal.diagnostics.map((d, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: d.ok ? '#059669' : '#b45309',
                                            background: d.ok ? '#ecfdf5' : '#fffbeb',
                                            border: `1px solid ${d.ok ? '#a7f3d0' : '#fcd34d'}`,
                                            borderRadius: 8,
                                            padding: '8px 10px',
                                        }}
                                    >
                                        <span style={{ fontWeight: 800 }}>{d.ok ? '✓' : '!'}</span>
                                        <span>{d.label}</span>
                                    </div>
                                ))}
                            </div>
                            {bookingBlockModal.technical && (
                                <details style={{ marginTop: 14 }}>
                                    <summary style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', cursor: 'pointer' }}>
                                        {tm('bBookingModalTechnical')}
                                    </summary>
                                    <pre style={{
                                        marginTop: 8,
                                        padding: 10,
                                        background: '#1f2937',
                                        color: '#e5e7eb',
                                        borderRadius: 8,
                                        fontSize: 10,
                                        overflow: 'auto',
                                        maxHeight: 120,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                    }}>
                                        {bookingBlockModal.technical}
                                    </pre>
                                </details>
                            )}
                        </div>
                        <div style={{ padding: '12px 20px 18px', borderTop: '1px solid #f3f4f6' }}>
                            <button
                                type="button"
                                onClick={() => setBookingBlockModal(s => ({ ...s, open: false }))}
                                style={{
                                    width: '100%',
                                    height: 44,
                                    borderRadius: 10,
                                    border: 'none',
                                    background: '#7c3aed',
                                    color: '#fff',
                                    fontSize: 14,
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                {tm('bBookingModalOk')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── PAYMENT MODAL ───────────────────────────────────── */}
            {showPay && (
                <POSPaymentModal
                    total={total}
                    subtotal={subtotal}
                    itemDiscount={discAmt}
                    campaignDiscount={0}
                    selectedCustomer={customer as any}
                    onClose={() => setShowPay(false)}
                    onComplete={handlePayComplete}
                />
            )}
        </div>
    );
}
