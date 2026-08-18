/**
 * Cari Devir Excel Import Modülü
 *
 * Excel'den müşteri/tedarikçi devir bakiyesi (açılış fişi) içe aktarma.
 * - Hesap Kodu → cari.id çözümlemesi
 * - Toplu devir fişi yazımı (mevcut `createCariDevirBatch` üzerinden)
 * - Modal: Açıklama + Tarih + Mevcut devirleri değiştir modu
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { supplierAPI } from '../../../services/api/suppliers';
import type { Supplier } from '../../../services/api/suppliers';
import {
  createCariDevirBatch,
  devirDirectionFromNet,
  devirAmountFromNet,
  type CariDevirDirection,
} from '../../../services/api/cariOpeningBalance';
import { formatNumber } from '../../../utils/formatNumber';
import {
  parseCariDevirExcelArrayBuffer,
  downloadCariDevirImportTemplate,
  type ParsedCariDevirExcelRow,
  CARI_DEVIR_EXCEL_COLUMNS,
} from '../../../utils/cariDevirExcelImport';

type RowStatus = 'pending' | 'ok' | 'missing' | 'invalid' | 'running' | 'failed';

type PreviewRow = {
  excelRow: number;
  accountCode: string;
  accountName: string;
  signedBalance: number;
  direction: CariDevirDirection;
  amount: number;
  status: RowStatus;
  message?: string;
  /** Çözümlenen cari kartı */
  resolved?: Supplier;
};

