/**
 * PartnerDetailReportModal — Şirket ortakları detaylı muhasebe raporu
 *
 * Veri kaynağı:
 *   - partnerAPI.getLedger(id) → rex_{firm}_{period}_party_ledger_movements
 *   - partnerAPI.getById(id)  → rex_{firm}_parties (mevcut bakiye)
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../shared/PercentBodyModal';
import { Loader2, AlertCircle, CheckCircle2, Calculator, TrendingUp, TrendingDown, Wallet, Info } from 'lucide-react';
import { partnerAPI } from '../../services/api/partiesPartners';
import type { PartyLedgerMovement, PartyPartner } from '../../core/types/models';
import { useLanguage } from '../../contexts/LanguageContext';

interface Props {
  partner: PartyPartner;
  periodStart: string;
  periodEnd: string;
  currency: string;
  onClose: () => void;
}

const TX_META: Record<string, { labelKey: string; sign: number; group: 'profit' | 'capital' | 'expense' | 'other' }> = {
  KAR_DAGITIMI: { labelKey: 'partnerTxKarDagitimi', sign: 1, group: 'profit' },
  ZARAR_DAGITIMI: { labelKey: 'partnerTxZararDagitimi', sign: -1, group: 'profit' },
  SERMAYE_TAHSILAT: { labelKey: 'partnerTxSermayeTahsilat', sign: 1, group: 'capital' },
  ORTAK_SERMAYE_TAHSILAT: { labelKey: 'partnerTxOrtakSermayeTahsilat', sign: 1, group: 'capital' },
  ORTAK_SERMAYE_ODEME: { labelKey: 'partnerTxOrtakSermayeOdeme', sign: -1, group: 'capital' },
  ORTAK_PARA_GIRIS: { labelKey: 'partnerTxOrtakParaGiris', sign: 1, group: 'capital' },
  ORTAK_PARA_CIKIS: { labelKey: 'partnerTxOrtakParaCikis', sign: -1, group: 'capital' },
  ORTAK_SERMAYE_CIKIS: { labelKey: 'partnerTxOrtakSermayeCikis', sign: -1, group: 'capital' },
  CH_ODEME_PARTNER: { labelKey: 'partnerTxChOdemePartner', sign: -1, group: 'expense' },
  CANCELLED_CH_ODEME_PARTNER: { labelKey: 'partnerTxCancelledCh', sign: 1, group: 'expense' },
  CANCELLED_ORTAK_SERMAYE_TAHSILAT: { labelKey: 'partnerTxCancelledSermaye', sign: -1, group: 'capital' },
};

function fmt(v: number, currency: string, locale: string): string {
  const abs = Math.abs(v).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sign = v < 0 ? '−' : v > 0 ? '+' : '';
  return `${sign}${abs} ${currency}`;
}

function fmtDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

export function PartnerDetailReportModal({
  partner,
  periodStart,
  periodEnd,
  currency,
  onClose,
}: Props) {
  const { tm, language } = useLanguage();
  const locale = language === 'en' ? 'en-US' : language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-IQ' : 'tr-TR';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<PartyLedgerMovement[]>([]);

  const txLabel = (type: string) => {
    const meta = TX_META[type];
    return meta ? tm(meta.labelKey) : type;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await partnerAPI.getLedger(partner.id, {
          startDate: periodStart,
          endDate: periodEnd,
          limit: 2000,
        });
        if (active) setLedger(rows || []);
      } catch (e: any) {
        if (active) setError(e?.message || tm('partnerRptLoadFail'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [partner.id, periodStart, periodEnd, tm]);

  const computed = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let cumulative = 0;
    const withRunning: Array<PartyLedgerMovement & { running: number }> = [];
    for (const r of ledger) {
      const signed = Number(r.amount) * Number(r.sign);
      if (signed > 0) totalIn += signed;
      else if (signed < 0) totalOut += Math.abs(signed);
      cumulative += signed;
      withRunning.push({ ...r, running: cumulative });
    }
    const dbBalance = Number(partner.balance || 0);
    const matches = Math.abs(cumulative - dbBalance) < 0.01;

    const byType: Record<string, { count: number; signedTotal: number }> = {};
    for (const r of ledger) {
      const key = r.transaction_type || 'UNKNOWN';
      const signed = Number(r.amount) * Number(r.sign);
      if (!byType[key]) byType[key] = { count: 0, signedTotal: 0 };
      byType[key].count += 1;
      byType[key].signedTotal += signed;
    }

    return {
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      cumulative,
      dbBalance,
      matches,
      byType,
      withRunning,
    };
  }, [ledger, partner.balance]);

  const dbBalanceNum = Number(partner.balance || 0);
  const isNegative = dbBalanceNum < 0;

  return (
    <PercentBodyModal
      onClose={onClose}
      size="wide"
      ariaLabel={tm('partnerRptAria').replace('{name}', partner.name)}
    >
      <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 px-6 py-4 border-b border-slate-200 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-800">
                {tm('partnerRptTitle')}
              </h2>
              <span className="text-xs font-mono text-slate-500">·</span>
              <span className="text-sm font-mono text-slate-600">{partner.code}</span>
            </div>
            <p className="text-base font-semibold text-indigo-700">{partner.name}</p>
            <p className="text-xs text-slate-500 mt-1">
              {tm('partnerRptShare')}: <span className="font-semibold">%{Number(partner.share_pct || 0).toFixed(2)}</span>
              {partner.partner_role ? (
                <>
                  {' · '}{tm('roleLabel')}:{' '}
                  <span className="font-semibold">
                    {partner.partner_role === 'major'
                      ? tm('partnerRptMajor')
                      : partner.partner_role === 'minor'
                        ? tm('partnerRptMinor')
                        : partner.partner_role}
                  </span>
                </>
              ) : null}
              {partner.partner_since ? (
                <>
                  {' · '}{tm('partnerRptPartnerSince')}:{' '}
                  <span className="font-semibold">{fmtDate(partner.partner_since, locale)}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">{tm('currentBalance')}</p>
            <p className={`text-3xl font-black ${isNegative ? 'text-red-600' : 'text-emerald-600'}`}>
              {fmt(dbBalanceNum, currency, locale)}
            </p>
            {computed.matches ? (
              <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1 justify-end">
                <CheckCircle2 className="w-3 h-3" /> {tm('partnerRptLedgerOk')}
              </p>
            ) : (
              <p className="text-[11px] text-red-700 font-semibold mt-1 flex items-center gap-1 justify-end">
                <AlertCircle className="w-3 h-3" />{' '}
                {tm('partnerRptDiff').replace('{v}', fmt(computed.cumulative - dbBalanceNum, currency, locale))}
              </p>
            )}
          </div>
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> {tm('partnerRptLoading')}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <AlertCircle className="w-5 h-5 inline mr-2" />
            {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard
                title={tm('totalIn')}
                value={fmt(computed.totalIn, currency, locale)}
                color="emerald"
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <SummaryCard
                title={tm('totalOut')}
                value={fmt(-computed.totalOut, currency, locale)}
                color="red"
                icon={<TrendingDown className="w-4 h-4" />}
              />
              <SummaryCard
                title={tm('partnerRptNet')}
                value={fmt(computed.net, currency, locale)}
                color={computed.net >= 0 ? 'emerald' : 'red'}
                icon={<Calculator className="w-4 h-4" />}
              />
              <SummaryCard
                title={tm('partnerRptTxnCountTitle')}
                value={tm('partnerRptTxnCount').replace('{n}', String(ledger.length))}
                color="slate"
              />
            </div>

            {Object.keys(computed.byType).length > 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-slate-500" />
                  {tm('partnerRptTypeBreakdown')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {Object.entries(computed.byType)
                    .sort((a, b) => Math.abs(b[1].signedTotal) - Math.abs(a[1].signedTotal))
                    .map(([type, info]) => (
                      <div
                        key={type}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border ${
                          info.signedTotal >= 0
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-red-50 border-red-200'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{txLabel(type)}</p>
                          <p className="text-[10px] font-mono text-slate-500">{type}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-sm font-bold ${
                              info.signedTotal >= 0 ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {fmt(info.signedTotal, currency, locale)}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {tm('partnerRptTxnCount').replace('{n}', String(info.count))}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}

            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-2">
                {tm('partnerRptDetail').replace('{n}', String(computed.withRunning.length))}
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">{tm('date')}</th>
                      <th className="px-3 py-2 text-left font-bold">{tm('transactionType')}</th>
                      <th className="px-3 py-2 text-left font-bold">{tm('description')}</th>
                      <th className="px-3 py-2 text-left font-bold">{tm('ficheNo')}</th>
                      <th className="px-3 py-2 text-right font-bold">{tm('amount')}</th>
                      <th className="px-3 py-2 text-center font-bold">{tm('partnerRptSign')}</th>
                      <th className="px-3 py-2 text-right font-bold">{tm('partnerRptCumulative')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {computed.withRunning.map((r, idx) => {
                      const signed = Number(r.amount) * Number(r.sign);
                      return (
                        <tr key={r.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                          <td className="px-3 py-2 font-mono text-slate-600">{fmtDate(r.date, locale)}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                signed > 0
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : signed < 0
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {txLabel(r.transaction_type)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-700 max-w-[280px] truncate" title={r.definition || ''}>
                            {r.definition || '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                            {r.fiche_no || '—'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-bold ${signed > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {fmt(signed, currency, locale)}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-slate-600">
                            {r.sign > 0 ? '+' : r.sign < 0 ? '−' : '0'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-semibold ${r.running < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                            {fmt(r.running, currency, locale)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-right text-slate-700 uppercase tracking-wider text-[10px]">
                        {tm('totalUppercase')}
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        <span className="text-emerald-700 block">+{fmt(computed.totalIn, currency, locale).replace('+', '')}</span>
                        <span className="text-red-700 block">−{fmt(computed.totalOut, currency, locale).replace('+', '').replace('−', '')}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-[10px] text-slate-600">net</td>
                      <td className={`px-3 py-3 text-right font-mono text-sm ${computed.cumulative < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {fmt(computed.cumulative, currency, locale)}
                      </td>
                    </tr>
                    <tr className="bg-amber-50 border-t border-amber-200">
                      <td colSpan={4} className="px-3 py-2 text-right text-amber-900 font-bold text-[11px]">
                        {tm('partnerRptRecon')}
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-center text-[11px]">
                        <span className="text-slate-600">{tm('partnerRptLedgerNet')}:</span>{' '}
                        <span className="font-mono font-bold">{fmt(computed.cumulative, currency, locale)}</span>
                      </td>
                      <td className={`px-3 py-2 text-right text-[11px] ${computed.matches ? 'text-emerald-700' : 'text-red-700'}`}>
                        {computed.matches ? (
                          <span className="flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3 h-3" /> {tm('partnerRptDbEqual')}
                          </span>
                        ) : (
                          <span className="flex items-center justify-end gap-1">
                            <AlertCircle className="w-3 h-3" />{' '}
                            {tm('partnerRptDiff').replace('{v}', fmt(computed.cumulative - dbBalanceNum, currency, locale))}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
              <h3 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
                <Info className="w-4 h-4" />
                {tm('partnerRptLogicTitle')}
              </h3>
              <div className="text-xs text-blue-900 space-y-2 leading-relaxed">
                <p>{tm('partnerRptLogicBalance')}</p>
                <p>{tm('partnerRptLogicSign')}</p>
                <p>{tm('partnerRptLogicSource')}</p>
                <p>{tm('partnerRptLogicProfit')}</p>
                <p>{tm('partnerRptLogicCh')}</p>
                <p>{tm('partnerRptLogicCancel')}</p>
              </div>
            </div>
          </>
        )}
      </PercentBodyModalScrollBody>
    </PercentBodyModal>
  );
}

function SummaryCard({
  title,
  value,
  color,
  icon,
}: {
  title: string;
  value: string;
  color: 'emerald' | 'red' | 'slate' | 'blue';
  icon?: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
  };
  return (
    <div className={`border rounded-lg p-3 ${colorMap[color]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">{title}</p>
      </div>
      <p className="text-base font-black font-mono">{value}</p>
    </div>
  );
}
