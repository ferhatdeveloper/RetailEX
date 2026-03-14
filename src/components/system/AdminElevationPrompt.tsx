import React from 'react';
import { Shield, Zap, RefreshCw, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface AdminElevationPromptProps {
    isOpen: boolean;
    onClose: () => void;
    reason?: string;
}

export const AdminElevationPrompt: React.FC<AdminElevationPromptProps> = ({ isOpen, onClose, reason }) => {
    if (!isOpen) return null;

    const handleRestartAsAdmin = async () => {
        try {
            await invoke('request_elevation');
        } catch (error) {
            console.error('Elevation request failed:', error);
            alert('Yönetici yetkisi istenemedi. Lütfen uygulamayı manuel olarak yönetici olarak çalıştırın.');
        }
    };

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-[#0c1117] border border-blue-500/30 rounded-[32px] shadow-[0_0_50px_rgba(37,99,235,0.2)] overflow-hidden relative">
                {/* Decorative background */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 blur-[50px] rounded-full" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-600/10 blur-[50px] rounded-full" />

                <div className="relative z-10 p-8 text-center space-y-6">
                    <div className="w-20 h-20 bg-blue-600/20 border border-blue-500/30 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                        <Shield className="w-10 h-10 text-blue-400" />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-white tracking-tight uppercase">Yönetici Yetkisi Gerekiyor</h2>
                        <div className="text-blue-400 font-black uppercase tracking-widest text-[10px] opacity-60">Privilege Elevation Required</div>
                    </div>

                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 text-sm text-slate-400 leading-relaxed">
                        VPN servisinin ağ bağdaştırıcısı (Wintun) oluşturabilmesi için sistem yöneticisi yetkilerine ihtiyacı var. {reason && <span className="text-blue-400/80 block mt-2 italic">"{reason}"</span>}
                    </div>

                    <div className="flex flex-col gap-3">
                        <button
                            onClick={handleRestartAsAdmin}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs tracking-widest uppercase shadow-[0_15px_30px_-5px_rgba(37,99,235,0.4)] transition-all flex items-center justify-center gap-3 active:scale-95 group"
                        >
                            <Zap className="w-4 h-4 group-hover:animate-pulse" />
                            YÖNETİCİ OLARAK YENİDEN BAŞLAT
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full py-4 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-2xl font-black text-[10px] tracking-widest uppercase transition-all flex items-center justify-center gap-2"
                        >
                            <X className="w-3 h-3" />
                            ŞİMDİLİK ATLA
                        </button>
                    </div>

                    <p className="text-[9px] text-slate-500 font-medium uppercase tracking-tight">
                        RetailEX Mesh Network güvenliğiniz için bu yetkiyi talep etmektedir.
                    </p>
                </div>
            </div>
        </div>
    );
};
