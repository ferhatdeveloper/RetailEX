/**
 * Kasap Üretim ve Maliyet Yönetimi — reçete, üretim fişi, liste, raporlar
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Beef,
  Plus,
  Trash2,
  Save,
  History,
  Layers,
  Scale,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Settings2,
  Flame,
  TrendingUp,
  FileText,
  FilePlus2,
  ExternalLink,
  Truck,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useProductStore } from '@/store/useProductStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFirmaDonem } from '@/contexts/FirmaDonemContext';
import { cn } from '@/components/ui/utils';
import {
  butcherProductionAPI,
  type AnimalType,
  type ButcherOrder,
  type ButcherRecipe,
  type ButcherSettings,
} from '@/services/api/butcherProductionAPI';
import {
  ButcherProductionService,
  type ButcherStockLineSummary,
} from '@/services/butcherProductionService';
import { stockMovementAPI } from '@/services/stockMovementAPI';
import { supplierAPI } from '@/services/api/suppliers';
import {
  previewButcherCost,
  type ButcherCostMethod,
  type ButcherOutputDraft,
} from '@/utils/butcherCost';
import { PercentBodyModal, PercentBodyModalScrollBody } from '@/components/shared/PercentBodyModal';
import { InvoiceCariSelectModal, type InvoiceCariItem } from '@/components/trading/invoices/InvoiceCariSelectModal';

type TabId = 'voucher' | 'recipes' | 'list' | 'reports' | 'settings';
type ReportId = 'history' | 'waste' | 'yield';

type OutputRow = ButcherOutputDraft & { key: string };

const COST_METHODS: { id: ButcherCostMethod; labelKey: string }[] = [
  { id: 'by_weight', labelKey: 'butcherCostByWeight' },
  { id: 'by_sale_price', labelKey: 'butcherCostBySalePrice' },
  { id: 'by_coefficient', labelKey: 'butcherCostByCoeff' },
  { id: 'manual', labelKey: 'butcherCostManual' },
];

const ANIMALS: { id: AnimalType; labelKey: string }[] = [
  { id: 'sheep', labelKey: 'butcherAnimalSheep' },
  { id: 'cattle', labelKey: 'butcherAnimalCattle' },
  { id: 'goat', labelKey: 'butcherAnimalGoat' },
  { id: 'other', labelKey: 'butcherAnimalOther' },
];

function fmtKg(n: number) {
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`;
}

function fmtMoney(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type ProductOpt = {
  id: string;
  name: string;
  code?: string;
  stock?: number;
  cost?: number;
  price?: number;
  unit?: string;
  materialType?: string;
};

/** Girdi filtresi — products.material_type */
type InputMaterialFilter = 'semi_finished' | 'raw_material' | 'commercial_goods' | '';

function productMaterialType(p: ProductOpt): string {
  return String(p.materialType || '').trim().toLowerCase();
}

function filterProductsByMaterial(products: ProductOpt[], filter: InputMaterialFilter): ProductOpt[] {
  if (!filter) return products;
  return products.filter((p) => productMaterialType(p) === filter);
}

function roundKg(n: number) {
  return Math.round(n * 1000) / 1000;
}

function outputsFromRecipe(
  tpl: ButcherRecipe,
  products: ProductOpt[],
  inputKg: number,
): OutputRow[] {
  return tpl.outputs
    .filter((o) => o.productId)
    .map((o, i) => {
      const prod = products.find((p) => p.id === o.productId);
      const ratio = o.standardRatioPercent != null ? Number(o.standardRatioPercent) : null;
      const outputKg =
        ratio != null && Number.isFinite(ratio) && inputKg > 0
          ? roundKg((inputKg * ratio) / 100)
          : 0;
      return {
        key: `tpl-${tpl.id || 'x'}-${i}-${o.productId}`,
        productId: o.productId,
        productName: o.productName || prod?.name,
        outputKg,
        coefficient: o.coefficient || 1,
        salePrice: Number(prod?.price) || 0,
        manualUnitCost: 0,
      };
    });
}

function findRecipeByCode(recipes: ButcherRecipe[], raw: string): ButcherRecipe | undefined {
  const q = raw.trim().toLocaleLowerCase('tr-TR');
  if (!q) return undefined;
  return (
    recipes.find((r) => (r.code || '').trim().toLocaleLowerCase('tr-TR') === q) ||
    recipes.find((r) => r.name.trim().toLocaleLowerCase('tr-TR') === q)
  );
}

export function ButcherProductionModule({ embedded = false }: { embedded?: boolean }) {
  const { darkMode } = useTheme();
  const { tm } = useLanguage();
  const { products } = useProductStore();
  const [tab, setTab] = useState<TabId>('voucher');
  const [recipes, setRecipes] = useState<ButcherRecipe[]>([]);
  const [orders, setOrders] = useState<ButcherOrder[]>([]);
  const [settings, setSettings] = useState<ButcherSettings>({
    defaultCostMethod: 'by_weight',
    allowCompleteWithoutStock: true,
  });
  const [loading, setLoading] = useState(false);

  const loadMeta = useCallback(async () => {
    setLoading(true);
    try {
      const [r, o, s] = await Promise.all([
        butcherProductionAPI.getRecipes(),
        butcherProductionAPI.getOrders(100),
        butcherProductionAPI.getSettings(),
      ]);
      setRecipes(r);
      setOrders(o);
      setSettings(s);
    } catch (e) {
      console.error(e);
      toast.error(tm('butcherLoadError'));
    } finally {
      setLoading(false);
    }
  }, [tm]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'voucher', label: tm('butcherVoucher'), icon: Scale },
    { id: 'recipes', label: tm('butcherRecipes'), icon: Layers },
    { id: 'list', label: tm('butcherOrderList'), icon: History },
    { id: 'reports', label: tm('butcherReports'), icon: BarChart3 },
    { id: 'settings', label: tm('butcherSettings'), icon: Settings2 },
  ];

  return (
    <div className={cn('h-full flex flex-col', darkMode ? 'bg-gray-900' : 'bg-slate-50')}>
      {!embedded && (
      <div
        className={cn(
          'px-6 py-4 flex justify-between items-center shadow-md',
          darkMode ? 'bg-gray-800 text-white border-b border-gray-700' : 'bg-slate-800 text-white',
        )}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500 rounded-lg">
            <Beef className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{tm('butcherProductionTitle')}</h2>
            <p className={cn('text-xs', darkMode ? 'text-gray-400' : 'text-slate-400')}>
              {tm('butcherProductionSubtitle')}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700"
          onClick={() => void loadMeta()}
          disabled={loading}
        >
          {tm('refresh')}
        </Button>
      </div>
      )}

      <div className={cn('flex flex-wrap gap-2', embedded ? 'px-0 pt-0' : 'px-6 pt-4')}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors',
              tab === id
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                : darkMode
                  ? 'bg-gray-800 text-gray-300 border-gray-700 hover:border-amber-500'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300',
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        {embedded && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-9"
            onClick={() => void loadMeta()}
            disabled={loading}
          >
            {tm('refresh')}
          </Button>
        )}
      </div>

      <div className={cn('flex-1 overflow-auto', embedded ? 'pt-4' : 'p-6')}>
        {tab === 'voucher' && (
          <VoucherForm
            products={products as ProductOpt[]}
            recipes={recipes}
            settings={settings}
            darkMode={darkMode}
            onCompleted={() => {
              void useProductStore.getState().loadProducts(true);
              void loadMeta();
            }}
          />
        )}
        {tab === 'recipes' && (
          <RecipeManager
            products={products as ProductOpt[]}
            recipes={recipes}
            settings={settings}
            darkMode={darkMode}
            onSaved={() => void loadMeta()}
          />
        )}
        {tab === 'list' && (
          <OrderList
            orders={orders}
            products={products as ProductOpt[]}
            darkMode={darkMode}
            onRefresh={() => void loadMeta()}
          />
        )}
        {tab === 'reports' && <ReportsPanel darkMode={darkMode} />}
        {tab === 'settings' && (
          <SettingsPanel
            settings={settings}
            darkMode={darkMode}
            onSaved={(s) => {
              setSettings(s);
              toast.success(tm('butcherSettingsSaved'));
            }}
          />
        )}
      </div>
    </div>
  );
}

