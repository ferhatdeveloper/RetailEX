import { useMemo, useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../shared/PercentBodyModal';
import { formatNumber } from '../../utils/formatNumber';
import { splitAmountByPartners, type PeriodPartnerShareSlice } from '../../utils/periodSummaryPartnerSplit';
import type { Supplier } from '../../core/types/models';
import { useLanguage } from '../../contexts/LanguageContext';
import { ReportColumnTable, type ReportColumnTableCol } from './shared/ReportDataGrid';

type Props = {
  suppliers: Supplier[];
  partners: PeriodPartnerShareSlice[];
  currency: string;
  onClose: () => void;
};

export function PeriodSupplierPayablesDetailModal({
  suppliers,
  partners,
  currency,
  onClose,
}: Props) {
  const { tm } = useLanguage();
  const [search, setSearch] = useState('');
  const [debtOnly, setDebtOnly] = useState(true);
  const [partnerId, setPartnerId] = useState('');

  const visiblePartners = useMemo(
    () => (partnerId ? partners.filter((p) => p.id === partnerId) : partners),
    [partners, partnerId],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return suppliers
      .filter((s) => {
        const bal = Number(s.balance) || 0;
        if (debtOnly && !(bal > 0)) return false;
        if (!q) return true;
        const blob = `${s.name || ''} ${s.code || ''} ${s.phone || ''}`.toLocaleLowerCase('tr-TR');
        return blob.includes(q);
      })
      .sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0));
  }, [suppliers, search, debtOnly]);

  const money = (v: number) => `${formatNumber(v, 0, false)} ${currency}`;

  type SupplierGridRow = Supplier & { balanceNum: number; payable: number; [key: string]: unknown };

  const gridRows = useMemo((): SupplierGridRow[] => {
    return rows.map((s) => {
      const bal = Number(s.balance) || 0;
      const payable = Math.max(bal, 0);
      const shares = splitAmountByPartners(payable, visiblePartners.length ? visiblePartners : partners);
      const partnerFields: Record<string, number> = {};
      for (const p of visiblePartners) {
        partnerFields[`share_${p.id}`] = shares.find((sh) => sh.id === p.id)?.amount ?? 0;
      }
      return {
        ...s,
        balanceNum: bal,
        payable,
        ...partnerFields,
      };
    });
  }, [rows, visiblePartners, partners]);

  const tableColumns = useMemo((): ReportColumnTableCol<SupplierGridRow>[] => {
    const cols: ReportColumnTableCol<SupplierGridRow>[] = [
      {
        key: 'code',
        header: tm('code'),
        size: 100,
        cell: (s) => <span className="font-mono text-xs">{s.code || '—'}</span>,
      },
      { key: 'name', header: tm('rptPeriodColAccountName'), size: 180 },
      { key: 'phone', header: tm('phoneLabel'), size: 120 },
      {
        key: 'balanceNum',
        header: `${tm('rptPeriodSupplierOpenDebt')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => <span className="font-bold text-blue-900">{money(n)}</span>,
        cell: (s) => (
          <span
            className={`font-mono font-semibold ${
              s.balanceNum > 0 ? 'text-amber-700' : s.balanceNum < 0 ? 'text-emerald-700' : 'text-slate-400'
            }`}
          >
            {money(s.balanceNum)}
          </span>
        ),
      },
    ];
    for (const p of visiblePartners) {
      cols.push({
        key: `share_${p.id}`,
        header: `${p.name} (%${p.sharePct})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => <span className="font-bold text-blue-900">{money(n)}</span>,
        cell: (s) => (
          <span className="font-mono text-amber-800">
            {s.payable ? money(Number(s[`share_${p.id}`]) || 0) : ''}
          </span>
        ),
      });
    }
    return cols;
  }, [visiblePartners, tm, currency, money]);

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('rptPeriodSupplierDetailTitle')}>
      <div className="flex min-h-0 h-full flex-col">
        <div className="shrink-0 bg-gradient-to-r from-amber-600 to-orange-700 px-5 py-3 text-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-100">
              {tm('rptPeriodSupplierDetailKicker')}
            </p>
            <h2 className="truncate text-lg font-bold">{tm('rptPeriodSupplierDetailTitle')}</h2>
            <p className="text-xs text-amber-100 mt-0.5">{tm('rptPeriodSupplierDetailHint')}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-white/10" aria-label={tm('close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tm('rptPeriodSupplierFilterSearch')}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm"
            />
          </label>
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">{tm('rptPeriodFilterAllPartners')}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (%{p.sharePct})
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={debtOnly}
              onChange={(e) => setDebtOnly(e.target.checked)}
              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            {tm('rptPeriodSupplierDebtOnly')}
          </label>
        </div>

        <PercentBodyModalScrollBody>
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">{tm('noRecordFound')}</div>
          ) : (
            <ReportColumnTable
              data={gridRows}
              columns={tableColumns}
              height={420}
              footerLabel={
                <>
                  {tm('invoiceListDipTotal')}
                  <span className="ml-1 font-semibold text-blue-600/80">({rows.length})</span>
                </>
              }
              storageNamespace="period-supplier-payables-detail"
            />
          )}
        </PercentBodyModalScrollBody>

        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500 flex items-center gap-2">
          <Filter className="h-3.5 w-3.5" />
          {tm('rptPeriodSupplierDetailHint')}
        </div>
      </div>
    </PercentBodyModal>
  );
}
