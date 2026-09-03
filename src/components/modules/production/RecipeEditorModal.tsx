/**
 * Reçete Düzenleme Modalı — PercentBodyModal wide
 * Hem genel (ProductionRecipe) hem kasap (ButcherRecipe) için tek modal.
 * Mod: 'general' | 'butcher'
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Save, Trash2, Plus, X, Search, AlertCircle, Beef } from 'lucide-react';
import { toast } from 'sonner';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '@/components/shared/PercentBodyModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';

import { useProductStore } from '@/store/useProductStore';
import type { Product } from '@/core/types';

import type {
  ProductionRecipe,
  ButcherRecipe,
  RecipeIngredient,
  ButcherRecipeOutputDraft,
  AnimalType,
  ButcherCostMethod,
} from '@/services/production/types';

export type RecipeDraft =
  | { kind: 'general'; data: ProductionRecipe }
  | { kind: 'butcher'; data: ButcherRecipe };

type Props = {
  draft: RecipeDraft;
  onClose: () => void;
  onSave: (draft: RecipeDraft) => Promise<void> | void;
};

const ANIMAL_LABELS: Record<AnimalType, string> = {
  sheep: 'Koyun',
  cattle: 'Sığır',
  goat: 'Keçi',
  other: 'Diğer',
};

const COST_METHODS: { id: ButcherCostMethod; label: string }[] = [
  { id: 'by_weight', label: 'Ağırlığa göre' },
  { id: 'by_sale_price', label: 'Satış fiyatına göre' },
  { id: 'by_coefficient', label: 'Katsayıya göre' },
  { id: 'manual', label: 'Manuel' },
];

export function RecipeEditorModal({ draft, onClose, onSave }: Props) {
  const { products } = useProductStore();
  const [state, setState] = useState<RecipeDraft>(draft);
  const [saving, setSaving] = useState(false);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');

  useEffect(() => {
    setState(draft);
  }, [draft]);

  const totalCost = useMemo(() => {
    if (state.kind !== 'general') return 0;
    return state.data.ingredients.reduce(
      (sum, ing) => sum + (Number(ing.cost) || 0) * (Number(ing.quantity) || 0),
      0,
    );
  }, [state]);

  // Genel reçetede totalCost canlı güncellenir
  useEffect(() => {
    if (state.kind !== 'general') return;
    if (state.data.totalCost === totalCost) return;
    setState({ kind: 'general', data: { ...state.data, totalCost } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCost]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return products.slice(0, 20);
    return products
      .filter(
        (p: Product) =>
          (p.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
          (p.code || '').toLocaleLowerCase('tr-TR').includes(q),
      )
      .slice(0, 20);
  }, [products, materialSearch]);

  const isGeneral = state.kind === 'general';

  const headerGradient = isGeneral
    ? 'bg-gradient-to-r from-blue-600 to-indigo-600'
    : 'bg-gradient-to-r from-amber-600 to-orange-600';

  const title = isGeneral
    ? state.data.id
      ? 'Genel Reçete Düzenle'
      : 'Yeni Genel Reçete'
    : state.data.id
    ? 'Kasap Reçetesi Düzenle'
    : 'Yeni Kasap Reçetesi';

  const handleSave = async () => {
    if (isGeneral && !state.data.productId) {
      toast.error('Üretilecek mamul seçilmedi');
      return;
    }
    if (isGeneral && state.data.ingredients.length === 0) {
      toast.error('En az bir bileşen ekleyin');
      return;
    }
    if (!isGeneral && state.data.outputs.length === 0) {
      toast.error('En az bir çıktı parça ekleyin');
      return;
    }
    setSaving(true);
    try {
      await onSave(state);
    } catch (e) {
      console.error(e);
      toast.error('Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={title}>
      <div className={cn('px-8 py-6 text-white shrink-0 flex justify-between items-center', headerGradient)}>
        <div className="flex items-center gap-3">
          {isGeneral ? <Save className="w-5 h-5" /> : <Beef className="w-5 h-5" />}
          <div>
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            <p className="text-xs text-white/80 mt-0.5">
              {isGeneral
                ? 'Bileşenler ve fire oranı ile mamul maliyetini otomatik hesaplar'
                : 'Karkas / canlı hayvan → parça çıktıları + fire dağılımı'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <PercentBodyModalScrollBody className="p-8">
        {isGeneral ? (
          <GeneralForm
            recipe={state.data}
            onChange={(next) => setState({ kind: 'general', data: next })}
            products={products}
            filteredMaterials={filteredMaterials}
            materialSearch={materialSearch}
            setMaterialSearch={setMaterialSearch}
            materialModalOpen={materialModalOpen}
            setMaterialModalOpen={setMaterialModalOpen}
          />
        ) : (
          <ButcherForm
            recipe={state.data}
            onChange={(next) => setState({ kind: 'butcher', data: next })}
            products={products}
            filteredMaterials={filteredMaterials}
            materialSearch={materialSearch}
            setMaterialSearch={setMaterialSearch}
            materialModalOpen={materialModalOpen}
            setMaterialModalOpen={setMaterialModalOpen}
          />
        )}
      </PercentBodyModalScrollBody>

      <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0 justify-end">
        <Button
          variant="ghost"
          onClick={onClose}
          className="rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100"
        >
          İptal
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'rounded-2xl text-white font-bold uppercase text-sm tracking-wider shadow-lg active:scale-[0.98]',
            isGeneral ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200/50' : 'bg-amber-600 hover:bg-amber-700 shadow-amber-200/50',
          )}
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>
    </PercentBodyModal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * GENEL FORM — ProductionRecipe
 * ═══════════════════════════════════════════════════════════════════════ */

