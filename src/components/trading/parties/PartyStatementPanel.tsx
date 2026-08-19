import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { FullscreenBodyPortal, MODAL_OVERLAY_Z } from '../../shared/FullscreenBodyPortal';
import { ContextMenu } from '../../shared/ContextMenu';
import { getPartyStatement, type PartyStatement } from '../../../services/api/partyStatements';
import { partnerAPI } from '../../../services/api/partiesPartners';
import { printPartyStatementDoc, printPayrollVoucher } from '../../../utils/printPayrollVoucher';
import { defaultEkstreDateRange, ficheTypeToInfo } from '../../../utils/cariAccountStatement';
import { useNestedT } from './useNestedT';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { Party } from '../../../core/types/models';
import { PartyLedgerDipFooter } from './PartyLedgerDipFooter';

export interface PartyStatementPanelProps {
  party: Party;
  onClose: () => void;
}

function formatMoney(n?: number | null): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(n));
}

function txKind(type: string): 'salary' | 'advance' | 'reconcile' | 'accrual' | null {
  const u = String(type || '').toUpperCase();
  if (u === 'MAAS_HAKKEDIS') return 'accrual';
  if (u === 'MAAS_ODEME') return 'salary';
  if (u === 'AVANS_ODEME') return 'advance';
  if (u === 'AVANS_MAHSUP') return 'reconcile';
  return null;
}

