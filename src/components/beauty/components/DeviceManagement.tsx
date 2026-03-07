
import React, { useState } from 'react';
import {
    Cpu, Plus, Edit2, Trash2, Power, PowerOff,
    Activity, Settings, Zap, ShieldCheck, Calendar,
    Clock, Smartphone
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';
import '../ClinicStyles.css';

export function DeviceManagement() {
    const devices = [
        { id: '1', name: 'Diode Laser XL', type: 'Lazer Epilasyon', serial: 'SN-2024-001', status: 'active', lastMaintenance: '2024-01-15' },
        { id: '2', name: 'HydraFacial Pro', type: 'Cilt Bakımı', serial: 'SN-2024-002', status: 'active', lastMaintenance: '2024-02-10' },
        { id: '3', name: 'Ice Laser Platinum', type: 'Lazer Epilasyon', serial: 'SN-2024-003', status: 'maintenance', lastMaintenance: '2024-02-25' },
    ];

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Cihaz Tanımları</h1>
                    <p className="text-sm text-gray-500 mt-1">Güzellik merkezinizdeki tüm tıbbi ve kozmetik cihazları yönetin.</p>
                </div>
                <Button className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-6 rounded-2xl shadow-lg shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-2">
                    <Plus size={20} />
                    <span>YENİ CİHAZ EKLE</span>
                </Button>
            </div>

            {/* Device Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {devices.map(device => (
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
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                                        {device.type}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:bg-purple-600 hover:text-white transition-all shadow-sm">
                                    <Settings size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4 mb-8 relative z-10">
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-3xl border border-gray-100 group-hover:bg-white transition-colors">
                                <div className="flex items-center gap-3">
                                    <Smartphone className="w-4 h-4 text-gray-400" />
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SERİ NO</span>
                                </div>
                                <span className="text-xs font-black text-gray-900 font-mono tracking-wider">{device.serial}</span>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-3xl border border-gray-100 group-hover:bg-white transition-colors">
                                <div className="flex items-center gap-3">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SON BAKIM</span>
                                </div>
                                <span className="text-xs font-black text-gray-900">{device.lastMaintenance}</span>
                            </div>

                            <div className={cn(
                                "flex items-center gap-3 p-4 rounded-3xl border transition-all duration-300",
                                device.status === 'active'
                                    ? "bg-green-50 text-green-700 border-green-100"
                                    : "bg-orange-50 text-orange-700 border-orange-100"
                            )}>
                                <Activity size={20} className="animate-pulse" />
                                <div className="flex-1">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1">DURUM</p>
                                    <p className="text-sm font-black uppercase">
                                        {device.status === 'active' ? 'SİSTEM AKTİF' : 'BAKIM MODUNDA'}
                                    </p>
                                </div>
                                {device.status === 'active' ? <Power size={20} /> : <PowerOff size={20} />}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 relative z-10">
                            <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100 text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">KULLANIM</p>
                                <p className="text-lg font-black text-gray-900 leading-none">%84</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100 text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">BAKIM KALAN</p>
                                <p className="text-lg font-black text-gray-900 leading-none text-red-600">12 GÜN</p>
                            </div>
                        </div>

                        {/* Background Decor */}
                        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-purple-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                ))}

                {/* New Device Dummy Card */}
                <div className="bg-gray-50 rounded-[2.5rem] border-4 border-dashed border-gray-200 flex flex-col items-center justify-center p-8 text-gray-400 hover:border-purple-300 hover:bg-purple-50/30 transition-all cursor-pointer group">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4 group-hover:bg-purple-100 group-hover:text-purple-600 transition-all">
                        <Plus size={32} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest">YENİ CİHAZ TANIMLA</p>
                </div>
            </div>
        </div>
    );
}



