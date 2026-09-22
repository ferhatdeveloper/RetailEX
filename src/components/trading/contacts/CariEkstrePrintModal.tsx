import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import type { Language } from '../../../locales/module-translations';
import type { Supplier } from '../../../services/api/suppliers';
import { getReceiptSettings } from '../../../services/receiptSettingsService';
import type { EkstreRow, ExtCardType } from '../../../utils/cariAccountStatement';
import {
  buildCariEkstrePrintHtml,
  buildCariEkstrePrintLabels,
  companyHeaderFromReceiptSettings,
  formatCariAccountAddress,
  type CariEkstrePrintOrientation,
} from '../../../utils/cariEkstrePrint';
import { printHtmlInMainDocument } from '../../../utils/reportHtmlPrint';

export type CariEkstrePrintModalProps = {
  account: Supplier;
  rows: EkstreRow[];
  dateFrom: string;
  dateTo: string;
  currency: string;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  onClose: () => void;
};

const LANG_OPTIONS: Array<{ code: Language; labelKey: string }> = [
  { code: 'tr', labelKey: 'cariEkstrePrintLangTr' },
  { code: 'en', labelKey: 'cariEkstrePrintLangEn' },
  { code: 'ar', labelKey: 'cariEkstrePrintLangAr' },
  { code: 'ku', labelKey: 'cariEkstrePrintLangKu' },
];

export function CariEkstrePrintModal({
  account,
  rows,
  dateFrom,
  dateTo,
  currency,
  totalDebit,
  totalCredit,
  netBalance,
  onClose,
}: CariEkstrePrintModalProps) {
  const { language, tm } = useLanguage();
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  const [printLang, setPrintLang] = useState<Language>(language);
  const [orientation, setOrientation] = useState<CariEkstrePrintOrientation>('landscape');
  const [html, setHtml] = useState('');
  const [building, setBuilding] = useState(false);
  const [iframeH, setIframeH] = useState(420);

  const cardType = account.cardType as ExtCardType;

  const periodLabel = useMemo(() => {
    if (!selectedPeriod) return '';
    const name = String(selectedPeriod.donem_adi || selectedPeriod.name || '').trim();
    const nr = selectedPeriod.nr ?? selectedPeriod.donem_no;
    if (name && nr != null) return `${nr} — ${name}`;
    if (name) return name;
    if (nr != null) return String(nr);
    return '';
  }, [selectedPeriod]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setBuilding(true);
      try {
        const firmNr = selectedFirm?.firm_nr != null ? String(selectedFirm.firm_nr) : undefined;
        const receipt = await getReceiptSettings(firmNr).catch(() => ({}));
        const header = companyHeaderFromReceiptSettings(
          receipt,
          selectedFirm?.name || selectedFirm?.firma_adi || 'RetailEX',
        );
        const labels = buildCariEkstrePrintLabels(printLang);
        const cardTypeLabel = cardType === 'supplier' ? labels.supplier : labels.customer;
        const next = buildCariEkstrePrintHtml({
          ...header,
          reportTitle: labels.reportTitle,
          accountCode: String(account.code || '').trim(),
          accountName: account.name,
          accountAddress: formatCariAccountAddress(account),
          accountPhone: account.phone || account.phone2 || '',
          cardType,
          cardTypeLabel,
          dateFrom,
          dateTo,
          periodLabel,
          currency,
          rows,
          totalDebit,
          totalCredit,
          netBalance,
          labels,
          printLang,
          orientation,
        });
        if (!cancelled) setHtml(next);
      } catch (e: unknown) {
        if (!cancelled) {
          setHtml('');
          toast.error(e instanceof Error ? e.message : tm('extractPrintFailed'));
        }
      } finally {
        if (!cancelled) setBuilding(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    account,
    cardType,
    currency,
    dateFrom,
    dateTo,
    netBalance,
    orientation,
    periodLabel,
    printLang,
    rows,
    selectedFirm?.firm_nr,
    selectedFirm?.firma_adi,
    selectedFirm?.name,
    totalCredit,
    totalDebit,
    tm,
  ]);

  const handlePrint = () => {
    if (!html) {
      toast.error(tm('extractPrintFailed'));
      return;
    }
    printHtmlInMainDocument(html);
  };

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('accCustomerExtract')}>
      <div className="shrink-0 bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-4 text-white sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold sm:text-base">{tm('accCustomerExtract')}</h2>
            <p className="mt-0.5 truncate text-xs text-white/75">{account.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 hover:bg-white/15"
            aria-label={tm('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
        <p className="mb-2 text-[11px] text-slate-500">{tm('cariEkstrePrintHint')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {tm('cariEkstrePrintLang')}
            </label>
            <div className="relative">
              <select
                value={printLang}
                onChange={(e) => setPrintLang(e.target.value as Language)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-11 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500"
              >
                {LANG_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {tm(opt.labelKey)}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
            </div>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {tm('cariEkstrePrintOrientation')}
            </label>
            <div className="relative">
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as CariEkstrePrintOrientation)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-11 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500"
              >
                <option value="landscape">{tm('cariEkstrePrintLandscape')}</option>
                <option value="portrait">{tm('cariEkstrePrintPortrait')}</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
            </div>
          </div>
        </div>
      </div>

      <PercentBodyModalScrollBody className="bg-slate-100 p-3 sm:p-4">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {building && !html ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">
              {tm('loading')}
            </div>
          ) : (
            <iframe
              title={tm('preview')}
              className="block w-full border-0 bg-white"
              style={{ height: iframeH, minHeight: 280 }}
              srcDoc={html}
              onLoad={(e) => {
                const iframe = e.currentTarget;
                requestAnimationFrame(() => {
                  try {
                    const d = iframe.contentDocument;
                    const inner =
                      d?.documentElement?.scrollHeight ?? d?.body?.scrollHeight ?? 420;
                    const cap =
                      typeof window !== 'undefined'
                        ? Math.floor(window.innerHeight * 0.5)
                        : 640;
                    setIframeH(Math.min(Math.max(inner + 16, 280), cap));
                  } catch {
                    setIframeH(480);
                  }
                });
              }}
            />
          )}
        </div>
      </PercentBodyModalScrollBody>

      <div className="flex shrink-0 gap-3 border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-2xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-100 active:scale-[0.98]"
        >
          {tm('close')}
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!html || building}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-200/40 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
        >
          <Printer className="h-4 w-4" />
          {tm('print')}
        </button>
      </div>
    </PercentBodyModal>
  );
}