export function CariDevirExcelImportModule() {
  const { tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Supplier[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  // Import ayarları
  const [batchNotes, setBatchNotes] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [replaceExisting, setReplaceExisting] = useState(true);

  // İmport sonucu
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  // Cari listesi (kod çözümlemesi için)
  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const list = await supplierAPI.getAll({ cardType: 'all' });
      setAccounts(list);
    } catch (err: any) {
      toast.error(err?.message || tm('accountsLoadError'));
    } finally {
      setAccountsLoading(false);
    }
  }, [tm]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const accountByCode = useMemo(() => {
    const map = new Map<string, Supplier>();
    for (const a of accounts) {
      const code = String(a.code || '').trim().toLowerCase();
      if (code) map.set(code, a);
    }
    return map;
  }, [accounts]);

  /** Parse edilen Excel satırlarını cari listesiyle eşle */
  const buildPreviewRows = useCallback(
    (rows: ParsedCariDevirExcelRow[]): PreviewRow[] => {
      return rows.map((r) => {
        const code = String(r.accountCode || '').trim().toLowerCase();
        const resolved = accountByCode.get(code);
        const direction: CariDevirDirection =
          r.signedBalance < 0
            ? devirDirectionFromNet(-r.amount)
            : devirDirectionFromNet(r.amount);
        if (!resolved) {
          return {
            excelRow: r.excelRow,
            accountCode: r.accountCode,
            accountName: r.accountName,
            signedBalance: r.signedBalance,
            direction,
            amount: r.amount,
            status: 'missing',
            message: tm('excelCariDevirRowStatusMissing'),
          };
        }
        // Ad doğrulaması (opsiyonel)
        if (
          r.accountName &&
          resolved.name &&
          r.accountName.trim().toLowerCase() !== String(resolved.name).trim().toLowerCase()
        ) {
          return {
            excelRow: r.excelRow,
            accountCode: r.accountCode,
            accountName: r.accountName,
            signedBalance: r.signedBalance,
            direction,
            amount: r.amount,
            resolved,
            status: 'invalid',
            message: `${tm('excelCariDevirNameMismatch')}: "${resolved.name}"`,
          };
        }
        return {
          excelRow: r.excelRow,
          accountCode: r.accountCode,
          accountName: r.accountName,
          signedBalance: r.signedBalance,
          direction,
          amount: r.amount,
          resolved,
          status: 'ok',
        };
      });
    },
    [accountByCode, tm],
  );

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const ok = await downloadCariDevirImportTemplate();
      if (ok) toast.success(tm('purchaseInvoiceExcelTemplateDownloaded'));
    } catch (err: any) {
      toast.error(err?.message || tm('purchaseInvoiceExcelDownloadError'));
    }
  }, [tm]);

  const handleExcelFileChange = useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file) return;
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
        toast.error(tm('supportedFormats'));
        return;
      }
      setParsing(true);
      try {
        const buf = await file.arrayBuffer();
        const { rows, errors } = parseCariDevirExcelArrayBuffer(buf);
        setParseErrors(errors);
        setPreviewRows(buildPreviewRows(rows));
        if (rows.length === 0 && errors.length === 0) {
          toast.error(tm('purchaseInvoiceExcelEmptyFile'));
          setShowImportModal(false);
          return;
        }
        // Modal: açıklama default
        setBatchNotes(tm('openingBatchNotesDefaultCari'));
        setShowImportModal(true);
      } catch (err: any) {
        toast.error(err?.message || tm('purchaseInvoiceExcelImportFailed'));
      } finally {
        setParsing(false);
      }
    },
    [buildPreviewRows, tm],
  );

  const runImport = useCallback(async () => {
    const okRows = previewRows.filter((r) => r.status === 'ok' && r.resolved);
    if (okRows.length === 0) {
      toast.error(tm('excelCariDevirNoValidRows'));
      return;
    }
    setImporting(true);
    setImportProgress({ done: 0, total: okRows.length });

    let created = 0;
    let errorsCount = 0;
    const errorSamples: string[] = [];

    // Görsel ilerleme için satırları 'running' olarak işaretle
    setPreviewRows((prev) =>
      prev.map((r) => (r.status === 'ok' ? { ...r, status: 'running' as RowStatus } : r)),
    );

    const lines = okRows.map((r) => ({
      accountId: r.resolved!.id,
      cardType: (r.resolved!.cardType === 'supplier' ? 'supplier' : 'customer') as
        | 'customer'
        | 'supplier',
      accountCode: r.resolved!.code,
      accountName: r.resolved!.name,
      amount: r.amount,
      direction: r.direction,
    }));

    const result = await createCariDevirBatch({
      date,
      batchNotes: batchNotes.trim() || undefined,
      replaceExisting,
      lines,
    });

    created = result.created;
    errorsCount = result.errors.length;
    for (const e of result.errors.slice(0, 5)) {
      errorSamples.push(e.message);
    }

    setPreviewRows((prev) =>
      prev.map((r) => {
        if (r.status !== 'running' || !r.resolved) return r;
        const failed = result.errors.find((er) => er.accountId === r.resolved!.id);
        if (failed) {
          return { ...r, status: 'failed' as RowStatus, message: failed.message };
        }
        return { ...r, status: 'ok' as RowStatus };
      }),
    );

    setImporting(false);
    setImportProgress({ done: created, total: okRows.length });

    if (errorsCount > 0) {
      toast.error(
        `${created} ${tm('excelCariDevirResultCreated')} · ${errorsCount} ${tm('excelCariDevirResultErrors')}`,
        { description: errorSamples.join('\n') },
      );
    } else {
      toast.success(
        `${created} ${tm('excelCariDevirResultCreated')}`.replace(
          '{count}',
          String(created),
        ),
      );
    }
  }, [previewRows, date, batchNotes, replaceExisting, tm]);

  const closeModal = useCallback(() => {
    if (importing) return;
    setShowImportModal(false);
    setPreviewRows([]);
    setParseErrors([]);
    setImportProgress({ done: 0, total: 0 });
  }, [importing]);

  const filteredPreview = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return previewRows;
    return previewRows.filter(
      (r) =>
        r.accountCode.toLowerCase().includes(term) ||
        r.accountName.toLowerCase().includes(term) ||
        (r.resolved?.name || '').toLowerCase().includes(term),
    );
  }, [previewRows, searchTerm]);

  const okCount = previewRows.filter((r) => r.status === 'ok' || r.status === 'running').length;
  const failedCount = previewRows.filter((r) =>
    ['missing', 'invalid', 'failed'].includes(r.status),
  ).length;

  const mainCurrency = useMemo(
    () => String(selectedFirm?.ana_para_birimi || 'IQD').trim().toUpperCase().slice(0, 10) || 'IQD',
    [selectedFirm?.ana_para_birimi],
  );

  return (
    <div className="space-y-6" data-testid="cari-devir-excel-import">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
            {tm('excelCariDevirTitle')}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {tm('excelCariDevirSubtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            data-testid="cari-devir-excel-template-btn"
          >
            <Download className="h-4 w-4" />
            {tm('excelCariDevirTemplateBtn')}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing || accountsLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="cari-devir-excel-import-btn"
          >
            {parsing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {parsing ? tm('purchaseInvoiceExcelImporting') : tm('excelCariDevirImportBtn')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelFileChange}
            className="hidden"
            data-testid="cari-devir-excel-file-input"
          />
        </div>
      </header>

      {/* Kullanım bilgi kartı */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <ArrowRightLeft className="h-4 w-4 text-emerald-600" />
          {tm('usageSteps')}
        </h3>
        <ol className="ml-5 list-decimal space-y-1 text-sm text-slate-600 dark:text-slate-400">
          <li>{tm('excelCariDevirStep1')}</li>
          <li>{tm('excelCariDevirStep2')}</li>
          <li>{tm('excelCariDevirStep3')}</li>
          <li>{tm('excelCariDevirStep4')}</li>
        </ol>
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {CARI_DEVIR_EXCEL_COLUMNS.accountCode}
            </span>
            <span className="ml-2 text-slate-500">— {tm('excelCariDevirColAccountCode')}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {CARI_DEVIR_EXCEL_COLUMNS.accountName}
            </span>
            <span className="ml-2 text-slate-500">— {tm('excelCariDevirColAccountName')}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {CARI_DEVIR_EXCEL_COLUMNS.balance}
            </span>
            <span className="ml-2 text-slate-500">— {tm('excelCariDevirColBalance')}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {CARI_DEVIR_EXCEL_COLUMNS.direction}
            </span>
            <span className="ml-2 text-slate-500">— {tm('excelCariDevirColDirection')}</span>
          </div>
        </div>
        <p className="mt-3 text-xs italic text-slate-500 dark:text-slate-400">
          {tm('importWarning')}
        </p>
      </section>

      {/* Import Modal */}
      {showImportModal && (
        <PercentBodyModal
          onClose={closeModal}
          size="wide"
          ariaLabel={tm('excelCariDevirTitle')}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-white dark:border-slate-700">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <FileSpreadsheet className="h-5 w-5" />
              {tm('excelCariDevirImportPreviewTitle')}
            </h3>
            <button
              type="button"
              onClick={closeModal}
              disabled={importing}
              className="rounded p-1 text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {tm('excelCariDevirBatchNotes')}
              </label>
              <textarea
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
                rows={2}
                placeholder={tm('openingBatchNotesPlaceholder')}
                disabled={importing}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                data-testid="cari-devir-excel-notes-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end sm:gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {tm('openingBalanceDate')}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={importing}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  data-testid="cari-devir-excel-date-input"
                />
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  disabled={importing}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  data-testid="cari-devir-excel-replace-checkbox"
                />
                <span className="text-slate-700 dark:text-slate-200">
                  {tm('replaceExistingCari')}
                </span>
              </label>
            </div>
          </div>

          {/* Arama + sayaç */}
          <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={tm('excelCariDevirSearchPlaceholder')}
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                data-testid="cari-devir-excel-search-input"
              />
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {okCount} {tm('excelCariDevirReady')}
              </span>
              {failedCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2.5 py-1 font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                  {failedCount} {tm('excelCariDevirErrors')}
                </span>
              )}
              {parseErrors.length > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  {parseErrors.length} {tm('excelCariDevirParseErrors')}
                </span>
              )}
            </div>
          </div>

          <PercentBodyModalScrollBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">{tm('excelCariDevirColAccountCode')}</th>
                    <th className="px-3 py-2 text-left">{tm('excelCariDevirColAccountName')}</th>
                    <th className="px-3 py-2 text-right">{tm('excelCariDevirColBalance')}</th>
                    <th className="px-3 py-2 text-center">{tm('excelCariDevirColDirection')}</th>
                    <th className="px-3 py-2 text-left">{tm('excelCariDevirStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreview.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        {tm('excelCariDevirNoRows')}
                      </td>
                    </tr>
                  ) : (
                    filteredPreview.map((r) => (
                      <tr
                        key={`${r.excelRow}-${r.accountCode}`}
                        className={`border-b border-slate-100 dark:border-slate-700 ${
                          r.status === 'running'
                            ? 'bg-amber-50/40 dark:bg-amber-900/10'
                            : r.status === 'failed' || r.status === 'missing' || r.status === 'invalid'
                            ? 'bg-rose-50/40 dark:bg-rose-900/10'
                            : ''
                        }`}
                      >
                        <td className="px-3 py-1.5 text-xs text-slate-500">{r.excelRow}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-slate-800 dark:text-slate-100">
                          {r.accountCode}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200">
                          {r.resolved?.name || r.accountName || (
                            <span className="italic text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                          {formatNumber(r.amount, 2)}
                        </td>
                        <td className="px-3 py-1.5 text-center text-xs">
                          {r.direction === 'borc' ? (
                            <span className="rounded bg-rose-100 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                              {tm('directionDebt')}
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                              {tm('openingCredit')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          {r.status === 'ok' && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3.5 w-3.5" />
                              {tm('excelCariDevirRowStatusReady')}
                            </span>
                          )}
                          {r.status === 'running' && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {tm('excelCariDevirRowStatusRunning')}
                            </span>
                          )}
                          {r.status === 'failed' && (
                            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                              <XCircle className="h-3.5 w-3.5" />
                              {r.message || tm('excelCariDevirRowStatusFailed')}
                            </span>
                          )}
                          {r.status === 'missing' && (
                            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {tm('excelCariDevirRowStatusMissing')}
                            </span>
                          )}
                          {r.status === 'invalid' && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {r.message || tm('excelCariDevirRowStatusInvalid')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {parseErrors.length > 0 && (
              <div className="border-t border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                <strong>{tm('excelCariDevirParseErrors')}:</strong>
                <ul className="ml-4 mt-1 list-disc">
                  {parseErrors.slice(0, 10).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {parseErrors.length > 10 && (
                    <li>… +{parseErrors.length - 10}</li>
                  )}
                </ul>
              </div>
            )}
          </PercentBodyModalScrollBody>

          <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {importing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                  {importProgress.done} / {importProgress.total}
                </span>
              ) : (
                <>
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />
                  {okCount} {tm('excelCariDevirReady')}
                  {failedCount > 0 && (
                    <>
                      {' · '}
                      <XCircle className="mr-1 inline h-3.5 w-3.5 text-rose-500" />
                      {failedCount} {tm('excelCariDevirErrors')}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={importing}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {tm('cancel')}
              </button>
              <button
                type="button"
                onClick={runImport}
                disabled={importing || okCount === 0 || failedCount === previewRows.length}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="cari-devir-excel-confirm-btn"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {importing
                  ? tm('purchaseInvoiceExcelImporting')
                  : `${tm('excelCariDevirImportConfirm')} (${okCount})`}
              </button>
            </div>
          </div>
        </PercentBodyModal>
      )}
    </div>
  );
}