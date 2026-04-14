
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
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    ArrowLeft, Plus, Minus, X, Search, User, UserPlus, UserRound, Users, Banknote,
    CalendarDays, CalendarClock, Clock, Cpu, Activity, AlertTriangle, CheckCircle2, Scissors, Package,
    Sparkles, Receipt, ChevronDown, ChevronUp, MoreHorizontal, ShoppingBag, RefreshCw,
    PanelLeft, Repeat,
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { AppointmentStatus } from '../../../types/beauty';
import type { BeautyAppointment, BeautyCustomer } from '../../../types/beauty';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import { POSPaymentModal, type POSPaymentModalDraftContext } from '../../pos/POSPaymentModal';
import { Receipt80mm } from '../../pos/Receipt80mm';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { useProductStore } from '../../../store/useProductStore';
import type { Product } from '../../../core/types';
import type { Sale, SaleItem } from '../../../core/types/models';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { salesAPI } from '../../../services/api/sales';
import {
    buildRestaurantAdisyonHtml,
    printRestaurantHtmlNoPreview,
    type KitchenReceiptLocale,
} from '../../../utils/restaurantReceiptPrint';
import { getReceiptSettings, invalidateReceiptSettingsCache, type ReceiptSettings } from '../../../services/receiptSettingsService';
import { resolveProductNameForReceipt } from '../../../utils/receiptProductName';
import { fetchCurrentAccounts } from '../../../services/api/currentAccounts';
import { ERP_SETTINGS } from '../../../services/postgres';
import { toast } from 'sonner';
import { RetailExFlatModal } from '../../shared/RetailExFlatModal';
import { beautyAppointmentDateKey, formatLocalYmd } from '../../../utils/dateLocal';
import { findBeautyAppointmentsSameQueueGroup } from '../../../utils/beautyQueueOrder';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';
import { safeInvoke } from '../../../utils/env';
import { splitProportionalLineDiscount } from '../../../utils/beautySaleLineDiscount';
import { usePermission } from '../../../shared/hooks/usePermission';
import '../ClinicStyles.css';

/** Güzellik satış satırını randevuya bağlar; randevu iptalinde `beautyService` bu kayıtları ciro dışı işaretler. */
function buildBeautySaleNotesWithAppointmentLink(baseNotes: string | undefined, appointmentId: string | undefined): string | undefined {
    const parts = [
        typeof baseNotes === 'string' ? baseNotes.trim() : '',
        appointmentId?.trim() ? `rex_appt:${appointmentId.trim()}` : '',
    ].filter((p) => p.length > 0);
    return parts.length ? parts.join(' | ') : undefined;
}

const BEAUTY_CATEGORY_RAIL_KEY = 'retailex_beauty_pos_category_rail';
type BeautyCategoryRailMode = 'chips' | 'sidebar';
function readBeautyCategoryRailMode(): BeautyCategoryRailMode {
    try {
        if (typeof localStorage === 'undefined') return 'chips';
        return localStorage.getItem(BEAUTY_CATEGORY_RAIL_KEY) === 'sidebar' ? 'sidebar' : 'chips';
    } catch {
        return 'chips';
    }
}

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

/** Mevcut randevuda «Güncelle» için karşılaştırma anlığı (baseline yalnızca yükleme / kayıt sonrası yenilenir) */
interface ExistingEditSnap {
    date: string;
    time: string;
    device: string;
    notes: string;
    status: string;
    discount: number;
    durationMin: number;
    customerId: string;
    cartSig: string;
    total: number;
}

function isKitchenReceiptLocale(s: string): s is KitchenReceiptLocale {
    return s === 'tr' || s === 'en' || s === 'ar' || s === 'ku';
}

/** Randevu cihazı → fişte gösterilecek ad */
function resolveBeautyDeviceLabel(
    deviceId: string | undefined,
    deviceList: { id: string; name: string }[],
): string | undefined {
    const id = typeof deviceId === 'string' ? deviceId.trim() : '';
    if (!id) return undefined;
    const d = deviceList.find((x) => String(x.id) === String(id));
    return (d?.name && d.name.trim()) || id;
}

/** Sepet satırları → fiş kalemleri (ürün/hizmet; Receipt80mm dil alanları) */
function beautyLinesToReceiptItems(
    lines: CartLine[],
    lang: KitchenReceiptLocale,
    receiptSettings: ReceiptSettings,
    productList: Product[],
    specialistList: { id: string; name?: string }[],
): SaleItem[] {
    return lines.map((line) => {
        const product: Partial<Product> | null =
            line.type === 'product'
                ? productList.find((p) => p.id === line.item_id) ?? { id: line.item_id, name: line.name }
                : { id: line.item_id, name: line.name };
        const productName =
            resolveProductNameForReceipt(product, lang, receiptSettings) || line.name || '—';
        const lineTotal = line.unit_price * line.qty;
        const sid = line.staff_id?.trim();
        const staffName = sid
            ? specialistList.find((s) => String(s.id) === String(sid))?.name?.trim()
            : undefined;
        const base: SaleItem = {
            productId: line.item_id,
            productName,
            quantity: line.qty,
            price: line.unit_price,
            discount: 0,
            total: lineTotal,
        };
        return staffName ? { ...base, beautyStaffName: staffName } : base;
    });
}

interface BookingBlockModalState {
    open: boolean;
    title: string;
    intro: string;
    steps: string[];
    technical?: string;
    diagnostics: { label: string; ok: boolean }[];
}

/** Takvim çakışması: iptal / gelmedi kayıtları slotu meşgul sayma */
function beautyAptBlocksCalendarSlot(e: BeautyAppointment): boolean {
    return beautyAptVisibleOnSchedule(e);
}

type SlotConflictDetail = {
    kind: 'staff' | 'device';
    staffName?: string;
    deviceName?: string;
    sameDeviceSlots: string[];
    otherDeviceSuggestions: Array<{ deviceId: string; deviceLabel: string; time: string }>;
};

class SlotConflictError extends Error {
    readonly detail: SlotConflictDetail;
    constructor(message: string, detail: SlotConflictDetail) {
        super(message);
        this.name = 'SlotConflictError';
        this.detail = detail;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Sepet satırı anahtarı — modül sayacı HMR sonrası çakışır; UUID kullan */
const uid = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `ln_${crypto.randomUUID()}`
        : `ln_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

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

/** Aylık seri son randevu tarihine kadar yükleme aralığı */
function addCalendarMonthsYmd(ymd: string, months: number): string {
    const m = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    d.setMonth(d.getMonth() + Math.max(0, months));
    return formatLocalYmd(d);
}

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

function parseAgeInput(raw: string): number | undefined {
    const t = raw.trim();
    if (!t) return undefined;
    const n = parseInt(t, 10);
    if (!Number.isFinite(n) || n < 0 || n > 150) return undefined;
    return n;
}

function emptyQuickAddCustomer() {
    return {
        name: '',
        phone: '',
        phone2: '',
        age: '',
        file_id: '',
        email: '',
        address: '',
        occupation: '',
        notes: '',
    };
}

// ─── Component ────────────────────────────────────────────────────────────────
const UNASSIGNED_RESOURCE = '__unassigned__';

interface Props {
    prefillDate?: string;
    prefillTime?: string;
    /** Takvimde personel sütununa tıklanınca; atanmamış sütunu boş bırakmak için `__unassigned__` */
    prefillStaffId?: string;
    /** Takvimde cihaz sütununa tıklanınca */
    prefillDeviceId?: string;
    /** CRM / sihirbaz: bu hizmet satırı sepete bir kez eklenir */
    prefillServiceId?: string;
    existingAppointment?: BeautyAppointment | null;
    onBack?: () => void;      // undefined = standalone POS mode
}

export function AppointmentPOS({ prefillDate, prefillTime, prefillStaffId, prefillDeviceId, prefillServiceId, existingAppointment, onBack }: Props) {
    const {
        services, packages, specialists, customers, devices,
        loadServices, loadPackages, loadSpecialists, loadCustomers, loadDevices,
        createAppointment, updateAppointment, loadAppointmentsInRange,
    } = useBeautyStore();
    const { products, loadProducts, updateStock } = useProductStore();
    const { tm, language: uiLanguage } = useLanguage();
    const { selectedFirm } = useFirmaDonem();
    const { isAdmin } = usePermission();
    const receiptFirmNr = useMemo(() => {
        const f = selectedFirm;
        if (!f) return undefined;
        const raw = f.firm_nr ?? f.firma_kodu ?? (f.nr != null ? String(f.nr) : '');
        const s = String(raw).trim().padStart(3, '0').slice(0, 10);
        return s || undefined;
    }, [selectedFirm]);

    const STATUS_OPTS = [
        { value: AppointmentStatus.SCHEDULED, label: tm('bAppointmentScheduled') },
        { value: AppointmentStatus.CONFIRMED, label: tm('bAppointmentConfirmed') },
        { value: AppointmentStatus.IN_PROGRESS, label: tm('bAppointmentStarted') },
    ];
    const appointmentStatusSelectOptions = useMemo(() => {
        if (!existingAppointment?.id) return STATUS_OPTS;
        return [
            ...STATUS_OPTS,
            { value: AppointmentStatus.COMPLETED, label: tm('bAppointmentCompleted') },
            { value: AppointmentStatus.CANCELLED, label: tm('bAppointmentCancelled') },
            { value: AppointmentStatus.NO_SHOW, label: tm('bStatusNoShow') },
        ];
    }, [existingAppointment?.id, tm]);

    const CATEGORY_TR: Record<string, string> = {
        laser: tm('bCatLaser'), hair_salon: tm('bCatHairSalon'), beauty: tm('bCatBeauty'),
        botox: tm('bCatBotox'), filler: tm('bCatFiller'), massage: tm('bCatMassage'),
        skincare: tm('bCatSkincare'), makeup: tm('bCatMakeup'), nails: tm('bCatNails'), spa: tm('bCatSpa'),
    };

    // ── Left panel state ─────────────────────────────────────────────────
    const [tab, setTab] = useState<'services' | 'packages' | 'products'>('services');
    const [category, setCategory] = useState('all');
    const [svcQ, setSvcQ] = useState('');
    const [categoryRailMode, setCategoryRailMode] = useState<BeautyCategoryRailMode>(readBeautyCategoryRailMode);

    useEffect(() => {
        try {
            localStorage.setItem(BEAUTY_CATEGORY_RAIL_KEY, categoryRailMode);
        } catch { /* ignore */ }
    }, [categoryRailMode]);

    const showCategoryRailToggle = tab === 'services' || tab === 'products';
    const useCategorySidebar = showCategoryRailToggle && categoryRailMode === 'sidebar';

    // ── Cart ─────────────────────────────────────────────────────────────
    const [cart, setCart] = useState<CartLine[]>([]);
    const [discount, setDiscount] = useState(0);

    // ── Customer ─────────────────────────────────────────────────────────
    const [customer, setCustomer] = useState<BeautyCustomer | null>(null);
    const [showCustModal, setShowCustModal] = useState(false);
    const [custModalQ, setCustModalQ] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [newCust, setNewCust] = useState(emptyQuickAddCustomer);
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
    const [slotSuggestModal, setSlotSuggestModal] = useState<{
        open: boolean;
        title: string;
        subtitle?: string;
        sameDeviceSlots: string[];
        otherDeviceSuggestions: Array<{ deviceId: string; deviceLabel: string; time: string }>;
        conflictKind?: 'staff' | 'device';
    }>({
        open: false,
        title: '',
        sameDeviceSlots: [],
        otherDeviceSuggestions: [],
    });
    const [slotBrowseLoading, setSlotBrowseLoading] = useState(false);
    /** Sepet satırındaki hizmet için personel — liste modalı (uid) */
    const [staffLinePickerUid, setStaffLinePickerUid] = useState<string | null>(null);
    /** Sepet satırı hizmet birim fiyatı — düzenleme modalı (uid) */
    const [cartLinePriceUid, setCartLinePriceUid] = useState<string | null>(null);
    const [cartLinePriceDraft, setCartLinePriceDraft] = useState('');

    // ── Appointment details ───────────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];
    const [aptDate, setAptDate] = useState(prefillDate ?? today);
    const [aptTime, setAptTime] = useState(safeTimeHHmm(prefillTime ?? '09:00'));
    const [aptDevice, setAptDevice] = useState('');
    const [aptNotes, setAptNotes] = useState('');
    /** Fiş üstü — lazer/cihaz tedavi satırı (Derece / Atış) */
    const [receiptTreatmentDegree, setReceiptTreatmentDegree] = useState('');
    const [receiptTreatmentShots, setReceiptTreatmentShots] = useState('');
    const [aptStatus, setAptStatus] = useState<AppointmentStatus>(AppointmentStatus.SCHEDULED);
    const [aptOpen, setAptOpen] = useState(true);  // section collapse
    const [hydratedAppointmentId, setHydratedAppointmentId] = useState<string | null>(null);
    const [existingEditBaselineFlush, setExistingEditBaselineFlush] = useState(0);
    const [updateExistingBusy, setUpdateExistingBusy] = useState(false);
    const [editBaselineSnap, setEditBaselineSnap] = useState<ExistingEditSnap | null>(null);
    /** Tek hizmet veya mevcut randevu düzenlemede ödeme / kayıtta kullanılan gerçek süre (dk). */
    const [aptActualDurationMin, setAptActualDurationMin] = useState(30);
    const [monthlyModalLine, setMonthlyModalLine] = useState<CartLine | null>(null);
    const [monthlyForm, setMonthlyForm] = useState({ date: '', sessions: 1 });
    const [monthlyBusy, setMonthlyBusy] = useState(false);
    const [cancelAptConfirmOpen, setCancelAptConfirmOpen] = useState(false);
    const [cancelAptBusy, setCancelAptBusy] = useState(false);

    // ── Payment modal ─────────────────────────────────────────────────────
    const [showPay, setShowPay] = useState(false);
    const [receiptNumber, setReceiptNumber] = useState(() =>
        `BTY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0')}`
    );
    const generateNewReceiptNumber = useCallback(async () => {
        try {
            const counts = await salesAPI.getSequenceCounts();
            const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const randomPart = String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0');
            setReceiptNumber(`BTY-${datePart}-M${counts.monthly}-D${counts.daily}-${randomPart}`);
        } catch {
            const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const randomPart = String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0');
            setReceiptNumber(`BTY-${datePart}-${randomPart}`);
        }
    }, []);
    useEffect(() => {
        void generateNewReceiptNumber();
    }, [generateNewReceiptNumber]);

    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [completedSale, setCompletedSale] = useState<Sale | null>(null);
    const [completedPaymentData, setCompletedPaymentData] = useState<any>(null);
    const [receiptPrintImmediately, setReceiptPrintImmediately] = useState(false);
    /** Randevu fişi — üst bant; ödeme fişinde temizlenir */
    const [receiptHeaderBanner, setReceiptHeaderBanner] = useState<string | undefined>(undefined);

