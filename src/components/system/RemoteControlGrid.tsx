import { useState, useEffect } from 'react';
import { Monitor, RefreshCcw, Wifi, ExternalLink, Activity, Search } from 'lucide-react';
const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
import { toast } from 'sonner';

interface Peer {
    public_key: string;
    virtual_ip?: string;
    endpoint?: string;
    hostname?: string;
}

export function RemoteControlGrid({ onConnect }: { onConnect: (peer: Peer) => void }) {
    const [peers, setPeers] = useState<Peer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchPeers = async () => {
        try {
            setLoading(true);
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const list = await invoke<Peer[]>('get_mesh_peers');
                setPeers(list);
            } else {
                // Mock peers for web demo
                setPeers([
                    { public_key: 'peer-1-pk', virtual_ip: '10.8.0.2', hostname: 'Baghdad-Terminal-01' },
                    { public_key: 'peer-2-pk', virtual_ip: '10.8.0.5', hostname: 'Erbil-Manager-PC' }
                ]);
            }
        } catch (e) {
            console.error(e);
            toast.error('Cihaz listesi alınamadı');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPeers();
        const interval = setInterval(fetchPeers, 30000);
        return () => clearInterval(interval);
    }, []);

    const filteredPeers = peers.filter(p =>
        p.hostname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.virtual_ip?.includes(searchTerm)
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Cihaz Adı veya IP Ara..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    />
                </div>
                <button
                    onClick={fetchPeers}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                    <RefreshCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    YENİLE
                </button>
            </div>

            {filteredPeers.length === 0 ? (
                <div className="p-20 text-center border border-dashed border-gray-800 bg-gray-900/50">
                    <Wifi className="w-10 h-10 text-gray-700 mx-auto mb-4" />
                    <p className="text-gray-500 text-sm uppercase tracking-widest">Aktif terminal bulunamadı</p>
                    <p className="text-gray-600 text-[10px] mt-2 italic">Mesh ağı taranıyor...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredPeers.map((peer) => (
                        <div
                            key={peer.public_key}
                            className="p-4 border border-gray-800 bg-gray-900 hover:border-blue-500/50 transition-all group relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rotate-45 translate-x-12 -translate-y-12" />

                            <div className="flex items-start justify-between mb-4 relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                        <Monitor className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-200 uppercase tracking-tight">
                                            {peer.hostname || `TERMINAL-${peer.public_key.slice(0, 6)}`}
                                        </h4>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                            <span className="text-[10px] text-green-500 font-bold uppercase">Çevrimiçi</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 mb-6 relative z-10">
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-gray-500 uppercase font-bold">SANAL IP:</span>
                                    <span className="text-blue-400 font-mono font-bold">{peer.virtual_ip || 'N/A'}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-gray-500 uppercase font-bold">NODE ID:</span>
                                    <span className="text-gray-400 font-mono">{peer.public_key.slice(0, 12)}...</span>
                                </div>
                            </div>

                            <button
                                onClick={() => onConnect(peer)}
                                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                            >
                                <Activity className="w-3 h-3" />
                                DİREKT BAĞLAN / CONNECT
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}



