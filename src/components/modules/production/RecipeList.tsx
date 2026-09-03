/**
 * Üretim Reçete Listesi — kart grid.
 * Genel (ProductionRecipe) + Kasap (ButcherRecipe) birlikte gösterilir;
 * tip ayrımı `recipe.code` ya da kart başlığındaki etiket ile yapılır.
 */

import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Package,
  Beef,
  Layers,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';

import type { ProductionRecipe, ButcherRecipe } from '@/services/production/types';

type RecipeKind = 'general' | 'butcher';

export type AnyRecipe =
  | { kind: 'general'; data: ProductionRecipe }
  | { kind: 'butcher'; data: ButcherRecipe };

type RecipeListProps = {
  general: ProductionRecipe[];
  butcher: ButcherRecipe[];
  loading?: boolean;
  onCreate: (kind: RecipeKind) => void;
  onEdit: (recipe: AnyRecipe) => void;
  onDelete?: (recipe: AnyRecipe) => void;
};

export function RecipeList({
  general,
  butcher,
  loading,
  onCreate,
  onEdit,
  onDelete,
}: RecipeListProps) {
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | RecipeKind>('all');

  const merged = useMemo<AnyRecipe[]>(() => {
    const g: AnyRecipe[] = general.map((r) => ({ kind: 'general', data: r }));
    const b: AnyRecipe[] = butcher.map((r) => ({ kind: 'butcher', data: r }));
    return [...g, ...b];
  }, [general, butcher]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return merged.filter((r) => {
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
      if (!q) return true;
      if (r.kind === 'general') {
        const d = r.data;
        return (
          d.name.toLocaleLowerCase('tr-TR').includes(q) ||
          (d.productName || '').toLocaleLowerCase('tr-TR').includes(q)
        );
      }
      const d = r.data;
      return (
        d.name.toLocaleLowerCase('tr-TR').includes(q) ||
        (d.code || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (d.inputProductName || '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [merged, search, kindFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3 min-w-[280px]">
          <div className="relative w-80 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Reçete ara..."
              className="pl-10 h-10 bg-white"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {(['all', 'general', 'butcher'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={cn(
                  'px-3 h-7 text-xs font-semibold rounded-md transition-colors',
                  kindFilter === k
                    ? k === 'butcher'
                      ? 'bg-amber-600 text-white'
                      : 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {k === 'all' ? 'Tümü' : k === 'general' ? 'Genel' : 'Kasap'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => onCreate('butcher')}
            variant="outline"
            className="border-amber-200 text-amber-700 hover:bg-amber-50"
          >
            <Beef className="w-4 h-4 mr-2" /> Yeni Kasap Reçetesi
          </Button>
          <Button onClick={() => onCreate('general')} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" /> Yeni Reçete
          </Button>
        </div>
      </div>

      {loading && (
        <div className="text-[11px] text-slate-400 italic text-center py-2">Yükleniyor…</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((r) =>
          r.kind === 'general' ? (
            <GeneralCard
              key={`g-${r.data.id}`}
              recipe={r.data}
              onEdit={() => onEdit(r)}
              onDelete={onDelete ? () => onDelete(r) : undefined}
            />
          ) : (
            <ButcherCard
              key={`b-${r.data.id}`}
              recipe={r.data}
              onEdit={() => onEdit(r)}
              onDelete={onDelete ? () => onDelete(r) : undefined}
            />
          ),
        )}
        {filtered.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center bg-white border border-dashed border-slate-300 rounded-xl opacity-60">
            <Package className="w-12 h-12 mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm italic">Tanımlanmış reçete bulunamadı.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function GeneralCard({
  recipe,
  onEdit,
  onDelete,
}: {
  recipe: ProductionRecipe;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow group overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-blue-50/40">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">
              Genel BOM
            </span>
          </div>
          <h4 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors uppercase text-sm tracking-tight truncate">
            {recipe.name}
          </h4>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{recipe.productName}</p>
        </div>
        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-7 w-7">
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </Button>
          {onDelete && (
            <Button variant="ghost" size="icon" onClick={onDelete} className="h-7 w-7 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5 text-slate-300" />
            </Button>
          )}
        </div>
      </div>
      <div className="p-4 space-y-3">
        <Row label="Toplam Maliyet" value={formatMoney(recipe.totalCost)} bold />
        <Row label="Bileşen Sayısı" value={`${recipe.ingredients.length} Kalem`} />
        <Row label="Fire Oranı" value={`%${recipe.wastagePercent}`} accent />
      </div>
    </div>
  );
}

function ButcherCard({
  recipe,
  onEdit,
  onDelete,
}: {
  recipe: ButcherRecipe;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const animalLabel: Record<string, string> = {
    sheep: 'Koyun',
    cattle: 'Sığır',
    goat: 'Keçi',
    other: 'Diğer',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow group overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-amber-50/40">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
              Kasap
            </span>
            {recipe.code && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-600">
                {recipe.code}
              </span>
            )}
          </div>
          <h4 className="font-semibold text-slate-900 group-hover:text-amber-700 transition-colors uppercase text-sm tracking-tight truncate">
            {recipe.name}
          </h4>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {animalLabel[recipe.animalType] || recipe.animalType}
            {recipe.inputProductName ? ` · ${recipe.inputProductName}` : ''}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-7 w-7">
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </Button>
          {onDelete && (
            <Button variant="ghost" size="icon" onClick={onDelete} className="h-7 w-7 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5 text-slate-300" />
            </Button>
          )}
        </div>
      </div>
      <div className="p-4 space-y-3">
        <Row label="Çıktı Parça" value={`${recipe.outputs.length} Kalem`} />
        <Row label="Maliyet Yöntemi" value={costMethodLabel(recipe.costMethod)} />
        <Row label="Durum" value={recipe.isActive ? 'Aktif' : 'Pasif'} accent={recipe.isActive} />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</span>
      <span
        className={cn(
          'text-xs',
          bold && 'font-bold text-slate-900',
          accent === true && 'font-medium text-green-700',
          accent === false && 'font-medium text-slate-500',
          !bold && accent === undefined && 'font-medium text-slate-700',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function formatMoney(n: number): string {
  return `${(Number(n) || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} IQD`;
}

function costMethodLabel(m?: string | null): string {
  switch (m) {
    case 'by_weight':
      return 'Ağırlığa göre';
    case 'by_sale_price':
      return 'Satış fiyatına göre';
    case 'by_coefficient':
      return 'Katsayıya göre';
    case 'manual':
      return 'Manuel';
    default:
      return '—';
  }
}

export { Layers };