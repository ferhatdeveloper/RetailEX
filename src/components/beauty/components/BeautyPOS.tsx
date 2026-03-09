
import React, { useEffect, useState, useMemo } from 'react';
import {
    Search, Plus, Trash2, User, UserPlus, X,
    Banknote, CreditCard, ArrowLeftRight,
    CheckCircle2, ChevronDown, Scissors, Package, Box,
    ShoppingCart, Receipt, Minus
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import type { BeautyService, BeautyCustomer, BeautySpecialist } from '../../../types/beauty';
import '../ClinicStyles.css';

// ─── Types ──────────────────────────────────────────────────────────────────
interface CartItem {
    id: string;         // temp id
    type: 'service' | 'package';
    item_id: string;
    name: string;
    price: number;
    qty: number;
    staff_id?: string;
    color?: string;
}

type PayMethod = 'cash' | 'card' | 'transfer';

const PAY_LABELS: Record<PayMethod, string> = {
    cash: 'Nakit', card: 'Kart', transfer: 'Havale',
};
const PAY_ICONS: Record<PayMethod, React.ElementType> = {
    cash: Banknote, card: CreditCard, transfer: ArrowLeftRight,
};

const CATEGORY_TR: Record<string, string> = {
    laser: 'Lazer', hair_salon: 'Kuaför', beauty: 'Güzellik',
    botox: 'Botoks', filler: 'Dolgu', massage: 'Masaj',
    skincare: 'Cilt', makeup: 'Makyaj', nails: 'Tırnak', spa: 'Spa',
};

let _itemId = 0;
const nextId = () => `pos_${++_itemId}`;

const fmt = (n: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(n);

// ─── Component ──────────────────────────────────────────────────────────────
export function BeautyPOS() {
    const {
        services, packages, specialists, customers,
        loadServices, loadPackages, loadSpecialists, loadCustomers,
    } = useBeautyStore();

    const [tab,         setTab]         = useState<'services' | 'packages'>('services');
    const [category,    setCategory]    = useState<string>('all');
    const [svcSearch,   setSvcSearch]   = useState('');

    const [cart,        setCart]        = useState<CartItem[]>([]);
    const [discount,    setDiscount]    = useState(0);
    const [payMethod,   setPayMethod]   = useState<PayMethod>('cash');
    const [paidInput,   setPaidInput]   = useState('');

    const [customer,    setCustomer]    = useState<BeautyCustomer | null>(null);
    const [custSearch,  setCustSearch]  = useState('');
    const [showCustDrop, setShowCustDrop] = useState(false);

    const [showPayModal, setShowPayModal] = useState(false);
    const [done,         setDone]        = useState(false);

    useEffect(() => {
        loadServices();
        loadPackages();
        loadSpecialists();
        loadCustomers();
    }, []);

    // ── Cart math ──────────────────────────────────────────────────────────
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const discAmt  = subtotal * (discount / 100);
    const total    = subtotal - discAmt;
    const paid     = parseFloat(paidInput) || 0;
    const change   = paid - total;

    // ── Filtered services ──────────────────────────────────────────────────
    const filteredSvcs = useMemo(() => {
        return services.filter(s => {
            const matchCat  = category === 'all' || s.category === category;
            const matchName = s.name.toLowerCase().includes(svcSearch.toLowerCase());
            return s.is_active && matchCat && matchName;
        });
    }, [services, category, svcSearch]);

    const categories = useMemo(() => {
        const cats = Array.from(new Set(services.map(s => s.category)));
        return cats;
    }, [services]);

    const filteredCusts = useMemo(() => {
        if (!custSearch) return [];
        return customers.filter(c =>
            c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
            (c.phone ?? '').includes(custSearch)
        ).slice(0, 6);
    }, [customers, custSearch]);

    // ── Cart actions ───────────────────────────────────────────────────────
    const addService = (svc: BeautyService) => {
        setCart(c => {
            const existing = c.find(i => i.type === 'service' && i.item_id === svc.id);
            if (existing) return c.map(i => i.item_id === svc.id && i.type === 'service' ? { ...i, qty: i.qty + 1 } : i);
            return [...c, { id: nextId(), type: 'service', item_id: svc.id, name: svc.name, price: svc.price, qty: 1, color: svc.color }];
        });
    };

    const addPackage = (pkg: typeof packages[0]) => {
        setCart(c => {
            const existing = c.find(i => i.type === 'package' && i.item_id === pkg.id);
            if (existing) return c;
            const fp = pkg.price * (1 - (pkg.discount_pct ?? 0) / 100);
            return [...c, { id: nextId(), type: 'package', item_id: pkg.id, name: pkg.name, price: fp, qty: 1, color: pkg.color }];
        });
    };

    const changeQty = (id: string, delta: number) => {
        setCart(c => c.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i).filter(i => i.qty > 0));
    };

    const removeItem = (id: string) => setCart(c => c.filter(i => i.id !== id));

    const assignStaff = (cartId: string, staffId: string) => {
        setCart(c => c.map(i => i.id === cartId ? { ...i, staff_id: staffId } : i));
    };

    const clearCart = () => { setCart([]); setCustomer(null); setDiscount(0); setPaidInput(''); };

    const handleComplete = () => {
        // TODO: call beautyService.createSale()
        setDone(true);
        setShowPayModal(false);
        setTimeout(() => { setDone(false); clearCart(); }, 2000);
    };

    if (done) {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#f7f6fb' }}>
                <CheckCircle2 size={64} style={{ color: '#059669' }} />
                <p style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>Ödeme Tamamlandı!</p>
                <p style={{ fontSize: 13, color: '#6b7280' }}>Kasa sıfırlanıyor...</p>
            </div>
        );
    }

    return (
        <div style={{ height: '100%', display: 'flex', overflow: 'hidden', background: '#f7f6fb' }}>

            {/* ── LEFT: Product Grid ──────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #e8e4f0' }}>

                {/* Tab + Search */}
                <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {(['services', 'packages'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '6px 14px', borderRadius: 6,
                                    border: tab === t ? 'none' : '1px solid #e5e7eb',
                                    background: tab === t ? '#7c3aed' : '#fff',
                                    color: tab === t ? '#fff' : '#6b7280',
                                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                }}
                            >
                                {t === 'services' ? <Scissors size={13} /> : <Package size={13} />}
                                {t === 'services' ? 'Hizmetler' : 'Paketler'}
                            </button>
                        ))}
                        <div style={{ flex: 1, position: 'relative' }}>
                            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                            <input
                                value={svcSearch} onChange={e => setSvcSearch(e.target.value)}
                                placeholder="Ara..."
                                style={{ width: '100%', height: 32, paddingLeft: 28, paddingRight: 12, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontWeight: 500, background: '#f9fafb', outline: 'none' }}
                            />
                        </div>
                    </div>

                    {tab === 'services' && (
                        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
                            {['all', ...categories].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setCategory(cat)}
                                    style={{
                                        flexShrink: 0, padding: '4px 10px', borderRadius: 4,
                                        border: category === cat ? 'none' : '1px solid #e5e7eb',
                                        background: category === cat ? '#ede9fe' : '#f9fafb',
                                        color: category === cat ? '#7c3aed' : '#6b7280',
                                        fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                                    }}
                                >
                                    {cat === 'all' ? 'Tümü' : (CATEGORY_TR[cat] ?? cat)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Grid */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, alignContent: 'start' }} className="custom-scrollbar">
                    {tab === 'services' && filteredSvcs.map(svc => (
                        <button
                            key={svc.id}
                            onClick={() => addService(svc)}
                            style={{
                                background: '#fff', border: '1px solid #e8e4f0',
                                borderTop: `3px solid ${svc.color ?? '#7c3aed'}`,
                                borderRadius: 8, padding: '12px', textAlign: 'left',
                                cursor: 'pointer', transition: 'border-color 0.1s, box-shadow 0.1s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = svc.color ?? '#7c3aed'; e.currentTarget.style.boxShadow = `0 0 0 2px ${svc.color ?? '#7c3aed'}20`; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e4f0'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 4, lineHeight: 1.3 }}>{svc.name}</p>
                            <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{CATEGORY_TR[svc.category] ?? svc.category} · {svc.duration_min}dk</p>
                            <p style={{ fontSize: 14, fontWeight: 800, color: svc.color ?? '#7c3aed' }}>{fmt(svc.price)}</p>
                        </button>
                    ))}

                    {tab === 'packages' && packages.map(pkg => {
                        const fp = pkg.price * (1 - (pkg.discount_pct ?? 0) / 100);
                        return (
                            <button
                                key={pkg.id}
                                onClick={() => addPackage(pkg)}
                                style={{
                                    background: '#fff', border: '1px solid #e8e4f0',
                                    borderTop: `3px solid ${pkg.color ?? '#7c3aed'}`,
                                    borderRadius: 8, padding: '12px', textAlign: 'left',
                                    cursor: 'pointer',
                                }}
                            >
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{pkg.name}</p>
                                <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>{pkg.total_sessions} seans · {pkg.validity_days}gün geçerli</p>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                    <span style={{ fontSize: 14, fontWeight: 800, color: pkg.color ?? '#7c3aed' }}>{fmt(fp)}</span>
                                    {(pkg.discount_pct ?? 0) > 0 && (
                                        <span style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'line-through' }}>{fmt(pkg.price)}</span>
                                    )}
                                </div>
                            </button>
                        );
                    })}

                    {tab === 'services' && filteredSvcs.length === 0 && (
                        <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#9ca3af' }}>
                            <Scissors size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                            <p style={{ fontSize: 12, fontWeight: 600 }}>Hizmet bulunamadı</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── RIGHT: Cart ─────────────────────────────────────────── */}
            <div style={{ width: 380, display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0 }}>

                {/* Cart header */}
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ShoppingCart size={16} style={{ color: '#7c3aed' }} />
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>Sepet</span>
                        {cart.length > 0 && (
                            <span style={{ background: '#7c3aed', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10 }}>{cart.reduce((s, i) => s + i.qty, 0)}</span>
                        )}
                    </div>
                    {cart.length > 0 && (
                        <button onClick={clearCart} style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fee2e2', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                            Temizle
                        </button>
                    )}
                </div>

                {/* Customer */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', position: 'relative' }}>
                    {customer ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f5f3ff', borderRadius: 6, border: '1px solid #ddd6fe' }}>
                            <div style={{ width: 28, height: 28, background: '#7c3aed', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                                {customer.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#4c1d95' }}>{customer.name}</p>
                                {customer.phone && <p style={{ fontSize: 10, color: '#7c3aed' }}>{customer.phone}</p>}
                            </div>
                            <button onClick={() => setCustomer(null)} style={{ color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} /></button>
                        </div>
                    ) : (
                        <div style={{ position: 'relative' }}>
                            <User size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                            <input
                                value={custSearch}
                                onChange={e => { setCustSearch(e.target.value); setShowCustDrop(true); }}
                                onFocus={() => setShowCustDrop(true)}
                                placeholder="Müşteri ara..."
                                style={{ width: '100%', height: 34, paddingLeft: 28, paddingRight: 12, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontWeight: 500, outline: 'none', boxSizing: 'border-box' }}
                            />
                            {showCustDrop && filteredCusts.length > 0 && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 50, marginTop: 2 }}>
                                    {filteredCusts.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => { setCustomer(c); setCustSearch(''); setShowCustDrop(false); }}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                        >
                                            <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{c.name}</span>
                                            {c.phone && <span style={{ fontSize: 11, color: '#9ca3af' }}>{c.phone}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Cart items */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }} className="custom-scrollbar">
                    {cart.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#d1d5db', gap: 8 }}>
                            <ShoppingCart size={36} />
                            <p style={{ fontSize: 12, fontWeight: 600 }}>Sepet boş</p>
                        </div>
                    ) : cart.map(item => (
                        <div key={item.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f9fafb' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                {/* Color tag */}
                                <div style={{ width: 3, height: 36, borderRadius: 2, background: item.color ?? '#7c3aed', flexShrink: 0, marginTop: 2 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{item.name}</p>
                                        <button onClick={() => removeItem(item.id)} style={{ color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                                            <X size={13} />
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        {/* Qty */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <button onClick={() => changeQty(item.id, -1)} style={{ width: 22, height: 22, border: '1px solid #e5e7eb', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f9fafb', color: '#6b7280' }}><Minus size={10} /></button>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
                                            <button onClick={() => changeQty(item.id, 1)} style={{ width: 22, height: 22, border: '1px solid #e5e7eb', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f9fafb', color: '#6b7280' }}><Plus size={10} /></button>
                                        </div>
                                        {/* Price */}
                                        <span style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>{fmt(item.price * item.qty)}</span>
                                    </div>
                                    {/* Staff assign (services only) */}
                                    {item.type === 'service' && (
                                        <select
                                            value={item.staff_id ?? ''}
                                            onChange={e => assignStaff(item.id, e.target.value)}
                                            style={{ marginTop: 6, width: '100%', height: 26, fontSize: 11, fontWeight: 600, color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 4, paddingLeft: 6, background: '#fafafa', outline: 'none' }}
                                        >
                                            <option value="">Uzman atama...</option>
                                            {specialists.filter(s => s.is_active).map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Totals & Checkout */}
                <div style={{ borderTop: '1px solid #e5e7eb', padding: '14px 16px', flexShrink: 0 }}>
                    {/* Discount */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>İndirim (%)</span>
                        <input
                            type="number" min={0} max={100} value={discount}
                            onChange={e => setDiscount(Number(e.target.value))}
                            style={{ width: 60, height: 28, textAlign: 'right', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 12, fontWeight: 700, paddingRight: 6, outline: 'none' }}
                        />
                    </div>

                    {/* Summary */}
                    <div style={{ background: '#f7f6fb', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Ara toplam</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{fmt(subtotal)}</span>
                        </div>
                        {discount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>İndirim -%{discount}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>-{fmt(discAmt)}</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e8e4f0', paddingTop: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>Toplam</span>
                            <span style={{ fontSize: 16, fontWeight: 800, color: '#7c3aed' }}>{fmt(total)}</span>
                        </div>
                    </div>

                    {/* Payment method */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        {(['cash', 'card', 'transfer'] as PayMethod[]).map(m => {
                            const Icon = PAY_ICONS[m];
                            const active = payMethod === m;
                            return (
                                <button
                                    key={m}
                                    onClick={() => setPayMethod(m)}
                                    style={{
                                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                        padding: '8px 6px', borderRadius: 6, cursor: 'pointer',
                                        border: active ? '2px solid #7c3aed' : '1px solid #e5e7eb',
                                        background: active ? '#f5f3ff' : '#f9fafb',
                                        color: active ? '#7c3aed' : '#6b7280',
                                    }}
                                >
                                    <Icon size={16} />
                                    <span style={{ fontSize: 10, fontWeight: 700 }}>{PAY_LABELS[m]}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* CTA */}
                    <button
                        onClick={() => cart.length > 0 && setShowPayModal(true)}
                        disabled={cart.length === 0}
                        style={{
                            width: '100%', height: 44, borderRadius: 6,
                            background: cart.length === 0 ? '#e5e7eb' : '#7c3aed',
                            color: cart.length === 0 ? '#9ca3af' : '#fff',
                            border: 'none', fontSize: 13, fontWeight: 800,
                            cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            letterSpacing: '0.02em',
                            transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => { if (cart.length > 0) e.currentTarget.style.background = '#6d28d9'; }}
                        onMouseLeave={e => { if (cart.length > 0) e.currentTarget.style.background = '#7c3aed'; }}
                    >
                        <Receipt size={16} />
                        Ödeme Al · {fmt(total)}
                    </button>
                </div>
            </div>

            {/* ── PAYMENT MODAL ───────────────────────────────────────── */}
            {showPayModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
                    <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>Ödeme Al</p>
                            <button onClick={() => setShowPayModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
                        </div>
                        <div style={{ padding: '20px' }}>
                            {/* Summary box */}
                            <div style={{ background: '#f7f6fb', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Toplam</span>
                                    <span style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed' }}>{fmt(total)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Yöntem</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{PAY_LABELS[payMethod]}</span>
                                </div>
                            </div>

                            {/* Paid input */}
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                                    {payMethod === 'cash' ? 'Alınan Nakit' : 'Tutar'}
                                </label>
                                <input
                                    type="number" value={paidInput} onChange={e => setPaidInput(e.target.value)}
                                    placeholder={fmt(total)}
                                    style={{ width: '100%', height: 44, fontSize: 16, fontWeight: 800, textAlign: 'right', border: '2px solid #7c3aed', borderRadius: 8, paddingRight: 12, outline: 'none', boxSizing: 'border-box', color: '#111827' }}
                                />
                                {/* Quick amounts */}
                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    {[total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500].filter((v, i, a) => a.indexOf(v) === i).map(v => (
                                        <button key={v} onClick={() => setPaidInput(String(v))} style={{ flex: 1, height: 30, borderRadius: 4, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 11, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>
                                            {fmt(v)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Change/Remaining */}
                            {paidInput && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: 6, marginBottom: 16,
                                    background: change >= 0 ? '#d1fae5' : '#fee2e2',
                                    border: `1px solid ${change >= 0 ? '#a7f3d0' : '#fca5a5'}`,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: change >= 0 ? '#065f46' : '#991b1b' }}>
                                        {change >= 0 ? 'Para Üstü' : 'Kalan Tutar'}
                                    </span>
                                    <span style={{ fontSize: 14, fontWeight: 800, color: change >= 0 ? '#059669' : '#dc2626' }}>
                                        {fmt(Math.abs(change))}
                                    </span>
                                </div>
                            )}

                            <button
                                onClick={handleComplete}
                                disabled={payMethod !== 'cash' ? false : (paid < total)}
                                style={{
                                    width: '100%', height: 44, borderRadius: 6, border: 'none',
                                    background: (payMethod !== 'cash' || paid >= total) ? '#059669' : '#e5e7eb',
                                    color: (payMethod !== 'cash' || paid >= total) ? '#fff' : '#9ca3af',
                                    fontSize: 13, fontWeight: 800, cursor: (payMethod !== 'cash' || paid >= total) ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                }}
                            >
                                <CheckCircle2 size={16} /> Ödemeyi Tamamla
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
