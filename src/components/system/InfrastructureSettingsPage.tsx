import { useState, useEffect } from 'react';
import { ShieldCheck, Settings as Gear, ArrowLeft, X as CloseIcon, Monitor, Activity, Terminal as ConsoleIcon, Database } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DatabaseSettings } from './DatabaseSettings';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { SystemMonitoringModule } from './SystemMonitoringModule';
import { RemoteControlGrid } from './RemoteControlGrid';
import { RemoteViewer } from './RemoteViewer';

const INFRA_PASS = "10021993";
const IT_PASS = "30031993";

export function InfrastructureSettingsPage() {
    const [infraPassword, setInfraPassword] = useState('');
    const [infraAuthRole, setInfraAuthRole] = useState<'admin' | 'it' | null>(null);
    const [activeTab, setActiveTab] = useState<'diagnostics' | 'database' | 'remote'>('diagnostics');
    const [selectedPeer, setSelectedPeer] = useState<any>(null);
    const { darkMode } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();

    // Auto-authorize if role is passed via state from Login
    useEffect(() => {
        if (location.state && (location.state as any).role) {
            setInfraAuthRole((location.state as any).role);
        }
    }, [location.state]);

    // Force full-screen background like login
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, []);

    const handleVerify = () => {
        if (infraPassword === INFRA_PASS) {
            setInfraAuthRole('admin');
        } else if (infraPassword === IT_PASS) {
            setInfraAuthRole('it');
        } else {
            toast.error('Geçersiz şifre');
        }
    };

    return (
        <div className={`min-h-screen w-full flex flex-col ${darkMode ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
            {/* Flat Header */}
            <div className={`p-4 border-b flex items-center justify-between shadow-md relative z-10 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-blue-600 border-blue-700'}`}>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/login')}
                        className={`p-2 transition-colors ${darkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-blue-700 text-white'}`}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className={`text-sm font-black uppercase tracking-[0.3em] ${darkMode ? 'text-blue-400' : 'text-white'}`}>
                            Altyapı Güvenlik ve Ayarlar
                        </h1>
                        <p className={`text-[10px] font-bold uppercase tracking-widest opacity-70 ${darkMode ? 'text-gray-500' : 'text-blue-100'}`}>
                            Infrastructure & Security Console
                        </p>
                    </div>
                </div>

                {infraAuthRole && (
                    <div className={`px-4 py-1.5 text-[10px] font-black border uppercase tracking-[0.2em] hidden md:flex items-center gap-2 ${infraAuthRole === 'admin' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        }`}>
                        <ShieldCheck className="w-3 h-3" />
                        Erişim Yetkili: {infraAuthRole === 'admin' ? 'ADMINISTRATOR' : 'IT TECHNICAL ENGINEER'}
                    </div>
                )}
            </div>

            {infraAuthRole === 'it' && (
                <div className={`flex border-b sticky top-0 z-10 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200 shadow-sm'}`}>
                    <button
                        onClick={() => setActiveTab('diagnostics')}
                        className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 flex items-center gap-3 ${activeTab === 'diagnostics'
                            ? 'border-blue-500 text-blue-500 bg-blue-500/5'
                            : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        <Activity className="w-4 h-4" />
                        SİSTEM İZLEME / MONITORING
                    </button>
                    <button
                        onClick={() => setActiveTab('remote')}
                        className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 flex items-center gap-3 ${activeTab === 'remote'
                            ? 'border-blue-500 text-blue-500 bg-blue-500/5'
                            : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        <Monitor className="w-4 h-4" />
                        CİHAZ YÖNETİMİ / MANAGEMENT
                    </button>
                    <button
                        onClick={() => setActiveTab('database')}
                        className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 flex items-center gap-3 ${activeTab === 'database'
                            ? 'border-blue-500 text-blue-500 bg-blue-500/5'
                            : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        <Database className="w-4 h-4" />
                        VERİTABANI AYARLARI / DATABASE
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto bg-gray-950/20">
                {!infraAuthRole ? (
                    <div className="max-w-md mx-auto mt-20 p-8 border shadow-2xl relative overflow-hidden bg-gray-900 border-gray-800 animate-in zoom-in-95 duration-300">
                        {/* Auth Box remains same but optimized for direct login flow */}
                        <div className="text-center space-y-2 mb-8">
                            <div className="w-16 h-16 bg-blue-600/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <ShieldCheck className="w-8 h-8 text-blue-500" />
                            </div>
                            <h2 className="text-lg font-black uppercase tracking-[0.2em] text-white">GÜVENLİK DOĞRULAMASI</h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Hassas sistem ayarlarına erişmek için şifrenizi giriniz.</p>
                        </div>

                        <div className="space-y-4">
                            <input
                                type="password"
                                value={infraPassword}
                                onChange={(e) => setInfraPassword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                                className="w-full bg-gray-800 border-gray-700 text-white px-4 py-4 focus:outline-none focus:border-blue-600 font-mono text-center tracking-[0.3em]"
                                placeholder="••••••••"
                            />
                            <button
                                onClick={handleVerify}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 uppercase tracking-[0.3em] transition-all"
                            >
                                DOĞRULA VE İLERLE
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="max-w-7xl mx-auto p-6 animate-in fade-in duration-500">
                        {infraAuthRole === 'it' && activeTab === 'diagnostics' ? (
                            <SystemMonitoringModule />
                        ) : activeTab === 'remote' ? (
                            <RemoteControlGrid onConnect={(peer) => setSelectedPeer(peer)} />
                        ) : (
                            <>
                                <div className={`mb-6 p-4 border-l-4 border-blue-600 ${darkMode ? 'bg-gray-900 shadow-xl' : 'bg-white shadow-sm'}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Gear className="w-5 h-5 text-blue-500" />
                                            <div>
                                                <span className="text-xs font-black uppercase tracking-widest block">Sistem Konfigürasyonu</span>
                                                <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Zorunlu ayarlar ve veritabanı eşitleme</span>
                                            </div>
                                        </div>
                                        {infraAuthRole === 'it' && (
                                            <div className="text-[9px] font-mono text-gray-600 bg-black/20 px-2 py-1 border border-gray-800">
                                                RE-INFRA-NODE: {window.crypto.randomUUID().slice(0, 8).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <DatabaseSettings />
                            </>
                        )}
                    </div>
                )}
            </div>

            {selectedPeer && (
                <RemoteViewer
                    peer={selectedPeer}
                    onClose={() => setSelectedPeer(null)}
                />
            )}

            {/* Footer */}
            {!selectedPeer && (
                <div className={`p-3 border-t text-center ${darkMode ? 'bg-gray-950 border-gray-900' : 'bg-gray-100 border-gray-200'}`}>
                    <p className="text-[9px] text-gray-600 font-bold uppercase tracking-[0.2em]">
                        RetailEX Infrastructure Management System v0.1.9c - Restricted Access
                    </p>
                </div>
            )}
        </div>
    );
}



