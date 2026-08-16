import React, { useEffect, useMemo, useState } from 'react';
import { useNestedT } from './useNestedT';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import { ContextMenu } from '../../shared/ContextMenu';
import { employeeAPI } from '../../../services/api/partiesEmployees';
import { employeeStatementSides } from '../../../services/api/partyEmployeeBalance';
import { fetchKasalar, type Kasa } from '../../../services/api/kasa';
import { printPayrollVoucher, type PayrollVoucherKind } from '../../../utils/printPayrollVoucher';
import { ficheTypeToInfo } from '../../../utils/cariAccountStatement';
import { ChevronDown, FileText, Loader2, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { Party, PartyLedgerMovement } from '../../../core/types/models';

export interface EmployeePayrollModalProps {
  employee: Party;
  onClose: () => void;
  onSaved: () => void;
  onOpenStatement?: () => void;
}

type Action = 'salary' | 'advance' | 'reconcile';
type ViewTab = 'form' | 'movements';

type MovementRow = PartyLedgerMovement & {
  debit: number;
  credit: number;
  balance_after: number;
};

export function EmployeePayrollModal({ employee, onClose, onSaved, onOpenStatement }: EmployeePayrollModalProps) {
  const t = useNestedT();
  const { tm } = useLanguage();
  const [viewTab, setViewTab] = useState<ViewTab>('form');
  const [action, setAction] = useState<Action>('salary');
  const [amount, setAmount] = useState('');
  const [registerId, setRegisterId] = useState('');
  const [definition, setDefinition] = useState('');
  const [registers, setRegisters] = useState<Kasa[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<PartyLedgerMovement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(employee.balance || 0);
  const [salaryBase, setSalaryBase] = useState(employee.salary_base || 0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: MovementRow } | null>(null);

  const refreshCard = async () => {
    try {
      await employeeAPI.ensureMonthlySalaryAccrual();
      const fresh = await employeeAPI.getById(employee.id);
      if (fresh) {
        setBalance(fresh.balance || 0);
        setSalaryBase(fresh.salary_base || 0);
      }
    } catch {
      /* liste yine yüklenecek */
    }
  };

  const loadRecent = async () => {
    try {
      const rows = await employeeAPI.getLedger(employee.id, { limit: 500 });
      setRecent(rows);
    } catch {
      setRecent([]);
    }
  };

  useEffect(() => {
    fetchKasalar({ aktif: true }).then(setRegisters).catch(() => setRegisters([]));
    void (async () => {
      await refreshCard();
      await loadRecent();
    })();
  }, [employee.id]);

  useEffect(() => {
    if (action === 'salary') {
      setAmount(salaryBase ? String(salaryBase) : '');
    } else {
      setAmount('');
    }
    setError(null);
  }, [action, salaryBase]);

  useEffect(() => {
    setContextMenu(null);
  }, [viewTab]);

  const rows = useMemo(() => withRunning(recent), [recent]);

  const printRow = async (r: MovementRow) => {
    const kind = txKind(r.transaction_type);
    if (!kind) {
      toast.error(t('party.statement.printRowHint'));
      return;
    }
    const titles: Record<PayrollVoucherKind, string> = {
      salary: t('party.payroll.voucherTitleSalary'),
      advance: t('party.payroll.voucherTitleAdvance'),
      reconcile: t('party.payroll.voucherTitleReconcile'),
      accrual: t('party.payroll.voucherTitleAccrual'),
    };
    try {
      await printPayrollVoucher({
        kind,
        title: titles[kind],
        employeeName: employee.name,
        employeeCode: employee.code,
        amount: r.amount,
        ficheNo: r.fiche_no,
        date: r.date,
        definition: r.definition,
        balanceAfter: r.balance_after,
        balanceLabel: t('party.fields.balance'),
      });
    } catch (err: any) {
      toast.error(err?.message || t('party.statement.printError'));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError(t('party.payroll.amountPositive'));
      return;
    }
    if (action !== 'reconcile' && !registerId) {
      setError(t('party.payroll.registerRequired'));
      return;
    }
    setLoading(true);
    try {
      let result: { ficheNo?: string | null; balance: number } | null = null;
      if (action === 'salary') {
        result = await employeeAPI.paySalary({
          employeeId: employee.id,
          amount: amt,
          registerId,
          definition: definition || undefined,
        });
      } else if (action === 'advance') {
        result = await employeeAPI.payAdvance({
          employeeId: employee.id,
          amount: amt,
          registerId,
          definition: definition || undefined,
        });
      } else {
        result = await employeeAPI.reconcileAdvance({
          employeeId: employee.id,
          amount: amt,
          definition: definition || undefined,
        });
      }
      if (result) setBalance(result.balance);
      toast.success(t('party.payroll.saveSuccess'));
      await loadRecent();
      setViewTab('movements');
      onSaved();
      if (action !== 'reconcile') {
        const titles = {
          salary: t('party.payroll.voucherTitleSalary'),
          advance: t('party.payroll.voucherTitleAdvance'),
        } as const;
        try {
          await printPayrollVoucher({
            kind: action,
            title: titles[action],
            employeeName: employee.name,
            employeeCode: employee.code,
            amount: amt,
            ficheNo: result?.ficheNo,
            date: new Date().toISOString(),
            definition: definition || undefined,
            balanceAfter: result?.balance,
            balanceLabel: t('party.fields.balance'),
          });
        } catch (printErr: any) {
          toast.error(printErr?.message || t('party.statement.printError'));
        }
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={t('party.payroll.title')}>
      <div className="flex flex-col min-h-0 h-full">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 text-white shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{t('party.payroll.title')}</h2>
            <p className="text-emerald-100 text-sm mt-0.5">{employee.name}</p>
          </div>
          <div className="flex items-center gap-1">
            {onOpenStatement && (
              <button
                type="button"
                onClick={onOpenStatement}
                className="p-2 rounded-xl hover:bg-white/10 transition"
                title={t('party.payroll.openStatement')}
              >
                <FileText className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="shrink-0 px-5 pt-3 flex gap-2 border-b border-slate-100 bg-white">
          <ViewTabButton
            active={viewTab === 'form'}
            onClick={() => setViewTab('form')}
            label={t('party.payroll.tabForm')}
          />
          <ViewTabButton
            active={viewTab === 'movements'}
            onClick={() => setViewTab('movements')}
            label={t('party.payroll.movements')}
          />
        </div>

        {viewTab === 'form' && (
        <form onSubmit={submit} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
            <div className="flex gap-2">
              <ActionButton active={action === 'salary'} onClick={() => setAction('salary')} label={t('party.payroll.paySalary')} />
              <ActionButton active={action === 'advance'} onClick={() => setAction('advance')} label={t('party.payroll.payAdvance')} />
              <ActionButton active={action === 'reconcile'} onClick={() => setAction('reconcile')} label={t('party.payroll.reconcile')} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {t('party.payroll.amount')}
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={0}
                  step="0.01"
                  className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400 outline-none text-slate-800 font-medium"
                />
              </div>

              {action !== 'reconcile' ? (
                <div className="relative">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {t('party.payroll.register')}
                  </label>
                  <select
                    value={registerId}
                    onChange={(e) => setRegisterId(e.target.value)}
                    className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400 outline-none text-slate-800 font-medium appearance-none bg-white"
                  >
                    <option value="">{t('party.payroll.chooseRegister')}</option>
                    {registers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.kasa_adi} ({r.kasa_kodu})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-[42px] -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                </div>
              ) : (
                <div />
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('party.payroll.note')}
              </label>
              <input
                type="text"
                value={definition}
                onChange={(e) => setDefinition(e.target.value)}
                placeholder={t('party.payroll.notePlaceholder')}
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400 outline-none text-slate-800 font-medium"
              />
            </div>

            {error && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                {error}
              </div>
            )}

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 grid grid-cols-2 gap-2">
              <div className="flex justify-between gap-2"><span>{t('party.employee.salaryBase')}</span><strong>{formatMoney(salaryBase)}</strong></div>
              <div className="flex justify-between gap-2">
                <span>{t('party.fields.balance')}</span>
                <strong className={balance > 0 ? 'text-emerald-700' : balance < 0 ? 'text-amber-700' : ''}>
                  {formatMoney(balance)}
                  {balance > 0 ? ` · ${t('party.employee.balanceLabel')}` : balance < 0 ? ` · ${t('party.employee.balanceLabelAdvance')}` : ''}
                </strong>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider py-3 hover:bg-slate-100 active:scale-[0.98] transition"
              >
                {t('common.cancel', 'İptal')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-2xl bg-emerald-600 text-white font-bold uppercase text-sm tracking-wider py-3 shadow-lg shadow-emerald-200/50 hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98] transition flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('common.save', 'Kaydet')}
              </button>
            </div>
          </form>
        )}

        {viewTab === 'movements' && (
          <div className="min-h-0 flex-1 flex flex-col p-5">
            <div className="min-h-0 flex-1 flex flex-col border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <div className="shrink-0 px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {t('party.payroll.movements')}
                <span className="ml-2 font-mono text-slate-700">
                  {formatMoney(balance)}
                  {balance > 0 ? ` · ${t('party.employee.balanceLabel')}` : balance < 0 ? ` · ${t('party.employee.balanceLabelAdvance')}` : ''}
                </span>
              </div>
              {onOpenStatement && (
                <button
                  type="button"
                  onClick={onOpenStatement}
                  className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 hover:underline"
                >
                  {t('party.payroll.openStatement')}
                </button>
              )}
            </div>
            {rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">{t('party.statement.empty')}</div>
            ) : (
              <PercentBodyModalScrollBody>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-[1] bg-slate-100 text-slate-600 text-[11px] font-black uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-3 py-2">{tm('dateLabel')}</th>
                      <th className="text-left px-3 py-2">{tm('ficheNo')}</th>
                      <th className="text-left px-3 py-2">{t('party.table.type')}</th>
                      <th className="text-left px-3 py-2">{t('party.payroll.note')}</th>
                      <th className="text-right px-3 py-2">{tm('debtor')}</th>
                      <th className="text-right px-3 py-2">{tm('creditor')}</th>
                      <th className="text-right px-3 py-2">{t('party.table.balance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => {
                      const { label, color } = ficheTypeToInfo(r.transaction_type, 0, false);
                      return (
                        <tr
                          key={r.id}
                          className={`border-t border-slate-100 hover:bg-emerald-50/50 cursor-context-menu ${idx % 2 ? 'bg-slate-50/40' : ''}`}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({ x: e.clientX, y: e.clientY, row: r });
                          }}
                          onDoubleClick={() => void printRow(r)}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">{String(r.date || '').slice(0, 10)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-emerald-700">{r.fiche_no || '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${color}`}>{label}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-xs truncate">{r.definition || ''}</td>
                          <td className="px-3 py-2 text-right font-mono text-red-600">{r.debit ? formatMoney(r.debit) : ''}</td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-700">{r.credit ? formatMoney(r.credit) : ''}</td>
                          <td className={`px-3 py-2 text-right font-mono font-bold ${r.balance_after > 0 ? 'text-emerald-700' : r.balance_after < 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                            {formatMoney(r.balance_after)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </PercentBodyModalScrollBody>
            )}
            </div>
          </div>
        )}
      </div>

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
                void printRow(contextMenu.row);
                setContextMenu(null);
              },
            },
            ...(onOpenStatement
              ? [{
                  id: 'statement',
                  label: t('party.payroll.openStatement'),
                  icon: FileText,
                  onClick: () => {
                    onOpenStatement();
                    setContextMenu(null);
                  },
                }]
              : []),
          ]}
        />
      )}
    </PercentBodyModal>
  );
}

function withRunning(rows: PartyLedgerMovement[]): MovementRow[] {
  const sorted = [...rows].sort((a, b) => {
    const da = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (da !== 0) return da;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  let running = 0;
  return sorted.map((r) => {
    const { debit, credit } = employeeStatementSides(r.transaction_type, r.amount);
    running += credit - debit;
    return { ...r, debit, credit, balance_after: running };
  });
}

function txKind(type: string): PayrollVoucherKind | null {
  const u = String(type || '').toUpperCase();
  if (u === 'MAAS_HAKKEDIS') return 'accrual';
  if (u === 'MAAS_ODEME') return 'salary';
  if (u === 'AVANS_ODEME') return 'advance';
  if (u === 'AVANS_MAHSUP') return 'reconcile';
  return null;
}

function ViewTabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 rounded-t-xl text-xs font-bold uppercase tracking-wider border-b-2 -mb-px ${
        active
          ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  );
}

function ActionButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded-2xl text-xs font-bold uppercase tracking-wider transition border-2 ${
        active
          ? 'bg-emerald-600 text-white border-transparent shadow-md'
          : 'border-slate-200 text-slate-500 hover:border-slate-300'
      }`}
    >
      {label}
    </button>
  );
}

function formatMoney(n?: number | string | null): string {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(num);
}
