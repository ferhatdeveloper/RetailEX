/**
 * Dönem Özeti — Aylık Gün Özeti satır drill-down modalı.
 * - CH_TAHSILAT (müşteri tahsilatları) — sign +1 (müşteri alacağı azalır, kasa +)
 * - CH_ODEME (tedarikçi/cari ödemeleri) — sign -1 (cari borcu azalır, kasa -)
 * - Nakit Giriş (REPORT_CASH_IN_TYPES: KASA_GIRIS / ORTAK_SERMAYE_TAHSILAT / ORTAK_PARA_GIRIS) — sign +1
 *
 * Muhasebeci notu:
 *   customer CH_TAHSILAT → party_ledger sign: -1 (alacak azaltıcı); account_movements +1 (kasa)
 *   supplier  CH_ODEME  → party_ledger sign: +1 (borç azaltıcı);  account_movements -1 (kasa)
 *   CH_ODEME müşteri tarafında ise (iade/avans) → party_ledger sign: +1 (alacak artırıcı)
 *   Bu modal liste; sign yönünü kullanıcıya yansıtmak için CH_ODEME tutarları − ile gösterilir.
 *   Nakit Giriş her zaman + (kasaya giren).
 */

import { useMemo } from 'react';
import { Banknote, ListChecks, X } from 'lucide-react';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../shared/PercentBodyModal';
import { useLanguage } from '../../contexts/LanguageContext';
import type { KasaIslemi } from '../../services/api/kasa';
import {
  reportCashInCategory,
  REPORT_CASH_IN_TYPES,
} from '../../utils/reportUnifiedExpenses';
import { localCalendarDateKey } from '../../utils/localCalendarDate';
import { formatNumber } from '../../utils/formatNumber';

interface PeriodSummaryDayDetailModalProps {
  /** YYYY-MM-DD formatında tek bir gün. */
  date: string;
  /** İsteğe bağlı başlık override (örn. "1 Eylül 2026 · Gün Detayı"). Boşsa otomatik üretilir. */
  title?: string;
  currency: string;
  /** Dönem için getirilmiş tüm kasa satırları (cash_lines); modal kendisi filtreler. */
  cashLines: KasaIslemi[];
  onClose: () => void;
}

type DayDetailRow = {
  key: string;
  date: string;
  typeCode: string;
  /** 'tahsilat' | 'odeme' | 'cashIn' — UI bölüm/renk kararı */
  kind: 'tahsilat' | 'odeme' | 'cashIn';
  /** UI'da gösterilecek tutar (CH_ODEME için negatif, diğerleri pozitif). */
  signedAmount: number;
  ficheNo: string;
  description: string;
  partyName: string;
  partyCode: string;
  registerCode: string;
  isBackDated: boolean;
};

const CATEGORY_LABEL_TR: Record<string, string> = {
  CH_TAHSILAT: 'Cari Tahsilat',
  CH_ODEME: 'Cari Ödeme',
  KASA_GIRIS: 'Kasa Giriş',
  ORTAK_SERMAYE_TAHSILAT: 'Ortak Sermaye Tahsilatı',
  ORTAK_PARA_GIRIS: 'Ortak Para Girişi',
};

function labelFor(typeCode: string): string {
  const u = String(typeCode || '').trim().toUpperCase();
  return CATEGORY_LABEL_TR[u] || reportCashInCategory(u);
}

function isBackDated(cl: KasaIslemi): boolean {
  const raw = String(cl.islem_tarihi || '').slice(0, 10);
  const created = String(cl.olusturma_tarihi || '').slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (created && raw && raw < created) return true;
  return !!(raw && today && raw < today);
}