    /** Çift tıklama / üst üste tıklamada aynı randevunun iki kez oluşmasını engeller */
    const bookingSubmitRef = useRef(false);
    const checkoutSubmitRef = useRef(false);
    /** prefillServiceId ile otomatik eklenen satırı yalnızca bir kez */
    const didAddPrefillServiceRef = useRef(false);
    const [bookingBusy, setBookingBusy] = useState(false);

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

    /** Sepet satırı silinirse birim fiyat modalını kapat */
    useEffect(() => {
        if (!cartLinePriceUid) return;
        const ok = cart.some(l => l.uid === cartLinePriceUid && l.type === 'service');
        if (!ok) setCartLinePriceUid(null);
    }, [cart, cartLinePriceUid]);

    /** Takvimden personel/cihaz sütunu ile açıldıysa önce bunu uygula */
    useEffect(() => {
        if (existingAppointment?.id) return;
        if (prefillStaffId !== undefined) {
            setDefaultSpecialistId(!prefillStaffId || prefillStaffId === UNASSIGNED_RESOURCE ? '' : prefillStaffId);
        }
    }, [existingAppointment?.id, prefillStaffId]);

    useEffect(() => {
        if (existingAppointment?.id) return;
        if (prefillDeviceId === undefined) return;
        const raw = String(prefillDeviceId).trim();
        if (!raw || raw === UNASSIGNED_RESOURCE) {
            setAptDevice('');
            return;
        }
        const match = devices.find(d => String(d.id) === String(raw) && d.is_active !== false);
        setAptDevice(match ? String(match.id) : raw);
    }, [existingAppointment?.id, prefillDeviceId, devices]);

    useEffect(() => {
        didAddPrefillServiceRef.current = false;
    }, [prefillServiceId, existingAppointment?.id]);

    /** CRM/sihirbaz serviceId: hizmet listesi ve personel hazır olunca sepete */
    useEffect(() => {
        if (existingAppointment?.id) return;
        const rawPid = prefillServiceId?.trim();
        if (!rawPid) return;
        if (!services.length) return;
        const svc = services.find(s => String(s.id) === String(rawPid));
        if (!svc) return;

        const staffResolved =
            (defaultSpecialistId || '').trim() ||
            (prefillStaffId && prefillStaffId !== UNASSIGNED_RESOURCE ? prefillStaffId : '');
        const specialistsActive = specialists.filter(s => s.is_active !== false);
        const unassignedStaffColumn = prefillStaffId === UNASSIGNED_RESOURCE;
        const mustWaitForDefaultStaff =
            !staffResolved &&
            specialistsActive.length > 0 &&
            prefillStaffId === undefined;
        if (mustWaitForDefaultStaff) return;

        const canInsert = !!staffResolved || unassignedStaffColumn || specialistsActive.length === 0;
        if (!canInsert) return;

        setCart(c => {
            const idx = c.findIndex(l => l.type === 'service' && String(l.item_id) === String(rawPid));
            if (idx >= 0) {
                const line = c[idx];
                if (staffResolved && !line.staff_id?.trim()) {
                    const next = [...c];
                    next[idx] = { ...line, staff_id: staffResolved };
                    return next;
                }
                return c;
            }
            if (didAddPrefillServiceRef.current) return c;
            didAddPrefillServiceRef.current = true;
            return [
                ...c,
                {
                    uid: uid(),
                    type: 'service',
                    item_id: svc.id,
                    name: svc.name,
                    unit_price: svc.price,
                    qty: 1,
                    color: svc.color,
                    duration_min: svc.duration_min,
                    staff_id: staffResolved || undefined,
                },
            ];
        });
    }, [
        existingAppointment?.id,
        prefillServiceId,
        services,
        defaultSpecialistId,
        prefillStaffId,
        specialists,
    ]);

    /** Varsayılan personel: ilk aktif uzman (takvimden atanmamış / belirli sütun yoksa). Mevcut randevu düzenlemesinde dokunulmaz. */
    useEffect(() => {
        if (existingAppointment?.id) return;
        const act = specialists.filter(s => s.is_active);
        if (act.length === 0) return;
        if (prefillStaffId !== undefined && prefillStaffId !== '' && prefillStaffId !== UNASSIGNED_RESOURCE) return;
        if (prefillStaffId === UNASSIGNED_RESOURCE) return;
        setDefaultSpecialistId(prev => (prev ? prev : act[0].id));
    }, [specialists, prefillStaffId, existingAppointment?.id]);

    // ── Derived ──────────────────────────────────────────────────────────
    const subtotal = cart.reduce((s, l) => s + l.unit_price * l.qty, 0);
    const discAmt = subtotal * (discount / 100);
    const total = subtotal - discAmt;
    const totalDur = cart.filter(l => l.type === 'service').reduce((s, l) => s + (l.duration_min ?? 0) * l.qty, 0);

    useEffect(() => {
        if (existingAppointment?.id) return;
        setAptActualDurationMin(Math.max(1, totalDur || 30));
    }, [totalDur, existingAppointment?.id]);

    useEffect(() => {
        if (!monthlyModalLine) return;
        const svc = services.find((s) => s.id === monthlyModalLine.item_id);
        setMonthlyForm({
            date: safeDateYmd(aptDate),
            sessions: Math.max(1, Math.round(svc?.default_sessions ?? 1)),
        });
    }, [monthlyModalLine?.uid, aptDate, aptTime, services, monthlyModalLine]);

