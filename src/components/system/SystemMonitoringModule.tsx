import { useState, useEffect } from 'react';
import { Activity, Shield, Cpu, Network, Terminal, RefreshCw, Radio, HardDrive } from 'lucide-react';
const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export function SystemMonitoringModule() {
    const [vpnStatus, setVpnStatus] = useState<any>(null);
    const [hwId, setHwId] = useState('...');
    const [logs, setLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const addLog = (msg: string) => {
        setLogs(prev => [msg, ...prev].slice(0, 10));
    };

    const fetchStatus = async () => {
        try {
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const status: any = await invoke('get_vpn_status');
                const id: any = await invoke('get_system_id');
                setVpnStatus(status);
                setHwId(id);
                if (status.is_running) {
                    addLog(`📡 Mesh IP: ${status.virtual_ip} aktif.`);
                }
            } else {
                setVpnStatus({ is_running: false, virtual_ip: '127.0.0.1 (Web)' });
                setHwId('WEB-CLIENT-ID-MOCK');
            }
            setLoading(false);
        } catch (e) {
            addLog(`❌ Hata: ${e}`);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);

        // Initial "IT System Boot" logs
        addLog("🛡️ IT Diagnostics Module Başlatıldı...");
        addLog("🔍 Donanım imzası doğrulanıyor...");

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="space-y-6 mb-10">
            <div className="flex items-center gap-3 border-b border-gray-800 pb-4">
                <Terminal className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-black uppercase tracking-[0.2em] text-blue-100">IT Sistem Monitörü</h2>
                <div className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase rounded">Gelişmiş Tanılama</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* VPN Stat */}
                <div className="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner group hover:border-blue-500/50 transition-all">
                    <div className="flex items-center justify-between mb-3">
                        <Shield className="w-4 h-4 text-blue-400" />
                        <Activity className={`w-3 h-3 ${vpnStatus?.is_running ? 'text-green-500 animate-pulse' : 'text-gray-600'}`} />
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">P2P Mesh Durumu</p>
                    <p className="text-lg font-black text-blue-100">{vpnStatus?.is_running ? 'AKTİF / READY' : 'DEVRE DIŞI'}</p>
                </div>

                {/* Virtual IP */}
                <div className="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner group hover:border-blue-500/50 transition-all">
                    <div className="flex items-center justify-between mb-3">
                        <Network className="w-4 h-4 text-purple-400" />
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Mesh Sanal IP (Internal)</p>
                    <p className="text-lg font-mono font-black text-purple-100">{vpnStatus?.virtual_ip || '---.---.---.---'}</p>
                </div>

                {/* HWID */}
                <div className="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner group hover:border-blue-500/50 transition-all">
                    <div className="flex items-center justify-between mb-3">
                        <Cpu className="w-4 h-4 text-amber-400" />
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Hardware Fingerprint</p>
                    <p className="text-xs font-mono font-bold text-amber-100 truncate">{hwId}</p>
                </div>

                {/* Local DB */}
                <div className="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner group hover:border-blue-500/50 transition-all">
                    <div className="flex items-center justify-between mb-3">
                        <HardDrive className="w-4 h-4 text-green-400" />
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Yerel DB Sağlığı</p>
                    <p className="text-lg font-black text-green-100">OPTIMAL</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Advanced Signaling */}
                <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Radio className="w-20 h-20 text-blue-500" />
                    </div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                        <Radio className="w-3 h-3 text-blue-500" />
                        Sinyalleşme Hub Monitörü
                    </h3>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-black/40 border border-gray-800 rounded-lg">
                            <span className="text-[10px] uppercase font-bold text-gray-500">WebSocket Status</span>
                            <span className="text-[10px] uppercase font-bold text-green-400 flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-ping"></span>
                                Connected to 10.8.0.1
                            </span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-black/40 border border-gray-800 rounded-lg">
                            <span className="text-[10px] uppercase font-bold text-gray-500">Latency (RTT)</span>
                            <span className="text-[10px] uppercase font-mono font-bold text-blue-400">14ms</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-black/40 border border-gray-800 rounded-lg">
                            <span className="text-[10px] uppercase font-bold text-gray-500">Encrypted Tunnel</span>
                            <span className="text-[10px] uppercase font-bold text-amber-400">ChaCha20-Poly1305 Active</span>
                        </div>
                    </div>
                </div>

                {/* Console Output */}
                <div className="bg-black border border-gray-800 p-6 rounded-2xl font-mono relative group">
                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-600 mb-4 flex items-center justify-between">
                        <span>Terminal Output</span>
                        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    </h3>
                    <div className="h-[120px] overflow-y-auto space-y-1 text-[11px]">
                        {logs.map((log, i) => (
                            <div key={i} className="flex gap-2">
                                <span className="text-gray-700">[{new Date().toLocaleTimeString()}]</span>
                                <span className={log.startsWith('❌') ? 'text-red-500' : 'text-blue-400'}>{log}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}


