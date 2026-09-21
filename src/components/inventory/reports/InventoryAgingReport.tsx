import React, { useState, useEffect, useMemo } from 'react';
import {
    Calendar, Clock, AlertTriangle,
    ArrowRight, Sparkles, Filter
} from 'lucide-react';
import { dynamicReportEngine, ReportRow } from '../../../services/reports/DynamicReportEngine';
import { aiReportService, AIInsight } from '../../../services/ai/AIReportService';
import { formatNumber } from '../../../utils/formatNumber';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';

export function InventoryAgingReport() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ReportRow[]>([]);
    const [agingInsights, setAgingInsights] = useState<AIInsight[]>([]);

    const loadData = async () => {
        setLoading(true);
        try {
            const stats = await dynamicReportEngine.getInventoryAging();
            setData(stats);

            const insights = await aiReportService.getInventoryAgingInsights();
            setAgingInsights(insights);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    type AgingGridRow = ReportRow & { status: string; product_code: string };

    const gridRows = useMemo<AgingGridRow[]>(
        () =>
            data.map((row) => ({
                ...row,
                status: row.aging_bucket,
                product_code: row.id.split('-')[0],
            })),
        [data],
    );

    const gridColumns = useMemo<ReportColumnTableCol<AgingGridRow>[]>(
        () => [
            {
                key: 'product_name',
                header: 'Ürün Adı',
                size: 220,
                cell: (row) => (
                    <div>
                        <span className="font-bold text-slate-900">{row.product_name}</span>
                        <span className="block text-[10px] text-slate-400 font-mono mt-0.5">{row.product_code}</span>
                    </div>
                ),
            },
            {
                key: 'current_stock',
                header: 'Bakiye',
                type: 'number',
                align: 'center',
                size: 100,
                footerSum: true,
            },
            {
                key: 'days_since_last_move',
                header: 'Son Hareket (Gün)',
                type: 'number',
                align: 'center',
                size: 140,
                cell: (row) => <span className="font-mono">{row.days_since_last_move || '0'}</span>,
            },
            {
                key: 'status',
                header: 'Yaşlandırma Durumu',
                size: 160,
                cell: (row) => (
                    <span
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                            row.aging_bucket.startsWith('Critical')
                                ? 'bg-red-100 text-red-600'
                                : row.aging_bucket.startsWith('Slow')
                                  ? 'bg-orange-100 text-orange-600'
                                  : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                        {row.aging_bucket}
                    </span>
                ),
            },
            {
                key: 'id',
                header: 'Eylem Önerisi',
                size: 120,
                align: 'right',
                cell: () => (
                    <button
                        type="button"
                        className="text-indigo-600 hover:text-indigo-800 font-bold text-xs flex items-center gap-1 justify-end ml-auto"
                    >
                        Detay <ArrowRight className="w-3 h-3" />
                    </button>
                ),
            },
        ],
        [],
    );

    return (
        <div className="h-full flex flex-col bg-slate-50">
            {/* Nebim Style Aging Header */}
            <div className="bg-slate-900 text-white p-6 shadow-xl border-b border-slate-700">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="bg-orange-500 p-3 rounded-2xl shadow-lg shadow-orange-500/20">
                            <Clock className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight uppercase">Envanter Yaşlandırma Raporu</h1>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Nebim V3 Standardı • Stok Devir Hızı Analizi</p>
                        </div>
                    </div>
                    <button onClick={loadData} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl transition-all border border-slate-700">
                        <Filter className="w-4 h-4" />
                        <span className="text-xs font-bold">Filtrele</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
                {/* AI Insight Section */}
                {agingInsights.map((insight, idx) => (
                    <div key={idx} className="bg-indigo-600 rounded-2xl p-6 text-white shadow-xl shadow-indigo-600/20 relative overflow-hidden group">
                        <div className="absolute -right-10 -top-10 opacity-10 group-hover:scale-110 transition-transform">
                            <Sparkles className="w-40 h-40" />
                        </div>
                        <div className="relative z-10 flex gap-4 items-start">
                            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="font-black uppercase tracking-widest text-xs flex items-center gap-2">
                                    AI Tasfiye Önerisi
                                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-[8px]">Nebim AI Engine</span>
                                </h4>
                                <p className="text-lg font-bold mt-2 leading-tight">{insight.description}</p>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Aging Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {['Active', 'Normal', 'Slow', 'Critical'].map((bucket, idx) => {
                        const count = data.filter(r => r.aging_bucket.startsWith(bucket)).length;
                        return (
                            <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{bucket} Stok</p>
                                <p className="text-2xl font-black text-slate-900 mt-1">{count} <span className="text-xs text-slate-400 font-normal">Kalem</span></p>
                                <div className={`h-1 w-10 rounded-full mt-3 ${bucket === 'Critical' ? 'bg-red-500' :
                                        bucket === 'Slow' ? 'bg-orange-500' :
                                            bucket === 'Normal' ? 'bg-blue-500' : 'bg-green-500'
                                    }`} />
                            </div>
                        );
                    })}
                </div>

                {/* Detail Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-4">
                    <ReportColumnTable
                        data={gridRows}
                        columns={gridColumns}
                        height={560}
                        storageNamespace="inventory-aging"
                    />
                </div>
            </div>
        </div>
    );
}


