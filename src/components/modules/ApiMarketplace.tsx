// src/components/ApiMarketplace.tsx
import React, { useState, useEffect } from 'react';
import { Package, Globe, Check, Star, Download, ShieldCheck, Zap, ArrowUpRight, Search } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

interface Integration {
    id: string;
    name: string;
    slug: string;
    description: string;
    category: string;
    logo_url?: string;
    is_free: boolean;
    install_count: number;
    rating: number;
}

export function ApiMarketplace() {
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all');

    useEffect(() => {
        loadIntegrations();
    }, []);

    const loadIntegrations = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('api_integrations')
                .select('*');

            if (error) throw error;
            setIntegrations(data || []);
        } catch (err) {
            console.error('Failed to load integrations:', err);
        } finally {
            setLoading(false);
        }
    };

    const categories = ['Tümü', 'Accounting', 'Ecommerce', 'Shipping', 'Payment'];

    return (
        <div className="min-h-screen bg-slate-50 p-8">
            {/* Hero Header */}
            <div className="max-w-7xl mx-auto mb-12">
                <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-indigo-800 rounded-[2.5rem] p-12 relative overflow-hidden shadow-2xl shadow-indigo-200">
                    <div className="relative z-10 max-w-2xl">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600/30 backdrop-blur-md rounded-full text-indigo-100 text-sm font-bold mb-6 border border-white/10">
                            <Zap className="w-4 h-4" />
                            API Marketplace
                        </div>
                        <h1 className="text-5xl font-extrabold text-white leading-tight mb-6">
                            Sisteminizi <span className="text-indigo-300">Güçlendirin</span>
                        </h1>
                        <p className="text-indigo-100 text-lg mb-8 leading-relaxed">
                            Resmi entegrasyonlar, topluluk eklentileri ve özel API'ler ile EX-ROSERP deneyiminizi bir üst seviyeye taşıyın.
                        </p>
                        <div className="flex items-center gap-4">
                            <div className="flex -space-x-3">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="w-10 h-10 rounded-full border-2 border-indigo-700 bg-indigo-300 flex items-center justify-center text-[10px] font-bold">
                                        LOGO
                                    </div>
                                ))}
                            </div>
                            <p className="text-indigo-200 text-sm">
                                <span className="text-white font-bold">50+</span> aktif entegrasyon
                            </p>
                        </div>
                    </div>

                    <Package className="absolute right-0 bottom-0 w-80 h-80 text-white opacity-5 -mr-20 -mb-20 transform rotate-12" />
                </div>
            </div>

            {/* Grid Controls */}
            <div className="max-w-7xl mx-auto mb-8 flex items-center justify-between">
                <div className="flex items-center gap-2 p-1 bg-white rounded-2xl shadow-sm border border-slate-200">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveTab(cat.toLowerCase())}
                            className={`px-6 py-2.5 rounded-xl transition-all font-semibold ${activeTab === cat.toLowerCase()
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="relative w-72">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Entegrasyon ara..."
                        className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:border-indigo-500 transition-all outline-none"
                    />
                </div>
            </div>

            {/* Integrations Grid */}
            <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {loading ? (
                        [1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="h-64 bg-white rounded-[2rem] animate-pulse border border-slate-100 shadow-sm" />
                        ))
                    ) : (
                        integrations.map(item => (
                            <div key={item.id} className="group bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-500 transform hover:-translate-y-2 relative overflow-hidden">
                                <div className="flex items-start justify-between mb-6">
                                    <div className="p-4 bg-slate-50 rounded-2xl group-hover:bg-indigo-50 transition-colors">
                                        <Globe className="w-10 h-10 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold mb-2 ${item.is_free ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                            {item.is_free ? 'ÜCRETSİZ' : 'PRO'}
                                        </span>
                                        <div className="flex items-center gap-1 text-amber-400">
                                            <Star className="w-4 h-4 fill-current" />
                                            <span className="text-slate-900 font-bold text-sm tracking-tight">{item.rating}</span>
                                        </div>
                                    </div>
                                </div>

                                <h3 className="text-xl font-extrabold text-slate-900 mb-2 truncate">{item.name}</h3>
                                <p className="text-slate-500 text-sm leading-relaxed mb-8 line-clamp-2">
                                    {item.description}
                                </p>

                                <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <Download className="w-4 h-4" />
                                        <span className="text-xs font-bold uppercase tracking-widest">{item.install_count} Yükleme</span>
                                    </div>
                                    <button className="flex items-center gap-2 p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all">
                                        <span className="text-xs font-bold px-2">KUR</span>
                                        <ArrowUpRight className="w-4 h-4" />
                                    </button>
                                </div>

                                <ShieldCheck className="absolute -top-4 -right-4 w-12 h-12 text-green-500/10 group-hover:text-green-500/20 transition-all" />
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

