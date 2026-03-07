import React from 'react';
import {
    Building2, Users, PieChart, BarChart2,
    Brain, FileText, LayoutDashboard, Search,
    ArrowRight, Sparkles, TrendingUp, Calendar
} from 'lucide-react';

interface ReportCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    category: 'logo' | 'nebim' | 'ai';
    onClick: () => void;
}

const ReportCard = ({ title, description, icon, category, onClick }: ReportCardProps) => (
    <button
        onClick={onClick}
        className="group bg-white p-6 rounded-2xl border border-gray-200 hover:border-indigo-300 hover:shadow-xl transition-all text-left relative overflow-hidden"
    >
        <div className={`absolute top-0 left-0 w-1 h-full ${category === 'logo' ? 'bg-orange-500' :
                category === 'nebim' ? 'bg-blue-600' : 'bg-purple-600'
            }`} />

        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${category === 'logo' ? 'bg-orange-50' :
                    category === 'nebim' ? 'bg-blue-50' : 'bg-purple-50'
                }`}>
                {icon}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 group-hover:text-indigo-600 transition-colors">
                {category === 'logo' ? 'Logo Standart' :
                    category === 'nebim' ? 'Nebim Standardı' : 'AI Analitiği'}
            </span>
        </div>

        <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{title}</h3>
        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{description}</p>

        <div className="mt-4 flex items-center text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
            Raporu Aç <ArrowRight className="w-3 h-3 ml-1" />
        </div>
    </button>
);

export function UniversalReportHub({ onNavigate }: { onNavigate: (screen: string) => void }) {
    return (
        <div className="h-full bg-gray-50 flex flex-col">
            <div className="bg-white border-b px-8 py-6 shadow-sm">
                <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                    <LayoutDashboard className="w-8 h-8 text-indigo-600" />
                    Evrensel Rapor Merkezi (HUB)
                </h1>
                <p className="text-sm text-gray-500 mt-1">Logo ERP ve Nebim V3 standartlarını AI zekasıyla birleştiren rapor kütüphanesi</p>
            </div>

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-7xl mx-auto space-y-10">

                    {/* AI-First Insights Section */}
                    <section>
                        <div className="flex items-center gap-2 mb-6">
                            <Sparkles className="w-5 h-5 text-purple-600" />
                            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-widest text-[12px]">AI Destekli Akıllı Analizler</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <ReportCard
                                title="AI Stok Tahmin Motoru"
                                description="Satış trendlerine göre 30 günlük talep projeksiyonu ve tükenme riski."
                                icon={<Brain className="w-6 h-6 text-purple-600" />}
                                category="ai"
                                onClick={() => onNavigate('ai-stock-prediction')}
                            />
                            <ReportCard
                                title="Büyük Veri (Big Data) Özetleri"
                                description={'Yapay zeka tarafından hazırlanan "Yönetici Özeti" ve anomali tespitleri.'}
                                icon={<TrendingUp className="w-6 h-6 text-purple-600" />}
                                category="ai"
                                onClick={() => { }}
                            />
                        </div>
                    </section>

                    {/* Logo ERP Section */}
                    <section>
                        <div className="flex items-center gap-2 mb-6">
                            <Building2 className="w-5 h-5 text-orange-500" />
                            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-widest text-[12px]">Logo ERP Standart Raporları</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <ReportCard
                                title="Malzeme Hareket Ekstresi"
                                description={'Logo "Malzeme Ekstresi" yapısında yürüyen bakiye takibi.'}
                                icon={<FileText className="w-6 h-6 text-orange-600" />}
                                category="logo"
                                onClick={() => onNavigate('material-extract')}
                            />
                            <ReportCard
                                title="Gelişmiş Mizan (Genel)"
                                description="Borç/Alacak/Bakiye mantığıyla tam finansal kontrol."
                                icon={<PieChart className="w-6 h-6 text-orange-600" />}
                                category="logo"
                                onClick={() => onNavigate('mizan')}
                            />
                            <ReportCard
                                title="Cari Hesap Ekstresi"
                                description="Müşteri ve satıcı hesaplarının detaylı hareket dökümü."
                                icon={<Users className="w-6 h-6 text-orange-600" />}
                                category="logo"
                                onClick={() => onNavigate('customer-extract')}
                            />
                        </div>
                    </section>

                    {/* Nebim V3 Section */}
                    <section>
                        <div className="flex items-center gap-2 mb-6">
                            <BarChart2 className="w-5 h-5 text-blue-600" />
                            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-widest text-[12px]">Nebim V3 Perakende Analizleri</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <ReportCard
                                title="Mağaza Satış Performansı"
                                description="Nebim standardında mağaza karşılaştırmalı ciro ve trafik analizi."
                                icon={<BarChart2 className="w-6 h-6 text-blue-600" />}
                                category="nebim"
                                onClick={() => onNavigate('store-performance')}
                            />
                            <ReportCard
                                title="Envanter Yaşlandırma Raporu"
                                description="Stokların depoda bekleme sürelerine göre yaşlandırma analizi."
                                icon={<Calendar className="w-6 h-6 text-blue-600" />}
                                category="nebim"
                                onClick={() => onNavigate('inventory-aging')}
                            />
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
}


