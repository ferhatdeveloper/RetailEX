import React, { useState, useMemo, useEffect } from 'react';
import {
  Briefcase,
  GitBranch,
  Plus,
  Save,
  Trash2,
  Play,
  CheckCircle,
  Clock,
  Layers,
  Search,
  ChevronRight,
  Package,
  ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from 'sonner';
import { productionAPI, ProductionRecipe, ProductionOrder } from '@/services/api/productionAPI';
import { ProductionService } from '@/services/productionService';
import { useProductStore } from '@/store/useProductStore';
import { cn } from '@/components/ui/utils';

export function ProductionModule() {
  const [activeTab, setActiveTab] = useState('orders');
  const [recipes, setRecipes] = useState<ProductionRecipe[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);

  const { products } = useProductStore();

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, o] = await Promise.all([
        productionAPI.getRecipes(),
        productionAPI.getOrders()
      ]);
      setRecipes(r);
      setOrders(o);
    } catch (error) {
      toast.error('Veriler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCompleteOrder = async (orderId: string, qty: number) => {
    const success = await ProductionService.completeOrder(orderId, qty);
    if (success) {
      toast.success('Üretim tamamlandı, stoklar güncellendi');
      loadData();
    } else {
      toast.error('Üretim tamamlanırken hata oluştu');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500 rounded-lg">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Üretim Yönetimi</h2>
            <p className="text-xs text-slate-400">Reçete, İmalat ve Kapasite Planlama</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700"
            onClick={loadData}
          >
            Yenile
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col gap-6">
          <TabsList className="bg-white border border-slate-200 p-1 self-start shadow-sm">
            <TabsTrigger value="orders" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              <GitBranch className="w-4 h-4 mr-2" /> Üretim Emirleri
            </TabsTrigger>
            <TabsTrigger value="recipes" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              <Layers className="w-4 h-4 mr-2" /> Reçeteler (BOM)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="flex-1 overflow-auto m-0 mt-0 bg-transparent border-0 shadow-none">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full">
              {/* Stats Column */}
              <div className="space-y-4">
                <StatCard
                  label="Bekleyen Emirler"
                  value={orders.filter(o => o.status === 'draft').length}
                  color="bg-slate-100 text-slate-700"
                  icon={<Clock className="w-4 h-4" />}
                />
                <StatCard
                  label="Devam Edenler"
                  value={orders.filter(o => o.status === 'in_progress').length}
                  color="bg-blue-100 text-blue-700"
                  icon={<Play className="w-4 h-4" />}
                />
                <StatCard
                  label="Tamamlananlar"
                  value={orders.filter(o => o.status === 'completed').length}
                  color="bg-green-100 text-green-700"
                  icon={<CheckCircle className="w-4 h-4" />}
                />

                <NewOrderDialog recipes={recipes} products={products} onCreated={loadData} />
              </div>

              {/* List Column */}
              <div className="md:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h3 className="text-sm font-medium text-slate-700">Aktif İş Emirleri</h3>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-400" />
                    <Input className="pl-9 h-8 text-xs bg-white" placeholder="Emir ara..." />
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-semibold tracking-wider sticky top-0">
                      <tr>
                        <th className="px-4 py-3">Emir No</th>
                        <th className="px-4 py-3">Ürün / Reçete</th>
                        <th className="px-4 py-3 text-center">Planlanan</th>
                        <th className="px-4 py-3 text-center">Üretilen</th>
                        <th className="px-4 py-3">Durum</th>
                        <th className="px-4 py-3 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.map(order => (
                        <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">{order.orderNo}</td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-semibold text-slate-900">{order.productName}</div>
                            <div className="text-[10px] text-slate-500 uppercase">{order.recipeName}</div>
                          </td>
                          <td className="px-4 py-3 text-center text-xs font-medium">{order.plannedQty}</td>
                          <td className="px-4 py-3 text-center text-xs">
                            {order.status === 'completed' ? order.producedQty : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-medium",
                              order.status === 'completed' ? "bg-green-100 text-green-700" :
                                order.status === 'in_progress' ? "bg-blue-100 text-blue-700 border border-blue-200" :
                                  order.status === 'draft' ? "bg-slate-100 text-slate-600 border border-slate-200" :
                                    "bg-red-100 text-red-600"
                            )}>
                              {order.status === 'draft' ? 'TASLAK' :
                                order.status === 'in_progress' ? 'ÜRETİMDE' :
                                  order.status === 'completed' ? 'TAMAMLANDI' : 'İPTAL'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {order.status === 'draft' && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                                productionAPI.saveOrder({ id: order.id, status: 'in_progress' }).then(() => loadData());
                              }}>Başlat</Button>
                            )}
                            {order.status === 'in_progress' && (
                              <CompleteOrderDialog order={order} onComplete={handleCompleteOrder} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="recipes" className="flex-1 overflow-auto m-0 mt-0 bg-transparent border-0 shadow-none">
            <RecipeGrid recipes={recipes} products={products} onRefresh={loadData} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Helpers
function StatCard({ label, value, color, icon }: any) {
  return (
    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={cn("p-1.5 rounded-lg", color)}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

// Simple Recipe List & Editor
function RecipeGrid({ recipes, products, onRefresh }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<ProductionRecipe | null>(null);

  if (isAdding || editingRecipe) {
    return <RecipeEditor
      recipe={editingRecipe}
      products={products}
      onCancel={() => { setIsAdding(false); setEditingRecipe(null); }}
      onSave={async (recipe: ProductionRecipe) => {
        await productionAPI.saveRecipe(recipe);
        toast.success('Reçete kaydedildi');
        setIsAdding(false);
        setEditingRecipe(null);
        onRefresh();
      }}
    />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="relative w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input className="pl-10 h-10 bg-white" placeholder="Reçete ara..." />
        </div>
        <Button onClick={() => setIsAdding(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" /> Yeni Reçete Oluştur
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {recipes.map((recipe: any) => (
          <div key={recipe.id} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow group overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
              <div>
                <h4 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors uppercase text-sm tracking-tight">{recipe.name}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{recipe.productName}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditingRecipe(recipe)}>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </Button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-slate-500 uppercase">Toplam Maliyet</span>
                <span className="text-sm font-bold text-slate-900">{recipe.totalCost.toLocaleString('tr-TR', { style: 'currency', currency: 'IQD' })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-slate-500 uppercase">Bileşen Sayısı</span>
                <span className="text-xs font-medium text-slate-700">{recipe.ingredients.length} Kalem</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-slate-500 uppercase">Fire Oranı</span>
                <span className="text-xs font-medium text-orange-600">%{recipe.wastagePercent}</span>
              </div>
            </div>
          </div>
        ))}
        {recipes.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white border border-dashed border-slate-300 rounded-xl opacity-50">
            <Package className="w-12 h-12 mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm italic">Tanımlanmış reçete bulunamadı.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RecipeEditor({ recipe, products, onCancel, onSave }: any) {
  const [formData, setFormData] = useState<ProductionRecipe>(recipe || {
    name: '',
    productId: '',
    description: '',
    totalCost: 0,
    wastagePercent: 0,
    isActive: true,
    ingredients: []
  });

  const [materialSearch, setMaterialSearch] = useState('');
  const [showMaterialModal, setShowMaterialModal] = useState(false);

  const filteredMaterials = useMemo(() => {
    return products.filter((p: any) =>
      p.name.toLowerCase().includes(materialSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(materialSearch.toLowerCase())
    ).slice(0, 10);
  }, [products, materialSearch]);

  const addIngredient = (p: any) => {
    if (formData.ingredients.some(i => i.materialId === p.id)) return;
    const newIng = {
      materialId: p.id,
      materialName: p.name,
      quantity: 1,
      unit: p.unit || 'AD',
      cost: p.cost || p.price || 0
    };
    setFormData({ ...formData, ingredients: [...formData.ingredients, newIng] });
    setShowMaterialModal(false);
  };

  const updateIngQty = (id: string, qty: number) => {
    setFormData({
      ...formData,
      ingredients: formData.ingredients.map(i => i.materialId === id ? { ...i, quantity: qty } : i)
    });
  };

  const removeIng = (id: string) => {
    setFormData({ ...formData, ingredients: formData.ingredients.filter(i => i.materialId !== id) });
  };

  // Calculate total cost
  useEffect(() => {
    const total = formData.ingredients.reduce((sum, i) => sum + (i.cost * i.quantity), 0);
    setFormData(prev => ({ ...prev, totalCost: total }));
  }, [formData.ingredients]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full animate-in fade-in slide-in-from-bottom-2">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8 hover:bg-white">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h3 className="text-sm font-semibold text-slate-800">
            {recipe ? 'Reçete Düzenle' : 'Yeni Reçete Oluştur'}
          </h3>
        </div>
        <Button onClick={() => onSave(formData)} size="sm" className="bg-blue-600 hover:bg-blue-700">
          <Save className="w-4 h-4 mr-2" /> Kaydet
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col lg:flex-row gap-8">
        {/* Left Panel: Header Info */}
        <div className="lg:w-1/3 space-y-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Reçete Adı</label>
              <Input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Örn: Özel Paket Karışım Reçetesi"
                className="h-10 border-slate-300 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Üretilecek Mamul</label>
              <select
                className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.productId}
                onChange={e => setFormData({ ...formData, productId: e.target.value })}
              >
                <option value="">Mamul Seçiniz...</option>
                {products.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Fire Oranı (%)</label>
                <Input
                  type="number"
                  value={formData.wastagePercent}
                  onChange={e => setFormData({ ...formData, wastagePercent: Number(e.target.value) })}
                  className="h-10 border-slate-300"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Toplam Maliyet</label>
                <div className="h-10 flex items-center px-3 bg-slate-100 rounded-md border border-slate-200 text-sm font-bold text-slate-700">
                  {formData.totalCost.toLocaleString('tr-TR')} IQD
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Açıklama</label>
              <textarea
                className="w-full h-24 p-2 rounded-md border border-slate-300 bg-white text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Üretim talimatları..."
              />
            </div>
          </div>

          <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
            <h5 className="text-xs font-bold text-orange-800 flex items-center gap-2 mb-2 uppercase tracking-wide">
              <Layers className="w-3.5 h-3.5" /> Reçete Notu
            </h5>
            <p className="text-[11px] text-orange-700 leading-relaxed font-medium">Bu reçete ile yapılan tamamlama işlemleri otomatik olarak hammadde stoklarını düşürecek ve mamul stoğunu artıracaktır.</p>
          </div>
        </div>

        {/* Right Panel: Ingredients */}
        <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-tighter">İçerik Bileşenleri (BOM)</h4>
              <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[10px]">{formData.ingredients.length} Kalem</span>
            </div>
            <Dialog open={showMaterialModal} onOpenChange={setShowMaterialModal}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 border-blue-200 text-blue-600 hover:bg-blue-50 bg-white">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Bileşen Ekle
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-white">
                <DialogHeader>
                  <DialogTitle className="text-sm font-bold uppercase tracking-wide text-slate-800">Hammadde / Bileşen Seç</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <Input
                      className="pl-10 h-10 border-slate-200 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Malzeme adı veya kodu..."
                      value={materialSearch}
                      onChange={e => setMaterialSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-60 overflow-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                    {filteredMaterials.map((p: any) => (
                      <div
                        key={p.id}
                        className="p-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition-colors group"
                        onClick={() => addIngredient(p)}
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition-colors uppercase">{p.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono tracking-tighter">{p.code} | Stok: {p.stock} {p.unit}</div>
                        </div>
                        <Plus className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                      </div>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/30 text-slate-400 uppercase text-[9px] font-bold tracking-widest border-b border-slate-50">
                <tr>
                  <th className="px-4 py-3">Bileşen Adı</th>
                  <th className="px-4 py-3 text-center">Birim</th>
                  <th className="px-4 py-3 text-center w-32">Miktar</th>
                  <th className="px-4 py-3 text-right">B.Maliyet</th>
                  <th className="px-4 py-3 text-right">Toplam</th>
                  <th className="px-4 py-3 text-right">#</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {formData.ingredients.map(ing => (
                  <tr key={ing.materialId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-xs font-bold text-slate-800 uppercase tracking-tight">{ing.materialName}</div>
                      <div className="text-[9px] text-slate-500 font-mono uppercase tracking-tighter">{ing.materialId.slice(0, 8)}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-medium text-slate-600">{ing.unit}</td>
                    <td className="px-4 py-3 text-center">
                      <Input
                        type="number"
                        value={ing.quantity}
                        onChange={e => updateIngQty(ing.materialId, Number(e.target.value))}
                        className="h-8 text-center text-xs w-20 mx-auto bg-white border-slate-200 focus:ring-0 focus:border-blue-400"
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600">
                      {ing.cost.toLocaleString('tr-TR')}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-800">
                      {(ing.cost * ing.quantity).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50"
                        onClick={() => removeIng(ing.materialId)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {formData.ingredients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-slate-400 italic text-xs">Reçete içeriği henüz boş.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-12">
            <div className="text-right">
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">Ara Toplam</div>
              <div className="text-lg font-bold text-slate-900">{formData.totalCost.toLocaleString('tr-TR')} <span className="text-[10px] text-slate-500">IQD</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewOrderDialog({ recipes, products, onCreated }: any) {
  const [open, setOpen] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [plannedQty, setPlannedQty] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!selectedRecipeId) {
      toast.error('Lütfen bir reçete seçiniz');
      return;
    }
    setLoading(true);
    try {
      const recipe = recipes.find((r: any) => r.id === selectedRecipeId);
      await productionAPI.saveOrder({
        recipeId: selectedRecipeId,
        productId: recipe.productId,
        plannedQty: plannedQty,
        status: 'draft',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
      toast.success('Üretim emri oluşturuldu');
      setOpen(false);
      onCreated();
    } catch (error) {
      toast.error('Hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full bg-blue-600 hover:bg-blue-700 h-12 rounded-xl shadow-md border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all">
          <Plus className="w-5 h-5 mr-2" /> Yeni İş Emri
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase tracking-wider text-slate-700">Yeni Üretim Emri Başlat</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-6">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Üretim Reçetesi Seç</label>
            <select
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={selectedRecipeId}
              onChange={e => setSelectedRecipeId(e.target.value)}
            >
              <option value="">Reçete Seçiniz...</option>
              {recipes.map((r: any) => (
                <option key={r.id} value={r.id}>{r.name} ({r.productName})</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Hedef Üretim Miktarı</label>
            <Input
              type="number"
              className="h-11 rounded-xl border-slate-200 text-lg font-bold"
              value={plannedQty}
              onChange={e => setPlannedQty(Number(e.target.value))}
            />
          </div>
          <div className="pt-2">
            <Button
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? 'Oluşturuluyor...' : 'Emri Oluştur ve Kaydet'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompleteOrderDialog({ order, onComplete }: any) {
  const [open, setOpen] = useState(false);
  const [producedQty, setProducedQty] = useState(order.plannedQty);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-[10px] font-bold bg-green-600 hover:bg-green-700 text-white rounded-md">TAMAMLA</Button>
      </DialogTrigger>
      <DialogContent className="bg-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase text-slate-700">Üretimi Tamamla</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-4">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <div className="text-[10px] text-slate-500 uppercase mb-1">Üretilen Ürün</div>
            <div className="text-sm font-bold text-slate-800">{order.productName}</div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase">Gerçekleşen Miktar</label>
            <Input
              type="number"
              className="h-12 text-center text-xl font-bold rounded-xl"
              value={producedQty}
              onChange={e => setProducedQty(Number(e.target.value))}
            />
            <p className="text-[10px] text-slate-400 text-center italic">Planlanan: {order.plannedQty}</p>
          </div>

          <div className="pt-2">
            <Button
              className="w-full h-12 bg-green-600 hover:bg-green-700 rounded-xl font-bold text-white shadow-lg"
              onClick={() => {
                onComplete(order.id, producedQty);
                setOpen(false);
              }}
            >
              Üretimi Onayla ve Kapat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
