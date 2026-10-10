import React, { useEffect, useMemo, useState } from 'react';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import { employeeAPI, type PayrollMonthLine } from '../../../services/api/partiesEmployees';
import { partyAPI } from '../../../services/api/parties';
import type { Party } from '../../../core/types/models';
import { ArrowRightLeft, Calendar, ChevronDown, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useNestedT } from './useNestedT';

export interface PayrollVarianceModalProps {
  onClose: () => void;
  /** Fark tespit edilen personel için EmployeePayrollModal'ı hazır değerlerle aç */
  onOpenAdjustment?: (employee: Party, payload: {
    bonusAmount?: number;
    penaltyAmount?: number;
    bonusDefinition?: string;
    penaltyDefinition?: string;
    txnDate: string;
    /** Maaş tutarı (kasadan çıkacak olan). Düzeltme ise genelde 0. */
    salaryAmount: number;
  }) => void;
}

type VarianceRow = PayrollMonthLine & {
  /** Brüt maaş × çalışılan gün (prorate). Yoksa salary_base. */
  expectedAccrual: number;
  /** Ödenen + avans toplamı (kasadan çıkan). */
  paidOut: number;
  /** Fark: paidOut − expectedAccrual. Pozitif = fazla ödeme, negatif = eksik ödeme. */
  variance: number;
  hasOnlyAdvance: boolean;
};

/**
 * Geçen ay (veya seçilen ay) için bordro fark analizi.
 * Amaç: personele fazla veya eksik ödeme yapılan ayları tespit edip
 * BONUS_HAKKEDIS (fazla ödeme ödül/bonus) veya CEZA_ODEME (eksik ödeme
 * düzeltmesi/kesinti) olarak işlemek.
 */
