import React from 'react';
import {
    Building2, Users, PieChart, BarChart2,
    Brain, FileText, LayoutDashboard,
    ArrowRight, Sparkles, TrendingUp, Calendar
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface ReportCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    category: 'logo' | 'nebim' | 'ai';
    categoryLabel: string;
    openLabel: string;
    onClick: () => void;
}

const ReportCard = ({ title, description, icon, category, categoryLabel, openLabel, onClick }: ReportCardProps) => (
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
                {categoryLabel}
            </span>
        </div>

        <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{title}</h3>
        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{description}</p>

        <div className="mt-4 flex items-center text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
            {openLabel} <ArrowRight className="w-3 h-3 ml-1" />
        </div>
    </button>
);

export function UniversalReportHub({ onNavigate }: { onNavigate: (screen: string) => void }) {
    const { tm } = useLanguage();

    const catLabel = (c: 'logo' | 'nebim' | 'ai') =>
        c === 'logo' ? tm('hubCatLogo') : c === 'nebim' ? tm('hubCatNebim') : tm('hubCatAi');

    return (
        <div className="h-full bg-gray-50 flex flex-col">
            <div className="bg-white border-b px-8 py-6 shadow-sm">
                <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                    <LayoutDashboard className="w-8 h-8 text-indigo-600" />
                    {tm('hubTitle')}
                </h1>
                <p className="text-sm text-gray-500 mt-1">{tm('hubSubtitle')}</p>
            </div>

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-7xl mx-auto space-y-10">

                    <section>
                        <div className="flex items-center gap-2 mb-6">
                            <Sparkles className="w-5 h-5 text-purple-600" />
                            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-widest text-[12px]">{tm('hubAiSection')}</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <ReportCard
                                title={tm('hubAiStockTitle')}
                                description={tm('hubAiStockDesc')}
                                icon={<Brain className="w-6 h-6 text-purple-600" />}
                                category="ai"
                                categoryLabel={catLabel('ai')}
                                openLabel={tm('hubOpenReport')}
                                onClick={() => onNavigate('ai-stock-prediction')}
                            />
                            <ReportCard
                                title={tm('hubBigDataTitle')}
                                description={tm('hubBigDataDesc')}
                                icon={<TrendingUp className="w-6 h-6 text-purple-600" />}
                                category="ai"
                                categoryLabel={catLabel('ai')}
                                openLabel={tm('hubOpenReport')}
                                onClick={() => { }}
                            />
                        </div>
                    </section>

                    <section>
                        <div className="flex items-center gap-2 mb-6">
                            <Building2 className="w-5 h-5 text-orange-500" />
                            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-widest text-[12px]">{tm('hubLogoSection')}</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <ReportCard
                                title={tm('hubMaterialTitle')}
                                description={tm('hubMaterialDesc')}
                                icon={<FileText className="w-6 h-6 text-orange-600" />}
                                category="logo"
                                categoryLabel={catLabel('logo')}
                                openLabel={tm('hubOpenReport')}
                                onClick={() => onNavigate('material-extract')}
                            />
                            <ReportCard
                                title={tm('hubMizanTitle')}
                                description={tm('hubMizanDesc')}
                                icon={<PieChart className="w-6 h-6 text-orange-600" />}
                                category="logo"
                                categoryLabel={catLabel('logo')}
                                openLabel={tm('hubOpenReport')}
                                onClick={() => onNavigate('mizan')}
                            />
                            <ReportCard
                                title={tm('hubCariTitle')}
                                description={tm('hubCariDesc')}
                                icon={<Users className="w-6 h-6 text-orange-600" />}
                                category="logo"
                                categoryLabel={catLabel('logo')}
                                openLabel={tm('hubOpenReport')}
                                onClick={() => onNavigate('customer-extract')}
                            />
                        </div>
                    </section>

                    <section>
                        <div className="flex items-center gap-2 mb-6">
                            <BarChart2 className="w-5 h-5 text-blue-600" />
                            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-widest text-[12px]">{tm('hubNebimSection')}</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <ReportCard
                                title={tm('hubStoreTitle')}
                                description={tm('hubStoreDesc')}
                                icon={<BarChart2 className="w-6 h-6 text-blue-600" />}
                                category="nebim"
                                categoryLabel={catLabel('nebim')}
                                openLabel={tm('hubOpenReport')}
                                onClick={() => onNavigate('store-performance')}
                            />
                            <ReportCard
                                title={tm('hubAgingTitle')}
                                description={tm('hubAgingDesc')}
                                icon={<Calendar className="w-6 h-6 text-blue-600" />}
                                category="nebim"
                                categoryLabel={catLabel('nebim')}
                                openLabel={tm('hubOpenReport')}
                                onClick={() => onNavigate('inventory-aging')}
                            />
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
}
