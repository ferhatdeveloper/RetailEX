import React from 'react';
import {
    Users, Search, Plus, Filter, MoreVertical,
    Phone, Mail, Calendar, CreditCard, ChevronRight,
    Star, Clock, Tag
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function ClientCRM() {
    return (
        <div className="flex flex-col h-full bg-[#f8fafc] animate-in fade-in duration-500">
            {/* Header / Stats Overlay */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600">
                        <Users size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Müşteri İlişkileri (CRM)</h1>
                        <p className="text-xs text-slate-500 font-medium">Toplam 1,280 kayıtlı müşteri</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="h-10 rounded-xl px-4 border-slate-200 text-slate-600 font-semibold gap-2">
                        <Filter size={16} /> Filtrele
                    </Button>
                    <Button className="h-10 rounded-xl px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold gap-2 shadow-lg shadow-purple-600/20 active:scale-95 transition-all">
                        <Plus size={18} /> Yeni Müşteri
                    </Button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex p-4 gap-4">
                {/* List Side */}
                <div className="w-full lg:w-3/5 bg-white rounded-3xl border border-slate-200 flex flex-col overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Ad, telefon veya email ile ara..."
                                className="w-full bg-slate-50 border-none rounded-xl h-11 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-500/20 transition-all text-slate-700 placeholder:text-slate-400"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50/50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">Müşteri</th>
                                    <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">İletişim</th>
                                    <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">Son İşlem</th>
                                    <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">Statü</th>
                                    <th className="px-6 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                                    <tr key={i} className="group hover:bg-slate-50/80 transition-colors cursor-pointer">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white">
                                                    {i === 1 ? 'AY' : i === 2 ? 'BK' : 'MA'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900 leading-tight">Müşteri Adı {i}</p>
                                                    <p className="text-[10px] text-slate-500 font-medium">Bakiye: ₺2,450</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                    <Phone size={12} className="text-slate-400" /> 0555 555 55 {i}{i}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                    <Mail size={12} className="text-slate-400" /> mail{i}@example.com
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-0.5">
                                                <p className="text-xs font-bold text-slate-700">Lazer Epilasyon</p>
                                                <p className="text-[10px] text-slate-500">12.02.2024</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge className={i % 3 === 0 ? "bg-amber-100 text-amber-700 border-none" : "bg-green-100 text-green-700 border-none"}>
                                                {i % 3 === 0 ? 'Pasif' : 'Aktif'}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <MoreVertical size={18} className="text-slate-400 group-hover:text-purple-500 transition-colors" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Info Side (Desktop Only) */}
                <div className="hidden lg:flex lg:w-2/5 flex-col gap-4 overflow-y-auto custom-scrollbar">
                    <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
                        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white relative">
                            <div className="relative z-10">
                                <Badge className="mb-2 bg-white/20 text-white border-none backdrop-blur-md">V.I.P Müşteri</Badge>
                                <h2 className="text-2xl font-black italic tracking-tighter">AYŞE YILMAZ</h2>
                                <p className="text-white/80 text-xs font-medium mt-1">Sistem Kayıt No: #REX-2024-001</p>
                            </div>
                            <Users className="absolute -bottom-4 -right-4 w-32 h-32 text-white/10" />
                        </div>
                        <div className="p-6 grid grid-cols-2 gap-4">
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <Star className="text-amber-500 mb-1" size={16} />
                                <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Sadakat Puanı</p>
                                <p className="text-lg font-black text-slate-900">4,250</p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <CreditCard className="text-purple-500 mb-1" size={16} />
                                <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Toplam Harcama</p>
                                <p className="text-lg font-black text-slate-900">₺12,450</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="rounded-3xl border-slate-200 p-6 shadow-sm">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4">Yaklaşan Hizmetler</h3>
                        <div className="space-y-4">
                            {[1, 2].map(i => (
                                <div key={i} className="flex gap-4 group cursor-pointer">
                                    <div className="w-12 h-12 bg-purple-50 rounded-2xl flex flex-col items-center justify-center text-purple-600 shrink-0 group-hover:bg-purple-600 group-hover:text-white transition-all">
                                        <span className="text-[10px] font-black leading-none">ŞUB</span>
                                        <span className="text-lg font-black leading-none mt-0.5">2{i}</span>
                                    </div>
                                    <div className="flex-1 border-b border-slate-100 pb-3">
                                        <div className="flex justify-between items-start">
                                            <h4 className="text-sm font-bold text-slate-900">Cilt Bakımı (Hydrafacial)</h4>
                                            <span className="text-[10px] font-bold text-slate-400">14:30</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">Uzman: Elif Demir</p>
                                    </div>
                                    <ChevronRight size={18} className="text-slate-300 self-center" />
                                </div>
                            ))}
                        </div>
                        <Button variant="ghost" className="w-full mt-4 text-purple-600 font-bold text-xs hover:bg-purple-50 rounded-xl">
                            Tüm Randevuları Gör
                        </Button>
                    </Card>
                </div>
            </div>
        </div>
    );
}


