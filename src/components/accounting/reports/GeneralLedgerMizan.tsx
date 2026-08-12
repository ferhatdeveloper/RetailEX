import React, { useState, useEffect } from 'react';
import {
    BarChart, PieChart, Printer,
    Download, Search, Sparkles, Filter
} from 'lucide-react';
import { dynamicReportEngine, ReportRow } from '../../../services/reports/DynamicReportEngine';
import { aiReportService } from '../../../services/ai/AIReportService';
import { formatNumber } from '../../../utils/formatNumber';

export function GeneralLedgerMizan() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ReportRow[]>([]);
    const [briefing, setBriefing] = useState<string>('');

    const loadData = async () => {
        setLoading(true);
        try {
            const stats = await dynamicReportEngine.getGeneralLedgerMizan();
            setData(stats);

            const summary = await aiReportService.getExecutiveBriefing('mizan', stats);
            setBriefing(summary);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Logo-Style Professional Mizan Header */}
            <div className="bg-gray-100 border-b border-gray-300 p-6">
                <div className="flex justify-between items-start">
                    <div className="flex gap-4 items-center">
                        <div className="bg-white p-3 rounded-lg border border-gray-300 shadow-sm">
                            <BarChart className="w-6 h-6 text-gray-700" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Genel Mizan (Trial Balance)</h1>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Logo ERP Hesap Planı Standardı • RetailEX Yerel Veri</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold hover:bg-gray-50 flex items-center gap-2"><Printer className="w-4 h-4" /> Yazdır</button>
                        <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold hover:bg-gray-50 flex items-center gap-2"><Download className="w-4 h-4" /> Excel Aktar</button>
                    </div>
                </div>
            </div>

            {/* AI Intelligence Briefing */}
            {briefing && (
                <div className="mx-6 mt-6 p-4 bg-purple-50 border border-purple-100 rounded-xl flex items-center gap-4">
                    <div className="bg-purple-600 p-2 rounded-lg text-white shadow-lg shadow-purple-200">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <span className="text-[10px] font-black uppercase text-purple-600 tracking-widest">AI Finansal Analiz Özet</span>
                        <p className="text-sm text-purple-900 font-medium italic">"{briefing}"</p>
                    </div>
                </div>
            )}

            {/* Corporate Mizan Table */}
            <div className="flex-1 overflow-auto p-6">
                <div className="border border-gray-300 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-300 font-black uppercase text-gray-600 tracking-widest text-center">
                            <tr>
                                <th className="px-4 py-3 text-left border-r border-gray-300">Hesap Kodu</th>
                                <th className="px-4 py-3 text-left border-r border-gray-300">Hesap Adı</th>
                                <th colSpan={2} className="px-4 py-3 border-r border-gray-300 bg-gray-100/50">Tutar (IQD)</th>
                                <th colSpan={2} className="px-4 py-3 bg-red-50/30">Bakiye (IQD)</th>
                            </tr>
                            <tr className="bg-gray-50/50">
                                <th className="border-r border-gray-300"></th>
                                <th className="border-r border-gray-300"></th>
                                <th className="px-4 py-2 border-r border-gray-300">Borç</th>
                                <th className="px-4 py-2 border-r border-gray-300">Alacak</th>
                                <th className="px-4 py-2 border-r border-gray-300">Borç</th>
                                <th className="px-4 py-2">Alacak</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-gray-700">
                            {data.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 border-r border-gray-200 font-bold text-gray-900">{row.account_code}</td>
                                    <td className="px-4 py-2 border-r border-gray-200">{row.account_name}</td>
                                    <td className="px-4 py-2 border-r border-gray-200 text-right">{formatNumber(row.debit_total, 2, false)}</td>
                                    <td className="px-4 py-2 border-r border-gray-200 text-right">{formatNumber(row.credit_total, 2, false)}</td>
                                    <td className="px-4 py-2 border-r border-gray-200 text-right font-bold text-red-700">
                                        {row.net_balance > 0 ? formatNumber(row.net_balance, 2, false) : '-'}
                                    </td>
                                    <td className="px-4 py-2 text-right font-bold text-green-700">
                                        {row.net_balance < 0 ? formatNumber(Math.abs(row.net_balance), 2, false) : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-900 text-white font-black text-xs">
                            <tr>
                                <td colSpan={2} className="px-4 py-4 text-right tracking-[0.3em]">GENEL TOPLAM</td>
                                <td className="px-4 py-4 text-right border-l border-gray-700">
                                    {formatNumber(data.reduce((s, r) => s + (parseFloat(r.debit_total) || 0), 0), 2, false)}
                                </td>
                                <td className="px-4 py-4 text-right border-l border-gray-700">
                                    {formatNumber(data.reduce((s, r) => s + (parseFloat(r.credit_total) || 0), 0), 2, false)}
                                </td>
                                <td className="px-4 py-4 text-right border-l border-gray-700">
                                    {formatNumber(data.reduce((s, r) => s + (r.net_balance > 0 ? r.net_balance : 0), 0), 2, false)}
                                </td>
                                <td className="px-4 py-4 text-right border-l border-gray-700">
                                    {formatNumber(data.reduce((s, r) => s + (r.net_balance < 0 ? Math.abs(r.net_balance) : 0), 0), 2, false)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}


