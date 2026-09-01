import React, { useEffect, useMemo, useState } from 'react';
import { useNestedT } from './useNestedT';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import { partnerAPI } from '../../../services/api/partiesPartners';
import { fetchKasalar, type Kasa } from '../../../services/api/kasa';
import { ficheTypeToInfo } from '../../../utils/cariAccountStatement';
import { ChevronDown, FileText, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { Party, PartyLedgerMovement } from '../../../core/types/models';
import { PartyLedgerDipFooter } from './PartyLedgerDipFooter';

export interface PartnerCashModalProps {
  partner: Party;
  onClose: () => void;
  onSaved: () => void;
  onOpenStatement?: () => void;
}

type Action = 'in' | 'out';
type ViewTab = 'form' | 'movements';

type MovementRow = PartyLedgerMovement & {
  debit: number;
  credit: number;
  balance_after: number;
};

export function PartnerCashModal({ partner, onClose, onSaved, onOpenStatement }: PartnerCashModalProps) {
  const t = useNestedT();
  const { tm } = useLanguage();
  const [viewTab, setViewTab] = useState<ViewTab>('movements');
  const [action, setAction] = useState<Action>('in');
  const [amount, setAmount] = useState('');
  const [registerId, setRegisterId] = useState('');
  const [definition, setDefinition] = useState('');
  const [registers, setRegisters] = useState<Kasa[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<PartyLedgerMovement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(partner.balance || 0);
  const [mvSearch, setMvSearch] = useState('');
  const [mvKind, setMvKind] = useState<'all' | 'share' | 'cash'>('all');
  const [mvFrom, setMvFrom] = useState('');
  const [mvTo, setMvTo] = useState('');

  const refreshCard = async () => {
    try {
      const fresh = await partnerAPI.getById(partner.id);
      if (fresh) setBalance(fresh.balance || 0);
    } catch {
      /* liste yine yüklenecek */
    }
  };

  const loadRecent = async () => {
    try {
      await partnerAPI.syncBalancesFromYearNet();
      const list = await partnerAPI.getLedger(partner.id, { limit: 500 });
      setRecent(list);
    } catch {
      setRecent([]);
    }
  };

  useEffect(() => {
    fetchKasalar({ aktif: true }).then((list) => {
      setRegisters(list);
      if (list.length) setRegisterId((prev) => prev || list[0].id);
    }).catch(() => setRegisters([]));
    void (async () => {
      await refreshCard();
      await loadRecent();
    })();
  }, [partner.id]);

  const allRows = useMemo(() => withRunning(recent), [recent]);
  const rows = useMemo(() => {
    const q = mvSearch.trim().toLocaleLowerCase('tr-TR');
    return allRows.filter((r) => {
      const kind = partnerMovementKind(r.transaction_type);
      if (mvKind === 'share' && kind !== 'share') return false;
      if (mvKind === 'cash' && kind !== 'cash') return false;
      const day = String(r.date || '').slice(0, 10);
      if (mvFrom && day && day < mvFrom) return false;
      if (mvTo && day && day > mvTo) return false;
      if (!q) return true;
      const blob = `${r.definition || ''} ${r.transaction_type || ''} ${r.fiche_no || ''}`.toLocaleLowerCase('tr-TR');
      return blob.includes(q);
    });
  }, [allRows, mvSearch, mvKind, mvFrom, mvTo]);
  const dip = useMemo(() => {
    const debit = rows.reduce((s, r) => s + (r.debit || 0), 0);
    const credit = rows.reduce((s, r) => s + (r.credit || 0), 0);
    const last = rows.length ? rows[rows.length - 1].balance_after : 0;
    return { debit, credit, last };
  }, [rows]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError(t('party.partnerCash.amountPositive'));
      return;
    }
    if (!registerId) {
      setError(t('party.partnerCash.registerRequired'));
      return;
    }
    setLoading(true);
    try {
      const result = action === 'in'
        ? await partnerAPI.cashIn({
            partnerId: partner.id,
            amount: amt,
            registerId,
            definition: definition || undefined,
          })
        : await partnerAPI.cashOut({
            partnerId: partner.id,
            amount: amt,
            registerId,
            definition: definition || undefined,
          });
      setBalance(result.balance);
      toast.success(t('party.partnerCash.saveSuccess'));
      await loadRecent();
      setViewTab('movements');
      setAmount('');
      setDefinition('');
      onSaved();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={t('party.partnerCash.title')}>
      <div className="flex flex-col min-h-0 h-full">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 text-white shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{t('party.partnerCash.title')}</h2>
            <p className="text-purple-100 text-sm mt-0.5">{partner.name}</p>
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
            label={t('party.partnerCash.tabForm')}
          />
          <ViewTabButton
            active={viewTab === 'movements'}
            onClick={() => setViewTab('movements')}
            label={t('party.partnerCash.movements')}
          />
        </div>

        {viewTab === 'form' && (
        <form onSubmit={submit} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
            <div className="flex gap-2">
              <ActionButton active={action === 'in'} onClick={() => setAction('in')} label={t('party.partnerCash.cashIn')} />
              <ActionButton active={action === 'out'} onClick={() => setAction('out')} label={t('party.partnerCash.cashOut')} />
            </div>

            <p className="text-xs text-slate-500">
              {action === 'in' ? t('party.partnerCash.cashInHint') : t('party.partnerCash.cashOutHint')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {t('party.partnerCash.amount')}
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={0}
                  step="0.01"
                  className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-400 outline-none text-slate-800 font-medium"
                />
              </div>

              <div className="relative">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {t('party.partnerCash.register')}
                </label>
                <select
                  value={registerId}
                  onChange={(e) => setRegisterId(e.target.value)}
                  className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-400 outline-none text-slate-800 font-medium appearance-none bg-white"
                >
                  <option value="">{t('party.partnerCash.chooseRegister')}</option>
                  {registers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.kasa_adi} ({r.kasa_kodu})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-[42px] -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('party.partnerCash.note')}
              </label>
              <input
                type="text"
                value={definition}
                onChange={(e) => setDefinition(e.target.value)}
                placeholder={t('party.partnerCash.notePlaceholder')}
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-purple-400 outline-none text-slate-800 font-medium"
              />
            </div>

            {error && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                {error}
              </div>
            )}

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <div className="flex justify-between gap-2">
                <span>{t('party.fields.balance')}</span>
                <strong className={balance > 0 ? 'text-emerald-700' : balance < 0 ? 'text-amber-700' : ''}>
                  {formatMoney(balance)}
                  {balance > 0 ? ` · ${t('party.partner.balanceLabel')}` : balance < 0 ? ` · ${t('party.partner.balanceLabelNegative')}` : ''}
                </strong>
              </div>
              <p className="mt-2 text-slate-500">
                {t('party.partnerCash.shareHint')} {Number(partner.share_pct || 0).toFixed(2)}%
              </p>
            </div>

            <div className="flex gap-3">
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
                className="flex-1 rounded-2xl bg-purple-600 text-white font-bold uppercase text-sm tracking-wider py-3 shadow-lg shadow-purple-200/50 hover:bg-purple-700 disabled:opacity-50 active:scale-[0.98] transition flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {action === 'in' ? t('party.partnerCash.cashIn') : t('party.partnerCash.cashOut')}
              </button>
            </div>
          </form>
        )}

        {viewTab === 'movements' && (
          <div className="min-h-0 flex-1 flex flex-col p-5">
            <div className="min-h-0 flex-1 flex flex-col border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <div className="shrink-0 px-4 py-2 border-b border-slate-100 flex flex-col gap-2 bg-slate-50">
              <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {t('party.partnerCash.movements')}
                <span className="ml-2 font-mono text-slate-700">
                  {formatMoney(balance)}
                  {balance > 0 ? ` · ${t('party.partner.balanceLabel')}` : balance < 0 ? ` · ${t('party.partner.balanceLabelNegative')}` : ''}
                </span>
              </div>
              {onOpenStatement && (
                <button
                  type="button"
                  onClick={onOpenStatement}
                  className="text-[11px] font-bold uppercase tracking-wider text-purple-700 hover:underline"
                >
                  {t('party.payroll.openStatement')}
                </button>
              )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <label className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={mvSearch}
                    onChange={(e) => setMvSearch(e.target.value)}
                    placeholder={tm('rptPeriodFilterSearch')}
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs"
                  />
                </label>
                <select
                  value={mvKind}
                  onChange={(e) => setMvKind(e.target.value as 'all' | 'share' | 'cash')}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                >
                  <option value="all">{tm('rptPeriodMovementsFilterAll')}</option>
                  <option value="share">{tm('rptPeriodMovementsFilterShare')}</option>
                  <option value="cash">{tm('rptPeriodMovementsFilterCash')}</option>
                </select>
                <input
                  type="date"
                  value={mvFrom}
                  onChange={(e) => setMvFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                />
                <input
                  type="date"
                  value={mvTo}
                  onChange={(e) => setMvTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                />
              </div>
            </div>
            {allRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">{t('party.partnerCash.statementEmpty')}</div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">{tm('noRecordFound')}</div>
            ) : (
              <PercentBodyModalScrollBody>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-[1] bg-slate-100 text-slate-600 text-[11px] font-black uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-3 py-2">{tm('dateLabel')}</th>
                      <th className="text-left px-3 py-2">{tm('ficheNo')}</th>
                      <th className="text-left px-3 py-2">{t('party.table.type')}</th>
                      <th className="text-left px-3 py-2">{t('party.partnerCash.note')}</th>
                      <th className="text-right px-3 py-2">{tm('debtor')}</th>
                      <th className="text-right px-3 py-2">{tm('creditor')}</th>
                      <th className="text-right px-3 py-2">{t('party.table.balance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const { label, color } = ficheTypeToInfo(r.transaction_type, 0, false, tm);
                      return (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.fiche_no || '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{label}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-[12rem] truncate" title={r.definition}>{r.definition || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono">{r.debit ? formatMoney(r.debit) : ''}</td>
                          <td className="px-3 py-2 text-right font-mono">{r.credit ? formatMoney(r.credit) : ''}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold">{formatMoney(r.balance_after)}</td>
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
              </PercentBodyModalScrollBody>
            )}
            </div>
          </div>
        )}
      </div>
    </PercentBodyModal>
  );
}

function partnerMovementKind(type: string): 'share' | 'cash' | 'other' {
  const u = String(type || '').toUpperCase();
  if (
    u.includes('KAR_DAGITIM') ||
    u.includes('ZARAR_DAGITIM') ||
    u.includes('DAGITIM_KAR') ||
    u.includes('DAGITIM_ZARAR')
  ) {
    return 'share';
  }
  if (u.includes('SERMAYE') || u.includes('PARA_GIRIS') || u.includes('PARA_CIKIS')) return 'cash';
  return 'other';
}

function withRunning(rows: PartyLedgerMovement[]): MovementRow[] {
  const sorted = [...rows].sort((a, b) => {
    const da = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (da !== 0) return da;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  let running = 0;
  return sorted.map((r) => {
    const abs = Math.abs(Number(r.amount) || 0);
    const debit = Number(r.sign) > 0 ? abs : 0;
    const credit = Number(r.sign) < 0 ? abs : 0;
    running += debit - credit;
    return { ...r, debit, credit, balance_after: running };
  });
}

function ViewTabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 rounded-t-xl text-xs font-bold uppercase tracking-wider border-b-2 -mb-px ${
        active
          ? 'border-purple-600 text-purple-700 bg-purple-50'
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
          ? 'bg-purple-600 text-white border-transparent shadow-md'
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

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('tr-TR');
}
