import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    Database,
    Package,
    Scale,
    Trash2,
    Save,
    Layers,
    Search,
    ChevronRight,
    PieChart,
    Filter,
    ArrowLeft,
    TrendingUp,
    FileText,
    Calculator
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RecipeCostSummaryBar } from '../../shared/RecipeCostSummaryBar';
import { cn } from '@/components/ui/utils';
import { v4 as uuidv4 } from 'uuid';

import { useRestaurantStore } from '../store/useRestaurantStore';
import { useProductStore } from '../../../store/useProductStore';
import { Recipe, RecipeIngredient, MenuItem } from '../types';
import { toast } from 'sonner';

interface RecipeManagementProps {
    onBack?: () => void;
}

export function RecipeManagement({ onBack }: RecipeManagementProps) {
    const { recipes, updateRecipe, menu, loadRecipes, loadMenu } = useRestaurantStore();

    useEffect(() => {
        loadRecipes();
        if (menu.length === 0) loadMenu();
    }, []);
    const { products } = useProductStore();

    const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(menu[0] || null);
    const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const addProductBarRef = useRef<HTMLDivElement>(null);
    const [wastagePercent, setWastagePercent] = useState(5.2); // Default fire rate

    // Sync editing state when selected menu item changes
    useEffect(() => {
        if (selectedMenuItem) {
            const existingRecipe = recipes.find(r => r.menuItemId === selectedMenuItem.id);
            if (existingRecipe) {
                setEditingRecipe(JSON.parse(JSON.stringify(existingRecipe)));
                setWastagePercent(existingRecipe.wastagePercent || 5.2);
            } else {
                setEditingRecipe({
                    menuItemId: selectedMenuItem.id,
                    menuItemName: selectedMenuItem.name,
                    ingredients: [],
                    totalCost: 0,
                    wastagePercent: 5.2
                });
                setWastagePercent(5.2);
            }
        } else {
            setEditingRecipe(null);
        }
    }, [selectedMenuItem, recipes]);

    const filteredMenu = menu.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleAddIngredient = (product: any) => {
        if (!editingRecipe) return;

        // Check if already exists
        if (editingRecipe.ingredients.some(i => i.materialId === product.id)) {
            toast.info('Bu ürün zaten listede');
            return;
        }

        const newIngredient: RecipeIngredient = {
            id: uuidv4(),
            materialId: product.id,
            materialName: product.name,
            quantity: 1,
            unit: product.unit || 'GR',
            cost: product.cost || product.price || 0 // Use cost (purchase price) as base
        };

        const updatedIngredients = [...editingRecipe.ingredients, newIngredient];
        const newTotalCost = updatedIngredients.reduce((sum, i) => sum + (i.cost * i.quantity), 0);

        setEditingRecipe({
            ...editingRecipe,
            ingredients: updatedIngredients,
            totalCost: newTotalCost
        });
        setMaterialSearch('');
    };

    const handleRemoveIngredient = (id: string) => {
        if (!editingRecipe) return;

        const updatedIngredients = editingRecipe.ingredients.filter(i => i.id !== id);
        const newTotalCost = updatedIngredients.reduce((sum, i) => sum + (i.cost * i.quantity), 0);

        setEditingRecipe({
            ...editingRecipe,
            ingredients: updatedIngredients,
            totalCost: newTotalCost
        });
    };

    const handleUpdateQuantity = (id: string, quantity: number) => {
        if (!editingRecipe) return;

        const updatedIngredients = editingRecipe.ingredients.map(i =>
            i.id === id ? { ...i, quantity: Math.max(0, quantity) } : i
        );
        const newTotalCost = updatedIngredients.reduce((sum, i) => sum + (i.cost * i.quantity), 0);

        setEditingRecipe({
            ...editingRecipe,
            ingredients: updatedIngredients,
            totalCost: newTotalCost
        });
    };

    const handleSave = () => {
        if (editingRecipe) {
            updateRecipe({
                ...editingRecipe,
                wastagePercent
            });
        }
    };

    const realCost = useMemo(() => {
        if (!editingRecipe) return 0;
        return editingRecipe.totalCost * (1 + wastagePercent / 100);
    }, [editingRecipe, wastagePercent]);

    const profitMargin = useMemo(() => {
        if (!editingRecipe || !selectedMenuItem || selectedMenuItem.price === 0) return 0;
        return ((selectedMenuItem.price - realCost) / selectedMenuItem.price) * 100;
    }, [editingRecipe, selectedMenuItem, realCost]);

    const [materialSearch, setMaterialSearch] = useState('');

    const filteredMaterials = useMemo(() => {
        const q = materialSearch.trim().toLowerCase();
        if (!q) return [];
        return products
            .filter(p =>
                (p.name.toLowerCase().includes(q) ||
                    String(p.barcode ?? '')
                        .toLowerCase()
                        .includes(q)) &&
                (p.materialType === 'raw_material' || p.category === 'Hammadde' || true),
            )
            .slice(0, 40);
    }, [products, materialSearch]);

    useEffect(() => {
        const onDocDown = (e: MouseEvent) => {
            if (!addProductBarRef.current?.contains(e.target as Node)) {
                setMaterialSearch('');
            }
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, []);

    return (
        <div className="flex h-full bg-[#f1f3f5] animate-in fade-in duration-300 relative flex-col">
            {/* Standardized Premium Appbar */}
            <div
                className="border-b px-6 py-2.5 flex items-center justify-between z-20 shrink-0 gap-8 shadow-2xl"
                style={{ backgroundColor: '#2563eb', borderColor: 'rgba(96,165,250,0.4)' }}
            >
                <div className="flex items-center gap-4 flex-1">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 px-5 h-9 bg-white/15 hover:bg-white/25 text-white rounded-xl transition-all active:scale-95 border border-white/20 font-black uppercase text-[11px] group shrink-0 shadow-inner"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        <span>Geri</span>
                    </button>
                    <div className="flex items-center gap-3 ml-2">
                        <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                            <Layers className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black italic tracking-tighter text-white uppercase leading-none">Reçete Yönetimi</h2>
                            <p className="text-[9px] text-white/50 font-bold uppercase tracking-widest mt-0.5">Recipe & Inventory Management</p>
                        </div>
                    </div>
                </div>

                {selectedMenuItem && (
                    <div className="flex items-center gap-3">
                        <div className="bg-black/20 px-3 py-1.5 rounded-xl border border-white/10 text-right">
                            <p className="text-[9px] text-white/50 font-black uppercase tracking-widest leading-none">SEÇİLİ ÜRÜN</p>
                            <p className="text-xs font-black text-white mt-1 uppercase leading-none">{selectedMenuItem.name}</p>
                        </div>
                        <button
                            className="h-9 bg-[#2ecc71] text-white rounded-xl px-5 font-black text-[11px] uppercase hover:bg-[#27ae60] transition-all active:scale-95 flex items-center gap-2 border border-white/20 shadow-sm shadow-green-500/20"
                            onClick={handleSave}
                        >
                            <Save className="w-4 h-4" /> Kaydet (F2)
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left: Menu Items List */}
                <div className="w-80 bg-white border-r border-slate-200 flex flex-col overflow-hidden shadow-sm shrink-0">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 font-bold" />
                            <input
                                placeholder="Ürün ara..."
                                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold focus:ring-2 focus:ring-blue-500/10 shadow-inner outline-none transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto bg-white divide-y divide-slate-50 custom-scrollbar">
                        {filteredMenu.map(item => {
                            const hasRecipe = recipes.some(r => r.menuItemId === item.id);
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setSelectedMenuItem(item)}
                                    className={cn(
                                        "w-full flex items-center justify-between p-5 transition-all group text-left",
                                        selectedMenuItem?.id === item.id
                                            ? "bg-blue-50/50"
                                            : "hover:bg-slate-50"
                                    )}
                                >
                                    <div className="flex-1">
                                        <p className={cn(
                                            "text-[11px] font-black uppercase tracking-tight leading-none",
                                            selectedMenuItem?.id === item.id ? "text-blue-700" : "text-slate-700"
                                        )}>{item.name}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className={cn(
                                                "text-[9px] font-bold uppercase tracking-widest",
                                                hasRecipe ? "text-emerald-500" : "text-slate-300"
                                            )}>
                                                {hasRecipe ? 'REÇETE HAZIR' : 'REÇETE YOK'}
                                            </span>
                                            {hasRecipe && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></span>}
                                        </div>
                                    </div>
                                    <ChevronRight className={cn(
                                        "w-4 h-4 transition-transform",
                                        selectedMenuItem?.id === item.id ? "text-blue-700 translate-x-1" : "text-slate-300"
                                    )} />
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Recipe Editor - only show when editingRecipe is for selected product */}
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
                    {selectedMenuItem && editingRecipe && editingRecipe.menuItemId === selectedMenuItem.id ? (
                        <>
                            {/* Editor Content Area - key ensures correct product when switching */}
                            <div key={selectedMenuItem.id} className="flex-1 overflow-auto p-6 custom-scrollbar">
                                <div ref={addProductBarRef} className="relative z-30 mb-5">
                                    <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Stok ürünü ara — seçince listeye eklenir
                                    </p>
                                    <div className="relative">
                                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="search"
                                            autoComplete="off"
                                            placeholder="Ürün adı veya barkod yazın…"
                                            value={materialSearch}
                                            onChange={e => setMaterialSearch(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-xs font-bold text-slate-800 shadow-inner outline-none transition-all placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                                        />
                                        {materialSearch.trim().length > 0 && (
                                            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5">
                                                {filteredMaterials.length === 0 ? (
                                                    <div className="px-3 py-2.5 text-center text-[11px] font-medium text-slate-400">
                                                        Sonuç yok
                                                    </div>
                                                ) : (
                                                    filteredMaterials.map(p => (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            onClick={() => handleAddIngredient(p)}
                                                            className="flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2 text-left last:border-b-0 hover:bg-blue-50/80"
                                                        >
                                                            <Package className="h-4 w-4 shrink-0 text-slate-400" />
                                                            <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase text-slate-800">
                                                                {p.name}
                                                            </span>
                                                            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-emerald-600">
                                                                {(p.cost ?? p.price ?? 0).toLocaleString('tr-TR')}
                                                            </span>
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mb-6 flex items-center justify-between">
                                    <h3 className="text-[10px] font-black text-slate-400 tracking-widest uppercase flex items-center gap-2">
                                        <FileText className="w-3 h-3" /> Malzeme Listesi ({editingRecipe.ingredients.length})
                                    </h3>
                                </div>

                                <div className="space-y-2">
                                    {editingRecipe.ingredients.length > 0 ? (
                                        editingRecipe.ingredients.map(ing => (
                                            <div key={ing.id} className="bg-white border border-slate-200 p-4 flex items-center gap-4 group hover:border-blue-400 transition-all rounded-[1.5rem] shadow-sm">
                                                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0 shadow-inner">
                                                    <Package className="w-6 h-6 text-slate-400 group-hover:text-blue-500 transition-colors" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-black text-slate-800 uppercase truncate leading-none">{ing.materialName}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-1.5 leading-none">Birim Maliyet: {ing.cost.toLocaleString()}</p>
                                                </div>

                                                <div className="flex items-center gap-8 shrink-0">
                                                    <div className="flex flex-col items-start w-28">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1.5 tracking-widest">Miktar ({ing.unit})</span>
                                                        <input
                                                            type="number"
                                                            value={ing.quantity}
                                                            onChange={(e) => handleUpdateQuantity(ing.id, parseFloat(e.target.value) || 0)}
                                                            className="w-full text-xs font-black text-slate-700 bg-slate-50 px-3 py-2 border border-slate-200 rounded-xl leading-none outline-none focus:border-blue-500 transition-all focus:bg-white"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col items-end w-24">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1.5 tracking-widest text-right w-full">Toplam</span>
                                                        <span className="text-sm font-black text-slate-900 leading-none">
                                                            {(ing.cost * ing.quantity).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => handleRemoveIngredient(ing.id)}
                                                    className="p-3 text-slate-300 hover:text-red-500 transition-all rounded-xl hover:bg-red-50"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-24 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[2rem] bg-white shadow-inner opacity-60">
                                            <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mb-6">
                                                <Package className="w-10 h-10 text-slate-300" />
                                            </div>
                                            <p className="text-xs font-black uppercase text-slate-400">
                                                Yukarıdaki arama ile stok ürünü ekleyin
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <RecipeCostSummaryBar
                                totalCost={editingRecipe.totalCost}
                                realCost={realCost}
                                wastagePercent={wastagePercent}
                                onWastageChange={setWastagePercent}
                                profitMargin={profitMargin}
                                entityName={selectedMenuItem.name}
                            />
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-10 py-32 bg-slate-50">
                            <Scale size={160} />
                            <p className="text-2xl font-black uppercase tracking-tighter mt-4 text-center">Reçete Düzenlemek İçin<br />Yandan Bir Ürün Seçiniz</p>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}