function VoucherForm({
  products,
  recipes,
  settings,
  darkMode,
  onCompleted,
}: {
  products: ProductOpt[];
  recipes: ButcherRecipe[];
  settings: ButcherSettings;
  darkMode: boolean;
  onCompleted: () => void;
}) {
  const { tm } = useLanguage();
  const [animalType, setAnimalType] = useState<AnimalType>('sheep');
  const [recipeId, setRecipeId] = useState('');
  const [productionCode, setProductionCode] = useState('');
  const [inputMaterialFilter, setInputMaterialFilter] = useState<InputMaterialFilter>('semi_finished');
  const [inputProductId, setInputProductId] = useState('');
  const [wasteProductId, setWasteProductId] = useState('');
  const [inputQtyKg, setInputQtyKg] = useState(0);
  const [inputUnitCost, setInputUnitCost] = useState(0);
  const [costMethod, setCostMethod] = useState<ButcherCostMethod>(settings.defaultCostMethod);
  const [lotNo, setLotNo] = useState('');
  const [note, setNote] = useState('');
  const [outputs, setOutputs] = useState<OutputRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [purchasePromptOrder, setPurchasePromptOrder] = useState<ButcherOrder | null>(null);
  const [completeSummary, setCompleteSummary] = useState<{
    orderNo?: string;
    orderId?: string;
    lines: ButcherStockLineSummary[];
  } | null>(null);
  const [pendingPurchaseAfterSummary, setPendingPurchaseAfterSummary] = useState<ButcherOrder | null>(
    null,
  );
  const { selectedFirm, selectedPeriod } = useFirmaDonem();

  useEffect(() => {
    setCostMethod(settings.defaultCostMethod);
  }, [settings.defaultCostMethod]);

  const inputProducts = useMemo(
    () => filterProductsByMaterial(products, inputMaterialFilter),
    [products, inputMaterialFilter],
  );

  const selectedInput = products.find((p) => p.id === inputProductId);
  const inputStock = Number(selectedInput?.stock) || 0;
  const stockShortfall = Boolean(inputProductId && inputQtyKg > 0 && inputStock < inputQtyKg - 0.001);

  useEffect(() => {
    if (selectedInput) {
      const c = Number(selectedInput.cost) || Number(selectedInput.price) || 0;
      if (c > 0 && inputUnitCost === 0) setInputUnitCost(c);
    }
  }, [selectedInput, inputUnitCost]);

  /** Girdi kg değişince reçete oranlarından kg yenile (manuel satırları ezme: yalnızca reçete satırları) */
  useEffect(() => {
    if (!recipeId || inputQtyKg <= 0) return;
    const tpl = recipes.find((t) => t.id === recipeId);
    if (!tpl?.outputs.some((o) => o.standardRatioPercent != null)) return;
    setOutputs(outputsFromRecipe(tpl, products, inputQtyKg));
  }, [inputQtyKg, recipeId, recipes, products]);

  const applyRecipe = (rid: string, opts?: { codeOverride?: string }) => {
    setRecipeId(rid);
    if (!rid) {
      setProductionCode(opts?.codeOverride ?? '');
      return;
    }
    const tpl = recipes.find((t) => t.id === rid);
    if (!tpl) return;
    setProductionCode(opts?.codeOverride ?? tpl.code ?? '');
    if (tpl.inputProductId) {
      setInputProductId(tpl.inputProductId);
      const inp = products.find((p) => p.id === tpl.inputProductId);
      if (inp?.materialType) {
        const mt = productMaterialType(inp);
        if (mt === 'semi_finished' || mt === 'raw_material' || mt === 'commercial_goods') {
          setInputMaterialFilter(mt);
        }
      }
    }
    if (tpl.wasteProductId) setWasteProductId(tpl.wasteProductId);
    if (tpl.costMethod) setCostMethod(tpl.costMethod);
    setAnimalType(tpl.animalType);
    setOutputs(outputsFromRecipe(tpl, products, inputQtyKg));
  };

  const applyProductionCode = (raw: string) => {
    setProductionCode(raw);
    const q = raw.trim();
    if (!q) return;
    const tpl = findRecipeByCode(recipes, q);
    if (tpl?.id) {
      applyRecipe(tpl.id, { codeOverride: tpl.code || q });
    }
  };

  const preview = useMemo(
    () => previewButcherCost(inputQtyKg, inputUnitCost, outputs, costMethod),
    [inputQtyKg, inputUnitCost, outputs, costMethod],
  );

  const addOutputRow = () => {
    setOutputs((prev) => [
      ...prev,
      { key: `row-${Date.now()}`, productId: '', outputKg: 0, coefficient: 1, salePrice: 0, manualUnitCost: 0 },
    ]);
  };

  const updateOutput = (key: string, patch: Partial<OutputRow>) => {
    setOutputs((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.productId) {
          const prod = products.find((p) => p.id === patch.productId);
          if (prod) {
            next.productName = prod.name;
            if (!next.salePrice) next.salePrice = Number(prod.price) || 0;
          }
        }
        return next;
      }),
    );
  };

  const submit = async (asComplete: boolean) => {
    if (asComplete && stockShortfall) {
      if (!window.confirm(tm('butcherStockShortfallConfirm'))) {
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        recipeId: recipeId || null,
        animalType,
        inputProductId,
        inputQtyKg,
        inputUnitCost,
        wasteProductId: wasteProductId || null,
        lotNo: lotNo || null,
        costMethod,
        outputs,
        note,
        warehouseId: settings.defaultWarehouseId,
        allowInsufficientStock: asComplete && stockShortfall ? true : undefined,
      };
      const result = asComplete
        ? await ButcherProductionService.complete(payload)
        : await ButcherProductionService.saveDraft({
            ...payload,
            status: 'open',
          });

      if (!result.ok) {
        toast.error(result.error || tm('butcherSaveError'));
        return;
      }
      toast.success(asComplete ? tm('butcherCompleted') : tm('butcherDraftSaved'));
      if (asComplete && result.stockSummary?.length) {
        setCompleteSummary({
          orderNo: result.orderNo,
          orderId: result.orderId,
          lines: result.stockSummary,
        });
      }
      if (asComplete && result.orderId) {
        try {
          const created = await butcherProductionAPI.getOrderById(result.orderId);
          if (created && !created.purchaseInvoiceId && canCreatePurchaseFromOrder(created)) {
            if (result.stockSummary?.length) {
              setPendingPurchaseAfterSummary(created);
            } else {
              setPurchasePromptOrder(created);
            }
          }
        } catch {
          /* listeye düşer */
        }
      }
      setInputQtyKg(0);
      setOutputs((prev) => prev.map((o) => ({ ...o, outputKg: 0, manualUnitCost: 0 })));
      setLotNo('');
      setNote('');
      onCompleted();
    } finally {
      setSubmitting(false);
    }
  };

  const card = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const labelCls = darkMode ? 'text-gray-300' : 'text-slate-600';
  const recipeCodeListId = 'butcher-production-code-list';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      <div className={cn('xl:col-span-10 space-y-4 rounded-xl border p-4', card)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={tm('butcherProductionCode')} className={labelCls}>
            <Input
              list={recipeCodeListId}
              value={productionCode}
              placeholder={tm('butcherProductionCodeHint')}
              onChange={(e) => applyProductionCode(e.target.value)}
              onBlur={() => {
                const q = productionCode.trim();
                if (!q) return;
                if (!findRecipeByCode(recipes, q)) {
                  toast.message(tm('butcherRecipeNotFound'));
                }
              }}
            />
            <datalist id={recipeCodeListId}>
              {recipes.map((r) => (
                <option key={r.id} value={r.code || r.name}>
                  {r.code ? `${r.code} — ${r.name}` : r.name}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label={tm('butcherAnimal')} className={labelCls}>
            <select
              className={selectCls(darkMode)}
              value={animalType}
              onChange={(e) => setAnimalType(e.target.value as AnimalType)}
            >
              {ANIMALS.map((a) => (
                <option key={a.id} value={a.id}>
                  {tm(a.labelKey)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tm('butcherRecipe')} className={labelCls}>
            <select
              className={selectCls(darkMode)}
              value={recipeId}
              onChange={(e) => applyRecipe(e.target.value)}
            >
              <option value="">{tm('butcherSelectRecipe')}</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code ? `[${r.code}] ${r.name}` : r.name}
                  {r.animalType !== animalType ? ` (${tm(ANIMALS.find((a) => a.id === r.animalType)?.labelKey || 'butcherAnimalOther')})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tm('butcherInputMaterialType')} className={labelCls}>
            <select
              className={selectCls(darkMode)}
              value={inputMaterialFilter}
              onChange={(e) => {
                const next = e.target.value as InputMaterialFilter;
                setInputMaterialFilter(next);
                if (inputProductId) {
                  const still = filterProductsByMaterial(products, next).some((p) => p.id === inputProductId);
                  if (!still) setInputProductId('');
                }
              }}
            >
              <option value="semi_finished">{tm('semiFinished')}</option>
              <option value="raw_material">{tm('rawMaterial')}</option>
              <option value="commercial_goods">{tm('butcherMamul')}</option>
              <option value="">{tm('butcherAllMaterialTypes')}</option>
            </select>
          </Field>
          <Field label={tm('butcherInputProduct')} className={labelCls}>
            <select
              className={selectCls(darkMode)}
              value={inputProductId}
              onChange={(e) => setInputProductId(e.target.value)}
            >
              <option value="">{tm('butcherSelectProduct')}</option>
              {inputProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.stock != null ? `(${p.stock})` : ''}
                </option>
              ))}
              {inputProductId && !inputProducts.some((p) => p.id === inputProductId) && (
                <option value={inputProductId}>
                  {selectedInput?.name || inputProductId}
                  {selectedInput?.stock != null ? ` (${selectedInput.stock})` : ''}
                </option>
              )}
            </select>
            {inputProducts.length === 0 && (
              <p className={cn('text-[11px] mt-1', darkMode ? 'text-amber-400' : 'text-amber-700')}>
                {tm('butcherNoMatchingProducts')}
              </p>
            )}
          </Field>
          <Field label={tm('butcherWasteProductOptional')} className={labelCls}>
            <select
              className={selectCls(darkMode)}
              value={wasteProductId}
              onChange={(e) => setWasteProductId(e.target.value)}
            >
              <option value="">{tm('butcherNoWasteCard')}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tm('butcherInputKg')} className={labelCls}>
            <Input
              type="number"
              step="0.001"
              value={inputQtyKg || ''}
              onChange={(e) => setInputQtyKg(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label={tm('butcherInputUnitCost')} className={labelCls}>
            <Input
              type="number"
              step="0.01"
              value={inputUnitCost || ''}
              onChange={(e) => setInputUnitCost(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label={tm('butcherCostMethod')} className={labelCls}>
            <select
              className={selectCls(darkMode)}
              value={costMethod}
              onChange={(e) => setCostMethod(e.target.value as ButcherCostMethod)}
            >
              {COST_METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {tm(m.labelKey)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tm('butcherLotNo')} className={labelCls}>
            <Input
              value={lotNo}
              placeholder={tm('butcherLotAuto')}
              onChange={(e) => setLotNo(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between pt-2">
          <h3 className={cn('text-sm font-bold', darkMode ? 'text-white' : 'text-slate-800')}>
            {tm('butcherOutputs')}
          </h3>
          <Button type="button" size="sm" variant="outline" onClick={addOutputRow}>
            <Plus className="w-4 h-4 mr-1" /> {tm('butcherAddLine')}
          </Button>
        </div>
        <p className={cn('text-[11px]', darkMode ? 'text-gray-400' : 'text-slate-500')}>
          {tm('butcherOutputProductHint')}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={darkMode ? 'text-gray-400' : 'text-slate-500'}>
                <th className="text-left py-2">{tm('product')}</th>
                <th className="text-right">{tm('butcherKg')}</th>
                {(costMethod === 'by_coefficient' || costMethod === 'manual') && (
                  <th className="text-right">{tm('butcherCoeff')}</th>
                )}
                {(costMethod === 'by_sale_price' || costMethod === 'manual') && (
                  <th className="text-right">{tm('butcherSalePrice')}</th>
                )}
                {costMethod === 'manual' && <th className="text-right">{tm('butcherManualUnitCost')}</th>}
                <th className="text-right">{tm('butcherUnitCost')}</th>
                <th className="text-right">{tm('butcherTotalCost')}</th>
                <th className="text-right">%</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {outputs.map((row) => {
                const line = preview.lines.find((l) => l.productId === row.productId && l.outputKg === row.outputKg);
                return (
                  <tr key={row.key} className={cn('border-t', darkMode ? 'border-gray-700' : 'border-slate-100')}>
                    <td className="py-1.5 pr-2">
                      <select
                        className={selectCls(darkMode)}
                        value={row.productId}
                        onChange={(e) => updateOutput(row.key, { productId: e.target.value })}
                      >
                        <option value="">{tm('butcherSelectProduct')}</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.stock != null ? ` (${Number(p.stock).toLocaleString('tr-TR')})` : ''}
                            {p.materialType ? ` · ${p.materialType}` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5">
                      <Input
                        type="number"
                        step="0.001"
                        className="h-8 text-right"
                        value={row.outputKg || ''}
                        onChange={(e) => updateOutput(row.key, { outputKg: Number(e.target.value) || 0 })}
                      />
                    </td>
                    {(costMethod === 'by_coefficient' || costMethod === 'manual') && (
                      <td className="py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-right"
                          value={row.coefficient ?? 1}
                          onChange={(e) => updateOutput(row.key, { coefficient: Number(e.target.value) || 1 })}
                        />
                      </td>
                    )}
                    {(costMethod === 'by_sale_price' || costMethod === 'manual') && (
                      <td className="py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-right"
                          value={row.salePrice || ''}
                          onChange={(e) => updateOutput(row.key, { salePrice: Number(e.target.value) || 0 })}
                        />
                      </td>
                    )}
                    {costMethod === 'manual' && (
                      <td className="py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-right"
                          value={row.manualUnitCost || ''}
                          onChange={(e) =>
                            updateOutput(row.key, { manualUnitCost: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                    )}
                    <td className="text-right font-mono">{line ? fmtMoney(line.unitCost) : '—'}</td>
                    <td className="text-right font-mono">{line ? fmtMoney(line.totalCost) : '—'}</td>
                    <td className="text-right">{line ? `${line.costSharePercent}%` : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="p-1 text-red-500"
                        onClick={() => setOutputs((prev) => prev.filter((x) => x.key !== row.key))}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Field label={tm('butcherNote')} className={labelCls}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {stockShortfall && (
          <div
            className={cn(
              'flex items-start gap-2 text-xs p-3 rounded-lg border',
              darkMode
                ? 'bg-amber-950/40 border-amber-700/50 text-amber-200'
                : 'bg-amber-50 border-amber-200 text-amber-800',
            )}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {tm('butcherStockShortfallWarn')}{' '}
              <span className="font-mono">
                ({fmtKg(inputStock)} / {fmtKg(inputQtyKg)})
              </span>
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" variant="outline" disabled={submitting} onClick={() => void submit(false)}>
            <Save className="w-4 h-4 mr-1" /> {tm('butcherSaveOpen')}
          </Button>
          <Button
            type="button"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            disabled={submitting || !preview.isBalanced || preview.outputQtyKg <= 0}
            onClick={() => void submit(true)}
          >
            <CheckCircle2 className="w-4 h-4 mr-1" /> {tm('butcherComplete')}
          </Button>
        </div>
      </div>

      <div className={cn('xl:col-span-2 rounded-xl border p-4 space-y-3 h-fit', card)}>
        <h3 className={cn('text-sm font-bold flex items-center gap-2', darkMode ? 'text-white' : 'text-slate-800')}>
          <FileText className="w-4 h-4 text-amber-500" /> {tm('butcherCostPreview')}
        </h3>
        <SummaryRow label={tm('butcherInputTotal')} value={`${fmtKg(preview.inputQtyKg)} / ${fmtMoney(preview.inputTotalCost)} TL`} darkMode={darkMode} />
        <SummaryRow label={tm('butcherOutputTotal')} value={fmtKg(preview.outputQtyKg)} darkMode={darkMode} />
        <SummaryRow
          label={tm('butcherWaste')}
          value={`${fmtKg(preview.wasteQtyKg)} (%${preview.wastePercent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })})`}
          darkMode={darkMode}
          warn={preview.wastePercent > 25}
        />
        <SummaryRow label={tm('butcherCostPerKg')} value={`${fmtMoney(preview.costPerKgSalable)} TL/kg`} darkMode={darkMode} />
        {!preview.isBalanced && (
          <div className="flex items-start gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 p-2 rounded-lg">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {tm('butcherOverOutput')}: {fmtKg(preview.overKg)}
          </div>
        )}
        {preview.isBalanced && preview.outputQtyKg > 0 && (
          <div className="flex items-start gap-2 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded-lg">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            {tm('butcherBalanceOk')}
          </div>
        )}
      </div>

      {completeSummary && (
        <PercentBodyModal
          onClose={() => {
            const nextPurchase = pendingPurchaseAfterSummary;
            setCompleteSummary(null);
            setPendingPurchaseAfterSummary(null);
            if (nextPurchase) setPurchasePromptOrder(nextPurchase);
          }}
          size="list"
          ariaLabel={tm('butcherCompleteSummaryTitle')}
        >
          <div className="shrink-0 px-5 py-4 border-b bg-gradient-to-r from-amber-600 to-amber-700 text-white flex justify-between items-center">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {tm('butcherCompleteSummaryTitle')}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              onClick={() => {
                const nextPurchase = pendingPurchaseAfterSummary;
                setCompleteSummary(null);
                setPendingPurchaseAfterSummary(null);
                if (nextPurchase) setPurchasePromptOrder(nextPurchase);
              }}
            >
              ✕
            </Button>
          </div>
          <PercentBodyModalScrollBody className={cn('p-5 space-y-3', darkMode ? 'bg-gray-900' : 'bg-slate-50')}>
            {completeSummary.orderNo && (
              <p className={cn('text-xs font-mono', darkMode ? 'text-gray-300' : 'text-slate-600')}>
                {tm('butcherOrderNo')}: {completeSummary.orderNo}
              </p>
            )}
            <p className={cn('text-xs', darkMode ? 'text-gray-400' : 'text-slate-500')}>
              {tm('butcherCompleteSummaryHint')}
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-700">
              <table className="w-full text-xs">
                <thead className={darkMode ? 'bg-gray-800 text-gray-400' : 'bg-slate-100 text-slate-500'}>
                  <tr>
                    <th className="text-left p-2">{tm('product')}</th>
                    <th className="text-left p-2">{tm('status')}</th>
                    <th className="text-right p-2">{tm('butcherKg')}</th>
                    <th className="text-right p-2">{tm('butcherStockBefore')}</th>
                    <th className="text-right p-2">{tm('butcherStockAfter')}</th>
                  </tr>
                </thead>
                <tbody>
                  {completeSummary.lines.map((line) => (
                    <tr
                      key={`${line.direction}-${line.productId}`}
                      className={cn('border-t', darkMode ? 'border-gray-700' : 'border-slate-100')}
                    >
                      <td className="p-2">
                        <div className={cn('font-medium', darkMode ? 'text-gray-100' : 'text-slate-800')}>
                          {line.productName}
                        </div>
                        {line.productCode && (
                          <div className="font-mono text-[10px] text-slate-400">{line.productCode}</div>
                        )}
                        {line.materialType && (
                          <div className="text-[10px] text-slate-400">{line.materialType}</div>
                        )}
                      </td>
                      <td className="p-2">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold',
                            line.direction === 'in'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700',
                          )}
                        >
                          {line.direction === 'in' ? tm('butcherStockIn') : tm('butcherStockOut')}
                        </span>
                      </td>
                      <td className="p-2 text-right font-mono">{fmtKg(line.qtyKg)}</td>
                      <td className="p-2 text-right font-mono">
                        {line.stockBefore.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-amber-700 dark:text-amber-300">
                        {line.stockAfter.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PercentBodyModalScrollBody>
          <div
            className={cn(
              'shrink-0 px-5 py-3 border-t flex justify-end',
              darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100',
            )}
          >
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                const nextPurchase = pendingPurchaseAfterSummary;
                setCompleteSummary(null);
                setPendingPurchaseAfterSummary(null);
                if (nextPurchase) setPurchasePromptOrder(nextPurchase);
              }}
            >
              {tm('butcherCloseSummary')}
            </Button>
          </div>
        </PercentBodyModal>
      )}

      {purchasePromptOrder && (
        <ButcherPurchaseInvoiceModal
          order={purchasePromptOrder}
          darkMode={darkMode}
          firmaName={selectedFirm?.firma_adi || selectedFirm?.name}
          donemName={selectedPeriod?.donem_adi || selectedPeriod?.name}
          onClose={() => setPurchasePromptOrder(null)}
          onDone={() => {
            setPurchasePromptOrder(null);
            onCompleted();
          }}
        />
      )}
    </div>
  );
}

function RecipeManager({
  products,
  recipes,
  settings,
  darkMode,
  onSaved,
}: {
  products: ProductOpt[];
  recipes: ButcherRecipe[];
  settings: ButcherSettings;
  darkMode: boolean;
  onSaved: () => void;
}) {
  const { tm } = useLanguage();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ButcherRecipe | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [animalType, setAnimalType] = useState<AnimalType>('sheep');
  const [inputProductId, setInputProductId] = useState('');
  const [wasteProductId, setWasteProductId] = useState('');
  const [costMethod, setCostMethod] = useState<ButcherCostMethod | ''>('');
  const [outputs, setOutputs] = useState<Array<{ key: string; productId: string; coefficient: number; ratio: string }>>([]);
  const [saving, setSaving] = useState(false);

  const inputProducts = useMemo(
    () => filterProductsByMaterial(products, 'semi_finished'),
    [products],
  );

  const openNew = () => {
    setEditing(null);
    setName('');
    setCode('');
    setAnimalType('sheep');
    setInputProductId('');
    setWasteProductId('');
    setCostMethod('');
    setOutputs([{ key: '1', productId: '', coefficient: 1, ratio: '' }]);
    setModalOpen(true);
  };

  const openEdit = (r: ButcherRecipe) => {
    setEditing(r);
    setName(r.name);
    setCode(r.code || '');
    setAnimalType(r.animalType);
    setInputProductId(r.inputProductId || '');
    setWasteProductId(r.wasteProductId || '');
    setCostMethod(r.costMethod || '');
    setOutputs(
      r.outputs.map((o, i) => ({
        key: String(i),
        productId: o.productId,
        coefficient: o.coefficient || 1,
        ratio: o.standardRatioPercent != null ? String(o.standardRatioPercent) : '',
      })),
    );
    setModalOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error(tm('butcherRecipeNameRequired'));
      return;
    }
    setSaving(true);
    try {
      await butcherProductionAPI.saveRecipe({
        id: editing?.id,
        code: code.trim() || null,
        name: name.trim(),
        animalType,
        inputProductId: inputProductId || null,
        wasteProductId: wasteProductId || null,
        costMethod: costMethod || null,
        isActive: true,
        outputs: outputs
          .filter((o) => o.productId)
          .map((o, i) => ({
            productId: o.productId,
            sortOrder: i,
            coefficient: o.coefficient || 1,
            standardRatioPercent: o.ratio ? Number(o.ratio) : null,
          })),
      });
      toast.success(tm('butcherRecipeSaved'));
      setModalOpen(false);
      onSaved();
    } catch (e) {
      toast.error(tm('butcherSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const card = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className={cn('text-sm', darkMode ? 'text-gray-400' : 'text-slate-500')}>
          {tm('butcherRecipesHint')}
        </p>
        <Button type="button" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> {tm('butcherNewRecipe')}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {recipes.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => openEdit(r)}
            className={cn('text-left rounded-xl border p-4 hover:border-amber-400 transition-colors', card)}
          >
            <div className={cn('font-bold text-sm', darkMode ? 'text-white' : 'text-slate-800')}>
              {r.code ? <span className="font-mono text-amber-600 mr-1.5">[{r.code}]</span> : null}
              {r.name}
            </div>
            <div className={cn('text-xs mt-1', darkMode ? 'text-gray-400' : 'text-slate-500')}>
              {tm(ANIMALS.find((a) => a.id === r.animalType)?.labelKey || 'butcherAnimalOther')} ·{' '}
              {r.outputs.length} {tm('butcherOutputLines')}
            </div>
            <div className={cn('text-xs mt-2 truncate', darkMode ? 'text-gray-500' : 'text-slate-400')}>
              {r.inputProductName || tm('butcherNoInput')} → {r.outputs.map((o) => o.productName).filter(Boolean).join(', ')}
            </div>
          </button>
        ))}
        {!recipes.length && (
          <div className={cn('col-span-full text-center py-12 text-sm', darkMode ? 'text-gray-500' : 'text-slate-400')}>
            {tm('butcherNoRecipes')}
          </div>
        )}
      </div>

      {modalOpen && (
        <PercentBodyModal onClose={() => setModalOpen(false)} size="wide" ariaLabel={tm('butcherRecipes')}>
          <div className={cn('shrink-0 px-5 py-4 border-b flex justify-between items-center', darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white')}>
            <h3 className="font-bold">{editing ? tm('butcherEditRecipe') : tm('butcherNewRecipe')}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              ✕
            </Button>
          </div>
          <PercentBodyModalScrollBody className={cn('p-5 space-y-3', darkMode ? 'bg-gray-900' : 'bg-slate-50')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input placeholder={tm('butcherRecipeCode')} value={code} onChange={(e) => setCode(e.target.value)} />
              <Input placeholder={tm('butcherRecipeName')} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select className={selectCls(darkMode)} value={animalType} onChange={(e) => setAnimalType(e.target.value as AnimalType)}>
                {ANIMALS.map((a) => (
                  <option key={a.id} value={a.id}>{tm(a.labelKey)}</option>
                ))}
              </select>
              <select className={selectCls(darkMode)} value={costMethod} onChange={(e) => setCostMethod(e.target.value as ButcherCostMethod | '')}>
                <option value="">{tm('butcherUseFirmDefault')} ({tm(COST_METHODS.find((m) => m.id === settings.defaultCostMethod)?.labelKey || 'butcherCostByWeight')})</option>
                {COST_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>{tm(m.labelKey)}</option>
                ))}
              </select>
              <select className={selectCls(darkMode)} value={inputProductId} onChange={(e) => setInputProductId(e.target.value)}>
                <option value="">{tm('butcherInputProduct')} ({tm('semiFinished')})</option>
                {inputProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                {inputProductId && !inputProducts.some((p) => p.id === inputProductId) && (
                  <option value={inputProductId}>
                    {products.find((p) => p.id === inputProductId)?.name || inputProductId}
                  </option>
                )}
              </select>
              <select className={selectCls(darkMode)} value={wasteProductId} onChange={(e) => setWasteProductId(e.target.value)}>
                <option value="">{tm('butcherWasteProductOptional')}</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              {outputs.map((o) => (
                <div key={o.key} className="flex gap-2 items-center">
                  <select className={cn(selectCls(darkMode), 'flex-1')} value={o.productId} onChange={(e) => setOutputs((prev) => prev.map((x) => (x.key === o.key ? { ...x, productId: e.target.value } : x)))}>
                    <option value="">{tm('butcherSelectProduct')}</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Input className="w-24" type="number" step="0.01" placeholder={tm('butcherCoeff')} value={o.coefficient} onChange={(e) => setOutputs((prev) => prev.map((x) => (x.key === o.key ? { ...x, coefficient: Number(e.target.value) || 1 } : x)))} />
                  <Input className="w-24" placeholder="%" value={o.ratio} onChange={(e) => setOutputs((prev) => prev.map((x) => (x.key === o.key ? { ...x, ratio: e.target.value } : x)))} />
                  <button type="button" onClick={() => setOutputs((prev) => prev.filter((x) => x.key !== o.key))}><Trash2 className="w-4 h-4 text-red-500" /></button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setOutputs((prev) => [...prev, { key: String(Date.now()), productId: '', coefficient: 1, ratio: '' }])}>
                <Plus className="w-4 h-4 mr-1" /> {tm('butcherAddLine')}
              </Button>
            </div>
          </PercentBodyModalScrollBody>
          <div className={cn('shrink-0 px-5 py-3 border-t flex justify-end gap-2', darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white')}>
            {editing?.id && (
              <Button
                type="button"
                variant="outline"
                className="text-red-600 mr-auto"
                onClick={async () => {
                  await butcherProductionAPI.deleteRecipe(editing.id!);
                  toast.success(tm('butcherRecipeDeleted'));
                  setModalOpen(false);
                  onSaved();
                }}
              >
                {tm('delete')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>{tm('cancel')}</Button>
            <Button type="button" className="bg-amber-600 hover:bg-amber-700 text-white" disabled={saving} onClick={() => void save()}>
              <Save className="w-4 h-4 mr-1" /> {tm('save')}
            </Button>
          </div>
        </PercentBodyModal>
      )}
    </div>
  );
}

function navigateToPurchaseInvoice(invoiceNo?: string | null) {
  const q = String(invoiceNo || '').trim();
  window.dispatchEvent(
    new CustomEvent('navigateToScreen', {
      detail: {
        screen: 'purchase-invoice-standard',
        ...(q ? { invoiceSearch: q } : {}),
      },
    }),
  );
}

function canCreatePurchaseFromOrder(o: ButcherOrder): boolean {
  if (o.status === 'cancelled') return false;
  if (!o.inputProductId || o.inputQtyKg <= 0) return false;
  return o.status === 'completed' || o.status === 'open' || o.status === 'draft';
}

function OrderList({
  orders,
  products,
  darkMode,
  onRefresh,
}: {
  orders: ButcherOrder[];
  products: ProductOpt[];
  darkMode: boolean;
  onRefresh: () => void;
}) {
  const { tm } = useLanguage();
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  const [purchaseOrder, setPurchaseOrder] = useState<ButcherOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<ButcherOrder | null>(null);
  const card = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  return (
    <div className={cn('rounded-xl border overflow-hidden', card)}>
      <table className="w-full text-xs">
        <thead className={darkMode ? 'bg-gray-900 text-gray-400' : 'bg-slate-100 text-slate-500'}>
          <tr>
            <th className="text-left p-3">{tm('butcherOrderNo')}</th>
            <th className="text-left">{tm('butcherRecipe')}</th>
            <th className="text-left">{tm('butcherInputProduct')}</th>
            <th className="text-right">{tm('butcherInputKg')}</th>
            <th className="text-right">{tm('butcherWaste')}</th>
            <th className="text-left">{tm('butcherLotNo')}</th>
            <th className="text-left">{tm('status')}</th>
            <th className="text-right">{tm('butcherInputUnitCost')}</th>
            <th className="text-right p-3">{tm('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className={cn('border-t', darkMode ? 'border-gray-700' : 'border-slate-100')}>
              <td className="p-3 font-mono">{o.orderNo}</td>
              <td>{o.recipeName || '—'}</td>
              <td>{o.inputProductName || '—'}</td>
              <td className="text-right">{fmtKg(o.inputQtyKg)}</td>
              <td className="text-right">{fmtKg(o.wasteQtyKg)} (%{o.wastePercent.toFixed(1)})</td>
              <td className="font-mono">{o.lotNo || '—'}</td>
              <td>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold',
                    o.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-700'
                      : o.status === 'cancelled'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-800',
                  )}
                >
                  {o.status}
                </span>
              </td>
              <td className="text-right font-mono">{fmtMoney(o.inputTotalCost)} TL</td>
              <td className="p-2 text-right">
                <div className="inline-flex flex-wrap gap-1 justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px]"
                    onClick={() => setDetailOrder(o)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    {tm('butcherViewDetail')}
                  </Button>
                  {o.purchaseInvoiceId || o.purchaseInvoiceNo ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px]"
                      onClick={() => navigateToPurchaseInvoice(o.purchaseInvoiceNo)}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {tm('butcherOpenPurchaseInvoice')}
                    </Button>
                  ) : canCreatePurchaseFromOrder(o) ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-[10px] bg-teal-600 hover:bg-teal-700 text-white"
                      onClick={() => setPurchaseOrder(o)}
                    >
                      <FilePlus2 className="w-3 h-3 mr-1" />
                      {tm('butcherCreatePurchaseInvoice')}
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
          {!orders.length && (
            <tr>
              <td colSpan={9} className="p-8 text-center text-slate-400">
                {tm('butcherNoOrders')}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {detailOrder && (
        <ButcherOrderDetailModal
          order={detailOrder}
          products={products}
          darkMode={darkMode}
          onClose={() => setDetailOrder(null)}
        />
      )}

      {purchaseOrder && (
        <ButcherPurchaseInvoiceModal
          order={purchaseOrder}
          darkMode={darkMode}
          firmaName={selectedFirm?.firma_adi || selectedFirm?.name}
          donemName={selectedPeriod?.donem_adi || selectedPeriod?.name}
          onClose={() => setPurchaseOrder(null)}
          onDone={() => {
            setPurchaseOrder(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function ButcherOrderDetailModal({
  order,
  products,
  darkMode,
  onClose,
}: {
  order: ButcherOrder;
  products: ProductOpt[];
  darkMode: boolean;
  onClose: () => void;
}) {
  const { tm } = useLanguage();
  const [fullOrder, setFullOrder] = useState<ButcherOrder>(order);
  const [movements, setMovements] = useState<
    Awaited<ReturnType<typeof stockMovementAPI.listByOrderDocumentNo>>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [fresh, mov] = await Promise.all([
          order.id ? butcherProductionAPI.getOrderById(order.id) : Promise.resolve(null),
          stockMovementAPI.listByOrderDocumentNo(order.orderNo),
        ]);
        if (cancelled) return;
        if (fresh) setFullOrder(fresh);
        setMovements(mov);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id, order.orderNo]);

  const muted = darkMode ? 'text-gray-400' : 'text-slate-500';
  const text = darkMode ? 'text-gray-100' : 'text-slate-800';

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('butcherOrderDetail')}>
      <div className="shrink-0 px-5 py-4 border-b bg-gradient-to-r from-amber-600 to-amber-700 text-white flex justify-between items-center">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Eye className="w-4 h-4" />
          {tm('butcherOrderDetail')} — {fullOrder.orderNo}
        </h3>
        <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={onClose}>
          ✕
        </Button>
      </div>
      <PercentBodyModalScrollBody className={cn('p-5 space-y-4', darkMode ? 'bg-gray-900' : 'bg-slate-50')}>
        {loading && <p className={cn('text-xs', muted)}>{tm('loading')}</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <div className={muted}>{tm('butcherInputProduct')}</div>
            <div className={cn('font-medium', text)}>{fullOrder.inputProductName || '—'}</div>
          </div>
          <div>
            <div className={muted}>{tm('butcherInputKg')}</div>
            <div className={cn('font-mono', text)}>{fmtKg(fullOrder.inputQtyKg)}</div>
          </div>
          <div>
            <div className={muted}>{tm('butcherWaste')}</div>
            <div className={cn('font-mono', text)}>
              {fmtKg(fullOrder.wasteQtyKg)} (%{fullOrder.wastePercent.toFixed(1)})
            </div>
          </div>
          <div>
            <div className={muted}>{tm('butcherLotNo')}</div>
            <div className={cn('font-mono', text)}>{fullOrder.lotNo || '—'}</div>
          </div>
        </div>

        <div>
          <h4 className={cn('text-xs font-bold mb-2', text)}>{tm('butcherOutputs')}</h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead className={darkMode ? 'bg-gray-800 text-gray-400' : 'bg-slate-100 text-slate-500'}>
                <tr>
                  <th className="text-left p-2">{tm('product')}</th>
                  <th className="text-right p-2">{tm('butcherKg')}</th>
                  <th className="text-right p-2">{tm('butcherUnitCost')}</th>
                  <th className="text-right p-2">{tm('butcherTotalCost')}</th>
                  <th className="text-right p-2">{tm('butcherStockAfter')}</th>
                </tr>
              </thead>
              <tbody>
                {(fullOrder.outputs || []).map((out, idx) => {
                  const prod = products.find((p) => p.id === out.productId);
                  const stockNow =
                    prod?.stock != null
                      ? Number(prod.stock)
                      : movements.find((m) => m.product_id === out.productId)?.product_stock;
                  return (
                    <tr key={`${out.productId}-${idx}`} className={cn('border-t', darkMode ? 'border-gray-700' : 'border-slate-100')}>
                      <td className={cn('p-2', text)}>
                        {out.productName || prod?.name || out.productId}
                        {prod?.materialType && (
                          <div className="text-[10px] text-slate-400">{prod.materialType}</div>
                        )}
                      </td>
                      <td className="p-2 text-right font-mono">{fmtKg(out.outputKg)}</td>
                      <td className="p-2 text-right font-mono">{fmtMoney(out.unitCost)}</td>
                      <td className="p-2 text-right font-mono">{fmtMoney(out.totalCost)}</td>
                      <td className="p-2 text-right font-mono font-bold text-amber-700 dark:text-amber-300">
                        {stockNow != null
                          ? stockNow.toLocaleString('tr-TR', { maximumFractionDigits: 3 })
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
                {!(fullOrder.outputs || []).length && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-400">
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h4 className={cn('text-xs font-bold mb-2', text)}>{tm('butcherStockMovements')}</h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead className={darkMode ? 'bg-gray-800 text-gray-400' : 'bg-slate-100 text-slate-500'}>
                <tr>
                  <th className="text-left p-2">{tm('butcherOrderNo')}</th>
                  <th className="text-left p-2">{tm('product')}</th>
                  <th className="text-left p-2">{tm('status')}</th>
                  <th className="text-right p-2">{tm('butcherKg')}</th>
                  <th className="text-right p-2">{tm('butcherStockAfter')}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m, idx) => (
                  <tr key={`${m.document_no}-${idx}`} className={cn('border-t', darkMode ? 'border-gray-700' : 'border-slate-100')}>
                    <td className="p-2 font-mono text-[10px]">{m.document_no}</td>
                    <td className={cn('p-2', text)}>{m.product_name || m.product_id}</td>
                    <td className="p-2">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold',
                          m.movement_type === 'in'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700',
                        )}
                      >
                        {m.movement_type === 'in' ? tm('butcherStockIn') : tm('butcherStockOut')}
                      </span>
                    </td>
                    <td className="p-2 text-right font-mono">{fmtKg(m.quantity)}</td>
                    <td className="p-2 text-right font-mono">
                      {m.product_stock != null
                        ? m.product_stock.toLocaleString('tr-TR', { maximumFractionDigits: 3 })
                        : '—'}
                    </td>
                  </tr>
                ))}
                {!movements.length && !loading && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-400">
                      {tm('butcherNoStockMovements')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </PercentBodyModalScrollBody>
      <div
        className={cn(
          'shrink-0 px-5 py-3 border-t flex justify-end',
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100',
        )}
      >
        <Button type="button" variant="outline" onClick={onClose}>
          {tm('butcherCloseSummary')}
        </Button>
      </div>
    </PercentBodyModal>
  );
}

function ButcherPurchaseInvoiceModal({
  order,
  darkMode,
  firmaName,
  donemName,
  onClose,
  onDone,
}: {
  order: ButcherOrder;
  darkMode: boolean;
  firmaName?: string;
  donemName?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { tm } = useLanguage();
  const [suppliers, setSuppliers] = useState<InvoiceCariItem[]>([]);
  const [supplier, setSupplier] = useState<InvoiceCariItem | null>(
    order.supplierId
      ? { id: order.supplierId, name: order.supplierName || '', code: '' }
      : null,
  );
  const [showCari, setShowCari] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await supplierAPI.getAll({ cardType: 'supplier' });
        if (cancelled) return;
        const mapped: InvoiceCariItem[] = (rows || []).map((s: any) => ({
          id: String(s.id),
          code: String(s.code || ''),
          name: String(s.name || ''),
          phone: String(s.phone || ''),
        }));
        setSuppliers(mapped);
        if (order.supplierId) {
          const found = mapped.find((m) => m.id === order.supplierId);
          if (found) setSupplier(found);
        } else {
          setShowCari(true);
        }
      } catch (e) {
        console.warn('[ButcherPurchase] suppliers:', e);
        if (!order.supplierId) setShowCari(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.supplierId]);

  const create = async () => {
    if (!supplier?.id) {
      toast.error(tm('butcherSupplierRequired'));
      setShowCari(true);
      return;
    }
    if (!order.id || !order.inputProductId || order.inputQtyKg <= 0) {
      toast.error(tm('butcherPurchaseNeedInput'));
      return;
    }
    setBusy(true);
    try {
      const result = await ButcherProductionService.createPurchaseInvoiceFromOrder({
        orderId: order.id,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierCode: supplier.code,
        firmaName,
        donemName,
      });
      if (!result.ok) {
        toast.error(result.error || tm('butcherPurchaseCreateError'));
        return;
      }
      if (result.alreadyLinked) {
        toast.info(tm('butcherPurchaseAlreadyLinked'));
      } else {
        toast.success(
          `${tm('butcherPurchaseCreated')}${result.invoiceNo ? `: ${result.invoiceNo}` : ''}`,
        );
      }
      onDone();
      navigateToPurchaseInvoice(result.invoiceNo);
    } finally {
      setBusy(false);
    }
  };

  const box = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white';
  const muted = darkMode ? 'text-gray-400' : 'text-slate-500';
  const text = darkMode ? 'text-gray-100' : 'text-slate-800';

  return (
    <>
      <PercentBodyModal onClose={busy ? () => undefined : onClose} size="compact" ariaLabel={tm('butcherPurchaseModalTitle')}>
        <div className={cn('shrink-0 px-5 py-4 border-b flex justify-between items-center bg-gradient-to-r from-teal-600 to-teal-700 text-white')}>
          <h3 className="font-bold text-sm flex items-center gap-2">
            <FilePlus2 className="w-4 h-4" />
            {tm('butcherPurchaseModalTitle')}
          </h3>
          <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/10" disabled={busy} onClick={onClose}>
            ✕
          </Button>
        </div>
        <PercentBodyModalScrollBody className={cn('p-5 space-y-3', darkMode ? 'bg-gray-900' : 'bg-slate-50')}>
          <p className={cn('text-xs leading-relaxed', muted)}>{tm('butcherPurchaseModalHint')}</p>
          <p className={cn('text-[11px] leading-relaxed', muted)}>{tm('butcherPurchaseSkipHint')}</p>
          <div className={cn('rounded-xl border p-3 space-y-2 text-xs', box, darkMode ? 'border-gray-700' : 'border-slate-200')}>
            <div className="flex justify-between gap-2">
              <span className={muted}>{tm('butcherOrderNo')}</span>
              <span className={cn('font-mono font-semibold', text)}>{order.orderNo}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className={muted}>{tm('butcherInputProduct')}</span>
              <span className={cn('font-medium text-right', text)}>{order.inputProductName || '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className={muted}>{tm('butcherInputKg')}</span>
              <span className={cn('font-mono', text)}>{fmtKg(order.inputQtyKg)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className={muted}>{tm('butcherInputUnitCost')}</span>
              <span className={cn('font-mono', text)}>{fmtMoney(order.inputUnitCost)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className={muted}>{tm('butcherTotalCost')}</span>
              <span className={cn('font-mono font-bold', text)}>{fmtMoney(order.inputTotalCost)}</span>
            </div>
            {order.warehouseId && (
              <div className="flex justify-between gap-2">
                <span className={muted}>{tm('butcherWarehouse')}</span>
                <span className={cn('font-mono text-[10px]', text)}>{order.warehouseId.slice(0, 8)}…</span>
              </div>
            )}
          </div>
          <div>
            <label className={cn('block text-[11px] font-bold uppercase tracking-wider mb-1.5', muted)}>
              {tm('butcherSelectSupplier')} *
            </label>
            <button
              type="button"
              onClick={() => setShowCari(true)}
              className={cn(
                'w-full flex items-center gap-2 px-4 py-3 rounded-2xl border text-left text-sm font-medium',
                !supplier
                  ? darkMode
                    ? 'bg-gray-800 border-teal-500 ring-1 ring-teal-500/40 text-gray-100'
                    : 'bg-white border-teal-500 ring-1 ring-teal-200 text-slate-800'
                  : darkMode
                    ? 'bg-gray-800 border-gray-600 text-gray-100 hover:border-teal-500'
                    : 'bg-white border-slate-200 text-slate-800 hover:border-teal-400',
              )}
            >
              <Truck className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="flex-1 truncate">
                {supplier ? `${supplier.code ? `${supplier.code} — ` : ''}${supplier.name}` : tm('butcherSelectSupplier')}
              </span>
            </button>
          </div>
        </PercentBodyModalScrollBody>
        <div className={cn('shrink-0 px-5 py-3 border-t flex justify-end gap-2', darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100')}>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {tm('butcherPurchaseSkip')}
          </Button>
          <Button
            type="button"
            className="bg-teal-600 hover:bg-teal-700 text-white"
            disabled={busy || !supplier?.id}
            onClick={() => void create()}
          >
            <FilePlus2 className="w-4 h-4 mr-1" />
            {tm('butcherCreatePurchaseInvoice')}
          </Button>
        </div>
      </PercentBodyModal>

      {showCari && (
        <InvoiceCariSelectModal
          mode="supplier"
          items={suppliers}
          selectedId={supplier?.id}
          onClose={() => setShowCari(false)}
          onSelect={(item) => {
            setSupplier(item);
            setShowCari(false);
          }}
        />
      )}
    </>
  );
}

function ReportsPanel({ darkMode }: { darkMode: boolean }) {
  const { tm } = useLanguage();
  const [report, setReport] = useState<ReportId>('history');
  const [history, setHistory] = useState<ButcherOrder[]>([]);
  const [waste, setWaste] = useState<Awaited<ReturnType<typeof butcherProductionAPI.reportWasteAnalysis>>>([]);
  const [yieldRows, setYieldRows] = useState<Awaited<ReturnType<typeof butcherProductionAPI.reportProductCostYield>>>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, w, y] = await Promise.all([
        butcherProductionAPI.reportProductionHistory(150),
        butcherProductionAPI.reportWasteAnalysis(),
        butcherProductionAPI.reportProductCostYield(),
      ]);
      setHistory(h);
      setWaste(w);
      setYieldRows(y);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const card = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const reports: { id: ReportId; label: string; icon: React.ElementType }[] = [
    { id: 'history', label: tm('butcherReportHistory'), icon: History },
    { id: 'waste', label: tm('butcherReportWaste'), icon: Flame },
    { id: 'yield', label: tm('butcherReportYield'), icon: TrendingUp },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {reports.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setReport(id)}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border',
              report === id
                ? 'bg-amber-600 text-white border-amber-600'
                : darkMode
                  ? 'bg-gray-800 border-gray-700 text-gray-300'
                  : 'bg-white border-slate-200 text-slate-600',
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
        <Button type="button" size="sm" variant="outline" className="ml-auto" disabled={loading} onClick={() => void load()}>
          {tm('refresh')}
        </Button>
      </div>

      <div className={cn('rounded-xl border overflow-x-auto', card)}>
        {report === 'history' && (
          <table className="w-full text-xs">
            <thead className={darkMode ? 'bg-gray-900 text-gray-400' : 'bg-slate-100 text-slate-500'}>
              <tr>
                <th className="text-left p-3">{tm('butcherOrderNo')}</th>
                <th className="text-left">{tm('date')}</th>
                <th className="text-left">{tm('butcherInputProduct')}</th>
                <th className="text-right">{tm('butcherInputKg')}</th>
                <th className="text-right">{tm('butcherOutputTotal')}</th>
                <th className="text-right">{tm('butcherWaste')}</th>
                <th className="text-right">{tm('butcherCostPerKg')}</th>
                <th className="text-left">{tm('status')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((o) => (
                <tr key={o.id} className={cn('border-t', darkMode ? 'border-gray-700' : 'border-slate-100')}>
                  <td className="p-3 font-mono">{o.orderNo}</td>
                  <td>{o.completedAt || o.createdAt ? new Date(o.completedAt || o.createdAt!).toLocaleString('tr-TR') : '—'}</td>
                  <td>{o.inputProductName}</td>
                  <td className="text-right">{fmtKg(o.inputQtyKg)}</td>
                  <td className="text-right">{fmtKg(o.outputQtyKg)}</td>
                  <td className="text-right">{fmtKg(o.wasteQtyKg)}</td>
                  <td className="text-right">{fmtMoney(o.costPerKgSalable)}</td>
                  <td>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {report === 'waste' && (
          <table className="w-full text-xs">
            <thead className={darkMode ? 'bg-gray-900 text-gray-400' : 'bg-slate-100 text-slate-500'}>
              <tr>
                <th className="text-left p-3">{tm('butcherAnimal')}</th>
                <th className="text-left">{tm('butcherRecipe')}</th>
                <th className="text-right">{tm('butcherOrderCount')}</th>
                <th className="text-right">{tm('butcherInputKg')}</th>
                <th className="text-right">{tm('butcherOutputTotal')}</th>
                <th className="text-right">{tm('butcherWaste')}</th>
                <th className="text-right">{tm('butcherAvgWastePct')}</th>
                <th className="text-right">{tm('butcherInputTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {waste.map((r, i) => (
                <tr key={i} className={cn('border-t', darkMode ? 'border-gray-700' : 'border-slate-100')}>
                  <td className="p-3">{r.animalType}</td>
                  <td>{r.recipeName}</td>
                  <td className="text-right">{r.orderCount}</td>
                  <td className="text-right">{fmtKg(r.inputKg)}</td>
                  <td className="text-right">{fmtKg(r.outputKg)}</td>
                  <td className="text-right">{fmtKg(r.wasteKg)}</td>
                  <td className="text-right">%{r.avgWastePercent.toFixed(1)}</td>
                  <td className="text-right">{fmtMoney(r.totalInputCost)} TL</td>
                </tr>
              ))}
              {!waste.length && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">{tm('butcherNoOrders')}</td></tr>
              )}
            </tbody>
          </table>
        )}

        {report === 'yield' && (
          <table className="w-full text-xs">
            <thead className={darkMode ? 'bg-gray-900 text-gray-400' : 'bg-slate-100 text-slate-500'}>
              <tr>
                <th className="text-left p-3">{tm('product')}</th>
                <th className="text-right">{tm('butcherTotalKg')}</th>
                <th className="text-right">{tm('butcherTotalCost')}</th>
                <th className="text-right">{tm('butcherAvgUnitCost')}</th>
                <th className="text-right">{tm('butcherAvgShare')}</th>
                <th className="text-right">{tm('butcherLineCount')}</th>
              </tr>
            </thead>
            <tbody>
              {yieldRows.map((r) => (
                <tr key={r.productId} className={cn('border-t', darkMode ? 'border-gray-700' : 'border-slate-100')}>
                  <td className="p-3">{r.productName}</td>
                  <td className="text-right">{fmtKg(r.totalKg)}</td>
                  <td className="text-right">{fmtMoney(r.totalCost)} TL</td>
                  <td className="text-right">{fmtMoney(r.avgUnitCost)}</td>
                  <td className="text-right">%{r.avgSharePercent.toFixed(1)}</td>
                  <td className="text-right">{r.lineCount}</td>
                </tr>
              ))}
              {!yieldRows.length && (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">{tm('butcherNoOrders')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({
  settings,
  darkMode,
  onSaved,
}: {
  settings: ButcherSettings;
  darkMode: boolean;
  onSaved: (s: ButcherSettings) => void;
}) {
  const { tm } = useLanguage();
  const [method, setMethod] = useState<ButcherCostMethod>(settings.defaultCostMethod);
  const [allowWithoutStock, setAllowWithoutStock] = useState(settings.allowCompleteWithoutStock !== false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMethod(settings.defaultCostMethod);
    setAllowWithoutStock(settings.allowCompleteWithoutStock !== false);
  }, [settings.defaultCostMethod, settings.allowCompleteWithoutStock]);

  const save = async () => {
    setSaving(true);
    try {
      const next: ButcherSettings = {
        ...settings,
        defaultCostMethod: method,
        allowCompleteWithoutStock: allowWithoutStock,
      };
      await butcherProductionAPI.saveSettings(next);
      onSaved(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn('max-w-lg rounded-xl border p-5 space-y-4', darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200')}>
      <h3 className={cn('font-bold text-sm', darkMode ? 'text-white' : 'text-slate-800')}>{tm('butcherDefaultCostMethod')}</h3>
      <p className={cn('text-xs', darkMode ? 'text-gray-400' : 'text-slate-500')}>{tm('butcherSettingsHint')}</p>
      <select className={selectCls(darkMode)} value={method} onChange={(e) => setMethod(e.target.value as ButcherCostMethod)}>
        {COST_METHODS.map((m) => (
          <option key={m.id} value={m.id}>{tm(m.labelKey)}</option>
        ))}
      </select>

      <label className={cn('flex items-start gap-3 cursor-pointer rounded-lg border p-3', darkMode ? 'border-gray-600' : 'border-slate-200')}>
        <input
          type="checkbox"
          className="mt-0.5"
          checked={allowWithoutStock}
          onChange={(e) => setAllowWithoutStock(e.target.checked)}
        />
        <span className="space-y-1">
          <span className={cn('block text-sm font-semibold', darkMode ? 'text-gray-100' : 'text-slate-800')}>
            {tm('butcherAllowWithoutStock')}
          </span>
          <span className={cn('block text-xs', darkMode ? 'text-gray-400' : 'text-slate-500')}>
            {tm('butcherAllowWithoutStockHint')}
          </span>
        </span>
      </label>

      <Button type="button" className="bg-amber-600 hover:bg-amber-700 text-white" disabled={saving} onClick={() => void save()}>
        <Save className="w-4 h-4 mr-1" /> {tm('save')}
      </Button>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={cn('text-[11px] font-semibold uppercase tracking-wide', className)}>{label}</span>
      {children}
    </label>
  );
}

function SummaryRow({
  label,
  value,
  darkMode,
  warn,
}: {
  label: string;
  value: string;
  darkMode: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className={darkMode ? 'text-gray-400' : 'text-slate-500'}>{label}</span>
      <span className={cn('font-mono font-semibold', warn ? 'text-amber-600' : darkMode ? 'text-white' : 'text-slate-800')}>
        {value}
      </span>
    </div>
  );
}

function selectCls(darkMode: boolean) {
  return cn(
    'w-full h-9 rounded-md border px-2 text-xs',
    darkMode ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-slate-200 text-slate-800',
  );
}

export default ButcherProductionModule;
