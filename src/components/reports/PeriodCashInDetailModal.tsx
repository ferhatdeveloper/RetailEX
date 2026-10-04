/**
 * Dönem Özeti — "Kasa Para Girişi" detay modalı.
 *
 * İki ayrı bölüm:
 * 1) REPORT_CASH_IN_TYPES (KASA_GIRIS / ORTAK_SERMAYE_TAHSILAT / ORTAK_PARA_GIRIS)
 *    → mevcut ana tablo. Üst toplam yalnızca bu satırları özetler (geriye dönük uyumlu).
 * 2) CH_TAHSILAT (cari tahsilatları) → ayrı "Cari Tahsilatlar" alt bölümü. Parent
 *    component `cariTahsilatlar` prop'u ile besler; modal kendi içinde filtreleyip
 *    sıralar. Geçmiş tarihe girilenler `is_back_dated` rozeti ile ayrıca işaretlenir.
 *
 * Ciro tanımı geri-çevrim (2026-10-04): Ciro = yalnızca satış cirosu. CH_TAHSILAT
 * Ciro'ya yansımaz; ayrı kolon + modal alt bölümünde izlenir. Üst başlıktaki
 * "Toplam Kasa Para Girişi" CH_TAHSILAT hariç tutulur.
 */

import { useMemo } from 'react';
import { Banknote, CalendarClock, HandCoins, X } from 'lucide-react';
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
  /**
   * Cari tahsilatları (CH_TAHSILAT) — modal'ın alt bölümünde ayrı tabloda gösterilir.
   * Boş/undefined ise cari tahsilat bölümü gizlenir; geriye dönük uyum bozulmaz.
   */
  cariTahsilatlar?: KasaIslemi[];
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
  partyCode: string;
  amount: number;
  isBackDated: boolean;
};

function inPeriod(date: string, periodKey?: string | null): boolean {
  if (!periodKey) return true;
  const k = localCalendarDateKey(date) || '';
  if (!k) return false;
  return k.startsWith(periodKey);
}

function toRow(cl: KasaIslemi, fallbackIndex: number, typeCode: string): CashInDetailRow | null {
  const amt = Math.abs(Number(cl.tutar) || 0);
  if (!amt) return null;
  const date = localCalendarDateKey(cl.islem_tarihi) || String(cl.islem_tarihi || '').slice(0, 10);
  return {
    key: String(cl.id || `${typeCode}-${date}-${amt}-${fallbackIndex}`),
    date,
    typeCode,
    category:
      typeCode === 'CH_TAHSILAT'
        ? 'Cari Tahsilat'
        : reportCashInCategory(typeCode),
    ficheNo: String(cl.islem_no || '').trim() || '—',
    description: String(cl.islem_aciklamasi || '').trim(),
    partyName: String(cl.cari_hesap_unvani || '').trim(),
    partyCode: String(cl.cari_hesap_kodu || '').trim(),
    amount: amt,
    isBackDated: isCashLineBackDated(cl),
  };
}

export function PeriodCashInDetailModal({
  cashLines,
  periodKey,
  title,
  currency,
  cariTahsilatlar,
  onClose,
}: PeriodCashInDetailModalProps) {
  const { tm, t } = useLanguage();

  // Ana tablo — yalnızca REPORT_CASH_IN_TYPES (CH_TAHSILAT Hariç)
  const rows = useMemo<CashInDetailRow[]>(() => {
    const list = Array.isArray(cashLines) ? cashLines : [];
    const out: CashInDetailRow[] = [];
    for (const cl of list) {
      const type = String(cl.islem_tipi || '').trim().toUpperCase();
      if (!REPORT_CASH_IN_TYPES.has(type)) continue;
      const row = toRow(cl, out.length, type);
      if (!row) continue;
      if (!inPeriod(row.date, periodKey)) continue;
      out.push(row);
    }
    out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return out;
  }, [cashLines, periodKey]);

  // Cari tahsilat alt bölümü — CH_TAHSILAT (ayrı sorgudan / parent state'ten)
  const cariTahsilatRows = useMemo<CashInDetailRow[]>(() => {
    const list = Array.isArray(cariTahsilatlar) ? cariTahsilatlar : [];
    const out: CashInDetailRow[] = [];
    for (const cl of list) {
      const type = String(cl.islem_tipi || '').trim().toUpperCase();
      if (type !== 'CH_TAHSILAT') continue;
      const row = toRow(cl, out.length, type);
      if (!row) continue;
      if (!inPeriod(row.date, periodKey)) continue;
      out.push(row);
    }
    out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return out;
  }, [cariTahsilatlar, periodKey]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [rows],
  );
  const cariTahsilatTotal = useMemo(
    () => cariTahsilatRows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [cariTahsilatRows],
  );
  const money = (v: number) => `${formatNumber(v, 0, false)} ${currency}`;

  const showCariTahsilatSection = cariTahsilatRows.length > 0;

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
        {/* Ana tablo — KASA_GIRIS / ORTAK_SERMAYE_TAHSILAT / ORTAK_PARA_GIRIS */}
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

        {/* Cari Tahsilatlar alt bölümü — CH_TAHSILAT (ayrı sorgudan) */}
        {showCariTahsilatSection ? (
          <section className="border-t-2 border-slate-200 dark:border-slate-700 mt-2">
            <div className="px-6 py-3 flex items-center justify-between gap-3 bg-cyan-50/60 dark:bg-cyan-950/20">
              <div className="inline-flex items-center gap-2 min-w-0">
                <HandCoins className="w-4 h-4 text-cyan-700 dark:text-cyan-300 shrink-0" aria-hidden />
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-200 truncate">
                  {tm('rptPeriodCashInCariTahsilatTitle')}
                </span>
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 hidden sm:inline">
                  {tm('rptPeriodCashInCariTahsilatTotal')}
                </span>
                <span className="font-mono font-extrabold text-cyan-700 dark:text-cyan-300 text-base whitespace-nowrap">
                  {money(cariTahsilatTotal)}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
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
                  {cariTahsilatRows.map((row) => (
                    <tr
                      key={`ct-${row.key}`}
                      className="border-t border-slate-100 dark:border-slate-700/50 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20"
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
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold">Cari Tahsilat</span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {tm('rptPeriodCashInCariTahsilatSectionLabel')}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-200">
                        {row.ficheNo}
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                        {row.description || '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                        <div className="flex flex-col">
                          <span className="font-medium">{row.partyName || '—'}</span>
                          {row.partyCode ? (
                            <span className="text-[10px] font-mono text-slate-500">
                              {row.partyCode}
                            </span>
                          ) : null}
                        </div>
                      </td>
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
                    <td className="px-4 py-2 text-right font-mono font-extrabold text-cyan-700 dark:text-cyan-300">
                      {money(cariTahsilatTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ) : null}

        {/* Cari tahsilat prop'u geçildi ama boş döndüyse kullanıcıya bilgi ver */}
        {cariTahsilatlar !== undefined && cariTahsilatRows.length === 0 ? (
          <div className="border-t-2 border-slate-200 dark:border-slate-700 px-6 py-4 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/40 dark:bg-slate-800/30">
            <div className="inline-flex items-center gap-2">
              <HandCoins className="w-3.5 h-3.5 text-slate-400" aria-hidden />
              <span>{tm('rptPeriodCashInCariTahsilatEmpty')}</span>
            </div>
          </div>
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