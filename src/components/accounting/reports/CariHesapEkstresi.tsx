import React, { useState, useEffect, useMemo } from 'react';
import {
    Users, Download, Printer,
    Sparkles
} from 'lucide-react';
import { dynamicReportEngine } from '../../../services/reports/DynamicReportEngine';
import { aiReportService } from '../../../services/ai/AIReportService';
import { formatNumber } from '../../../utils/formatNumber';
import { format } from 'date-fns';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';

type ExtractRow = {
    date: string;
    trcode: number;
    fiche_no: string;
    description: string;
    debit: number;
    credit: number;
    running_balance: number;
    status: string;
    type_label: string;
};

export function CariHesapEkstresi() {
    const { tm } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<ExtractRow[]>([]);
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
            const mapped: ExtractRow[] = (rows as Record<string, unknown>[]).map((row) => ({
                date: String(row.date),
                trcode: Number(row.trcode),
                fiche_no: String(row.fiche_no ?? ''),
                description: String(row.description ?? ''),
                debit: parseFloat(String(row.debit)) || 0,
                credit: parseFloat(String(row.credit)) || 0,
                running_balance: parseFloat(String(row.running_balance)) || 0,
                status: String(row.status ?? ''),
                type_label:
                    row.trcode === 31
                        ? 'Satın Alma Faturası'
                        : row.trcode === 38
                          ? 'Toptan Satış'
                          : 'Banka İşlemi',
            }));
            setData(mapped);

            const summary = await aiReportService.getExecutiveBriefing('customer-extract', rows);
            setBriefing(summary);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadReport();
    }, [customerId]);

    const columns = useMemo<ReportColumnTableCol<ExtractRow>[]>(
        () => [
            {
                key: 'date',
                header: 'Tarih',
                type: 'date',
                size: 110,
                cell: (r) => format(new Date(r.date), 'dd.MM.yyyy'),
            },
            { key: 'type_label', header: 'Tür', size: 150 },
            {
                key: 'fiche_no',
                header: 'Fiş No',
                size: 120,
                cell: (r) => <span className="font-mono">{r.fiche_no}</span>,
            },
            { key: 'description', header: 'Açıklama', size: 220 },
            {
                key: 'debit',
                header: tm('accDebitParen'),
                type: 'number',
                align: 'right',
                size: 120,
                footerSum: true,
                cell: (r) => formatNumber(r.debit, 2, false),
            },
            {
                key: 'credit',
                header: tm('accCreditParen'),
                type: 'number',
                align: 'right',
                size: 120,
                footerSum: true,
                cell: (r) => formatNumber(r.credit, 2, false),
            },
            {
                key: 'running_balance',
                header: tm('balanceShort'),
                type: 'number',
                align: 'right',
                size: 130,
                cell: (r) => (
                    <span className="font-bold">{formatNumber(Math.abs(r.running_balance), 2, false)}</span>
                ),
            },
            {
                key: 'status',
                header: 'B/A',
                size: 70,
                align: 'center',
                cell: (r) => (
                    <span className={`font-black ${r.status === 'D' ? 'text-red-600' : 'text-green-600'}`}>
                        {r.status}
                    </span>
                ),
            },
        ],
        [tm],
    );

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="bg-slate-800 text-white p-6 shadow-md">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-xl font-black tracking-tighter flex items-center gap-2 uppercase">
                        <Users className="w-6 h-6 text-indigo-400" />
                        {tm('accCustomerExtract')}
                    </h1>
                    <div className="flex gap-2">
                        <button type="button" className="p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"><Printer className="w-4 h-4" /></button>
                        <button type="button" className="p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"><Download className="w-4 h-4" /></button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-4 items-end bg-slate-700/50 p-4 rounded-xl">
                    <div className="flex-1 min-w-[300px]">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{tm('accCariSelect')}</label>
                        <input className="w-full bg-slate-900 border-none rounded-lg px-4 py-2 text-sm text-white" defaultValue="K001 - GLOBAL TEKSTIL LTD." />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{tm('startDate')}</label>
                        <input type="date" value={dateRange.start} className="bg-slate-900 border-none rounded-lg px-4 py-2 text-sm text-white" readOnly />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{tm('endDate')}</label>
                        <input type="date" value={dateRange.end} className="bg-slate-900 border-none rounded-lg px-4 py-2 text-sm text-white" readOnly />
                    </div>
                    <button type="button" onClick={() => void loadReport()} className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-lg font-bold text-sm h-[38px] transition-all">{tm('accQuery')}</button>
                </div>
            </div>

            {briefing && (
                <div className="mx-8 mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start gap-3">
                    <div className="bg-indigo-600 p-2 rounded-xl text-white mt-1">
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">{tm('accAiExecutiveSummary')}</h4>
                        <p className="text-sm text-indigo-900 mt-1 italic leading-relaxed">&quot;{briefing}&quot;</p>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-auto p-8">
                {loading ? (
                    <p className="text-sm text-gray-500 py-12 text-center">Yükleniyor…</p>
                ) : (
                    <ReportColumnTable
                        data={data}
                        columns={columns}
                        height={560}
                        storageNamespace="accounting-cari-ekstre"
                        footerLabel="Toplam Kontrol"
                    />
                )}
            </div>
        </div>
    );
}