export function PayrollVarianceModal({ onClose, onOpenAdjustment }: PayrollVarianceModalProps) {
  const t = useNestedT();

  // YYYY-MM seçimi (varsayılan: geçen ay)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexli → geçen ay
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  });

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<VarianceRow[]>([]);
  const [partyMap, setPartyMap] = useState<Map<string, Party>>(new Map());

  const periodRange = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map((v) => parseInt(v, 10));
    if (!y || !m) return null;
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const next = new Date(y, m, 1);
    const nextMonthStart = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { monthStart, monthEnd, nextMonthStart, lastDay };
  }, [selectedMonth]);

  const load = async () => {
    if (!periodRange) return;
    setLoading(true);
    try {
      const list = await employeeAPI.listPayrollMonth(
        periodRange.monthStart,
        periodRange.monthEnd,
      );

      // Personel kartlarını (hire_date/termination_date) prorece için çek
      const partyList = await partyAPI.getAll({ cardType: 'employee' });
      const map = new Map<string, Party>();
      for (const p of partyList) map.set(p.id, p);
      setPartyMap(map);

      const computed: VarianceRow[] = list
        .filter((r) => (r.salary_base || 0) > 0)
        .map((r) => {
          // Prorate hesabı: salary_base × (çalışılan gün / ay günü)
          const party = map.get(r.employee_id);
          const dim = periodRange.lastDay;
          let workedDays = dim;
          if (party?.hire_date) {
            const hire = String(party.hire_date).slice(0, 10);
            if (hire > periodRange.monthStart && hire <= periodRange.monthEnd) {
              const hd = parseInt(hire.slice(8, 10), 10);
              workedDays = dim - hd + 1;
            }
            if (hire > periodRange.monthEnd) workedDays = 0;
          }
          if (party?.termination_date) {
            const term = String(party.termination_date).slice(0, 10);
            if (term < periodRange.monthStart) workedDays = 0;
            else if (term >= periodRange.monthStart && term <= periodRange.monthEnd) {
              const td = parseInt(term.slice(8, 10), 10);
              workedDays = td;
            }
          }
          const expectedAccrual = workedDays > 0
            ? Math.round((r.salary_base * workedDays) / dim)
            : 0;
          // paidOut = avans + maaş ödemesi (DB'den doğrudan).
          // Variance = paidOut − expectedAccrual.
          //  > 0 → işletme personele fazla ödedi (BONUS olarak işlenebilir)
          //  < 0 → işletme personele eksik ödedi (CEZA/PERAŞIN düzeltmesi)
          const paidOut = (r.total_advance || 0) + (r.total_paid || 0);
          const variance = paidOut - expectedAccrual;
          return {
            ...r,
            expectedAccrual,
            paidOut,
            variance,
            hasOnlyAdvance: (r.total_advance || 0) > 0 && (r.total_paid || 0) === 0,
          };
        });
      // Yalnızca farkı ±0.01'den büyük olanlar + tam doğru ödenenler
      computed.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
      setRows(computed);
    } catch (err: any) {
      toast.error(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [selectedMonth]);

  const totals = useMemo(() => {
    let overpaidCount = 0;
    let underpaidCount = 0;
    let overpaidTotal = 0;
    let underpaidTotal = 0;
    for (const r of rows) {
      if (Math.abs(r.variance) < 0.01) continue;
      if (r.variance > 0) {
        overpaidCount += 1;
        overpaidTotal += r.variance;
      } else {
        underpaidCount += 1;
        underpaidTotal += Math.abs(r.variance);
      }
    }
    return { overpaidCount, underpaidCount, overpaidTotal, underpaidTotal };
  }, [rows]);

  const handleApplyBonus = (row: VarianceRow) => {
    if (!onOpenAdjustment) {
      toast.error('Düzeltme modalı bağlı değil');
      return;
    }
    const emp = partyMap.get(row.employee_id);
    if (!emp) {
      toast.error('Personel kartı bulunamadı');
      return;
    }
    if (row.variance <= 0.01) {
      toast.error('Fazla ödeme yok; bonus uygulanamaz');
      return;
    }
    onOpenAdjustment(emp, {
      bonusAmount: Math.abs(row.variance),
      bonusDefinition: `Geçen ay fark analizi: fazla ödeme düzeltmesi (${periodRange?.monthStart?.slice(0, 7)})`,
      txnDate: periodRange?.monthEnd || new Date().toISOString().slice(0, 10),
      // Default olarak bu ay maaşını da içine al (kullanıcı değiştirebilir).
      // Sadece bonus istenirse modal açıldığında amount 0 yapılabilir.
      salaryAmount: Number(emp.salary_base || 0),
    });
    onClose();
  };

  const handleApplyPenalty = (row: VarianceRow) => {
    if (!onOpenAdjustment) {
      toast.error('Düzeltme modalı bağlı değil');
      return;
    }
    const emp = partyMap.get(row.employee_id);
    if (!emp) {
      toast.error('Personel kartı bulunamadı');
      return;
    }
    if (row.variance >= -0.01) {
      toast.error('Eksik ödeme yok; ceza uygulanamaz');
      return;
    }
    onOpenAdjustment(emp, {
      penaltyAmount: Math.abs(row.variance),
      penaltyDefinition: `Geçen ay fark analizi: eksik ödeme düzeltmesi (${periodRange?.monthStart?.slice(0, 7)})`,
      txnDate: periodRange?.monthEnd || new Date().toISOString().slice(0, 10),
      // Default olarak bu ay maaşını da içine al (kullanıcı değiştirebilir).
      salaryAmount: Number(emp.salary_base || 0),
    });
    onClose();
  };

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={t('party.variance.title') || 'Bordro Fark Analizi'}>
      <div className="flex flex-col min-h-0 h-full">
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-4 text-white shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{t('party.variance.title') || 'Bordro Fark Analizi'}</h2>
            <p className="text-amber-100 text-sm mt-0.5">
              {t('party.variance.subtitle') || 'Geçen ay fazla / eksik ödemeleri tespit edin'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="shrink-0 px-5 py-3 border-b border-slate-100 bg-white flex flex-wrap items-center gap-3">
          <div className="relative">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {t('party.variance.periodLabel') || 'Dönem'}
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="pl-10 pr-3 py-2 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-amber-500 focus:border-amber-400 outline-none text-sm font-medium"
              />
            </div>
          </div>
          <div className="flex-1 flex flex-wrap gap-3 items-end justify-end">
            <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-[10px] font-bold uppercase text-emerald-700">
                {t('party.variance.overpaidCount') || 'Fazla Ödeme'}
              </div>
              <div className="text-lg font-bold text-emerald-800">
                {totals.overpaidCount}
                <span className="ml-1 text-xs font-mono text-emerald-600">
                  ({formatMoney(totals.overpaidTotal)})
                </span>
              </div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200">
              <div className="text-[10px] font-bold uppercase text-rose-700">
                {t('party.variance.underpaidCount') || 'Eksik Ödeme'}
              </div>
              <div className="text-lg font-bold text-rose-800">
                {totals.underpaidCount}
                <span className="ml-1 text-xs font-mono text-rose-600">
                  ({formatMoney(totals.underpaidTotal)})
                </span>
              </div>
            </div>
          </div>
        </div>

        <PercentBodyModalScrollBody className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('common.loading') || 'Yükleniyor'}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <ArrowRightLeft className="w-10 h-10" />
              <p>{t('party.variance.empty') || 'Bu dönem için bordro verisi yok'}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-slate-100 text-slate-600 text-[11px] font-black uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">{t('party.table.name') || 'Personel'}</th>
                  <th className="text-right px-3 py-2">{t('party.variance.expectedAccrual') || 'Beklenen Hakkediş'}</th>
                  <th className="text-right px-3 py-2">{t('party.variance.paidOut') || 'Ödenen'}</th>
                  <th className="text-right px-3 py-2">{t('party.variance.variance') || 'Fark'}</th>
                  <th className="text-center px-3 py-2">{t('party.table.actions') || 'İşlem'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const overpaid = r.variance > 0.01;
                  const underpaid = r.variance < -0.01;
                  const neutral = !overpaid && !underpaid;
                  return (
                    <tr
                      key={r.employee_id}
                      className={`border-t border-slate-100 ${
                        overpaid ? 'bg-emerald-50/40' : underpaid ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{r.employee_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {formatMoney(r.salary_base)} / ay brüt
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">
                        {formatMoney(r.expectedAccrual)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">
                        {formatMoney(r.paidOut)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${
                        overpaid ? 'text-emerald-700' : underpaid ? 'text-rose-700' : 'text-slate-400'
                      }`}>
                        {neutral ? '—' : (
                          <span className="inline-flex items-center gap-1">
                            {overpaid ? '+' : '−'}{formatMoney(Math.abs(r.variance))}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {overpaid && onOpenAdjustment && (
                          <button
                            type="button"
                            onClick={() => handleApplyBonus(r)}
                            className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-violet-700 active:scale-[0.98] flex items-center gap-1.5 mx-auto"
                            title={t('party.variance.applyBonus') || 'Fazla ödemeyi bonus olarak kaydet'}
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            {t('party.variance.applyBonus') || 'Bonus Yap'}
                          </button>
                        )}
                        {underpaid && onOpenAdjustment && (
                          <button
                            type="button"
                            onClick={() => handleApplyPenalty(r)}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-rose-700 active:scale-[0.98] flex items-center gap-1.5 mx-auto"
                            title={t('party.variance.applyPenalty') || 'Eksik ödemeyi ceza olarak düzelt'}
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            {t('party.variance.applyPenalty') || 'Ceza Yap'}
                          </button>
                        )}
                        {neutral && (
                          <span className="text-[10px] font-bold uppercase text-slate-400">
                            {t('party.variance.neutral') || 'Tam'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </PercentBodyModalScrollBody>

        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <div className="text-[10px] text-slate-500 max-w-3xl">
            {t('party.variance.helpText') || 'Fark = (Avans + Maaş Ödeme) − (Brüt × Çalışılan Gün). Bonus = işletme personele ek ödüyor; Ceza = bordro düzeltmesi. Mevcut MAAS_ODEME / AVANS_ODEME satırları etkilenmez; yeni BONUS_HAKKEDIS veya CEZA_ODEME satırı eklenir.'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border-2 border-slate-200 text-slate-700 font-bold uppercase text-xs tracking-wider px-4 py-2 hover:bg-slate-100 active:scale-[0.98]"
          >
            {t('common.close') || 'Kapat'}
          </button>
        </div>
      </div>
    </PercentBodyModal>
  );
}

function formatMoney(n?: number | string | null): string {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(num);
}