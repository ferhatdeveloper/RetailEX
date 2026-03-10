import React, { useEffect, useState } from 'react';
import {
    Users, Search, Plus, Phone, Mail, Calendar,
    CreditCard, ChevronRight, Star, X, Save, Edit2,
    MapPin, FileText, TrendingUp, Package, CheckCircle2
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBeautyStore } from '../store/useBeautyStore';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import type { BeautyCustomer, BeautyPackagePurchase } from '../../../types/beauty';

const EMPTY_FORM: Partial<BeautyCustomer> = {
    name: '', phone: '', email: '', address: '', city: '', notes: '',
};

export function ClientCRM() {
    const { customers, packages, isLoading, loadCustomers, loadPackages, createCustomer, updateCustomer } = useBeautyStore();
    const { tm } = useLanguage();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<BeautyCustomer | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyCustomer>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);

    // Package purchase state
    const [customerPackages, setCustomerPackages] = useState<BeautyPackagePurchase[]>([]);
    const [showPkgModal, setShowPkgModal] = useState(false);
    const [selectedPkg, setSelectedPkg] = useState('');
    const [pkgBuying, setPkgBuying] = useState(false);
    const [pkgLoading, setPkgLoading] = useState(false);

    useEffect(() => { loadCustomers(); loadPackages(); }, []);

    useEffect(() => {
        if (!selected) { setCustomerPackages([]); return; }
        setPkgLoading(true);
        beautyService.getCustomerPackages(selected.id)
            .then(setCustomerPackages)
            .catch(() => setCustomerPackages([]))
            .finally(() => setPkgLoading(false));
    }, [selected?.id]);

    const handleBuyPackage = async () => {
        if (!selected || !selectedPkg) return;
        const pkg = packages.find(p => p.id === selectedPkg);
        if (!pkg) return;
        setPkgBuying(true);
        try {
            const finalPrice = pkg.price * (1 - (pkg.discount_pct ?? 0) / 100);
            await beautyService.purchasePackage({
                customer_id:       selected.id,
                package_id:        pkg.id,
                total_sessions:    pkg.total_sessions,
                sale_price:        finalPrice,
                expiry_date:       new Date(Date.now() + (pkg.validity_days ?? 365) * 86400000).toISOString().split('T')[0],
            });
            // Also record the sale
            await beautyService.createSale({
                customer_id:      selected.id,
                subtotal:         finalPrice,
                discount:         pkg.price - finalPrice,
                tax:              0,
                total:            finalPrice,
                payment_method:   'cash',
                payment_status:   'paid',
                paid_amount:      finalPrice,
                remaining_amount: 0,
                notes:            `Paket satın alma: ${pkg.name}`,
            }, [{
                item_type:         'package',
                item_id:           pkg.id,
                name:              pkg.name,
                quantity:          1,
                unit_price:        finalPrice,
                discount:          pkg.price - finalPrice,
                total:             finalPrice,
                commission_amount: 0,
            }]);
            const updated = await beautyService.getCustomerPackages(selected.id);
            setCustomerPackages(updated);
            setShowPkgModal(false);
            setSelectedPkg('');
        } catch (e) { logger.crudError('ClientCRM', 'purchasePackage', e); }
        finally { setPkgBuying(false); }
    };

    const filtered = customers.filter(c =>
        !search ||
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search) ||
        c.email?.toLowerCase().includes(search.toLowerCase())
    );

    const openCreate = () => {
        setEditing(EMPTY_FORM);
        setIsEdit(false);
        setShowModal(true);
    };

    const openEdit = (c: BeautyCustomer) => {
        setEditing({ ...c });
        setIsEdit(true);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            if (isEdit && editing.id) {
                await updateCustomer(editing.id, editing);
                if (selected?.id === editing.id) setSelected({ ...selected, ...editing } as BeautyCustomer);
            } else {
                await createCustomer(editing);
            }
            setShowModal(false);
        } finally {
            setSaving(false);
        }
    };

    const initials = (name: string) =>
        name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

    const formatDate = (d?: string) =>
        d ? new Date(d).toLocaleDateString('tr-TR') : '-';

    const formatCurrency = (n?: number) =>
        n != null ? `₺${Number(n).toLocaleString('tr-TR')}` : '₺0';

    const GRAD_COLORS = [
        'from-purple-500 to-indigo-500',
        'from-pink-500 to-rose-500',
        'from-teal-500 to-cyan-500',
        'from-orange-500 to-amber-500',
        'from-blue-500 to-violet-500',
    ];
    const gradColor = (id: string) => GRAD_COLORS[id.charCodeAt(0) % GRAD_COLORS.length];

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] animate-in fade-in duration-500">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600">
                        <Users size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">{tm('bClientCRM')}</h1>
                        <p className="text-xs text-slate-500 font-medium">
                            {isLoading ? tm('bLoading') : `${customers.length} ${tm('bRegisteredCustomers')}`}
                        </p>
                    </div>
                </div>
                <Button
                    onClick={openCreate}
                    className="h-10 rounded-xl px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold gap-2 shadow-lg shadow-purple-600/20 active:scale-95 transition-all"
                >
                    <Plus size={18} /> {tm('bNewCustomer')}
                </Button>
            </div>

            <div className="flex-1 overflow-hidden flex p-4 gap-4">
                {/* List */}
                <div className="w-full lg:w-3/5 bg-white rounded-3xl border border-slate-200 flex flex-col overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-100">
                        <div className="relative">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder={tm('bSearchPlaceholderCustomer')}
                                className="w-full bg-slate-50 border-none rounded-xl h-11 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-500/20 transition-all text-slate-700 placeholder:text-slate-400 outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">{tm('bLoading')}</div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                                <Users size={32} />
                                <p className="text-sm font-medium">
                                    {search ? tm('bNoCustomerResults') : tm('bNoCustomers')}
                                </p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50/50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">{tm('bCustomerHeader')}</th>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">{tm('bContactHeader')}</th>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">{tm('bLastServiceHeader')}</th>
                                        <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">{tm('bVisitsHeader')}</th>
                                        <th className="px-6 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filtered.map(c => (
                                        <tr
                                            key={c.id}
                                            onClick={() => setSelected(c)}
                                            className={`group hover:bg-slate-50/80 transition-colors cursor-pointer ${selected?.id === c.id ? 'bg-purple-50/60' : ''}`}
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 bg-gradient-to-br ${gradColor(c.id)} rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white`}>
                                                        {initials(c.name)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900 leading-tight">{c.name}</p>
                                                        {c.balance != null && Number(c.balance) !== 0 && (
                                                            <p className="text-[10px] text-slate-500 font-medium">
                                                                {tm('bBalance')}: {formatCurrency(c.balance)}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    {c.phone && (
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                            <Phone size={12} className="text-slate-400" /> {c.phone}
                                                        </div>
                                                    )}
                                                    {c.email && (
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                            <Mail size={12} className="text-slate-400" /> {c.email}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <p className="text-xs font-bold text-slate-700">{c.last_service_name ?? '-'}</p>
                                                    <p className="text-[10px] text-slate-500">{formatDate(c.last_appointment_date)}</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge className={`border-none text-[10px] ${(c.appointment_count ?? 0) > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {c.appointment_count ?? 0} {tm('bAppointmentWord')}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={e => { e.stopPropagation(); openEdit(c); }}
                                                    className="p-1.5 rounded-lg text-slate-300 hover:text-purple-500 hover:bg-purple-50 transition-colors"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Detail Panel */}
                <div className="hidden lg:flex lg:w-2/5 flex-col gap-4 overflow-y-auto custom-scrollbar">
                    {selected ? (
                        <>
                            <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
                                <div className={`bg-gradient-to-r ${gradColor(selected.id)} p-6 text-white relative`}>
                                    <div className="relative z-10">
                                        {(selected.points ?? 0) >= 1000 && (
                                            <Badge className="mb-2 bg-white/20 text-white border-none backdrop-blur-md">{tm('bVipCustomer')}</Badge>
                                        )}
                                        <h2 className="text-2xl font-black italic tracking-tighter">{selected.name.toUpperCase()}</h2>
                                        {selected.code && (
                                            <p className="text-white/80 text-xs font-medium mt-1">#{selected.code}</p>
                                        )}
                                    </div>
                                    <Users className="absolute -bottom-4 -right-4 w-32 h-32 text-white/10" />
                                </div>
                                <div className="p-6 grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                        <Star className="text-amber-500 mb-1" size={16} />
                                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">{tm('bLoyaltyPoints')}</p>
                                        <p className="text-lg font-black text-slate-900">{(selected.points ?? 0).toLocaleString('tr-TR')}</p>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                        <CreditCard className="text-purple-500 mb-1" size={16} />
                                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">{tm('bTotalSpent')}</p>
                                        <p className="text-lg font-black text-slate-900">{formatCurrency(selected.total_spent)}</p>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                        <TrendingUp className="text-green-500 mb-1" size={16} />
                                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">{tm('bAppointmentCountLabel')}</p>
                                        <p className="text-lg font-black text-slate-900">{selected.appointment_count ?? 0}</p>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                        <Calendar className="text-blue-500 mb-1" size={16} />
                                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">{tm('bLastVisit')}</p>
                                        <p className="text-sm font-black text-slate-900">{formatDate(selected.last_appointment_date)}</p>
                                    </div>
                                </div>
                                {/* Contact info */}
                                <div className="px-6 pb-6 space-y-2">
                                    {selected.phone && (
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <Phone size={14} className="text-slate-400" /> {selected.phone}
                                        </div>
                                    )}
                                    {selected.email && (
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <Mail size={14} className="text-slate-400" /> {selected.email}
                                        </div>
                                    )}
                                    {selected.city && (
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <MapPin size={14} className="text-slate-400" /> {selected.city}
                                        </div>
                                    )}
                                    {selected.notes && (
                                        <div className="flex items-start gap-2 text-sm text-slate-600">
                                            <FileText size={14} className="text-slate-400 mt-0.5 shrink-0" />
                                            <span className="text-xs">{selected.notes}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="px-6 pb-6">
                                    <Button
                                        onClick={() => openEdit(selected)}
                                        variant="outline"
                                        className="w-full rounded-xl border-slate-200 text-purple-600 font-bold hover:bg-purple-50"
                                    >
                                        <Edit2 size={14} className="mr-2" /> {tm('bEditInfo')}
                                    </Button>
                                </div>
                            </Card>

                            {selected.last_service_name && (
                                <Card className="rounded-3xl border-slate-200 p-6 shadow-sm">
                                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-3">{tm('bLastService')}</h3>
                                    <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-2xl">
                                        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                                            <Calendar size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{selected.last_service_name}</p>
                                            <p className="text-xs text-slate-500">{formatDate(selected.last_appointment_date)}</p>
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {/* Package Purchases */}
                            <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Package size={16} className="text-purple-500" />
                                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{tm('bPackages')}</h3>
                                        {customerPackages.length > 0 && (
                                            <Badge className="bg-purple-100 text-purple-700 border-none text-[10px]">{customerPackages.length}</Badge>
                                        )}
                                    </div>
                                    <Button
                                        onClick={() => setShowPkgModal(true)}
                                        className="h-7 px-3 text-xs rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold"
                                    >
                                        <Plus size={12} className="mr-1" /> {tm('bSellPackage')}
                                    </Button>
                                </div>
                                <div className="divide-y divide-slate-50">
                                    {pkgLoading ? (
                                        <div className="p-4 text-center text-xs text-slate-400">{tm('bLoading')}</div>
                                    ) : customerPackages.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-slate-400">{tm('bNoPackagesForCustomer')}</div>
                                    ) : customerPackages.map(pp => {
                                        const usedPct = pp.total_sessions > 0 ? (pp.used_sessions / pp.total_sessions) * 100 : 0;
                                        const isExpired = pp.expiry_date && new Date(pp.expiry_date) < new Date();
                                        return (
                                            <div key={pp.id} className="p-4">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-800">{pp.package_name ?? tm('bPackage')}</p>
                                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                                            {pp.used_sessions}/{pp.total_sessions} {tm('bSessions')} ·{' '}
                                                            {pp.expiry_date ? `${tm('bExpiry')} ${formatDate(pp.expiry_date)}` : ''}
                                                        </p>
                                                    </div>
                                                    <Badge className={`text-[10px] border-none ${isExpired ? 'bg-red-100 text-red-600' : pp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        {isExpired ? tm('bExpired') : pp.status === 'active' ? tm('bStatusActive') : tm('bConsumed')}
                                                    </Badge>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${Math.min(usedPct, 100)}%` }} />
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-1">{pp.remaining_sessions} {tm('bSessionsRemaining')}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-300">
                            <Users size={48} />
                            <p className="text-sm font-medium text-slate-400">{tm('bSelectCustomer')}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Package Purchase Modal */}
            {showPkgModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-5 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-black">{tm('bSellPackage')}</h2>
                                <p className="text-white/70 text-xs mt-0.5">{selected?.name}</p>
                            </div>
                            <button onClick={() => setShowPkgModal(false)} className="p-2 hover:bg-white/20 rounded-xl transition">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            {packages.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">{tm('bNoPackagesDefined')}</p>
                            ) : packages.map(pkg => {
                                const fp = pkg.price * (1 - (pkg.discount_pct ?? 0) / 100);
                                const active = selectedPkg === pkg.id;
                                return (
                                    <button
                                        key={pkg.id}
                                        onClick={() => setSelectedPkg(pkg.id)}
                                        className={`w-full text-left p-3 rounded-2xl border-2 transition-all ${active ? 'border-purple-500 bg-purple-50' : 'border-slate-100 hover:border-purple-200'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{pkg.name}</p>
                                                <p className="text-[10px] text-slate-500 mt-0.5">{pkg.total_sessions} {tm('bSessions')} · {pkg.validity_days} {tm('bValidDaysLabel')}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-purple-600">{formatCurrency(fp)}</p>
                                                {(pkg.discount_pct ?? 0) > 0 && (
                                                    <p className="text-[10px] text-slate-400 line-through">{formatCurrency(pkg.price)}</p>
                                                )}
                                            </div>
                                        </div>
                                        {active && <CheckCircle2 size={14} className="text-purple-600 mt-1" />}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="px-5 pb-5 flex gap-3">
                            <Button variant="outline" onClick={() => setShowPkgModal(false)} className="flex-1 rounded-xl border-slate-200 font-bold">{tm('cancel')}</Button>
                            <Button
                                onClick={handleBuyPackage}
                                disabled={!selectedPkg || pkgBuying}
                                className="flex-1 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold"
                            >
                                {pkgBuying ? tm('bSaving') : tm('bConfirmSale')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create / Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black">{isEdit ? tm('bEditCustomer') : tm('bNewCustomer')}</h2>
                                <p className="text-white/70 text-xs mt-1">
                                    {isEdit ? tm('bEditCustomerSubtitle') : tm('bCreateCustomerSubtitle')}
                                </p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-xl transition">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
                                    {tm('bCustomerName')} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={editing.name ?? ''}
                                    onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                                    placeholder={tm('bCustomerNamePlaceholder')}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bPhone')}</label>
                                    <input
                                        type="tel"
                                        value={editing.phone ?? ''}
                                        onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))}
                                        placeholder="0555 000 00 00"
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bCity')}</label>
                                    <input
                                        type="text"
                                        value={editing.city ?? ''}
                                        onChange={e => setEditing(p => ({ ...p, city: e.target.value }))}
                                        placeholder="İstanbul"
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bEmail')}</label>
                                <input
                                    type="email"
                                    value={editing.email ?? ''}
                                    onChange={e => setEditing(p => ({ ...p, email: e.target.value }))}
                                    placeholder="ornek@email.com"
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bAddress')}</label>
                                <input
                                    type="text"
                                    value={editing.address ?? ''}
                                    onChange={e => setEditing(p => ({ ...p, address: e.target.value }))}
                                    placeholder="Adres"
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bNotes')}</label>
                                <textarea
                                    value={editing.notes ?? ''}
                                    onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))}
                                    placeholder={tm('bFeedbackComment')}
                                    rows={3}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 resize-none"
                                />
                            </div>
                        </div>

                        <div className="px-6 pb-6 flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setShowModal(false)}
                                className="flex-1 rounded-xl border-slate-200 font-bold"
                            >
                                {tm('cancel')}
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={!editing.name?.trim() || saving}
                                className="flex-1 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-lg shadow-purple-600/20"
                            >
                                <Save size={16} className="mr-2" />
                                {saving ? tm('bSaving') : tm('save')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
