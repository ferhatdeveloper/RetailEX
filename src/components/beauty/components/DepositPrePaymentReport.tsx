import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, RefreshCw, ListChecks } from 'lucide-react';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { formatLocalYmd } from '../../../utils/dateLocal';
import { formatReportDateCell } from '../../../utils/dateLocale';
import { ReportYmdDatePicker } from '../../shared/ReportDateRangePresets';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';
import { getFirmLedgerCurrency, getGlobalCurrency } from '../../../utils/currency';
import { getAppDefaultCurrency } from '../../../services/postgres';

const fmt = (n: number) => formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });

type Row = Awaited<ReturnType<typeof beautyService.getDepositPrePaymentReport>>[number];

// 10.10.2026 — Rezervasyon / Ön Ödeme Raporu "Kalan" hesabı.
//
// Kullanıcı formülü:
//   remaining = bTotal - (bReservation + takenPayment)
//
// DB view'i `beauty_appointment_payment_status.outstanding_amount`
//   = total_price - deposit_amount - remainder_paid_amount
// formülünü kullanıyor; fakat randevu **tamamlandığında** (status =
// 'completed' / 'closed') kalan bakiye tahsilat akışına bakılmaksızın
// 0 olmalıdır — hizmet verildiği için artık alacak yoktur. Aynı
// şekilde 'cancelled' ve 'no_show' durumlarında da alacak kapanır.
//
// Bu helper, ekran hücresinde, grup footer'da ve "Toplam Kalan" KPI'ında
// tek kaynak olarak kullanılır; DB'den gelen ham `outstanding_amount`
// alanı status-aware düzeltmeyi garanti etmez (ör. hizmet tamamlanmış
// ama kalan tahsil edilmemiş olabilir).
function computeKalan(r: Row): number {
    const total = Number(r.total_price) || 0;
    const deposit = Number(r.deposit_amount) || 0;
    const remainder = Number(r.remainder_paid_amount) || 0;
    const status = String(r.status ?? '').trim().toLowerCase();
    if (status === 'completed' || status === 'closed') return 0;
    if (status === 'cancelled' || status === 'no_show') return 0;
    return Math.max(0, total - deposit - remainder);
}

// 10.10.2026 — "Alınan Ödeme" helper'ı.
// Hizmet tamamlandığında (completed/closed/cancelled/no_show) fiilen
// tahsil edilen tutar = total - deposit (peşinat zaten tahsil edildiği
// için geriye kalan bakiye de tahsil kabul edilir). Hizmet henüz
// tamamlanmadıysa Sadece Peşinat vardır → Alınan = 0 (peşinat ayrı
// kolonda). DB view `remainder_paid_amount` her zaman 0 olabiliyor
// (DB tarafında payment_state sadece deposit_only olduğunda remainder
// henüz kaydedilmediği için); bu yüzden status-aware hesap şart.
function computeTakenPayment(r: Row): number {
    const total = Number(r.total_price) || 0;
    const deposit = Number(r.deposit_amount) || 0;
    const status = String(r.status ?? '').trim().toLowerCase();
    if (status === 'completed' || status === 'closed') return Math.max(0, total - deposit);
    if (status === 'cancelled' || status === 'no_show') return 0;
    // Sadece Peşinat (deposit_only / scheduled / partial vs.) → Alınan = 0
    // çünkü kalan ödeme henüz tahsil edilmedi (DB remainder genelde 0).
    // DB remainder > 0 ise (ör. partial ödeme yapıldıysa) onu ekle.
    const remainder = Number(r.remainder_paid_amount) || 0;
    return Math.max(0, remainder);
}

const PAYMENT_STATE_LABEL_KEY: Record<string, string> = {
    unpaid: 'bPaymentStateUnpaid',
    deposit_only: 'bPaymentStateDepositOnly',
    partial: 'bPaymentStatePartial',
    paid: 'bPaymentStatePaid',
    no_amount: 'bPaymentStateNoAmount',
};

const PAYMENT_STATE_BADGE: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    partial: 'bg-amber-50 text-amber-700 border-amber-200',
    deposit_only: 'bg-blue-50 text-blue-700 border-blue-200',
    unpaid: 'bg-rose-50 text-rose-700 border-rose-200',
    no_amount: 'bg-slate-50 text-slate-500 border-slate-200',
};

