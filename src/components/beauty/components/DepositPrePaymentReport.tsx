import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, RefreshCw, ListChecks, CheckCircle2, X } from 'lucide-react';
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
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { toast } from 'sonner';
import {
    prePaymentReceived,
    prePaymentRemaining,
    prePaymentServiceTotal,
    spreadPrePaymentDepositRows,
} from '../../../utils/depositPrePaymentAllocation';

const fmt = (n: number) => formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });

// 12.10.2026 — Kullanıcı isteği: "0 ise göstermesin".
// Sayısal hücrelerde ve footer satırında değer 0 (veya 0.005'ten küçük)
// olduğunda "0" yerine boş (veya "—") gösterilir; bu hem veri satırı
// hücresini hem de dip toplam (mavi) / grup alt toplam (sarı) satırını
// kapsar. Negatif değerler için de aynı tolerans (formül hatası / veri
// bozulması koruması).
const isZeroAmount = (n: number): boolean => Math.abs(n) < 0.005;

// 0 ise boş string; aksi halde para formatında. Footer'da hücre sağa
// hizalı olduğundan boş string görsel olarak düzgün çöküntü sağlar;
// hücre render'ında ise `renderZeroAmount()` (aşağıda) "—" üretir.
const fmtAmt = (n: number): string => (isZeroAmount(n) ? '' : fmt(n));

// 12.10.2026 — Hücre render'ı: 0 ise "—", aksi halde mevcut stil.
// `tabular-nums` sağa hizalı kolonlarda rakam genişliği sabit kalır; bu
// hem `outstanding_amount` hem `received_payment` hücrelerinde tutarlı
// görünüm verir. `text-slate-300` "—" için düşük dikkat dağıtıcı renk.
const renderZeroAmount = (n: number, nonZero: (n: number) => React.ReactNode): React.ReactNode =>
    isZeroAmount(n) ? (
        <span className="tabular-nums text-slate-300">—</span>
    ) : (
        <>{nonZero(n)}</>
    );

type Row = Awaited<ReturnType<typeof beautyService.getDepositPrePaymentReport>>[number] & {
    // 14.10.2026 20:00 — Rezervasyon miktarı (adet). Servis tarafında
    // dönüyor; geriye dönük uyum için ?.
    reservation_count?: number;
    // 16.10.2026 — cari_avans toplamı (müşteri bazında, open+applied).
    // "Alınan Ödeme" kolonunda hizmet + avans toplamı için.
    avans_total?: number;
};

// Kalan ve alınan, gösterim payından gelir. Hizmet bedeline avans eklenmez.
function computeKalan(r: Row): number {
    return prePaymentRemaining(r);
}