function GeneralForm({
  recipe,
  onChange,
  products,
  filteredMaterials,
  materialSearch,
  setMaterialSearch,
  materialModalOpen,
  setMaterialModalOpen,
}: {
  recipe: ProductionRecipe;
  onChange: (next: ProductionRecipe) => void;
  products: Product[];
  filteredMaterials: Product[];
  materialSearch: string;
  setMaterialSearch: (v: string) => void;
  materialModalOpen: boolean;
  setMaterialModalOpen: (v: boolean) => void;
}) {
  const updateField = <K extends keyof ProductionRecipe>(key: K, value: ProductionRecipe[K]) => {
    onChange({ ...recipe, [key]: value });
  };

  const addIngredient = (p: Product) => {
    if (recipe.ingredients.some((i) => i.materialId === p.id)) return;
    const newIng: RecipeIngredient = {
      materialId: p.id,
      materialName: p.name,
      quantity: 1,
      unit: p.unit || 'ADET',
      cost: p.cost || p.price || 0,
    };
    onChange({ ...recipe, ingredients: [...recipe.ingredients, newIng] });
    setMaterialModalOpen(false);
  };

  const updateIngredient = (id: string, patch: Partial<RecipeIngredient>) => {
    onChange({
      ...recipe,
      ingredients: recipe.ingredients.map((i) =>
        i.materialId === id ? { ...i, ...patch } : i,
      ),
    });
  };

  const removeIngredient = (id: string) => {
    onChange({
      ...recipe,
      ingredients: recipe.ingredients.filter((i) => i.materialId !== id),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-4 space-y-4">
        <Field label="Reçete Adı">
          <Input
            value={recipe.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Örn: Özel Paket Karışım"
            className="h-10 rounded-2xl border-slate-200"
          />
        </Field>

        <Field label="Üretilecek Mamul">
          <select
            value={recipe.productId}
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              onChange({
                ...recipe,
                productId: e.target.value,
                productName: p?.name,
              });
            }}
            className="w-full h-10 px-3 rounded-2xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Mamul seçiniz...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.code ? `(${p.code})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fire (%)">
            <Input
              type="number"
              min={0}
              max={100}
              value={recipe.wastagePercent}
              onChange={(e) => updateField('wastagePercent', Number(e.target.value) || 0)}
              className="h-10 rounded-2xl border-slate-200"
            />
          </Field>
          <Field label="Toplam Maliyet">
            <div className="h-10 flex items-center px-3 bg-slate-100 rounded-2xl border border-slate-200 text-sm font-bold text-slate-700">
              {recipe.totalCost.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} IQD
            </div>
          </Field>
        </div>

        <Field label="Açıklama">
          <textarea
            value={recipe.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            rows={3}
            className="w-full p-3 rounded-2xl border border-slate-200 bg-white text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Üretim talimatları..."
          />
        </Field>

        <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
          <h5 className="text-xs font-bold text-blue-800 flex items-center gap-2 mb-2 uppercase tracking-wide">
            <AlertCircle className="w-3.5 h-3.5" /> Reçete Notu
          </h5>
          <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
            Tamamlama işlemi otomatik olarak hammadde stoklarını düşürür ve mamul stoğunu artırır.
          </p>
        </div>
      </div>

      <div className="lg:col-span-8 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-tight">
              Bileşenler (BOM)
            </h4>
            <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[10px]">
              {recipe.ingredients.length} Kalem
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMaterialModalOpen(true)}
            className="h-8 border-blue-200 text-blue-600 hover:bg-blue-50 bg-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Bileşen Ekle
          </Button>
        </div>

        <div className="flex-1 max-h-[420px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-semibold tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">Bileşen</th>
                <th className="px-4 py-3 text-center w-20">Birim</th>
                <th className="px-4 py-3 text-center w-28">Miktar</th>
                <th className="px-4 py-3 text-right w-28">B.Maliyet</th>
                <th className="px-4 py-3 text-right w-28">Toplam</th>
                <th className="px-4 py-3 text-right w-12">#</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recipe.ingredients.map((ing) => (
                <tr key={ing.materialId} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="text-xs font-bold text-slate-800 uppercase truncate">
                      {ing.materialName}
                    </div>
                    <div className="text-[9px] text-slate-400 font-mono">
                      {ing.materialId.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <select
                      value={ing.unit}
                      onChange={(e) => updateIngredient(ing.materialId, { unit: e.target.value })}
                      className="h-7 px-2 rounded-md border border-slate-200 bg-white text-xs text-center"
                    >
                      <option value="ADET">ADET</option>
                      <option value="KG">KG</option>
                      <option value="LT">LT</option>
                      <option value="MT">MT</option>
                      <option value="GR">GR</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      value={ing.quantity}
                      onChange={(e) =>
                        updateIngredient(ing.materialId, { quantity: Number(e.target.value) || 0 })
                      }
                      className="h-8 text-center text-xs w-24 mx-auto"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={ing.cost}
                      onChange={(e) =>
                        updateIngredient(ing.materialId, { cost: Number(e.target.value) || 0 })
                      }
                      className="h-8 text-right text-xs w-24 ml-auto"
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-slate-800">
                    {(ing.cost * ing.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeIngredient(ing.materialId)}
                      className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {recipe.ingredients.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 italic text-xs">
                    Bileşen eklemek için sağ üstteki butonu kullanın.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <div className="text-right">
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">
              Toplam Maliyet
            </div>
            <div className="text-xl font-bold text-slate-900">
              {recipe.totalCost.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}{' '}
              <span className="text-xs text-slate-500">IQD</span>
            </div>
          </div>
        </div>
      </div>

      <MaterialPicker
        open={materialModalOpen}
        onClose={() => setMaterialModalOpen(false)}
        search={materialSearch}
        setSearch={setMaterialSearch}
        results={filteredMaterials}
        onPick={(p) => addIngredient(p)}
        accent="blue"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * KASAP FORM — ButcherRecipe (basitleştirilmiş: çıktı parçalar)
 * ═══════════════════════════════════════════════════════════════════════ */

function ButcherForm({
  recipe,
  onChange,
  products,
  filteredMaterials,
  materialSearch,
  setMaterialSearch,
  materialModalOpen,
  setMaterialModalOpen,
}: {
  recipe: ButcherRecipe;
  onChange: (next: ButcherRecipe) => void;
  products: Product[];
  filteredMaterials: Product[];
  materialSearch: string;
  setMaterialSearch: (v: string) => void;
  materialModalOpen: boolean;
  setMaterialModalOpen: (v: boolean) => void;
}) {
  const updateField = <K extends keyof ButcherRecipe>(key: K, value: ButcherRecipe[K]) => {
    onChange({ ...recipe, [key]: value });
  };

  const addOutput = (p: Product) => {
    const next: ButcherRecipeOutputDraft = {
      productId: p.id,
      productName: p.name,
      sortOrder: recipe.outputs.length,
      standardRatioPercent: null,
      coefficient: 1,
    };
    onChange({ ...recipe, outputs: [...recipe.outputs, next] });
    setMaterialModalOpen(false);
  };

  const updateOutput = (idx: number, patch: Partial<ButcherRecipeOutputDraft>) => {
    onChange({
      ...recipe,
      outputs: recipe.outputs.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    });
  };

  const removeOutput = (idx: number) => {
    onChange({
      ...recipe,
      outputs: recipe.outputs.filter((_, i) => i !== idx),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-4 space-y-4">
        <Field label="Reçete Kodu (isteğe bağlı)">
          <Input
            value={recipe.code || ''}
            onChange={(e) => updateField('code', e.target.value)}
            placeholder="Örn: KOY-001"
            className="h-10 rounded-2xl border-slate-200 font-mono"
          />
        </Field>

        <Field label="Reçete Adı">
          <Input
            value={recipe.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Örn: Koyun Parçalama"
            className="h-10 rounded-2xl border-slate-200"
          />
        </Field>

        <Field label="Hayvan Türü">
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(ANIMAL_LABELS) as AnimalType[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => updateField('animalType', a)}
                className={cn(
                  'px-3 h-9 rounded-2xl border text-xs font-bold transition-colors',
                  recipe.animalType === a
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300',
                )}
              >
                {ANIMAL_LABELS[a]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Girdi Ürün (canlı hayvan / karkas)">
          <select
            value={recipe.inputProductId || ''}
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              onChange({
                ...recipe,
                inputProductId: e.target.value || null,
                inputProductName: p?.name,
              });
            }}
            className="w-full h-10 px-3 rounded-2xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
          >
            <option value="">— Seçiniz —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.code ? `(${p.code})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fire Ürünü">
          <select
            value={recipe.wasteProductId || ''}
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              onChange({
                ...recipe,
                wasteProductId: e.target.value || null,
                wasteProductName: p?.name,
              });
            }}
            className="w-full h-10 px-3 rounded-2xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
          >
            <option value="">— Yok —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.code ? `(${p.code})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Maliyet Yöntemi">
          <select
            value={recipe.costMethod || ''}
            onChange={(e) => updateField('costMethod', (e.target.value || null) as ButcherCostMethod | null)}
            className="w-full h-10 px-3 rounded-2xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
          >
            <option value="">— Seçiniz —</option>
            {COST_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Açıklama">
          <textarea
            value={recipe.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            rows={3}
            className="w-full p-3 rounded-2xl border border-slate-200 bg-white text-sm resize-none focus:ring-2 focus:ring-amber-500 outline-none"
            placeholder="Parçalama / fire oranı notu..."
          />
        </Field>
      </div>

      <div className="lg:col-span-8 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-tight">
              Çıktı Parçalar
            </h4>
            <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[10px]">
              {recipe.outputs.length} Kalem
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMaterialModalOpen(true)}
            className="h-8 border-amber-200 text-amber-700 hover:bg-amber-50 bg-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Parça Ekle
          </Button>
        </div>

        <div className="flex-1 max-h-[420px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-semibold tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">Parça Ürün</th>
                <th className="px-4 py-3 text-center w-32">Standart Oran (%)</th>
                <th className="px-4 py-3 text-center w-24">Katsayı</th>
                <th className="px-4 py-3 text-right w-12">#</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recipe.outputs.map((o, idx) => (
                <tr key={`${o.productId}-${idx}`} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="text-xs font-bold text-slate-800 uppercase">
                      {o.productName || o.productId.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={o.standardRatioPercent ?? ''}
                      onChange={(e) =>
                        updateOutput(idx, {
                          standardRatioPercent: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="h-8 text-center text-xs w-28 mx-auto"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={o.coefficient}
                      onChange={(e) =>
                        updateOutput(idx, { coefficient: Number(e.target.value) || 1 })
                      }
                      className="h-8 text-center text-xs w-20 mx-auto"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOutput(idx)}
                      className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {recipe.outputs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-16 text-center text-slate-400 italic text-xs">
                    Çıktı parça eklemek için sağ üstteki butonu kullanın.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <MaterialPicker
        open={materialModalOpen}
        onClose={() => setMaterialModalOpen(false)}
        search={materialSearch}
        setSearch={setMaterialSearch}
        results={filteredMaterials}
        onPick={(p) => addOutput(p)}
        accent="amber"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * ORTAK — Malzeme seçici (inline liste)
 * ═══════════════════════════════════════════════════════════════════════ */

function MaterialPicker({
  open,
  onClose,
  search,
  setSearch,
  results,
  onPick,
  accent,
}: {
  open: boolean;
  onClose: () => void;
  search: string;
  setSearch: (v: string) => void;
  results: Product[];
  onPick: (p: Product) => void;
  accent: 'blue' | 'amber';
}) {
  if (!open) return null;
  const accentClass = accent === 'blue' ? 'text-blue-700' : 'text-amber-700';
  return (
    <div className="lg:col-span-12 -mt-2 bg-white border border-slate-200 rounded-2xl shadow-md p-4 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Malzeme adı veya kodu..."
            className="pl-10 h-10 rounded-2xl border-slate-200"
            autoFocus
          />
        </div>
        <Button variant="ghost" onClick={onClose} className="h-10 px-4 rounded-2xl">
          Vazgeç
        </Button>
      </div>
      <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
        {results.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => onPick(p)}
            className="w-full text-left p-3 hover:bg-slate-50 flex justify-between items-center transition-colors"
          >
            <div>
              <div className={cn('text-xs font-bold uppercase', accentClass)}>{p.name}</div>
              <div className="text-[10px] text-slate-500 font-mono">
                {p.code || '—'} · Stok: {Number(p.stock || 0).toLocaleString('tr-TR')} {p.unit || 'ADET'}
              </div>
            </div>
            <Plus className="w-4 h-4 text-slate-300" />
          </button>
        ))}
        {results.length === 0 && (
          <div className="p-6 text-center text-slate-400 italic text-xs">Sonuç yok.</div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}