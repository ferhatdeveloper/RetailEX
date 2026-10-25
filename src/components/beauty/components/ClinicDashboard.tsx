
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
    Calendar, CalendarRange, CheckCircle2, Clock,
    Activity, TrendingUp, Wallet,
    Phone,
    ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import type { BeautyAppointment } from '../../../types/beauty';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { beautyAppointmentDateKey, formatLocalYmd } from '../../../utils/dateLocal';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';
import { computeClinicDayKpis, listClinicTodayAppointments } from '../../../utils/clinicDashboardStats';
import {
    clinicCallBoardBounds,
    filterClinicCallBoardRows,
    groupClinicCallBoardByService,
    selectClinicCallBoardRows,
} from '../../../utils/clinicCallBoard';
import { beautyService } from '../../../services/beautyService';
import { beautySalePocketCollected, beautySaleRemainingCari, extraCustomerCollectionsNotOnSales } from '../../../utils/saleCollectedAmounts';
import { fetchKasaIslemleri } from '../../../services/api/kasa';
import type { BeautySale } from '../../../types/beauty';
import { useBeautyTimeFormat } from '../../../hooks/useBeautyTimeFormat';
import { clinicDashboardTahsilatTotal } from '../../../utils/clinicDashboardKasaGiris';
import { cancelledUnclosedReservationBox } from '../../../utils/cancelledReservationBox';
import { BeautyServiceReportCrmModal } from '../../reports/BeautyServiceReportCrmModal';
import { useClinicShellV2 } from '../clinicShellV2';
import { ClinicDashboardV2 } from './ClinicDashboardV2';
import { ClinicDashboardKpiCard } from './ClinicDashboardKpiCard';
import '../ClinicStyles.css';

// ─── Design tokens (flat) ────────────────────────────────────────────────────
const T = {
    bg:          '#f7f6fb',
    surface:     '#ffffff',
    border:      '#e8e4f0',
    borderHover: '#c4b5fd',
    textPrimary: '#111827',
    textSub:     '#6b7280',
    textMuted:   '#9ca3af',
    violet:      '#7c3aed',
    violetLight: '#ede9fe',
    pink:        '#db2777',
    /** Hizmet Bazlı Rapor / gruplu görünüm başlığı (Güzellik raporları ile aynı ton) */
    reportPink:  '#ec4899',
    pinkLight:   '#fce7f3',
    green:       '#059669',
    greenLight:  '#d1fae5',
    amber:       '#d97706',
    amberLight:  '#fef3c7',
    blue:        '#2563eb',
    blueLight:   '#dbeafe',
};

// ─── Component ───────────────────────────────────────────────────────────────
type CallTab = 'today' | 'tomorrow' | 'week' | 'month' | 'range';

