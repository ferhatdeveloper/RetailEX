/**
 * Dönem Özeti — "Kasa Para Girişi" detay modalı.
 * REPORT_CASH_IN_TYPES (KASA_GIRIS / ORTAK_SERMAYE_TAHSILAT / ORTAK_PARA_GIRIS)
 * tiplerinde cash_lines satırlarını listeler. Geçmiş tarihe girilenler `is_back_dated`
 * rozeti ile ayrıca işaretlenir (audit trail).
 */

import { useMemo } from 'react';
import { Banknote, CalendarClock, X } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  reportCashInCategory,
  REPORT_CASH_IN_TYPES,
  isCashLineBackDated,
} from '../../utils/reportUnifiedExpenses';
import type { KasaIslemi } from '../../services/api/kasa';
import { localCalendarDateKey } from '../../utils/localCalendarDate';
import { formatNumber } from '../../utils/formatNumber';

interface PeriodCashInDetailModalProps {
  cashLines: KasaIslemi[];
  /** Tıklanan satırın dönem anahtarı (YYYY-MM-DD veya YYYY-MM); boşsa tüm liste. */
  periodKey?: string | null;
  title: string;
  currency: string;
  onClose: () => void;
}

type CashInDetailRow = {
  key: string;
  date: string;
  typeCode: string;
  category: string;
  ficheNo: string;
  description: string;
  partyName: string;
  amount: number;
  isBackDated: boolean;
};

function inPeriod(date: string, periodKey?: string | null): boolean {
  if (!periodKey) return true;
  const k = localCalendarDateKey(date) || '';
  if (!k) return false;
  return k.startsWith(periodKey);
}

export function PeriodCashInDetailModal({
  cashLines,
  periodKey,
  title,
  currency,
  onClose,
}: PeriodCashInDetailModalProps) {
  const { tm, t } = useLanguage();

  const rows = useMemo<CashInDetailRow[]>(() => {
    const list = Array.isArray(cashLines) ? cashLines : [];
    const out: CashInDetailRow[] = [];
    for (const cl of list) {
      const type = String(cl.islem_tipi || '').trim().toUpperCase();
      if (!REPORT_CASH_IN_TYPES.has(type)) continue;
      const amt = Math.abs(Number(cl.tutar) || 0);
      if (!amt) continue;
      const date = localCalendarDateKey(cl.islem_tarihi) || String(cl.islem_tarihi || '').slice(0, 10);
      if (!inPeriod(date, periodKey)) continue;
      out.push({
        key: String(cl.id || `${type}-${date}-${amt}-${out.length}`),
        date,
        typeCode: type,
        category: reportCashInCategory(type),
        ficheNo: String(cl.islem_no || '').trim() || '—',
        description: String(cl.islem_aciklamasi || '').trim(),
        partyName: String(cl.cari_hesap_unvani || '').trim(),
        amount: amt,
        isBackDated: isCashLineBackDated(cl),
      });
    }
    out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return out;
  }, [cashLines, periodKey]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [rows],
  );
  const money = (v: number) => `${formatNumber(v, 0, false)} ${currency}`;

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={title}>
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Banknote className="w-5 h-5 shrink-0" aria-hidden />
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

      <div className="px-6 py-3 border-b border-slate-100 bg-emerald-50/60 dark:border-slate-700 dark:bg-emerald-950/20 flex items-center justify-between gap-3 shrink-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-200">
          {tm('rptPeriodTotalCashIn')}
        </div>
        <div className="font-mono font-extrabold text-emerald-700 dark:text-emerald-300 text-lg">
          {money(total)}
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-0">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {tm('accNoData') || 'Bu dönem için kasa para girişi kaydı yok.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/60 z-10">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColDate')}</th>
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColType')}</th>
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColFiche')}</th>
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColDescription')}</th>
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColParty')}</th>
                  <th className="px-4 py-2 text-right">{tm('rptPeriodCashInColAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-t border-slate-100 dark:border-slate-700/50 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20"
                  >
                    <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{row.date}</span>
                        {row.isBackDated ? (
                          <span
                            className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                            title={tm('cashModalBackDatedConfirm')}
                          >
                            <CalendarClock className="w-3 h-3" aria-hidden />
                            {tm('cashLineBackDated')}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-200">{row.category}</td>
                    <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-200">{row.ficheNo}</td>
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-200">{row.description || '—'}</td>
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-200">{row.partyName || '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                      {money(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40">
                  <td colSpan={5} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {tm('rptPeriodTotalRow')}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-extrabold text-emerald-700 dark:text-emerald-300">
                    {money(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
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