    /** Personel ikonu gibi: tıklanınca her zaman modal açılır; eksikler gövdede uyarı + onay kilitlenir */
    const openMonthlyCartModalForUid = useCallback((uid: string) => {
        const line = cart.find((l) => l.uid === uid);
        if (!line || line.type !== 'service') return;
        setMonthlyModalLine(line);
    }, [cart]);

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
            (c.phone2 ?? '').includes(custModalQ) ||
            (c.email ?? '').toLowerCase().includes(q) ||
            (c.code ?? '').toLowerCase().includes(q) ||
            (c.address ?? '').toLowerCase().includes(q) ||
            (c.notes ?? '').toLowerCase().includes(q) ||
            (c.occupation ?? '').toLowerCase().includes(q) ||
            (c.file_id ?? '').toLowerCase().includes(q)
        );
    }, [mergedCustomers, custModalQ]);

    useEffect(() => {
        if (!existingAppointment?.id) {
            setHydratedAppointmentId(null);
            return;
        }
        if (hydratedAppointmentId === existingAppointment.id) return;

        const primary = existingAppointment;
        let cancelled = false;

        void (async () => {
            const rawDate = String(primary.date ?? primary.appointment_date ?? '').trim();
            const rawTime = String(primary.appointment_time ?? primary.time ?? '').trim();
            const customerId = String(primary.customer_id ?? primary.client_id ?? '').trim();
            const dayYmd = beautyAppointmentDateKey(primary) || safeDateYmd(rawDate, safeDateYmd(prefillDate ?? new Date().toISOString().slice(0, 10)));

            let pool: BeautyAppointment[] = [];
            try {
                pool = await beautyService.getAppointmentsInRange(dayYmd, dayYmd);
            } catch (e) {
                logger.error('AppointmentPOS', 'hydrate: getAppointmentsInRange failed', e);
                pool = [];
            }
            if (cancelled) return;

            const siblings = findBeautyAppointmentsSameQueueGroup(primary, pool.length > 0 ? pool : [primary]);
            const lines: CartLine[] = [];
            for (const apt of siblings) {
                const sid = String(apt.staff_id ?? apt.specialist_id ?? '').trim() || undefined;
                const svcId = String(apt.service_id ?? '').trim();
                const mapped = svcId ? services.find(s => String(s.id) === svcId) : undefined;
                if (mapped) {
                    lines.push({
                        uid: uid(),
                        type: 'service',
                        item_id: mapped.id,
                        name: mapped.name,
                        unit_price: Number(apt.total_price ?? mapped.price ?? 0),
                        qty: 1,
                        color: mapped.color,
                        duration_min: Math.max(1, Math.round(Number(apt.duration ?? mapped.duration_min ?? 30))),
                        staff_id: sid,
                    });
                } else if (svcId || (apt.service_name ?? '').trim()) {
                    lines.push({
                        uid: uid(),
                        type: 'service',
                        item_id: svcId || `apt-${apt.id}`,
                        name: String(apt.service_name ?? '—'),
                        unit_price: Number(apt.total_price ?? 0),
                        qty: 1,
                        duration_min: Math.max(1, Math.round(Number(apt.duration ?? 30))),
                        staff_id: sid,
                    });
                }
            }

            if (cancelled) return;

            if (customerId) {
                const picked = mergedCustomers.find(c => String(c.id) === customerId);
                setCustomer(
                    picked ?? {
                        id: customerId,
                        name: String(primary.customer_name ?? tm('bCustomerFallbackName')),
                        is_active: true,
                    } as BeautyCustomer
                );
            }

            if (lines.length > 0) {
                setCart(lines);
            } else {
                const serviceId = String(primary.service_id ?? '').trim();
                const mappedService = serviceId ? services.find(s => String(s.id) === serviceId) : undefined;
                const staffId = String(primary.staff_id ?? primary.specialist_id ?? '').trim() || undefined;
                if (mappedService) {
                    setCart([{
                        uid: uid(),
                        type: 'service',
                        item_id: mappedService.id,
                        name: mappedService.name,
                        unit_price: Number(primary.total_price ?? mappedService.price ?? 0),
                        qty: 1,
                        color: mappedService.color,
                        duration_min: Number(primary.duration ?? mappedService.duration_min ?? 30),
                        staff_id: staffId,
                    }]);
                }
            }

            const firstStaff = String(siblings[0]?.staff_id ?? siblings[0]?.specialist_id ?? '').trim() || undefined;
            setDefaultSpecialistId(firstStaff ?? '');
            setAptDate(safeDateYmd(rawDate, safeDateYmd(prefillDate ?? new Date().toISOString().slice(0, 10))));
            setAptTime(safeTimeHHmm(rawTime || prefillTime || '09:00'));
            setAptDevice(String(primary.device_id ?? '').trim());
            setAptNotes(String(primary.notes ?? ''));
            const trSrc = siblings[0] ?? primary;
            setReceiptTreatmentDegree(String(trSrc.treatment_degree ?? '').trim());
            setReceiptTreatmentShots(String(trSrc.treatment_shots ?? '').trim());
            setAptStatus(primary.status ?? AppointmentStatus.CONFIRMED);
            const sumDur = siblings.reduce(
                (s, a) => s + Math.max(1, Math.round(Number(a.duration) || 30)),
                0
            );
            setAptActualDurationMin(Math.max(1, sumDur || Math.round(Number(primary.duration) || 30)));
            setHydratedAppointmentId(primary.id);
        })();

        return () => {
            cancelled = true;
        };
    }, [existingAppointment, hydratedAppointmentId, mergedCustomers, services, prefillDate, prefillTime, tm]);

    useEffect(() => {
        setExistingEditBaselineFlush(0);
    }, [existingAppointment?.id]);

    const handleSaveNewCustomer = async () => {
        if (!newCust.name.trim()) return;
        setSavingCust(true);
        try {
            const trimmedAge = newCust.age.trim();
            const ageNum = trimmedAge === '' ? undefined : parseAgeInput(newCust.age);
            const id = await beautyService.createCustomer({
                name: newCust.name.trim(),
                phone: newCust.phone.trim() || undefined,
                phone2: newCust.phone2.trim() || undefined,
                email: newCust.email.trim() || undefined,
                address: newCust.address.trim() || undefined,
                occupation: newCust.occupation.trim() || undefined,
                notes: newCust.notes.trim() || undefined,
                file_id: newCust.file_id.trim() || undefined,
                age: ageNum,
                is_active: true,
            });
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
            const created = {
                id,
                name: newCust.name.trim(),
                phone: newCust.phone.trim() || undefined,
                phone2: newCust.phone2.trim() || undefined,
                email: newCust.email.trim() || undefined,
                address: newCust.address.trim() || undefined,
                occupation: newCust.occupation.trim() || undefined,
                notes: newCust.notes.trim() || undefined,
                file_id: newCust.file_id.trim() || undefined,
                age: ageNum ?? null,
                is_active: true,
            } as BeautyCustomer;
            setCustomer(created);
            setShowCustModal(false);
            setShowAddForm(false);
            setNewCust(emptyQuickAddCustomer());
            toast.success(tm('bSaveCustomerOk'));
        } catch (e: unknown) {
            logger.error('createCustomer failed', e);
            const msg = e instanceof Error ? e.message : String(e);
            toast.error(tm('bSaveCustomerFailed'), {
                description: msg,
                duration: 8000,
            });
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
    const saveCartLineUnitPrice = useCallback(() => {
        if (!isAdmin()) {
            setCartLinePriceUid(null);
            return;
        }
        if (!cartLinePriceUid) return;
        const line = cart.find(l => l.uid === cartLinePriceUid);
        if (!line || line.type !== 'service') {
            setCartLinePriceUid(null);
            return;
        }
        const old = Number(line.unit_price ?? 0);
        const raw = String(cartLinePriceDraft).replace(/\s/g, '').replace(',', '.');
        const neu = Math.max(0, Number(raw) || 0);
        if (neu === old) {
            setCartLinePriceUid(null);
            return;
        }
        setCart(c => c.map(l => (l.uid === cartLinePriceUid ? { ...l, unit_price: neu } : l)));
        logger.info('AppointmentPOS', 'beauty_cart_line_unit_price_update', {
            action: 'cart_service_line_unit_price',
            lineUid: line.uid,
            itemId: line.item_id,
            serviceName: line.name,
            oldUnitPrice: old,
            newUnitPrice: neu,
            qty: line.qty,
        });
        setCartLinePriceUid(null);
    }, [cart, cartLinePriceUid, cartLinePriceDraft, isAdmin]);
    const pickDefaultSpecialist = (id: string) => {
        setDefaultSpecialistId(id);
        setCart(c =>
            c.map(l => (l.type === 'service' && !l.staff_id?.trim() ? { ...l, staff_id: id } : l))
        );
    };
    const clearDefaultSpecialist = () => setDefaultSpecialistId('');
    const clearCart = () => {
        setCart([]);
        setCustomer(null);
        setDiscount(0);
        setReceiptTreatmentDegree('');
        setReceiptTreatmentShots('');
    };

    // ── Save actions ──────────────────────────────────────────────────────
    const canSave = cart.length > 0 && !!customer;
    /** Tamamlanmış randevu: tekrar ödeme / yeni randevu kaydı yok (iptal veya gelmedi seçildiyse güncelleme serbest) */
    const isExistingPaidComplete = useMemo(() => {
        if (!existingAppointment?.id) return false;
        const uiTerminal =
            aptStatus === AppointmentStatus.CANCELLED ||
            aptStatus === AppointmentStatus.NO_SHOW ||
            aptStatus === 'cancelled' ||
            aptStatus === 'no_show';
        if (uiTerminal) return false;
        return (
            existingAppointment.status === AppointmentStatus.COMPLETED ||
            existingAppointment.status === 'completed' ||
            aptStatus === AppointmentStatus.COMPLETED ||
            aptStatus === 'completed'
        );
    }, [existingAppointment?.id, existingAppointment?.status, aptStatus]);

    /** Tamamlanmış kayıt için baseline/dirty: iptal veya gelmedi seçilince takip açılır */
    const suppressEditBaselineForCompletedVisit = useMemo(() => {
        if (!existingAppointment?.id) return false;
        if (
            aptStatus === AppointmentStatus.CANCELLED ||
            aptStatus === AppointmentStatus.NO_SHOW ||
            aptStatus === 'cancelled' ||
            aptStatus === 'no_show'
        ) {
            return false;
        }
        return (
            existingAppointment.status === AppointmentStatus.COMPLETED ||
            existingAppointment.status === 'completed' ||
            aptStatus === AppointmentStatus.COMPLETED ||
            aptStatus === 'completed'
        );
    }, [existingAppointment?.id, existingAppointment?.status, aptStatus]);
    const serviceLines = useMemo(() => cart.filter(l => l.type === 'service'), [cart]);
    /** Randevu: en az bir hizmet + her hizmet satırında personel (ürün/paket tek başına randevu oluşturmaz). */
    const allServicesStaffed = serviceLines.length === 0 || serviceLines.every(l => !!l.staff_id?.trim());
    const canBookApt = serviceLines.length > 0 && allServicesStaffed;

    /** Kayıt / slot için satır başı dakika; tek satırda doğrudan gerçek süre, çoklu satırda plana orantılı bölünür. */
    const lineBookingDurations = useMemo(() => {
        if (serviceLines.length === 0) return [];
        if (serviceLines.length === 1) {
            return [Math.max(1, Math.round(aptActualDurationMin))];
        }
        const weights = serviceLines.map((l) =>
            Math.max(1, Number(l.duration_min ?? 30) * Math.max(1, Number(l.qty ?? 1))),
        );
        const sumW = weights.reduce((s, w) => s + w, 0);
        const targetRaw = Math.round(aptActualDurationMin);
        const target = Math.max(serviceLines.length, Math.max(1, targetRaw));
        const base = weights.map((w) => Math.max(1, Math.floor((target * w) / sumW)));
        let sum = base.reduce((s, d) => s + d, 0);
        let diff = target - sum;
        const out = [...base];
        const idxOrder = weights
            .map((w, i) => ({ i, w }))
            .sort((a, b) => b.w - a.w)
            .map((x) => x.i);
        let k = 0;
        while (diff > 0) {
            out[idxOrder[k % idxOrder.length]]++;
            diff--;
            k++;
        }
        while (diff < 0) {
            const j = out.findIndex((d) => d > 1);
            if (j < 0) break;
            out[j]--;
            diff++;
        }
        return out;
    }, [serviceLines, aptActualDurationMin]);

    useEffect(() => {
        if (!existingAppointment?.id || hydratedAppointmentId !== existingAppointment.id || suppressEditBaselineForCompletedVisit) {
            setEditBaselineSnap(null);
            return;
        }
        setEditBaselineSnap({
            date: safeDateYmd(aptDate),
            time: safeTimeHHmm(aptTime),
            device: String(aptDevice ?? '').trim(),
            notes: aptNotes,
            status: String(aptStatus),
            discount,
            durationMin: Math.max(1, Math.round(aptActualDurationMin || totalDur || 30)),
            customerId: String(customer?.id ?? '').trim(),
            cartSig: cart
                .map((l) => `${l.type}:${l.item_id}:${String(l.staff_id ?? '').trim()}:${l.qty}:${l.unit_price}`)
                .join('§'),
            total: Math.round(total * 100) / 100,
        });
        // Baseline yalnızca randevu yüklenince veya başarılı güncellemeden sonra — form alanı değişince kaymaz
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existingAppointment?.id, hydratedAppointmentId, existingEditBaselineFlush, suppressEditBaselineForCompletedVisit]);

    const currentEditSnap = useMemo(
        (): ExistingEditSnap => ({
            date: safeDateYmd(aptDate),
            time: safeTimeHHmm(aptTime),
            device: String(aptDevice ?? '').trim(),
            notes: aptNotes,
            status: String(aptStatus),
            discount,
            durationMin: Math.max(1, Math.round(aptActualDurationMin || totalDur || 30)),
            customerId: String(customer?.id ?? '').trim(),
            cartSig: cart
                .map((l) => `${l.type}:${l.item_id}:${String(l.staff_id ?? '').trim()}:${l.qty}:${l.unit_price}`)
                .join('§'),
            total: Math.round(total * 100) / 100,
        }),
        [aptDate, aptTime, aptDevice, aptNotes, aptStatus, discount, aptActualDurationMin, totalDur, customer?.id, cart, total],
    );

    const existingEditDirty = useMemo(() => {
        if (!existingAppointment?.id || hydratedAppointmentId !== existingAppointment.id || suppressEditBaselineForCompletedVisit || !editBaselineSnap) {
            return false;
        }
        const b = editBaselineSnap;
        const c = currentEditSnap;
        return (
            b.date !== c.date ||
            b.time !== c.time ||
            b.device !== c.device ||
            b.notes !== c.notes ||
            b.status !== c.status ||
            b.discount !== c.discount ||
            b.durationMin !== c.durationMin ||
            b.customerId !== c.customerId ||
            b.cartSig !== c.cartSig ||
            b.total !== c.total
        );
    }, [existingAppointment?.id, hydratedAppointmentId, suppressEditBaselineForCompletedVisit, editBaselineSnap, currentEditSnap]);

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
            treatment_degree: receiptTreatmentDegree.trim() || null,
            treatment_shots: receiptTreatmentShots.trim() || null,
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

        for (let idx = 0; idx < serviceLines.length; idx++) {
            const line = serviceLines[idx];
            const sid = String(line.staff_id ?? '').trim();
            const d =
                lineBookingDurations[idx] ??
                Math.max(1, Number(line.duration_min ?? 30) * Math.max(1, Number(line.qty ?? 1)));
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
                treatment_degree: receiptTreatmentDegree.trim() || null,
                treatment_shots: receiptTreatmentShots.trim() || null,
            });
        }
        return planned;
    };

    /** Seçilen gün + personel + cihaz için segment serbest mi (mevcut kayıt hariç) */
    const slotSegmentFree = (
        startMin: number,
        dur: number,
        staffId: string,
        deviceId: string,
        existing: BeautyAppointment[],
        excludeAptId?: string,
    ): boolean => {
        for (const e of existing) {
            if (!beautyAptBlocksCalendarSlot(e)) continue;
            if (excludeAptId && String(e.id) === String(excludeAptId)) continue;
            const eStart = hhmmToMin(String(e.appointment_time ?? e.time ?? ''));
            if (eStart == null) continue;
            const eDur = Math.max(1, Number(e.duration ?? 30));
            if (!overlaps(startMin, dur, eStart, eDur)) continue;
            const eSid = String(e.staff_id ?? e.specialist_id ?? '').trim();
            const eDev = String(e.device_id ?? '').trim();
            if (staffId && eSid === staffId) return false;
            if (String(deviceId ?? '').trim() && eDev === String(deviceId).trim()) return false;
        }
        return true;
    };

    /** Çakışan segment veya tek satır sepetten: aynı gün boş saatler + diğer cihazlarda ilk uygun aralık */
    type SlotSegHint = { staffId: string; deviceId: string; durationMin: number; anchorStartMin?: number | null };
    const buildSlotSuggestionsSync = (
        existing: BeautyAppointment[],
        hint?: SlotSegHint,
    ): { sameDeviceSlots: string[]; otherDeviceSuggestions: Array<{ deviceId: string; deviceLabel: string; time: string }> } => {
        const empty = {
            sameDeviceSlots: [] as string[],
            otherDeviceSuggestions: [] as Array<{ deviceId: string; deviceLabel: string; time: string }>,
        };
        let staffId = '';
        let devId = '';
        let dur = 30;
        if (hint && String(hint.staffId ?? '').trim()) {
            staffId = String(hint.staffId ?? '').trim();
            devId = String(hint.deviceId ?? '').trim();
            dur = Math.max(1, Math.round(hint.durationMin));
        } else if (serviceLines.length === 1) {
            const line = serviceLines[0];
            staffId = String(line.staff_id ?? '').trim();
            if (!staffId) return empty;
            dur = Math.max(1, Math.round(lineBookingDurations[0] ?? aptActualDurationMin));
            devId = String(aptDevice ?? '').trim();
        } else if (serviceLines.length > 1) {
            const line = serviceLines[0];
            staffId = String(line.staff_id ?? '').trim();
            if (!staffId) return empty;
            dur = Math.max(
                1,
                Math.round(
                    lineBookingDurations[0] ??
                        Number(line.duration_min ?? 30) * Math.max(1, Number(line.qty ?? 1)),
                ),
            );
            devId = String(aptDevice ?? '').trim();
        } else {
            return empty;
        }
        const exId = existingAppointment?.id;
        const WORK_START = 8 * 60;
        const WORK_END = 20 * 60;
        const STEP = 15;
        const multi = serviceLines.length > 1;
        const anchor = hint?.anchorStartMin != null && !Number.isNaN(hint.anchorStartMin) ? hint.anchorStartMin : null;
        const scanFrom = multi && anchor != null ? Math.max(WORK_START, anchor - 90) : WORK_START;
        const scanTo = multi && anchor != null ? Math.min(WORK_END, anchor + 120 + dur) : WORK_END;
        const sameDeviceSlots: string[] = [];
        for (let t = scanFrom; t + dur <= scanTo; t += STEP) {
            if (slotSegmentFree(t, dur, staffId, devId, existing, exId)) {
                sameDeviceSlots.push(minToHhmm(t));
                if (sameDeviceSlots.length >= 40) break;
            }
        }
        const other: Array<{ deviceId: string; deviceLabel: string; time: string }> = [];
        for (const d of devices.filter((x) => x.is_active)) {
            const did = String(d.id);
            if (devId && did === devId) continue;
            for (let t = scanFrom; t + dur <= scanTo; t += STEP) {
                if (slotSegmentFree(t, dur, staffId, did, existing, exId)) {
                    other.push({
                        deviceId: d.id,
                        deviceLabel: (d.name && String(d.name).trim()) || did,
                        time: minToHhmm(t),
                    });
                    break;
                }
            }
            if (other.length >= 12) break;
        }
        return { sameDeviceSlots, otherDeviceSuggestions: other };
    };

    /** Personel ve cihaz üzerinde çakışma kontrolü; önerilerle SlotConflictError */
    const ensureAppointmentSlotOk = async (planned: ReturnType<typeof buildAptPayload>[]) => {
        if (planned.length === 0) return;
        const day = safeDateYmd(aptDate);
        const existingRaw = await beautyService.getAppointmentsInRange(day, day);
        const existing = existingRaw.filter(beautyAptBlocksCalendarSlot);
        const exId = existingAppointment?.id;

        for (const p of planned) {
            const sid = String(p.staff_id ?? '').trim();
            const dev = String(p.device_id ?? '').trim();
            const pStart = hhmmToMin(String(p.time ?? p.appointment_time ?? ''));
            const pDur = Math.max(1, Number(p.duration ?? 30));
            if (pStart == null) continue;

            const clash = existing.find((e) => {
                if (exId && String(e.id) === String(exId)) return false;
                const eStart = hhmmToMin(String(e.appointment_time ?? e.time ?? ''));
                if (eStart == null) return false;
                const eDur = Math.max(1, Number(e.duration ?? 30));
                if (!overlaps(pStart, pDur, eStart, eDur)) return false;
                const eSid = String(e.staff_id ?? e.specialist_id ?? '').trim();
                const eDev = String(e.device_id ?? '').trim();
                const staffClash = !!(sid && eSid === sid);
                const devClash = !!(dev && eDev === dev);
                return staffClash || devClash;
            });

            if (clash) {
                const sug = buildSlotSuggestionsSync(existing, {
                    staffId: sid,
                    deviceId: dev,
                    durationMin: pDur,
                    anchorStartMin: pStart,
                });
                const eSid = String(clash.staff_id ?? clash.specialist_id ?? '').trim();
                const eDev = String(clash.device_id ?? '').trim();
                const overlapStaff = !!(sid && eSid === sid);
                const overlapDev = !!(dev && eDev === dev);
                if (overlapStaff) {
                    const staffName = specialists.find((s) => s.id === sid)?.name ?? sid;
                    throw new SlotConflictError(
                        tm('bErrTimeConflict').replace('{staff}', staffName).replace('{time}', String(p.time)),
                        {
                            kind: 'staff',
                            staffName,
                            sameDeviceSlots: sug.sameDeviceSlots,
                            otherDeviceSuggestions: sug.otherDeviceSuggestions,
                        },
                    );
                }
                if (overlapDev) {
                    const dname = devices.find((d) => String(d.id) === dev)?.name ?? dev;
                    throw new SlotConflictError(
                        tm('bErrSlotDeviceBusy').replace('{device}', dname).replace('{time}', String(p.time)),
                        {
                            kind: 'device',
                            deviceName: dname,
                            sameDeviceSlots: sug.sameDeviceSlots,
                            otherDeviceSuggestions: sug.otherDeviceSuggestions,
                        },
                    );
                }
            }
        }
    };

    const applySuggestedSlot = (time: string, deviceId?: string) => {
        setAptTime(safeTimeHHmm(time));
        if (deviceId) setAptDevice(String(deviceId));
        setSlotSuggestModal((s) => ({ ...s, open: false }));
    };

    const browseFreeSlots = async () => {
        if (serviceLines.length === 0 || !allServicesStaffed) {
            toast.info(tm('bSlotBrowseNeedStaff'));
            return;
        }
        if (!String(serviceLines[0].staff_id ?? '').trim()) {
            toast.info(tm('bSlotBrowseNeedStaff'));
            return;
        }
        setSlotBrowseLoading(true);
        try {
            const day = safeDateYmd(aptDate);
            const existingRaw = await beautyService.getAppointmentsInRange(day, day);
            const existing = existingRaw.filter(beautyAptBlocksCalendarSlot);
            const firstLine = serviceLines[0];
            const baseMin = hhmmToMin(safeTimeHHmm(aptTime));
            const hint: SlotSegHint | undefined =
                serviceLines.length === 1
                    ? undefined
                    : {
                          staffId: String(firstLine.staff_id ?? '').trim(),
                          deviceId: String(aptDevice ?? '').trim(),
                          durationMin: Math.max(
                              1,
                              Math.round(
                                  lineBookingDurations[0] ??
                                      Number(firstLine.duration_min ?? 30) *
                                          Math.max(1, Number(firstLine.qty ?? 1)),
                              ),
                          ),
                          anchorStartMin: baseMin ?? undefined,
                      };
            const sug = buildSlotSuggestionsSync(existing, hint);
            setSlotSuggestModal({
                open: true,
                title: tm('bSlotBrowseTitle'),
                subtitle: tm('bSlotBrowseSubtitle'),
                sameDeviceSlots: sug.sameDeviceSlots,
                otherDeviceSuggestions: sug.otherDeviceSuggestions,
                conflictKind: undefined,
            });
        } catch (e: unknown) {
            logger.crudError('AppointmentPOS', 'browseFreeSlots', e);
            toast.error(extractTechnicalError(e) || tm('bBookingErrorGeneric'));
        } finally {
            setSlotBrowseLoading(false);
        }
    };

    const handleUpdateExistingAppointment = async () => {
        if (!existingAppointment?.id || updateExistingBusy) return;

        const wantsTerminal =
            aptStatus === AppointmentStatus.CANCELLED || aptStatus === AppointmentStatus.NO_SHOW;
        const dbCompleted =
            existingAppointment.status === AppointmentStatus.COMPLETED ||
            existingAppointment.status === 'completed';
        if (wantsTerminal && dbCompleted && customer) {
            const prevSt = String(existingAppointment.status ?? '');
            if (prevSt !== String(aptStatus)) {
                if (serviceLines.length > 0 && !allServicesStaffed) {
                    openBookingBlockModal('staff');
                    return;
                }
                if (serviceLines.length > 0 && activeSpecialists.length === 0) {
                    openBookingBlockModal('no_specialists');
                    return;
                }
                setUpdateExistingBusy(true);
                try {
                    await updateAppointment(existingAppointment.id, {
                        status: aptStatus,
                        notes: aptNotes?.trim() ? aptNotes : null,
                        treatment_degree: receiptTreatmentDegree.trim() || null,
                        treatment_shots: receiptTreatmentShots.trim() || null,
                    });
                    toast.success(tm('bAppointmentUpdatedOk'));
                    setExistingEditBaselineFlush((f) => f + 1);
                } catch (e: unknown) {
                    logger.crudError('AppointmentPOS', 'updateExistingAppointment', e);
                    const msg = extractTechnicalError(e);
                    openBookingBlockModal('api_error', msg || tm('bBookingErrorGeneric'));
                } finally {
                    setUpdateExistingBusy(false);
                }
                return;
            }
        }

        if (isExistingPaidComplete || !existingEditDirty) return;
        if (!canSave) return;
        if (serviceLines.length > 0 && !allServicesStaffed) {
            openBookingBlockModal('staff');
            return;
        }
        if (serviceLines.length > 0 && activeSpecialists.length === 0) {
            openBookingBlockModal('no_specialists');
            return;
        }
        setUpdateExistingBusy(true);
        try {
            if (
                serviceLines.length > 0 &&
                aptStatus !== AppointmentStatus.CANCELLED &&
                aptStatus !== AppointmentStatus.NO_SHOW
            ) {
                const planned = buildServiceAppointmentPayloads(aptStatus);
                await ensureAppointmentSlotOk(planned);
            }
            const firstSvc = serviceLines[0];
            await updateAppointment(existingAppointment.id, {
                appointment_date: safeDateYmd(aptDate),
                appointment_time: safeTimeHHmm(aptTime),
                date: safeDateYmd(aptDate),
                time: safeTimeHHmm(aptTime),
                device_id: aptDevice || null,
                notes: aptNotes || null,
                status: aptStatus,
                total_price: total,
                duration: Math.max(1, Math.round(aptActualDurationMin || totalDur || Number(existingAppointment.duration) || 30)),
                staff_id: firstSvc?.staff_id?.trim() || undefined,
                service_id: serviceLines.length === 1 ? serviceLines[0]?.item_id : undefined,
                treatment_degree: receiptTreatmentDegree.trim() || null,
                treatment_shots: receiptTreatmentShots.trim() || null,
            });
            toast.success(tm('bAppointmentUpdatedOk'));
            setExistingEditBaselineFlush((f) => f + 1);
        } catch (e: unknown) {
            if (e instanceof SlotConflictError) {
                setSlotSuggestModal({
                    open: true,
                    title: tm('bSlotConflictTitle'),
                    subtitle: e.message,
                    sameDeviceSlots: e.detail.sameDeviceSlots,
                    otherDeviceSuggestions: e.detail.otherDeviceSuggestions,
                    conflictKind: e.detail.kind,
                });
            } else {
                logger.crudError('AppointmentPOS', 'updateExistingAppointment', e);
                const msg = extractTechnicalError(e);
                openBookingBlockModal('api_error', msg || tm('bBookingErrorGeneric'));
            }
        } finally {
            setUpdateExistingBusy(false);
        }
    };

    const runToolbarAppointmentCancel = useCallback(async () => {
        if (!existingAppointment?.id) return;
        setCancelAptBusy(true);
        try {
            await updateAppointment(existingAppointment.id, {
                status: AppointmentStatus.CANCELLED,
                notes: aptNotes?.trim() ? aptNotes : null,
            });
            setAptStatus(AppointmentStatus.CANCELLED);
            toast.success(tm('bAptCancelSuccessToast'));
            setCancelAptConfirmOpen(false);
            setExistingEditBaselineFlush((f) => f + 1);
        } catch (e: unknown) {
            logger.crudError('AppointmentPOS', 'toolbarCancelAppointment', e);
            toast.error(extractTechnicalError(e) || tm('bBookingErrorGeneric'));
        } finally {
            setCancelAptBusy(false);
        }
    }, [existingAppointment, aptNotes, updateAppointment, tm]);

    const resolveBeautyCashierName = () => {
        const svc = cart.find(l => l.type === 'service' && l.staff_id?.trim());
        if (svc?.staff_id) {
            const n = specialists.find(s => s.id === svc.staff_id)?.name;
            if (n?.trim()) return n.trim();
        }
        return '—';
    };

    const handleBookOnly = async () => {
        if (isExistingPaidComplete) {
            toast.info(tm('bPaymentAlreadyReceived'));
            return;
        }
        if (!canSave || !canBookApt) return;
        if (bookingSubmitRef.current) return;
        bookingSubmitRef.current = true;
        setBookingBusy(true);
        try {
            const planned = buildServiceAppointmentPayloads(aptStatus);
            await ensureAppointmentSlotOk(planned);
            for (const p of planned) {
                await createAppointment(p);
            }
            const receiptSettings = await getReceiptSettings(receiptFirmNr).catch((): ReceiptSettings => ({}));
            const payLang: KitchenReceiptLocale = isKitchenReceiptLocale(uiLanguage) ? uiLanguage : 'tr';
            const bookingSale: Sale = {
                id: `APT-${Date.now()}`,
                receiptNumber,
                date: new Date().toISOString(),
                customerId: customer!.id,
                customerName: customer?.name,
                items: beautyLinesToReceiptItems(cart, payLang, receiptSettings, products, specialists),
                subtotal,
                discount: discAmt,
                total,
                paymentMethod: 'pending',
                cashier: resolveBeautyCashierName(),
                beautyDeviceName: resolveBeautyDeviceLabel(aptDevice, devices) || undefined,
                beautyTreatmentDegree: receiptTreatmentDegree.trim() || undefined,
                beautyTreatmentShots: receiptTreatmentShots.trim() || undefined,
            };
            setReceiptHeaderBanner(tm('bAppointmentReceiptBanner'));
            setCompletedSale(bookingSale);
            setCompletedPaymentData({
                payments: [],
                totalPaid: 0,
                change: 0,
                language: payLang,
            });
            setReceiptPrintImmediately(false);
            clearCart();
            void generateNewReceiptNumber();
            setShowReceiptModal(true);
            toast.success(tm('bAppointmentCreated'));
        } catch (e: unknown) {
            if (e instanceof SlotConflictError) {
                setSlotSuggestModal({
                    open: true,
                    title: tm('bSlotConflictTitle'),
                    subtitle: e.message,
                    sameDeviceSlots: e.detail.sameDeviceSlots,
                    otherDeviceSuggestions: e.detail.otherDeviceSuggestions,
                    conflictKind: e.detail.kind,
                });
            } else {
                logger.crudError('AppointmentPOS', 'bookAppointment', e);
                const msg = extractTechnicalError(e);
                openBookingBlockModal('api_error', msg || tm('bBookingErrorGeneric'));
            }
        } finally {
            bookingSubmitRef.current = false;
            setBookingBusy(false);
        }
    };

    /** Randevu Oluştur — eksikleri modalda göster */
    const tryBookAppointment = () => {
        if (bookingBusy || bookingSubmitRef.current) return;
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
        if (bookingBusy || bookingSubmitRef.current) return;
        if (isExistingPaidComplete) {
            toast.info(tm('bPaymentAlreadyReceived'));
            return;
        }
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

    const tryUpdateExistingAppointment = () => {
        if (updateExistingBusy || bookingBusy || bookingSubmitRef.current) return;
        if (!existingAppointment?.id) return;
        const terminalFromCompleted =
            (aptStatus === AppointmentStatus.CANCELLED || aptStatus === AppointmentStatus.NO_SHOW) &&
            (existingAppointment.status === AppointmentStatus.COMPLETED ||
                existingAppointment.status === 'completed') &&
            String(existingAppointment.status ?? '') !== String(aptStatus);
        if (isExistingPaidComplete && !terminalFromCompleted) return;
        if (!existingEditDirty && !terminalFromCompleted) return;
        if (!customer) {
            openBookingBlockModal('customer');
            return;
        }
        if (!cart.length && !terminalFromCompleted) return;
        if (serviceLines.length > 0 && activeSpecialists.length === 0) {
            openBookingBlockModal('no_specialists');
            return;
        }
        if (serviceLines.length > 0 && !allServicesStaffed) {
            openBookingBlockModal('staff');
            return;
        }
        void handleUpdateExistingAppointment();
    };

    /** Ödeme modalı: hesabı kapatmadan ön fiş (Restoran POS ile aynı) */
    const handlePrintDraftFromPaymentModal = async (ctx: POSPaymentModalDraftContext) => {
        let paymentMethod = 'cash';
        if (ctx.payments.length > 0) {
            const exchangeRates: Record<string, number> = { IQD: 1, USD: 1310, EUR: 1450 };
            const methodTotals: Record<string, number> = { cash: 0, card: 0, veresiye: 0 };
            ctx.payments.forEach((payment) => {
                const amountInIQD = payment.amount * (exchangeRates[payment.currency] || 1);
                let method = payment.method;
                if (method === 'gateway') method = 'card';
                methodTotals[method] = (methodTotals[method] || 0) + amountInIQD;
            });
            paymentMethod = Object.keys(methodTotals).reduce((a, b) =>
                (methodTotals[a] ?? 0) > (methodTotals[b] ?? 0) ? a : b
            );
        }

        try {
            invalidateReceiptSettingsCache();
            const receiptSettings = await getReceiptSettings(receiptFirmNr).catch((): ReceiptSettings => ({}));
            const lang: KitchenReceiptLocale = isKitchenReceiptLocale(ctx.receiptLanguage) ? ctx.receiptLanguage : 'tr';

            const sale: Sale = {
                id: `DRAFT-${Date.now()}`,
                receiptNumber,
                date: new Date().toISOString(),
                customerId: customer?.id,
                customerName: customer?.name,
                items: beautyLinesToReceiptItems(cart, lang, receiptSettings, products, specialists),
                subtotal,
                discount: discAmt + ctx.discount,
                total: ctx.finalTotal,
                paymentMethod,
                cashier: resolveBeautyCashierName(),
                beautyDeviceName: resolveBeautyDeviceLabel(aptDevice, devices) || undefined,
                beautyTreatmentDegree: receiptTreatmentDegree.trim() || undefined,
                beautyTreatmentShots: receiptTreatmentShots.trim() || undefined,
                notes:
                    lang === 'en'
                        ? 'Interim bill'
                        : lang === 'ar'
                          ? 'حساب مبدئي'
                          : lang === 'ku'
                            ? 'وەسڵی پێشووەختە'
                            : 'Ön hesap',
            };

            const companyName =
                receiptSettings.companyName?.trim()
                || selectedFirm?.title?.trim()
                || selectedFirm?.name?.trim()
                || 'RetailEX';
            const html = buildRestaurantAdisyonHtml({
                sale,
                ctx: {
                    payments: ctx.payments,
                    totalPaid: ctx.totalPaid,
                    change: ctx.change,
                    remaining: ctx.remaining,
                    finalTotal: ctx.finalTotal,
                    discount: ctx.discount,
                },
                companyName,
                logoDataUrl: receiptSettings.logoDataUrl,
                companyAddress: receiptSettings.companyAddress,
                companyPhone: receiptSettings.companyPhone,
                companyTaxOffice: receiptSettings.companyTaxOffice,
                companyTaxNumber: receiptSettings.companyTaxNumber,
                firmTitle: selectedFirm?.title?.trim() || selectedFirm?.name?.trim() || '',
                locale: lang,
            });
            await printRestaurantHtmlNoPreview(html);
            toast.success('Ön fiş yazıcıya gönderildi');
        } catch (e: unknown) {
            logger.crudError('AppointmentPOS', 'draftReceiptPrint', e);
            toast.error('Yazdırma başarısız');
        }
    };

    const handlePayComplete = async (paymentData: any) => {
        if (isExistingPaidComplete) {
            setShowPay(false);
            toast.info(tm('bPaymentAlreadyReceived'));
            return;
        }
        if (checkoutSubmitRef.current) return;
        checkoutSubmitRef.current = true;
        try {
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
            /** POS ödeme modalındaki ilave indirim (tutar/%); fiş ile aynı tutarların DB / ERP’ye yazılması */
            const extraDiscount = Math.max(0, Number(paymentData?.discount) || 0);
            const ftRaw = Number(paymentData?.finalTotal);
            const finalTotalSale = Number.isFinite(ftRaw) ? ftRaw : total;
            const headerDiscount = discAmt + extraDiscount;

            if (existingAppointment?.id) {
                if (serviceLines.length > 0) {
                    const plannedPay = buildServiceAppointmentPayloads(AppointmentStatus.COMPLETED);
                    await ensureAppointmentSlotOk(plannedPay);
                }
                await updateAppointment(existingAppointment.id, {
                    appointment_date: safeDateYmd(aptDate),
                    appointment_time: safeTimeHHmm(aptTime),
                    date: safeDateYmd(aptDate),
                    time: safeTimeHHmm(aptTime),
                    device_id: aptDevice || null,
                    notes: aptNotes || null,
                    status: AppointmentStatus.COMPLETED,
                    total_price: finalTotalSale,
                    duration: Math.max(1, Math.round(aptActualDurationMin || totalDur || Number(existingAppointment.duration) || 30)),
                    treatment_degree: receiptTreatmentDegree.trim() || null,
                    treatment_shots: receiptTreatmentShots.trim() || null,
                });
            } else if (canBookApt) {
                const planned = buildServiceAppointmentPayloads(AppointmentStatus.CONFIRMED);
                await ensureAppointmentSlotOk(planned);
                for (const p of planned) {
                    await createAppointment(p);
                }
            }

            let paymentMethod = 'cash';
            if (paymentData.payments && paymentData.payments.length > 0) {
                const exchangeRates: Record<string, number> = { IQD: 1, USD: 1310, EUR: 1450 };
                const methodTotals: Record<string, number> = {};
                paymentData.payments.forEach((payment: { method: string; currency: string; amount: number }) => {
                    const amountInIQD = payment.amount * (exchangeRates[payment.currency] || 1);
                    let method = payment.method;
                    if (method === 'gateway') method = 'card';
                    methodTotals[method] = (methodTotals[method] || 0) + amountInIQD;
                });
                paymentMethod = Object.keys(methodTotals).reduce((a, b) =>
                    (methodTotals[a] ?? 0) > (methodTotals[b] ?? 0) ? a : b
                );
            } else if (paymentData?.payments?.[0]?.method) {
                paymentMethod = paymentData.payments[0].method === 'gateway' ? 'card' : paymentData.payments[0].method;
            }

            const lineGrosses = cart.map((l) => l.unit_price * l.qty);
            const lineSplits = splitProportionalLineDiscount(lineGrosses, headerDiscount);
            const saleItems = cart.map((line, idx) => ({
                item_type: line.type,
                item_id: line.item_id,
                name: line.name,
                quantity: line.qty,
                unit_price: line.unit_price,
                discount: lineSplits[idx]?.discount ?? 0,
                total: lineSplits[idx]?.total ?? line.unit_price * line.qty,
                staff_id: line.staff_id ?? null,
                commission_amount: 0,
            }));

            let separateLineInvoices = false;
            try {
                const cfg: any = await safeInvoke('get_app_config');
                separateLineInvoices =
                    cfg?.beauty_queue_separate_sale_per_line === true ||
                    cfg?.beauty_queue_separate_sale_per_line === '1';
            } catch {
                /* no-op */
            }

            const saleNotesLink = buildBeautySaleNotesWithAppointmentLink(
                aptNotes?.trim() || undefined,
                existingAppointment?.id,
            );

            if (separateLineInvoices && cart.length > 1) {
                for (let idx = 0; idx < cart.length; idx++) {
                    const line = cart[idx];
                    const gross = line.unit_price * line.qty;
                    const disc = lineSplits[idx]?.discount ?? 0;
                    const net = lineSplits[idx]?.total ?? gross;
                    await beautyService.createSale(
                        {
                            customer_id: customer!.id,
                            customer_name: customer?.name,
                            subtotal: gross,
                            discount: disc,
                            tax: 0,
                            total: net,
                            payment_method: paymentMethod,
                            payment_status: 'paid',
                            paid_amount: net,
                            remaining_amount: 0,
                            notes: saleNotesLink,
                        },
                        [
                            {
                                item_type: line.type,
                                item_id: line.item_id,
                                name: line.name,
                                quantity: line.qty,
                                unit_price: line.unit_price,
                                discount: disc,
                                total: net,
                                staff_id: line.staff_id ?? null,
                                commission_amount: 0,
                            },
                        ],
                        { skipErpAndLoyalty: true },
                    );
                }
                await beautyService.syncBeautyCheckoutToErp(
                    {
                        customer_id: customer!.id,
                        customer_name: customer?.name,
                        subtotal,
                        discount: headerDiscount,
                        tax: 0,
                        total: finalTotalSale,
                        payment_method: paymentMethod,
                        payment_status: 'paid',
                        paid_amount: finalTotalSale,
                        remaining_amount: 0,
                        notes: (saleNotesLink ?? aptNotes?.trim()) || undefined,
                    },
                    saleItems,
                );
            } else {
                await beautyService.createSale({
                    customer_id: customer!.id,
                    customer_name: customer?.name,
                    subtotal,
                    discount: headerDiscount,
                    tax: 0,
                    total: finalTotalSale,
                    payment_method: paymentMethod,
                    payment_status: 'paid',
                    paid_amount: finalTotalSale,
                    remaining_amount: 0,
                    notes: saleNotesLink,
                }, saleItems);
            }

            const splitInvoiceCount =
                separateLineInvoices && cart.length > 1 ? cart.length : 0;

            for (const line of cart) {
                if (line.type !== 'product') continue;
                const p = useProductStore.getState().products.find(x => x.id === line.item_id);
                if (p) await updateStock(p.id, Math.max(0, (p.stock ?? 0) - line.qty));
            }

            const receiptSettings = await getReceiptSettings(receiptFirmNr).catch((): ReceiptSettings => ({}));
            const payLang: KitchenReceiptLocale = isKitchenReceiptLocale(paymentData?.language) ? paymentData.language : 'tr';

            const sale: Sale = {
                id: Date.now().toString(),
                receiptNumber,
                date: new Date().toISOString(),
                customerId: customer?.id,
                customerName: customer?.name,
                items: beautyLinesToReceiptItems(cart, payLang, receiptSettings, products, specialists),
                subtotal,
                discount: headerDiscount,
                total: finalTotalSale,
                paymentMethod,
                cashier: resolveBeautyCashierName(),
                notes: aptNotes?.trim() || undefined,
                beautyDeviceName: resolveBeautyDeviceLabel(aptDevice, devices) || undefined,
                beautyTreatmentDegree: receiptTreatmentDegree.trim() || undefined,
                beautyTreatmentShots: receiptTreatmentShots.trim() || undefined,
            };

            setReceiptHeaderBanner(undefined);
            setCompletedSale(sale);
            setCompletedPaymentData(paymentData);
            setReceiptPrintImmediately(paymentData.showReceiptPreview === false);
            setShowReceiptModal(true);

            clearCart();
            void generateNewReceiptNumber();
            setShowPay(false);
            if (splitInvoiceCount > 1) {
                toast.success(tm('bBeautySplitInvoicesDone').replace('{n}', String(splitInvoiceCount)));
            } else {
                toast.success(tm('bPaymentCompleted'));
            }
        } catch (e: unknown) {
            setShowPay(false);
            if (e instanceof SlotConflictError) {
                setSlotSuggestModal({
                    open: true,
                    title: tm('bSlotConflictTitle'),
                    subtitle: e.message,
                    sameDeviceSlots: e.detail.sameDeviceSlots,
                    otherDeviceSuggestions: e.detail.otherDeviceSuggestions,
                    conflictKind: e.detail.kind,
                });
            } else {
                logger.crudError('AppointmentPOS', 'payAndBook', e);
                const msg = extractTechnicalError(e);
                openBookingBlockModal('api_error', msg || tm('bBookingErrorGeneric'));
            }
        } finally {
            checkoutSubmitRef.current = false;
        }
    };

    const handleMonthlySeriesFromCartConfirm = useCallback(async () => {
        if (!monthlyModalLine || !customer) return;
        const sid = String(monthlyModalLine.staff_id ?? '').trim();
        if (!sid) {
            toast.error(tm('bMonthlyCartNeedStaff'));
            return;
        }
        setMonthlyBusy(true);
        try {
            const first = safeDateYmd(monthlyForm.date);
            /** Kesin saat iş kuralı: D-1; DB’de üst bardaki saat yer tutucu */
            const t = safeTimeHHmm(aptTime) || '09:00';
            await beautyService.createMonthlySessionSeries({
                customer_id: customer.id,
                service_id: monthlyModalLine.item_id,
                first_session_date: first,
                appointment_time: t,
                specialist_id: sid,
                session_count: Math.max(1, Math.round(monthlyForm.sessions)),
                device_id: aptDevice?.trim() || undefined,
            });
            toast.success(tm('bMonthlySeriesCreatedToast').replace('{n}', String(monthlyForm.sessions)));
            setMonthlyModalLine(null);
            const end = addCalendarMonthsYmd(first, Math.max(1, monthlyForm.sessions) + 1);
            await loadAppointmentsInRange(first, end);
        } catch (e: unknown) {
            logger.crudError('AppointmentPOS', 'createMonthlySessionSeries', e);
            toast.error(extractTechnicalError(e) || tm('bBookingErrorGeneric'));
        } finally {
            setMonthlyBusy(false);
        }
    }, [monthlyModalLine, customer, monthlyForm, aptDevice, aptTime, tm, loadAppointmentsInRange]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f7f6fb', overflow: 'hidden' }}>

            {/* ── TOP BAR: tarih + saat + cihaz + durum (altta yalnızca not) ── */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
                {onBack && (
                    <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 5, background: '#f9fafb', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        <ArrowLeft size={13} /> {tm('bPOSBackCalendar')}
                    </button>
                )}
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0 }}>
                        {onBack ? tm('bAppointmentPOS') : tm('bPOSRegisterTitle')}
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Label>{tm('date')}</Label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '6px 10px' }}>
                            <CalendarDays size={12} color="#7c3aed" />
                            <input
                                type="date"
                                value={aptDate}
                                onChange={e => setAptDate(e.target.value)}
                                aria-label={tm('date')}
                                style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, color: '#4c1d95', outline: 'none' }}
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Label>{tm('time')}</Label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '6px 10px' }}>
                                <Clock size={12} color="#7c3aed" />
                                <input
                                    type="time"
                                    value={aptTime}
                                    onChange={e => setAptTime(e.target.value)}
                                    aria-label={tm('time')}
                                    style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, color: '#4c1d95', outline: 'none' }}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => void browseFreeSlots()}
                                disabled={slotBrowseLoading || serviceLines.length === 0 || !allServicesStaffed}
                                title={tm('bSlotBrowseTitle')}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    padding: '6px 10px',
                                    borderRadius: 5,
                                    border: '1px solid #c4b5fd',
                                    background: serviceLines.length > 0 && allServicesStaffed ? '#fff' : '#f3f4f6',
                                    color: serviceLines.length > 0 && allServicesStaffed ? '#5b21b6' : '#9ca3af',
                                    fontSize: 11,
                                    fontWeight: 800,
                                    cursor: serviceLines.length > 0 && allServicesStaffed && !slotBrowseLoading ? 'pointer' : 'not-allowed',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <CalendarClock size={13} color="currentColor" />
                                {slotBrowseLoading ? tm('bLoading') : tm('bSlotBrowseShort')}
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, maxWidth: 220 }}>
                        <Label>{tm('bDiagDevice')}</Label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '4px 8px 4px 10px', minWidth: 0 }}>
                            <Cpu size={12} color="#7c3aed" style={{ flexShrink: 0 }} />
                            <select
                                value={aptDevice}
                                onChange={e => setAptDevice(String(e.target.value))}
                                title={tm('bDiagDevice')}
                                aria-label={tm('bDiagDevice')}
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
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, maxWidth: 200 }}>
                        <Label>{tm('bStatus')}</Label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '4px 8px 4px 10px', minWidth: 0 }}>
                            <Activity size={12} color="#7c3aed" style={{ flexShrink: 0 }} />
                            <select
                                value={aptStatus}
                                onChange={e => setAptStatus(e.target.value as AppointmentStatus)}
                                title={tm('bStatus')}
                                aria-label={tm('bStatus')}
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
                                {appointmentStatusSelectOptions.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {existingAppointment?.id &&
                        aptStatus !== AppointmentStatus.CANCELLED &&
                        aptStatus !== 'cancelled' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'flex-end' }}>
                            <Label>{'\u00a0'}</Label>
                            <button
                                type="button"
                                onClick={() => setCancelAptConfirmOpen(true)}
                                disabled={updateExistingBusy || cancelAptBusy || bookingBusy}
                                title={tm('bAptCancelToolbarBtn')}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    padding: '8px 12px',
                                    borderRadius: 5,
                                    border: '1px solid #fecaca',
                                    background: '#fff',
                                    color: '#b91c1c',
                                    fontSize: 11,
                                    fontWeight: 800,
                                    cursor:
                                        updateExistingBusy || cancelAptBusy || bookingBusy ? 'not-allowed' : 'pointer',
                                    whiteSpace: 'nowrap',
                                    minHeight: 30,
                                    opacity: updateExistingBusy || cancelAptBusy || bookingBusy ? 0.55 : 1,
                                }}
                            >
                                {tm('bAptCancelToolbarBtn')}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── BODY ────────────────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* ── LEFT: Item grid ─────────────────────────────── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #e8e4f0' }}>
                    {/* Tabs + search (+ hizmetlerde kategori + varsayılan uzman tek satır) */}
                    <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 14px', flexShrink: 0 }}>
                        {/* Arama solda, daha büyük dokunma alanı; sekmeler sağda/yanında */}
                        <div style={{ display: 'flex', gap: 10, marginBottom: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ flex: '1 1 220px', minWidth: 200, maxWidth: 480, position: 'relative' }}>
                                <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                                <input value={svcQ} onChange={e => setSvcQ(e.target.value)}
                                    placeholder={tab === 'products' ? tm('bSearchProductsPlaceholder') : tab === 'packages' ? tm('bSearchPackagesPlaceholder') : tm('bSearchServicesPlaceholder')}
                                    style={{
                                        ...iStyle,
                                        paddingLeft: 40,
                                        height: 42,
                                        fontSize: 14,
                                        borderRadius: 8,
                                        minHeight: 44,
                                    }} />
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flex: '1 1 auto', minWidth: 0 }}>
                                {([
                                    { id: 'services' as const, label: tm('bPOSTabServices'), Icon: Scissors },
                                    { id: 'packages' as const, label: tm('bPOSTabPackages'), Icon: Package },
                                    { id: 'products' as const, label: tm('bPOSTabProducts'), Icon: ShoppingBag },
                                ]).map(({ id, label, Icon }) => (
                                    <button key={id} onClick={() => { setTab(id); setCategory('all'); setSvcQ(''); }} style={{
                                        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
                                        border: tab === id ? 'none' : '1px solid #e5e7eb',
                                        background: tab === id ? '#7c3aed' : '#f9fafb',
                                        color: tab === id ? '#fff' : '#6b7280',
                                        fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                        minHeight: 44,
                                        touchAction: 'manipulation',
                                    }}>
                                        <Icon size={18} />{label}
                                    </button>
                                ))}
                                {tab === 'services' && activeSpecialists.length > 0 && (
                                    <div
                                        title={`${tm('bDefaultSpecialist')}: ${tm('bDefaultSpecialistHint')}`}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            flexShrink: 0,
                                            paddingLeft: 10,
                                            marginLeft: 2,
                                            borderLeft: '1px solid #e8e4f0',
                                            minWidth: 0,
                                            maxWidth: '100%',
                                            overflowX: 'auto',
                                            scrollbarWidth: 'thin',
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
                                                        flexShrink: sel ? 1 : 0,
                                                        minWidth: sel ? 72 : 44,
                                                        maxWidth: sel ? 280 : undefined,
                                                        padding: sel ? '8px 12px' : '0 10px',
                                                        justifyContent: sel ? 'flex-start' : 'center',
                                                        textAlign: sel ? 'left' : 'center',
                                                        border: sel ? 'none' : '1px solid #e5e7eb',
                                                        background: sel ? '#7c3aed' : '#f3f4f6',
                                                        color: sel ? '#fff' : '#374151',
                                                        letterSpacing: sel ? 'normal' : '0.02em',
                                                        fontSize: sel ? 13 : 12,
                                                        fontWeight: sel ? 700 : 800,
                                                        whiteSpace: sel ? 'normal' : 'nowrap',
                                                        lineHeight: sel ? 1.25 : 1,
                                                    }}
                                                >
                                                    {sel ? s.name : specInitials(s.name)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {showCategoryRailToggle && (
                                    <button
                                        type="button"
                                        onClick={() => setCategoryRailMode(m => (m === 'chips' ? 'sidebar' : 'chips'))}
                                        title={categoryRailMode === 'chips' ? tm('bCategoryRailUseSidebar') : tm('bCategoryRailUseChips')}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            width: 44, height: 44, padding: 0, borderRadius: 8,
                                            border: categoryRailMode === 'sidebar' ? '2px solid #7c3aed' : '1px solid #e5e7eb',
                                            background: categoryRailMode === 'sidebar' ? '#ede9fe' : '#fff',
                                            color: '#7c3aed', cursor: 'pointer', flexShrink: 0,
                                            touchAction: 'manipulation',
                                        }}
                                    >
                                        <PanelLeft size={20} strokeWidth={2.25} />
                                    </button>
                                )}
                            </div>
                        </div>
                        {tab === 'services' && !useCategorySidebar && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: '1 1 120px', minWidth: 0, scrollbarWidth: 'none' }}>
                                    {['all', ...categories].map(cat => (
                                        <button key={cat} onClick={() => setCategory(cat)} style={{
                                            flexShrink: 0, padding: '8px 14px', borderRadius: 8,
                                            border: category === cat ? 'none' : '1px solid #e5e7eb',
                                            background: category === cat ? '#ede9fe' : '#f9fafb',
                                            color: category === cat ? '#7c3aed' : '#6b7280',
                                            fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                                            minHeight: 40, touchAction: 'manipulation',
                                        }}>
                                            {cat === 'all' ? tm('bAll') : (CATEGORY_TR[cat] ?? cat)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {tab === 'products' && !useCategorySidebar && (
                            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', marginTop: 8 }}>
                                {['all', ...productCategories].map(cat => (
                                    <button key={cat} onClick={() => setCategory(cat)} style={{
                                        flexShrink: 0, padding: '8px 14px', borderRadius: 8,
                                        border: category === cat ? 'none' : '1px solid #e5e7eb',
                                        background: category === cat ? '#ccfbf1' : '#f9fafb',
                                        color: category === cat ? '#0d9488' : '#6b7280',
                                        fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                                        minHeight: 40, touchAction: 'manipulation',
                                    }}>
                                        {cat === 'all' ? tm('bAll') : cat}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Kategori: RestPOS tarzı sol şerit veya tam genişlik grid */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
                        {useCategorySidebar && (
                            <aside
                                className="custom-scrollbar"
                                style={{
                                    width: 200,
                                    flexShrink: 0,
                                    background: '#f8fafc',
                                    borderRight: '1px solid #e2e8f0',
                                    overflowY: 'auto',
                                    overflowX: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    padding: '12px 10px 16px',
                                    gap: 8,
                                    alignItems: 'stretch',
                                    boxShadow: 'inset -1px 0 0 rgba(148, 163, 184, 0.12)',
                                }}
                            >
                                <div style={{
                                    fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase',
                                    letterSpacing: '0.14em', padding: '4px 8px 2px',
                                }}>
                                    {tm('bCategorySidebarHeading')}
                                </div>
                                {(tab === 'services' ? ['all', ...categories] : ['all', ...productCategories]).map(cat => {
                                    const sel = category === cat;
                                    const isTeal = tab === 'products';
                                    const label = cat === 'all' ? tm('bAll') : (tab === 'services' ? (CATEGORY_TR[cat] ?? cat) : cat);
                                    return (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => setCategory(cat)}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '12px 14px',
                                                borderRadius: 14,
                                                border: sel ? `2px solid ${isTeal ? '#0d9488' : '#7c3aed'}` : '2px solid transparent',
                                                background: sel ? (isTeal ? '#ccfbf1' : '#ede9fe') : '#fff',
                                                color: sel ? (isTeal ? '#0f766e' : '#5b21b6') : '#64748b',
                                                fontSize: 13,
                                                fontWeight: sel ? 800 : 600,
                                                cursor: 'pointer',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.04em',
                                                lineHeight: 1.25,
                                                wordBreak: 'break-word',
                                                touchAction: 'manipulation',
                                                boxShadow: sel
                                                    ? (isTeal ? '0 4px 14px rgba(13, 148, 136, 0.18)' : '0 4px 14px rgba(124, 58, 237, 0.12)')
                                                    : '0 1px 2px rgba(15, 23, 42, 0.06)',
                                            }}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </aside>
                        )}
                    {/* Grid */}
                    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px,1fr))', gap: 8, alignContent: 'start' }} className="custom-scrollbar">
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
                                    {CATEGORY_TR[svc.category] ?? svc.category} · {svc.duration_min}{tm('bDkSuffix')}
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
                                    <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
                                        {tm('bPackageSessionsDays').replace('{sessions}', String(pkg.total_sessions)).replace('{days}', String(pkg.validity_days))}
                                    </p>
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
                                    {(p.category || tm('bCategoryGeneral'))}{(p.barcode ? ` · ${p.barcode}` : '')}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0d9488' }}>{fmt(p.price)}</span>
                                    <span style={{ fontSize: 10, fontWeight: 600, color: (p.stock ?? 0) <= 0 ? '#ef4444' : '#6b7280' }}>
                                        {tm('stockLabel')}: {p.stock ?? 0}
                                    </span>
                                </div>
                            </button>
                        ))}
                        {tab === 'services' && filteredSvcs.length === 0 && (
                            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', color: '#d1d5db', gap: 8 }}>
                                <Scissors size={28} />
                                <p style={{ fontSize: 12, fontWeight: 600 }}>{tm('bServiceNotFound')}</p>
                            </div>
                        )}
                        {tab === 'products' && filteredRetailProducts.length === 0 && (
                            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', color: '#d1d5db', gap: 8 }}>
                                <ShoppingBag size={28} />
                                <p style={{ fontSize: 12, fontWeight: 600 }}>{tm('bProductNotFound')}</p>
                            </div>
                        )}
                    </div>
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
                            alignItems: 'flex-start',
                            justifyContent: 'center',
                            padding: 'max(16px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))',
                            overflowY: 'auto',
                            WebkitOverflowScrolling: 'touch',
                        }}>
                            <div style={{
                                background: '#fff',
                                borderRadius: 20,
                                width: '100%',
                                maxWidth: showAddForm ? 520 : 480,
                                maxHeight: 'min(85vh, calc(100dvh - 48px))',
                                minHeight: 0,
                                margin: 'auto 0',
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
                                        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>{tm('bSaleSelectCustomerHelp')}</p>
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
                                            placeholder={tm('bSearchPlaceholderCustomer')}
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

                                {/* List Section — yeni kayıt formunda alan açılsın diye yükseklik sınırlı */}
                                <div style={{
                                    flex: showAddForm ? '0 1 auto' : 1,
                                    overflowY: 'auto',
                                    padding: '0 12px 12px',
                                    minHeight: showAddForm ? 0 : 200,
                                    maxHeight: showAddForm ? 'min(22vh, 180px)' : undefined,
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
                                            <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>{tm('bCustomerNotFoundList')}</p>
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

                                {/* Quick Add / Footer — butonlar her zaman görünsün */}
                                <div style={{
                                    padding: '16px 24px 24px',
                                    borderTop: '1px solid #f3f4f6',
                                    background: '#fafafa',
                                    flexShrink: 0,
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
                                            border: '1px solid #e5e7eb',
                                            minHeight: 0,
                                        }}>
                                            <h4 style={{ margin: '0 0 5px', fontSize: 13, fontWeight: 700, color: '#374151', flexShrink: 0 }}>{tm('bFormNewRecord')}</h4>
                                            <div style={{ maxHeight: 'min(36vh, 300px)', overflowY: 'auto', paddingRight: 4 }} className="custom-scrollbar">
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                    <Field label={tm('custLabelFullName')}>
                                                        <input value={newCust.name} onChange={e => setNewCust(p => ({ ...p, name: e.target.value }))} placeholder={tm('bPlaceholderNameRequired')} style={{ ...iStyle, borderRadius: 10, height: 40 }} />
                                                    </Field>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                        <Field label={tm('custLabelPhone1')}>
                                                            <input value={newCust.phone} onChange={e => setNewCust(p => ({ ...p, phone: e.target.value }))} placeholder={tm('bPhone')} style={{ ...iStyle, borderRadius: 10, height: 40 }} />
                                                        </Field>
                                                        <Field label={tm('custLabelPhone2')}>
                                                            <input value={newCust.phone2} onChange={e => setNewCust(p => ({ ...p, phone2: e.target.value }))} placeholder={tm('custPhPhone2')} style={{ ...iStyle, borderRadius: 10, height: 40 }} />
                                                        </Field>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                        <Field label={tm('custLabelAge')}>
                                                            <input type="number" min={0} max={150} value={newCust.age} onChange={e => setNewCust(p => ({ ...p, age: e.target.value }))} placeholder={tm('custPhAge')} style={{ ...iStyle, borderRadius: 10, height: 40 }} />
                                                        </Field>
                                                        <Field label={tm('custLabelFileId')}>
                                                            <input value={newCust.file_id} onChange={e => setNewCust(p => ({ ...p, file_id: e.target.value }))} placeholder={tm('custPhFileId')} style={{ ...iStyle, borderRadius: 10, height: 40 }} autoComplete="off" />
                                                        </Field>
                                                    </div>
                                                    <Field label={tm('custLabelAddress')}>
                                                        <textarea value={newCust.address} onChange={e => setNewCust(p => ({ ...p, address: e.target.value }))} placeholder={tm('custPhAddress')} rows={2} style={{ ...iStyle, height: 'auto', padding: '8px 10px', resize: 'vertical', lineHeight: 1.45, borderRadius: 10 }} />
                                                    </Field>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                        <Field label={tm('custLabelOccupation')}>
                                                            <input value={newCust.occupation} onChange={e => setNewCust(p => ({ ...p, occupation: e.target.value }))} placeholder={tm('custPhOccupation')} style={{ ...iStyle, borderRadius: 10, height: 40 }} />
                                                        </Field>
                                                        <Field label={tm('custLabelEmail')}>
                                                            <input type="email" value={newCust.email} onChange={e => setNewCust(p => ({ ...p, email: e.target.value }))} placeholder={tm('custPhEmail')} style={{ ...iStyle, borderRadius: 10, height: 40 }} />
                                                        </Field>
                                                    </div>
                                                    <Field label={tm('custLabelAbout')}>
                                                        <textarea value={newCust.notes} onChange={e => setNewCust(p => ({ ...p, notes: e.target.value }))} placeholder={tm('custPhAbout')} rows={2} style={{ ...iStyle, height: 'auto', padding: '8px 10px', resize: 'vertical', lineHeight: 1.45, borderRadius: 10 }} />
                                                    </Field>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, marginTop: 5, flexShrink: 0, paddingTop: 4 }}>
                                                <button type="button" onClick={() => { setShowAddForm(false); setNewCust(emptyQuickAddCustomer()); }} style={{ flex: 1, height: 42, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>{tm('cancel')}</button>
                                                <button type="button" onClick={handleSaveNewCustomer} disabled={!newCust.name.trim() || savingCust} style={{ flex: 1.5, height: 42, border: 'none', borderRadius: 10, background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: (!newCust.name.trim() || savingCust) ? 0.6 : 1 }}>
                                                    {savingCust ? '...' : tm('bSaveCustomerButton')}
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
                                <p style={{ fontSize: 12, fontWeight: 600 }}>{tm('bCartEmptyHint')}</p>
                            </div>
                        ) : cart.map(line => (
                            <div
                                key={line.uid}
                                style={{
                                    margin: '0 10px 8px',
                                    padding: 0,
                                    borderRadius: 16,
                                    border: '1px solid #e2e8f0',
                                    background: '#fff',
                                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}
                                onContextMenu={(e) => {
                                    if (line.type !== 'service') return;
                                    e.preventDefault();
                                    openMonthlyCartModalForUid(line.uid);
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        bottom: 0,
                                        width: 4,
                                        zIndex: 1,
                                        pointerEvents: 'none',
                                        boxShadow: '2px 0 10px rgba(0,0,0,0.06)',
                                        background: line.color ?? '#7c3aed',
                                        borderRadius: '16px 0 0 16px',
                                    }}
                                    aria-hidden
                                />
                                <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, position: 'relative', zIndex: 2 }}>
                                    <div style={{ width: 4, flexShrink: 0 }} aria-hidden />
                                    <div style={{ flex: 1, minWidth: 0, padding: '10px 10px 10px 8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{
                                                    fontSize: 10,
                                                    fontWeight: 800,
                                                    letterSpacing: '0.08em',
                                                    color: '#64748b',
                                                    display: 'block',
                                                    marginBottom: 6,
                                                }}>
                                                    {line.type === 'product' ? tm('bLineBadgeProduct') : line.type === 'package' ? tm('bLineBadgePackage') : tm('bLineBadgeService')}
                                                </span>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        flexWrap: 'nowrap',
                                                        width: '100%',
                                                    }}
                                                >
                                                    <p
                                                        title={line.name}
                                                        style={{
                                                            flex: '1 1 0',
                                                            minWidth: 0,
                                                            fontSize: 15,
                                                            fontWeight: 800,
                                                            color: '#0f172a',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            margin: 0,
                                                            lineHeight: 1.2,
                                                            letterSpacing: '-0.02em',
                                                        }}
                                                    >
                                                        {line.name}
                                                    </p>
                                                    <div
                                                        style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => chgQty(line.uid, -1)}
                                                            style={{ width: 28, height: 28, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fff', color: '#64748b' }}
                                                        >
                                                            <Minus size={12} />
                                                        </button>
                                                        <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', minWidth: 22, textAlign: 'center' }}>{line.qty}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => chgQty(line.uid, 1)}
                                                            style={{ width: 28, height: 28, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fff', color: '#64748b' }}
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>
                                                    <span style={{
                                                        fontSize: 15,
                                                        fontWeight: 800,
                                                        color: '#0f172a',
                                                        fontVariantNumeric: 'tabular-nums',
                                                        flexShrink: 0,
                                                    }}>
                                                        {fmt(line.unit_price * line.qty)}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                aria-label={tm('bCartLineRemoveAria')}
                                                onClick={() => remLine(line.uid)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: '#94a3b8',
                                                    flexShrink: 0,
                                                    padding: 4,
                                                    margin: '-4px -4px 0 0',
                                                    borderRadius: 6,
                                                }}
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                        {line.type === 'service' && (() => {
                                            const sid = String(line.staff_id ?? '').trim();
                                            const staffLabel = sid
                                                ? (activeSpecialists.find(s => String(s.id) === String(sid))?.name?.trim()
                                                    ?? specialists.find(s => String(s.id) === String(sid))?.name?.trim())
                                                : undefined;
                                            const hasStaff = Boolean(staffLabel);
                                            return (
                                                <div
                                                    style={{
                                                        marginTop: 10,
                                                        paddingTop: 10,
                                                        borderTop: '1px solid #f1f5f9',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        touchAction: 'manipulation',
                                                        position: 'relative',
                                                        zIndex: 5,
                                                    }}
                                                >
                                                    <div style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
                                                        <div style={{
                                                            fontSize: 9,
                                                            fontWeight: 800,
                                                            letterSpacing: '0.07em',
                                                            color: '#94a3b8',
                                                            marginBottom: 3,
                                                        }}>
                                                            {tm('bStaffName')}
                                                        </div>
                                                        <div
                                                            title={hasStaff ? staffLabel : tm('bLineStaffRequired')}
                                                            style={{
                                                                fontSize: 13,
                                                                fontWeight: 700,
                                                                color: hasStaff ? '#0f172a' : '#b45309',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                                lineHeight: 1.3,
                                                            }}
                                                        >
                                                            {hasStaff ? staffLabel : tm('bLineStaffRequired')}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                                        <button
                                                            type="button"
                                                            title={tm('bStaffPickModalTitle')}
                                                            aria-label={tm('bStaffPickModalTitle')}
                                                            onClick={() => {
                                                                queueMicrotask(() => setStaffLinePickerUid(line.uid));
                                                            }}
                                                            style={{
                                                                width: 44,
                                                                height: 44,
                                                                borderRadius: 10,
                                                                border: '1px solid #e9d5ff',
                                                                background: '#faf5ff',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: '#7c3aed',
                                                                touchAction: 'manipulation',
                                                                WebkitTapHighlightColor: 'transparent',
                                                                flexShrink: 0,
                                                                padding: 0,
                                                            }}
                                                        >
                                                            <Users size={18} />
                                                        </button>
                                                        {isAdmin() ? (
                                                        <button
                                                            type="button"
                                                            title={tm('bAppointmentEditPriceTitleBtn')}
                                                            aria-label={tm('bAppointmentEditPriceTitleBtn')}
                                                            onClick={() => {
                                                                queueMicrotask(() => {
                                                                    setCartLinePriceUid(line.uid);
                                                                    setCartLinePriceDraft(String(line.unit_price ?? 0));
                                                                });
                                                            }}
                                                            style={{
                                                                width: 44,
                                                                height: 44,
                                                                borderRadius: 10,
                                                                border: '1px solid #a7f3d0',
                                                                background: '#ecfdf5',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: '#059669',
                                                                touchAction: 'manipulation',
                                                                WebkitTapHighlightColor: 'transparent',
                                                                flexShrink: 0,
                                                                padding: 0,
                                                            }}
                                                        >
                                                            <Banknote size={18} strokeWidth={2.25} />
                                                        </button>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            title={tm('bCartMonthlyPlanButton')}
                                                            aria-label={tm('bCartMonthlyPlanButton')}
                                                            onClick={() => {
                                                                queueMicrotask(() => openMonthlyCartModalForUid(line.uid));
                                                            }}
                                                            style={{
                                                                width: 44,
                                                                height: 44,
                                                                borderRadius: 10,
                                                                border: '1px solid #bfdbfe',
                                                                background: '#eff6ff',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: '#2563eb',
                                                                touchAction: 'manipulation',
                                                                WebkitTapHighlightColor: 'transparent',
                                                                flexShrink: 0,
                                                                padding: 0,
                                                            }}
                                                        >
                                                            <CalendarDays size={18} strokeWidth={2.25} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })()}
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
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{tm('bAppointmentDetailsTitle')}</span>
                                    {totalDur > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af' }}>· {totalDur}{tm('bDkSuffix')}</span>}
                                </div>
                                {aptOpen ? <ChevronUp size={14} color="#9ca3af" /> : <ChevronDown size={14} color="#9ca3af" />}
                            </button>

                            {aptOpen && (
                                <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }} className="custom-scrollbar">
                                    <p style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', margin: 0, lineHeight: 1.45 }}>
                                        {tm('bPosSlotEditHint')}
                                    </p>
                                    {serviceLines.length > 0 && (
                                        <Field label={tm('bPosActualDurationLabel')}>
                                            <input
                                                type="number"
                                                min={5}
                                                max={600}
                                                value={aptActualDurationMin}
                                                onChange={e => setAptActualDurationMin(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                                                style={iStyle}
                                            />
                                            <span style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', marginTop: 4, display: 'block' }}>
                                                {tm('bPosActualDurationHint').replace('{plan}', String(totalDur || '—'))}
                                            </span>
                                        </Field>
                                    )}
                                    <Field label={tm('bNotes')}>
                                        <textarea value={aptNotes} onChange={e => setAptNotes(e.target.value)}
                                            placeholder={tm('bAppointmentNotesPlaceholder')}
                                            rows={2}
                                            style={{ ...iStyle, height: 'auto', padding: '6px 10px', resize: 'none', lineHeight: 1.5 }} />
                                    </Field>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                        <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                                            <Field label={tm('bReceiptTreatmentDegree')}>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={receiptTreatmentDegree}
                                                    onChange={e => setReceiptTreatmentDegree(e.target.value)}
                                                    placeholder="—"
                                                    autoComplete="off"
                                                    style={{ ...iStyle, height: 34 }}
                                                />
                                            </Field>
                                        </div>
                                        <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                                            <Field label={tm('bReceiptTreatmentShots')}>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={receiptTreatmentShots}
                                                    onChange={e => setReceiptTreatmentShots(e.target.value)}
                                                    placeholder="—"
                                                    autoComplete="off"
                                                    style={{ ...iStyle, height: 34 }}
                                                />
                                            </Field>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', margin: 0, lineHeight: 1.4 }}>
                                        {tm('bReceiptTreatmentHint')}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Totals + Checkout */}
                        <div style={{ padding: '12px 14px' }}>
                            {/* Discount */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{tm('bDiscountPercentShort')}</span>
                                <input type="number" min={0} max={100} value={discount} onChange={e => setDiscount(Number(e.target.value))}
                                    style={{ width: 52, height: 26, textAlign: 'right', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 12, fontWeight: 700, paddingRight: 5, outline: 'none' }} />
                            </div>

                            {/* Summary */}
                            <div style={{ background: '#f7f6fb', borderRadius: 5, padding: '8px 10px', marginBottom: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{tm('subTotal')}</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{fmt(subtotal)}</span>
                                </div>
                                {discount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>{tm('bDiscountMinusPct').replace('{n}', String(discount))}</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>-{fmt(discAmt)}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e8e4f0', paddingTop: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: '#111827' }}>{tm('total')}</span>
                                    <span style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed' }}>{fmt(total)}</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {/* Actions */}
                            {isExistingPaidComplete ? (
                                <div
                                    style={{
                                        padding: '12px 14px',
                                        borderRadius: 8,
                                        background: '#ecfdf5',
                                        border: '1px solid #bbf7d0',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: '#065f46',
                                        lineHeight: 1.45,
                                        textAlign: 'center',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
                                        <CheckCircle2 size={16} color="#059669" />
                                        {tm('bBeautyPaidPanelTitle')}
                                    </div>
                                    <span style={{ fontWeight: 600, color: '#047857' }}>{tm('bBeautyPaidNoNewSale')}</span>
                                </div>
                            ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                {!existingAppointment ? (
                                    <button
                                        type="button"
                                        disabled={bookingBusy || !(canSave && canBookApt)}
                                        onClick={tryBookAppointment}
                                        title={tm('bBookingHintTitle')}
                                        style={{
                                            height: 38, borderRadius: 5, border: (canSave && canBookApt && !bookingBusy) ? '2px solid #7c3aed' : '1px solid #e5e7eb',
                                            background: (canSave && canBookApt && !bookingBusy) ? '#fff' : '#f9fafb',
                                            color: (canSave && canBookApt && !bookingBusy) ? '#7c3aed' : '#9ca3af',
                                            fontSize: 11, fontWeight: 800, cursor: (bookingBusy || !(canSave && canBookApt)) ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                        }}
                                    >
                                        <CalendarDays size={13} /> {bookingBusy ? tm('bLoading') : tm('bAppointmentCreate')}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={
                                            updateExistingBusy ||
                                            bookingBusy ||
                                            !canSave ||
                                            !existingEditDirty ||
                                            (serviceLines.length > 0 && !allServicesStaffed) ||
                                            (serviceLines.length > 0 && activeSpecialists.length === 0)
                                        }
                                        onClick={tryUpdateExistingAppointment}
                                        title={tm('bAppointmentUpdateHint')}
                                        style={{
                                            height: 38, borderRadius: 5, border:
                                                existingEditDirty && canSave && !updateExistingBusy && !bookingBusy &&
                                                !(serviceLines.length > 0 && (!allServicesStaffed || activeSpecialists.length === 0))
                                                    ? '2px solid #7c3aed'
                                                    : '1px solid #e5e7eb',
                                            background:
                                                existingEditDirty && canSave && !updateExistingBusy && !bookingBusy &&
                                                !(serviceLines.length > 0 && (!allServicesStaffed || activeSpecialists.length === 0))
                                                    ? '#fff'
                                                    : '#f9fafb',
                                            color:
                                                existingEditDirty && canSave && !updateExistingBusy && !bookingBusy &&
                                                !(serviceLines.length > 0 && (!allServicesStaffed || activeSpecialists.length === 0))
                                                    ? '#7c3aed'
                                                    : '#9ca3af',
                                            fontSize: 11, fontWeight: 800,
                                            cursor:
                                                updateExistingBusy || bookingBusy || !existingEditDirty || !canSave ||
                                                (serviceLines.length > 0 && (!allServicesStaffed || activeSpecialists.length === 0))
                                                    ? 'not-allowed'
                                                    : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                        }}
                                    >
                                        <RefreshCw size={13} /> {updateExistingBusy ? tm('bAppointmentUpdateSaving') : tm('bAppointmentUpdate')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    disabled={bookingBusy}
                                    onClick={tryOpenPay}
                                    style={{
                                        height: 38, borderRadius: 5, border: 'none',
                                        background: (canSave && !bookingBusy) ? '#7c3aed' : '#e5e7eb',
                                        color: (canSave && !bookingBusy) ? '#fff' : '#9ca3af',
                                        fontSize: 11, fontWeight: 800, cursor: (canSave && !bookingBusy) ? 'pointer' : 'not-allowed',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                        transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => { if (canSave && !bookingBusy) e.currentTarget.style.background = '#6d28d9'; }}
                                    onMouseLeave={e => { if (canSave && !bookingBusy) e.currentTarget.style.background = '#7c3aed'; }}
                                >
                                    <Receipt size={13} /> {existingAppointment ? tm('bPaymentCollectComplete') : tm('bPaymentCollect')}
                                </button>
                            </div>
                            )}
                            </div>
                        </div>
                    </div>{/* end scrollable bottom section */}
                </div>
            </div>

            {/* ── Sepet satırı: personel liste modalı — body portal (layout üstünde görünsün) ── */}
            {staffLinePickerUid && (() => {
                const pickLine = cart.find(l => l.uid === staffLinePickerUid);
                if (!pickLine || pickLine.type !== 'service') return null;
                return createPortal(
                    <div
                        role="presentation"
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 2147483640,
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
                    </div>,
                    document.body,
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
                    receiptNumber={receiptNumber}
                    showAutoPrintOption={false}
                    defaultShowReceiptPreview={false}
                    onPrintDraftReceipt={handlePrintDraftFromPaymentModal}
                    onClose={() => setShowPay(false)}
                    onComplete={handlePayComplete}
                />
            )}

            {showReceiptModal && completedSale && completedPaymentData && (
                <Receipt80mm
                    sale={completedSale}
                    paymentData={completedPaymentData}
                    printImmediately={receiptPrintImmediately}
                    initialPrintLanguage={
                        typeof completedPaymentData.language === 'string' ? completedPaymentData.language : 'tr'
                    }
                    headerBanner={receiptHeaderBanner}
                    onClose={() => {
                        setShowReceiptModal(false);
                        setReceiptPrintImmediately(false);
                        setReceiptHeaderBanner(undefined);
                        setCompletedSale(null);
                        setCompletedPaymentData(null);
                        onBack?.();
                    }}
                />
            )}

            <RetailExFlatModal
                open={cancelAptConfirmOpen}
                onClose={() => {
                    if (!cancelAptBusy) setCancelAptConfirmOpen(false);
                }}
                title={tm('bAptCancelConfirmTitle')}
                subtitle={tm('bAptCancelConfirmSubtitle')}
                headerIcon={<AlertTriangle size={22} />}
                maxWidthClass="max-w-md"
                cancelLabel={tm('bAptCancelConfirmNo')}
                confirmLabel={tm('bAptCancelConfirmYes')}
                onConfirm={() => void runToolbarAppointmentCancel()}
                confirmLoading={cancelAptBusy}
                confirmDisabled={cancelAptBusy}
            >
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {tm('bAptCancelConfirmBody')}
                </p>
            </RetailExFlatModal>

            <RetailExFlatModal
                open={!!cartLinePriceUid && isAdmin()}
                onClose={() => setCartLinePriceUid(null)}
                title={tm('bAppointmentEditPriceTitle')}
                subtitle={
                    cartLinePriceUid
                        ? (cart.find(l => l.uid === cartLinePriceUid)?.name ?? undefined)
                        : undefined
                }
                headerIcon={<Banknote size={22} />}
                maxWidthClass="max-w-md"
                cancelLabel={tm('cancel')}
                confirmLabel={tm('save')}
                onConfirm={saveCartLineUnitPrice}
            >
                <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="beauty-pos-cart-line-unit-price">
                        {tm('bAppointmentEditPriceHint')}
                    </label>
                    <input
                        id="beauty-pos-cart-line-unit-price"
                        type="number"
                        min={0}
                        step={0.01}
                        value={cartLinePriceDraft}
                        onChange={e => setCartLinePriceDraft(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                </div>
            </RetailExFlatModal>

            <RetailExFlatModal
                open={!!monthlyModalLine}
                onClose={() => { if (!monthlyBusy) setMonthlyModalLine(null); }}
                title={tm('bMonthlyFromCartTitle')}
                subtitle={monthlyModalLine ? monthlyModalLine.name : undefined}
                headerIcon={<Repeat size={20} />}
                cancelLabel={tm('cancel')}
                confirmLabel={tm('bMonthlySeriesCreate')}
                onConfirm={handleMonthlySeriesFromCartConfirm}
                confirmLoading={monthlyBusy}
                confirmDisabled={
                    monthlyBusy
                    || !customer
                    || !monthlyModalLine
                    || !String(monthlyModalLine.staff_id ?? '').trim()
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {!customer && (
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#b45309', margin: 0, padding: '10px 12px', background: '#fffbeb', borderRadius: 10, border: '1px solid #fcd34d' }}>
                            {tm('bMonthlyCartNeedCustomer')}
                        </p>
                    )}
                    {monthlyModalLine && !String(monthlyModalLine.staff_id ?? '').trim() && (
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#b45309', margin: 0, padding: '10px 12px', background: '#fffbeb', borderRadius: 10, border: '1px solid #fcd34d' }}>
                            {tm('bMonthlyCartNeedStaff')}
                        </p>
                    )}
                    <Field label={tm('bMonthlySeriesFirstDate')}>
                        <input
                            type="date"
                            value={monthlyForm.date}
                            onChange={e => setMonthlyForm(f => ({ ...f, date: e.target.value }))}
                            style={iStyle}
                        />
                    </Field>
                    <div>
                        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: '#64748b', marginBottom: 6 }}>
                            {tm('bMonthlySeriesTime')}
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', margin: 0, lineHeight: 1.5, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                            {tm('bMonthlyTimePolicyD1')}
                        </p>
                    </div>
                    <Field label={tm('bMonthlySeriesSessionCount')}>
                        <input
                            type="number"
                            min={1}
                            max={120}
                            value={monthlyForm.sessions}
                            onChange={e =>
                                setMonthlyForm(f => ({
                                    ...f,
                                    sessions: Math.max(1, Math.round(Number(e.target.value) || 1)),
                                }))
                            }
                            style={iStyle}
                        />
                    </Field>
                    <p style={{ fontSize: 11, color: '#6b7280', margin: 0, lineHeight: 1.45 }}>
                        {tm('bMonthlyFromCartDeviceHint')}
                    </p>
                </div>
            </RetailExFlatModal>

            <RetailExFlatModal
                open={slotSuggestModal.open}
                onClose={() => setSlotSuggestModal((s) => ({ ...s, open: false }))}
                title={slotSuggestModal.title}
                subtitle={slotSuggestModal.subtitle}
                maxWidthClass="max-w-lg"
                headerIcon={<CalendarClock size={20} />}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {slotSuggestModal.sameDeviceSlots.length > 0 && (
                        <div>
                            <p style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', margin: '0 0 8px' }}>
                                {tm('bSlotFreeOnSelection')}
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {slotSuggestModal.sameDeviceSlots.slice(0, 28).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => applySuggestedSlot(t)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: 8,
                                            border: '1px solid #ddd6fe',
                                            background: '#f5f3ff',
                                            color: '#5b21b6',
                                            fontSize: 13,
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {slotSuggestModal.otherDeviceSuggestions.length > 0 && (
                        <div>
                            <p style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', margin: '0 0 8px' }}>
                                {tm('bSlotOnOtherDevices')}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {slotSuggestModal.otherDeviceSuggestions.map((o) => (
                                    <button
                                        key={`${o.deviceId}-${o.time}`}
                                        type="button"
                                        onClick={() => applySuggestedSlot(o.time, o.deviceId)}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '10px 12px',
                                            borderRadius: 10,
                                            border: '1px solid #e5e7eb',
                                            background: '#fafafa',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                        }}
                                    >
                                        <span style={{ fontWeight: 700, color: '#111827' }}>{o.deviceLabel}</span>
                                        <span style={{ fontWeight: 800, color: '#7c3aed' }}>{o.time}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {slotSuggestModal.sameDeviceSlots.length === 0 &&
                        slotSuggestModal.otherDeviceSuggestions.length === 0 && (
                        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{tm('bSlotNoFreeFound')}</p>
                    )}
                </div>
            </RetailExFlatModal>
        </div>
    );
}
