/**
 * CashCard — Kasa kartı (tooltip/breakdown destekli)
 *
 * 50 yıllık muhasebeci gözüyle: Kasa bakiyesinin nereden geldiğini tek bakışta gösterir.
 * - Hover'da tooltip ile matematik özeti (açılış + giriş + çıkış + net)
 * - Negatif bakiye kırmızı uyarı
 * - En büyük 5 gider listesi
 * - Aylık breakdown (son 6 ay)
 */

import { useState } from 'react';
import { Wallet, AlertTriangle, TrendingUp, TrendingDown, Info, Calculator } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip';
import { formatMoneyWithCode } from '../../../utils/currency';
import type { Kasa } from '../../../services/api/kasa';
import type { CashBreakdown } from '../../../services/api/kasa';

interface Props {
  kasa: Kasa;
  breakdown: CashBreakdown | null | undefined;
  breakdownLoading: boolean | undefined;
  ledgerCurrency: string;
  tm: (k: string) => string;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function CashCard({
  kasa,
  breakdown,
  breakdownLoading,
  ledgerCurrency,
  tm,
  onClick,
  onContextMenu,
}: Props) {
  const [open, setOpen] = useState(false);
  const balance = kasa.bakiye || 0;
  const isNegative = balance < 0;
  const currency = kasa.id_doviz_kodu || ledgerCurrency;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            onContextMenu={onContextMenu}
            onMouseEnter={() => !breakdown && !breakdownLoading && setOpen(true)}
            className={`bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-all text-left flex flex-col items-start gap-4 group ${
              isNegative
                ? 'border-red-300 hover:border-red-400 bg-red-50/30'
                : 'border-gray-200 hover:border-purple-300'
            }`}
          >
            <div className="w-full flex items-start justify-between">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                  isNegative
                    ? 'bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white'
                    : 'bg-purple-50 group-hover:bg-purple-600 group-hover:text-white'
                }`}
              >
                <Wallet className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                {isNegative && (
                  <span title="Negatif bakiye">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </span>
                )}
                <div
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                    kasa.aktif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {kasa.aktif ? tm('active') : tm('passive')}
                </div>
              </div>
            </div>
            <div className="flex-1 w-full">
              <h3 className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors">
                {kasa.kasa_kodu}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{kasa.kasa_adi}</p>
            </div>
            <div className="w-full pt-4 border-t border-gray-50 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                  {tm('crmBalance')}
                </span>
                <p
                  className={`text-lg font-black leading-none mt-1 ${
                    isNegative ? 'text-red-600' : 'text-gray-900'
                  }`}
                >
                  {formatMoneyWithCode(balance, currency)}
                </p>
              </div>
              <Info className="w-4 h-4 text-gray-400 group-hover:text-purple-500 transition-colors" />
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          sideOffset={8}
          className="max-w-[420px] p-0 bg-gray-900 text-white border-gray-700 shadow-2xl"
        >
          <CashBreakdownTooltip breakdown={breakdown} breakdownLoading={!!breakdownLoading} currency={currency} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CashBreakdownTooltip({
  breakdown,
  breakdownLoading,
  currency,
}: {
  breakdown: CashBreakdown | null | undefined;
  breakdownLoading: boolean;
  currency: string;
}) {
  if (breakdownLoading) {
    return (
      <div className="p-4 text-xs text-gray-300 flex items-center gap-2">
        <Calculator className="w-3.5 h-3.5 animate-pulse" />
        Matematik hesaplanıyor…
      </div>
    );
  }

  if (!breakdown) {
    return (
      <div className="p-4 text-xs text-gray-400">
        Kasa özeti yüklenemedi. Kart tıklanınca detaylar açılacak.
      </div>
    );
  }

  const { currentBalance, openingBalance, totalIn, totalOut, transactionCount, monthlyBreakdown, topExpenses, warnings } =
    breakdown;

  // Matematiksel formül doğrulama
  const calculatedBalance = openingBalance + totalIn - totalOut;
  const balanceMatch = Math.abs(calculatedBalance - currentBalance) < 0.01;
  const isNeg = currentBalance < 0;

  return (
    <div className="text-xs">
      {/* Header */}
      <div className={`px-4 py-3 border-b border-gray-700 ${isNeg ? 'bg-red-900/40' : 'bg-gray-800'}`}>
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="w-3.5 h-3.5 text-purple-400" />
          <span className="font-bold text-sm">{breakdown.registerCode}</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-300 truncate">{breakdown.registerName}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">
            Mevcut Bakiye
          </span>
          <span
            className={`font-black text-base ${
              isNeg ? 'text-red-300' : 'text-emerald-300'
            }`}
          >
            {formatMoneyWithCode(currentBalance, currency)}
          </span>
        </div>
      </div>

      {/* Matematik formül */}
      <div className="px-4 py-3 bg-gray-850 border-b border-gray-700 font-mono text-[11px] leading-relaxed">
        <div className="text-gray-400 mb-1 font-sans font-bold uppercase tracking-wider text-[9px]">
          Matematik
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-300">Açılış (devir)</span>
          <span className="text-blue-300">
            {openingBalance >= 0 ? '+' : ''}
            {formatMoneyWithCode(openingBalance, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-300">Toplam Giriş</span>
          <span className="text-emerald-300">
            +{formatMoneyWithCode(totalIn, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-300">Toplam Çıkış</span>
          <span className="text-red-300">−{formatMoneyWithCode(totalOut, currency)}</span>
        </div>
        <div className="border-t border-gray-700 my-1.5" />
        <div className="flex items-center justify-between font-bold">
          <span className="text-gray-200">Hesaplanan</span>
          <span className={balanceMatch ? 'text-emerald-300' : 'text-yellow-300'}>
            {balanceMatch ? '✓ ' : '⚠ '}
            {formatMoneyWithCode(calculatedBalance, currency)}
          </span>
        </div>
        {!balanceMatch && (
          <div className="text-yellow-400 text-[10px] mt-1 font-sans">
            DB bakiyesi ile uyuşmuyor!
          </div>
        )}
        <div className="text-gray-500 text-[10px] mt-1 font-sans">
          {transactionCount} işlem üzerinden
        </div>
      </div>

      {/* Uyarılar */}
      {warnings.length > 0 && (
        <div className="px-4 py-2 bg-yellow-900/30 border-b border-gray-700 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="text-[11px] text-yellow-200 leading-snug">
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Aylık breakdown */}
      {monthlyBreakdown.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-700">
          <div className="text-[9px] uppercase text-gray-400 font-bold tracking-wider mb-1.5">
            Son 6 Ay
          </div>
          <div className="space-y-1">
            {monthlyBreakdown.slice(0, 6).map((m) => (
              <div key={m.month} className="flex items-center justify-between text-[11px]">
                <span className="text-gray-300 font-mono w-14">{m.month}</span>
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="text-emerald-400 text-[10px]">
                    <TrendingUp className="w-3 h-3 inline" />
                    {(m.inAmount / 1000).toFixed(0)}k
                  </span>
                  <span className="text-red-400 text-[10px]">
                    <TrendingDown className="w-3 h-3 inline" />
                    {(m.outAmount / 1000).toFixed(0)}k
                  </span>
                </div>
                <span
                  className={`font-mono font-bold w-20 text-right ${
                    m.net < 0 ? 'text-red-300' : 'text-emerald-300'
                  }`}
                >
                  {m.net >= 0 ? '+' : ''}
                  {(m.net / 1000).toFixed(0)}k
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* En büyük giderler */}
      {topExpenses.length > 0 && (
        <div className="px-4 py-2">
          <div className="text-[9px] uppercase text-gray-400 font-bold tracking-wider mb-1.5">
            En Büyük 5 Gider
          </div>
          <div className="space-y-1">
            {topExpenses.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] gap-2">
                <span className="text-gray-400 font-mono w-16 shrink-0">{e.date}</span>
                <span className="text-gray-200 truncate flex-1" title={e.definition}>
                  {e.definition || e.transactionType}
                </span>
                <span className="text-red-300 font-mono font-bold shrink-0">
                  −{(e.amount / 1000).toFixed(0)}k
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
