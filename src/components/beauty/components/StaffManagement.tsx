
import React, { useEffect, useState } from 'react';
import {
    User, Mail, Phone, Award, Plus, Edit2,
    Trash2, Search, UserCheck, UserX, BarChart2,
    Star, X, Save, ToggleLeft, ToggleRight
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { BeautySpecialist } from '../../../types/beauty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import '../ClinicStyles.css';

const SPECIALIST_COLORS = [
    '#9333ea', '#6366f1', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
];

const EMPTY_FORM: Partial<BeautySpecialist> = {
    name: '', phone: '', email: '', specialty: '',
    color: '#9333ea', commission_rate: 0, is_active: true,
};

export function StaffManagement() {
    const { specialists, isLoading, loadSpecialists, createSpecialist, updateSpecialist, toggleSpecialist } = useBeautyStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautySpecialist>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    useEffect(() => { loadSpecialists(); }, []);

    const filteredStaff = specialists.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.specialty ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const openCreate = () => { setEditing({ ...EMPTY_FORM }); setIsEdit(false); setShowModal(true); };
    const openEdit = (staff: BeautySpecialist) => { setEditing({ ...staff }); setIsEdit(true); setShowModal(true); };

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            if (isEdit && editing.id) await updateSpecialist(editing.id, editing);
            else await createSpecialist(editing);
            setShowModal(false);
        } finally { setSaving(false); }
    };

    const handleToggle = async (staff: BeautySpecialist) => {
        await toggleSpecialist(staff.id, !staff.is_active);
    };

    // For delete we just toggle to inactive (no hard delete action in store)
    const handleDelete = async (id: string) => {
        await toggleSpecialist(id, false);
        setDeleteConfirm(null);
    };

    const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Personel Yönetimi</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {isLoading ? 'Yükleniyor...' : `${specialists.length} personel kayıtlı`}
                    </p>
                </div>
                <Button
                    onClick={openCreate}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-6 rounded-2xl shadow-lg shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-2"
                >
                    <Plus size={20} />
                    <span>YENİ PERSONEL EKLE</span>
                </Button>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 shadow-sm border border-purple-100">
                        <User size={28} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">TOPLAM EKİP</p>
                        <p className="text-2xl font-black text-gray-900">{specialists.length} KİŞİ</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 shadow-sm border border-green-100">
                        <UserCheck size={28} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">AKTİF ÇALIŞAN</p>
                        <p className="text-2xl font-black text-gray-900">{specialists.filter(s => s.is_active).length} KİŞİ</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 shadow-sm border border-orange-100">
                        <UserX size={28} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">PASİF ÇALIŞAN</p>
                        <p className="text-2xl font-black text-gray-900">{specialists.filter(s => !s.is_active).length} KİŞİ</p>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <Input
                    placeholder="İsim veya uzmanlık alanına göre personel ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 h-14 bg-white border-gray-100 rounded-2xl focus:ring-purple-500/10 focus:border-purple-500 transition-all font-bold uppercase text-sm shadow-sm"
                />
            </div>

            {/* Staff Grid */}
            {isLoading ? (
                <div className="py-20 text-center text-slate-400 text-sm">Yükleniyor...</div>
            ) : filteredStaff.length === 0 ? (
                <div className="py-20 text-center">
                    <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4 text-gray-300"><User size={40} /></div>
                    <h3 className="text-lg font-bold text-gray-400 uppercase tracking-widest">Personel Bulunamadı</h3>
                    <Button onClick={openCreate} variant="outline" className="mt-4 text-purple-600 border-purple-200 rounded-xl">
                        <Plus size={16} className="mr-2" /> İlk personeli ekle
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredStaff.map(staff => (
                        <div
                            key={staff.id}
                            className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 p-8 group relative overflow-hidden"
                        >
                            <div className="flex items-start justify-between mb-6 relative z-10">
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-20 h-20 rounded-[2rem] flex items-center justify-center text-white font-black text-2xl shadow-inner border border-white relative"
                                        style={{ background: `linear-gradient(135deg, ${staff.color ?? '#9333ea'}, ${staff.color ?? '#9333ea'}99)` }}
                                    >
                                        {initials(staff.name)}
                                        {staff.is_active && (
                                            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-white" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900 leading-tight uppercase group-hover:text-purple-600 transition-colors">
                                            {staff.name}
                                        </h3>
                                        {staff.specialty && (
                                            <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mt-2 border bg-purple-100 text-purple-700 border-purple-200">
                                                {staff.specialty}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={() => openEdit(staff)}
                                        className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:bg-purple-600 hover:text-white transition-all shadow-sm"
                                    ><Edit2 size={18} /></button>
                                    <button
                                        onClick={() => handleToggle(staff)}
                                        className={`p-3 rounded-2xl transition-all shadow-sm ${staff.is_active ? 'bg-green-50 text-green-500 hover:bg-orange-100 hover:text-orange-500' : 'bg-gray-50 text-gray-400 hover:bg-green-100 hover:text-green-600'}`}
                                        title={staff.is_active ? 'Pasife Al' : 'Aktive Et'}
                                    >
                                        {staff.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4 mb-8 relative z-10">
                                {staff.phone && (
                                    <div className="flex items-center gap-3 text-gray-500">
                                        <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center"><Phone size={14} /></div>
                                        <span className="text-xs font-bold font-mono">{staff.phone}</span>
                                    </div>
                                )}
                                {staff.email && (
                                    <div className="flex items-center gap-3 text-gray-500">
                                        <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center"><Mail size={14} /></div>
                                        <span className="text-xs font-bold lowercase truncate max-w-[200px]">{staff.email}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-3 p-4 rounded-3xl border" style={{ backgroundColor: `${staff.color ?? '#9333ea'}15`, borderColor: `${staff.color ?? '#9333ea'}30` }}>
                                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm" style={{ backgroundColor: `${staff.color ?? '#9333ea'}20` }}>
                                        <BarChart2 size={20} style={{ color: staff.color ?? '#9333ea' }} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1 opacity-70" style={{ color: staff.color ?? '#9333ea' }}>PRİM ORANI</p>
                                        <p className="text-2xl font-black tracking-tight leading-none" style={{ color: staff.color ?? '#9333ea' }}>%{staff.commission_rate}</p>
                                    </div>
                                </div>
                            </div>

                            {!staff.is_active && (
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-20">
                                    <div className="bg-gray-900 text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">PASİF</div>
                                </div>
                            )}
                            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-purple-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    ))}

                    {/* Add placeholder */}
                    <div
                        onClick={openCreate}
                        className="bg-gray-50 rounded-[2.5rem] border-4 border-dashed border-gray-200 flex flex-col items-center justify-center p-8 text-gray-400 hover:border-purple-300 hover:bg-purple-50/30 transition-all cursor-pointer group min-h-[280px]"
                    >
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4 group-hover:bg-purple-100 group-hover:text-purple-600 transition-all"><Plus size={32} /></div>
                        <p className="text-[10px] font-black uppercase tracking-widest">YENİ PERSONEL EKLE</p>
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-white flex items-center justify-between" style={{ backgroundColor: editing.color ?? '#9333ea' }}>
                            <div>
                                <h2 className="text-lg font-black">{isEdit ? 'Personel Düzenle' : 'Yeni Personel'}</h2>
                                <p className="text-white/70 text-xs mt-1">
                                    {isEdit
                                        ? 'Kullanıcı Yönetimi ile aynı kayıt; prim ve uzmanlık burada güncellenir.'
                                        : 'Yeni kart yalnızca güzellikte kullanılır; asıl personel Kullanıcı Yönetimi’nden eklenir.'}
                                </p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-xl transition"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Tam Ad <span className="text-red-500">*</span></label>
                                <Input value={editing.name ?? ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="Zahra" className="border-slate-200 rounded-xl focus:border-purple-400" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Telefon</label>
                                    <Input value={editing.phone ?? ''} onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))} placeholder="05xx xxx xx xx" className="border-slate-200 rounded-xl focus:border-purple-400" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">E-posta</label>
                                    <Input type="email" value={editing.email ?? ''} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} placeholder="ayse@klinik.com" className="border-slate-200 rounded-xl focus:border-purple-400" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Uzmanlık</label>
                                    <Input value={editing.specialty ?? ''} onChange={e => setEditing(p => ({ ...p, specialty: e.target.value }))} placeholder="Lazer Uzmanı" className="border-slate-200 rounded-xl focus:border-purple-400" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Prim (%)</label>
                                    <Input type="number" min={0} max={100} value={editing.commission_rate ?? 0} onChange={e => setEditing(p => ({ ...p, commission_rate: Number(e.target.value) }))} className="border-slate-200 rounded-xl focus:border-purple-400" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Renk</label>
                                <div className="flex gap-2 flex-wrap">
                                    {SPECIALIST_COLORS.map(color => (
                                        <button key={color} onClick={() => setEditing(p => ({ ...p, color }))} className={`w-8 h-8 rounded-full transition-all ${editing.color === color ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'opacity-70 hover:opacity-100'}`} style={{ backgroundColor: color }} />
                                    ))}
                                </div>
                            </div>
                            {isEdit && (
                                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <input type="checkbox" checked={editing.is_active ?? true} onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))} className="w-5 h-5 rounded text-purple-600" />
                                    <span className="text-sm font-bold text-gray-900 uppercase">Aktif</span>
                                </div>
                            )}
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 rounded-xl border-slate-200 font-bold">İptal</Button>
                            <Button onClick={handleSave} disabled={!editing.name?.trim() || saving} className="flex-1 rounded-xl text-white font-bold" style={{ backgroundColor: editing.color ?? '#9333ea' }}>
                                <Save size={16} className="mr-2" />{saving ? 'Kaydediliyor...' : 'Kaydet'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
