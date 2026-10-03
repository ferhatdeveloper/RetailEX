/**
 * Günlük Rapor — Kasa Para Girişi / Çıkışı detay modalı.
 * ReportsModule'taki `dailyCashInRows` (KasaIslemi[]) veya
 * `dailyExpenseRows` (DailyExpenseRow[]) üzerinden tek tip listeleme yapar.
 *
 * Kasa Para Girişi modunda, üst tabloda `REPORT_CASH_IN_TYPES` filtrelenir
 * (KASA_GIRIS / ORTAK_SERMAYE_TAHSILAT / ORTAK_PARA_GIRIS). CH_TAHSILAT
 * (cari tahsilatları) bu üst toplama dahil edilmez; ayrı bölümde listelenir.
 * Cari tahsilatları, ledger'da müşteri alacağını azaltır (kasa + / cari -)
 * — Net Kalan'a etkisi yoktur (simetri). Parent component (ReportsModule)
 * `cariTahsilatlar` prop'u ile bu listeyi modal'a iletir.
 */

import { useMemo } from 'react';
import { Banknote, HandCoins, Wallet, X } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  reportCashInCategory,
  reportCashOutCategory,
  REPORT_CASH_IN_TYPES,
  isCashLineBackDated,
} from '../../utils/reportUnifiedExpenses';
import { localCalendarDateKey } from '../../utils/localCalendarDate';
import { formatNumber } from '../../utils/formatNumber';
import type { KasaIslemi } from '../../services/api/kasa';

export type DailyCashFlowKind = 'cash-in' | 'cash-out';

interface DailyExpenseRowLike {
  key: string;
  sourceKind?: 'cash' | 'expense';
  sourceId: string;
  date: string;
  ficheNo?: string;
  typeCode: string;
  category?: string;
  description?: string;
  partyName?: string;
  amount: number;
}

interface DailyCashFlowModalProps {
  kind: DailyCashFlowKind;
  cashLines?: KasaIslemi[];
  expenseRows?: DailyExpenseRowLike[];
  /**
   * Cari tahsilatları (CH_TAHSILAT) — yalnız `cash-in` modunda kullanılır.
   * Üst "Toplam Kasa Para Girişi"ne dahil edilmez; modal'ın "Cari Tahsilatlar"
   * alt bölümünde ayrıca gösterilir. Boş/undefined ise bölüm gizlenir.
   */
  cariTahsilatlar?: KasaIslemi[];
  title: string;
  currency: string;
  onClose: () => void;
}

function fmtDate(date: string): string {
  return localCalendarDateKey(date) || String(date || '').slice(0, 10) || '—';
}