export function PartyStatementPanel({ party, onClose }: PartyStatementPanelProps) {
  const t = useNestedT();
  const { tm } = useLanguage();
  const defaultRange = useMemo(() => defaultEkstreDateRange(), []);
  const [start, setStart] = useState(defaultRange.start);
  const [end, setEnd] = useState(defaultRange.end);
  const [showCancelled, setShowCancelled] = useState(false);
  const [excludeCompanyDebts, setExcludeCompanyDebts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [data, setData] = useState<PartyStatement | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: PartyStatement['rows'][number] } | null>(null);

  const load = async (s: string, e: string, showCancelledArg = showCancelled, excludeCompanyDebtsArg = excludeCompanyDebts) => {
    setLoading(true);
    try {
      if (party.card_type === 'partner') {
        try {
          await partnerAPI.syncBalancesFromYearNet();
        } catch {
          /* ekstre yine yüklensin */
        }
      }
      setData(
        await getPartyStatement(party.id, party.card_type, s, e, {
          showCancelled: showCancelledArg,
          excludeCompanyDebts: excludeCompanyDebtsArg,
        }),
      );
    } catch (err: unknown) {
      setData(null);
      toast.error(err instanceof Error ? err.message : t('party.statement.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- party değişince yeniden yükle
  }, [party.id]);

  useEffect(() => {
    void load(start, end, showCancelled, excludeCompanyDebts);
    // toggle değişiminde tarih değişmese bile yeniden yükle
  }, [showCancelled, excludeCompanyDebts]);

  const printAll = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      await printPartyStatementDoc({
        title: party.card_type === 'partner' ? t('party.partnerCash.statementTitle') : t('party.statement.title'),
        partyName: party.name,
        partyCode: party.code,
        cardTypeLabel: t(`party.cardType.${party.card_type}`),
        start,
        end,
        statement: data,
        openingLabel: t('party.statement.opening'),
        closingLabel: t('party.statement.closing'),
        cardBalanceLabel: t('party.fields.balance'),
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('party.statement.printError'));
    } finally {
      setPrinting(false);
    }
  };

  const printRow = async (type: string, amount: number, ficheNo?: string | null, date?: string, definition?: string | null, balanceAfter?: number) => {
    const kind = txKind(type);
    if (!kind) {
      toast.error(t('party.statement.printRowHint'));
      return;
    }
    const titles: Record<NonNullable<ReturnType<typeof txKind>>, string> = {
      salary: t('party.payroll.voucherTitleSalary'),
      advance: t('party.payroll.voucherTitleAdvance'),
      reconcile: t('party.payroll.voucherTitleReconcile'),
      accrual: t('party.payroll.voucherTitleAccrual'),
    };
    try {
      await printPayrollVoucher({
        kind,
        title: titles[kind],
        employeeName: party.name,
        employeeCode: party.code,
        amount,
        ficheNo,
        date,
        definition,
        balanceAfter,
        balanceLabel: t('party.fields.balance'),
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('party.statement.printError'));
    }
  };

  const rows = data?.rows || [];
  const cardBal = data?.card_balance ?? party.balance ?? 0;
  const dip = useMemo(() => {
    const debit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
    const credit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
    const last = rows.length ? rows[rows.length - 1].balance_after : data?.closing_balance || 0;
    return { debit, credit, last };
  }, [rows, data?.closing_balance]);

  return (
    <>
    <FullscreenBodyPortal
      className="flex flex-col bg-white"
      zIndex={MODAL_OVERLAY_Z}
      role="dialog"
      aria-modal="true"
      aria-labelledby="party-ekstre-title"
    >
      <div className="flex-shrink-0 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-teal-50 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2" id="party-ekstre-title">
            <FileText className="h-5 w-5 shrink-0 text-emerald-700" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{t('party.statement.title')}</p>
              <p className="truncate text-base font-bold text-gray-900">{party.name}</p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-800">
              {t(`party.cardType.${party.card_type}`)}
            </span>
            <span className="shrink-0 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-black text-emerald-800">
              {t('party.fields.balance')}: {formatMoney(cardBal)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-xs text-gray-400">—</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => void load(start, end)}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              {tm('bring')}
            </button>
            <button
              type="button"
              onClick={() => setShowCancelled((v) => !v)}
              aria-pressed={showCancelled}
              title={t('party.statement.showCancelledHint')}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                showCancelled
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  showCancelled ? 'bg-white' : 'bg-rose-400'
                }`}
                aria-hidden="true"
              />
              {showCancelled
                ? t('party.statement.showCancelled')
                : t('party.statement.hideCancelled')}
            </button>
            <button
              type="button"
              onClick={() => setExcludeCompanyDebts((v) => !v)}
              aria-pressed={excludeCompanyDebts}
              title={
                party.card_type === 'partner' || party.card_type === 'employee'
                  ? t('party.statement.excludeCompanyDebtsHint')
                  : t('party.statement.excludeCompanyDebtsNoEffect')
              }
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                excludeCompanyDebts
                  ? 'border-amber-600 bg-amber-500 text-white shadow-sm'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  excludeCompanyDebts ? 'bg-white' : 'bg-amber-400'
                }`}
                aria-hidden="true"
              />
              {t('party.statement.excludeCompanyDebts')}
            </button>
            <button
              type="button"
              onClick={() => void printAll()}
              disabled={!data || printing}
              className="rounded-lg border border-transparent p-2 hover:border-gray-300 hover:bg-gray-200 disabled:opacity-40"
              title={tm('print')}
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin text-gray-600" /> : <Printer className="h-4 w-4 text-gray-600" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-gray-800"
            >
              <X className="h-4 w-4" />
              {tm('close')}
            </button>
          </div>
        </div>
        {data && (
          <div className="flex flex-wrap gap-2 px-4 pb-3 text-xs font-bold">
            <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
              {t('party.statement.opening')}: {formatMoney(data.opening_balance)}
            </span>
            <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-700">
              {t('party.statement.closing')}: {formatMoney(data.closing_balance)}
            </span>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center gap-2 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">{tm('loading')}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center text-gray-500">
            <FileText className="h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium">{tm('noRecordFound')}</p>
            <p className="max-w-md text-xs text-gray-400">
              {party.card_type === 'partner' ? t('party.partnerCash.statementEmpty') : t('party.statement.empty')}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] border-b border-gray-200 bg-gray-100">
              <tr>
                {[tm('dateLabel'), tm('ficheNo'), tm('type'), tm('description'), tm('debtor'), tm('creditor'), tm('balance')].map((h) => (
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
              {rows.map((row, idx) => {
                const isCancelled = String(row.transaction_type || '').toUpperCase().startsWith('CANCELLED_');
                const { label, color } = ficheTypeToInfo(row.transaction_type, 0, isCancelled);
                const amt = row.debit || row.credit;
                return (
                  <tr
                    key={row.id || idx}
                    className={`border-b border-gray-100 hover:bg-emerald-50/40 cursor-context-menu ${idx % 2 ? 'bg-gray-50/50' : ''} ${isCancelled ? 'opacity-60' : ''}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, row });
                    }}
                  >
                    <td className="px-4 py-2 font-mono text-gray-600">{row.date ? String(row.date).split('T')[0] : '—'}</td>
                    <td className="px-4 py-2">
                      {row.fiche_no ? (
                        <button
                          type="button"
                          onClick={() => void printRow(row.transaction_type, amt, row.fiche_no, row.date, row.definition, row.balance_after)}
                          className="font-mono font-bold text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                          title={t('party.statement.printVoucher')}
                        >
                          {row.fiche_no}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void printRow(row.transaction_type, amt, row.fiche_no, row.date, row.definition, row.balance_after)}
                          className="text-xs font-bold text-emerald-700 hover:underline"
                        >
                          {t('party.statement.printVoucher')}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${color}`}>
                        {isCancelled ? t('party.statement.cancelledBadge') : label}
                      </span>
                    </td>
                    <td className="max-w-md break-words px-4 py-2 text-gray-700">{row.definition || ''}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-bold text-red-600">
                      {row.debit ? formatMoney(row.debit) : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-bold text-green-600">
                      {row.credit ? formatMoney(row.credit) : ''}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right font-black ${row.balance_after > 0 ? 'text-red-600' : row.balance_after < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {formatMoney(row.balance_after)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <PartyLedgerDipFooter
              count={rows.length}
              debit={dip.debit}
              credit={dip.credit}
              balance={dip.last}
              label={tm('invoiceListDipTotal')}
            />
          </table>
        )}
      </div>
    </FullscreenBodyPortal>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'print',
              label: t('party.statement.printVoucher'),
              icon: Printer,
              onClick: () => {
                const r = contextMenu.row;
                void printRow(r.transaction_type, r.debit || r.credit, r.fiche_no, r.date, r.definition, r.balance_after);
                setContextMenu(null);
              },
            },
          ]}
        />
      )}
    </>
  );
}
