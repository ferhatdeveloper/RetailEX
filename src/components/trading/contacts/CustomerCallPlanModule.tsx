import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Edit, Phone, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { supplierAPI, type Supplier } from '../../../services/api/suppliers';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  CUSTOMER_CALL_WEEKDAYS,
  CUSTOMER_CALL_STATUSES,
  customerCallStatusMeta,
  customerCallWeekdaysLabel,
  normalizeCustomerCallStatus,
  normalizeCustomerCallWeekdays,
} from '../../../utils/customerCallPlan';

type DayFilter = 'all' | number;

export function CustomerCallPlanModule() {
  const { tm } = useLanguage();
  const [customers, setCustomers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dayFilter, setDayFilter] = useState<DayFilter>('all');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [planNote, setPlanNote] = useState('');
  const [lastStatus, setLastStatus] = useState('planned');
  const [lastNote, setLastNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await supplierAPI.getAll({ cardType: 'customer' });
      setCustomers(rows.filter(row =>
        row.call_plan_enabled === true &&
        normalizeCustomerCallWeekdays(row.call_plan_weekdays).length > 0
      ));
    } catch (error: any) {
      toast.error(error?.message || tm('callPlanLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return customers.filter(customer => {
      const days = normalizeCustomerCallWeekdays(customer.call_plan_weekdays);
      if (dayFilter !== 'all' && !days.includes(dayFilter as any)) return false;
      if (!q) return true;
      return (
        String(customer.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(customer.code || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(customer.phone || '').includes(search.trim()) ||
        String(customer.email || '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [customers, dayFilter, search]);

  const openEdit = (customer: Supplier) => {
    setEditing(customer);
    setSelectedDays(normalizeCustomerCallWeekdays(customer.call_plan_weekdays));
    setPlanNote(String(customer.call_plan_note ?? ''));
    setLastStatus(normalizeCustomerCallStatus(customer.call_last_status));
    setLastNote(String(customer.call_last_note ?? ''));
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day)
        ? prev.filter(v => v !== day)
        : [...prev, day].sort((a, b) => a - b)
    );
  };

  const savePlan = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const nextDays = normalizeCustomerCallWeekdays(selectedDays);
      await supplierAPI.update(editing.id, {
        ...editing,
        cardType: 'customer',
        call_plan_enabled: nextDays.length > 0,
        call_plan_weekdays: nextDays,
        call_plan_note: planNote.trim() || null,
        call_last_status: normalizeCustomerCallStatus(lastStatus),
        call_last_note: lastNote.trim() || null,
        call_last_at: new Date().toISOString(),
      });
      toast.success(tm('callPlanUpdated'));
      setEditing(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || tm('callPlanSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const columnHelper = createColumnHelper<Supplier>();
  const columns = [
    columnHelper.accessor('code', {
      header: tm('code'),
      cell: info => <span className="font-mono text-xs font-bold text-blue-700">{info.getValue() || '-'}</span>,
      size: 90,
    }),
    columnHelper.accessor('name', {
      header: tm('customer'),
      cell: info => <span className="font-semibold text-slate-900">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'contact',
      header: tm('contact'),
      cell: ({ row }) => (
        <div className="flex flex-col gap-1 text-xs text-slate-600">
          {row.original.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{row.original.phone}</span> : '-'}
          {row.original.email ? <span>{row.original.email}</span> : null}
        </div>
      ),
      size: 160,
    }),
    columnHelper.display({
      id: 'days',
      header: tm('callPlanSelectDays'),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
          <CalendarClock className="h-3.5 w-3.5" />
          {customerCallWeekdaysLabel(row.original.call_plan_weekdays, true)}
        </span>
      ),
      size: 180,
    }),
    columnHelper.display({
      id: 'note',
      header: tm('callPlanNote'),
      cell: ({ row }) => (
        row.original.call_plan_note ? (
          <span className="block max-w-[220px] truncate text-xs font-semibold text-slate-600" title={row.original.call_plan_note}>
            {row.original.call_plan_note}
          </span>
        ) : <span className="text-xs text-slate-400">—</span>
      ),
      size: 220,
    }),
    columnHelper.display({
      id: 'lastStatus',
      header: tm('callPlanLastStatus'),
      cell: ({ row }) => {
        const meta = customerCallStatusMeta(row.original.call_last_status);
        return (
          <div className="flex flex-col gap-1">
            <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${meta.tone}`}>
              {tm(meta.label)}
            </span>
            {row.original.call_last_at ? (
              <span className="text-[10px] font-semibold text-slate-400">
                {new Date(row.original.call_last_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
            {row.original.call_last_note ? (
              <span className="max-w-[180px] truncate text-[10px] text-slate-500" title={row.original.call_last_note}>
                {row.original.call_last_note}
              </span>
            ) : null}
          </div>
        );
      },
      size: 170,
    }),
    columnHelper.display({
      id: 'actions',
      header: tm('actions'),
      cell: ({ row }) => (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            openEdit(row.original);
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100"
        >
          <Edit className="h-3.5 w-3.5" />
          {tm('edit')}
        </button>
      ),
      size: 100,
    }),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="border-b border-amber-200 bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-6 w-6" />
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight">{tm('customerCallListTitle')}</h2>
              <p className="text-xs font-semibold text-amber-100">{tm('customerCallListSubtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-xs font-bold hover:bg-white/25"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {tm('refreshData')}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDayFilter('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-black ${dayFilter === 'all' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {tm('all')}
            </button>
            {CUSTOMER_CALL_WEEKDAYS.map(day => (
              <button
                key={day.value}
                type="button"
                onClick={() => setDayFilter(day.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-black ${dayFilter === day.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {day.tr}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tm('callPlanSearchPlaceholder')}
              className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <DevExDataGrid
            data={filtered}
            columns={columns}
            enableSorting
            enableFiltering={false}
            enableColumnResizing
            pageSize={50}
          />
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-amber-50 px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-amber-700">{tm('callPlanEditTitle')}</p>
                <h3 className="text-lg font-black text-slate-900">{editing.name}</h3>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg p-2 hover:bg-amber-100">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="p-5">
              <p className="mb-3 text-sm font-semibold text-slate-600">{tm('callPlanSelectDays')}</p>
              <div className="flex flex-wrap gap-2">
                {CUSTOMER_CALL_WEEKDAYS.map(day => {
                  const selected = selectedDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleDay(day.value)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-black transition-all ${
                        selected
                          ? 'border-blue-600 bg-blue-600 text-white shadow-md ring-2 ring-blue-200'
                          : 'border-amber-200 bg-white text-amber-700 hover:bg-amber-100'
                      }`}
                    >
                      {selected ? `✓ ${day.tr}` : day.tr}
                    </button>
                  );
                })}
              </div>
              {selectedDays.length > 0 ? (
                <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                  {tm('callPlanSelectedDays').replace('{days}', customerCallWeekdaysLabel(selectedDays))}
                </p>
              ) : (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                  {tm('callPlanNoDaysHint')}
                </p>
              )}
              <div className="mt-4">
                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">{tm('callPlanNote')}</label>
                <textarea
                  value={planNote}
                  onChange={e => setPlanNote(e.target.value)}
                  rows={2}
                  placeholder={tm('callPlanNote')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">{tm('callPlanLastStatus')}</label>
                  <select
                    value={lastStatus}
                    onChange={e => setLastStatus(normalizeCustomerCallStatus(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CUSTOMER_CALL_STATUSES.map(status => (
                      <option key={status.value} value={status.value}>{tm(status.label)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">{tm('callPlanLastStatusNote')}</label>
                  <input
                    value={lastNote}
                    onChange={e => setLastNote(e.target.value)}
                    placeholder={tm('callPlanLastStatusNote')}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
                {tm('cancel')}
              </button>
              <button type="button" onClick={() => void savePlan()} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? tm('saving') : tm('save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