export function DepositPrePaymentReport() {
    const { tm } = useLanguage();
    const { selectedFirm } = useFirmaDonem();
    const [startYmd, setStartYmd] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return formatLocalYmd(d);
    });
    const [endYmd, setEndYmd] = useState(() => formatLocalYmd(new Date()));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [paymentStateFilter, setPaymentStateFilter] = useState<string>('');

    const currency = useMemo(
        () => getFirmLedgerCurrency(selectedFirm, getAppDefaultCurrency() || getGlobalCurrency()),
        [selectedFirm],
    );

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const opts: { paymentState?: string } = {};
            if (paymentStateFilter) opts.paymentState = paymentStateFilter;
            const res = await beautyService.getDepositPrePaymentReport(startYmd, endYmd, opts);
            setRows(res);
        } catch (e: any) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startYmd, endYmd, paymentStateFilter]);

    const columns = useMemo<ReportColumnTableCol<Row>[]>(
        () => [
            {
                key: 'appointment_date',
                header: tm('date'),
                type: 'date',
                size: 110,
                cell: (r) => (
                    <span className="font-semibold text-gray-700">{formatReportDateCell(r.appointment_date)}</span>
                ),
            },
            {
                key: 'appointment_time',
                header: tm('time'),
                type: 'text',
                size: 80,
                cell: (r) => <span className="text-gray-700 tabular-nums">{r.appointment_time || '—'}</span>,
            },
            {
                key: 'customer_name',
                header: tm('customer'),
                size: 200,
                cell: (r) => <span className="font-bold text-gray-900">{r.customer_name || '—'}</span>,
            },
            {
                key: 'specialist_name',
                header: tm('bStaffName'),
                size: 160,
                cell: (r) => <span className="text-gray-700">{r.specialist_name || '—'}</span>,
            },
            {
                key: 'service_name',
                header: tm('service'),
                size: 180,
                cell: (r) => <span className="text-gray-700">{r.service_name || '—'}</span>,
            },
            {
                key: 'total_price',
                header: tm('bTotalAmountCol') || tm('total') || 'Toplam Tutar',
                type: 'number',
                align: 'right',
                size: 130,
                footerSum: true,
                footerFormat: (n) => fmt(n),
                cell: (r) => <span className="font-semibold text-gray-700 tabular-nums">{fmt(r.total_price)}</span>,
            },
            {
                key: 'deposit_amount',
                header: tm('bKpiTotalReservation') || 'Rezervasyon Tutarı',
                type: 'number',
                align: 'right',
                size: 140,
                footerSum: true,
                footerFormat: (n) => fmt(n),
                cell: (r) => <span className="font-semibold text-blue-700 tabular-nums">{fmt(r.deposit_amount)}</span>,
            },
            {
                key: 'received_payment',
                // 10.10.2026 — "Alınan ödeme" kolonu: hizmet verildiğinde fiilen tahsil edilen tutar.
                // Formül: completed/closed → total - deposit (kalan bakiye tahsil kabul edilir);
                // Sadece Peşinat aşamasında (scheduled/deposit_only/partial) → remainder_paid_amount.
                // DB view `remainder_paid_amount` her zaman 0 olabiliyor; bu yüzden status-aware
                // `computeTakenPayment` helper'ı tek kaynak. Kullanıcı şikâyeti: "Alınan Ödeme boş"
                // — hücre 0 döndüğünde bile görünür kalmalı.
                header: tm('bReceivedPayment') || 'Alınan Ödeme',
                type: 'number',
                align: 'right',
                size: 130,
                footerSum: true,
                footerFormat: (n) => fmt(n),
                cell: (r) => {
                    const received = computeTakenPayment(r);
                    const cls =
                        received > 0.005
                            ? 'font-semibold text-emerald-700 tabular-nums'
                            : 'tabular-nums text-slate-500';
                    return <span className={cls}>{fmt(received)}</span>;
                },
            },
            {
                key: 'outstanding_amount',
                header: tm('bKpiTotalOutstanding') || 'Kalan Bakiye',
                type: 'number',
                align: 'right',
                size: 130,
                footerSum: true,
                footerFormat: (n) => fmt(n),
                cell: (r) => {
                    // 10.10.2026 — Kalan = bTotal - (bReservation + takenPayment).
                    // completed/cancelled/no_show durumlarında Kalan = 0; DB'deki
                    // raw `outstanding_amount` alanı bunu garanti etmez, çünkü
                    // bakiye tahsil edilmemiş ama hizmet verilmiş olabilir.
                    const amt = computeKalan(r);
                    const cls = amt > 0.005 ? 'text-rose-700 font-semibold' : 'text-emerald-700 font-semibold';
                    return <span className={`tabular-nums ${cls}`}>{fmt(amt)}</span>;
                },
            },
            {
                key: 'payment_state',
                header: tm('status'),
                size: 140,
                cell: (r) => {
                    const key = PAYMENT_STATE_LABEL_KEY[r.payment_state] || 'bPaymentStateNoAmount';
                    const cls = PAYMENT_STATE_BADGE[r.payment_state] || PAYMENT_STATE_BADGE.no_amount;
                    return (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${cls}`}>
                            {tm(key)}
                        </span>
                    );
                },
            },
            {
                key: 'deposit_sale_fiche_no',
                header: tm('bFicheNoCol') || 'Fiş No',
                size: 150,
                cell: (r) => (
                    <span className="font-mono text-[11px] text-slate-600">
                        {r.deposit_sale_fiche_no || '—'}
                    </span>
                ),
            },
        ],
        [tm],
    );

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-full">
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                            <Banknote size={22} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900">{tm('bDepositPrePaymentReport')}</h2>
                            <p className="text-xs font-semibold text-gray-500">{currency}</p>
                        </div>
                    </div>
                    <div className="flex items-end gap-2 flex-wrap">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('date')}</span>
                            <ReportYmdDatePicker value={startYmd} onChange={setStartYmd} className="min-w-[9.5rem]" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('bToDate')}</span>
                            <ReportYmdDatePicker value={endYmd} onChange={setEndYmd} className="min-w-[9.5rem]" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('status')}</span>
                            <select
                                value={paymentStateFilter}
                                onChange={(e) => setPaymentStateFilter(e.target.value)}
                                className="h-10 min-w-[10rem] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            >
                                <option value="">{tm('all')}</option>
                                <option value="deposit_only">{tm('bPaymentStateDepositOnly')}</option>
                                <option value="partial">{tm('bPaymentStatePartial')}</option>
                                <option value="paid">{tm('bPaymentStatePaid')}</option>
                                <option value="unpaid">{tm('bPaymentStateUnpaid')}</option>
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading}
                            className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-extrabold flex items-center gap-2"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            {loading ? tm('bLoading') : tm('bRunReport')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 text-gray-900 font-black">
                    <ListChecks size={16} className="text-blue-600" />
                    {tm('bDepositPrePaymentReport')}
                </div>
                {error ? (
                    <div className="p-6 text-sm font-semibold text-red-600">{error}</div>
                ) : rows.length === 0 && !loading ? (
                    <div className="p-10 text-center text-gray-400 text-sm font-bold">
                        {tm('bNoData') || 'Bu tarih aralığında kayıt yok'}
                    </div>
                ) : (
                    <div className="p-2">
                        <ReportColumnTable
                            data={rows}
                            columns={columns}
                            height={520}
                            footerLabel={tm('rprTotal') || 'Toplam'}
                            storageNamespace="beauty-deposit-prepayment-v2"
                            // 07.10.2026 — Rezervasyon Tutarı gruplaması (fiş bazlı):
                            // aynı BEA-* fişine ait birden çok hizmet/paket/ürün satırı
                            // tek grup altında toplanır; grup altında deposit + paid + kalan
                            // tutarları otomatik toplanır; footer'da grand total görünür.
                            groupByColumnId="deposit_sale_fiche_no"
                            groupFooterSumColumns={[
                                {
                                    columnId: 'deposit_amount',
                                    getValue: (r) => Number(r.deposit_amount ?? 0),
                                    format: (sum) => (
                                        <span className="text-blue-700 font-semibold">{fmt(sum)}</span>
                                    ),
                                },
                                {
                                    columnId: 'received_payment',
                                    getValue: (r) => computeTakenPayment(r),
                                    format: (sum) => (
                                        <span className={sum > 0.005 ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                                            {fmt(sum)}
                                        </span>
                                    ),
                                },
                                {
                                    columnId: 'outstanding_amount',
                                    getValue: (r) => computeKalan(r),
                                    format: (sum) => (
                                        <span className={sum > 0.005 ? 'text-rose-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                                            {fmt(sum)}
                                        </span>
                                    ),
                                },
                            ]}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

export default DepositPrePaymentReport;
