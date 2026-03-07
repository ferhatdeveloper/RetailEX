import React, { useState, useEffect } from 'react';
import {
    Users, Search, Download, Printer,
    ArrowUpRight, ArrowDownRight, Sparkles
} from 'lucide-react';
import { dynamicReportEngine, ReportRow } from '../../../services/reports/DynamicReportEngine';
import { aiReportService } from '../../../services/ai/AIReportService';
import { formatNumber } from '../../../utils/formatNumber';
import { format } from 'date-fns';

export function CariHesapEkstresi() {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any[]>([]);
    const [briefing, setBriefing] = useState<string>('');
    const [customerId, setCustomerId] = useState('1');
    const [dateRange, setDateRange] = useState({
        start: format(new Date().setMonth(new Date().getMonth() - 1), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    });

    const loadReport = async () => {
        setLoading(true);
        try {
            const rows = await dynamicReportEngine.getCustomerExtract(customerId, dateRange.start, dateRange.end);
            setData(rows);

            const summary = await aiReportService.getExecutiveBriefing('customer-extract', rows);
            setBriefing(summary);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReport();
    }, [customerId]);

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Header & Filters */}
            <div className="bg-slate-800 text-white p-6 shadow-md">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-xl font-black tracking-tighter flex items-center gap-2 uppercase">
                        <Users className="w-6 h-6 text-indigo-400" />
                        Cari Hesap Hareket Ekstresi
                    </h1>
                    <div className="flex gap-2">
                        <button className="p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"><Printer className="w-4 h-4" /></button>
                        <button className="p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"><Download className="w-4 h-4" /></button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-4 items-end bg-slate-700/50 p-4 rounded-xl">
                    <div className="flex-1 min-w-[300px]">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cari Hesap Seçimi</label>
                        <input className="w-full bg-slate-900 border-none rounded-lg px-4 py-2 text-sm text-white" defaultValue="K001 - GLOBAL TEKSTIL LTD." />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Başlangıç</label>
                        <input type="date" value={dateRange.start} className="bg-slate-900 border-none rounded-lg px-4 py-2 text-sm text-white" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Bitiş</label>
                        <input type="date" value={dateRange.end} className="bg-slate-900 border-none rounded-lg px-4 py-2 text-sm text-white" />
                    </div>
                    <button onClick={loadReport} className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-lg font-bold text-sm h-[38px] transition-all">Sorgula</button>
                </div>
            </div>

            {/* AI Briefing */}
            {briefing && (
                <div className="mx-8 mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start gap-3">
                    <div className="bg-indigo-600 p-2 rounded-xl text-white mt-1">
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">AI Yönetici Özeti</h4>
                        <p className="text-sm text-indigo-900 mt-1 italic leading-relaxed">"{briefing}"</p>
                    </div>
                </div>
            )}

            {/* Grid */}
            <div className="flex-1 overflow-auto p-8">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-gray-100 text-[10px] font-black uppercase text-gray-500 tracking-widest">
                            <th className="px-4 py-3 text-left border">Tarih</th>
                            <th className="px-4 py-3 text-left border">Tür</th>
                            <th className="px-4 py-3 text-left border">Fiş No</th>
                            <th className="px-4 py-3 text-left border">Açıklama</th>
                            <th className="px-4 py-3 text-right border">Borç (Debit)</th>
                            <th className="px-4 py-3 text-right border">Alacak (Credit)</th>
                            <th className="px-4 py-3 text-right border bg-indigo-50">Bakiye</th>
                            <th className="px-2 py-3 text-center border bg-indigo-50 w-8">B/A</th>
                        </tr>
                    </thead>
                    <tbody className="text-[11px] text-gray-700">
                        {data.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-2 border">{format(new Date(row.date), 'dd.MM.yyyy')}</td>
                                <td className="px-4 py-2 border font-bold">
                                    {row.trcode === 31 ? 'Satın Alma Faturası' : row.trcode === 38 ? 'Toptan Satış' : 'Banka İşlemi'}
                                </td>
                                <td className="px-4 py-2 border font-mono">{row.fiche_no}</td>
                                <td className="px-4 py-2 border italic">{row.description}</td>
                                <td className="px-4 py-2 border text-right font-medium">{formatNumber(row.debit, 2, false)}</td>
                                <td className="px-4 py-2 border text-right font-medium">{formatNumber(row.credit, 2, false)}</td>
                                <td className="px-4 py-2 border text-right font-bold bg-indigo-50/30">{formatNumber(Math.abs(row.running_balance), 2, false)}</td>
                                <td className={`px-2 py-2 border text-center font-black bg-indigo-50/30 ${row.status === 'D' ? 'text-red-600' : 'text-green-600'}`}>
                                    {row.status}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-900 text-white font-bold text-xs uppercase">
                        <tr>
                            <td colSpan={4} className="px-4 py-3 text-right border-gray-700">Toplam Kontrol</td>
                            <td className="px-4 py-3 text-right border-gray-700">
                                {formatNumber(data.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0), 2, false)}
                            </td>
                            <td className="px-4 py-3 text-right border-gray-700">
                                {formatNumber(data.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0), 2, false)}
                            </td>
                            <td colSpan={2} className="px-4 py-3 text-right bg-indigo-700">
                                {formatNumber(Math.abs(data[data.length - 1]?.running_balance || 0), 2, false)} {data[data.length - 1]?.status}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}


