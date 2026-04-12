import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Printer,
    Plus,
    Trash2,
    Settings,
    RefreshCcw,
    Save,
    Check,
    AlertCircle,
    Network,
    Usb,
    Tag
} from 'lucide-react';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { useProductStore } from '../../../store/useProductStore';
import { PrinterProfile, PrinterRouting } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/components/ui/utils';
import { mergeWindowsPrinterNameIntoLocalStorage } from '@/utils/tauriPrintSettings';

export const RestaurantPrinterSettings: React.FC = () => {
    const {
        printerProfiles,
        printerRoutes,
        commonPrinterId,
        updatePrinterProfile,
        removePrinterProfile,
        updatePrinterRoute,
        removePrinterRoute,
        setCommonPrinter,
        menu,
        systemPrinters,
        loadSystemPrinters,
        loadMenu,
    } = useRestaurantStore();

    const refreshMenuFromProducts = useCallback(async () => {
        try {
            await useProductStore.getState().loadProducts(true);
        } catch {
            /* ağ yoksa bile menüyü mevcut stokla türet */
        }
        await loadMenu();
    }, [loadMenu]);

    useEffect(() => {
        loadSystemPrinters();
        void refreshMenuFromProducts();
    }, [loadSystemPrinters, refreshMenuFromProducts]);

    const [editingProfile, setEditingProfile] = useState<Partial<PrinterProfile> | null>(null);

    /** Menü ürünlerinden + DB’de kayıtlı rotalardan (yetim kategori kaybolmasın) */
    const categories = useMemo(() => {
        const set = new Set<string>();
        for (const item of menu) {
            const c = item.category != null ? String(item.category).trim() : '';
            if (c) set.add(c);
        }
        for (const r of printerRoutes) {
            const c = r.categoryId != null ? String(r.categoryId).trim() : '';
            if (c) set.add(c);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
    }, [menu, printerRoutes]);

    /** Silinmiş profile kalan ortak yazıcı id’si — seçim boş görünmesin */
    const commonPrinterSelectValue =
        commonPrinterId && printerProfiles.some((p) => p.id === commonPrinterId) ? commonPrinterId : '';

    const handleSaveProfile = () => {
        if (editingProfile && editingProfile.name) {
            updatePrinterProfile({
                id: editingProfile.id || uuidv4(),
                name: editingProfile.name,
                type: editingProfile.type || 'thermal',
                connection: editingProfile.connection || 'network',
                status: 'online',
                systemName: editingProfile.connection === 'system' ? editingProfile.systemName : undefined,
                ...editingProfile
            } as PrinterProfile);
            // Tauri 80mm fiş (print_html_silent) aynı localStorage anahtarını okur — buradan seçilen Windows yazıcısı fişe de yansır
            if (editingProfile.connection === 'system' && editingProfile.systemName?.trim()) {
                mergeWindowsPrinterNameIntoLocalStorage(editingProfile.systemName);
            }
            setEditingProfile(null);
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight uppercase">Yazıcı Yönetimi</h1>
                    <p className="text-slate-500 font-bold mt-1 uppercase text-[10px] tracking-widest">
                        Mutfak, Bar ve Kasa — profiller ve kategori rotaları veritabanında (firma bazlı) saklanır
                    </p>
                </div>
                <button
                    onClick={() => setEditingProfile({ id: uuidv4(), name: '', type: 'thermal', connection: 'network' })}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs transition-all shadow-xl shadow-blue-200 active:scale-95"
                >
                    <Plus className="w-4 h-4" />
                    Yeni Yazıcı Ekle
                </button>
            </div>

            <div className="flex flex-col gap-8">
                {/* 1. Yazıcı listesi */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                                <Printer className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Yazıcı Listesi</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {printerProfiles.map(profile => (
                                <div key={profile.id} className="p-6 bg-slate-50 rounded-[24px] border border-slate-100 group hover:border-blue-200 transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            {profile.connection === 'network' ? <Network className="w-5 h-5 text-blue-500" /> : <Usb className="w-5 h-5 text-slate-400" />}
                                            <span className="font-black text-slate-700 uppercase">{profile.name}</span>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setEditingProfile(profile)} className="p-2 text-slate-400 hover:text-blue-600"><Settings className="w-4 h-4" /></button>
                                            <button onClick={() => removePrinterProfile(profile.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "w-2 h-2 rounded-full",
                                            profile.status === 'online' ? "bg-emerald-500" : "bg-slate-300"
                                        )}></span>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{profile.status}</span>
                                        <span className="mx-2 text-slate-200">|</span>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                                            {profile.type} {profile.connection === 'system' ? `(${profile.systemName})` : profile.connection}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {printerProfiles.length === 0 && (
                                <div className="col-span-2 py-12 text-center border-2 border-dashed border-slate-100 rounded-[32px]">
                                    <Printer className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                    <p className="text-slate-400 font-bold uppercase text-xs">Tanımlı yazıcı bulunamadı</p>
                                </div>
                            )}
                        </div>
                </div>

                {/* 2. Ortak yazıcı */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border-2 border-blue-100 ring-1 ring-blue-50">
                        <div className="flex items-start gap-3 mb-5">
                            <div className="p-3 bg-blue-50 rounded-2xl text-blue-600 shrink-0">
                                <RefreshCcw className="w-6 h-6" aria-hidden />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Ortak Yazıcı</h2>
                                <p className="text-sm text-slate-600 mt-1.5 leading-snug">
                                    Hesap fişi ve varsayılan çıktı için bu profili seçin (tercihen <span className="font-semibold text-slate-800">Sistem yazıcısı</span>).
                                    Mutfakta kategori rotası yoksa yedek olarak da kullanılır.
                                </p>
                            </div>
                        </div>

                        <label htmlFor="rest-common-printer-select" className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                            Profil seçimi
                        </label>
                        <select
                            id="rest-common-printer-select"
                            value={commonPrinterSelectValue}
                            onChange={(e) => setCommonPrinter(e.target.value || undefined)}
                            className={cn(
                                'w-full rounded-2xl min-h-[3.5rem] px-4 py-3 text-base font-semibold',
                                'bg-slate-50 border-2 border-slate-200 text-slate-900',
                                'focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none cursor-pointer',
                                'shadow-inner'
                            )}
                        >
                            <option value="">Devre Dışı (yalnızca genel fiş yazıcısı — Yönetim / Yazıcı Ayarları)</option>
                            {printerProfiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                    {p.connection === 'system' && p.systemName ? ` — ${p.systemName}` : ''}
                                </option>
                            ))}
                        </select>
                        {printerProfiles.length === 0 ? (
                            <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                Önce «Yeni Yazıcı Ekle» ile en az bir profil oluşturun; liste burada görünür.
                            </p>
                        ) : null}
                </div>

                {/* 3. Kategori rotalama — ortak yazıcının altında */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                                <Tag className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Kategori Rotalama</h2>
                        </div>

                        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                            Her ürün kategorisi için mutfak çıktısının gideceği yazıcı profilini seçin. Liste, ürün stoğundaki kategori alanlarından oluşur.
                        </p>

                        <div className="space-y-4">
                            {categories.length === 0 ? (
                                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
                                    <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                                    <p className="text-slate-800 font-semibold text-sm mb-1">Henüz kategori yok</p>
                                    <p className="text-slate-600 text-xs mb-4 max-w-md mx-auto">
                                        Ürünler yüklenmediyse veya tüm ürünlerde kategori alanı boşsa bu liste görünmez. Stokta kategorisi olan ürünler yüklendikten sonra burada satırlar belirir.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void refreshMenuFromProducts()}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
                                    >
                                        <RefreshCcw className="w-4 h-4" />
                                        Ürün menüsünü yeniden yükle
                                    </button>
                                </div>
                            ) : (
                                categories.map((cat) => {
                                    const route = printerRoutes.find((r) => r.categoryId === cat);
                                    return (
                                        <div key={cat} className="space-y-2">
                                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide pl-1">{cat}</label>
                                            <select
                                                value={route?.printerId || ''}
                                                onChange={(e) => {
                                                    const pId = e.target.value;
                                                    if (pId) {
                                                        const profile = printerProfiles.find((p) => p.id === pId);
                                                        updatePrinterRoute({
                                                            id: route?.id || uuidv4(),
                                                            categoryId: cat,
                                                            printerId: pId,
                                                            printerName: profile?.name || '',
                                                            printerType: profile?.type || 'thermal',
                                                            connectionType: profile?.connection || 'usb',
                                                        } as PrinterRouting);
                                                    } else if (route) {
                                                        removePrinterRoute(route.id);
                                                    }
                                                }}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl min-h-12 px-4 py-2 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                            >
                                                <option value="">İstasyon seçin…</option>
                                                {printerProfiles.map((p) => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                </div>
            </div>

            {/* Edit Modal Placeholder */}
            {editingProfile && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[40px] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 duration-300">
                        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-8">Yazıcı Düzenle</h3>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Yazıcı Adı</label>
                                <input
                                    type="text"
                                    value={editingProfile.name || ''}
                                    onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl h-14 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Örn: Mutfak-1"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Bağlantı</label>
                                    <select
                                        value={editingProfile.connection || 'network'}
                                        onChange={(e) => setEditingProfile({ ...editingProfile, connection: e.target.value as any })}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl h-14 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="network">Network (IP)</option>
                                        <option value="usb">USB</option>
                                        <option value="system">Sistem Yazıcısı</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Tür</label>
                                    <select
                                        value={editingProfile.type || 'thermal'}
                                        onChange={(e) => setEditingProfile({ ...editingProfile, type: e.target.value as any })}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl h-14 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="thermal">Thermal (80mm)</option>
                                        <option value="standard">Standard (A4)</option>
                                    </select>
                                </div>
                            </div>

                            {editingProfile.connection === 'system' && (
                                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Windows Yazıcı Listesi</label>
                                    <select
                                        value={editingProfile.systemName || ''}
                                        onChange={(e) => setEditingProfile({ ...editingProfile, systemName: e.target.value, name: editingProfile.name || e.target.value })}
                                        className="w-full bg-blue-50 border border-blue-100 rounded-2xl h-14 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Yazıcı Seçin...</option>
                                        {systemPrinters.map((p: any) => (
                                            <option key={p.Name} value={p.Name}>{p.Name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {editingProfile.connection === 'network' && (
                                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">IP Adresi</label>
                                    <input
                                        type="text"
                                        value={(editingProfile as any).address || ''}
                                        onChange={(e) => setEditingProfile({ ...editingProfile, address: e.target.value } as any)}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl h-14 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="192.168.1.100"
                                    />
                                </div>
                            )}

                            <div className="flex gap-4 mt-10">
                                <button
                                    onClick={() => setEditingProfile(null)}
                                    className="flex-1 px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black uppercase text-xs transition-all"
                                >
                                    İptal
                                </button>
                                <button
                                    onClick={handleSaveProfile}
                                    className="flex-1 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs transition-all shadow-xl shadow-blue-200"
                                >
                                    Kaydet
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
