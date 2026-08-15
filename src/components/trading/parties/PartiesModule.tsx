import React, { useEffect, useMemo, useState } from 'react';
import { partyAPI } from '../../../services/api/parties';
import { partnerAPI } from '../../../services/api/partiesPartners';
import { employeeAPI } from '../../../services/api/partiesEmployees';
import { PartnerDistributionModal } from './PartnerDistributionModal';
import { EmployeePayrollModal } from './EmployeePayrollModal';
import { PartyEditModal } from './PartyEditModal';
import { PartyMergeModal } from './PartyMergeModal';
import { PartyStatementPanel } from './PartyStatementPanel';
import { toast } from 'sonner';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import { confirm as confirmDialog } from '../../shared/ConfirmDialog';
import {
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  HandCoins,
  Briefcase,
  GitMerge,
  FileText,
} from 'lucide-react';
import type { Party, PartyCardType } from '../../../core/types/models';
import { shortUuid } from './PartyMergeModal';
import { useNestedT } from './useNestedT';

type Tab = 'all' | PartyCardType;

const TABS: { value: Tab; labelKey: string; color: string }[] = [
  { value: 'all', labelKey: 'party.tabs.all', color: 'bg-slate-100 text-slate-700' },
  { value: 'customer', labelKey: 'party.cardType.customer', color: 'bg-blue-100 text-blue-700' },
  { value: 'supplier', labelKey: 'party.cardType.supplier', color: 'bg-amber-100 text-amber-700' },
  { value: 'employee', labelKey: 'party.cardType.employee', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'partner', labelKey: 'party.cardType.partner', color: 'bg-purple-100 text-purple-700' },
];

