import React, { useState, useEffect } from 'react';
import {
    Brain, TrendingUp, AlertTriangle, ShoppingCart,
    BarChart2, Search, RefreshCcw
} from 'lucide-react';
import { aiPredictionService, PredictionResult } from '../../../services/ai/AIPredictionService';
import { formatNumber } from '../../../utils/formatNumber';
import { useLanguage } from '../../../contexts/LanguageContext';

export function AIStockPredictionModule() {
    const { tm } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [predictions, setPredictions] = useState<PredictionResult[]>([]);
    const [filter, setFilter] = useState('');

    const loadPredictions = async () => {
        setLoading(true);
        try {
            const data = await aiPredictionService.getStockPredictions();
            setPredictions(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPredictions();
    }, []);

    const filteredData = predictions.filter(p =>
        p.product_name.toLowerCase().includes(filter.toLowerCase())
    );

    const criticalRisks = predictions.filter(p => p.risk_level === 'critical').length;

    return (
        <div className="h-full flex flex-col bg-gray-50">
            <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <div className="bg-purple-100 p-2 rounded-lg">
                        <Brain className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">{tm('aiStockTitle')}</h1>
                        <p className="text-sm text-gray-500">{tm('aiStockSubtitle')}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                        <input
                            placeholder={tm('aiStockSearchPlaceholder')}
                            className="pl-9 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none w-64"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={loadPredictions}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors border"
                    >
                        <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                        <p className="text-sm text-gray-500">{tm('aiStockCriticalRisk')}</p>
                        <div className="flex items-end gap-2 mt-2">
                            <span className="text-3xl font-bold text-red-600">{criticalRisks}</span>
                            <span className="text-sm text-red-400 mb-1">{tm('product')}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-1 text-xs text-red-600 bg-red-50 p-1.5 rounded">
                            <AlertTriangle className="w-3 h-3" />
                            {tm('aiStockUrgentOrder')}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                        <p className="text-sm text-gray-500">{tm('aiStockDemand30d')}</p>
                        <div className="flex items-end gap-2 mt-2">
                            <span className="text-3xl font-bold text-indigo-600">
                                {formatNumber(predictions.reduce((s, p) => s + p.predicted_sales_30d, 0), 0, false)}
                            </span>
                            <span className="text-sm text-indigo-400 mb-1">{tm('unit')}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 p-1.5 rounded">
                            <TrendingUp className="w-3 h-3" />
                            {tm('aiStockHistoryProjection')}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                        <p className="text-sm text-gray-500">{tm('aiStockInvestment')}</p>
                        <div className="flex items-end gap-2 mt-2">
                            <span className="text-3xl font-bold text-green-600">6.4M</span>
                            <span className="text-sm text-green-400 mb-1">IQD</span>
                        </div>
                        <div className="mt-3 flex items-center gap-1 text-xs text-green-600 bg-green-50 p-1.5 rounded">
                            <ShoppingCart className="w-3 h-3" />
                            {tm('aiStockOptimizedList')}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                        <p className="text-sm text-gray-500">{tm('aiStockAnalysisWindow')}</p>
                        <div className="flex items-end gap-2 mt-2">
                            <span className="text-3xl font-bold text-gray-900">90</span>
                            <span className="text-sm text-gray-400 mb-1">{tm('days')}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-1 text-xs text-gray-600 bg-gray-50 p-1.5 rounded">
                            <BarChart2 className="w-3 h-3" />
                            {tm('aiStockDeepLearning')}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr className="text-left">
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">{tm('aiStockProductInfo')}</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">{tm('aiStockAvgDaily')}</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">{tm('currentStock')}</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">{tm('aiStockOutRisk')}</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">{tm('aiStockSuggestion30d')}</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">{tm('actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredData.map(p => (
                                <tr key={p.product_id} className="hover:bg-purple-50/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div>
                                            <p className="font-bold text-gray-900">{p.product_name}</p>
                                            <p className="text-xs text-gray-400">SKU: {p.product_id.split('-')[0]}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="font-mono text-gray-600">{formatNumber(p.avg_daily_sales, 1, false)}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center font-bold text-gray-900">
                                        {p.current_stock}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col items-center">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${p.risk_level === 'critical' ? 'bg-red-100 text-red-700' :
                                                    p.risk_level === 'high' ? 'bg-orange-100 text-orange-700' :
                                                        p.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                                                }`}>
                                                {p.stock_out_days === null
                                                    ? tm('aiStockNoDemand')
                                                    : tm('aiStockDaysLeft').replace('{n}', String(p.stock_out_days))}
                                            </span>
                                            <div className="w-16 h-1 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                                <div className={`h-full ${p.risk_level === 'critical' ? 'w-full bg-red-500' :
                                                        p.risk_level === 'high' ? 'w-3/4 bg-orange-500' :
                                                            p.risk_level === 'medium' ? 'w-1/2 bg-yellow-500' : 'w-1/4 bg-green-500'
                                                    }`}></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex flex-col items-center">
                                            <span className="text-indigo-600 font-bold">+{p.suggested_order_qty}</span>
                                            <span className="text-[10px] text-gray-400">{tm('aiStockNewOrder')}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="px-4 py-2 bg-white border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-600 hover:text-white transition-all text-xs font-bold">
                                            {tm('aiStockDraftOrder')}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
