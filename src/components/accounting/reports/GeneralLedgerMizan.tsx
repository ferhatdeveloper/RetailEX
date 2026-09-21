import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart, Printer,
    Download, Sparkles,
} from 'lucide-react';
import { dynamicReportEngine, ReportRow } from '../../../services/reports/DynamicReportEngine';
import { aiReportService } from '../../../services/ai/AIReportService';
import { formatNumber } from '../../../utils/formatNumber';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';

export function GeneralLedgerMizan() {
    const { tm } = useLanguage();
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
        void loadData();
    }, []);

    const fmtCell = (n: number | string | undefined, positiveOnly = false) => {
        const num = parseFloat(String(n ?? 0));
        if (positiveOnly && !(num > 0)) return '-';
        return formatNumber(num, 2, false);
    };

    const columns = useMemo<ReportColumnTableCol<ReportRow>[]>(
        () => [
            {
                key: 'account_code',
                header: tm('accAccountCode'),
                size: 120,
                cell: (r) => <span className="font-bold text-gray-900">{r.account_code}</span>,
            },
            { key: 'account_name', header: tm('accAccountName'), size: 220 },
            {
                key: 'debit_total',
                header: `${tm('accAmountIqd')} — ${tm('directionDebtShort')}`,
                type: 'number',
                align: 'right',
                size: 130,
                footerSum: true,
                cell: (r) => fmtCell(r.debit_total),
            },
            {
                key: 'credit_total',
                header: `${tm('accAmountIqd')} — ${tm('directionCreditShort')}`,
                type: 'number',
                align: 'right',
                size: 130,
                footerSum: true,
                cell: (r) => fmtCell(r.credit_total),
            },
            {
                key: 'net_balance',
                header: `${tm('accBalanceIqd')} — ${tm('directionDebtShort')}`,
                type: 'number',
                align: 'right',
                size: 130,
                cell: (r) => {
                    const n = parseFloat(String(r.net_balance ?? 0));
                    return n > 0 ? (
                        <span className="font-bold text-red-700">{formatNumber(n, 2, false)}</span>
                    ) : (
                        '-'
                    );
                },
            },
            {
                key: 'id',
                header: `${tm('accBalanceIqd')} — ${tm('directionCreditShort')}`,
                size: 130,
                align: 'right',
                cell: (r) => {
                    const n = parseFloat(String(r.net_balance ?? 0));
                    return n < 0 ? (
                        <span className="font-bold text-green-700">{formatNumber(Math.abs(n), 2, false)}</span>
                    ) : (
                        '-'
                    );
                },
            },
        ],
        [tm],
    );

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="bg-gray-100 border-b border-gray-300 p-6">
                <div className="flex justify-between items-start">
                    <div className="flex gap-4 items-center">
                        <div className="bg-white p-3 rounded-lg border border-gray-300 shadow-sm">
                            <BarChart className="w-6 h-6 text-gray-700" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 uppercase tracking-tighter">{tm('accGeneralMizan')}</h1>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{tm('accMizanStandardNote')}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold hover:bg-gray-50 flex items-center gap-2"><Printer className="w-4 h-4" /> {tm('print')}</button>
                        <button type="button" className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold hover:bg-gray-50 flex items-center gap-2"><Download className="w-4 h-4" /> {tm('accExportExcel')}</button>
                    </div>
                </div>
            </div>

            {briefing && (
                <div className="mx-6 mt-6 p-4 bg-purple-50 border border-purple-100 rounded-xl flex items-center gap-4">
                    <div className="bg-purple-600 p-2 rounded-lg text-white shadow-lg shadow-purple-200">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <span className="text-[10px] font-black uppercase text-purple-600 tracking-widest">{tm('accAiFinancialSummary')}</span>
                        <p className="text-sm text-purple-900 font-medium italic">&quot;{briefing}&quot;</p>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-auto p-6">
                <div className="border border-gray-300 rounded-xl overflow-hidden shadow-sm p-3">
                    {loading ? (
                        <p className="text-sm text-gray-500 py-12 text-center">Yükleniyor…</p>
                    ) : (
                        <ReportColumnTable
                            data={data}
                            columns={columns}
                            height={560}
                            storageNamespace="accounting-general-ledger-mizan"
                            footerLabel="GENEL TOPLAM"
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
