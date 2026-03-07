
import React, { useState } from 'react';
import {
    User, Mail, Phone, Award, Plus, Edit2,
    Trash2, Search, UserCheck, UserX, BarChart2,
    DollarSign, Star, Calendar
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { BeautySpecialist } from '../../../types/beauty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';
import '../ClinicStyles.css';

export function StaffManagement() {
    const { specialists, isLoading } = useBeautyStore();
    const [searchTerm, setSearchTerm] = useState('');

    const filteredStaff = specialists.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.role.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getRoleBadgeColor = (role: string) => {
        const r = role.toLowerCase();
        if (r.includes('uzman') || r.includes('specialist')) return 'bg-blue-100 text-blue-700 border-blue-200';
        if (r.includes('yönetici') || r.includes('admin') || r.includes('manager')) return 'bg-purple-100 text-purple-700 border-purple-200';
        return 'bg-gray-100 text-gray-700 border-gray-200';
    };

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Personel Yönetimi</h1>
                    <p className="text-sm text-gray-500 mt-1">Ekibinizi yönetin, prim oranlarını ve performanslarını takip edin.</p>
                </div>
                <Button className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-6 rounded-2xl shadow-lg shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-2">
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
                        <p className="text-2xl font-black text-gray-900">{specialists.filter(s => s.active).length} KİŞİ</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
                        <Star size={28} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">AYIN UZMANI</p>
                        <p className="text-lg font-black text-gray-900 uppercase">GİZEM NUR ÜNLÜ</p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredStaff.map(staff => (
                    <div
                        key={staff.id}
                        className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 p-8 group relative overflow-hidden"
                    >
                        <div className="flex items-start justify-between mb-6 relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-[2rem] flex items-center justify-center text-purple-600 font-black text-2xl shadow-inner border border-white relative">
                                    {staff.name.split(' ').map(n => n[0]).join('')}
                                    {staff.active && (
                                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-white"></div>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 leading-tight uppercase group-hover:text-purple-600 transition-colors">
                                        {staff.name}
                                    </h3>
                                    <span className={cn(
                                        "inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mt-2 border",
                                        getRoleBadgeColor(staff.role)
                                    )}>
                                        {staff.role}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <button className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:bg-purple-600 hover:text-white transition-all shadow-sm">
                                    <Edit2 size={18} />
                                </button>
                                <button className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4 mb-8 relative z-10">
                            <div className="flex items-center gap-3 text-gray-500 group/item">
                                <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center group-hover/item:bg-purple-50 group-hover/item:text-purple-600 transition-colors">
                                    <Phone size={14} />
                                </div>
                                <span className="text-xs font-bold font-mono">{staff.phone}</span>
                            </div>
                            <div className="flex items-center gap-3 text-gray-500 group/item">
                                <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center group-hover/item:bg-purple-50 group-hover/item:text-purple-600 transition-colors">
                                    <Mail size={14} />
                                </div>
                                <span className="text-xs font-bold lowercase truncate max-w-[200px]">{staff.email || '—'}</span>
                            </div>
                            <div className="flex items-center gap-3 text-purple-600 bg-purple-50/50 p-4 rounded-3xl border border-purple-100 group-hover:bg-purple-600 group-hover:text-white transition-all duration-300">
                                <div className="w-10 h-10 rounded-2xl bg-white/50 backdrop-blur-sm flex items-center justify-center shadow-sm">
                                    <BarChart2 size={20} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1 opacity-70">PRİM ORANI</p>
                                    <p className="text-2xl font-black tracking-tight leading-none">%{staff.commission_rate}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 relative z-10">
                            <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100 group-hover:bg-white transition-colors duration-300 text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">BU GÜN</p>
                                <p className="text-lg font-black text-gray-900 leading-none">8 RANDEVU</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100 group-hover:bg-white transition-colors duration-300 text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">HAFTALIK</p>
                                <p className="text-lg font-black text-gray-900 leading-none">42 SEANS</p>
                            </div>
                        </div>

                        {/* Background Decor */}
                        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-purple-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                ))}
            </div>
        </div>
    );
}



