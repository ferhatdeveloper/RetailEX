/**
 * Üretim Emir Listesi — sol istatistik + sağ tablo
 * Genel (production_orders) + Kasap (butcher_orders) birlikte gösterilir.
 */

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Play,
  Plus,
  Receipt,
  Search,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';

import { unifiedProductionAPI } from '@/services/production/unifiedProductionAPI';
import type {
  ProductionOrder,
  ButcherOrder,
  ProductionMode,
} from '@/services/production/types';

type AnyOrder =
  | { kind: 'general'; data: ProductionOrder }
  | { kind: 'butcher'; data: ButcherOrder };

type Status = 'draft' | 'in_progress' | 'open' | 'completed' | 'cancelled';

type Props = {
  general: ProductionOrder[];
  butcher: ButcherOrder[];
  loading?: boolean;
  onCreate: (kind: ProductionMode) => void;
  onComplete: (order: AnyOrder) => void;
  onViewInvoice?: (order: AnyOrder) => void;
  onRefresh: () => void;
};

export function OrderList({
  general,
  butcher,
  loading,
  onCreate,
  onComplete,
  onViewInvoice,
  onRefresh,
}: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');

  const merged = useMemo<AnyOrder[]>(() => {
    const g: AnyOrder[] = general.map((o) => ({ kind: 'general', data: o }));
    const b: AnyOrder[] = butcher.map((o) => ({ kind: 'butcher', data: o }));
    return [...g, ...b].sort((a, b) => {
      const ad = a.kind === 'general' ? a.data.createdAt : a.data.createdAt;
      const bd = b.kind === 'general' ? b.data.createdAt : b.data.createdAt;
      return (bd || '').localeCompare(ad || '');
    });
  }, [general, butcher]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return merged.filter((o) => {
      if (statusFilter !== 'all' && orderStatus(o) !== statusFilter) return false;
      if (!q) return true;
      const text = `${o.data.orderNo} ${orderProductName(o)} ${orderRecipeName(o)}`.toLocaleLowerCase('tr-TR');
      return text.includes(q);
    });
  }, [merged, search, statusFilter]);

  const stats = useMemo(() => computeStats(merged), [merged]);

  const handleStart = async (order: AnyOrder) => {
    try {
      if (order.kind === 'general') {
        await unifiedProductionAPI.production.saveOrder({
          id: order.data.id,
          status: 'in_progress',
        });
        toast.success('Üretim emri başlatıldı');
      } else {
        await unifiedProductionAPI.butcher.saveOrder({
          recipeId: order.data.recipeId ?? null,
          animalType: order.data.animalType,
          inputProductId: order.data.inputProductId,
          inputQtyKg: order.data.inputQtyKg,
          inputUnitCost: order.data.inputUnitCost,
          inputTotalCost: order.data.inputTotalCost,
          warehouseId: order.data.warehouseId ?? null,
          wasteProductId: order.data.wasteProductId ?? null,
          lotNo: order.data.lotNo ?? null,
          costMethod: order.data.costMethod,
          outputQtyKg: order.data.outputQtyKg,
          wasteQtyKg: order.data.wasteQtyKg,
          wastePercent: order.data.wastePercent,
          wasteCostAllocated: order.data.wasteCostAllocated,
          costPerKgSalable: order.data.costPerKgSalable,
          status: 'open',
          note: order.data.note,
          orderNo: order.data.orderNo,
          id: order.data.id,
          outputs: order.data.outputs,
        });
        toast.success('Üretim fişi açıldı');
      }
      onRefresh();
    } catch (e) {
      toast.error('Başlatılamadı');
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-5 h-full">
      <div className="space-y-3 md:col-span-1">
        <StatCard
          label="Taslak"
          value={stats.draft}
          icon={<Clock className="w-4 h-4" />}
          accent="slate"
        />
        <StatCard
          label="Üretimde"
          value={stats.in_progress}
          icon={<Play className="w-4 h-4" />}
          accent="blue"
        />
        <StatCard
          label="Tamamlandı"
          value={stats.completed}
          icon={<CheckCircle2 className="w-4 h-4" />}
          accent="green"
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
          <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Yeni Üretim
          </h5>
          <Button
            onClick={() => onCreate('general')}
            className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase text-xs tracking-wider"
          >
            <Plus className="w-4 h-4 mr-2" /> Genel Üretim
          </Button>
          <Button
            onClick={() => onCreate('butcher')}
            variant="outline"
            className="w-full h-11 rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50 font-bold uppercase text-xs tracking-wider"
          >
            <Plus className="w-4 h-4 mr-2" /> Kasap Üretim
          </Button>
        </div>
      </div>

      <div className="md:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap justify-between items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-700">Aktif İş Emirleri</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
              {(['all', 'draft', 'in_progress', 'completed'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'px-2.5 h-7 text-[11px] font-semibold rounded-md transition-colors',
                    statusFilter === s
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {s === 'all' ? 'Tümü' : statusLabel(s)}
                </button>
              ))}
            </div>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Emir ara..."
                className="pl-9 h-8 text-xs bg-white"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-semibold tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">Emir No</th>
                <th className="px-4 py-3">Reçete / Mamul</th>
                <th className="px-4 py-3 text-center w-24">Planlanan</th>
                <th className="px-4 py-3 text-center w-24">Üretilen</th>
                <th className="px-4 py-3 w-28">Durum</th>
                <th className="px-4 py-3 text-right w-40">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((order) => (
                <OrderRow
                  key={`${order.kind}-${order.data.id}`}
                  order={order}
                  onComplete={() => onComplete(order)}
                  onStart={() => handleStart(order)}
                  onViewInvoice={onViewInvoice ? () => onViewInvoice(order) : undefined}
                />
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 italic text-xs">
                    Üretim emri bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OrderRow({
  order,
  onComplete,
  onStart,
  onViewInvoice,
}: {
  order: AnyOrder;
  onComplete: () => void;
  onStart: () => void;
  onViewInvoice?: () => void;
}) {
  const status = orderStatus(order) as Status | 'open';
  const kindBadge = order.kind === 'general'
    ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-100 text-blue-700">Genel</span>
    : <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800">Kasap</span>;

  const hasInvoice = Boolean(order.data.purchaseInvoiceId);

  return (
    <tr className="hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
        <div className="flex items-center gap-1.5">
          {order.data.orderNo}
          {kindBadge}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-xs font-semibold text-slate-900">{orderProductName(order)}</div>
        <div className="text-[10px] text-slate-500 uppercase">
          {order.kind === 'general'
            ? order.data.recipeName || '—'
            : `${(order.data as ButcherOrder).animalType} · ${orderRecipeName(order) || '—'}`}
        </div>
      </td>
      <td className="px-4 py-3 text-center text-xs font-medium">
        {order.kind === 'general'
          ? order.data.plannedQty
          : `${(order.data as ButcherOrder).inputQtyKg} kg`}
      </td>
      <td className="px-4 py-3 text-center text-xs">
        {status === 'completed'
          ? order.kind === 'general'
            ? order.data.producedQty
            : `${(order.data as ButcherOrder).outputQtyKg} kg`
          : '—'}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-medium',
            status === 'completed'
              ? 'bg-green-100 text-green-700'
              : status === 'in_progress' || status === 'open'
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : status === 'draft'
                  ? 'bg-slate-100 text-slate-600 border border-slate-200'
                  : 'bg-red-100 text-red-600',
          )}
        >
          {statusLabel(status)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex gap-1 justify-end">
          {hasInvoice && onViewInvoice && (
            <Button
              size="sm"
              variant="outline"
              onClick={onViewInvoice}
              className="h-7 text-[10px] font-bold border-slate-300"
              title="Bağlı alış faturasını aç"
            >
              <Receipt className="w-3 h-3 mr-1" /> Fatura
            </Button>
          )}
          {status === 'draft' && (
            <Button
              size="sm"
              variant="outline"
              onClick={onStart}
              className="h-7 text-[10px] font-bold border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <Play className="w-3 h-3 mr-1" /> Başlat
            </Button>
          )}
          {(status === 'in_progress' || status === 'open') && (
            <Button
              size="sm"
              onClick={onComplete}
              className="h-7 text-[10px] font-bold bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle2 className="w-3 h-3 mr-1" /> TAMAMLA
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: 'slate' | 'blue' | 'green';
}) {
  const accentClass = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
  }[accent];
  return (
    <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
          {label}
        </span>
        <div className={cn('p-1.5 rounded-lg', accentClass)}>{icon}</div>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function orderStatus(o: AnyOrder): Status | 'open' {
  if (o.kind === 'general') return o.data.status;
  return o.data.status as Status | 'open';
}

function orderProductName(o: AnyOrder): string {
  if (o.kind === 'general') return o.data.productName || '—';
  return o.data.inputProductName || '—';
}

function orderRecipeName(o: AnyOrder): string {
  if (o.kind === 'general') return o.data.recipeName || '';
  return o.data.recipeName || '';
}

function statusLabel(s: Status | 'open'): string {
  if (s === 'draft') return 'TASLAK';
  if (s === 'in_progress' || s === 'open') return 'ÜRETİMDE';
  if (s === 'completed') return 'TAMAMLANDI';
  return 'İPTAL';
}

function computeStats(orders: AnyOrder[]) {
  const stats = { draft: 0, in_progress: 0, completed: 0, cancelled: 0 };
  for (const o of orders) {
    const s = orderStatus(o);
    if (s === 'draft') stats.draft += 1;
    else if (s === 'in_progress' || s === 'open') stats.in_progress += 1;
    else if (s === 'completed') stats.completed += 1;
    else stats.cancelled += 1;
  }
  return stats;
}