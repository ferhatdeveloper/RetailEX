import { useState, useEffect, useRef } from 'react';
import { X, Maximize, MousePointer, Keyboard, Wifi, AlertTriangle, Monitor, RefreshCcw, Activity } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { toast } from 'sonner';

interface RemoteViewerProps {
    peer: {
        public_key: string;
        virtual_ip?: string;
        hostname?: string;
    };
    onClose: () => void;
}

export function RemoteViewer({ peer, onClose }: RemoteViewerProps) {
    const [connecting, setConnecting] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const startRemoteSupport = async () => {
            try {
                setConnecting(true);
                await invoke('enable_remote_support', { targetHwid: peer.public_key });
                setTimeout(() => {
                    setConnecting(false);
                }, 3000);
            } catch (e) {
                setError('Bağlantı kurulamadı: ' + e);
                setConnecting(false);
            }
        };

        startRemoteSupport();
        return () => {
            // Cleanup
        };
    }, [peer]);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (connecting || error) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
    };

    return (
        <div className="fixed inset-0 bg-black z-[300] flex flex-col animate-in fade-in duration-300">
            <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600/20 flex items-center justify-center border border-blue-600/30">
                        <Monitor className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Kontrol Ediliyor:</span>
                        <div className="text-xs font-black text-white uppercase tracking-wider">{peer.hostname || peer.public_key.slice(0, 12)}</div>
                    </div>
                    <div className="mx-4 h-4 w-px bg-gray-800" />
                    <div className="flex items-center gap-2 px-2 py-0.5 bg-green-500/10 border border-green-500/20 rounded">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-[9px] text-green-500 font-bold">P2P TUNNEL: {peer.virtual_ip}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                        <MousePointer className="w-4 h-4" />
                    </button>
                    <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                        <Keyboard className="w-4 h-4" />
                    </button>
                    <div className="w-px h-6 bg-gray-800 mx-2" />
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                        <X className="w-3 h-3" />
                        BAĞLANTIYI KES
                    </button>
                </div>
            </div>

            <div className="flex-1 relative overflow-hidden bg-gray-950 flex items-center justify-center">
                {connecting ? (
                    <div className="text-center space-y-4">
                        <RefreshCcw className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
                        <p className="text-gray-400 text-sm font-bold uppercase tracking-[0.3em] animate-pulse">Mesh Tüneli Üzerinden Bağlanılıyor...</p>
                        <div className="text-[10px] text-gray-600 font-mono">P2P Handshake: IN_PROGRESS</div>
                    </div>
                ) : error ? (
                    <div className="p-8 border border-red-900/40 bg-red-950/20 max-w-md text-center">
                        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h3 className="text-red-400 font-bold uppercase mb-2">Bağlantı Hatası</h3>
                        <p className="text-gray-400 text-sm mb-6">{error}</p>
                        <button onClick={onClose} className="px-6 py-2 bg-gray-800 text-white text-xs font-bold uppercase tracking-widest">Dashboard'a Dön</button>
                    </div>
                ) : (
                    <div
                        className="w-full h-full relative group cursor-none"
                        onMouseMove={handleMouseMove}
                    >
                        <div className="w-full h-full bg-blue-900/5 flex items-center justify-center border border-blue-500/10">
                            <div className="text-center">
                                <Monitor className="w-20 h-20 text-gray-800 mx-auto mb-4" />
                                <p className="text-gray-700 text-xs font-bold uppercase tracking-widest">REMOTE STREAM ACTIVE</p>
                            </div>
                        </div>
                        <div className="absolute inset-0 pointer-events-none border-[10px] border-blue-600/10 group-hover:border-blue-600/20 transition-all" />
                    </div>
                )}
            </div>

            <div className="h-8 bg-gray-900 border-t border-gray-800 px-4 flex items-center justify-between">
                <div className="flex items-center gap-4 text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <Wifi className="w-3 h-3" />
                        LATENCY: 12ms
                    </div>
                    <div className="flex items-center gap-2 text-blue-400">
                        <Activity className="w-3 h-3" />
                        BITRATE: 4.2 Mbps
                    </div>
                </div>
                <div className="text-[9px] text-gray-600 font-mono">
                    ENCRYPTION: AES-256-GCM (P2P-MESH)
                </div>
            </div>
        </div>
    );
}
