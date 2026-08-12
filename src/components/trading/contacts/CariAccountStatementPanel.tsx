import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '../../../utils/formatNumber';
import { supplierAPI, type Supplier } from '../../../services/api/suppliers';
import { getAppDefaultCurrency } from '../../../services/postgres';
import {
  exchangeRateAPI,
  convertAmountMainToReporting,
  type ExchangeRate,
} from '../../../services/api/masterData';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { FullscreenBodyPortal, MODAL_OVERLAY_Z } from '../../shared/FullscreenBodyPortal';
import {
  buildEkstreRows,
  defaultEkstreDateRange,
  ficheTypeToInfo,
  getCariBalanceDirection,
  preferIntegerAmountDisplay,
  type EkstreRow,
} from '../../../utils/cariAccountStatement';

export interface CariAccountStatementPanelProps {
  account: Supplier;
  onClose: () => void;
}

export function CariAccountStatementPanel({ account, onClose }: CariAccountStatementPanelProps) {
  const { tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const defaultEkstre = useMemo(() => defaultEkstreDateRange(), []);

  const mainCurrency = useMemo(
    () => String(selectedFirm?.ana_para_birimi || getAppDefaultCurrency()).trim().toUpperCase().slice(0, 10) || 'IQD',
    [selectedFirm?.ana_para_birimi],
  );
  const reportingCurrency = useMemo(() => {
    const r = String(selectedFirm?.raporlama_para_birimi || mainCurrency).trim().toUpperCase().slice(0, 10);
    return r || mainCurrency;
  }, [selectedFirm?.raporlama_para_birimi, mainCurrency]);

  const [latestRates, setLatestRates] = useState<ExchangeRate[]>([]);
  const [showReportingPrimary, setShowReportingPrimary] = useState(false);
  const [ekstresiData, setEkstresiData] = useState<Array<Record<string, unknown>>>([]);
  const [ekstresiLoading, setEkstresiLoading] = useState(false);
  const [ekstresiStart, setEkstresiStart] = useState(defaultEkstre.start);
  const [ekstresiEnd, setEkstresiEnd] = useState(defaultEkstre.end);

  const mainDec = preferIntegerAmountDisplay(mainCurrency) ? 0 : 2;
  const mainShowDec = !preferIntegerAmountDisplay(mainCurrency);
  const repDec = preferIntegerAmountDisplay(reportingCurrency) ? 0 : 2;
  const repShowDec = !preferIntegerAmountDisplay(reportingCurrency);

  const toReporting = (amountMain: number) =>
    convertAmountMainToReporting(amountMain, mainCurrency, reportingCurrency, latestRates);

  const fmtEkstreAmount = (amountMain: number) => {
    const rep = reportingCurrency !== mainCurrency ? toReporting(amountMain) : null;
    if (rep == null || reportingCurrency === mainCurrency) {
      return {
        primary: formatNumber(amountMain, mainDec, mainShowDec),
        code: mainCurrency,
        secondary: null as string | null,
      };
    }
    if (showReportingPrimary) {
      return {
        primary: formatNumber(rep, repDec, repShowDec),
        code: reportingCurrency,
        secondary: `${formatNumber(amountMain, mainDec, mainShowDec)} ${mainCurrency}`,
      };
    }
    return {
      primary: formatNumber(amountMain, mainDec, mainShowDec),
      code: mainCurrency,
      secondary: `${formatNumber(rep, repDec, repShowDec)} ${reportingCurrency}`,
    };
  };

  const loadEkstresi = async (start: string, end: string) => {
    setEkstresiLoading(true);
    try {
      setEkstresiData(
        await supplierAPI.getAccountStatement(
          account.id,
          start,
          end,
          account.name,
          account.cardType,
        ),
      );
    } catch (e: unknown) {
      setEkstresiData([]);
      toast.error(e instanceof Error ? e.message : tm('accountStatementEmptyHint'));
    } finally {
      setEkstresiLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        setLatestRates(await exchangeRateAPI.getLatestRates());
      } catch {
        /* ignore */
      }
    })();
  }, [selectedFirm?.logicalref, mainCurrency, reportingCurrency]);

  useEffect(() => {
    void loadEkstresi(ekstresiStart, ekstresiEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- account değişince yeniden yükle
  }, [account.id]);

  const ekstresiRows = useMemo(
    () => buildEkstreRows(ekstresiData, account.cardType),
    [ekstresiData, account.cardType],
  );

  const totalBorc = ekstresiRows.reduce((s, r) => s + r.borcAmount, 0);
  const totalAlacak = ekstresiRows.reduce((s, r) => s + r.alacakAmount, 0);
  const isSupplierAccount = account.cardType === 'supplier';
  const netBalance = isSupplierAccount ? totalAlacak - totalBorc : totalBorc - totalAlacak;
  const netBalanceDir = getCariBalanceDirection(account.cardType, netBalance, tm);

  const fmtEkstreSignedNet = () => {
    if (reportingCurrency === mainCurrency) {
      return {
        primary: formatNumber(Math.abs(netBalance), mainDec, mainShowDec),
        code: mainCurrency,
        secondary: null as string | null,
      };
    }
    const rep = toReporting(netBalance);
    if (rep == null) {
      return {
        primary: formatNumber(Math.abs(netBalance), mainDec, mainShowDec),
        code: mainCurrency,
        secondary: null as string | null,
      };
    }
    if (showReportingPrimary) {
      return {
        primary: formatNumber(Math.abs(rep), repDec, repShowDec),
        code: reportingCurrency,
        secondary: `${formatNumber(Math.abs(netBalance), mainDec, mainShowDec)} ${mainCurrency}`,
      };
    }
    return {
      primary: formatNumber(Math.abs(netBalance), mainDec, mainShowDec),
      code: mainCurrency,
      secondary: `${formatNumber(Math.abs(rep), repDec, repShowDec)} ${reportingCurrency}`,
    };
  };

  const openInvoiceFromStatement = (row: EkstreRow) => {
    const ficheNo = String(row?.fiche_no || '').trim();
    if (!ficheNo) return;
    const type = String(row?.fiche_type || '').toLowerCase();
    const purchase = type.includes('purchase');
    window.dispatchEvent(new CustomEvent('navigateToScreen', {
      detail: {
        screen: purchase ? 'purchaseinvoice' : 'salesinvoice',
        invoiceSearch: ficheNo,
      },
    }));
  };

  const borcHdr = fmtEkstreAmount(totalBorc);
  const alacHdr = fmtEkstreAmount(totalAlacak);
  const netHdr = fmtEkstreSignedNet();

  const currentBalanceHdr = fmtEkstreAmount(Math.abs(
    ekstresiData.length > 0 ? netBalance : (account.balance || 0),
  ));
  const currentBalanceDir = getCariBalanceDirection(
    account.cardType,
    ekstresiData.length > 0 ? netBalance : (account.balance || 0),
    tm,
  );

  return (
    <FullscreenBodyPortal
      className="flex flex-col bg-white"
      zIndex={MODAL_OVERLAY_Z}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cari-ekstre-title"
    >
      <div className="flex-shrink-0 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-gray-50 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2" id="cari-ekstre-title">
            <FileText className="h-5 w-5 shrink-0 text-indigo-600" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{tm('accountStatement')}</p>
              <p className="truncate text-base font-bold text-gray-900">{account.name}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${account.cardType === 'customer' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
              {account.cardType === 'customer' ? tm('customer') : tm('supplierLabel')}
            </span>
            <span
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-black ${
                currentBalanceDir.side === 'B'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : currentBalanceDir.side === 'A'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}
              title={currentBalanceDir.hint}
            >
              {tm('custColBalance')}: {currentBalanceHdr.primary} {currentBalanceHdr.code}
              {currentBalanceDir.sideLabel ? ` · ${currentBalanceDir.sideLabel}` : ''}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={ekstresiStart}
              onChange={e => setEkstresiStart(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">—</span>
            <input
              type="date"
              value={ekstresiEnd}
              onChange={e => setEkstresiEnd(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => void loadEkstresi(ekstresiStart, ekstresiEnd)}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
            >
              {tm('bring')}
            </button>
            <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
              <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-black text-red-600">B: {borcHdr.primary} {borcHdr.code}</span>
              <span className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-black text-orange-600">A: {alacHdr.primary} {alacHdr.code}</span>
              <span
                className={`rounded border px-2 py-0.5 text-xs font-black ${
                  netBalanceDir.side === 'B' ? 'border-red-200 bg-red-50 text-red-700' : netBalanceDir.side === 'A' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-gray-200 bg-gray-50 text-gray-500'
                }`}
                title={netBalanceDir.hint}
              >
                {tm('netAmount')}: {netHdr.primary} {netHdr.code}{netBalanceDir.sideLabel ? ` · ${netBalanceDir.sideLabel}` : ''}
              </span>
            </div>
            {reportingCurrency !== mainCurrency ? (
              <button
                type="button"
                onClick={() => setShowReportingPrimary(v => !v)}
                className={`rounded px-2 py-1.5 text-[10px] font-black uppercase transition-all ${showReportingPrimary ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}
              >
                {showReportingPrimary ? reportingCurrency : mainCurrency}
              </button>
            ) : null}
            <button type="button" onClick={() => window.print()} className="rounded-lg border border-transparent p-2 hover:border-gray-300 hover:bg-gray-200" title={tm('print')}>
              <Printer className="h-4 w-4 text-gray-600" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-gray-800"
              title={tm('close')}
            >
              <X className="h-4 w-4" />
              {tm('close')}
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {ekstresiLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center gap-2 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">{tm('loading')}</span>
          </div>
        ) : ekstresiRows.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center text-gray-500">
            <FileText className="h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium">{tm('noRecordFound')}</p>
            <p className="max-w-md text-xs text-gray-400">{tm('accountStatementEmptyHint')}</p>
            <button
              type="button"
              onClick={() => void loadEkstresi(ekstresiStart, ekstresiEnd)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
              {tm('bring')}
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] border-b border-gray-200 bg-gray-100">
              <tr>
                {[tm('dateLabel'), tm('ficheNo'), tm('type'), tm('description'), tm('debtor'), tm('creditor'), tm('balance')].map(h => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-600 ${
                      [tm('debtor'), tm('creditor'), tm('balance')].includes(h) ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ekstresiRows.map((row, idx) => {
                const { label, color } = ficheTypeToInfo(String(row.fiche_type ?? ''), Number(row.trcode), row.is_cancelled === true);
                const borcD = row.borcAmount > 0 ? fmtEkstreAmount(row.borcAmount) : null;
                const alacD = row.alacakAmount > 0 ? fmtEkstreAmount(row.alacakAmount) : null;
                const balD = row.balance !== 0 ? fmtEkstreAmount(Math.abs(row.balance)) : null;
                const rowBalDir = getCariBalanceDirection(account.cardType, row.balance, tm);
                return (
                  <tr key={idx} className={`border-b border-gray-100 hover:bg-blue-50/40 ${idx % 2 ? 'bg-gray-50/50' : ''}`}>
                    <td className="px-4 py-2 font-mono text-gray-600">{row.date ? String(row.date).split('T')[0] : '-'}</td>
                    <td className="px-4 py-2">
                      {row.fiche_no ? (
                        <button
                          type="button"
                          onClick={() => openInvoiceFromStatement(row)}
                          className="font-mono font-bold text-blue-600 underline underline-offset-2 hover:text-blue-800"
                        >
                          {row.fiche_no}
                        </button>
                      ) : (
                        <span className="font-mono text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${color}`}>{label}</span>
                    </td>
                    <td className="max-w-md break-words px-4 py-2 align-top text-gray-700">{row.notes || ''}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-bold text-red-600">
                      {borcD ? (
                        <div className="flex flex-col items-end">
                          <span>{borcD.primary} {borcD.code}</span>
                          {borcD.secondary ? <span className="text-[10px] font-normal opacity-50">{borcD.secondary}</span> : null}
                        </div>
                      ) : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-bold text-green-600">
                      {alacD ? (
                        <div className="flex flex-col items-end">
                          <span>{alacD.primary} {alacD.code}</span>
                          {alacD.secondary ? <span className="text-[10px] font-normal opacity-50">{alacD.secondary}</span> : null}
                        </div>
                      ) : ''}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right font-black ${row.balance > 0 ? 'text-red-600' : row.balance < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      <div className="flex flex-col items-end">
                        {balD ? (
                          <>
                            <span>
                              {balD.primary} {balD.code}
                              {rowBalDir.sideLabel ? (
                                <span className="ml-1 whitespace-nowrap text-[9px] font-black" title={rowBalDir.hint}>{rowBalDir.sideLabel}</span>
                              ) : null}
                            </span>
                            {balD.secondary ? <span className="text-[10px] font-normal opacity-50">{balD.secondary}</span> : null}
                          </>
                        ) : (
                          <span className="text-gray-400">{formatNumber(0, mainDec, mainShowDec)} {mainCurrency}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </FullscreenBodyPortal>
  );
}
