/**
 * PartnerBalanceGuideModal — şirket ortağı bakiyesini sade dille anlatır.
 * Muhasebe jargonu yok; “salağa anlatır gibi” adım adım özet.
 */

import React, { useMemo } from 'react';
import { HelpCircle, X, TrendingUp, TrendingDown, Calculator, Wallet, PieChart } from 'lucide-react';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import type { Party } from '../../../core/types/models';
import { useNestedT } from './useNestedT';

interface Props {
  partners: Party[];
  onClose: () => void;
}

function fmtMoney(v: number): string {
  const abs = Math.abs(v).toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  if (v < 0) return `−${abs}`;
  if (v > 0) return `+${abs}`;
  return abs;
}

export function PartnerBalanceGuideModal({ partners, onClose }: Props) {
  const t = useNestedT();

  const active = useMemo(
    () => partners.filter((p) => p.card_type === 'partner' && p.is_active !== false),
    [partners],
  );

  const dip = useMemo(
    () => active.reduce((s, p) => s + (Number(p.balance) || 0), 0),
    [active],
  );

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={t('party.partnerGuide.title')}>
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5 text-white shrink-0 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight">{t('party.partnerGuide.title')}</h2>
            <p className="text-purple-100 text-sm mt-1">{t('party.partnerGuide.subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-white/15 transition shrink-0"
          aria-label={t('common.close', 'Kapat')}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <PercentBodyModalScrollBody className="p-6 space-y-5 bg-slate-50/60">
        {/* 1 — Tek cümle */}
        <section className="rounded-2xl border border-purple-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-purple-600 mb-2">
            {t('party.partnerGuide.step1Badge')}
          </p>
          <p className="text-base font-semibold text-slate-800 leading-relaxed">
            {t('party.partnerGuide.step1Body')}
          </p>
        </section>

        {/* 2 — Formül */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              {t('party.partnerGuide.step2Title')}
            </h3>
          </div>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            {t('party.partnerGuide.step2Intro')}
          </p>
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-4 text-center">
            <p className="text-sm sm:text-base font-bold text-indigo-900 tracking-wide">
              {t('party.partnerGuide.formula')}
            </p>
          </div>
          <p className="text-sm text-slate-600 mt-3 leading-relaxed">
            {t('party.partnerGuide.step2Expenses')}
          </p>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            {t('party.partnerGuide.step2Share')}
          </p>
        </section>

        {/* 3 — Artı / eksi */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-emerald-700" />
              <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider">
                {t('party.partnerGuide.positiveTitle')}
              </h3>
            </div>
            <p className="text-sm text-emerald-900/90 leading-relaxed">
              {t('party.partnerGuide.positiveBody')}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-5 h-5 text-amber-700" />
              <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wider">
                {t('party.partnerGuide.negativeTitle')}
              </h3>
            </div>
            <p className="text-sm text-amber-900/90 leading-relaxed">
              {t('party.partnerGuide.negativeBody')}
            </p>
          </div>
        </section>

        {/* 4 — Neler girer */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-5 h-5 text-slate-700" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              {t('party.partnerGuide.step4Title')}
            </h3>
          </div>
          <ul className="space-y-2.5 text-sm text-slate-700">
            {(
              [
                'party.partnerGuide.itemNetShare',
                'party.partnerGuide.itemProfitDist',
                'party.partnerGuide.itemCapitalIn',
                'party.partnerGuide.itemCapitalOut',
                'party.partnerGuide.itemSupplierPay',
              ] as const
            ).map((key) => (
              <li key={key} className="flex gap-2 leading-relaxed">
                <span className="text-purple-500 font-bold shrink-0">•</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
            {t('party.partnerGuide.notCustomerDebt')}
          </p>
        </section>

        {/* 5 — Bu firmadaki ortaklar */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <PieChart className="w-5 h-5 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              {t('party.partnerGuide.liveTitle')}
            </h3>
          </div>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            {t('party.partnerGuide.liveIntro')}
          </p>
          {active.length === 0 ? (
            <p className="text-sm text-slate-400">{t('party.partnerGuide.liveEmpty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2.5">{t('party.table.name')}</th>
                    <th className="text-right px-3 py-2.5">{t('party.table.share')}</th>
                    <th className="text-right px-3 py-2.5">{t('party.table.balance')}</th>
                    <th className="text-left px-3 py-2.5">{t('party.partnerGuide.meaningCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((p) => {
                    const bal = Number(p.balance) || 0;
                    const meaning =
                      bal > 0
                        ? t('party.partner.balanceLabel')
                        : bal < 0
                          ? t('party.partner.balanceLabelNegative')
                          : t('party.partnerGuide.zeroMeaning');
                    return (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-3 py-2.5 font-medium text-slate-800">{p.name}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">
                          {Number(p.share_pct || 0).toFixed(2)}%
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                            bal < 0 ? 'text-red-600' : bal > 0 ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {fmtMoney(bal)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 text-xs font-semibold uppercase">
                          {meaning}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="px-3 py-2.5 font-bold text-slate-800" colSpan={2}>
                      {t('party.partnerGuide.dipLabel').replace('{n}', String(active.length))}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-bold tabular-nums ${
                        dip < 0 ? 'text-red-600' : dip > 0 ? 'text-emerald-700' : 'text-slate-600'
                      }`}
                    >
                      {fmtMoney(dip)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {t('party.partnerGuide.dipHint')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/* 6 — Ne yapmalıyım */}
        <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
          <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wider mb-2">
            {t('party.partnerGuide.whatNextTitle')}
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-blue-950/90 leading-relaxed">
            <li>{t('party.partnerGuide.whatNext1')}</li>
            <li>{t('party.partnerGuide.whatNext2')}</li>
            <li>{t('party.partnerGuide.whatNext3')}</li>
          </ol>
        </section>
      </PercentBodyModalScrollBody>

      <div className="p-4 border-t border-slate-100 bg-white flex justify-end shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 rounded-2xl bg-purple-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-purple-700 active:scale-[0.98]"
        >
          {t('party.partnerGuide.gotIt')}
        </button>
      </div>
    </PercentBodyModal>
  );
}
