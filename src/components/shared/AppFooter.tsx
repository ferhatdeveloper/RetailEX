import React, { useEffect, useState } from 'react';
import { APP_VERSION } from '../../core/version';
import {
    Wifi, WifiOff, Database, Clock, Globe, CheckCircle2, XCircle, Loader2,
    ArrowLeft, ArrowRight
} from 'lucide-react';
const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

interface VpnStatus {
    is_running: boolean;
    virtual_ip: string;
}

interface LastSyncInfo {
    last_sync_date?: string;
}

interface AppFooterProps {
    showNavigation?: boolean;
    onPrev?: () => void;
    onNext?: () => void;
    prevDisabled?: boolean;
    nextDisabled?: boolean;
    nextLabel?: string;
    prevLabel?: string;
}

export const AppFooter: React.FC<AppFooterProps> = ({
    showNavigation = false,
    onPrev,
    onNext,
    prevDisabled = false,
    nextDisabled = false,
    nextLabel = "DEVAM ET",
    prevLabel = "GERİ DÖN"
}) => {
    const [vpnStatus, setVpnStatus] = useState<VpnStatus>({ is_running: false, virtual_ip: 'N/A' });
    const [isOnline, setIsOnline] = useState<boolean>(true);
    const [dbConnected, setDbConnected] = useState<boolean>(true);
    const [lastSyncTime, setLastSyncTime] = useState<string>('--:--');
    const [currentTime, setCurrentTime] = useState<string>('');

    // Update VPN status
    const updateVpnStatus = async () => {
        try {
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const status: VpnStatus = await invoke('get_vpn_status');
                setVpnStatus(status);
            } else {
                setVpnStatus({ is_running: false, virtual_ip: 'WEB' });
            }
        } catch (err) {
            console.error('Failed to fetch VPN status:', err);
        }
    };

    // Fetch last sync time
    const fetchLastSync = async () => {
        try {
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const config = await invoke('get_app_config');
                const info: LastSyncInfo = await invoke('get_last_sync_info', { config });
                if (info.last_sync_date) {
                    const date = new Date(info.last_sync_date);
                    const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                    setLastSyncTime(timeStr);
                }
            } else {
                setLastSyncTime('N/A');
            }
        } catch (err) {
            console.error('Failed to fetch last sync info:', err);
        }
    };

    // Update current time
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        };
        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, []);

    // Check online status
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Initial data fetch
    useEffect(() => {
        updateVpnStatus();
        fetchLastSync();

        const vpnInterval = setInterval(updateVpnStatus, 10000); // Every 10 seconds
        const syncInterval = setInterval(fetchLastSync, 30000); // Every 30 seconds

        return () => {
            clearInterval(vpnInterval);
            clearInterval(syncInterval);
        };
    }, []);

    return (
        <div className="h-10 bg-[#0a0b0d]/95 backdrop-blur-sm border-t border-white/[0.05] flex items-center justify-between px-6 text-[10px] select-none relative z-10">
            {/* Left Section: Navigation + Status */}
            <div className="flex items-center gap-4">
                {showNavigation && onPrev && (
                    <button
                        onClick={onPrev}
                        disabled={prevDisabled}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg border transition-all ${prevDisabled
                            ? 'border-white/5 text-slate-700 cursor-not-allowed opacity-50'
                            : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <ArrowLeft className="w-3 h-3" />
                        <span className="font-semibold text-[9px] uppercase tracking-wider">{prevLabel}</span>
                    </button>
                )}

                {/* Online/Offline Status */}
                <div className="flex items-center gap-1.5">
                    {isOnline ? (
                        <Wifi className="w-3 h-3 text-emerald-500" />
                    ) : (
                        <WifiOff className="w-3 h-3 text-rose-500" />
                    )}
                    <span className={`font-medium ${isOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isOnline ? 'Online' : 'Offline'}
                    </span>
                </div>

                {/* Database Status */}
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.02] border border-white/5">
                    <Database className={`w-3 h-3 ${dbConnected ? 'text-blue-500' : 'text-rose-500'}`} />
                    <span className={`font-medium text-[9px] ${dbConnected ? 'text-slate-400' : 'text-rose-400'}`}>
                        DB {dbConnected ? 'Connected' : 'Disconnected'}
                    </span>
                </div>

                {/* VPN Status */}
                {vpnStatus.is_running && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                        <Globe className="w-3 h-3 text-emerald-500" />
                        <span className="font-medium text-emerald-400 text-[9px]">{vpnStatus.virtual_ip}</span>
                    </div>
                )}
            </div>

            {/* Center Section: Navigation Button */}
            {showNavigation && onNext && (
                <button
                    onClick={onNext}
                    disabled={nextDisabled}
                    className={`flex items-center gap-2 px-8 py-2 rounded-lg transition-all ${nextDisabled
                        ? 'bg-white/5 text-slate-700 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg hover:shadow-xl'
                        }`}
                >
                    <span className="font-bold text-[10px] uppercase tracking-wider">
                        {nextDisabled ? "Bekleyin" : nextLabel}
                    </span>
                    {!nextDisabled ? (
                        <ArrowRight className="w-3 h-3" />
                    ) : (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                </button>
            )}

            {/* Right Section: System Info */}
            <div className="flex items-center gap-4">
                {/* Last Sync */}
                {!showNavigation && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.02] border border-white/5">
                        <CheckCircle2 className="w-3 h-3 text-blue-500" />
                        <span className="text-slate-500 text-[9px] font-medium">Son Senkron:</span>
                        <span className="text-blue-400 font-semibold text-[9px]">{lastSyncTime}</span>
                    </div>
                )}

                {/* Current Time */}
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.02] border border-white/5">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400 font-mono text-[9px] font-semibold">{currentTime}</span>
                </div>

                {/* System Version */}
                <div className="flex flex-col items-end">
                    <span className="text-white/50 font-bold uppercase tracking-wider text-[8px]">RetailEX ERP</span>
                    <span className="text-slate-600 font-semibold text-[7px] tracking-wide">v{APP_VERSION.full}</span>
                </div>
            </div>
        </div>
    );
};


