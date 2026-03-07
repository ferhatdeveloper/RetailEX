import React, { useState, useEffect } from 'react';
import {
    BarChart2, TrendingUp, ShoppingBag,
    MapPin, Sparkles, AlertCircle
} from 'lucide-react';
import { dynamicReportEngine, ReportRow } from '../../../services/reports/DynamicReportEngine';
import { aiReportService, AIInsight } from '../../../services/ai/AIReportService';
import { formatNumber } from '../../../utils/formatNumber';

export function StorePerformanceAnalysis() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ReportRow[]>([]);
    const [insights, setInsights] = useState<AIInsight[]>([]);

    const loadData = async () => {
        setLoading(true);
        try {
            const stats = await dynamicReportEngine.getStorePerformanceAnalysis();
            setData(stats);

            const aiInsights = await aiReportService.detectAnomalies('sales');
            setInsights(aiInsights);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Nebim Style Header */}
            <div className="bg-blue-600 text-white p-6 shadow-lg">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <BarChart2 className="w-6 h-6" />
                            Mağaza Satış Performans Analizi (Nebim Style)
                        </h1>
                        <p className="text-xs text-blue-100 mt-1 uppercase tracking-widest font-medium">Satış Verimliliği ve Trafik Projeksiyonu</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-700/50 px-4 py-2 rounded-lg border border-blue-500/30">
                            <p className="text-[10px] text-blue-200 uppercase font-bold">Toplam Ciro</p>
                            <p className="text-xl font-black">{formatNumber(data.reduce((s, r) => s + (r.total_revenue || 0), 0), 0, false)} <span className="text-xs">IQD</span></p>
                        </div>
                        <button onClick={loadData} className="p-3 bg-white text-blue-600 rounded-full hover:scale-105 transition-transform shadow-md">
                            <TrendingUp className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* AI Intelligence Layer */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.map((insight, idx) => (
                    <div key={idx} className={`p-4 rounded-xl border-l-4 flex gap-3 shadow-sm ${insight.severity === 'warning' ? 'bg-orange-50 border-orange-500' : 'bg-green-50 border-green-500'
                        }`}>
                        <div className={`p-2 rounded-lg ${insight.severity === 'warning' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-gray-800">{insight.message}</h4>
                            <p className="text-xs text-gray-600 mt-1 italic leading-relaxed">{insight.description}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Performance Grid */}
            <div className="flex-1 overflow-auto px-6 pb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {data.map((store, idx) => (
                        <div key={idx} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow group">
                            <div className="bg-gray-50 p-4 border-b flex justify-between items-center group-hover:bg-blue-50 transition-colors">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                                    <span className="font-bold text-gray-700">{store.store_name}</span>
                                </div>
                                <div className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-black uppercase">Aktif</div>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="flex justify-between items-end border-b pb-4">
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Toplam Ciro</p>
                                        <p className="text-2xl font-black text-gray-900">{formatNumber(store.total_revenue, 0, false)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Birim</p>
                                        <p className="text-xs text-gray-500">IQD</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-50 p-3 rounded-xl border">
                                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1"><ShoppingBag className="w-3 h-3" /> Fiş Sayısı</p>
                                        <p className="text-lg font-bold text-gray-800">{store.ticket_count}</p>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-xl border">
                                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Sepet Ort.</p>
                                        <p className="text-lg font-bold text-gray-800">{formatNumber(store.basket_average, 0, false)}</p>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase mb-2">
                                        <span>Hedef Uyumu</span>
                                        <span className="text-blue-600">82%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="w-[82%] h-full bg-blue-500 rounded-full"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}


