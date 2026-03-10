import React, { useEffect, useState } from 'react';
import {
    Cpu, Plus, Settings, Activity, Power, PowerOff,
    Calendar, Smartphone, X, Save, Edit2, Zap, AlertTriangle
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/components/ui/utils';
import type { BeautyDevice } from '../../../types/beauty';
import '../ClinicStyles.css';

const DEVICE_TYPES = [
    { value: 'laser', label: 'Lazer Epilasyon' },
    { value: 'ipl', label: 'IPL' },
    { value: 'hydrafacial', label: 'HydraFacial' },
    { value: 'rf', label: 'Radyofrekans (RF)' },
    { value: 'hifu', label: 'HIFU' },
    { value: 'ultrasound', label: 'Ultrason' },
    { value: 'other', label: 'Diğer' },
];

const EMPTY_FORM: Partial<BeautyDevice> = {
    name: '', device_type: 'laser', serial_number: '', manufacturer: '',
    model: '', total_shots: 0, max_shots: 500000, status: 'active', notes: '',
};

export function DeviceManagement() {
    const { devices, bodyRegions, isLoading, loadDevices, loadBodyRegions, createDevice, updateDevice } = useBeautyStore();
    const { tm } = useLanguage();
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyDevice>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showRegions, setShowRegions] = useState(false);

    useEffect(() => {
        loadDevices();
        loadBodyRegions();
    }, []);

    const openCreate = () => { setEditing(EMPTY_FORM); setIsEdit(false); setShowModal(true); };
    const openEdit = (d: BeautyDevice) => { setEditing({ ...d }); setIsEdit(true); setShowModal(true); };

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            if (isEdit && editing.id) await updateDevice(editing.id, editing);
            else await createDevice(editing);
            setShowModal(false);
        } finally { setSaving(false); }
    };

    const shotPct = (d: BeautyDevice) =>
        d.max_shots ? Math.min(100, Math.round((d.total_shots / d.max_shots) * 100)) : 0;

    const maintenanceDaysLeft = (d: BeautyDevice) => {
        if (!d.maintenance_due) return null;
        const diff = Math.ceil((new Date(d.maintenance_due).getTime() - Date.now()) / 86400000);
        return diff;
    };

    const statusBadge = (d: BeautyDevice) => {
        if (d.status === 'maintenance') return { label: tm('bStatusMaintenance'), cls: 'bg-orange-100 text-orange-700' };
        if (d.status === 'retired') return { label: tm('bStatusRetired'), cls: 'bg-slate-100 text-slate-500' };
        const days = maintenanceDaysLeft(d);
        if (days !== null && days <= 14) return { label: `${days}g ${tm('bMaintenanceLabel')}`, cls: 'bg-yellow-100 text-yellow-700' };
        const pct = shotPct(d);
        if (pct >= 90) return { label: tm('bStatusFull'), cls: 'bg-red-100 text-red-700' };
        return { label: tm('bStatusActive'), cls: 'bg-green-100 text-green-700' };
    };

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{tm('bDeviceManagement')}</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {isLoading ? tm('bLoading') : `${devices.length} tanımlı cihaz`}
                        {bodyRegions.length > 0 && ` · ${bodyRegions.length} bölge tanımı`}
                    </p>
                </div>
                <div className="flex gap-2">
                    {bodyRegions.length > 0 && (
                        <Button
                            variant="outline"
                            onClick={() => setShowRegions(true)}
                            className="rounded-2xl border-purple-200 text-purple-600 hover:bg-purple-50 font-bold gap-2"
                        >
                            <Zap size={16} /> {tm('bRegionTable')}
                        </Button>
                    )}
                    <Button
                        onClick={openCreate}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-6 rounded-2xl shadow-lg shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-2"
                    >
                        <Plus size={20} /> {tm('bDeviceCreate')}
                    </Button>
                </div>
            </div>

            {/* Devices Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">{tm('bLoading')}</div>
            ) : devices.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400">
                    <Cpu size={40} />
                    <p className="text-sm font-medium">{tm('bNoDevices')}</p>
                    <Button onClick={openCreate} variant="outline" className="rounded-xl text-purple-600 border-purple-200">
                        <Plus size={16} className="mr-2" /> {tm('bAddFirstDevice')}
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {devices.map(device => {
                        const pct = shotPct(device);
                        const badge = statusBadge(device);
                        const daysLeft = maintenanceDaysLeft(device);
                        const typLabel = DEVICE_TYPES.find(t => t.value === device.device_type)?.label ?? device.device_type;
                        return (
                            <div
                                key={device.id}
                                className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-2xl transition-all duration-300 p-8 group relative overflow-hidden"
                            >
                                <div className="flex items-start justify-between mb-6 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "w-16 h-16 rounded-[1.5rem] flex items-center justify-center border transition-all duration-500 rotate-3 group-hover:rotate-0",
                                            device.status === 'active'
                                                ? "bg-blue-50 border-blue-100 text-blue-600 shadow-blue-100/50 shadow-lg"
                                                : "bg-orange-50 border-orange-100 text-orange-600 shadow-orange-100/50 shadow-lg"
                                        )}>
                                            <Cpu size={32} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 leading-tight uppercase group-hover:text-purple-600 transition-colors">
                                                {device.name}
                                            </h3>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">{typLabel}</p>
                                            {device.manufacturer && (
                                                <p className="text-[10px] text-gray-400 mt-0.5">{device.manufacturer} {device.model}</p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => openEdit(device)}
                                        className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:bg-purple-600 hover:text-white transition-all shadow-sm"
                                    >
                                        <Settings size={18} />
                                    </button>
                                </div>

                                <div className="space-y-3 mb-6 relative z-10">
                                    {device.serial_number && (
                                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="flex items-center gap-2">
                                                <Smartphone className="w-4 h-4 text-gray-400" />
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{tm('bSerialNoLabel')}</span>
                                            </div>
                                            <span className="text-xs font-black text-gray-900 font-mono">{device.serial_number}</span>
                                        </div>
                                    )}

                                    {device.last_maintenance && (
                                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-gray-400" />
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{tm('bLastMaintenance')}</span>
                                            </div>
                                            <span className="text-xs font-black text-gray-900">
                                                {new Date(device.last_maintenance).toLocaleDateString('tr-TR')}
                                            </span>
                                        </div>
                                    )}

                                    {/* Shot counter progress */}
                                    {(device.max_shots ?? 0) > 0 && (
                                        <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="flex justify-between items-center mb-1.5">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{tm('bShotCount')}</span>
                                                <span className="text-[10px] font-black text-gray-700">
                                                    {(device.total_shots ?? 0).toLocaleString('tr-TR')} / {(device.max_shots ?? 0).toLocaleString('tr-TR')}
                                                </span>
                                            </div>
                                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                    className={cn("h-full rounded-full transition-all", pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-blue-500')}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className={cn(
                                        "flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300",
                                        device.status === 'active' ? "bg-green-50 text-green-700 border-green-100" : "bg-orange-50 text-orange-700 border-orange-100"
                                    )}>
                                        {device.status === 'active' ? <Power size={18} className="animate-pulse" /> : <PowerOff size={18} />}
                                        <div className="flex-1">
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1">{tm('bDeviceStatus')}</p>
                                            <p className="text-sm font-black uppercase">{badge.label}</p>
                                        </div>
                                        {daysLeft !== null && daysLeft <= 30 && (
                                            <AlertTriangle size={16} className="text-yellow-500" />
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 relative z-10">
                                    <div className="bg-gray-50 p-3 rounded-3xl border border-gray-100 text-center">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{tm('bUsage')}</p>
                                        <p className={cn("text-lg font-black leading-none", pct >= 90 ? 'text-red-600' : 'text-gray-900')}>
                                            %{pct}
                                        </p>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-3xl border border-gray-100 text-center">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{tm('bMaintenanceLabel')}</p>
                                        {daysLeft !== null ? (
                                            <p className={cn("text-lg font-black leading-none", daysLeft <= 14 ? 'text-red-600' : 'text-gray-900')}>
                                                {daysLeft > 0 ? `${daysLeft}g` : tm('bStatusOverdue')}
                                            </p>
                                        ) : (
                                            <p className="text-lg font-black leading-none text-gray-400">-</p>
                                        )}
                                    </div>
                                </div>

                                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-purple-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        );
                    })}

                    {/* Add Card */}
                    <div
                        onClick={openCreate}
                        className="bg-gray-50 rounded-[2.5rem] border-4 border-dashed border-gray-200 flex flex-col items-center justify-center p-8 text-gray-400 hover:border-purple-300 hover:bg-purple-50/30 transition-all cursor-pointer group min-h-[300px]"
                    >
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4 group-hover:bg-purple-100 group-hover:text-purple-600 transition-all">
                            <Plus size={32} />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest">{tm('bDefineNewDevice')}</p>
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black">{isEdit ? tm('bDeviceEdit') : tm('bDeviceNew')}</h2>
                                <p className="text-white/70 text-xs mt-1">beauty.rex_firma_beauty_devices</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-xl transition"><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bDeviceName')} <span className="text-red-500">*</span></label>
                                <input type="text" value={editing.name ?? ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="Diode Laser XL" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bDeviceType')}</label>
                                    <select value={editing.device_type ?? 'laser'} onChange={e => setEditing(p => ({ ...p, device_type: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 bg-white">
                                        {DEVICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bDeviceStatus')}</label>
                                    <select value={editing.status ?? 'active'} onChange={e => setEditing(p => ({ ...p, status: e.target.value as any }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 bg-white">
                                        <option value="active">{tm('bStatusActive')}</option>
                                        <option value="maintenance">{tm('bStatusMaintenance')}</option>
                                        <option value="retired">{tm('bStatusRetired')}</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bDeviceManufacturer')}</label>
                                    <input type="text" value={editing.manufacturer ?? ''} onChange={e => setEditing(p => ({ ...p, manufacturer: e.target.value }))} placeholder="Lumenis" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bDeviceModelLabel')}</label>
                                    <input type="text" value={editing.model ?? ''} onChange={e => setEditing(p => ({ ...p, model: e.target.value }))} placeholder="Lightsheer Duet" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bDeviceSerialNo')}</label>
                                <input type="text" value={editing.serial_number ?? ''} onChange={e => setEditing(p => ({ ...p, serial_number: e.target.value }))} placeholder="SN-2024-001" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bDeviceMaxShots')}</label>
                                    <input type="number" min={0} value={editing.max_shots ?? 500000} onChange={e => setEditing(p => ({ ...p, max_shots: Number(e.target.value) }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bDeviceNextMaintenance')}</label>
                                    <input type="date" value={editing.maintenance_due ?? ''} onChange={e => setEditing(p => ({ ...p, maintenance_due: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bDevicePurchaseDate')}</label>
                                    <input type="date" value={editing.purchase_date ?? ''} onChange={e => setEditing(p => ({ ...p, purchase_date: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bDeviceWarranty')}</label>
                                    <input type="date" value={editing.warranty_expiry ?? ''} onChange={e => setEditing(p => ({ ...p, warranty_expiry: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bDeviceNotes')}</label>
                                <textarea value={editing.notes ?? ''} onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 resize-none" placeholder="Cihaz hakkında notlar..." />
                            </div>
                        </div>

                        <div className="px-6 pb-6 flex gap-3">
                            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 rounded-xl border-slate-200 font-bold">{tm('cancel')}</Button>
                            <Button onClick={handleSave} disabled={!editing.name?.trim() || saving} className="flex-1 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold">
                                <Save size={16} className="mr-2" />{saving ? tm('bSaving') : tm('save')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Body Regions Modal */}
            {showRegions && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black">{tm('bRegionTable')}</h2>
                                <p className="text-white/70 text-xs mt-1">beauty.body_regions — paylaşılan statik tablo</p>
                            </div>
                            <button onClick={() => setShowRegions(false)} className="p-2 hover:bg-white/20 rounded-xl transition"><X size={20} /></button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                        <th className="pb-2 text-left">{tm('bRegionZone')}</th>
                                        <th className="pb-2 text-center">Min</th>
                                        <th className="pb-2 text-center">Ort.</th>
                                        <th className="pb-2 text-center">Max</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {bodyRegions.map(r => (
                                        <tr key={r.id} className="hover:bg-purple-50/50 transition-colors">
                                            <td className="py-2.5 font-bold text-slate-800">{r.name}</td>
                                            <td className="py-2.5 text-center text-slate-500">{r.min_shots}</td>
                                            <td className="py-2.5 text-center font-black text-purple-600">{r.avg_shots}</td>
                                            <td className="py-2.5 text-center text-slate-500">{r.max_shots}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 pb-6">
                            <Button onClick={() => setShowRegions(false)} className="w-full rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold">{tm('close')}</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
