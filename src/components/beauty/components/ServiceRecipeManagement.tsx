import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Package,
    Trash2,
    Save,
    Layers,
    Search,
    ChevronRight,
    ArrowLeft,
    FileText,
    Scale,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { RecipeCostSummaryBar } from '../../shared/RecipeCostSummaryBar';
import { cn } from '@/components/ui/utils';
import { useBeautyStore } from '../store/useBeautyStore';
import { useProductStore } from '../../../store/useProductStore';
import { beautyService } from '../../../services/beautyService';
import type { BeautyService, BeautyServiceConsumableRow } from '../../../types/beauty';
import type { Product } from '../../../core/types';
import { toast } from 'sonner';

/** Restoran RecipeManagement ile aynı düzen; veri: beauty_service_consumables + ürün maliyeti */
type DraftLine = {
    key: string;
    dbId?: string;
    product_id: string;
    materialName: string;
    unit: string;
    cost: number;
    qty: number;
};

function rowToDraft(r: BeautyServiceConsumableRow, productById: Map<string, Product>): DraftLine {
    const p = productById.get(r.product_id);
    const cost = Number(p?.cost ?? p?.price ?? 0);
    return {
        key: r.id,
        dbId: r.id,
        product_id: r.product_id,
        materialName: (r.product_name || p?.name || '—').trim(),
        unit: (r.product_unit || p?.unit || 'AD').trim(),
        cost,
        qty: Math.max(0.0001, Number(r.qty_per_service) || 1),
    };
}

export interface ServiceRecipeManagementProps {
    /** Restoran ekranındaki «Geri» ile aynı; güzellik kabuğunda genelde verilmez */
    onBack?: () => void;
}