export function DailyCashFlowModal({
  kind,
  cashLines,
  expenseRows,
  cariTahsilatlar,
  title,
  currency,
  onClose,
}: DailyCashFlowModalProps) {
  const { tm, t } = useLanguage();

  const rows = useMemo(() => {
    if (kind === 'cash-in') {
      const list = Array.isArray(cashLines) ? cashLines : [];
      return list
        .filter((cl) => REPORT_CASH_IN_TYPES.has(String(cl.islem_tipi || '').toUpperCase()))
        .map<DailyExpenseRowLike & { isBackDated: boolean }>((cl) => ({
          key: String(cl.id || cl.islem_no || Math.random()),
          sourceKind: 'cash',
          sourceId: String(cl.id || ''),
          date: String(cl.islem_tarihi || ''),
          ficheNo: String(cl.islem_no || ''),
          typeCode: String(cl.islem_tipi || ''),
          category: reportCashInCategory(String(cl.islem_tipi || '')),
          description: String(cl.islem_aciklamasi || ''),
          partyName: String(cl.cari_hesap_unvani || ''),
          amount: Math.abs(Number(cl.tutar) || 0),
          isBackDated: isCashLineBackDated(cl),
        }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }
    const list = Array.isArray(expenseRows) ? expenseRows : [];
    return [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [kind, cashLines, expenseRows]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [rows],
  );

  // Cari tahsilatlar (CH_TAHSILAT) — yalnız cash-in modunda, ayrı bölüm.
  const cariTahsilatRows = useMemo<DailyExpenseRowLike[]>(() => {
    if (kind !== 'cash-in') return [];
    const list = Array.isArray(cariTahsilatlar) ? cariTahsilatlar : [];
    return list
      .filter((cl) => String(cl.islem_tipi || '').trim().toUpperCase() === 'CH_TAHSILAT')
      .map<DailyExpenseRowLike & { isBackDated: boolean }>((cl) => ({
        key: String(cl.id || cl.islem_no || Math.random()),
        sourceKind: 'cash',
        sourceId: String(cl.id || ''),
        date: String(cl.islem_tarihi || ''),
        ficheNo: String(cl.islem_no || ''),
        typeCode: 'CH_TAHSILAT',
        category: 'Cari Tahsilat',
        description: String(cl.islem_aciklamasi || ''),
        partyName: String(cl.cari_hesap_unvani || ''),
        amount: Math.abs(Number(cl.tutar) || 0),
        isBackDated: isCashLineBackDated(cl),
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [kind, cariTahsilatlar]);

  const cariTahsilatTotal = useMemo(
    () => cariTahsilatRows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [cariTahsilatRows],
  );

  const showCariTahsilatSection = kind === 'cash-in' && cariTahsilatRows.length > 0;
  const money = (v: number) => `${formatNumber(v, 0, false)} ${currency}`;

  const Icon = kind === 'cash-in' ? Banknote : Wallet;
  const accent = kind === 'cash-in' ? 'from-emerald-600 to-emerald-700' : 'from-rose-600 to-rose-700';
  const accentLight = kind === 'cash-in' ? 'border-emerald-100 bg-emerald-50/60' : 'border-rose-100 bg-rose-50/60';
  const accentText = kind === 'cash-in' ? 'text-emerald-800' : 'text-rose-800';
  const accentVal = kind === 'cash-in' ? 'text-emerald-700' : 'text-rose-700';

  const labelType = kind === 'cash-in' ? tm('rptPeriodCashInColType') : tm('rptPeriodColExpenses');

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={title}>
      <div
        className={`bg-gradient-to-r ${accent} px-6 py-4 text-white flex items-center justify-between shrink-0`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="w-5 h-5 shrink-0" aria-hidden />
          <h3 className="text-base font-semibold truncate">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/40"
          aria-label={t['close'] || 'Kapat'}
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
      </div>

      <div
        className={`px-6 py-3 border-b border-slate-100 ${accentLight} flex items-center justify-between gap-3 shrink-0`}
      >
        <div className={`text-[11px] font-bold uppercase tracking-wider ${accentText}`}>
          {kind === 'cash-in' ? tm('rptPeriodTotalCashIn') : tm('rptPeriodTotalExpenses')}
        </div>
        <div className={`font-mono font-extrabold text-lg ${accentVal}`}>{money(total)}</div>
      </div>

      <PercentBodyModalScrollBody className="p-0">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {tm('accNoData') || 'Bu tarih aralığında kayıt yok.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/60 z-10">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColDate')}</th>
                  <th className="px-4 py-2 text-left">{labelType}</th>
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColFiche')}</th>
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColDescription')}</th>
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColParty')}</th>
                  <th className="px-4 py-2 text-right">{tm('rptPeriodCashInColAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const dateLabel = fmtDate(row.date);
                  const category =
                    row.category ||
                    (kind === 'cash-out'
                      ? reportCashOutCategory(row.typeCode)
                      : reportCashInCategory(row.typeCode));
                  const isBackDated =
                    kind === 'cash-in'
                      ? Boolean((row as DailyExpenseRowLike & { isBackDated?: boolean }).isBackDated)
                      : false;
                  return (
                    <tr
                      key={row.key}
                      className={`border-t border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/40`}
                    >
                      <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {dateLabel}
                        {isBackDated ? (
                          <span
                            className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                            title={tm('cashModalBackDatedConfirm')}
                          >
                            {tm('cashLineBackDated')}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200">{category}</td>
                      <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-200">
                        {row.ficheNo || '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                        {row.description || '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                        {row.partyName || '—'}
                      </td>
                      <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${accentVal}`}>
                        {money(Number(row.amount) || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40">
                  <td colSpan={5} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {tm('rptPeriodTotalRow')}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono font-extrabold ${accentVal}`}>
                    {money(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Cari Tahsilatlar alt bölümü — CH_TAHSILAT (ayrı sorgudan).
            Ledger simetrisi: kasa + / cari - → Net Kalan'a etkisi 0. Bu bölüm
            kullanıcıya "Kasa Para Girişi" kartı içinde CH_TAHSILAT'ı gösterir;
            üst toplama katılmaz. */}
        {showCariTahsilatSection ? (
          <section className="border-t-2 border-slate-200 dark:border-slate-700 mt-2 px-6 pb-6 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <HandCoins className="w-4 h-4 text-cyan-700 dark:text-cyan-300" aria-hidden />
              <h4 className="text-[12px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                {tm('rptPeriodCashInCariTahsilatTitle') ||
                  'Cari Tahsilatlar (müşteri alacağı azaltıcı — Net Kalan\'a etkisiz)'}
              </h4>
              <span className="ml-auto text-[11px] text-slate-500">{cariTahsilatRows.length} kayıt</span>
              <span className="font-mono font-extrabold text-cyan-700 dark:text-cyan-300">
                {money(cariTahsilatTotal)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300 bg-cyan-50/60 dark:bg-cyan-950/20">
                    <th className="px-3 py-1.5 text-left">{tm('rptPeriodCashInColDate')}</th>
                    <th className="px-3 py-1.5 text-left">{labelType}</th>
                    <th className="px-3 py-1.5 text-left">{tm('rptPeriodCashInColFiche')}</th>
                    <th className="px-3 py-1.5 text-left">{tm('rptPeriodCashInColDescription')}</th>
                    <th className="px-3 py-1.5 text-left">{tm('rptPeriodCashInColParty')}</th>
                    <th className="px-3 py-1.5 text-right">{tm('rptPeriodCashInColAmount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cariTahsilatRows.map((row) => {
                    const dateLabel = fmtDate(row.date);
                    const isBackDated = Boolean(
                      (row as DailyExpenseRowLike & { isBackDated?: boolean }).isBackDated,
                    );
                    return (
                      <tr
                        key={row.key}
                        className="border-t border-slate-100 dark:border-slate-700/50 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20"
                      >
                        <td className="px-3 py-1.5 font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">
                          {dateLabel}
                          {isBackDated ? (
                            <span
                              className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                              title={tm('cashModalBackDatedConfirm')}
                            >
                              {tm('cashLineBackDated')}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">
                          {tm('rptPeriodColCariTahsilat') || 'Cari Tahsilat'}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-slate-700 dark:text-slate-200">
                          {row.ficheNo || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">
                          {row.description || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">
                          {row.partyName || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap text-cyan-700 dark:text-cyan-300">
                          {money(Number(row.amount) || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </PercentBodyModalScrollBody>

      <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/30 flex items-center justify-end gap-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-xs tracking-wider hover:bg-slate-100 active:scale-[0.98] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {t['close'] || 'Kapat'}
        </button>
      </div>
    </PercentBodyModal>
  );
}