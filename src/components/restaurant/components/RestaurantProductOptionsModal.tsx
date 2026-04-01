import React, { useState } from 'react';
import { X, ShoppingBag, Plus, StickyNote, ChefHat, Gift, Trash2, Info, Pencil } from 'lucide-react';
import { cn } from '../../ui/utils';
import { Product } from '../types';

interface RestaurantProductOptionsModalProps {
    product: Product;
    onClose: () => void;
    onAddToCart: (product: Product, quantity?: number) => void;
    onAddNote: () => void;
    onSendToKitchen: () => void;
    onMarkComplementary: () => void;
    onVoidItem: () => void;
    fmt: (num: number) => string;
    /** Yönetici ise fiyat değiştirilebilir */
    isAdmin?: boolean;
    /** Fiyat modal içinde değiştirilip uygulandığında (DB + ürün alanında anlık güncelleme için) */
    onPriceApply?: (productId: string, newPrice: number) => void;
}

export function RestaurantProductOptionsModal({
    product,
    onClose,
    onAddToCart,
    onAddNote,
    onSendToKitchen,
    onMarkComplementary,
    onVoidItem,
    fmt,
    isAdmin = false,
    onPriceApply
}: RestaurantProductOptionsModalProps) {
    const [priceOverride, setPriceOverride] = useState<number | null>(null);
    const [showPriceEdit, setShowPriceEdit] = useState(false);
    const [priceInput, setPriceInput] = useState('');
    const displayPrice = priceOverride ?? product.price;

    const applyPrice = () => {
        const num = parseFloat(priceInput.replace(/,/g, '.'));
        if (!Number.isNaN(num) && num >= 0) {
            setPriceOverride(num);
            setShowPriceEdit(false);
            setPriceInput('');
            onPriceApply?.(product.id, num);
        }
    };

    const productWithPrice = (): Product => priceOverride != null ? { ...product, price: priceOverride } : product;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[5000] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div
                className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header with Blue Gradient */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-8 flex items-center justify-between text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />

                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg shrink-0">
                            <ShoppingBag className="w-6 h-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-xl font-black uppercase tracking-tight truncate">{product.name}</h3>
                            {isAdmin && showPriceEdit ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={priceInput}
                                        onChange={e => setPriceInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') applyPrice(); }}
                                        placeholder={fmt(product.price)}
                                        className="w-24 px-2 py-1 text-[10px] font-black uppercase bg-white/20 border border-white/40 rounded text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
                                        autoFocus
                                    />
                                    <button type="button" onClick={applyPrice} className="text-[10px] font-black uppercase bg-white/30 hover:bg-white/50 px-2 py-1 rounded">OK</button>
                                    <button type="button" onClick={() => { setShowPriceEdit(false); setPriceInput(''); }} className="text-white/80 hover:text-white text-[10px]">İptal</button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => isAdmin && (setShowPriceEdit(true), setPriceInput(displayPrice > 0 ? String(displayPrice) : ''))}
                                    className={cn(
                                        "text-[10px] text-white/70 font-black uppercase tracking-widest mt-1 tracking-widest text-left",
                                        isAdmin && "hover:text-white hover:bg-white/10 rounded px-1 -mx-1 flex items-center gap-1"
                                    )}
                                >
                                    {fmt(displayPrice)}
                                    {isAdmin && <Pencil className="w-3 h-3 opacity-70" />}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-4">
                    <div className="grid grid-cols-1 gap-3">
                        <button
                            onClick={() => { onAddToCart(productWithPrice(), 1); onClose(); }}
                            className="w-full py-4 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-2xl font-black uppercase text-xs transition-all flex items-center justify-center gap-3 border-2 border-slate-100 hover:border-blue-200 active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> 1 ADET EKLE
                        </button>
                        <button
                            onClick={() => { onAddToCart(productWithPrice(), 2); onClose(); }}
                            className="w-full py-4 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-2xl font-black uppercase text-xs transition-all flex items-center justify-center gap-3 border-2 border-slate-100 hover:border-blue-200 active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> 2 ADET EKLE
                        </button>
                        <button
                            onClick={() => { onAddNote(); onClose(); }}
                            className="w-full py-4 bg-slate-50 hover:bg-amber-50 text-slate-700 hover:text-amber-600 rounded-2xl font-black uppercase text-xs transition-all flex items-center justify-center gap-3 border-2 border-slate-100 hover:border-amber-200 active:scale-95"
                        >
                            <StickyNote className="w-4 h-4" /> NOT EKLE
                        </button>
                        <button
                            onClick={() => { onSendToKitchen(); onClose(); }}
                            className="w-full py-4 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-600 rounded-2xl font-black uppercase text-xs transition-all flex items-center justify-center gap-3 border-2 border-slate-100 hover:border-emerald-200 active:scale-95"
                        >
                            <ChefHat className="w-4 h-4" /> MUTFAĞA GÖNDER
                        </button>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button
                                onClick={() => { onMarkComplementary(); onClose(); }}
                                className="py-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl font-black uppercase text-xs transition-all flex items-center justify-center gap-3 border-2 border-indigo-100 active:scale-95"
                            >
                                <Gift className="w-4 h-4" /> İKRAM
                            </button>
                            <button
                                onClick={() => { onVoidItem(); onClose(); }}
                                className="py-4 bg-red-50 hover:bg-red-100 text-red-700 rounded-2xl font-black uppercase text-xs transition-all flex items-center justify-center gap-3 border-2 border-red-100 active:scale-95"
                            >
                                <Trash2 className="w-4 h-4" /> İPTAL
                            </button>
                        </div>
                    </div>
                </div>

                {/* Optional: Simple close at bottom */}
                <button
                    onClick={onClose}
                    className="w-full py-5 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-600 transition-all border-t border-slate-50 mt-auto"
                >
                    VAZGEÇ
                </button>
            </div>
        </div>
    );
}
