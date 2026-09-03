/**
 * Üretim Modülü — Ana Ekran
 *  - Sekme 1: Reçeteler (BOM) — RecipeList + RecipeEditorModal
 *  - Sekme 2: Üretim Emirleri — OrderList + OrderCompleteDialog
 *  - Kasap ile aynı çekirdek (RecipeList kind badge + OrderList kind badge)
 *
 * Not: Eski ProductionRecipeModule + ButcherProductionModule modüllerine
 * artık ihtiyaç yok; bu hub onların yerini alır.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Beef, Briefcase, ChefHat, Factory, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ButcherFullModule } from './butcher/ButcherFullModule';

import { unifiedProductionAPI } from '@/services/production/unifiedProductionAPI';
import type {
  ProductionOrder,
  ProductionRecipe,
  ButcherOrder,
  ButcherRecipe,
  ProductionMode,
} from '@/services/production/types';
import { useProductStore } from '@/store/useProductStore';

import { RecipeList, type AnyRecipe } from './RecipeList';
import { RecipeEditorModal, type RecipeDraft } from './RecipeEditorModal';
import { OrderList } from './OrderList';
import { OrderCompleteDialog } from './OrderCompleteDialog';

type AnyOrder =
  | { kind: 'general'; data: ProductionOrder }
  | { kind: 'butcher'; data: ButcherOrder };

export function ProductionHubModule() {
  const { products, loadProducts } = useProductStore();
  const [activeTab, setActiveTab] = useState<'recipes' | 'orders'>('recipes');

  /**
   * Kasap Klasik Modu — eski 5 sekmeli tasarımı (Voucher/Reçeteler/Liste/
   * Raporlar/Ayarlar) açar. Yeni sadeleştirilmiş tasarımı tercih edenler
   * için toggle varsayılan olarak kapalı; kasap kullanıcıları için manuel açılır.
   */
  const [butcherClassicMode, setButcherClassicMode] = useState(false);

  const [recipes, setRecipes] = useState<ProductionRecipe[]>([]);
  const [butcherRecipes, setButcherRecipes] = useState<ButcherRecipe[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [butcherOrders, setButcherOrders] = useState<ButcherOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  const [completing, setCompleting] = useState<AnyOrder | null>(null);
  const [creatingMode, setCreatingMode] = useState<ProductionMode | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [generalRecipes, butcher, generalOrders, butcherOrderList] = await Promise.all([
        unifiedProductionAPI.production.getRecipes(),
        unifiedProductionAPI.butcher.getRecipes(),
        unifiedProductionAPI.production.getOrders(),
        unifiedProductionAPI.butcher.getOrders(),
      ]);

      // Debug: kasap reçetelerinin listelenme durumu
      // (kullanıcı "kasap reçeteleri görünmüyor" raporu için).
      // eslint-disable-next-line no-console
      console.log('[ProductionHub] recipes', {
        general: generalRecipes.length,
        butcher: butcher.length,
        generalSample: generalRecipes.slice(0, 3).map((r) => ({
          id: r.id,
          name: r.name,
          productId: r.productId,
        })),
        butcherSample: butcher.slice(0, 3).map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          animalType: r.animalType,
          isActive: r.isActive,
          outputCount: r.outputs?.length ?? 0,
        })),
      });

      // Satın alma fatura bağlantı meta'larını sırayla yükle (N+1 yerine tek sorgu hedefi)
      const orderIds = generalOrders.map((o) => o.id).filter(Boolean) as string[];
      const metaMap = await unifiedProductionAPI.production.getOrdersPurchaseInvoiceMeta(
        orderIds,
      );
      const decoratedOrders = generalOrders.map((o) => {
        const meta = o.id ? metaMap[o.id] : null;
        return {
          ...o,
          purchaseInvoiceId: meta?.purchaseInvoiceId ?? null,
          purchaseInvoiceNo: meta?.purchaseInvoiceNo ?? null,
          supplierId: meta?.supplierId ?? null,
          supplierName: meta?.supplierName ?? null,
        };
      });

      setRecipes(generalRecipes);
      setButcherRecipes(butcher);
      setOrders(decoratedOrders);
      setButcherOrders(butcherOrderList);
    } catch (e) {
      console.error('[ProductionHubModule] refresh failed:', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!products.length) loadProducts();
  }, [refresh, products.length, loadProducts]);

  /* ═══════════════════════════════════════════════════════════════════════
   * Reçete işlemleri
   * ═══════════════════════════════════════════════════════════════════════ */

  const handleCreateRecipe = (kind: ProductionMode) => {
    if (kind === 'butcher') {
      setDraft({
        kind: 'butcher',
        data: {
          name: '',
          animalType: 'sheep',
          isActive: true,
          outputs: [],
        } as ButcherRecipe,
      });
    } else {
      setDraft({
        kind: 'general',
        data: {
          productId: '',
          productName: '',
          name: '',
          totalCost: 0,
          wastagePercent: 0,
          isActive: true,
          ingredients: [],
        } as ProductionRecipe,
      });
    }
  };

  const handleEditRecipe = (recipe: AnyRecipe) => {
    setDraft(recipe);
  };

  const handleSaveRecipe = async (recipe: RecipeDraft) => {
    if (recipe.kind === 'general') {
      await unifiedProductionAPI.production.saveRecipe(recipe.data);
      toast.success('Reçete kaydedildi');
    } else {
      await unifiedProductionAPI.butcher.saveRecipe(recipe.data);
      toast.success('Kasap reçetesi kaydedildi');
    }
    setDraft(null);
    refresh();
  };

  const handleDeleteRecipe = async (recipe: AnyRecipe) => {
    if (!confirm(`${recipe.data.name} silinsin mi?`)) return;
    try {
      if (recipe.kind === 'general') {
        toast.warning('Genel reçete pasif yapılamaz — reçeteyi kaldırmak için DB yöneticisine başvurun.');
        return;
      }
      await unifiedProductionAPI.butcher.deleteRecipe(recipe.data.id!);
      toast.success('Kasap reçetesi silindi');
      refresh();
    } catch (e) {
      toast.error('Silinemedi');
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * Üretim emri işlemleri
   * ═══════════════════════════════════════════════════════════════════════ */

  const handleCreateOrder = (kind: ProductionMode) => {
    setCreatingMode(kind);
    // Hızlı üretim: minimal bir taslak hemen oluşturulur
    if (kind === 'butcher') {
      handleCreateButcherOrder();
    } else {
      handleCreateGeneralOrder();
    }
  };

  const handleCreateGeneralOrder = async () => {
    const recipeId = prompt(
      'Üretim emri için reçete id giriniz (mevcut reçetelerden):',
      recipes[0]?.id || '',
    );
    if (!recipeId) return;
    const planned = Number(prompt('Planlanan üretim miktarı:', '100')) || 100;
    try {
      await unifiedProductionAPI.production.saveOrder({
        recipeId,
        status: 'draft',
        plannedQty: planned,
        producedQty: 0,
      } as ProductionOrder);
      toast.success('Üretim emri taslağı oluşturuldu');
      refresh();
    } catch (e) {
      toast.error('Oluşturulamadı');
    }
  };

  const handleCreateButcherOrder = async () => {
    const recipeId = prompt('Kasap reçete id giriniz:', butcherRecipes[0]?.id || '');
    if (!recipeId) return;
    const recipe = butcherRecipes.find((r) => r.id === recipeId);
    if (!recipe) {
      toast.error('Reçete bulunamadı');
      return;
    }
    const inputKg = Number(prompt('Girdi (kg):', '10')) || 10;
    try {
      await unifiedProductionAPI.butcher.saveOrder({
        recipeId,
        animalType: recipe.animalType,
        inputProductId: '',
        inputQtyKg: inputKg,
        inputUnitCost: 0,
        inputTotalCost: 0,
        costMethod: recipe.costMethod || 'by_weight',
        outputQtyKg: 0,
        wasteQtyKg: 0,
        wastePercent: 0,
        wasteCostAllocated: 0,
        costPerKgSalable: 0,
        status: 'draft',
        outputs: [],
      } as any);
      toast.success('Kasap fişi taslağı oluşturuldu');
      refresh();
    } catch (e) {
      toast.error('Oluşturulamadı');
    }
  };

  const handleCompleteOrder = (order: AnyOrder) => {
    setCompleting(order);
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * Render
   * ═══════════════════════════════════════════════════════════════════════ */

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Üretim Yönetimi</h2>
            <p className="text-xs text-slate-400">
              Reçete → Üretim Emri → Tamamla → (opsiyonel) Alış Faturası
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-300">
          {loading && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Yükleniyor…</span>
            </>
          )}
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 cursor-pointer transition-colors">
            <Beef className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-medium">Kasap Klasik</span>
            <input
              type="checkbox"
              checked={butcherClassicMode}
              onChange={(e) => setButcherClassicMode(e.target.checked)}
              className="ml-1 h-3.5 w-3.5 accent-amber-500"
              aria-label="Kasap klasik modunu aç/kapat"
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-hidden p-6">
        {butcherClassicMode ? (
          <ButcherFullModule embedded />
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'recipes' | 'orders')}
            className="h-full flex flex-col gap-6"
          >
          <TabsList className="bg-white border border-slate-200 p-1 self-start shadow-sm">
            <TabsTrigger
              value="recipes"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
            >
              <ChefHat className="w-4 h-4 mr-2" /> Reçeteler
            </TabsTrigger>
            <TabsTrigger
              value="orders"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
            >
              <Factory className="w-4 h-4 mr-2" /> Üretim Emirleri
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="recipes"
            className="flex-1 overflow-auto m-0 mt-0 bg-transparent border-0 shadow-none"
          >
            <RecipeList
              general={recipes}
              butcher={butcherRecipes}
              loading={loading}
              onCreate={handleCreateRecipe}
              onEdit={handleEditRecipe}
              onDelete={handleDeleteRecipe}
            />
          </TabsContent>

          <TabsContent
            value="orders"
            className="flex-1 overflow-hidden m-0 mt-0 bg-transparent border-0 shadow-none"
          >
            <OrderList
              general={orders}
              butcher={butcherOrders}
              loading={loading}
              onCreate={handleCreateOrder}
              onComplete={handleCompleteOrder}
              onRefresh={refresh}
            />
          </TabsContent>
          </Tabs>
        )}
      </div>

      {draft && (
        <RecipeEditorModal
          draft={draft}
          onClose={() => setDraft(null)}
          onSave={handleSaveRecipe}
        />
      )}

      {completing && (
        <OrderCompleteDialog
          order={completing}
          onClose={() => setCompleting(null)}
          onCompleted={refresh}
        />
      )}
    </div>
  );
}