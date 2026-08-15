import React, { useEffect, useState } from 'react';
import { useNestedT } from './useNestedT';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import { employeeAPI } from '../../../services/api/partiesEmployees';
import { fetchKasalar, type Kasa } from '../../../services/api/kasa';
import { printPayrollVoucher } from '../../../utils/printPayrollVoucher';
import { ChevronDown, FileText, Loader2, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Party, PartyLedgerMovement } from '../../../core/types/models';

export interface EmployeePayrollModalProps {
  employee: Party;
  onClose: () => void;
  onSaved: () => void;
  onOpenStatement?: () => void;
}

type Action = 'salary' | 'advance' | 'reconcile';

export function EmployeePayrollModal({ employee, onClose, onSaved, onOpenStatement }: EmployeePayrollModalProps) {
  const t = useNestedT();
  const [action, setAction] = useState<Action>('salary');
  const [amount, setAmount] = useState('');
  const [registerId, setRegisterId] = useState('');
  const [definition, setDefinition] = useState('');
  const [registers, setRegisters] = useState<Kasa[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<PartyLedgerMovement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(employee.balance || 0);

  useEffect(() => {
    setBalance(employee.balance || 0);
  }, [employee.id, employee.balance]);

  useEffect(() => {
    fetchKasalar({ aktif: true }).then(setRegisters).catch(() => setRegisters([]));
    loadRecent();
  }, []);

  const loadRecent = async () => {
    try {
      const rows = await employeeAPI.getLedger(employee.id, { limit: 30 });
      setRecent(rows);
    } catch {
      setRecent([]);
    }
  };

  useEffect(() => {
    if (action === 'salary') {
      setAmount(employee.salary_base ? String(employee.salary_base) : '');
    } else {
      setAmount('');
    }
    setError(null);
  }, [action, employee.salary_base]);

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
    <PercentBodyModal onClose={onClose} size="compact" ariaLabel={t('party.payroll.title')}>
      <form onSubmit={submit} className="flex flex-col min-h-0 max-h-full">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-6 text-white shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{t('party.payroll.title')}</h2>
            <p className="text-emerald-100 text-sm mt-1">{employee.name}</p>
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

        <PercentBodyModalScrollBody className="p-6">
          <div className="flex gap-2 mb-4">
            <ActionButton active={action === 'salary'} onClick={() => setAction('salary')} label={t('party.payroll.paySalary')} />
            <ActionButton active={action === 'advance'} onClick={() => setAction('advance')} label={t('party.payroll.payAdvance')} />
            <ActionButton active={action === 'reconcile'} onClick={() => setAction('reconcile')} label={t('party.payroll.reconcile')} />
          </div>

          <div className="space-y-3">
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

            {action !== 'reconcile' && (
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
            )}

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

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <div className="flex justify-between"><span>{t('party.employee.salaryBase')}</span><strong>{formatMoney(employee.salary_base)}</strong></div>
              <div className="flex justify-between mt-1"><span>{t('party.fields.balance')}</span><strong>{formatMoney(balance)}</strong></div>
            </div>

            {recent.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  {t('party.payroll.recent')}
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {recent.map((r) => (
                    <div key={r.id} className="flex justify-between items-center gap-2 text-xs p-2 rounded-lg bg-slate-50">
                      <span>{r.date?.slice(0, 10)} • {r.transaction_type}{r.fiche_no ? ` · ${r.fiche_no}` : ''}</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono">{formatMoney(r.amount)}</span>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-white text-emerald-700"
                          title={t('party.statement.printVoucher')}
                          onClick={() => {
                            const kind =
                              r.transaction_type === 'AVANS_ODEME'
                                ? 'advance'
                                : r.transaction_type === 'AVANS_MAHSUP'
                                  ? 'reconcile'
                                  : 'salary';
                            const titles = {
                              salary: t('party.payroll.voucherTitleSalary'),
                              advance: t('party.payroll.voucherTitleAdvance'),
                              reconcile: t('party.payroll.voucherTitleReconcile'),
                            } as const;
                            void printPayrollVoucher({
                              kind,
                              title: titles[kind],
                              employeeName: employee.name,
                              employeeCode: employee.code,
                              amount: r.amount,
                              ficheNo: r.fiche_no,
                              date: r.date,
                              definition: r.definition,
                              balanceLabel: t('party.fields.balance'),
                            }).catch((err: any) => toast.error(err?.message || t('party.statement.printError')));
                          }}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PercentBodyModalScrollBody>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider py-3 hover:bg-slate-100 active:scale-[0.98] transition"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-2xl bg-emerald-600 text-white font-bold uppercase text-sm tracking-wider py-3 shadow-lg shadow-emerald-200/50 hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('common.save')}
          </button>
        </div>
      </form>
    </PercentBodyModal>
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
