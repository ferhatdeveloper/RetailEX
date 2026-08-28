/**
 * Çek / Senet Takibi (ChequeTrackingReport)
 *
 * Amaç:
 *  - Çek/senet varlıklarını (vade tarihi, tutar, cari, durum) listelemek.
 *  - Tarih/cari/durum filtreleri ve temel toplamları sunmak.
 *
 * Veri kaynağı:
 *  - `rex_${firmNr}_cheques` kart tablosu (`database/migrations/128_cheques_tracking.sql`).
 *  - Frontend `postgres.getCardTableName('cheques')` ile firma prefix'ini otomatik ekler.
 *  - Tablo boşsa "kayıt yok" gösterilir; filtreler ve özet kartları yine görünür.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { formatNumber } from '../../utils/formatNumber';
import { getReportingCurrency } from '../../utils/currency';
import { localTodayDateKey, toSqlDateInputString } from '../../utils/localCalendarDate';
import { postgres } from '../../services/postgres';

export type ChequeStatus =
    | 'pending'
    | 'collected'
    | 'endorsed'
    | 'bounced'
    | 'protested';

interface ChequeRow {
    id: string;
    documentNo: string;
    type: 'cheque' | 'promissory';
    status: ChequeStatus;
    partyType: 'customer' | 'supplier';
    partyName: string;
    partyCode?: string;
    amount: number;
    currencyCode: string;
    dueDate: string;
    issueDate?: string;
    bankName?: string;
    serialNo?: string;
    notes?: string;
}

type StatusFilter = 'all' | ChequeStatus;
type TypeFilter = 'all' | 'cheque' | 'promissory';
type PartyFilter = 'all' | 'customer' | 'supplier';

function defaultRange(): { start: string; end: string } {
    const end = localTodayDateKey();
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start, end };
}

function exportCsv(fileName: string, headers: string[], rows: string[][]): void {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

const STATUS_LABEL: Record<ChequeStatus, { tr: string; en: string; ar: string; ku: string }> = {
    pending: { tr: 'Tahsil Edilecek', en: 'Pending', ar: 'قيد التحصيل', ku: 'چاوەڕوان' },
    collected: { tr: 'Tahsil Edildi', en: 'Collected', ar: 'تم التحصيل', ku: 'وەرگیراوە' },
    endorsed: { tr: 'Ciro Edildi', en: 'Endorsed', ar: 'مظهر', ku: 'گوزەراوە' },
    bounced: { tr: 'Karşılıksız', en: 'Bounced', ar: 'مرتجع', ku: 'بێ بایەخ' },
    protested: { tr: 'Protestolu', en: 'Protested', ar: 'محتجز', ku: 'ڕەتکراو' },
};

export function ChequeTrackingReport() {
    const { tm } = useLanguage();
    const { darkMode } = useTheme();
    const { selectedFirm, selectedDonem } = useFirmaDonem();
    const currency = getReportingCurrency();

    const initial = defaultRange();
    const [startDate, setStartDate] = useState(initial.start);
    const [endDate, setEndDate] = useState(initial.end);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [partyFilter, setPartyFilter] = useState<PartyFilter>('all');
    const [rows, setRows] = useState<ChequeRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (selectedDonem?.beg_date && selectedDonem?.end_date) {
            setStartDate(toSqlDateInputString(selectedDonem.beg_date) || initial.start);
            setEndDate(toSqlDateInputString(selectedDonem.end_date) || initial.end);
        }
    }, [selectedDonem?.beg_date, selectedDonem?.end_date]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            // Veri kaynağı: `rex_${firmNr}_cheques` kart tablosu (firmNr-prefix, period-prefix yok).
            // Tablo henüz yoksa (master schema migration eksik) sessizce boş döndür.
            const chequesTable = postgres.getCardTableName('cheques');
            const { rows: dbRows } = await postgres.query(
                `SELECT id,
                        COALESCE(type, 'cek')           AS type,
                        COALESCE(cari_type, 'customer') AS cari_type,
                        cari_id,
                        cari_name,
                        COALESCE(amount, 0)::float      AS amount,
                        COALESCE(currency, 'IQD')       AS currency,
                        issue_date::text                AS issue_date,
                        due_date::text                  AS due_date,
                        COALESCE(status, 'pending')     AS status,
                        bank_name,
                        serial_no,
                        document_no,
                        notes
                   FROM ${chequesTable}
                  WHERE due_date BETWEEN $1 AND $2
                  ORDER BY due_date ASC
                  LIMIT 1000`,
                [startDate, endDate],
            );

            const mapped: ChequeRow[] = (dbRows as any[]).map((r) => {
                const rawType = String(r.type ?? 'cek').toLowerCase();
                const type: 'cheque' | 'promissory' = rawType === 'senet' ? 'promissory' : 'cheque';
                const rawCariType = String(r.cari_type ?? 'customer').toLowerCase();
                const partyType: 'customer' | 'supplier' =
                    rawCariType === 'supplier' ? 'supplier' : 'customer';
                return {
                    id: String(r.id),
                    documentNo: String(r.document_no ?? r.serial_no ?? ''),
                    type,
                    status: String(r.status ?? 'pending') as ChequeStatus,
                    partyType,
                    partyName: String(r.cari_name ?? ''),
                    partyCode: String(r.cari_id ?? ''),
                    amount: Number(r.amount || 0),
                    currencyCode: String(r.currency ?? 'IQD'),
                    dueDate: String(r.due_date ?? ''),
                    issueDate: String(r.issue_date ?? ''),
                    bankName: r.bank_name ?? undefined,
                    serialNo: r.serial_no ?? undefined,
                    notes: r.notes ?? undefined,
                };
            });
            setRows(mapped);
        } catch (err: any) {
            // Tablo yoksa veya SQL hatası → kullanıcıya kısa uyarı, "kayıt yok" göster.
            const msg = err?.message || String(err);
            if (!/does not exist|relation/i.test(msg)) {
                toast.error(msg);
            }
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        void load();
    }, [load, selectedFirm?.firm_nr, startDate, endDate]);

    const filtered = useMemo(() => {
        return rows.filter((r) => {
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (typeFilter !== 'all' && r.type !== typeFilter) return false;
            if (partyFilter !== 'all' && r.partyType !== partyFilter) return false;
            if (r.dueDate < startDate) return false;
            if (r.dueDate > endDate) return false;
            return true;
        });
    }, [rows, statusFilter, typeFilter, partyFilter, startDate, endDate]);

    const totals = useMemo(() => {
        const sumBy = (predicate: (r: ChequeRow) => boolean) =>
            filtered.filter(predicate).reduce((s, r) => s + r.amount, 0);
        return {
            pending: sumBy((r) => r.status === 'pending'),
            collected: sumBy((r) => r.status === 'collected'),
            endorsed: sumBy((r) => r.status === 'endorsed'),
            bounced: sumBy((r) => r.status === 'bounced'),
            protested: sumBy((r) => r.status === 'protested'),
            total: filtered.reduce((s, r) => s + r.amount, 0),
        };
    }, [filtered]);

    const statusLabel = (s: ChequeStatus) => STATUS_LABEL[s]?.tr || s;
    const panel = darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900';
    const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
    const inputCls = darkMode ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300';
    const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';

    const statusBadge = (s: ChequeStatus) => {
        const map: Record<ChequeStatus, string> = {
            pending: 'bg-amber-100 text-amber-800',
            collected: 'bg-emerald-100 text-emerald-800',
            endorsed: 'bg-blue-100 text-blue-800',
            bounced: 'bg-red-100 text-red-800',
            protested: 'bg-rose-100 text-rose-800',
        };
        return map[s];
    };

    return (
        <div className="space-y-4">
            <div className={`rounded-lg border p-4 ${panel}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="flex items-center gap-2 text-lg font-semibold">
                            <FileText className="h-4 w-4" />
                            {tm('cekSenetTakibi') || 'Çek/Senet Takibi'}
                        </h3>
                        <p className={`text-sm ${muted}`}>
                            Vade, durum ve cari bazlı çek/senet hareketlerini izleyin.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void load()}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${
                                darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            {tm('refresh') || 'Yenile'}
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                exportCsv(
                                    'cek_senet_takibi',
                                    ['Tip', 'Belge No', 'Tür', 'Cari', 'Tutar', 'Vade', 'Banka', 'Durum', 'Açıklama'],
                                    filtered.map((r) => [
                                        r.type === 'cheque' ? 'Çek' : 'Senet',
                                        r.documentNo,
                                        r.partyType === 'customer' ? 'Müşteri' : 'Tedarikçi',
                                        r.partyName,
                                        String(r.amount),
                                        r.dueDate,
                                        r.bankName || '',
                                        r.status,
                                        r.notes || '',
                                    ]),
                                )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                            Excel / CSV
                        </button>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                    <div>
                        <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                            Başlangıç
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`}
                        />
                    </div>
                    <div>
                        <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                            Bitiş
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`}
                        />
                    </div>
                    <div>
                        <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                            Durum
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                            className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`}
                        >
                            <option value="all">Tümü</option>
                            <option value="pending">{statusLabel('pending')}</option>
                            <option value="collected">{statusLabel('collected')}</option>
                            <option value="endorsed">{statusLabel('endorsed')}</option>
                            <option value="bounced">{statusLabel('bounced')}</option>
                            <option value="protested">{statusLabel('protested')}</option>
                        </select>
                    </div>
                    <div>
                        <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                            Tür
                        </label>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                            className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`}
                        >
                            <option value="all">Çek + Senet</option>
                            <option value="cheque">Çek</option>
                            <option value="promissory">Senet</option>
                        </select>
                    </div>
                    <div>
                        <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                            Cari Türü
                        </label>
                        <select
                            value={partyFilter}
                            onChange={(e) => setPartyFilter(e.target.value as PartyFilter)}
                            className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`}
                        >
                            <option value="all">Müşteri + Tedarikçi</option>
                            <option value="customer">Müşteri</option>
                            <option value="supplier">Tedarikçi</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                <div className={`rounded-lg border p-3 ${panel}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>Bekleyen</p>
                    <p className="mt-1 text-lg font-bold text-amber-600">
                        {formatNumber(totals.pending, 2, false)} {currency}
                    </p>
                </div>
                <div className={`rounded-lg border p-3 ${panel}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>Tahsil Edilen</p>
                    <p className="mt-1 text-lg font-bold text-emerald-600">
                        {formatNumber(totals.collected, 2, false)} {currency}
                    </p>
                </div>
                <div className={`rounded-lg border p-3 ${panel}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>Ciro Edilen</p>
                    <p className="mt-1 text-lg font-bold text-blue-600">
                        {formatNumber(totals.endorsed, 2, false)} {currency}
                    </p>
                </div>
                <div className={`rounded-lg border p-3 ${panel}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>Karşılıksız</p>
                    <p className="mt-1 text-lg font-bold text-red-600">
                        {formatNumber(totals.bounced, 2, false)} {currency}
                    </p>
                </div>
                <div className={`rounded-lg border p-3 ${panel}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>Protestolu</p>
                    <p className="mt-1 text-lg font-bold text-rose-600">
                        {formatNumber(totals.protested, 2, false)} {currency}
                    </p>
                </div>
                <div className={`rounded-lg border p-3 ${panel}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>Toplam</p>
                    <p className="mt-1 text-lg font-bold">
                        {formatNumber(totals.total, 2, false)} {currency}
                    </p>
                </div>
            </div>

            <div className={`flex items-start gap-2 rounded-lg border p-3 ${darkMode ? 'border-amber-700/40 bg-amber-900/20 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="text-sm">
                    <strong>TODO:</strong> RetailEX şemasında çek/senet tablosu yoktur.
                    Bu rapor <code className="font-mono text-xs">cheques</code> tablosu eklendiğinde otomatik dolacak şekilde tasarlandı.
                    Şu an kayıt gösterilemiyor; filtreler ve toplam kartlar UI test amaçlı aktiftir.
                </div>
            </div>

            <div className={`overflow-auto rounded-lg border max-h-[520px] ${panel}`}>
                <table className="w-full min-w-[960px] text-sm">
                    <thead className={`sticky top-0 ${thCls}`}>
                        <tr>
                            <th className="px-3 py-2 text-left">Tip</th>
                            <th className="px-3 py-2 text-left">Belge No</th>
                            <th className="px-3 py-2 text-left">Cari</th>
                            <th className="px-3 py-2 text-right">Tutar</th>
                            <th className="px-3 py-2 text-left">Vade</th>
                            <th className="px-3 py-2 text-left">Banka</th>
                            <th className="px-3 py-2 text-left">Durum</th>
                            <th className="px-3 py-2 text-left">Açıklama</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && !loading && (
                            <tr>
                                <td colSpan={8} className="px-3 py-8 text-center opacity-60">
                                    Henüz çek/senet kaydı yok.
                                </td>
                            </tr>
                        )}
                        {filtered.map((r) => (
                            <tr
                                key={r.id}
                                className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}
                            >
                                <td className="px-3 py-2 font-medium">{r.type === 'cheque' ? 'Çek' : 'Senet'}</td>
                                <td className="px-3 py-2 font-mono text-xs">{r.documentNo}</td>
                                <td className="px-3 py-2">
                                    <div className="font-medium">{r.partyName}</div>
                                    <div className="text-xs opacity-60">
                                        {r.partyCode} · {r.partyType === 'customer' ? 'Müşteri' : 'Tedarikçi'}
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-right font-semibold">
                                    {formatNumber(r.amount, 2, false)} {r.currencyCode || currency}
                                </td>
                                <td className="px-3 py-2">{r.dueDate}</td>
                                <td className="px-3 py-2">{r.bankName || '-'}</td>
                                <td className="px-3 py-2">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusBadge(r.status)}`}>
                                        {statusLabel(r.status)}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-xs opacity-70">{r.notes || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default ChequeTrackingReport;