function computeTakenPayment(r: Row): number {
    return prePaymentReceived(r);
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

    // 10.10.2026 — "Faturayı kapat" satır eylemi.
    // Kullanıcı şikâyeti: status "Sadece Peşinat" → "completed" yapacak bir
    // buton yok; bu yüzden Kalan sıfırlanmıyor. Eylem butonu eklendi;
    // tıklanınca PercentBodyModal onay penceresi açılır; onayda
    // `beautyService.updateAppointmentStatus(id, 'completed')` çağrılır.
    // Bu fonksiyon zaten deposit'i ana satışa merge eder ve paket seans
    // tüketir (mevcut yan etkiler korunur). Çağrı sonrası refetch ile
    // liste yenilenir; status=completed → computeKalan=0,
    // computeTakenPayment=total-deposit olur.
    const [closeTarget, setCloseTarget] = useState<Row | null>(null);
    const [closing, setClosing] = useState(false);
    // 19.10.2026 — Satıra tıklayınca detay modalı açma
    const [detailRow, setDetailRow] = useState<Row | null>(null);

    const currency = useMemo(
        () => getFirmLedgerCurrency(selectedFirm, getAppDefaultCurrency() || getGlobalCurrency()),
        [selectedFirm],
    );

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            // Durum süzgeci paydan sonra uygulanır. Kardeş hizmet SQL'de
            // düşerse depozito tek satırda kalır.
            const res = await beautyService.getDepositPrePaymentReport(startYmd, endYmd);
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
    }, [startYmd, endYmd]);

    const visibleRows = useMemo(() => {
        const shared = spreadPrePaymentDepositRows(rows);
        if (!paymentStateFilter) return shared;
        return shared.filter((row) => row.payment_state === paymentStateFilter);
    }, [rows, paymentStateFilter]);

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
                // 12.10.2026 — Kolon sırası kullanıcı isteğine göre güncellendi:
                //   Toplam Tutar → Rezervasyon → Alınan Ödeme → Kalan Bakiye
                // Mantık: okuyucu önce "Toplam Tutar"ı görür (referans), sonra
                // peşinatı (Rezervasyon) ve fiilen tahsil edilen tutarı (Alınan)
                // görür; son olarak borç/kalan sütunu gelir. "Kalan" en sağda
                // olduğunda hizmet tamamlandığında 0 olur ve Toplam = Alınan + Rezervasyon
                // eşitliği okuyucu için netleşir. Kullanıcı notu:
                //   "Toplam Kalan, Alınan Ödemenin altına kaydır"
                // — bu, Kalan'ın Alınan Ödeme'nin sağına alınması anlamına gelir.
                //
                // Toplam Tutar = hizmet bedeli. Depozito peşinattır, üstüne eklenmez.
                key: 'total_with_avans',
                // 12.10.2026 — `bTotalAmountCol` artık 4 dilde tanımlı; yine de
                // eski `tm('total')` ve Türkçe fallback korunur (geriye dönük uyum).
                header: tm('bTotalAmountCol') || tm('total') || 'Toplam Tutar',
                type: 'number',
                align: 'right',
                size: 130,
                footerSum: true,
                footerGetValue: (r) => prePaymentServiceTotal(r),
                footerFormat: (n) => fmtAmt(n),
                cell: (r) => {
                    const total = prePaymentServiceTotal(r);
                    return renderZeroAmount(total, (v) => (
                        <span className="font-semibold text-gray-700 tabular-nums">{fmt(v)}</span>
                    ));
                },
            },
            {
                // 14.10.2026 20:00 — Rezervasyon Miktarı (adet). Önceki
                // versiyonda bu kolon deposit_amount tutarını gösteriyordu
                // (yanlış). Kullanıcı kararı: miktar = adet, tutar ayrı
                // kolon. `reservation_count` servis tarafında 1 sabit
                // dönüyor (her randevu 1 hizmet).
                key: 'reservation_count',
                header: tm('reservationCountLabel') || 'Rezervasyon Miktarı',
                type: 'number',
                align: 'right',
                size: 130,
                footerSum: true,
                footerFormat: (n) => (n > 0 ? Math.round(n).toString() : ''),
                cell: (r) => {
                    const v = Number(r.reservation_count ?? 1) || 0;
                    return v > 0 ? (
                        <span className="font-semibold text-blue-700 tabular-nums">
                            {v} {tm('dailyDepositCountShort') || 'adet'}
                        </span>
                    ) : (
                        <span className="tabular-nums text-slate-300">—</span>
                    );
                },
            },
            {
                // 14.10.2026 20:00 — Rezervasyon Tutarı (peşinat). DB'de
                // deposit_amount olarak duruyor (örn. 15.000). Bu kolon
                // sadece bilgi; brütten ve kalan bakiyeden bağımsız
                // gösterilir.
                key: 'deposit_amount',
                header: tm('dailyDepositCollected') || tm('bKpiTotalReservation') || 'Rezervasyon Tutarı',
                type: 'number',
                align: 'right',
                size: 140,
                footerSum: true,
                footerFormat: (n) => fmtAmt(n),
                cell: (r) =>
                    renderZeroAmount(Number(r.deposit_amount) || 0, (v) => (
                        <span className="font-semibold text-cyan-700 tabular-nums">{fmt(v)}</span>
                    )),
            },
            {
                key: 'received_payment',
                // 10.10.2026 — "Alınan ödeme" kolonu: hizmet verildiğinde fiilen tahsil edilen tutar.
                // Formül: completed/closed → total - deposit (kalan bakiye tahsil kabul edilir);
                // Sadece Peşinat aşamasında (scheduled/deposit_only/partial) → remainder_paid_amount.
                // DB view `remainder_paid_amount` her zaman 0 olabiliyor; bu yüzden status-aware
                // `computeTakenPayment` helper'ı tek kaynak. 12.10.2026 — kullanıcı isteği:
                // hücre 0 ise boş ("—") göster; tahsil edilmemiş durumu görsel olarak ifade etme.
                header: tm('bReceivedPayment') || 'Alınan Ödeme',
                type: 'number',
                align: 'right',
                size: 130,
                footerSum: true,
                // 12.10.2026 — Dip toplam (grand total) ham `row.received_payment`
                // (DB'de 0) yerine `computeTakenPayment` ile hesaplanmalı.
                // Bu köprü olmadan mavi dip toplam satırı 0 dönüyordu.
                // 12.10.2026 — Gruplama (sarı satır) kaldırıldı; sadece
                // dip toplam (mavi) açık. `footerGetValue` köprüsü korunur.
                footerGetValue: (r) => computeTakenPayment(r),
                // 12.10.2026 — Dip toplam 0 ise boş string; aksi halde `fmt`.
                // Sağa hizalı kolonda boş string düzgün çöküntü sağlar.
                footerFormat: (n) => fmtAmt(n),
                cell: (r) =>
                    renderZeroAmount(computeTakenPayment(r), (received) => {
                        const cls =
                            received > 0.005
                                ? 'font-semibold text-emerald-700 tabular-nums'
                                : 'tabular-nums text-slate-500';
                        return <span className={cls}>{fmt(received)}</span>;
                    }),
            },
            {
                key: 'outstanding_amount',
                // 12.10.2026 — "Kalan Bakiye" artık Alınan Ödeme'nin sağında.
                // Hizmet tamamlandığında 0 olur; Alınan Ödeme + Rezervasyon = Toplam Tutar
                // eşitliği görsel olarak doğrulanabilir. Kullanıcı isteği:
                // 0 ise "—" göster; gerçek borç yoksa hücre boş hissettirmeli.
                header: tm('bKpiTotalOutstanding') || 'Kalan Bakiye',
                type: 'number',
                align: 'right',
                size: 130,
                footerSum: true,
                // 12.10.2026 — Dip toplam ham `row.outstanding_amount` yerine
                // `computeKalan(r)` ile hesaplanmalı (status-aware). Aynı
                // neden `received_payment` için geçerli. Bu köprü olmadan
                // mavi dip toplam ham DB alanını okur ve status-aware hesabı
                // yansıtmaz.
                footerGetValue: (r) => computeKalan(r),
                // 12.10.2026 — Dip toplam 0 ise boş string; aksi halde `fmt`.
                footerFormat: (n) => fmtAmt(n),
                cell: (r) =>
                    renderZeroAmount(computeKalan(r), (amt) => {
                        // 10.10.2026 — Kalan = bTotal - (bReservation + takenPayment).
                        // completed/cancelled/no_show durumlarında Kalan = 0; DB'deki
                        // raw `outstanding_amount` alanı bunu garanti etmez, çünkü
                        // bakiye tahsil edilmemiş ama hizmet verilmiş olabilir.
                        const cls = amt > 0.005 ? 'text-rose-700 font-semibold' : 'text-emerald-700 font-semibold';
                        return <span className={`tabular-nums ${cls}`}>{fmt(amt)}</span>;
                    }),
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
                key: 'actions',
                // 10.10.2026 — Satır eylemi: status henüz kapanmadıysa
                // "Faturayı kapat" butonu gösterir. Tıklanınca onay modalı
                // açılır. Kapanmış/iptal edilmiş satırlarda pasif rozet
                // gösterilir — geri alma yok (iptal farklı bir akış).
                header: tm('bActions') || 'İşlem',
                align: 'center',
                size: 130,
                cell: (r) => {
                    const status = String(r.status ?? '').trim().toLowerCase();
                    const closed =
                        status === 'completed' ||
                        status === 'closed' ||
                        status === 'cancelled' ||
                        status === 'no_show';
                    if (closed) {
                        const isCancel = status === 'cancelled' || status === 'no_show';
                        return (
                            <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                    isCancel
                                        ? 'bg-slate-100 text-slate-500 border-slate-200'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                            >
                                {isCancel ? tm('bAptStatusCancelled') || 'İptal' : tm('bAptStatusCompleted') || 'Tamamlandı'}
                            </span>
                        );
                    }
                    return (
                        <button
                            type="button"
                            onClick={(ev) => {
                                ev.stopPropagation();
                                setCloseTarget(r);
                            }}
                            className="inline-flex items-center gap-1 h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-extrabold shadow-sm shadow-blue-200/50 active:scale-[0.98] transition-colors"
                            aria-label={tm('bCloseInvoice') || 'Faturayı kapat'}
                        >
                            <CheckCircle2 size={12} />
                            {tm('bCloseInvoice') || 'Faturayı kapat'}
                        </button>
                    );
                },
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
                ) : visibleRows.length === 0 && !loading ? (
                    <div className="p-10 text-center text-gray-400 text-sm font-bold">
                        {tm('bNoData') || 'Bu tarih aralığında kayıt yok'}
                    </div>
                ) : (
<div className="p-2">
                        <ReportColumnTable
                            data={visibleRows}
                            columns={columns}
                            height={520}
                            // 19.10.2026 — Satıra tıklayınca detay modalı açılır
                            onRowClick={(row) => setDetailRow(row)}
                            // 12.10.2026 — Alt footer ("TOPLAM (N)") kaldırıldı.
                            // DevExDataGrid: `resolvedFooterLabel` boşsa
                            // `showFooterRow` false döner (bkz. DevExDataGrid.tsx:2952).
                            storageNamespace="beauty-deposit-prepayment-v2"
                            // 12.10.2026 — Kullanıcı isteği: gruplama kaldırıldı.
                            // `groupByColumnId` ve `groupFooterSumColumns` kaldırıldı;
                            // dip toplam (mavi satır) açık kalır — kolonlardaki
                            // `footerSum: true` + `footerGetValue`/`footerFormat`
                            // köprüsü ile çalışır. Davranış alternatifleri:
                            //   1) Yalnızca gruplama (sarı) kaldır, dip toplam kalsın
                            //      → ŞU ANKİ davranış (bu yorum bloğu).
                            //   2) Tüm footer'lar kaldırılsın → kolonlardan
                            //      `footerSum: true` da kaldırılmalı ve
                            //      `ReportColumnTable`'a `footerLabel={''}` verilmeli.
                        />
                    </div>
                )}
            </div>

            {closeTarget && (
                <PercentBodyModal
                    onClose={() => {
                        if (closing) return;
                        setCloseTarget(null);
                    }}
                    size="compact"
                    ariaLabel={tm('bCloseInvoice') || 'Faturayı kapat'}
                >
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white flex items-center justify-between shrink-0">
                        <div>
                            <h3 className="text-base font-extrabold tracking-tight">
                                {tm('bCloseInvoice') || 'Faturayı kapat'}
                            </h3>
                            <p className="text-[11px] font-semibold text-blue-100/90 mt-0.5">
                                {tm('bCloseInvoiceHint') ||
                                    'Kapatınca Kalan tutar Alınan Ödemeye eklenir, Kalan = 0 olur.'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (closing) return;
                                setCloseTarget(null);
                            }}
                            className="p-1.5 rounded-lg hover:bg-white/15 active:scale-95 transition"
                            aria-label="Kapat"
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <PercentBodyModalScrollBody className="p-6">
                        <p className="text-sm font-semibold text-slate-700">
                            {tm('bCloseInvoiceConfirm') ||
                                'Bu randevunun faturasını kapatmak istediğinize emin misiniz?'}
                        </p>
                        <ul className="mt-4 space-y-2 text-[13px] text-slate-600">
                            <li className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                                <span className="font-semibold text-slate-500">{tm('bCustomerCol') || 'Müşteri'}</span>
                                <span className="font-bold text-slate-800">{closeTarget.customer_name || '—'}</span>
                            </li>
                            <li className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                                <span className="font-semibold text-slate-500">{tm('service')}</span>
                                <span className="font-bold text-slate-800 truncate max-w-[60%] text-right">
                                    {closeTarget.service_name || '—'}
                                </span>
                            </li>
                            <li className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                                <span className="font-semibold text-slate-500">{tm('bTotalAmountCol') || 'Toplam Tutar'}</span>
                                <span className="font-bold text-slate-800 tabular-nums">
                                    {fmt(prePaymentServiceTotal(closeTarget))}
                                </span>
                            </li>
                            <li className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                                <span className="font-semibold text-slate-500">
                                    {tm('bKpiTotalReservation') || 'Rezervasyon Miktarı'}
                                </span>
                                <span className="font-bold text-blue-700 tabular-nums">
                                    {fmt(closeTarget.deposit_amount)}
                                </span>
                            </li>
                            <li className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                                <span className="font-semibold text-slate-500">
                                    {tm('bKpiTotalOutstanding') || 'Kalan Bakiye'}
                                </span>
                                <span className="font-bold text-rose-700 tabular-nums">
                                    {fmt(computeKalan(closeTarget))}
                                </span>
                            </li>
                        </ul>
                        <div className="mt-5 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-[12px] font-semibold text-amber-800">
                            {(() => {
                                const willReceive = computeKalan(closeTarget);
                                return (
                                    <>
                                        {tm('bCloseInvoiceWillReceive') ||
                                            'Kapatınca bu tutar Alınan Ödemeye eklenecek:'}{' '}
                                        <b className="tabular-nums">{fmt(willReceive)}</b>
                                    </>
                                );
                            })()}
                        </div>
                    </PercentBodyModalScrollBody>
                    <div className="p-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={() => setCloseTarget(null)}
                            disabled={closing}
                            className="h-10 px-5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-[12px] tracking-wider hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50"
                        >
                            {tm('cancel') || 'İptal'}
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                if (!closeTarget) return;
                                setClosing(true);
                                try {
                                    await beautyService.updateAppointmentStatus(
                                        closeTarget.appointment_id,
                                        'completed',
                                    );
                                    toast.success(tm('bCloseInvoiceOk') || 'Fatura kapatıldı');
                                    setCloseTarget(null);
                                    await load();
                                } catch (e: unknown) {
                                    const msg =
                                        e instanceof Error
                                            ? e.message
                                            : (e as { message?: string })?.message ||
                                              String(e);
                                    toast.error(tm('bCloseInvoiceFail') || 'Fatura kapatılamadı', {
                                        description: msg,
                                    });
                                } finally {
                                    setClosing(false);
                                }
                            }}
                            disabled={closing}
                            className="h-10 px-5 rounded-2xl bg-blue-600 text-white font-bold uppercase text-[12px] tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 inline-flex items-center gap-2"
                        >
                            <CheckCircle2 size={14} />
                            {closing
                                ? tm('bLoading') || 'Kapatılıyor…'
                                : tm('bCloseInvoice') || 'Faturayı kapat'}
                        </button>
                    </div>
                </PercentBodyModal>
            )}

            {/* 19.10.2026 — Rezervasyon detay modalı */}
            {detailRow && (
                <PercentBodyModal
                    onClose={() => setDetailRow(null)}
                    size="wide"
                    ariaLabel={tm('bReservationDetail') || 'Rezervasyon Detayı'}
                >
                    <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-4 text-white flex items-center justify-between shrink-0">
                        <div>
                            <h3 className="text-base font-extrabold tracking-tight">
                                {tm('bReservationDetail') || 'Rezervasyon Detayı'}
                            </h3>
                            <p className="text-[11px] font-semibold text-cyan-100/90 mt-0.5">
                                {detailRow.deposit_sale_fiche_no || detailRow.appointment_id?.slice(0, 8) || '—'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setDetailRow(null)}
                            className="p-1.5 rounded-lg hover:bg-white/15 active:scale-95 transition"
                            aria-label="Kapat"
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <PercentBodyModalScrollBody className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Sol: Randevu Bilgileri */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2">
                                    {tm('bAppointmentInfo') || 'Randevu Bilgileri'}
                                </h4>
                                <div className="space-y-3 text-[13px]">
                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                        <span className="font-semibold text-slate-500">{tm('date')}</span>
                                        <span className="font-bold text-slate-800">{formatReportDateCell(detailRow.appointment_date)}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                        <span className="font-semibold text-slate-500">{tm('time')}</span>
                                        <span className="font-bold text-slate-800 tabular-nums">{detailRow.appointment_time || '—'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                        <span className="font-semibold text-slate-500">{tm('customer')}</span>
                                        <span className="font-bold text-slate-800">{detailRow.customer_name || '—'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                        <span className="font-semibold text-slate-500">{tm('bStaffName')}</span>
                                        <span className="font-bold text-slate-800">{detailRow.specialist_name || '—'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                        <span className="font-semibold text-slate-500">{tm('service')}</span>
                                        <span className="font-bold text-slate-800 truncate max-w-[60%] text-right">{detailRow.service_name || '—'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                        <span className="font-semibold text-slate-500">{tm('status')}</span>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${PAYMENT_STATE_BADGE[detailRow.payment_state] || PAYMENT_STATE_BADGE.no_amount}`}>
                                            {tm(PAYMENT_STATE_LABEL_KEY[detailRow.payment_state] || 'bPaymentStateNoAmount')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Sağ: Ödeme Bilgileri */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2">
                                    {tm('bPaymentInfo') || 'Ödeme Bilgileri'}
                                </h4>
                                <div className="space-y-3 text-[13px]">
                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                        <span className="font-semibold text-slate-500">{tm('bTotalAmountCol') || 'Toplam Tutar'}</span>
                                        <span className="font-bold text-slate-800 tabular-nums">
                                            {fmt(prePaymentServiceTotal(detailRow))}
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                        <span className="font-semibold text-slate-500">{tm('dailyDepositCollected') || 'Rezervasyon Tutarı'}</span>
                                        <span className="font-bold text-cyan-700 tabular-nums">{fmt(Number(detailRow.deposit_amount) || 0)}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                        <span className="font-semibold text-slate-500">{tm('bReceivedPayment') || 'Alınan Ödeme'}</span>
                                        <span className="font-bold text-emerald-700 tabular-nums">{fmt(computeTakenPayment(detailRow))}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-100 pb-2">
                                        <span className="font-semibold text-slate-500">{tm('bKpiTotalOutstanding') || 'Kalan Bakiye'}</span>
                                        <span className={`font-bold tabular-nums ${computeKalan(detailRow) > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                            {fmt(computeKalan(detailRow))}
                                        </span>
                                    </div>
                                </div>

                                {/* Fiş Bilgisi */}
                                {detailRow.deposit_sale_fiche_no && (
                                    <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
                                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                            {tm('bFicheNoCol') || 'Fiş No'}
                                        </div>
                                        <div className="font-mono text-sm text-slate-700">
                                            {detailRow.deposit_sale_fiche_no}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </PercentBodyModalScrollBody>
                    <div className="p-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={() => setDetailRow(null)}
                            className="h-10 px-5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-[12px] tracking-wider hover:bg-slate-100 active:scale-[0.98]"
                        >
                            {tm('close') || 'Kapat'}
                        </button>
                        {/* Fatura kapatma butonu (henüz kapanmamışsa) */}
                        {(() => {
                            const status = String(detailRow.status ?? '').trim().toLowerCase();
                            const closed = status === 'completed' || status === 'closed' || status === 'cancelled' || status === 'no_show';
                            if (closed) return null;
                            return (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDetailRow(null);
                                        setCloseTarget(detailRow);
                                    }}
                                    className="h-10 px-5 rounded-2xl bg-blue-600 text-white font-bold uppercase text-[12px] tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 active:scale-[0.98] inline-flex items-center gap-2"
                                >
                                    <CheckCircle2 size={14} />
                                    {tm('bCloseInvoice') || 'Faturayı kapat'}
                                </button>
                            );
                        })()}
                    </div>
                </PercentBodyModal>
            )}
        </div>
    );
}

export default DepositPrePaymentReport;
