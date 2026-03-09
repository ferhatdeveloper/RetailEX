
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
    ArrowLeft, Plus, Minus, X, Search, User,
    CalendarDays, Clock, CheckCircle2, Scissors, Package,
    Sparkles, Receipt, ChevronDown, ChevronUp
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { AppointmentStatus } from '../../../types/beauty';
import type { BeautyCustomer } from '../../../types/beauty';
import { beautyService } from '../../../services/beautyService';
import { POSPaymentModal } from '../../pos/POSPaymentModal';
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

const STATUS_OPTS = [
    { value: AppointmentStatus.SCHEDULED,  label: 'Planlandı'    },
    { value: AppointmentStatus.CONFIRMED,  label: 'Onaylandı'    },
    { value: AppointmentStatus.IN_PROGRESS, label: 'Devam Ediyor' },
];

const CATEGORY_TR: Record<string, string> = {
    laser:'Lazer', hair_salon:'Kuaför', beauty:'Güzellik',
    botox:'Botoks', filler:'Dolgu', massage:'Masaj',
    skincare:'Cilt', makeup:'Makyaj', nails:'Tırnak', spa:'Spa',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
let _uid = 0;
const uid = () => `line_${++_uid}`;

const fmt = (n: number) =>
    new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', minimumFractionDigits:0 }).format(n);

// ─── Sub-components ───────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
    return (
        <span style={{ fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.09em', display:'block', marginBottom:4 }}>
            {children}
        </span>
    );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div style={{ display:'flex', flexDirection:'column' }}><Label>{label}</Label>{children}</div>;
}
const iStyle: React.CSSProperties = {
    height:34, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:5,
    fontSize:12, fontWeight:500, color:'#111827', background:'#fafafa', outline:'none', width:'100%', boxSizing:'border-box',
};
const selStyle: React.CSSProperties = { ...iStyle, cursor:'pointer' };

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

    // ── Left panel state ─────────────────────────────────────────────────
    const [tab,      setTab]      = useState<'services' | 'packages'>('services');
    const [category, setCategory] = useState('all');
    const [svcQ,     setSvcQ]     = useState('');

    // ── Cart ─────────────────────────────────────────────────────────────
    const [cart,     setCart]     = useState<CartLine[]>([]);
    const [discount, setDiscount] = useState(0);

    // ── Customer ─────────────────────────────────────────────────────────
    const [customer, setCustomer]     = useState<BeautyCustomer | null>(null);
    const [custQ,    setCustQ]        = useState('');
    const [custDrop, setCustDrop]     = useState(false);

    // ── Appointment details ───────────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];
    const [aptDate,   setAptDate]   = useState(prefillDate ?? today);
    const [aptTime,   setAptTime]   = useState(prefillTime ?? '09:00');
    const [aptDevice, setAptDevice] = useState('');
    const [aptNotes,  setAptNotes]  = useState('');
    const [aptStatus, setAptStatus] = useState<AppointmentStatus>(AppointmentStatus.SCHEDULED);
    const [aptOpen,   setAptOpen]   = useState(true);  // section collapse

    // ── Payment modal ─────────────────────────────────────────────────────
    const [showPay,  setShowPay]  = useState(false);

    // ── Done state ────────────────────────────────────────────────────────
    const [doneMsg, setDoneMsg] = useState('');

    useEffect(() => {
        loadServices(); loadPackages(); loadSpecialists();
        loadCustomers(); loadDevices();
    }, []);

    // ── Derived ──────────────────────────────────────────────────────────
    const subtotal = cart.reduce((s, l) => s + l.unit_price * l.qty, 0);
    const discAmt  = subtotal * (discount / 100);
    const total    = subtotal - discAmt;
    const totalDur = cart.filter(l => l.type === 'service').reduce((s, l) => s + (l.duration_min ?? 0) * l.qty, 0);

    const filteredSvcs = useMemo(() => services.filter(s =>
        s.is_active &&
        (category === 'all' || s.category === category) &&
        s.name.toLowerCase().includes(svcQ.toLowerCase())
    ), [services, category, svcQ]);

    const categories = useMemo(() => Array.from(new Set(services.map(s => s.category))), [services]);

    const filteredCusts = useMemo(() =>
        custQ ? customers.filter(c =>
            c.name.toLowerCase().includes(custQ.toLowerCase()) ||
            (c.phone ?? '').includes(custQ)
        ).slice(0, 6) : []
    , [customers, custQ]);

    // ── Cart actions ──────────────────────────────────────────────────────
    const addService = (svc: typeof services[0]) => {
        setCart(c => {
            const ex = c.find(l => l.type === 'service' && l.item_id === svc.id);
            if (ex) return c.map(l => l.uid === ex.uid ? { ...l, qty: l.qty + 1 } : l);
            return [...c, { uid: uid(), type:'service', item_id:svc.id, name:svc.name, unit_price:svc.price, qty:1, color:svc.color, duration_min:svc.duration_min }];
        });
    };
    const addPackage = (pkg: typeof packages[0]) => {
        setCart(c => {
            if (c.find(l => l.type === 'package' && l.item_id === pkg.id)) return c;
            const fp = pkg.price * (1 - (pkg.discount_pct ?? 0) / 100);
            return [...c, { uid: uid(), type:'package', item_id:pkg.id, name:pkg.name, unit_price:fp, qty:1, color:pkg.color }];
        });
    };
    const chgQty  = (uid: string, d: number) => setCart(c => c.map(l => l.uid === uid ? { ...l, qty: Math.max(1, l.qty + d) } : l));
    const remLine = (uid: string) => setCart(c => c.filter(l => l.uid !== uid));
    const setStaff= (uid: string, sid: string) => setCart(c => c.map(l => l.uid === uid ? { ...l, staff_id: sid } : l));
    const clearCart = () => { setCart([]); setCustomer(null); setDiscount(0); };

    // ── Save actions ──────────────────────────────────────────────────────
    const canSave = cart.length > 0 && !!customer;

    const buildAptPayload = () => ({
        customer_id:   customer!.id,
        service_id:    cart.find(l => l.type === 'service')?.item_id,
        staff_id:      cart.find(l => l.type === 'service')?.staff_id,
        device_id:     aptDevice || undefined,
        date:          aptDate,
        appointment_date: aptDate,
        time:          aptTime,
        appointment_time: aptTime,
        duration:      totalDur || 30,
        total_price:   total,
        status:        aptStatus,
        notes:         aptNotes,
        type:          'regular',
        is_package_session: false,
    });

    const handleBookOnly = async () => {
        if (!canSave) return;
        try {
            await createAppointment(buildAptPayload());
            setDoneMsg('Randevu oluşturuldu!');
            setTimeout(() => { setDoneMsg(''); clearCart(); onBack?.(); }, 1400);
        } catch (e) { console.error(e); }
    };

    const handlePayComplete = async (paymentData: any) => {
        if (!canSave) return;
        try {
            await createAppointment({ ...buildAptPayload(), status: AppointmentStatus.CONFIRMED });

            const saleItems = cart.map(line => ({
                item_type:         line.type,
                item_id:           line.item_id,
                name:              line.name,
                quantity:          line.qty,
                unit_price:        line.unit_price,
                discount:          0,
                total:             line.unit_price * line.qty,
                staff_id:          line.staff_id ?? null,
                commission_amount: 0,
            }));
            await beautyService.createSale({
                customer_id:     customer!.id,
                subtotal,
                discount:        discAmt,
                tax:             0,
                total,
                payment_method:  paymentData?.payments?.[0]?.method ?? 'cash',
                payment_status:  'paid',
                paid_amount:     total,
                remaining_amount: 0,
            }, saleItems);

            setDoneMsg('Randevu & Ödeme tamamlandı!');
            setShowPay(false);
            setTimeout(() => { setDoneMsg(''); clearCart(); onBack?.(); }, 1400);
        } catch (e) { console.error(e); }
    };

    // ── Done splash ───────────────────────────────────────────────────────
    if (doneMsg) return (
        <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, background:'#f7f6fb' }}>
            <CheckCircle2 size={56} color="#059669" />
            <p style={{ fontSize:18, fontWeight:800, color:'#111827' }}>{doneMsg}</p>
        </div>
    );

    return (
        <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'#f7f6fb', overflow:'hidden' }}>

            {/* ── TOP BAR ─────────────────────────────────────────── */}
            <div style={{ background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'10px 20px', display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
                {onBack && (
                    <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', border:'1px solid #e5e7eb', borderRadius:5, background:'#f9fafb', color:'#374151', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                        <ArrowLeft size={13} /> Takvim
                    </button>
                )}
                <div>
                    <p style={{ fontSize:14, fontWeight:800, color:'#111827' }}>
                        {onBack ? 'Yeni Randevu & Ödeme' : 'Kasa / POS'}
                    </p>
                    {onBack && (
                        <p style={{ fontSize:11, color:'#9ca3af', fontWeight:500 }}>
                            {new Date(aptDate).toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long' })} · {aptTime}
                        </p>
                    )}
                </div>

                {/* Quick date/time in topbar when coming from calendar */}
                {onBack && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginLeft:'auto' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:5, padding:'4px 10px' }}>
                            <CalendarDays size={12} color="#7c3aed" />
                            <input type="date" value={aptDate} onChange={e => setAptDate(e.target.value)}
                                style={{ border:'none', background:'transparent', fontSize:12, fontWeight:700, color:'#4c1d95', outline:'none' }} />
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:5, padding:'4px 10px' }}>
                            <Clock size={12} color="#7c3aed" />
                            <input type="time" value={aptTime} onChange={e => setAptTime(e.target.value)}
                                style={{ border:'none', background:'transparent', fontSize:12, fontWeight:700, color:'#4c1d95', outline:'none' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* ── BODY ────────────────────────────────────────────── */}
            <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

                {/* ── LEFT: Item grid ─────────────────────────────── */}
                <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', borderRight:'1px solid #e8e4f0' }}>
                    {/* Tabs + search */}
                    <div style={{ background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'10px 14px', flexShrink:0 }}>
                        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                            {([
                                { id:'services', label:'Hizmetler', Icon:Scissors },
                                { id:'packages', label:'Paketler',  Icon:Package  },
                            ] as const).map(({ id, label, Icon }) => (
                                <button key={id} onClick={() => setTab(id)} style={{
                                    display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:5,
                                    border: tab === id ? 'none' : '1px solid #e5e7eb',
                                    background: tab === id ? '#7c3aed' : '#f9fafb',
                                    color: tab === id ? '#fff' : '#6b7280',
                                    fontSize:12, fontWeight:700, cursor:'pointer',
                                }}>
                                    <Icon size={12} />{label}
                                </button>
                            ))}
                            <div style={{ flex:1, position:'relative' }}>
                                <Search size={12} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                                <input value={svcQ} onChange={e => setSvcQ(e.target.value)} placeholder="Hizmet ara..."
                                    style={{ ...iStyle, paddingLeft:26, height:30 }} />
                            </div>
                        </div>
                        {tab === 'services' && (
                            <div style={{ display:'flex', gap:5, overflowX:'auto', scrollbarWidth:'none' }}>
                                {['all', ...categories].map(cat => (
                                    <button key={cat} onClick={() => setCategory(cat)} style={{
                                        flexShrink:0, padding:'3px 9px', borderRadius:4,
                                        border: category === cat ? 'none' : '1px solid #e5e7eb',
                                        background: category === cat ? '#ede9fe' : '#f9fafb',
                                        color: category === cat ? '#7c3aed' : '#6b7280',
                                        fontSize:10, fontWeight:700, cursor:'pointer', textTransform:'uppercase', letterSpacing:'0.05em',
                                    }}>
                                        {cat === 'all' ? 'Tümü' : (CATEGORY_TR[cat] ?? cat)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Grid */}
                    <div style={{ flex:1, overflowY:'auto', padding:12, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(148px,1fr))', gap:8, alignContent:'start' }} className="custom-scrollbar">
                        {tab === 'services' && filteredSvcs.map(svc => (
                            <button key={svc.id} onClick={() => addService(svc)} style={{
                                background:'#fff', border:'1px solid #e8e4f0',
                                borderTop:`3px solid ${svc.color ?? '#7c3aed'}`,
                                borderRadius:7, padding:'10px', textAlign:'left', cursor:'pointer',
                                transition:'box-shadow 0.1s',
                            }}
                                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(124,58,237,0.15)')}
                                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                            >
                                <p style={{ fontSize:12, fontWeight:700, color:'#111827', marginBottom:3, lineHeight:1.3 }}>{svc.name}</p>
                                <p style={{ fontSize:10, fontWeight:600, color:'#9ca3af', marginBottom:6, textTransform:'uppercase' }}>
                                    {CATEGORY_TR[svc.category] ?? svc.category} · {svc.duration_min}dk
                                </p>
                                <p style={{ fontSize:13, fontWeight:800, color: svc.color ?? '#7c3aed' }}>{fmt(svc.price)}</p>
                            </button>
                        ))}
                        {tab === 'packages' && packages.map(pkg => {
                            const fp = pkg.price * (1 - (pkg.discount_pct ?? 0) / 100);
                            return (
                                <button key={pkg.id} onClick={() => addPackage(pkg)} style={{
                                    background:'#fff', border:'1px solid #e8e4f0',
                                    borderTop:`3px solid ${pkg.color ?? '#7c3aed'}`,
                                    borderRadius:7, padding:'10px', textAlign:'left', cursor:'pointer',
                                }}>
                                    <p style={{ fontSize:12, fontWeight:700, color:'#111827', marginBottom:3 }}>{pkg.name}</p>
                                    <p style={{ fontSize:10, fontWeight:600, color:'#9ca3af', marginBottom:6 }}>{pkg.total_sessions} seans · {pkg.validity_days}g</p>
                                    <div style={{ display:'flex', alignItems:'baseline', gap:5 }}>
                                        <span style={{ fontSize:13, fontWeight:800, color: pkg.color ?? '#7c3aed' }}>{fmt(fp)}</span>
                                        {(pkg.discount_pct ?? 0) > 0 && <span style={{ fontSize:10, color:'#9ca3af', textDecoration:'line-through' }}>{fmt(pkg.price)}</span>}
                                    </div>
                                </button>
                            );
                        })}
                        {tab === 'services' && filteredSvcs.length === 0 && (
                            <div style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', alignItems:'center', padding:'40px 0', color:'#d1d5db', gap:8 }}>
                                <Scissors size={28} />
                                <p style={{ fontSize:12, fontWeight:600 }}>Hizmet bulunamadı</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Cart + Appointment + Checkout ─────────── */}
                <div style={{ width:400, display:'flex', flexDirection:'column', background:'#fff', overflow:'hidden' }}>

                    {/* Customer */}
                    <div style={{ padding:'12px 14px', borderBottom:'1px solid #f3f4f6', flexShrink:0, position:'relative' }}>
                        {customer ? (
                            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', background:'#f5f3ff', borderRadius:5, border:'1px solid #ddd6fe' }}>
                                <div style={{ width:28, height:28, background:'#7c3aed', borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:800, flexShrink:0 }}>
                                    {customer.name.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex:1, minWidth:0 }}>
                                    <p style={{ fontSize:12, fontWeight:700, color:'#4c1d95' }}>{customer.name}</p>
                                    {customer.phone && <p style={{ fontSize:10, color:'#7c3aed' }}>{customer.phone}</p>}
                                </div>
                                <button onClick={() => setCustomer(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#a78bfa' }}><X size={13} /></button>
                            </div>
                        ) : (
                            <div style={{ position:'relative' }}>
                                <User size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                                <input value={custQ} onChange={e => { setCustQ(e.target.value); setCustDrop(true); }}
                                    onFocus={() => setCustDrop(true)}
                                    placeholder="Müşteri seç... *"
                                    style={{ ...iStyle, paddingLeft:26, border: canSave ? '1px solid #e5e7eb' : '1px solid #fca5a5' }} />
                                {custDrop && filteredCusts.length > 0 && (
                                    <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #e5e7eb', borderRadius:5, boxShadow:'0 4px 12px rgba(0,0,0,0.08)', zIndex:50, marginTop:2 }}>
                                        {filteredCusts.map(c => (
                                            <button key={c.id} onClick={() => { setCustomer(c); setCustQ(''); setCustDrop(false); }}
                                                style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'7px 12px', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                            >
                                                <span style={{ fontSize:12, fontWeight:700, color:'#111827' }}>{c.name}</span>
                                                {c.phone && <span style={{ fontSize:11, color:'#9ca3af' }}>{c.phone}</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Cart */}
                    <div style={{ flex:1, overflowY:'auto', minHeight:0 }} className="custom-scrollbar">
                        {cart.length === 0 ? (
                            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'#d1d5db', gap:8 }}>
                                <Sparkles size={32} />
                                <p style={{ fontSize:12, fontWeight:600 }}>Hizmet seçin</p>
                            </div>
                        ) : cart.map(line => (
                            <div key={line.uid} style={{ padding:'10px 14px', borderBottom:'1px solid #f3f4f6' }}>
                                <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                                    <div style={{ width:3, height:32, borderRadius:2, background: line.color ?? '#7c3aed', flexShrink:0, marginTop:2 }} />
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                                            <p style={{ fontSize:12, fontWeight:700, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180 }}>{line.name}</p>
                                            <button onClick={() => remLine(line.uid)} style={{ background:'none', border:'none', cursor:'pointer', color:'#d1d5db', flexShrink:0 }}><X size={12} /></button>
                                        </div>
                                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                                            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                                <button onClick={() => chgQty(line.uid, -1)} style={{ width:20, height:20, border:'1px solid #e5e7eb', borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background:'#f9fafb', color:'#6b7280' }}><Minus size={9} /></button>
                                                <span style={{ fontSize:12, fontWeight:700, color:'#374151', minWidth:14, textAlign:'center' }}>{line.qty}</span>
                                                <button onClick={() => chgQty(line.uid, 1)} style={{ width:20, height:20, border:'1px solid #e5e7eb', borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background:'#f9fafb', color:'#6b7280' }}><Plus size={9} /></button>
                                            </div>
                                            <span style={{ fontSize:13, fontWeight:800, color:'#111827' }}>{fmt(line.unit_price * line.qty)}</span>
                                        </div>
                                        {line.type === 'service' && (
                                            <select value={line.staff_id ?? ''} onChange={e => setStaff(line.uid, e.target.value)}
                                                style={{ marginTop:5, width:'100%', height:24, fontSize:11, fontWeight:600, color:'#6b7280', border:'1px solid #e5e7eb', borderRadius:3, paddingLeft:5, background:'#fafafa', outline:'none' }}>
                                                <option value="">Uzman ata...</option>
                                                {specialists.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </select>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Appointment details + totals — scrollable bottom section */}
                    <div style={{ borderTop:'1px solid #e5e7eb', flexShrink:0, overflowY:'auto', maxHeight:'55%' }} className="custom-scrollbar">

                    {/* Appointment details (collapsible) */}
                    <div style={{ borderTop:'none' }}>
                        <button
                            onClick={() => setAptOpen(o => !o)}
                            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', background:'none', border:'none', cursor:'pointer' }}
                        >
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <CalendarDays size={13} color="#7c3aed" />
                                <span style={{ fontSize:12, fontWeight:700, color:'#374151' }}>Randevu Detayları</span>
                                {totalDur > 0 && <span style={{ fontSize:10, fontWeight:600, color:'#9ca3af' }}>· {totalDur}dk</span>}
                            </div>
                            {aptOpen ? <ChevronUp size={14} color="#9ca3af" /> : <ChevronDown size={14} color="#9ca3af" />}
                        </button>

                        {aptOpen && (
                            <div style={{ padding:'0 14px 12px', display:'flex', flexDirection:'column', gap:8 }}>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                                    <Field label="Tarih">
                                        <input type="date" value={aptDate} onChange={e => setAptDate(e.target.value)} style={iStyle} />
                                    </Field>
                                    <Field label="Saat">
                                        <input type="time" value={aptTime} onChange={e => setAptTime(e.target.value)} style={iStyle} />
                                    </Field>
                                </div>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
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
                                        style={{ ...iStyle, height:'auto', padding:'6px 10px', resize:'none', lineHeight:1.5 }} />
                                </Field>
                            </div>
                        )}
                    </div>

                    {/* Totals + Checkout */}
                    <div style={{ borderTop:'1px solid #e5e7eb', padding:'12px 14px', flexShrink:0 }}>
                        {/* Discount */}
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                            <span style={{ fontSize:11, fontWeight:600, color:'#6b7280' }}>İndirim (%)</span>
                            <input type="number" min={0} max={100} value={discount} onChange={e => setDiscount(Number(e.target.value))}
                                style={{ width:52, height:26, textAlign:'right', border:'1px solid #e5e7eb', borderRadius:4, fontSize:12, fontWeight:700, paddingRight:5, outline:'none' }} />
                        </div>

                        {/* Summary */}
                        <div style={{ background:'#f7f6fb', borderRadius:5, padding:'8px 10px', marginBottom:10 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                                <span style={{ fontSize:11, color:'#9ca3af', fontWeight:600 }}>Ara toplam</span>
                                <span style={{ fontSize:12, fontWeight:700, color:'#374151' }}>{fmt(subtotal)}</span>
                            </div>
                            {discount > 0 && (
                                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                                    <span style={{ fontSize:11, color:'#dc2626', fontWeight:600 }}>İndirim -%{discount}</span>
                                    <span style={{ fontSize:12, fontWeight:700, color:'#dc2626' }}>-{fmt(discAmt)}</span>
                                </div>
                            )}
                            <div style={{ display:'flex', justifyContent:'space-between', borderTop:'1px solid #e8e4f0', paddingTop:6 }}>
                                <span style={{ fontSize:12, fontWeight:800, color:'#111827' }}>Toplam</span>
                                <span style={{ fontSize:15, fontWeight:800, color:'#7c3aed' }}>{fmt(total)}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                            {/* Book only */}
                            <button onClick={handleBookOnly} disabled={!canSave} style={{
                                height:38, borderRadius:5, border: canSave ? '2px solid #7c3aed' : '1px solid #e5e7eb',
                                background: canSave ? '#fff' : '#f9fafb',
                                color: canSave ? '#7c3aed' : '#9ca3af',
                                fontSize:11, fontWeight:800, cursor: canSave ? 'pointer' : 'not-allowed',
                                display:'flex', alignItems:'center', justifyContent:'center', gap:5,
                            }}>
                                <CalendarDays size={13} /> Randevu Oluştur
                            </button>
                            {/* Pay + book */}
                            <button onClick={() => canSave && setShowPay(true)} disabled={!canSave} style={{
                                height:38, borderRadius:5, border:'none',
                                background: canSave ? '#7c3aed' : '#e5e7eb',
                                color: canSave ? '#fff' : '#9ca3af',
                                fontSize:11, fontWeight:800, cursor: canSave ? 'pointer' : 'not-allowed',
                                display:'flex', alignItems:'center', justifyContent:'center', gap:5,
                                transition:'background 0.1s',
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
