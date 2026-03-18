import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Scale, Package, ChevronLeft, Send, ShoppingCart, RefreshCcw } from 'lucide-react';

interface WeightReading {
    weight: number;
    unit: string;
    stable: boolean;
    timestamp: number;
}

interface Product {
    code: string;
    name: string;
    price_per_kg: number;
    category: string;
    icon: string;
}

export function CashierScale({ onBack }: { onBack: () => void }) {
    const [weight, setWeight] = useState<WeightReading | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [totalPrice, setTotalPrice] = useState(0);
    const [scaleConnected, setScaleConnected] = useState(false);
    const [loading, setLoading] = useState(false);

    const mockProducts: Product[] = [
        { code: 'DOMATES', name: 'Domates', price_per_kg: 45.00, category: 'Sebze', icon: 'ğŸ…' },
        { code: 'ELMA', name: 'Elma', price_per_kg: 35.00, category: 'Meyve', icon: 'ğŸ' },
        { code: 'PEYNIR', name: 'Kaşar Peyniri', price_per_kg: 280.00, category: 'Şarküteri', icon: 'ğŸ§€' },
        { code: 'ZEYTIN', name: 'Siyah Zeytin', price_per_kg: 120.00, category: 'Şarküteri', icon: 'ğŸ«’' },
        { code: 'ALTIN', name: '22 Ayar Bilezik', price_per_kg: 2850000.50, category: 'Kuyumcu', icon: 'ğŸ’' },
    ];

    useEffect(() => {
        connectScale();
        const unlisten = subscribeToWeight();
        return () => {
            unlisten.then(f => f());
        };
    }, []);

    useEffect(() => {
        if (weight && selectedProduct) {
            const price = (weight.weight * selectedProduct.price_per_kg);
            setTotalPrice(price);
        } else {
            setTotalPrice(0);
        }
    }, [weight, selectedProduct]);

    const connectScale = async () => {
        setLoading(true);
        try {
            await invoke('start_scale', {
                port: 'COM1',
                baudRate: 9600,
            });
            setScaleConnected(true);
        } catch (error) {
            console.error('Scale connection error:', error);
            // Fallback for simulation if needed
        } finally {
            setLoading(false);
        }
    };

    const subscribeToWeight = async () => {
        return await listen<WeightReading>('scale-weight', (event) => {
            setWeight(event.payload);
        });
    };

    const sendToScale = async () => {
        if (!selectedProduct) return;
        try {
            await invoke('print_jewelry_label', {
                productName: selectedProduct.name,
                barcode: selectedProduct.code,
                weight: weight?.weight || 0,
                price: totalPrice
            });
            alert('Etiket yazdırıldı.');
        } catch (error) {
            alert('Yazdırma hatası: ' + error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <ChevronLeft className="w-6 h-6 text-slate-600" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Scale className="w-6 h-6 text-blue-600" />
                        <h2 className="text-xl font-bold text-slate-800">Tartılı Satış & Etiketleme</h2>
                    </div>
                </div>

                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${scaleConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    <div className={`w-2 h-2 rounded-full ${scaleConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                    {scaleConnected ? 'Terazi Bağlı (COM1)' : 'Terazi Bağlantısı Yok'}
                    {!scaleConnected && (
                        <button onClick={connectScale} className="ml-2 hover:bg-red-200 rounded p-0.5">
                            <RefreshCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden p-6 gap-6">
                {/* Left: Product Selection */}
                <div className="w-1/3 bg-white rounded-2xl shadow-sm border p-6 flex flex-col gap-4 overflow-hidden">
                    <div className="flex items-center gap-2 mb-2">
                        <Package className="w-5 h-5 text-slate-500" />
                        <h3 className="font-semibold text-slate-700">Ürün Seçimi</h3>
                    </div>

                    <div className="space-y-3 overflow-y-auto pr-2">
                        {mockProducts.map((p) => (
                            <button
                                key={p.code}
                                onClick={() => setSelectedProduct(p)}
                                className={`w-full p-4 flex items-center justify-between rounded-xl border-2 transition-all ${selectedProduct?.code === p.code
                                        ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-100'
                                        : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    <span className="text-3xl">{p.icon}</span>
                                    <div className="text-left">
                                        <div className="font-bold text-slate-800">{p.name}</div>
                                        <div className="text-xs text-slate-500">{p.category}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono text-blue-600 font-bold">{p.price_per_kg.toLocaleString('tr-TR')}</div>
                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Birim (kg)</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right: Scale & Result */}
                <div className="flex-1 flex flex-col gap-6">
                    {/* Real-time Weight Display */}
                    <div className="bg-slate-900 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity">
                            <Scale className="w-32 h-32 text-white" />
                        </div>

                        <div className="relative z-10 flex flex-col items-center">
                            <div className="text-slate-400 text-sm font-medium uppercase tracking-[0.2em] mb-2">Anlık Ağırlık</div>
                            <div className="flex items-baseline gap-4">
                                <span className="text-8xl font-black text-white font-mono tracking-tighter">
                                    {weight ? weight.weight.toFixed(3) : '0.000'}
                                </span>
                                <span className="text-4xl font-bold text-blue-400 font-mono italic">
                                    {weight?.unit || 'kg'}
                                </span>
                            </div>

                            <div className="mt-6 flex items-center gap-4">
                                <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold transition-all ${weight?.stable ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    }`}>
                                    {weight?.stable ? (
                                        <>
                                            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                                            STABİL
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                                            TARTILIYOR
                                        </>
                                    )}
                                </div>
                                {weight && (
                                    <span className="text-slate-500 text-xs font-mono">
                                        Sinyal: 120ms
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Final Calculation & Actions */}
                    <div className="flex-1 bg-white rounded-2xl shadow-sm border p-8 flex flex-col">
                        <div className="flex-1">
                            {selectedProduct ? (
                                <div className="flex flex-col h-full">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h4 className="text-3xl font-black text-slate-800">{selectedProduct.name}</h4>
                                            <p className="text-slate-500">Ürün Kodu: <span className="font-mono text-slate-700">{selectedProduct.code}</span></p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-medium text-slate-400 uppercase">Toplam Tutar</div>
                                            <div className="text-4xl font-black text-blue-600 font-mono">
                                                {totalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mt-auto">
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Miktar</div>
                                            <div className="text-2xl font-bold text-slate-700 font-mono">
                                                {weight?.weight.toFixed(3) || '0.000'} <span className="text-sm text-slate-500">{weight?.unit || 'kg'}</span>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Birim Fiyat</div>
                                            <div className="text-2xl font-bold text-slate-700 font-mono">
                                                {selectedProduct.price_per_kg.toLocaleString('tr-TR')} <span className="text-sm text-slate-500">/kg</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                                    <Package className="w-20 h-20 mb-4 opacity-10" />
                                    <p className="font-medium">İşlem için lütfen sol menüden bir ürün seçin.</p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4 mt-8">
                            <button
                                disabled={!selectedProduct || !scaleConnected}
                                onClick={sendToScale}
                                className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-200 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                            >
                                <Send className="w-5 h-5" />
                                TERAZİYE GÖNDER & YAZDIR
                            </button>

                            <button
                                disabled={!selectedProduct || !weight?.stable}
                                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-200 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
                            >
                                <ShoppingCart className="w-5 h-5" />
                                SATIŞA EKLE
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

