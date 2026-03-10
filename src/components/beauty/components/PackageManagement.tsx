import React, { useEffect, useState } from 'react';
import {
    Package, Plus, X, Save, Edit2, Trash2,
    CheckCircle2, AlertCircle, Calendar
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBeautyStore } from '../store/useBeautyStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautyPackage } from '../../../types/beauty';

const PKG_COLORS = [
    '#9333ea', '#6366f1', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
];

const EMPTY_FORM: Partial<BeautyPackage> = {
    name: '', description: '', total_sessions: 1,
    price: 0, discount_pct: 0, validity_days: 365, color: '#9333ea',
};

export function PackageManagement() {
    const { packages, isLoading, loadPackages, createPackage, updatePackage, deletePackage } = useBeautyStore();
    const { tm } = useLanguage();
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyPackage>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    useEffect(() => { loadPackages(); }, []);

    const openCreate = () => { setEditing(EMPTY_FORM); setIsEdit(false); setShowModal(true); };
    const openEdit = (pkg: BeautyPackage) => { setEditing({ ...pkg }); setIsEdit(true); setShowModal(true); };

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            if (isEdit && editing.id) await updatePackage(editing.id, editing);
            else await createPackage(editing);
            setShowModal(false);
        } finally { setSaving(false); }
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
                                                    <span className="text-2xl font-black text-slate-900 leading-none">₺{fp.toLocaleString('tr-TR')}</span>
                                                    {hasDiscount && <span className="text-sm text-slate-400 line-through">₺{(pkg.price ?? 0).toLocaleString('tr-TR')}</span>}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{tm('bSessionPrice')}</span>
                                                <p className="text-sm font-black text-slate-600 mt-1">₺{pkg.total_sessions ? Math.round(fp / pkg.total_sessions).toLocaleString('tr-TR') : '-'}</p>
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
                                    <span className="text-sm font-black text-green-700">₺{finalPrice(editing).toLocaleString('tr-TR')}</span>
                                </div>
                            )}
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