export function PartiesModule({
  initialTab = 'all',
  embedded = false,
  onSelectionChange,
}: {
  initialTab?: Tab;
  /** Cari Hesaplar üst ekranı sekmeleri gösteriyorsa iç sekme şeridini gizle */
  embedded?: boolean;
  onSelectionChange?: (selected: Party[]) => void;
}) {
  const t = useNestedT();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState<Party[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Party | null>(null);
  const [creating, setCreating] = useState<PartyCardType | null>(null);
  const [payrollEmployee, setPayrollEmployee] = useState<Party | null>(null);
  const [statementParty, setStatementParty] = useState<Party | null>(null);
  const [distributionOpen, setDistributionOpen] = useState(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const filter = tab === 'all' ? {} : { cardType: tab };
      const list = await partyAPI.getAll(filter);
      setItems(list);
    } catch (err: any) {
      toast.error(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTab(initialTab);
    setSelectedIds([]);
  }, [initialTab]);

  useEffect(() => {
    setSelectedIds([]);
    load();
  }, [tab]);

  useEffect(() => {
    if (tab === 'partner') {
      partnerAPI.validateSharePctSum().then((res) => {
        if (!res.ok && res.warnings.length) {
          setValidationWarning(res.warnings.join(' '));
        } else {
          setValidationWarning(null);
        }
      }).catch(() => {});
    } else {
      setValidationWarning(null);
    }
  }, [tab, items]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((p) =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q) ||
      (p.id || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  const handleDelete = async (p: Party) => {
    const ok = await confirmDialog({
      title: t('party.confirmDeleteTitle'),
      description: `${p.name} silinsin mi?`,
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await partyAPI.remove(p.id);
      toast.success(t('party.deleteSuccess'));
      load();
    } catch (err: any) {
      toast.error(err?.message || String(err));
    }
  };

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error('Kopyalanamadı');
    }
  };

  const counters = useMemo(() => {
    const c = { all: 0, customer: 0, supplier: 0, employee: 0, partner: 0 };
    for (const p of items) {
      c.all += 1;
      if (p.card_type in c) c[p.card_type as keyof typeof c] += 1;
    }
    return c;
  }, [items]);

  const selectedParties = useMemo(
    () => filtered.filter((p) => selectedIds.includes(p.id)),
    [filtered, selectedIds]
  );

  useEffect(() => {
    onSelectionChange?.(selectedParties);
  }, [selectedParties, onSelectionChange]);

  const toggleSelected = (p: Party) => {
    setSelectedIds((prev) => {
      if (prev.includes(p.id)) return prev.filter((id) => id !== p.id);
      if (prev.length >= 2) {
        toast.error('Birleştirme için en fazla 2 cari işaretleyin');
        return prev;
      }
      return [...prev, p.id];
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedIds.includes(p.id));
  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds([]);
      return;
    }
    const next = filtered.slice(0, 2).map((p) => p.id);
    if (filtered.length > 2) {
      toast.error('Birleştirme için en fazla 2 cari işaretleyin');
    }
    setSelectedIds(next);
  };

  const openMerge = () => {
    setMergeOpen(true);
  };

  return (
    <div className={`flex flex-col h-full min-h-0 gap-3 ${embedded ? '' : 'p-4'}`}>
      {!embedded && (
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((tt) => (
          <button
            key={tt.value}
            type="button"
            onClick={() => setTab(tt.value)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold uppercase tracking-wider transition border-2 ${
              tab === tt.value
                ? `${tt.color} border-transparent shadow-md`
                : 'border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            {t(tt.labelKey)} ({counters[tt.value as keyof typeof counters] || 0})
          </button>
        ))}
      </div>
      )}

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('party.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {!embedded && (
          <button
            type="button"
            onClick={openMerge}
            className="px-4 py-2.5 rounded-2xl bg-rose-100 text-rose-800 text-xs font-bold uppercase tracking-wider hover:bg-rose-200 active:scale-[0.98] flex items-center gap-2 border border-rose-200"
            title={t('party.merge.openButton') || 'İki cariyi birleştir'}
          >
            <GitMerge className="w-4 h-4" />
            {t('party.merge.openButton') || 'Birleştir'}
          </button>
          )}
          {tab === 'partner' && (
            <button
              type="button"
              onClick={() => setDistributionOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-purple-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-purple-700 active:scale-[0.98] flex items-center gap-2"
            >
              <HandCoins className="w-4 h-4" />
              {t('party.distribution.openDistribution')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreating(tab === 'all' ? 'customer' : tab)}
            className="px-4 py-2.5 rounded-2xl bg-blue-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-blue-700 active:scale-[0.98] flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('party.newButton')}
          </button>
        </div>
      </div>

      {validationWarning && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-2">
          <span>⚠️</span>
          <span>{validationWarning}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <Users className="w-10 h-10" />
            <p>{t('party.empty')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    title="İki cari işaretle"
                    aria-label="Seç"
                  />
                </th>
                <th className="text-left px-4 py-3">{t('party.table.code')}</th>
                <th className="text-left px-4 py-3">{t('party.table.id') || 'ID'}</th>
                <th className="text-left px-4 py-3">{t('party.table.name')}</th>
                <th className="text-left px-4 py-3">{t('party.table.type')}</th>
                <th className="text-left px-4 py-3">{t('party.table.phone')}</th>
                <th className="text-right px-4 py-3">{t('party.table.balance')}</th>
                <th className="text-left px-4 py-3">{t('party.table.share')}</th>
                <th className="text-right px-4 py-3">{t('party.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggleSelected(p)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      aria-label={p.name}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{p.code || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleCopyId(p.id)}
                      title={t('party.table.idCopyHint') || 'ID kopyala'}
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 hover:text-blue-600"
                    >
                      <span>{shortUuid(p.id)}</span>
                      <Copy className={`w-3 h-3 ${copiedId === p.id ? 'text-emerald-600' : ''}`} />
                    </button>
                    {p.merged_into_id && (
                      <span
                        className="ml-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-700"
                        title={t('party.table.archivedHint') || 'Arşivlenmiş (birleştirildi)'}
                      >
                        {t('party.table.archived') || 'ARŞİV'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${typeColor(p.card_type)}`}>
                      {t(`party.cardType.${p.card_type}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.phone || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <div>{formatMoney(p.balance)}</div>
                    {p.card_type === 'employee' && Number(p.balance) > 0 ? (
                      <div className="text-[9px] font-bold uppercase text-emerald-700">{t('party.employee.balanceLabel')}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.card_type === 'partner' ? `${Number(p.share_pct || 0).toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      {p.card_type === 'employee' && (
                        <button
                          type="button"
                          onClick={() => setPayrollEmployee(p)}
                          className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600"
                          title={t('party.payroll.openPayroll')}
                        >
                          <Briefcase className="w-4 h-4" />
                        </button>
                      )}
                      {(p.card_type === 'employee' || p.card_type === 'partner') && (
                        <button
                          type="button"
                          onClick={() => setStatementParty(p)}
                          className="p-2 rounded-lg hover:bg-indigo-50 text-indigo-600"
                          title={t('party.payroll.openStatement')}
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"
                        title={t('common.edit')}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p)}
                        className="p-2 rounded-lg hover:bg-rose-50 text-rose-600"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(editing || creating) && (
        <PartyEditModal
          initial={editing}
          defaultCardType={creating || undefined}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(null);
            load();
            toast.success(t('party.saveSuccess'));
          }}
        />
      )}

      {payrollEmployee && (
        <EmployeePayrollModal
          employee={payrollEmployee}
          onClose={() => setPayrollEmployee(null)}
          onSaved={() => {
            load();
          }}
          onOpenStatement={() => {
            setStatementParty(payrollEmployee);
          }}
        />
      )}

      {statementParty && (
        <PartyStatementPanel
          party={statementParty}
          onClose={() => setStatementParty(null)}
        />
      )}

      {distributionOpen && (
        <PartnerDistributionModal
          onClose={() => setDistributionOpen(false)}
          onSaved={() => {
            setDistributionOpen(false);
            load();
          }}
        />
      )}

      {mergeOpen && (
        <PartyMergeModal
          initialSource={selectedParties[0] || null}
          initialTarget={selectedParties[1] || null}
          onClose={() => setMergeOpen(false)}
          onSaved={() => {
            setMergeOpen(false);
            setSelectedIds([]);
            load();
          }}
        />
      )}
    </div>
  );
}

function formatMoney(n?: number | string | null): string {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(num);
}

function typeColor(ct: PartyCardType | string | null | undefined): string {
  switch (ct) {
    case 'customer': return 'bg-blue-100 text-blue-700';
    case 'supplier': return 'bg-amber-100 text-amber-700';
    case 'employee': return 'bg-emerald-100 text-emerald-700';
    case 'partner': return 'bg-purple-100 text-purple-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}
