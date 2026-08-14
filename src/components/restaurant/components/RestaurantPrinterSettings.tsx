import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Printer,
    Plus,
    Trash2,
    Settings,
    RefreshCcw,
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
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { mergeWindowsPrinterNameIntoLocalStorage } from '@/utils/tauriPrintSettings';
import {
    buildPrinterCategoryRouteRows,
    findRouteForCategoryRow,
    rememberRestaurantCategories,
} from '@/utils/restaurantPrinterCategories';
import { useRestaurantModuleTm } from '../hooks/useRestaurantModuleTm';

export const RestaurantPrinterSettings: React.FC = () => {
    const tm = useRestaurantModuleTm();
    const {
        printerProfiles,
        printerRoutes,
        commonPrinterId,
        printViaWindowsService,
        updatePrinterProfile,
        removePrinterProfile,
        updatePrinterRoute,
        removePrinterRoute,
        setCommonPrinter,
        setPrintViaWindowsService,
        menu,
        categories: masterCategories,
        systemPrinters,
        loadSystemPrinters,
        loadMenu,
        loadCategories,
    } = useRestaurantStore();

    const refreshMenuFromProducts = useCallback(async () => {
        try {
            await useProductStore.getState().loadProducts(true);
        } catch {
            /* ağ yoksa bile menüyü mevcut stokla türet */
        }
        await Promise.all([loadMenu(), loadCategories()]);
    }, [loadMenu, loadCategories]);

    useEffect(() => {
        loadSystemPrinters();
        void refreshMenuFromProducts();
    }, [loadSystemPrinters, refreshMenuFromProducts]);

    useEffect(() => {
        if (masterCategories.length > 0) rememberRestaurantCategories(masterCategories);
    }, [masterCategories]);

    const [editingProfile, setEditingProfile] = useState<Partial<PrinterProfile> | null>(null);

    /** Kategori kartı + ürün stoğu + kayıtlı rotalar (yetim satır kaybolmasın) */
    const categoryRows = useMemo(
        () =>
            buildPrinterCategoryRouteRows({
                categories: masterCategories,
                extraLabels: menu.map((item) => String(item.category ?? '').trim()).filter(Boolean),
                existingRouteIds: printerRoutes.map((r) => String(r.categoryId ?? '').trim()).filter(Boolean),
            }),
        [masterCategories, menu, printerRoutes],
    );

    /** Silinmiş profile kalan ortak yazıcı id’si — seçim boş görünmesin */
    const commonPrinterSelectValue =
        commonPrinterId && printerProfiles.some((p) => p.id === commonPrinterId) ? commonPrinterId : '';

    const handleSaveProfile = () => {
        if (editingProfile && editingProfile.name) {
            const conn = editingProfile.connection || 'network';
            const addr = conn === 'network' ? String(editingProfile.address ?? '').trim() : undefined;
            const portNum = conn === 'network' ? Number(editingProfile.port) || 9100 : undefined;
            updatePrinterProfile({
                ...editingProfile,
                id: editingProfile.id || uuidv4(),
                name: editingProfile.name,
                type: editingProfile.type || 'thermal',
                connection: conn,
                status: 'online',
                systemName: conn === 'system' ? editingProfile.systemName : undefined,
                address: addr || undefined,
                port: conn === 'network' ? Math.min(65535, Math.max(1, portNum ?? 9100)) : undefined,
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
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">{tm('restPrintTitle')}</h1>
                    <p className="text-slate-500 font-bold mt-1 text-[10px] tracking-widest">
                        {tm('restPrintSubtitle')}
                    </p>
                    <p className="mt-2 text-xs font-bold text-blue-700">
                        Belge–dizayn eşlemesi: Sistem → Yazdırma Seçenekleri
                    </p>
                </div>
                <button
                    onClick={() =>
                        setEditingProfile({
                            id: uuidv4(),
                            name: '',
                            type: 'thermal',
                            connection: 'network',
                            address: '',
                            port: 9100,
                        })
                    }
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs transition-all shadow-xl shadow-blue-200 active:scale-95"
                >
                    <Plus className="w-4 h-4" />
                    {tm('restPrintAdd')}
                </button>
            </div>

            <div className="flex flex-col gap-8">
                {/* 1. Yazıcı listesi */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                                <Printer className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-black text-slate-800 tracking-tight">{tm('restPrintListTitle')}</h2>
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
                                            {profile.type}{' '}
                                            {profile.connection === 'system'
                                                ? `(${profile.systemName})`
                                                : profile.connection === 'network' && profile.address
                                                  ? `${profile.address}:${profile.port ?? 9100}`
                                                  : profile.connection}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {printerProfiles.length === 0 && (
                                <div className="col-span-2 py-12 text-center border-2 border-dashed border-slate-100 rounded-[32px]">
                                    <Printer className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                    <p className="text-slate-400 font-bold text-xs">{tm('restPrintEmpty')}</p>
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
                                <h2 className="text-xl font-black text-slate-900 tracking-tight">{tm('restPrintCommonTitle')}</h2>
                                <p className="text-sm text-slate-600 mt-1.5 leading-snug">{tm('restPrintCommonHint')}</p>
                            </div>
                        </div>

                        <label htmlFor="rest-common-printer-select" className="block text-xs font-bold text-slate-500 tracking-wide mb-2">
                            {tm('restPrintProfileSelect')}
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
                            <option value="">{tm('restPrintCommonDisabledOpt')}</option>
                            {printerProfiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                    {p.connection === 'system' && p.systemName ? ` — ${p.systemName}` : ''}
                                </option>
                            ))}
                        </select>
                        {printerProfiles.length === 0 ? (
                            <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                {tm('restPrintCommonWarn')}
                            </p>
                        ) : null}
                </div>

                {/* 3. Windows servis modu */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border-2 border-indigo-100 ring-1 ring-indigo-50">
                    <label className="flex items-start gap-4 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={printViaWindowsService}
                            onChange={(e) => setPrintViaWindowsService(e.target.checked)}
                            className="mt-1 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="min-w-0">
                            <span className="block text-base font-black text-slate-900">
                                Windows yazıcı servisi (RetailEX_Printer) — tüm yazıcı işlerini servis dağıtır
                            </span>
                            <span className="mt-1 block text-sm text-slate-600 leading-snug">
                                Açıkken mutfak, POS fişi, hesap fişi ve FastReport şablonları doğrudan basılmaz; yazıcı kuyruğuna eklenir.
                            </span>
                        </span>
                    </label>
                </div>

                {/* 4. Kategori rotalama — ortak yazıcının altında */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                                <Tag className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-xl font-black text-slate-800 tracking-tight">{tm('restPrintRouteTitle')}</h2>
                                <p className="text-sm text-slate-600 mt-1 leading-snug">{tm('restPrintRouteHint')}</p>
                            </div>
                        </div>

                        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4 leading-relaxed">
                            {tm('restPrintRouteDispatchBanner')}
                        </p>
                        <p className="text-xs text-slate-500 font-semibold mb-4">{tm('restPrintRouteMainHint')}</p>

                        <div className="space-y-2">
                            {categoryRows.length === 0 ? (
                                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
                                    <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                                    <p className="text-slate-800 font-semibold text-sm mb-1">{tm('restPrintNoCategoriesTitle')}</p>
                                    <p className="text-slate-600 text-xs mb-4 max-w-md mx-auto">{tm('restPrintNoCategoriesBody')}</p>
                                    <button
                                        type="button"
                                        onClick={() => void refreshMenuFromProducts()}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
                                    >
                                        <RefreshCcw className="w-4 h-4" />
                                        {tm('restPrintReloadMenu')}
                                    </button>
                                </div>
                            ) : (
                                categoryRows.map((row) => {
                                    const route = findRouteForCategoryRow(printerRoutes, row);
                                    const selectValue =
                                        route?.printerId && printerProfiles.some((p) => p.id === route.printerId)
                                            ? route.printerId
                                            : '';
                                    return (
                                        <div
                                            key={row.key}
                                            className={cn(
                                                'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-2xl border px-3 py-2.5',
                                                row.depth === 0
                                                    ? 'bg-slate-50 border-slate-200'
                                                    : 'bg-white border-slate-100 ml-4 sm:ml-8',
                                            )}
                                        >
                                            <label className={cn(
                                                'min-w-0 flex-1 text-sm font-bold text-slate-800',
                                                row.depth === 0 ? 'uppercase tracking-wide' : 'font-semibold normal-case',
                                            )}>
                                                {row.label}
                                            </label>
                                            <select
                                                value={selectValue}
                                                onChange={(e) => {
                                                    const pId = e.target.value;
                                                    if (pId) {
                                                        const profile = printerProfiles.find((p) => p.id === pId);
                                                        updatePrinterRoute({
                                                            id: route?.id || uuidv4(),
                                                            categoryId: row.key,
                                                            printerId: pId,
                                                            printerName: profile?.name || '',
                                                            printerType: profile?.type || 'thermal',
                                                            connectionType: profile?.connection || 'usb',
                                                        } as PrinterRouting);
                                                    } else if (route) {
                                                        removePrinterRoute(route.id);
                                                    }
                                                }}
                                                className="w-full sm:w-72 shrink-0 bg-white border border-slate-200 rounded-xl min-h-11 px-3 py-2 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                            >
                                                <option value="">{tm('restPrintStationPlaceholder')}</option>
                                                {printerProfiles.map((p) => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name}
                                                        {p.connection === 'network' && p.address
                                                            ? ` (${p.address}:${p.port ?? 9100})`
                                                            : p.connection === 'system' && p.systemName
                                                              ? ` (${p.systemName})`
                                                              : ''}
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

            {editingProfile && (
                <PercentBodyModal onClose={() => setEditingProfile(null)} size="compact" ariaLabel={tm('restPrintModalTitle')}>
                    <div className="shrink-0 px-8 pt-8 pb-2">
                        <h3 className="text-2xl font-black text-slate-800 tracking-tight">{tm('restPrintModalTitle')}</h3>
                    </div>
                    <PercentBodyModalScrollBody className="px-8 py-4 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 tracking-[0.2em] pl-1">{tm('restPrintNameLabel')}</label>
                                <input
                                    type="text"
                                    value={editingProfile.name || ''}
                                    onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl h-14 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={tm('restPrintNamePh')}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 tracking-[0.2em] pl-1">{tm('restPrintConnLabel')}</label>
                                    <select
                                        value={editingProfile.connection || 'network'}
                                        onChange={(e) => setEditingProfile({ ...editingProfile, connection: e.target.value as any })}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl h-14 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="network">{tm('restPrintConnNetwork')}</option>
                                        <option value="usb">{tm('restPrintConnUsb')}</option>
                                        <option value="system">{tm('restPrintConnSystem')}</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 tracking-[0.2em] pl-1">{tm('restPrintTypeLabel')}</label>
                                    <select
                                        value={editingProfile.type || 'thermal'}
                                        onChange={(e) => setEditingProfile({ ...editingProfile, type: e.target.value as any })}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl h-14 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="thermal">{tm('restPrintTypeThermal')}</option>
                                        <option value="standard">{tm('restPrintTypeStandard')}</option>
                                    </select>
                                </div>
                            </div>

                            {editingProfile.connection === 'system' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 tracking-[0.2em] pl-1">{tm('restPrintWinList')}</label>
                                    <select
                                        value={editingProfile.systemName || ''}
                                        onChange={(e) => setEditingProfile({ ...editingProfile, systemName: e.target.value, name: editingProfile.name || e.target.value })}
                                        className="w-full bg-blue-50 border border-blue-100 rounded-2xl h-14 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">{tm('restPrintWinPick')}</option>
                                        {systemPrinters.map((p: any) => (
                                            <option key={p.Name} value={p.Name}>{p.Name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {editingProfile.connection === 'network' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 tracking-[0.2em] pl-1">{tm('restPrintIpLabel')}</label>
                                        <input
                                            type="text"
                                            value={editingProfile.address || ''}
                                            onChange={(e) => setEditingProfile({ ...editingProfile, address: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl h-14 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="192.168.1.100"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 tracking-[0.2em] pl-1">{tm('restPrintPortLabel')}</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={65535}
                                            value={editingProfile.port ?? 9100}
                                            onChange={(e) =>
                                                setEditingProfile({
                                                    ...editingProfile,
                                                    port: Math.min(65535, Math.max(1, Number(e.target.value) || 9100)),
                                                })
                                            }
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl h-14 px-6 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <p className="text-[11px] text-slate-500 pl-1">{tm('restPrintPortHint')}</p>
                                    </div>
                                </div>
                            )}
                    </PercentBodyModalScrollBody>
                    <div className="shrink-0 flex gap-4 px-8 pb-8 pt-2">
                                <button
                                    onClick={() => setEditingProfile(null)}
                                    className="flex-1 px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black uppercase text-xs transition-all"
                                >
                                    {tm('restPrintCancel')}
                                </button>
                                <button
                                    onClick={handleSaveProfile}
                                    className="flex-1 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs transition-all shadow-xl shadow-blue-200"
                                >
                                    {tm('restPrintSave')}
                                </button>
                    </div>
                </PercentBodyModal>
            )}
        </div>
    );
};