export function ClinicDashboard() {
    const { tm, language } = useLanguage();
    const shellV2 = useClinicShellV2();
    const { formatTime } = useBeautyTimeFormat();
    const {
        appointments, services, specialists, devices,
        loadAppointments, loadServices, loadSpecialists, loadDevices, updateAppointment,
    } = useBeautyStore();
    const [callTab, setCallTab] = useState<CallTab>('today');
    /** Arama panosu «Bu ay» görünümünde takvim ayı (0 = içinde bulunulan ay). */
    const [callMonthOffset, setCallMonthOffset] = useState(0);
    const [callRowsRaw, setCallRowsRaw] = useState<BeautyAppointment[]>([]);
    const [callLoading, setCallLoading] = useState(false);
    const [callFilterServiceId, setCallFilterServiceId] = useState('');
    const [callFilterDeviceId, setCallFilterDeviceId] = useState('');
    const [callBoardRefreshTick, setCallBoardRefreshTick] = useState(0);
    const [callBoardCrmAppointment, setCallBoardCrmAppointment] = useState<BeautyAppointment | null>(null);
    /** İkinci görünüm: Hizmet Bazlı Rapor benzeri pembe başlık + alt tablo */
    const [callGroupByService, setCallGroupByService] = useState(false);
    const [callRangeFrom, setCallRangeFrom] = useState(() => formatLocalYmd(new Date()));
    const [callRangeTo, setCallRangeTo] = useState(() => {
        const x = new Date();
        x.setDate(x.getDate() + 14);
        return formatLocalYmd(x);
    });
    const [todaySales, setTodaySales] = useState<BeautySale[]>([]);
    const [todayExtraCash, setTodayExtraCash] = useState(0);
    /**
     * Bug 12.10.2026 — TAHSİLAT KPI'sı bugün KASA_GIRIS toplamından da
     * besleniyor. `mainSales.total` formülü `total_gross=0` olan satışlarda
     * 0 dönüyordu; gerçek ödeme cash_lines'a `KASA_GIRIS` olarak yazıldı
     * (örn. 45.000 + 40.000 = 85.000). State, `stats.revenue` useMemo'sunun
     * `clinicDashboardTahsilatTotal`'a geçeceği filtrelenmiş cash_lines
     * listesini tutar; iptal edilen fişlerin CH_TAHSILAT satırları Hariç
     * tutulmuş hâlde.
     */
    const [todayCashLines, setTodayCashLines] = useState<
        Parameters<typeof clinicDashboardTahsilatTotal>[0]['cashLines']
    >([]);
    /**
     * Bug ekleme (12.10.2026): REZERVASYON KPI'sı bugün 4 rezervasyon
     * avansı (toplam 50.000 IQD) olmasına rağmen 0 gösteriyordu. Bunun
     * nedeni KPI'nın yalnızca `beauty_sales` tablosundaki deposit fişlerinden
     * (`is_deposit` / `parent_sale_id` / notes-tag) hesaplanması; oysa
     * POS'tan alınan rezervasyon avansları `avansService.recordAdvance`
     * akışıyla `rex_<firmNr>_<periodNr>_cari_avans` tablosuna (migration
     * 194) yazılır — `beauty_sales`'a değil.
     *
     * Bu state bugünkü açık avansları (`status = 'open'`) tutar/sayı
     * olarak tutar; `stats.reservation` iki kaynağın toplamıdır:
     *   reservation = Σ sales.deposit_total + Σ cari_avans.today
     */
    const [todayReservations, setTodayReservations] = useState<{ amount: number; count: number }>({ amount: 0, count: 0 });
    const [todayAvansRows, setTodayAvansRows] = useState<Array<{
        id: string;
        amount: number;
        status: string;
        notes: string | null;
        created_at: string;
        applied_sale_id: string | null;
    }>>([]);

    const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = useMemo(() => ({
        scheduled:   { label: tm('bAppointmentScheduled'), color: '#6366f1', bg: '#eef2ff' },
        confirmed:   { label: tm('bAppointmentConfirmed'), color: '#0284c7', bg: '#e0f2fe' },
        // 09.10.2026 — pre_paid durumu için rozet eklendi; önce yoktu ve
        // STATUS_CFG['pre_paid'] undefined → fallback scheduled ("Planlandı")
        // ile gösterilirdi. Şimdi doğru etiket: "Ön Ödeme Alındı".
        pre_paid:    { label: tm('bAppointmentPrePaid') || 'Ön Ödeme Alındı', color: '#0d9488', bg: '#ccfbf1' },
        in_progress: { label: tm('bAppointmentStarted'), color: '#d97706', bg: '#fef3c7' },
        completed:   { label: tm('bAppointmentCompleted'), color: '#059669', bg: '#d1fae5' },
        cancelled:   { label: tm('bAppointmentCancelled'), color: '#dc2626', bg: '#fee2e2' },
        no_show:     { label: tm('bAppointmentNoShow'), color: '#6b7280', bg: '#f3f4f6' },
    }), [language]);

    const todayStr = formatLocalYmd(new Date());

    useEffect(() => {
        loadAppointments(todayStr);
        loadServices();
        loadSpecialists();
        void loadDevices();
        void Promise.all([
            beautyService.getSalesWithItemsForLocalCalendarDay(todayStr).catch(() => [] as BeautySale[]),
            fetchKasaIslemleri({
                baslangic_tarihi: todayStr,
                bitis_tarihi: `${todayStr}T23:59:59`,
            }).catch(() => []),
            // Bug 13: iptal edilen güzellik satışlarının fiş numaralarını da çek.
            // `getSalesWithItemsForLocalCalendarDay` zaten iptal olanları SQL'de
            // filtreliyor; bu yüzden `extraCustomerCollectionsNotOnSales` iptal
            // fişlerin CH_TAHSILAT satırını "satış yok → ek nakit" sanıyor ve
            // Klinik Paneli TAHSİLAT KPI'sı yanlış şişiyordu (20.000 IQD).
            beautyService.getCancelledReceiptNumbersForDay(todayStr).catch(() => [] as string[]),
            // Bug ekleme (12.10.2026): cari_avans (migration 194) bugünkü açık
            // avansların tutar/sayısı. POS'tan rezervasyon avansı alındığında
            // `avansService.recordAdvance` `cari_avans` tablosuna yazar; bu
            // avanslar REZERVASYON KPI'sını besler. Hata durumunda 0 dönerek
            // KPI'yı düşürmez, sadece avans katkısı eksik kalır.
            beautyService.getCariAvansForDay(todayStr).catch(() => ({ amount: 0, count: 0 })),
            beautyService.listCariAvansRowsForDay(todayStr).catch(() => []),
        ]).then(([salesRows, kasaRows, cancelledReceipts, avansToday, avansRows]) => {
            const sales = Array.isArray(salesRows) ? salesRows : [];
            const cancelledSet = new Set(
                (Array.isArray(cancelledReceipts) ? cancelledReceipts : [])
                    .map((x) => String(x ?? '').trim().toLowerCase())
                    .filter(Boolean)
            );
            const kasaRowsFiltered = Array.isArray(kasaRows)
                ? cancelledSet.size === 0
                    ? kasaRows
                    : kasaRows.filter((line) => {
                        const tip = String((line as { islem_tipi?: string }).islem_tipi ?? '').trim().toUpperCase();
                        if (tip !== 'CH_TAHSILAT') return true;
                        const ref = String((line as { islem_no?: string }).islem_no ?? '').trim().toLowerCase();
                        return !cancelledSet.has(ref);
                    })
                : [];
            setTodaySales(sales);
            // Bug ekleme (12.10.2026): cari_avans bugünkü toplam / sayı.
            // Helper idempotent döner; hata durumunda zaten 0 obje döner.
            setTodayReservations({
                amount: Math.max(0, Number(avansToday?.amount ?? 0) || 0),
                count: Math.max(0, Number(avansToday?.count ?? 0) || 0),
            });
            setTodayAvansRows(Array.isArray(avansRows) ? avansRows : []);
            setTodayExtraCash(extraCustomerCollectionsNotOnSales(
                kasaRowsFiltered,
                sales.map((s) => ({
                    total: Number(s.total) || 0,
                    paymentMethod: s.payment_method,
                    receiptNumber: s.invoice_number,
                    paid_amount: s.paid_amount,
                    remaining_amount: s.remaining_amount,
                    payments: (s as { payments?: unknown }).payments as
                        | Array<{ method?: string; amount?: number; currency?: string }>
                        | undefined,
                })),
            ));
            // Bug 12.10.2026 — TAHSİLAT KPI'sı bugünkü KASA_GIRIS satırlarından
            // besleniyor. `kasaRowsFiltered` iptal edilen fişlerin CH_TAHSILAT
            // satırlarını zaten çıkardı; burada state'e alarak `stats.revenue`
            // useMemo'suna aktarıyoruz. Helper imzalarıyla eşleşmesi için
            // `transaction_type / sign` alanlarını da sanal olarak ekliyoruz
            // (KasaIslemi'de yoklar; helper clamp ile güvenli).
            setTodayCashLines(
                kasaRowsFiltered.map((line) => ({
                    transaction_type: String(
                        (line as { islem_tipi?: string }).islem_tipi ?? ''
                    ).trim().toUpperCase(),
                    special_code: String(
                        (line as { ozel_kod?: string }).ozel_kod ?? ''
                    ).trim().toUpperCase(),
                    amount: Math.abs(Number((line as { tutar?: number }).tutar ?? 0) || 0),
                }))
            );
        }).catch(() => {
            setTodaySales([]);
            setTodayExtraCash(0);
            // Bug ekleme (12.10.2026): cari_avans sorgusu patlarsa da KPI
            // 0 ile başlar; deposit + 0 = önceki davranış (geriye dönük uyumlu).
            setTodayReservations({ amount: 0, count: 0 });
            setTodayAvansRows([]);
            // Bug 12.10.2026 — TAHSİLAT fallback: sorgu patlarsa KPI yine
            // mevcut davranışa (mainSales.reduce) geriler; KASA_GIRIS katkısı
            // eksik kalır ama dashboard boş ekranda kalmaz.
            setTodayCashLines([]);
        });
    }, []);

    useEffect(() => {
        if (shellV2) return;
        const { start, end } = clinicCallBoardBounds({
            tab: callTab,
            now: new Date(),
            monthOffset: callMonthOffset,
            rangeFrom: callRangeFrom,
            rangeTo: callRangeTo,
        });
        let cancelled = false;
        setCallLoading(true);
        beautyService
            .getAppointmentsInRange(start, end)
            .then((rows) => {
                if (cancelled) return;
                setCallRowsRaw(selectClinicCallBoardRows(rows));
            })
            .catch(() => {
                if (!cancelled) setCallRowsRaw([]);
            })
            .finally(() => {
                if (!cancelled) setCallLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [callTab, callMonthOffset, callBoardRefreshTick, callRangeFrom, callRangeTo, appointments, shellV2]);

    const callRows = useMemo(
        () => filterClinicCallBoardRows(callRowsRaw, callFilterServiceId, callFilterDeviceId),
        [callRowsRaw, callFilterServiceId, callFilterDeviceId],
    );

    const callRowsGrouped = useMemo(() => groupClinicCallBoardByService(callRows), [callRows]);

    const markCallDone = useCallback(
        async (id: string) => {
            try {
                await updateAppointment(id, { confirmation_call_at: new Date().toISOString() });
                setCallRowsRaw((prev) =>
                    prev.map((r) =>
                        r.id === id ? { ...r, confirmation_call_at: new Date().toISOString() } : r
                    )
                );
            } catch {
                /* toast optional */
            }
        },
        [updateAppointment]
    );

    const markActivityDone = useCallback(
        async (id: string) => {
            try {
                await updateAppointment(id, { pre_visit_activity_at: new Date().toISOString() });
                setCallRowsRaw((prev) =>
                    prev.map((r) =>
                        r.id === id ? { ...r, pre_visit_activity_at: new Date().toISOString() } : r
                    )
                );
            } catch {
                /* ignore */
            }
        },
        [updateAppointment]
    );

    const renderCallActivityButtons = (apt: BeautyAppointment) => {
        const hasCall = Boolean(apt.confirmation_call_at);
        const hasAct = Boolean(apt.pre_visit_activity_at);
        return (
            <div style={{ display: 'flex', flexShrink: 0, gap: 6, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    disabled={hasCall}
                    onClick={() => void markCallDone(apt.id)}
                    style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: 'none',
                        background: hasCall ? T.greenLight : T.amberLight,
                        color: hasCall ? T.green : T.amber,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: hasCall ? 'default' : 'pointer',
                        opacity: hasCall ? 0.85 : 1,
                    }}
                >
                    {tm('bCallMarked')}
                </button>
                <button
                    type="button"
                    disabled={hasAct}
                    onClick={() => void markActivityDone(apt.id)}
                    style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: 'none',
                        background: hasAct ? '#f3e8ff' : T.violetLight,
                        color: hasAct ? '#9333ea' : T.violet,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: hasAct ? 'default' : 'pointer',
                        opacity: hasAct ? 0.85 : 1,
                    }}
                >
                    {tm('bActivityMarked')}
                </button>
            </div>
        );
    };

    const stats = useMemo(() => {
        /**
         * Bug 21: KPI şeridi (TAHSİLAT hariç) pure helper'dan hesaplanır.
         * Yardımcı, `expectedRevenue`/`remaining` hesabını appointments
         * tablosundan bağımsız yapar (peşinatlı modda `beauty_sales` boş
         * dönse bile PRE_PAID/SCHEDULED/CONFIRMED/IN_PROGRESS dahil).
         */
        const kpis = computeClinicDayKpis({
            appointments,
            todayStr,
            dateKeyOf: beautyAppointmentDateKey,
        });
        /**
         * Peşinat fişleri (`is_deposit === true` veya `parent_sale_id != null`)
         * ana satış fişinin `paid_amount` alanına zaten yansıtılıyor; ayrıca
         * KPI'ya eklersek aynı tahsilatı iki kez sayıyoruz (ör. 20.000 peşinat
         * → rezervasyon fişi 20.000 + ana satış paid_amount 20.000 = 40.000).
         * Bu nedenle ciro-dışı peşinat fişleri KPI toplamından hariç tutulur;
         * 90 yıllık muhasebeci: "kasaya giren nakit" = ana satışların
         * ödenen kısmı; peşinat ayrıca sayılmaz, kalan cari = ana satış
         * `remaining_amount` toplamı olarak hesaplanır.
         *
         * Bug 12: iptal edilen satışlar (`payment_status` cancelled/void
         * vb.) hem ciro hem kalan cari toplamından dışlanır; aksi hâlde
         * iptal edilen randevunun cari 55.000'i günlük satışta görünmeye
         * devam ediyordu. `beautySalePocketCollected` / `beautySaleRemainingCari`
         * de kendi içinde filtreliyor; burada da açıkça dışlıyoruz.
         */
        const mainSales = todaySales.filter((sale) => {
            const s = sale as BeautySale & {
                is_deposit?: boolean | null;
                parent_sale_id?: string | null;
                payment_status?: string | null;
                notes?: string | null;
            };
            if (s.is_deposit === true || s.parent_sale_id != null) return false;
            // Yedek tanımlayıcı: migration 192 kolonları eksik/yanlış olan
            // eski peşinat fişleri için notes içindeki `deposit:1` ve
            // `parent_sale:<uuid>` tag'lerine de bakılır (Bug ARAM-collected-2x).
            const notes = String(s.notes ?? '');
            if (notes) {
                if (beautyService.parseDepositFlagFromNotes(notes)) return false;
                if (beautyService.parseParentSaleIdFromNotes(notes)) return false;
            }
            const ps = String(s.payment_status ?? '').trim().toLowerCase();
            if (ps === 'cancelled' || ps === 'canceled' || ps === 'refunded' || ps === 'void' || ps === 'iptal' || ps === 'silindi' || ps === 'deleted') return false;
            // Peşinatlı Cari Düzeltmesi (madde 4): peşinatlı modda oluşan ana
            // satış fişi `payment_status='pending'` ve `remaining_amount=0`.
            // Gerçek hizmet verilmedi → ciro/cari KPI'ya sızmamalı. Sadece
            // hizmet verildikten sonra `collectAppointmentRemainder`
            // tarafından oluşturulan `BEAUTY-MAIN-{aptId}` fişi sayılır.
            if (ps === 'pending' || ps === 'partial' || ps === 'awaiting_service') return false;
            return true;
        });
        /**
         * Bug 22: Klinik Paneli "Tahsilat" KPI'sı kullanıcının iş gereksinimine
         * göre yeniden tanımlandı. Önceki davranış `beautySalePocketCollected`
         * → yalnızca `cash + card + transfer` tahsilatı (avans/peşinat hariç).
         *
         * Senaryo (kullanıcı şikâyeti 09.10.2026):
         *  - ROZA: hizmet 50.000, avans (REZERVASYON) 15.000, kalan nakit 35.000
         *  - ARA:  hizmet 50.000, peşin nakit 50.000
         *  - Önceki KPI = 35.000 + 50.000 = 85.000 (yanlış; avans düşülmüş)
         *  - Yeni KPI    = 50.000 + 50.000 = 100.000 (hizmet tam tutarı)
         *
         * "Randevu kapanmışsa rezervasyon + kalan hizmet tutarı yansıyacak,
         * yani hizmetin tam tutarı" gereksinimi → tamamlanan randevunun
         * `total` (belge tutarı) toplamı. Avans ayrıca sayılmaz çünkü zaten
         * `total` içinde; buradaki KPI kasaya giren nakit değil,
         * **hizmetin brüt ciro** toplamıdır.
         *
         * `todayExtraCash` hariç tutuldu: bu helper `KASA_GIRIS` /
         * `CH_TAHSILAT` gibi satış dışı tahsilatları ekliyor; KPI "hizmet
         * tam tutarı" olduğu için burada yeri yok (kasa tarafı ayrı rapor).
         *
         * `remainingCari` 0: hizmet tam tutarı zaten avans dahil olduğu için
         * "kalan cari" bilgisi bu KPI'da anlamlı değil; sub-text'te göstermek
         * yanıltıcı olur (Kasa Durumu ve Cari Ekstre ayrı yerde kalan cari
         bakiyesini gösterir — burada 0 dönmek doğru).
         *
         * Bug ekleme 12.10.2026 — TAHSİLAT KPI'sı bugünkü KASA_GIRIS +
         * CH_TAHSILAT (REZERVASYON Hariç) toplamıdır. `revenueFromSales`
         * (ana satış `total`) **Hariç**: Bug 22 sonrası düzeltme (12.10.2026).
         *
         * Kök neden: randevu `status='completed'` olduğunda hizmetin bedeli
         * `cash_lines`'a `KASA_GIRIS` olarak yazılır. `beauty_sales.total`
         * ve `cash_lines.KASA_GIRIS` aynı parayı temsil eder (peşin nakit /
         * kalan nakit); ikisini birden toplamak **çift sayım** yaratır.
         *
         *   Senaryo (12.10.2026):
         *     - KASA_GIRIS              = 30.000 (NIHAT hizmet 30.000 peşin nakit)
         *     - cari_avans (status=open)= 20.000 (POS rezervasyon avansı)
         *     - ÖNCEKİ (3-katman dahil) = 30 + 30 + 0 + 20 = 80.000 (yanlış)
         *     - YENİ   (mainSales=[])   =  0 + 30 + 0 + 20 = 50.000 (doğru)
         *
         * Bug 22 semantiği korunur: hizmet tam tutarı zaten KASA_GIRIS'te
         * yansır (peşin + kalan nakit toplamı); avans ayrıca
         * `reservationFromAvans` üzerinden sayılır (REZERVASYON Hariç).
         *
         * Helper 3-katmanlı hesabı hâlâ yapıyor (test uyumu); production
         * call site yalnız KASA_GIRIS + CH_TAHSILAT (REZ Hariç) katmanını
         * kullanır. `revenueFromSales` regresyonu için ayrı bir test var.
         */
        const tahsilat = clinicDashboardTahsilatTotal({
            mainSales: [],
            cashLines: todayCashLines,
        });
        // 12.10.2026 — Kullanıcı isteği: TAHSİLAT = toplam kasaya giren nakit
        // (avans/rezervasyon dahil). REZERVASYON KPI ayrı görünmeye devam
        // eder; buradaki toplam kasaya yansıyan parayı temsil eder.
        //   Bugün 12.10.2026: 85.000 KASA_GIRIS + 55.000 cari_avans = 140.000
        //   REZERVASYON kart'ı (55.000) ise avans bilgilendirmesi olarak kalır.
        // `reservation` ve `reservationFromAvans` aşağıda hesaplanıyor; onları
        // tahsilat.revenue'a ekleyerek toplam TAHSİLAT elde edilir.
        const reservationFromAvans = Math.max(0, Number(todayReservations?.amount ?? 0) || 0);
        const revenue = tahsilat.revenue; // aşağıda reservation + reservationFromAvans eklenecek
        /**
         * Rezervasyon KPI toplamı: bugün alınan peşinat / avans fişlerinin
         * `total` toplamı. Ana satış fişleri hariç, deposit fişleri (`is_deposit`
         * veya `parent_sale_id`) ve `notes` içindeki yedek tag'ler
         * (`deposit:1`, `parent_sale:<uuid>`) dahil edilir. mainSales
         * filtresinin tersi olarak tasarlandı — aynı not-parse mantığı uygulanır.
         */
        const reservationSales = todaySales.filter((sale) => {
            const s = sale as BeautySale & {
                is_deposit?: boolean | null;
                parent_sale_id?: string | null;
                notes?: string | null;
            };
            if (s.is_deposit === true || s.parent_sale_id != null) return true;
            const notes = String(s.notes ?? '');
            if (notes) {
                if (beautyService.parseDepositFlagFromNotes(notes)) return true;
                if (beautyService.parseParentSaleIdFromNotes(notes)) return true;
            }
            return false;
        });
        const reservationBox = cancelledUnclosedReservationBox({
            appointments: appointments.filter((apt) => beautyAppointmentDateKey(apt) === todayStr),
            avansRows: todayAvansRows,
            depositSales: reservationSales.map((sale) => ({
                total: sale.total,
                notes: sale.notes,
                linked_appointment_id: sale.linked_appointment_id,
                sale_group_id: sale.sale_group_id,
                created_at: sale.created_at,
            })),
        });
        const remainingCari = 0;

        /**
         * Bug ekleme (12.10.2026) — REZERVASYON KPI toplamı.
         * İki kaynak toplanır:
         *   - `reservationSales`: `beauty_sales` içindeki deposit fişleri
         *     (`is_deposit` / `parent_sale_id` / notes-tag — ana tablo).
         *   - `todayReservations.amount`: `rex_<firm>_<period>_cari_avans`
         *     tablosundaki bugün alınan açık avanslar (POS rezervasyon
         *     avansları, migration 194; `avansService.recordAdvance`).
         *
         * Bu iki kaynak **farklı hayat döngüsünde** oluşur:
         *   1) Cari ekstre / cari avans (cari_avans tablosu, status=open)
         *   2) Peşinat fişi (beauty_sales tablosu, is_deposit=true)
         * Aynı para iki kez sayılmaz çünkü tipik akış ya cari_avans'a ya
         * beauty_sales deposit'e düşer; iki yerde birden olan kayıt uç
         * durumdur ve muhasebe tarafında `applyAdvanceToSale`
         * `applied_sale_id` ile bağlandığında izlenebilir.
         *
         * Not: `reservationFromAvans` yukarıda TAHSİLAT formülü için bir kez
         * hesaplandı; burada yeniden hesaplamıyoruz.
         */

        const sorted = listClinicTodayAppointments(kpis.todayApts);

        return {
            todayApts: sorted,
            completed: kpis.completed,
            pending: kpis.pending,
            inProg: kpis.inProg,
            cancelled: kpis.cancelled,
            // 12.10.2026 — Kullanıcı isteği (revize): TAHSİLAT = KASA_GIRIS
            // + cari_avans. Bugün 30k KASA_GIRIS + 20k cari_avans = 50.000.
            //   - `tahsilat.revenue` = 0 (revenueFromSales Hariç) +
            //     30.000 (KASA_GIRIS) + 0 (CH_TAHSILAT REZERVASYON Hariç)
            //     = 30.000
            //   - `reservationFromAvans` = 20.000 (bugün açık cari_avans)
            // REZERVASYON KPI ayrı kart = avans bilgilendirmesi.
            revenue: revenue + reservationFromAvans,
            // REZERVASYON kartı: iptal edilmiş ve kapanmamış randevunun peşinatı.
            // Tahsilat formülü (revenue + reservationFromAvans) aynı kalır.
            reservation: reservationBox.amount,
            remainingCari,
            expectedRevenue: kpis.expectedRevenue,
            remaining: kpis.remaining,
            rate: kpis.rate,
            total: kpis.total,
        };
    }, [appointments, todayStr, todaySales, todayReservations, todayAvansRows, todayCashLines]);

    const fmt = (n: number) => formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });

    /** is_active personel (toplam aktif kadro) */
    const activeStaff = useMemo(() => specialists.filter(s => s.is_active), [specialists]);

    const topServices = services.slice(0, 6);

    if (shellV2) {
        return (
            <ClinicDashboardV2
                revenue={stats.revenue}
                appointmentCount={stats.total}
                cancelledCount={stats.cancelled}
                appointments={appointments}
                specialists={specialists}
                todayStr={todayStr}
            />
        );
    }

    return (
        <div
            style={{ height: '100%', overflowY: 'auto', background: T.bg }}
            className="custom-scrollbar p-3 sm:p-5"
        >

            {/* ── Date strip ──────────────────────────────────────── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 18, fontWeight: 800, color: T.textPrimary, letterSpacing: '-0.02em' }}>
                        {tm('bClinicPanelTitle')}
                    </h1>
                    <p style={{ fontSize: 12, fontWeight: 500, color: T.textMuted, marginTop: 2 }}>
                        {new Date().toLocaleDateString(tm('localeCode'), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: 6, padding: '6px 12px',
                    maxWidth: '100%',
                }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, display: 'inline-block' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.green, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tm('bLiveBadge')}</span>
                    <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>·</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>{tm('bTodayNAppointments').replace('{n}', String(stats.total))}</span>
                </div>
            </div>

            {/* ── KPI Strip ───────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <ClinicDashboardKpiCard toneKey="collection" label={tm('cebeGirenNakit')} value={fmt(stats.revenue)} sub={stats.remainingCari > 0 ? `${tm('kalanCari')}: ${fmt(stats.remainingCari)}` : undefined} icon={TrendingUp} />
                <ClinicDashboardKpiCard toneKey="reservation" label={tm('bKpiReservationLabel')} value={fmt(stats.reservation)} sub={stats.reservation > 0 ? tm('bKpiReservationSub') : tm('bKpiReservationSub')} icon={Wallet} />
                <ClinicDashboardKpiCard toneKey="completed" label={tm('bKpiCompletedLabel')} value={stats.completed} sub={tm('bKpiCompletionRateSub').replace('{n}', String(stats.rate))} icon={CheckCircle2} />
                <ClinicDashboardKpiCard toneKey="pending" label={tm('bKpiPendingLabel')} value={stats.pending} sub={tm('bKpiInProgressSub').replace('{n}', String(stats.inProg))} icon={Clock} />
                <ClinicDashboardKpiCard toneKey="cancelled" label={tm('bKpiCancelledLabel') || 'İptal'} value={stats.cancelled} icon={Activity} />
                <ClinicDashboardKpiCard toneKey="expected-revenue" label={tm('bKpiExpectedRevenue')} value={fmt(stats.expectedRevenue)} sub={tm('bKpiRemainingAppointmentsSub').replace('{n}', String(stats.remaining))} icon={Wallet} />
            </div>

            {/* ── Ön arama / aktivite (Bugün · Yarın · Hafta · Ay) ───────────── */}
            <div style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                marginBottom: 20,
                overflow: 'hidden',
            }}>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '12px 16px',
                    borderBottom: `1px solid ${T.border}`,
                    background: '#faf9fd',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Phone size={16} style={{ color: T.violet }} />
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>{tm('bCallBoardTitle')}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {([
                            ['today', 'bCallBoardToday'],
                            ['tomorrow', 'bCallBoardTomorrow'],
                            ['week', 'bCallBoardWeek'],
                            ['month', 'bCallBoardMonth'],
                        ] as const).map(([id, labelKey]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => {
                                    if (id === 'month') setCallMonthOffset(0);
                                    setCallTab(id);
                                }}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: callTab === id ? 'none' : `1px solid ${T.border}`,
                                    background: callTab === id ? T.violet : '#fff',
                                    color: callTab === id ? '#fff' : T.textSub,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                {tm(labelKey)}
                            </button>
                        ))}
                        {callTab === 'month' && (
                            <>
                                <button
                                    type="button"
                                    title={tm('bCallBoardPrevMonth')}
                                    aria-label={tm('bCallBoardPrevMonth')}
                                    onClick={() => setCallMonthOffset((o) => o - 1)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        border: `1px solid ${T.border}`,
                                        background: '#fff',
                                        color: T.textSub,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <ChevronLeft size={14} strokeWidth={2.25} />
                                    {tm('bCallBoardPrevMonth')}
                                </button>
                                <button
                                    type="button"
                                    title={tm('bCallBoardNextMonth')}
                                    aria-label={tm('bCallBoardNextMonth')}
                                    onClick={() => setCallMonthOffset((o) => o + 1)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        border: `1px solid ${T.border}`,
                                        background: '#fff',
                                        color: T.textSub,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {tm('bCallBoardNextMonth')}
                                    <ChevronRight size={14} strokeWidth={2.25} />
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            title={tm('bCallBoardDateRange')}
                            aria-label={tm('bCallBoardDateRange')}
                            onClick={() => setCallTab('range')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: callTab === 'range' ? 'none' : `1px solid ${T.border}`,
                                background: callTab === 'range' ? T.violet : '#fff',
                                color: callTab === 'range' ? '#fff' : T.textSub,
                                cursor: 'pointer',
                            }}
                        >
                            <CalendarRange size={15} strokeWidth={2.25} />
                        </button>
                        {callTab === 'range' && (
                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'flex-end',
                                    gap: 8,
                                }}
                            >
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {tm('bCallBoardRangeFrom')}
                                    </span>
                                    <input
                                        type="date"
                                        value={callRangeFrom}
                                        onChange={(e) => setCallRangeFrom(e.target.value)}
                                        style={{
                                            padding: '6px 8px',
                                            borderRadius: 6,
                                            border: `1px solid ${T.border}`,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: T.textPrimary,
                                            background: '#fff',
                                        }}
                                    />
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {tm('bCallBoardRangeTo')}
                                    </span>
                                    <input
                                        type="date"
                                        value={callRangeTo}
                                        onChange={(e) => setCallRangeTo(e.target.value)}
                                        style={{
                                            padding: '6px 8px',
                                            borderRadius: 6,
                                            border: `1px solid ${T.border}`,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: T.textPrimary,
                                            background: '#fff',
                                        }}
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                </div>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    padding: '8px 16px 10px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: T.textMuted,
                    borderBottom: `1px solid ${T.border}`,
                }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: T.amber }} />
                        {tm('bCallBoardLegendCall')}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: '#9333ea' }} />
                        {tm('bCallBoardLegendActivity')}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: T.green }} />
                        {tm('bCallBoardLegendOk')}
                    </span>
                </div>
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 16px 12px',
                        borderBottom: `1px solid ${T.border}`,
                        background: '#fff',
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px', minWidth: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {tm('beautyServiceFilterLabel')}
                        </span>
                        <select
                            value={callFilterServiceId}
                            onChange={(e) => setCallFilterServiceId(e.target.value)}
                            style={{
                                padding: '8px 10px',
                                borderRadius: 6,
                                border: `1px solid ${T.border}`,
                                fontSize: 12,
                                fontWeight: 600,
                                color: T.textPrimary,
                                background: '#fff',
                                width: '100%',
                                cursor: 'pointer',
                            }}
                        >
                            <option value="">{tm('beautyServiceFilterPlaceholder')}</option>
                            {services
                                .filter((s) => s.is_active !== false)
                                .slice()
                                .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr'))
                                .map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px', minWidth: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {tm('bCallBoardFilterDevice')}
                        </span>
                        <select
                            value={callFilterDeviceId}
                            onChange={(e) => setCallFilterDeviceId(e.target.value)}
                            style={{
                                padding: '8px 10px',
                                borderRadius: 6,
                                border: `1px solid ${T.border}`,
                                fontSize: 12,
                                fontWeight: 600,
                                color: T.textPrimary,
                                background: '#fff',
                                width: '100%',
                                cursor: 'pointer',
                            }}
                        >
                            <option value="">{tm('bCallBoardAllDevices')}</option>
                            {devices
                                .filter((d) => d.is_active)
                                .slice()
                                .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr'))
                                .map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                        </select>
                    </div>
                    <label
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            marginLeft: 4,
                            paddingTop: 18,
                            flex: '1 1 240px',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={callGroupByService}
                            onChange={(e) => setCallGroupByService(e.target.checked)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: T.violet }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>{tm('bCallBoardGroupByService')}</span>
                    </label>
                </div>
                <div style={{ maxHeight: callGroupByService ? 520 : 280, overflowY: 'auto' }} className="custom-scrollbar">
                    {callLoading ? (
                        <p style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.textMuted }}>…</p>
                    ) : callRows.length === 0 ? (
                        <p style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.textMuted }}>{tm('bCallBoardEmpty')}</p>
                    ) : callGroupByService ? (
                        <div style={{ padding: '10px 10px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {callRowsGrouped.map((g) => (
                                <div
                                    key={g.serviceName}
                                    style={{
                                        border: `1px solid ${T.border}`,
                                        borderRadius: 10,
                                        overflow: 'hidden',
                                        background: T.surface,
                                        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
                                    }}
                                >
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        title={tm('beautyServiceHeaderCrmHint')}
                                        onClick={() => {
                                            const first = g.items[0];
                                            if (first) setCallBoardCrmAppointment(first);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                const first = g.items[0];
                                                if (first) setCallBoardCrmAppointment(first);
                                            }
                                        }}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: 12,
                                            padding: '11px 14px',
                                            background: T.reportPink,
                                            color: '#fff',
                                            fontWeight: 800,
                                            fontSize: 14,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <span style={{ letterSpacing: '-0.02em' }}>{g.serviceName}</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.95 }}>
                                            {tm('subTotal')}: {fmt(g.sum)}
                                        </span>
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12 }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${T.border}` }}>
                                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('date')}</th>
                                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('customer')}</th>
                                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('bStaffView')}</th>
                                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('bDeviceView')}</th>
                                                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('amount')}</th>
                                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }}>{tm('status')}</th>
                                                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted }} />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {g.items.map((apt) => {
                                                    const hasCall = Boolean(apt.confirmation_call_at);
                                                    const hasAct = Boolean(apt.pre_visit_activity_at);
                                                    const accent = hasCall && hasAct ? T.green : !hasCall ? T.amber : '#9333ea';
                                                    const dateLabel = beautyAppointmentDateKey(apt);
                                                    const time = formatTime(apt.appointment_time ?? apt.time);
                                                    const st = String(apt.status ?? '');
                                                    const stCfg = STATUS_CFG[st] ?? STATUS_CFG.scheduled;
                                                    return (
                                                        <tr
                                                            key={apt.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => setCallBoardCrmAppointment(apt)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    setCallBoardCrmAppointment(apt);
                                                                }
                                                            }}
                                                            style={{
                                                                borderBottom: `1px solid ${T.border}`,
                                                                cursor: 'pointer',
                                                                background: '#fff',
                                                            }}
                                                        >
                                                            <td style={{ padding: '9px 10px', borderLeft: `4px solid ${accent}`, whiteSpace: 'nowrap', color: T.textPrimary, fontWeight: 600 }}>
                                                                {dateLabel} <span style={{ color: T.textMuted, fontWeight: 500 }}>{time}</span>
                                                            </td>
                                                            <td style={{ padding: '9px 10px', fontWeight: 700, color: T.textPrimary }}>
                                                                {apt.customer_name ?? tm('bCustomerFallbackName')}
                                                            </td>
                                                            <td style={{ padding: '9px 10px', color: T.textSub }}>
                                                                {String(apt.specialist_name ?? apt.staff_name ?? '').trim() || '—'}
                                                            </td>
                                                            <td style={{ padding: '9px 10px', color: T.textSub }}>
                                                                {String(apt.device_name ?? '').trim() || '—'}
                                                            </td>
                                                            <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: T.textPrimary, whiteSpace: 'nowrap' }}>
                                                                {fmt(Number(apt.total_price ?? 0))}
                                                            </td>
                                                            <td style={{ padding: '9px 10px' }}>
                                                                <span
                                                                    style={{
                                                                        display: 'inline-block',
                                                                        fontSize: 10,
                                                                        fontWeight: 700,
                                                                        padding: '2px 8px',
                                                                        borderRadius: 4,
                                                                        background: stCfg.bg,
                                                                        color: stCfg.color,
                                                                        textTransform: 'capitalize',
                                                                    }}
                                                                >
                                                                    {stCfg.label}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '9px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                                                                {renderCallActivityButtons(apt)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        callRows.map((apt) => {
                            const hasCall = Boolean(apt.confirmation_call_at);
                            const hasAct = Boolean(apt.pre_visit_activity_at);
                            const accent = hasCall && hasAct ? T.green : !hasCall ? T.amber : '#9333ea';
                            const dateLabel = beautyAppointmentDateKey(apt);
                            const time = formatTime(apt.appointment_time ?? apt.time);
                            return (
                                <div
                                    key={apt.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '10px 16px',
                                        borderBottom: `1px solid ${T.border}`,
                                        borderLeft: `4px solid ${accent}`,
                                        background: '#fff',
                                    }}
                                >
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        title={tm('bCallBoardRowOpenCrm')}
                                        onClick={() => setCallBoardCrmAppointment(apt)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setCallBoardCrmAppointment(apt);
                                            }
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#faf9fd';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'transparent';
                                        }}
                                        style={{
                                            minWidth: 0,
                                            flex: 1,
                                            cursor: 'pointer',
                                            borderRadius: 8,
                                            padding: '4px 6px',
                                            margin: '-4px -6px',
                                            outline: 'none',
                                        }}
                                    >
                                        <p style={{ fontSize: 12, fontWeight: 800, color: T.textPrimary, margin: 0 }}>
                                            {apt.customer_name ?? tm('bCustomerFallbackName')}
                                        </p>
                                        <p style={{ fontSize: 11, color: T.violet, margin: '4px 0 0', fontWeight: 600 }}>
                                            {dateLabel} {time} · {apt.service_name ?? '—'}
                                            {apt.device_name ? ` · ${apt.device_name}` : ''}
                                            <span style={{ color: T.textMuted, fontWeight: 600, marginLeft: 8 }}>
                                                ({tm('bCallBoardCrmLinkHint')})
                                            </span>
                                        </p>
                                    </div>
                                    {renderCallActivityButtons(apt)}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <BeautyServiceReportCrmModal
                open={callBoardCrmAppointment != null}
                onClose={() => setCallBoardCrmAppointment(null)}
                appointment={callBoardCrmAppointment}
                accentColor={T.violet}
                onSaved={() => {
                    setCallBoardRefreshTick((t) => t + 1);
                }}
            />

            {/* ── Main Grid ───────────────────────────────────────── */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">

                {/* Today's Appointments */}
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 18px', borderBottom: `1px solid ${T.border}`,
                    }}>
                        <div>
                            <p style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>{tm('bTodayAppointmentsTitle')}</p>
                            <p style={{ fontSize: 11, fontWeight: 500, color: T.textMuted, marginTop: 1 }}>{tm('bRegisteredAppointmentsSub').replace('{n}', String(stats.total))}</p>
                        </div>
                        <Calendar size={16} style={{ color: T.violet }} />
                    </div>

                    <div style={{ overflowX: 'auto' }} className="custom-scrollbar">
                        {/* Column headers */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '56px 8px 1fr 72px 88px 80px',
                            minWidth: 560,
                            gap: 8, padding: '8px 18px',
                            borderBottom: `1px solid ${T.border}`,
                            background: '#faf9fd',
                        }}>
                            {[tm('bTimeHeader'), '', tm('bCustomerServiceHeader'), tm('bDurationHeader'), tm('bStatus'), tm('bDashboardColAmount')].map((h, i) => (
                                <span key={i} style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
                            ))}
                        </div>

                        {/* Rows */}
                        <div style={{ maxHeight: 400, overflowY: 'auto' }} className="custom-scrollbar">
                            {stats.todayApts.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: T.textMuted }}>
                                    <Calendar size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                                    <p style={{ fontSize: 12, fontWeight: 600 }}>{tm('bNoAppointmentsToday')}</p>
                                </div>
                            ) : stats.todayApts.map(apt => {
                                const cfg  = STATUS_CFG[apt.status] ?? STATUS_CFG.scheduled;
                                const time = formatTime(apt.appointment_time ?? apt.time);
                                return (
                                    <div
                                        key={apt.id}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '56px 8px 1fr 72px 88px 80px',
                                            minWidth: 560,
                                            gap: 8, padding: '11px 18px',
                                            borderBottom: `1px solid ${T.border}`,
                                            alignItems: 'center',
                                            transition: 'background 0.1s',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = '#faf9fd')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        {/* Time */}
                                        <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{time}</span>

                                        {/* Status dot */}
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block', boxShadow: `0 0 0 2px ${cfg.bg}` }} />

                                        {/* Info */}
                                        <div style={{ minWidth: 0 }}>
                                            <p style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {apt.customer_name ?? tm('bCustomerFallbackName')}
                                            </p>
                                            <p style={{ fontSize: 11, fontWeight: 500, color: T.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {apt.service_name ?? '—'}{apt.specialist_name ? ` · ${apt.specialist_name}` : ''}
                                            </p>
                                        </div>

                                        {/* Duration */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.textMuted, whiteSpace: 'nowrap' }}>
                                            <Clock size={11} />
                                            <span style={{ fontSize: 11, fontWeight: 600 }}>{apt.duration ?? '?'}{tm('bDkSuffix')}</span>
                                        </div>

                                        {/* Status pill */}
                                        <span style={{
                                            display: 'inline-block', fontSize: 10, fontWeight: 700,
                                            padding: '2px 8px', borderRadius: 4,
                                            background: cfg.bg, color: cfg.color,
                                            whiteSpace: 'nowrap',
                                        }}>{cfg.label}</span>

                                        {/* Price */}
                                        <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            {(apt.total_price ?? 0) > 0 ? fmt(apt.total_price) : '—'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Services */}
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <p style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>{tm('bServicesSectionTitle')}</p>
                            <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>{tm('bServicesDefinedCount').replace('{n}', String(services.length))}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {topServices.length === 0 ? (
                                <p style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', padding: '12px 0' }}>{tm('bNoServicesDefined')}</p>
                            ) : topServices.map((svc, i) => (
                                <div key={svc.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{
                                        width: 22, height: 22, borderRadius: 4,
                                        background: svc.color ?? T.violet,
                                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 10, fontWeight: 800, flexShrink: 0,
                                    }}>{i + 1}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{svc.name}</span>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: T.textSub, flexShrink: 0, marginLeft: 6 }}>{fmt(svc.price)}</span>
                                        </div>
                                        <div style={{ height: 3, background: '#f0ecfc', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${100 - i * 14}%`, background: svc.color ?? T.violet, borderRadius: 2 }} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Staff */}
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <p style={{ fontSize: 13, fontWeight: 800, color: T.textPrimary }}>{tm('bStaffSectionTitle')}</p>
                            <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>{tm('bStaffActiveShort').replace('{n}', String(activeStaff.length))}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {activeStaff.length === 0 ? (
                                <p style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', padding: '12px 0' }}>{tm('bNoStaffDefined')}</p>
                            ) : activeStaff.slice(0, 6).map((s, i) => {
                                const init = s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                                return (
                                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, background: '#faf9fd' }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, width: 14, textAlign: 'center' }}>{i + 1}</span>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: 6,
                                            background: s.color ?? T.violet,
                                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 10, fontWeight: 800, flexShrink: 0,
                                        }}>{init}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</p>
                                            <p style={{ fontSize: 10, fontWeight: 500, color: T.textMuted }}>{s.specialty ?? tm('bSpecialist')}</p>
                                        </div>
                                        <span style={{
                                            fontSize: 10, fontWeight: 700,
                                            padding: '2px 6px', borderRadius: 4,
                                            background: `${s.color ?? T.violet}18`,
                                            color: s.color ?? T.violet,
                                        }}>%{s.commission_rate}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
