import React, { useEffect, useState } from 'react';
import {
    Package, Plus, X, Save, Edit2, Trash2,
    CheckCircle2, AlertCircle, Calendar, Percent, User
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PercentBodyModal, PercentBodyModalScrollBody } from '@/components/shared/PercentBodyModal';
import { useBeautyStore } from '../store/useBeautyStore';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautyPackage } from '../../../types/beauty';
import { formatMoneyAmount } from '../../../utils/formatMoney';

const PKG_COLORS = [
    '#9333ea', '#6366f1', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
];

const EMPTY_FORM: Partial<BeautyPackage> = {
    name: '', description: '', total_sessions: 1,
    price: 0, discount_pct: 0, validity_days: 365, color: '#9333ea',
};

export function PackageManagement() {
    const {
        packages, services, specialists, isLoading,
        loadPackages, loadServices, loadSpecialists,
        createPackage, updatePackage, deletePackage,
    } = useBeautyStore();
    const { tm } = useLanguage();
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyPackage>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    /** Paket → hizmet → personel+yüzde satırları (paket oluşturma akışı) */
    const [pkgServiceItems, setPkgServiceItems] = useState<Array<{
        service_id: string;
        staff_id: string;
        percent: number;
    }>>([]);
    /** Hizmet ekleme modalı */
    const [addSvcOpen, setAddSvcOpen] = useState(false);
    const [addSvcDraftServiceId, setAddSvcDraftServiceId] = useState('');
    const [addSvcDraftStaffId, setAddSvcDraftStaffId] = useState('');
    const [addSvcDraftPct, setAddSvcDraftPct] = useState<number>(0);
    const [addSvcLoading, setAddSvcLoading] = useState(false);

    useEffect(() => {
        loadPackages();
        loadServices();
        loadSpecialists();
    }, [loadPackages, loadServices, loadSpecialists]);

    const openCreate = () => { setEditing(EMPTY_FORM); setIsEdit(false); setShowModal(true); };
    const openEdit = (pkg: BeautyPackage) => { setEditing({ ...pkg }); setIsEdit(true); setShowModal(true); };

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            if (isEdit && editing.id) {
                await updatePackage(editing.id, editing);
                await syncPackageServiceCommissions(editing.id);
            } else {
                const newId = await beautyService.createPackage(editing);
                await loadPackages();
                if (newId) {
                    await syncPackageServiceCommissions(newId);
                }
            }
            setShowModal(false);
            setPkgServiceItems([]);
        } finally { setSaving(false); }
    };

    /**
     * Paket tanımındaki `pkgServiceItems` satırlarını `service_staff_commissions`
     * tablosuna uygular. Tek bir pakete bağlı değildir; her hizmet × personel
     * çifti global olarak saklanır. Aynı hizmet birden çok pakete eklenirse
     * son yazılan değer baskın olur (yönetici bilinçli karar verir).
     */
    const syncPackageServiceCommissions = async (pkgId: string) => {
        if (pkgServiceItems.length === 0) return;
        for (const it of pkgServiceItems) {
            const pct = Math.max(0, Math.min(100, Number(it.percent ?? 0) || 0));
            if (pct <= 0) {
                await beautyService.deleteServiceStaffCommission(it.service_id, it.staff_id).catch(() => undefined);
            } else {
                await beautyService.upsertServiceStaffCommission(it.service_id, it.staff_id, pct);
            }
        }
        void pkgId; // paket başına ek alanlar ileride burada yazılabilir
    };

    const openAddServiceRow = () => {
        setAddSvcDraftServiceId('');
        setAddSvcDraftStaffId('');
        setAddSvcDraftPct(0);
        setAddSvcOpen(true);
    };

    const submitAddServiceRow = async () => {
        if (!addSvcDraftServiceId || !addSvcDraftStaffId) return;
        setAddSvcLoading(true);
        try {
            const pct = Math.max(0, Math.min(100, Number(addSvcDraftPct ?? 0) || 0));
            // Öneri: eğer kullanıcı yüzde girmediyse service × staff için mevcut
            // yüzdeyi veya service.commission_rate'i kullan.
            let suggested = pct;
            if (suggested <= 0) {
                try {
                    const rows = await beautyService.getServiceStaffCommissions(addSvcDraftServiceId);
                    const hit = rows.find(r => String(r.staff_id) === addSvcDraftStaffId);
                    if (hit && Number(hit.percent ?? 0) > 0) {
                        suggested = Number(hit.percent);
                    } else {
                        const svc = services.find(s => String(s.id) === addSvcDraftServiceId);
                        suggested = Number(svc?.commission_rate ?? 0) || 0;
                    }
                } catch { /* no-op */ }
            }
            setPkgServiceItems(prev => [
                ...prev,
                { service_id: addSvcDraftServiceId, staff_id: addSvcDraftStaffId, percent: suggested },
            ]);
            setAddSvcOpen(false);
        } finally {
            setAddSvcLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        await deletePackage(id);
        setDeleteConfirm(null);
    };

    const finalPrice = (pkg: Partial<BeautyPackage>) =>
        (pkg.price ?? 0) * (1 - (pkg.discount_pct ?? 0) / 100);

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] animate-in fade-in duration-500">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                        <Package size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">{tm('bPackageManagement')}</h1>
                        <p className="text-xs text-slate-500 font-medium">
                            {isLoading ? tm('bLoading') : `${packages.length} aktif paket`}
                        </p>
                    </div>
                </div>
                <Button onClick={openCreate} className="h-10 rounded-xl px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
                    <Plus size={18} /> {tm('bPackageCreate')}
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {isLoading ? (
                    <div className="flex items-center justify-center h-40 text-slate-400 text-sm">{tm('bLoading')}</div>
                ) : packages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                        <Package size={40} />
                        <p className="text-sm font-medium">{tm('bNoPackages')}</p>
                        <Button onClick={openCreate} variant="outline" className="text-indigo-600 border-indigo-200 rounded-xl">
                            <Plus size={16} className="mr-2" /> {tm('bCreateFirstPackage')}
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {packages.map(pkg => {
                            const fp = finalPrice(pkg);
                            const hasDiscount = (pkg.discount_pct ?? 0) > 0;
                            return (
                                <Card key={pkg.id} className="group overflow-hidden rounded-[2rem] border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                                    <div className="p-6 text-white relative h-44 flex flex-col justify-between overflow-hidden" style={{ backgroundColor: pkg.color ?? '#9333ea' }}>
                                        <div className="absolute -right-4 -top-4 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                                        <div className="flex justify-between items-start relative z-10">
                                            {hasDiscount
                                                ? <Badge className="bg-white/20 text-white border-none py-1 px-3">%{pkg.discount_pct} {tm('bDiscount')}</Badge>
                                                : <span />
                                            }
                                            <div className="flex gap-1">
                                                <button onClick={() => openEdit(pkg)} className="p-1.5 bg-white/20 rounded-lg hover:bg-white/30 transition"><Edit2 size={14} /></button>
                                                <button onClick={() => setDeleteConfirm(pkg.id)} className="p-1.5 bg-white/20 rounded-lg hover:bg-red-500/50 transition"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                        <div className="relative z-10">
                                            <h3 className="text-xl font-black">{pkg.name}</h3>
                                            <p className="text-white/80 text-xs font-bold uppercase tracking-widest mt-1 opacity-75">{pkg.total_sessions} {tm('bSessions')}</p>
                                        </div>
                                    </div>
                                    <div className="p-6 flex flex-col gap-4">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{tm('bPackagePrice')}</span>
                                                <div className="flex items-baseline gap-2 mt-1">
                                                    <span className="text-2xl font-black text-slate-900 leading-none">{formatMoneyAmount(fp, { minFrac: 0, maxFrac: 0 })}</span>
                                                    {hasDiscount && <span className="text-sm text-slate-400 line-through">{formatMoneyAmount(pkg.price ?? 0, { minFrac: 0, maxFrac: 0 })}</span>}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{tm('bSessionPrice')}</span>
                                                <p className="text-sm font-black text-slate-600 mt-1">{pkg.total_sessions ? formatMoneyAmount(Math.round(fp / pkg.total_sessions), { minFrac: 0, maxFrac: 0 }) : '-'}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-2 pt-2 border-t border-slate-100">
                                            <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                                                <CheckCircle2 size={14} className="text-green-500" />{pkg.total_sessions} {tm('bPackageIncluded')}
                                            </div>
                                            {pkg.validity_days && (
                                                <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                                                    <Calendar size={14} className="text-blue-500" />{pkg.validity_days} {tm('bPackageValidDays')}
                                                </div>
                                            )}
                                            {pkg.description && (
                                                <div className="flex items-start gap-2 text-xs text-slate-500">
                                                    <AlertCircle size={14} className="mt-0.5 shrink-0" />{pkg.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                        <div onClick={openCreate} className="bg-gray-50 rounded-[2rem] border-4 border-dashed border-gray-200 flex flex-col items-center justify-center p-8 text-gray-400 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer group min-h-[260px]">
                            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all"><Plus size={32} /></div>
                            <p className="text-[10px] font-black uppercase tracking-widest">{tm('bDefineNewPackage')}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-white flex items-center justify-between" style={{ backgroundColor: editing.color ?? '#6366f1' }}>
                            <div>
                                <h2 className="text-lg font-black">{isEdit ? tm('bPackageEdit') : tm('bPackageNew')}</h2>
                                <p className="text-white/70 text-xs mt-1">beauty.rex_firma_beauty_packages</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-xl transition"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bPackageName')} <span className="text-red-500">*</span></label>
                                <input type="text" value={editing.name ?? ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="8 Seans Lazer Epilasyon" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bPackageDescription')}</label>
                                <textarea value={editing.description ?? ''} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Paket detayları..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bPackageSessions')}</label>
                                    <input type="number" min={1} value={editing.total_sessions ?? 1} onChange={e => setEditing(p => ({ ...p, total_sessions: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bPackageValidity')}</label>
                                    <input type="number" min={1} value={editing.validity_days ?? 365} onChange={e => setEditing(p => ({ ...p, validity_days: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bPackageListPrice')}</label>
                                    <input type="number" min={0} value={editing.price ?? 0} onChange={e => setEditing(p => ({ ...p, price: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bPackageDiscountPct')}</label>
                                    <input type="number" min={0} max={100} value={editing.discount_pct ?? 0} onChange={e => setEditing(p => ({ ...p, discount_pct: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
                                </div>
                            </div>
                            {(editing.discount_pct ?? 0) > 0 && (editing.price ?? 0) > 0 && (
                                <div className="bg-green-50 rounded-xl px-4 py-2 flex items-center justify-between">
                                    <span className="text-xs font-bold text-green-700">{tm('bPackageSalePrice')}</span>
                                    <span className="text-sm font-black text-green-700">{formatMoneyAmount(finalPrice(editing), { minFrac: 0, maxFrac: 0 })}</span>
                                </div>
                            )}

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                                        {tm('bPackageCommissionAssign')}
                                    </label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={openAddServiceRow}
                                        className="rounded-xl border-indigo-200 text-indigo-600 font-bold text-xs"
                                    >
                                        <Plus size={14} className="mr-1" />
                                        {tm('bPackageAddService')}
                                    </Button>
                                </div>
                                {pkgServiceItems.length === 0 ? (
                                    <div className="text-[11px] text-slate-500 italic px-1 py-2">
                                        {tm('bPackageCommissionEmpty')}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {pkgServiceItems.map((it, idx) => {
                                            const svc = services.find(s => String(s.id) === it.service_id);
                                            const sp = specialists.find(s => String(s.id) === it.staff_id);
                                            return (
                                                <div
                                                    key={`${it.service_id}::${it.staff_id}::${idx}`}
                                                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-black text-slate-800 truncate">
                                                            {svc?.name ?? it.service_id}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                                            <User size={10} /> {sp?.name ?? it.staff_id}
                                                        </div>
                                                    </div>
                                                    <div className="w-24 shrink-0">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={100}
                                                            step={0.01}
                                                            value={it.percent}
                                                            onChange={e => {
                                                                const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                                                setPkgServiceItems(prev =>
                                                                    prev.map((row, i) => i === idx ? { ...row, percent: v } : row),
                                                                );
                                                            }}
                                                            className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs text-right font-bold"
                                                            aria-label={tm('bPackageCommissionPercent')}
                                                        />
                                                        <div className="text-[10px] text-slate-400 text-right">% {it.percent.toFixed(2)}</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPkgServiceItems(prev => prev.filter((_, i) => i !== idx))}
                                                        className="text-slate-400 hover:text-red-500 transition"
                                                        aria-label={tm('delete')}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 block">{tm('bPackageColor')}</label>
                                <div className="flex gap-2 flex-wrap">
                                    {PKG_COLORS.map(color => (
                                        <button key={color} onClick={() => setEditing(p => ({ ...p, color }))} className={`w-8 h-8 rounded-full transition-all ${editing.color === color ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'opacity-70 hover:opacity-100'}`} style={{ backgroundColor: color }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 rounded-xl border-slate-200 font-bold">{tm('cancel')}</Button>
                            <Button onClick={handleSave} disabled={!editing.name?.trim() || saving} className="flex-1 rounded-xl text-white font-bold" style={{ backgroundColor: editing.color ?? '#6366f1' }}>
                                <Save size={16} className="mr-2" />{saving ? tm('bSaving') : tm('save')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Hizmet / personel / yüzde ekleme modalı (paket tanımı içinden) */}
            <PercentBodyModal
                onClose={() => setAddSvcOpen(false)}
                size="compact"
                ariaLabel={tm('bPackageCommissionAssign')}
            >
                <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-6 text-white shrink-0 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black">{tm('bPackageCommissionAssign')}</h2>
                        <p className="text-white/70 text-xs mt-1">{tm('bPackageCommissionSubtitle')}</p>
                    </div>
                    <button
                        type="button"
                        aria-label="close"
                        onClick={() => setAddSvcOpen(false)}
                        className="p-2 hover:bg-white/20 rounded-xl transition"
                    >
                        <X size={20} />
                    </button>
                </div>
                <PercentBodyModalScrollBody className="p-8 space-y-4">
                    <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                            {tm('bPackageCommissionService')}
                        </label>
                        <select
                            className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400"
                            value={addSvcDraftServiceId}
                            onChange={e => setAddSvcDraftServiceId(e.target.value)}
                        >
                            <option value="">{tm('bSelectServicePlaceholder')}</option>
                            {services.filter(s => s.is_active !== false).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                            {tm('bPackageCommissionStaff')}
                        </label>
                        <select
                            className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400"
                            value={addSvcDraftStaffId}
                            onChange={e => setAddSvcDraftStaffId(e.target.value)}
                        >
                            <option value="">{tm('bPackageCommissionStaffPlaceholder')}</option>
                            {specialists.filter(s => s.is_active !== false).map(s => (
                                <option key={s.id} value={s.id}>{s.name}{s.specialty ? ` — ${s.specialty}` : ''}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                            {tm('bPackageCommissionPercent')}
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={addSvcDraftPct}
                                onChange={e => setAddSvcDraftPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                                className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400"
                                placeholder="0"
                            />
                            <Percent size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                            {tm('bPackageCommissionPercentHint')}
                        </p>
                    </div>
                </PercentBodyModalScrollBody>
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3 shrink-0">
                    <Button variant="outline" onClick={() => setAddSvcOpen(false)} className="flex-1 rounded-xl border-slate-200 font-bold">{tm('cancel')}</Button>
                    <Button
                        onClick={submitAddServiceRow}
                        disabled={!addSvcDraftServiceId || !addSvcDraftStaffId || addSvcLoading}
                        className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                    >
                        <Plus size={16} className="mr-2" />{addSvcLoading ? tm('bSaving') : tm('bAdd')}
                    </Button>
                </div>
            </PercentBodyModal>

            {/* Delete Confirm */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 size={28} className="text-red-500" /></div>
                        <h3 className="text-lg font-black text-slate-900 mb-2">{tm('bDeletePackage')}</h3>
                        <p className="text-sm text-slate-500 mb-6">{tm('bDeletePackageConfirm')}</p>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-xl">{tm('cancel')}</Button>
                            <Button onClick={() => handleDelete(deleteConfirm)} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold">{tm('delete')}</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
