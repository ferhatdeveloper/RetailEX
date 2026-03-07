import React from 'react';
import {
    Package, Plus, Search, Layers,
    CreditCard, CheckCircle2, AlertCircle,
    ChevronRight, Info, Zap
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function PackageManagement() {
    return (
        <div className="flex flex-col h-full bg-[#f8fafc] animate-in fade-in duration-500">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                        <Package size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Paket Yönetimi</h1>
                        <p className="text-xs text-slate-500 font-medium">Aktif kampanya ve hizmet paketleri</p>
                    </div>
                </div>
                <Button className="h-10 rounded-xl px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
                    <Plus size={18} /> Yeni Paket Oluştur
                </Button>
            </div>

            {/* Content Swiper / Grid */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {[
                        { title: '8 Seans Lazer Epilasyon', price: '12.450', count: '8 Seans', color: 'bg-purple-600' },
                        { title: 'Cilt Bakımı Paketi', price: '4.200', count: '4 Seans', color: 'bg-indigo-600' },
                        { title: 'Zayıflama Kürü (G5)', price: '8.150', count: '10 Seans', color: 'bg-pink-600' },
                        { title: 'Dermalift Bakım', price: '3.500', count: '3 Seans', color: 'bg-blue-600' },
                        { title: 'Kalıcı Makyaj Paketi', price: '5.250', count: '1 İşlem + 2 Rötuş', color: 'bg-rose-600' },
                        { title: 'Vücut Analizi & Detoks', price: '1.850', count: '5 İşlem', color: 'bg-teal-600' },
                    ].map((pkg, i) => (
                        <Card key={i} className="group overflow-hidden rounded-[2rem] border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                            <div className={`${pkg.color} p-6 text-white relative h-40 flex flex-col justify-between overflow-hidden`}>
                                <div className="absolute -right-4 -top-4 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                                <div className="flex justify-between items-start relative z-10">
                                    <Badge className="bg-white/20 text-white border-none py-1 px-3">Kampanya</Badge>
                                    <Zap size={20} className="text-white/40" />
                                </div>
                                <div className="relative z-10">
                                    <h3 className="text-xl font-black">{pkg.title}</h3>
                                    <p className="text-white/80 text-xs font-bold uppercase tracking-widest mt-1 opacity-75">{pkg.count}</p>
                                </div>
                            </div>
                            <div className="p-6 flex flex-col gap-4">
                                <div className="flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paket Fiyatı</span>
                                        <span className="text-2xl font-black text-slate-900 leading-none mt-1">₺{pkg.price}</span>
                                    </div>
                                    <div className="flex -space-x-2">
                                        {[1, 2, 3].map(j => (
                                            <div key={j} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                                {j}
                                            </div>
                                        ))}
                                        <div className="w-8 h-8 rounded-full border-2 border-white bg-indigo-50 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                                            +12
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                                        <CheckCircle2 size={14} className="text-green-500" /> Tüm bölgeler dahil
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                                        <CheckCircle2 size={14} className="text-green-500" /> Ücretsiz cilt analizi
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-600 font-medium opacity-50">
                                        <AlertCircle size={14} /> Hafta içi geçerli
                                    </div>
                                </div>

                                <Button className="w-full h-12 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 font-bold transition-all text-sm mt-2">
                                    Detayları Görüntüle
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}