export function PeriodSummaryDayDetailModal({
  date,
  title,
  currency,
  cashLines,
  onClose,
}: PeriodSummaryDayDetailModalProps) {
  const { tm, t } = useLanguage();

  const rows = useMemo<DayDetailRow[]>(() => {
    const targetKey = String(date || '').slice(0, 10);
    const list = Array.isArray(cashLines) ? cashLines : [];
    const out: DayDetailRow[] = [];
    for (const cl of list) {
      const dayKey =
        localCalendarDateKey(cl.islem_tarihi) ||
        String(cl.islem_tarihi || '').slice(0, 10);
      if (dayKey !== targetKey) continue;
      const type = String(cl.islem_tipi || '').trim().toUpperCase();
      const amt = Math.abs(Number(cl.tutar) || 0);
      if (!amt) continue;
      let kind: DayDetailRow['kind'] | null = null;
      let signed = amt;
      if (type === 'CH_TAHSILAT') {
        kind = 'tahsilat';
        signed = amt;
      } else if (type === 'CH_ODEME') {
        kind = 'odeme';
        signed = -amt;
      } else if (REPORT_CASH_IN_TYPES.has(type)) {
        kind = 'cashIn';
        signed = amt;
      } else {
        continue;
      }
      out.push({
        key: String(cl.id || `${type}-${dayKey}-${amt}-${out.length}`),
        date: dayKey,
        typeCode: type,
        kind,
        signedAmount: signed,
        ficheNo: String(cl.islem_no || '').trim() || '—',
        description: String(cl.islem_aciklamasi || '').trim(),
        partyName: String(cl.cari_hesap_unvani || '').trim(),
        partyCode: String(cl.cari_hesap_kodu || '').trim(),
        registerCode:
          String(cl.kasa_id || '').trim() ||
          String((cl as unknown as { kasa_kodu?: string }).kasa_kodu || '').trim(),
        isBackDated: isBackDated(cl),
      });
    }
    out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return out;
  }, [cashLines, date]);

  const tahsilatTotal = useMemo(
    () => rows.filter((r) => r.kind === 'tahsilat').reduce((s, r) => s + r.signedAmount, 0),
    [rows],
  );
  const odemeTotal = useMemo(
    () => rows.filter((r) => r.kind === 'odeme').reduce((s, r) => s + r.signedAmount, 0),
    [rows],
  );
  const cashInTotal = useMemo(
    () => rows.filter((r) => r.kind === 'cashIn').reduce((s, r) => s + r.signedAmount, 0),
    [rows],
  );
  const grandTotal = tahsilatTotal + odemeTotal + cashInTotal;

  const money = (v: number) => {
    const abs = Math.abs(v);
    const sign = v < 0 ? '−' : '';
    return `${sign}${formatNumber(abs, 0, false)} ${currency}`;
  };

  const autoTitle =
    title || `${date} · ${tm('rptPeriodDayDetailTitle')}`;

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={autoTitle}>
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <ListChecks className="w-5 h-5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-base font-semibold truncate">{autoTitle}</h3>
            <p className="text-[11px] text-blue-100/90 mt-0.5 truncate">
              {tm('rptPeriodDayDetailSubtitle')}
            </p>
          </div>
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

      <div className="px-6 py-3 border-b border-slate-100 bg-blue-50/40 dark:border-slate-700 dark:bg-blue-950/20 grid grid-cols-1 sm:grid-cols-4 gap-3 shrink-0">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            {tm('rptPeriodDayDetailTotalTahsilat')}
          </span>
          <span className="font-mono font-extrabold text-emerald-700 dark:text-emerald-300 text-base">
            {money(tahsilatTotal)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
            {tm('rptPeriodDayDetailTotalOdeme')}
          </span>
          <span className="font-mono font-extrabold text-red-600 dark:text-red-400 text-base">
            {money(odemeTotal)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
            {tm('rptPeriodDayDetailTotalCashIn')}
          </span>
          <span className="font-mono font-extrabold text-blue-700 dark:text-blue-300 text-base">
            {money(cashInTotal)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {tm('totalUppercase') || 'Toplam'}
          </span>
          <span className="font-mono font-extrabold text-slate-800 dark:text-slate-100 text-base">
            {money(grandTotal)}
          </span>
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-0">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {tm('rptPeriodDayDetailEmpty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/60 z-10">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColType') || 'Tip'}</th>
                  <th className="px-4 py-2 text-left">{tm('rptPeriodDayDetailParty')}</th>
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColFiche') || 'Fiş No'}</th>
                  <th className="px-4 py-2 text-left">{tm('rptPeriodCashInColDescription') || 'Açıklama'}</th>
                  <th className="px-4 py-2 text-right">{tm('rptPeriodCashInColAmount') || 'Tutar'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const amtCls =
                    row.kind === 'tahsilat'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : row.kind === 'odeme'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-blue-700 dark:text-blue-300';
                  const sectionLabel =
                    row.kind === 'tahsilat'
                      ? tm('rptPeriodDayDetailSectionTahsilat')
                      : row.kind === 'odeme'
                        ? tm('rptPeriodDayDetailSectionOdeme')
                        : tm('rptPeriodDayDetailSectionCashIn');
                  return (
                    <tr
                      key={row.key}
                      className="border-t border-slate-100 dark:border-slate-700/50 hover:bg-blue-50/30 dark:hover:bg-blue-950/20"
                    >
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className={`font-semibold ${amtCls}`}>
                            {labelFor(row.typeCode)}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {sectionLabel}
                          </span>
                        </div>
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
                      <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {row.ficheNo}
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                        {row.description || '—'}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${amtCls}`}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          {row.kind === 'cashIn' ? (
                            <Banknote className="w-3 h-3" aria-hidden />
                          ) : null}
                          {money(row.signedAmount)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
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