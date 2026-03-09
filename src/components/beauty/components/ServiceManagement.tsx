
import React, { useEffect, useState } from 'react';
import {
    Plus, Edit2, Trash2, Search, Scissors, Clock,
    Activity, X, Save
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { BeautyService, ServiceCategory } from '../../../types/beauty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';
import '../ClinicStyles.css';

const CATEGORY_LABELS: Record<string, string> = {
    laser: 'Lazer', hair_salon: 'Kuaför', beauty: 'Güzellik',
    hair_transplant: 'Saç Ekimi', botox: 'Botoks', filler: 'Dolgu',
    physical_therapy: 'Fizyoterapi', massage: 'Masaj', skincare: 'Cilt Bakımı',
    makeup: 'Makyaj', nails: 'Tırnak', spa: 'Spa',
};

const EMPTY_FORM: Partial<BeautyService> = {
    name: '', category: ServiceCategory.BEAUTY, duration_min: 60,
    price: 0, cost_price: 0, commission_rate: 0, color: '#9333ea',
    description: '', requires_device: false, is_active: true,
};

export function ServiceManagement() {
    const { services, isLoading, loadServices, createService, updateService, deleteService } = useBeautyStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyService>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    useEffect(() => { loadServices(); }, []);

    const categories = Object.values(ServiceCategory);

    const filteredServices = services.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const openCreate = () => { setEditing({ ...EMPTY_FORM }); setIsEdit(false); setShowModal(true); };
    const openEdit = (svc: BeautyService) => { setEditing({ ...svc }); setIsEdit(true); setShowModal(true); };

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            if (isEdit && editing.id) await updateService(editing.id, editing);
            else await createService(editing);
            setShowModal(false);
        } finally { setSaving(false); }
    };

    const handleDelete = async (id: string) => {
        await deleteService(id);
        setDeleteConfirm(null);
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(amount);

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Hizmet Tanımları</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {isLoading ? 'Yükleniyor...' : `${services.length} hizmet tanımlı`}
                    </p>
                </div>
                <Button
                    onClick={openCreate}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-6 rounded-2xl shadow-lg shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-2"
                >
                    <Plus size={20} />
                    <span>YENİ HİZMET EKLE</span>
                </Button>
            </div>

            {/* Filters & Search */}
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <Input
                            placeholder="Hizmet adı ile ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 h-12 bg-gray-50 border-gray-100 rounded-xl focus:ring-purple-500/10 focus:border-purple-500 transition-all font-medium"
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0 custom-scrollbar">
                        <button
                            onClick={() => setSelectedCategory('all')}
                            className={cn(
                                "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all uppercase tracking-wider",
                                selectedCategory === 'all'
                                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            )}
                        >TÜMÜ</button>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all uppercase tracking-wider",
                                    selectedCategory === cat
                                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                )}
                            >{CATEGORY_LABELS[cat] ?? cat}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Services Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {isLoading ? (
                    <div className="col-span-full py-20 text-center text-slate-400 text-sm">Yükleniyor...</div>
                ) : filteredServices.length === 0 ? (
                    <div className="col-span-full py-20 text-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4 text-gray-300">
                            <Scissors size={40} />
                        </div>
                        <h3 className="text-lg font-bold text-gray-400 uppercase tracking-widest">Hizmet Bulunamadı</h3>
                        <Button onClick={openCreate} variant="outline" className="mt-4 text-purple-600 border-purple-200 rounded-xl">
                            <Plus size={16} className="mr-2" /> İlk hizmeti ekle
                        </Button>
                    </div>
                ) : (
                    filteredServices.map(service => (
                        <div
                            key={service.id}
                            className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-6 group relative overflow-hidden"
                        >
                            <div
                                className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-10 blur-2xl transition-all group-hover:scale-150"
                                style={{ backgroundColor: service.color || '#9333ea' }}
                            />
                            <div className="flex justify-between items-start mb-4 relative z-10">
                                <div
                                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg"
                                    style={{ backgroundColor: service.color || '#9333ea', boxShadow: `0 8px 16px -4px ${service.color || '#9333ea'}40` }}
                                >
                                    <Activity size={24} />
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openEdit(service)}
                                        className="p-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-purple-100 hover:text-purple-600 transition-colors"
                                    ><Edit2 size={16} /></button>
                                    <button
                                        onClick={() => setDeleteConfirm(service.id)}
                                        className="p-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-red-100 hover:text-red-600 transition-colors"
                                    ><Trash2 size={16} /></button>
                                </div>
                            </div>
                            <div className="relative z-10">
                                <span className="text-[10px] font-black text-purple-600 uppercase tracking-[0.2em] mb-1 block">
                                    {CATEGORY_LABELS[service.category] ?? service.category}
                                </span>
                                <h3 className="text-lg font-bold text-gray-900 leading-tight uppercase group-hover:text-purple-600 transition-colors">
                                    {service.name}
                                </h3>
                                <div className="mt-6 flex items-center justify-between border-t border-gray-50 pt-4">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-gray-100 p-1.5 rounded-lg text-gray-500"><Clock size={14} /></div>
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter leading-none">SÜRE</p>
                                            <p className="text-sm font-bold text-gray-900">{service.duration_min} DK</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-tighter leading-none">FİYAT</p>
                                        <p className="text-xl font-black text-gray-900 tracking-tighter">{formatCurrency(service.price)}</p>
                                    </div>
                                </div>
                            </div>
                            {service.requires_device && (
                                <div className="mt-4 flex items-center gap-2 bg-blue-50/50 p-2 rounded-xl border border-blue-100">
                                    <Activity size={12} className="text-blue-600" />
                                    <span className="text-[10px] font-bold text-blue-600 uppercase">Cihaz Gerektirir</span>
                                </div>
                            )}
                            {!service.is_active && (
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-20">
                                    <div className="bg-gray-900 text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">PASİF</div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-[2rem] w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-8 text-white relative" style={{ backgroundColor: editing.color ?? '#9333ea' }}>
                            <h2 className="text-2xl font-bold uppercase tracking-tight">
                                {isEdit ? 'Hizmet Düzenle' : 'Yeni Hizmet Tanımla'}
                            </h2>
                            <p className="text-white/70 text-sm mt-1 uppercase font-bold tracking-widest">
                                {isEdit ? editing.name : 'Sistem genelinde kullanılacak yeni işlem'}
                            </p>
                            <button onClick={() => setShowModal(false)} className="absolute top-8 right-8 text-white/50 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-8 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hizmet Adı <span className="text-red-500">*</span></label>
                                    <Input
                                        value={editing.name ?? ''}
                                        onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                                        placeholder="Lazer Epilasyon"
                                        className="h-12 bg-gray-50 border-gray-100 rounded-xl focus:border-purple-500 font-bold"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Kategori</label>
                                    <select
                                        value={editing.category ?? ServiceCategory.BEAUTY}
                                        onChange={e => setEditing(p => ({ ...p, category: e.target.value }))}
                                        className="flex h-12 w-full rounded-xl border border-gray-100 bg-gray-50 px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/20"
                                    >
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{CATEGORY_LABELS[cat] ?? cat}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Süre (dk)</label>
                                    <Input type="number" min={5} value={editing.duration_min ?? 60} onChange={e => setEditing(p => ({ ...p, duration_min: Number(e.target.value) }))} className="h-12 bg-gray-50 border-gray-100 rounded-xl focus:border-purple-500 font-bold" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Fiyat (₺)</label>
                                    <Input type="number" min={0} value={editing.price ?? 0} onChange={e => setEditing(p => ({ ...p, price: Number(e.target.value) }))} className="h-12 bg-gray-50 border-gray-100 rounded-xl focus:border-purple-500 font-bold" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Maliyet (₺)</label>
                                    <Input type="number" min={0} value={editing.cost_price ?? 0} onChange={e => setEditing(p => ({ ...p, cost_price: Number(e.target.value) }))} className="h-12 bg-gray-50 border-gray-100 rounded-xl focus:border-purple-500 font-bold" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Prim Oranı (%)</label>
                                    <Input type="number" min={0} max={100} value={editing.commission_rate ?? 0} onChange={e => setEditing(p => ({ ...p, commission_rate: Number(e.target.value) }))} className="h-12 bg-gray-50 border-gray-100 rounded-xl focus:border-purple-500 font-bold" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Renk</label>
                                    <div className="flex items-center gap-3 h-12">
                                        <input type="color" value={editing.color ?? '#9333ea'} onChange={e => setEditing(p => ({ ...p, color: e.target.value }))} className="w-12 h-10 rounded-xl cursor-pointer border border-gray-200 bg-transparent" />
                                        <span className="text-xs font-mono text-gray-500">{editing.color ?? '#9333ea'}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Açıklama</label>
                                <textarea value={editing.description ?? ''} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Hizmet detayları..." className="w-full border border-gray-100 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 resize-none" />
                            </div>
                            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <input type="checkbox" checked={editing.requires_device ?? false} onChange={e => setEditing(p => ({ ...p, requires_device: e.target.checked }))} className="w-5 h-5 rounded-lg border-gray-300 text-purple-600 focus:ring-purple-500" />
                                <div>
                                    <p className="text-sm font-bold text-gray-900 uppercase">Cihaz Zorunlu</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Bu işlem için bir cihaz atanması gereklidir.</p>
                                </div>
                            </div>
                        </div>
                        <div className="px-8 pb-8 flex gap-4">
                            <Button onClick={() => setShowModal(false)} variant="outline" className="flex-1 h-12 rounded-2xl font-bold uppercase border-gray-200">İptal</Button>
                            <Button onClick={handleSave} disabled={!editing.name?.trim() || saving} className="flex-1 h-12 rounded-2xl font-bold uppercase text-white shadow-lg active:scale-95 transition-all" style={{ backgroundColor: editing.color ?? '#9333ea' }}>
                                <Save size={16} className="mr-2" />{saving ? 'Kaydediliyor...' : 'Kaydet'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 size={28} className="text-red-500" /></div>
                        <h3 className="text-lg font-black text-slate-900 mb-2">Hizmet Sil</h3>
                        <p className="text-sm text-slate-500 mb-6">Bu hizmeti silmek istediğinizden emin misiniz?</p>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-xl">İptal</Button>
                            <Button onClick={() => handleDelete(deleteConfirm)} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold">Sil</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