export function ServiceRecipeManagement({ onBack }: ServiceRecipeManagementProps) {
    const { services, loadServices } = useBeautyStore();
    const { products, loadProducts } = useProductStore();

    const productById = useMemo(() => {
        const m = new Map<string, Product>();
        for (const p of products) m.set(p.id, p);
        return m;
    }, [products]);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedService, setSelectedService] = useState<BeautyService | null>(null);
    const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
    const [loadingDraft, setLoadingDraft] = useState(false);
    const [saving, setSaving] = useState(false);
    /** Satır içi stok ürünü araması (modal yok) */
    const [materialSearch, setMaterialSearch] = useState('');
    const addProductBarRef = useRef<HTMLDivElement>(null);
    const [wastagePercent, setWastagePercent] = useState(5.2);
    /** Hizmet başına reçete satırı sayısı (sol listede REÇETE HAZIR için) */
    const [recipeCountByService, setRecipeCountByService] = useState<Record<string, number>>({});

    const saveHandlerRef = useRef<() => Promise<void>>(async () => {});

    useEffect(() => {
        void loadServices();
        void loadProducts();
    }, [loadServices, loadProducts]);

    const refreshRecipeCounts = useCallback(async () => {
        try {
            const all = await beautyService.listServiceConsumables();
            const m: Record<string, number> = {};
            for (const r of all) {
                m[r.service_id] = (m[r.service_id] || 0) + 1;
            }
            setRecipeCountByService(m);
        } catch {
            setRecipeCountByService({});
        }
    }, []);

    useEffect(() => {
        void refreshRecipeCounts();
    }, [refreshRecipeCounts, services.length]);

    useEffect(() => {
        if (!selectedService && services.length > 0) {
            setSelectedService(services[0]);
        }
    }, [services, selectedService]);

    useEffect(() => {
        if (!selectedService?.id) {
            setDraftLines([]);
            return;
        }
        let cancelled = false;
        setLoadingDraft(true);
        void (async () => {
            try {
                const list = await beautyService.listServiceConsumables(selectedService.id);
                if (cancelled) return;
                const map = new Map<string, Product>();
                for (const p of products) map.set(p.id, p);
                setDraftLines(list.map(r => rowToDraft(r, map)));
            } catch (e: unknown) {
                if (!cancelled) {
                    toast.error(e instanceof Error ? e.message : String(e));
                    setDraftLines([]);
                }
            } finally {
                if (!cancelled) setLoadingDraft(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [selectedService?.id, products]);

    const filteredMenu = useMemo(
        () => services.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase())),
        [services, searchTerm],
    );

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

    const handleAddIngredient = (product: Product) => {
        if (draftLines.some(i => i.product_id === product.id)) {
            toast.info('Bu ürün zaten listede');
            return;
        }
        const cost = Number(product.cost ?? product.price ?? 0);
        const line: DraftLine = {
            key: uuidv4(),
            product_id: product.id,
            materialName: product.name,
            unit: product.unit || 'GR',
            cost,
            qty: 1,
        };
        setDraftLines(prev => [...prev, line]);
        setMaterialSearch('');
    };

    const handleRemoveIngredient = (key: string) => {
        setDraftLines(prev => prev.filter(i => i.key !== key));
    };

    const handleUpdateQuantity = (key: string, quantity: number) => {
        setDraftLines(prev =>
            prev.map(i => (i.key === key ? { ...i, qty: Math.max(0.0001, quantity) } : i)),
        );
    };

    const totalCost = useMemo(
        () => draftLines.reduce((sum, i) => sum + i.cost * i.qty, 0),
        [draftLines],
    );

    const realCost = useMemo(
        () => totalCost * (1 + wastagePercent / 100),
        [totalCost, wastagePercent],
    );

    const servicePrice = selectedService?.price ?? 0;
    const profitMargin = useMemo(() => {
        if (!selectedService || servicePrice === 0) return 0;
        return ((servicePrice - realCost) / servicePrice) * 100;
    }, [selectedService, servicePrice, realCost]);

    const handleSave = useCallback(async () => {
        if (!selectedService?.id) return;
        setSaving(true);
        try {
            const persisted = await beautyService.listServiceConsumables(selectedService.id);
            const draftDbIds = new Set(draftLines.map(d => d.dbId).filter(Boolean) as string[]);
            for (const row of persisted) {
                if (!draftDbIds.has(row.id)) {
                    await beautyService.deleteServiceConsumable(row.id);
                }
            }
            for (const line of draftLines) {
                const q = Math.max(0.0001, line.qty);
                if (line.dbId) {
                    await beautyService.updateServiceConsumable(line.dbId, q);
                } else {
                    await beautyService.setServiceConsumable({
                        service_id: selectedService.id,
                        product_id: line.product_id,
                        qty_per_service: q,
                    });
                }
            }
            const list = await beautyService.listServiceConsumables(selectedService.id);
            setDraftLines(list.map(r => rowToDraft(r, productById)));
            await refreshRecipeCounts();
            toast.success('Reçete kaydedildi');
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }, [selectedService, draftLines, productById, refreshRecipeCounts]);

    saveHandlerRef.current = handleSave;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                void saveHandlerRef.current();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const hasRecipeFor = (svcId: string) => (recipeCountByService[svcId] ?? 0) > 0;

    return (
        <div className="relative flex h-full min-h-[560px] animate-in flex-col bg-[#f1f3f5] fade-in duration-300">
            <div
                className="z-20 flex shrink-0 items-center justify-between gap-8 border-b px-6 py-2.5 shadow-2xl"
                style={{ backgroundColor: '#2563eb', borderColor: 'rgba(96,165,250,0.4)' }}
            >
                <div className="flex flex-1 items-center gap-4">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="group flex h-9 shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/15 px-5 text-[11px] font-black uppercase text-white shadow-inner transition-all hover:bg-white/25 active:scale-95"
                        >
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                            <span>Geri</span>
                        </button>
                    )}
                    <div className="ml-2 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/10">
                            <Layers className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black uppercase italic leading-none tracking-tighter text-white">
                                Reçete Yönetimi
                            </h2>
                            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-white/50">
                                Recipe & Inventory Management
                            </p>
                        </div>
                    </div>
                </div>

                {selectedService && (
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-right">
                            <p className="text-[9px] font-black uppercase leading-none tracking-widest text-white/50">
                                SEÇİLİ ÜRÜN
                            </p>
                            <p className="mt-1 text-xs font-black uppercase leading-none text-white">{selectedService.name}</p>
                        </div>
                        <button
                            type="button"
                            disabled={saving}
                            className="flex h-9 items-center gap-2 rounded-xl border border-white/20 bg-[#2ecc71] px-5 text-[11px] font-black uppercase text-white shadow-inner shadow-green-500/20 transition-all hover:bg-[#27ae60] active:scale-95 disabled:opacity-60"
                            onClick={() => void handleSave()}
                        >
                            <Save className="h-4 w-4" /> Kaydet (F2)
                        </button>
                    </div>
                )}
            </div>

            <div className="flex flex-1 overflow-hidden">
                <div className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 bg-slate-50 p-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 font-bold text-slate-400" />
                            <input
                                placeholder="Hizmet ara..."
                                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-bold shadow-inner outline-none transition-all focus:ring-2 focus:ring-blue-500/10"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="custom-scrollbar flex-1 divide-y divide-slate-50 overflow-auto bg-white">
                        {filteredMenu.map(item => {
                            const hasRecipe = hasRecipeFor(item.id);
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setSelectedService(item)}
                                    className={cn(
                                        'group flex w-full items-center justify-between p-5 text-left transition-all',
                                        selectedService?.id === item.id ? 'bg-blue-50/50' : 'hover:bg-slate-50',
                                    )}
                                >
                                    <div className="flex-1">
                                        <p
                                            className={cn(
                                                'text-[11px] font-black uppercase leading-none tracking-tight',
                                                selectedService?.id === item.id ? 'text-blue-700' : 'text-slate-700',
                                            )}
                                        >
                                            {item.name}
                                        </p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span
                                                className={cn(
                                                    'text-[9px] font-bold uppercase tracking-widest',
                                                    hasRecipe ? 'text-emerald-500' : 'text-slate-300',
                                                )}
                                            >
                                                {hasRecipe ? 'REÇETE HAZIR' : 'REÇETE YOK'}
                                            </span>
                                            {hasRecipe && (
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" />
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight
                                        className={cn(
                                            'h-4 w-4 transition-transform',
                                            selectedService?.id === item.id
                                                ? 'translate-x-1 text-blue-700'
                                                : 'text-slate-300',
                                        )}
                                    />
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex flex-1 flex-col overflow-hidden bg-slate-50/50">
                    {selectedService ? (
                        <>
                            <div key={selectedService.id} className="custom-scrollbar flex-1 overflow-auto p-6">
                                {loadingDraft ? (
                                    <div className="flex h-48 items-center justify-center text-sm font-bold text-slate-400">
                                        Yükleniyor…
                                    </div>
                                ) : (
                                    <>
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
                                                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-xs font-bold text-slate-800 shadow-inner outline-none ring-0 transition-all placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                                                />
                                                {materialSearch.trim().length > 0 && (
                                                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5">
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
                                            <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                <FileText className="h-3 w-3" /> Malzeme Listesi ({draftLines.length})
                                            </h3>
                                        </div>

                                        <div className="space-y-2">
                                            {draftLines.length > 0 ? (
                                                draftLines.map(ing => (
                                                    <div
                                                        key={ing.key}
                                                        className="group flex items-center gap-4 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-400"
                                                    >
                                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 shadow-inner">
                                                            <Package className="h-6 w-6 text-slate-400 transition-colors group-hover:text-blue-500" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-sm font-black uppercase leading-none text-slate-800">
                                                                {ing.materialName}
                                                            </p>
                                                            <p className="mt-1.5 text-[10px] font-bold uppercase leading-none tracking-tighter text-slate-400">
                                                                Birim Maliyet: {ing.cost.toLocaleString('tr-TR')}
                                                            </p>
                                                        </div>

                                                        <div className="flex shrink-0 items-center gap-8">
                                                            <div className="flex w-28 flex-col items-start">
                                                                <span className="mb-1.5 text-[9px] font-black uppercase leading-none tracking-widest text-slate-400">
                                                                    Miktar ({ing.unit})
                                                                </span>
                                                                <input
                                                                    type="number"
                                                                    value={ing.qty}
                                                                    onChange={e =>
                                                                        handleUpdateQuantity(
                                                                            ing.key,
                                                                            parseFloat(e.target.value) || 0,
                                                                        )
                                                                    }
                                                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black leading-none text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white"
                                                                />
                                                            </div>
                                                            <div className="flex w-24 flex-col items-end">
                                                                <span className="mb-1.5 w-full text-right text-[9px] font-black uppercase leading-none tracking-widest text-slate-400">
                                                                    Toplam
                                                                </span>
                                                                <span className="text-sm font-black leading-none text-slate-900">
                                                                    {(ing.cost * ing.qty).toLocaleString('tr-TR')}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveIngredient(ing.key)}
                                                            className="rounded-xl p-3 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-slate-200 bg-white py-24 opacity-60 shadow-inner">
                                                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50">
                                                        <Package className="h-10 w-10 text-slate-300" />
                                                    </div>
                                                    <p className="text-xs font-black uppercase text-slate-400">
                                                        Yukarıdaki arama ile stok ürünü ekleyin
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            <RecipeCostSummaryBar
                                totalCost={totalCost}
                                realCost={realCost}
                                wastagePercent={wastagePercent}
                                onWastageChange={setWastagePercent}
                                profitMargin={profitMargin}
                                entityName={selectedService.name}
                            />
                        </>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center bg-slate-50 py-32 opacity-10">
                            <Scale size={160} />
                            <p className="mt-4 text-center text-2xl font-black uppercase tracking-tighter">
                                Reçete Düzenlemek İçin
                                <br />
                                Yandan Bir Hizmet Seçiniz
                            </p>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
