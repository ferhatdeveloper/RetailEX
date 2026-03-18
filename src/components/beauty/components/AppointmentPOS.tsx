
/**
 * AppointmentPOS — Randevu + Kasa birleşik sayfası
 *
 * Sol  : Hizmet / Paket seçim grid'i
 * Sağ  : Sepet (staff ataması) + Randevu detayı (tarih/saat/cihaz/notlar) + Ödeme
 *
 * İki ayrı akış:
 *   [Randevu Oluştur] → sadece randevu kaydeder, ödeme sonraya
 *   [Ödeme Tamamla]   → randevu + satış kaydı birlikte
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
    ArrowLeft, Plus, Minus, X, Search, User, UserPlus,
    CalendarDays, Clock, CheckCircle2, Scissors, Package,
    Sparkles, Receipt, ChevronDown, ChevronUp, MoreHorizontal
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { AppointmentStatus } from '../../../types/beauty';
import type { BeautyCustomer } from '../../../types/beauty';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import { POSPaymentModal } from '../../pos/POSPaymentModal';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import '../ClinicStyles.css';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CartLine {
    uid: string;
    type: 'service' | 'package';
    item_id: string;
    name: string;
    unit_price: number;
    qty: number;
    staff_id?: string;
    color?: string;
    duration_min?: number;
}


// ─── Helpers ─────────────────────────────────────────────────────────────────
let _uid = 0;
const uid = () => `line_${++_uid}`;

const fmt = (n: number) => formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });

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
    onBack?: () => void;      // undefined = standalone POS mode
}

export function AppointmentPOS({ prefillDate, prefillTime, onBack }: Props) {
    const {
        services, packages, specialists, customers, devices,
        loadServices, loadPackages, loadSpecialists, loadCustomers, loadDevices,
        createAppointment,
    } = useBeautyStore();
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
    const [tab, setTab] = useState<'services' | 'packages'>('services');
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

    // ── Appointment details ───────────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];
    const [aptDate, setAptDate] = useState(prefillDate ?? today);
    const [aptTime, setAptTime] = useState(prefillTime ?? '09:00');
    const [aptDevice, setAptDevice] = useState('');
    const [aptNotes, setAptNotes] = useState('');
    const [aptStatus, setAptStatus] = useState<AppointmentStatus>(AppointmentStatus.SCHEDULED);
    const [aptOpen, setAptOpen] = useState(true);  // section collapse

    // ── Payment modal ─────────────────────────────────────────────────────
    const [showPay, setShowPay] = useState(false);

    // ── Done state ────────────────────────────────────────────────────────
    const [doneMsg, setDoneMsg] = useState('');

    useEffect(() => {
        loadServices(); loadPackages(); loadSpecialists();
        loadCustomers(); loadDevices();
    }, []);

    // ── Derived ──────────────────────────────────────────────────────────
    const subtotal = cart.reduce((s, l) => s + l.unit_price * l.qty, 0);
    const discAmt = subtotal * (discount / 100);
    const total = subtotal - discAmt;
    const totalDur = cart.filter(l => l.type === 'service').reduce((s, l) => s + (l.duration_min ?? 0) * l.qty, 0);

    const filteredSvcs = useMemo(() => services.filter(s =>
        s.is_active &&
        (category === 'all' || s.category === category) &&
        s.name.toLowerCase().includes(svcQ.toLowerCase())
    ), [services, category, svcQ]);

    const categories = useMemo(() => Array.from(new Set(services.map(s => s.category))), [services]);

    const filteredCusts = useMemo(() => {
        const q = custModalQ.toLowerCase();
        if (!q) return customers;
        return customers.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.phone ?? '').includes(custModalQ)
        );
    }, [customers, custModalQ]);

    const handleSaveNewCustomer = async () => {
        if (!newCust.name.trim()) return;
        setSavingCust(true);
        try {
            const id = await beautyService.createCustomer({ name: newCust.name.trim(), phone: newCust.phone.trim() || undefined, email: newCust.email.trim() || undefined, is_active: true });
            await loadCustomers();
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
            return [...c, { uid: uid(), type: 'service', item_id: svc.id, name: svc.name, unit_price: svc.price, qty: 1, color: svc.color, duration_min: svc.duration_min }];
        });
    };
    const addPackage = (pkg: typeof packages[0]) => {
        setCart(c => {
            if (c.find(l => l.type === 'package' && l.item_id === pkg.id)) return c;
            const fp = pkg.price * (1 - (pkg.discount_pct ?? 0) / 100);
            return [...c, { uid: uid(), type: 'package', item_id: pkg.id, name: pkg.name, unit_price: fp, qty: 1, color: pkg.color }];
        });
    };
    const chgQty = (uid: string, d: number) => setCart(c => c.map(l => l.uid === uid ? { ...l, qty: Math.max(1, l.qty + d) } : l));
    const remLine = (uid: string) => setCart(c => c.filter(l => l.uid !== uid));
    const setStaff = (uid: string, sid: string) => setCart(c => c.map(l => l.uid === uid ? { ...l, staff_id: sid } : l));
    const clearCart = () => { setCart([]); setCustomer(null); setDiscount(0); };

    // ── Save actions ──────────────────────────────────────────────────────
    const canSave = cart.length > 0 && !!customer;

    const buildAptPayload = () => ({
        customer_id: customer!.id,
        service_id: cart.find(l => l.type === 'service')?.item_id,
        staff_id: cart.find(l => l.type === 'service')?.staff_id,
        device_id: aptDevice || undefined,
        date: aptDate,
        appointment_date: aptDate,
        time: aptTime,
        appointment_time: aptTime,
        duration: totalDur || 30,
        total_price: total,
        status: aptStatus,
        notes: aptNotes,
        type: 'regular',
        is_package_session: false,
    });

    const handleBookOnly = async () => {
        if (!canSave) return;
        try {
            await createAppointment(buildAptPayload());
            setDoneMsg(tm('bAppointmentCreated'));
            setTimeout(() => { setDoneMsg(''); clearCart(); onBack?.(); }, 1400);
        } catch (e) { logger.crudError('AppointmentPOS', 'bookAppointment', e); }
    };

    const handlePayComplete = async (paymentData: any) => {
        if (!canSave) return;
        try {
            await createAppointment({ ...buildAptPayload(), status: AppointmentStatus.CONFIRMED });

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

            setDoneMsg(tm('bPaymentCompleted'));
            setShowPay(false);
            setTimeout(() => { setDoneMsg(''); clearCart(); onBack?.(); }, 1400);
        } catch (e) { logger.crudError('AppointmentPOS', 'payAndBook', e); }
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

            {/* ── TOP BAR ─────────────────────────────────────────── */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                {onBack && (
                    <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 5, background: '#f9fafb', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        <ArrowLeft size={13} /> Takvim
                    </button>
                )}
                <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>
                        {onBack ? tm('bAppointmentPOS') : 'Kasa / POS'}
                    </p>
                    {onBack && (
                        <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>
                            {new Date(aptDate).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} · {aptTime}
                        </p>
                    )}
                </div>

                {/* Quick date/time in topbar when coming from calendar */}
                {onBack && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
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
                    </div>
                )}
            </div>

            {/* ── BODY ────────────────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* ── LEFT: Item grid ─────────────────────────────── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #e8e4f0' }}>
                    {/* Tabs + search */}
                    <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 14px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            {([
                                { id: 'services', label: 'Hizmetler', Icon: Scissors },
                                { id: 'packages', label: 'Paketler', Icon: Package },
                            ] as const).map(({ id, label, Icon }) => (
                                <button key={id} onClick={() => setTab(id)} style={{
                                    display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 5,
                                    border: tab === id ? 'none' : '1px solid #e5e7eb',
                                    background: tab === id ? '#7c3aed' : '#f9fafb',
                                    color: tab === id ? '#fff' : '#6b7280',
                                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                }}>
                                    <Icon size={12} />{label}
                                </button>
                            ))}
                            <div style={{ flex: 1, position: 'relative' }}>
                                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                <input value={svcQ} onChange={e => setSvcQ(e.target.value)} placeholder="Hizmet ara..."
                                    style={{ ...iStyle, paddingLeft: 26, height: 30 }} />
                            </div>
                        </div>
                        {tab === 'services' && (
                            <div style={{ display: 'flex', gap: 5, overflowX: 'auto', scrollbarWidth: 'none' }}>
                                {['all', ...categories].map(cat => (
                                    <button key={cat} onClick={() => setCategory(cat)} style={{
                                        flexShrink: 0, padding: '3px 9px', borderRadius: 4,
                                        border: category === cat ? 'none' : '1px solid #e5e7eb',
                                        background: category === cat ? '#ede9fe' : '#f9fafb',
                                        color: category === cat ? '#7c3aed' : '#6b7280',
                                        fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                                    }}>
                                        {cat === 'all' ? tm('bAll') : (CATEGORY_TR[cat] ?? cat)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Grid */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px,1fr))', gap: 8, alignContent: 'start' }} className="custom-scrollbar">
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
                        {tab === 'packages' && packages.map(pkg => {
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
                        {tab === 'services' && filteredSvcs.length === 0 && (
                            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', color: '#d1d5db', gap: 8 }}>
                                <Scissors size={28} />
                                <p style={{ fontSize: 12, fontWeight: 600 }}>Hizmet bulunamadı</p>
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
                                <p style={{ fontSize: 12, fontWeight: 600 }}>Hizmet seçin</p>
                            </div>
                        ) : cart.map(line => (
                            <div key={line.uid} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ width: 3, height: 32, borderRadius: 2, background: line.color ?? '#7c3aed', flexShrink: 0, marginTop: 2 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                                            <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{line.name}</p>
                                            <button onClick={() => remLine(line.uid)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', flexShrink: 0 }}><X size={12} /></button>
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
                                            <select value={line.staff_id ?? ''} onChange={e => setStaff(line.uid, e.target.value)}
                                                style={{ marginTop: 5, width: '100%', height: 24, fontSize: 11, fontWeight: 600, color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 3, paddingLeft: 5, background: '#fafafa', outline: 'none' }}>
                                                <option value="">Uzman ata...</option>
                                                {specialists.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </select>
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
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        <Field label="Tarih">
                                            <input type="date" value={aptDate} onChange={e => setAptDate(e.target.value)} style={iStyle} />
                                        </Field>
                                        <Field label="Saat">
                                            <input type="time" value={aptTime} onChange={e => setAptTime(e.target.value)} style={iStyle} />
                                        </Field>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        <Field label="Cihaz">
                                            <select value={aptDevice} onChange={e => setAptDevice(e.target.value)} style={selStyle}>
                                                <option value="">Seçin...</option>
                                                {devices.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                        </Field>
                                        <Field label="Durum">
                                            <select value={aptStatus} onChange={e => setAptStatus(e.target.value as AppointmentStatus)} style={selStyle}>
                                                {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </Field>
                                    </div>
                                    <Field label="Notlar">
                                        <textarea value={aptNotes} onChange={e => setAptNotes(e.target.value)}
                                            placeholder="Özel istek, not..."
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

                            {/* Actions */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <button onClick={handleBookOnly} disabled={!canSave} style={{
                                    height: 38, borderRadius: 5, border: canSave ? '2px solid #7c3aed' : '1px solid #e5e7eb',
                                    background: canSave ? '#fff' : '#f9fafb',
                                    color: canSave ? '#7c3aed' : '#9ca3af',
                                    fontSize: 11, fontWeight: 800, cursor: canSave ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                }}>
                                    <CalendarDays size={13} /> Randevu Oluştur
                                </button>
                                <button onClick={() => canSave && setShowPay(true)} disabled={!canSave} style={{
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
                                    <Receipt size={13} /> Ödeme Al
                                </button>
                            </div>
                        </div>
                    </div>{/* end scrollable bottom section */}
                </div>
            </div>

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
