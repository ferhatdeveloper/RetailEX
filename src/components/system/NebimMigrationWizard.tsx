import React, { useState } from 'react';
import {
    Database, Zap, ArrowRight, CheckCircle2,
    AlertCircle, Loader2, ShieldCheck, Server
} from 'lucide-react';

type Step = 'connect' | 'analyze' | 'migrate' | 'finish';

export function NebimMigrationWizard() {
    const [currentStep, setCurrentStep] = useState<Step>('connect');
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);

    const startAnalysis = async () => {
        setLoading(true);
        setProgress(20);
        setTimeout(() => {
            setProgress(100);
            setLoading(false);
            setCurrentStep('analyze');
        }, 2000);
    };

    const handleMigration = async () => {
        setLoading(true);
        setCurrentStep('migrate');
        for (let i = 0; i <= 100; i += 10) {
            setProgress(i);
            await new Promise(r => setTimeout(r, 800));
        }
        setLoading(false);
        setCurrentStep('finish');
    };

    return (
        <div className="h-full bg-slate-950 flex items-center justify-center p-8 overflow-auto">
            <div className="max-w-4xl w-full bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[600px]">
                {/* Sidebar Status */}
                <div className="md:w-72 bg-slate-900 p-10 text-white flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-10">
                            <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/30">
                                <Zap className="w-6 h-6" />
                            </div>
                            <h2 className="font-black tracking-tighter text-xl">RetailEX Migration</h2>
                        </div>
                        <div className="space-y-8">
                            <StepItem label="Bağlantı" active={currentStep === 'connect'} completed={['analyze', 'migrate', 'finish'].includes(currentStep)} />
                            <StepItem label="Veri Analizi" active={currentStep === 'analyze'} completed={['migrate', 'finish'].includes(currentStep)} />
                            <StepItem label="Geçiş İşlemi" active={currentStep === 'migrate'} completed={currentStep === 'finish'} />
                            <StepItem label="Tamamlandı" active={currentStep === 'finish'} completed={false} />
                        </div>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Güvenlik Protokolü</p>
                        <p className="text-xs text-slate-300">Nebim MSSQL verileri AES-256 ile şifrelenerek yerel PostgreSQL'e aktarılır.</p>
                    </div>
                </div>

                {/* Dynamic Content */}
                <div className="flex-1 p-12 flex flex-col">
                    {currentStep === 'connect' && (
                        <div className="flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <h1 className="text-3xl font-black text-slate-900 leading-tight">Nebim V3 Sunucusuna Bağlanın</h1>
                            <p className="text-slate-500 mt-2 mb-10">RetailEX, Nebim veritabanındaki tüm yapıları otomatik olarak analiz eder ve şemayı hazırlar.</p>
                            <div className="space-y-6">
                                <Input label="MSSQL Sunucu (Host)" placeholder="örn: 192.168.1.50" icon={<Server className="w-4 h-4" />} />
                                <Input label="Veritabanı Adı" placeholder="örn: V3_DB_CUSTOMER" icon={<Database className="w-4 h-4" />} />
                                <div className="grid grid-cols-2 gap-4">
                                    <Input label="Kullanıcı Adı" placeholder="sa" />
                                    <Input label="Şifre" type="password" placeholder="••••••••" />
                                </div>
                            </div>
                            <div className="mt-12 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-indigo-600">
                                    <ShieldCheck className="w-5 h-5" />
                                    <span className="text-xs font-bold">SSL Güvenli Bağlantı</span>
                                </div>
                                <button
                                    onClick={startAnalysis}
                                    disabled={loading}
                                    className="bg-indigo-600 hover:bg-slate-900 text-white px-10 py-4 rounded-2xl font-black shadow-xl transition-all flex items-center gap-2 group"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sistemi Analiz Et'}
                                    {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                                </button>
                            </div>
                        </div>
                    )}

                    {currentStep === 'analyze' && (
                        <div className="flex-1 animate-in zoom-in-95 duration-500">
                            <h1 className="text-3xl font-black text-slate-900">Analiz Tamamlandı!</h1>
                            <p className="text-slate-500 mt-2 mb-10">Nebim veritabanında geçişe uygun aşağıdaki veriler tespit edildi.</p>
                            <div className="grid grid-cols-1 gap-4 mb-10">
                                <CountItem label="Ürün Kartları" count="12,450" />
                                <CountItem label="Cari Hesaplar" count="8,200" />
                                <CountItem label="Personel & Yetki Grupları" count="85" />
                                <CountItem label="Mağaza & Depolar" count="12" />
                                <CountItem label="Açılış Stok Bakiyeleri" count="45,000" />
                            </div>
                            <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100 flex gap-4 mb-10">
                                <AlertCircle className="w-6 h-6 text-orange-600 shrink-0" />
                                <p className="text-sm text-orange-900 leading-relaxed font-medium">
                                    <b>Geçiş Notu:</b> Sadece aktif kartlar ve güncel stok bakiyeleri aktarılacaktır. Hareket geçmişi aktarımı 1 saatlik süreyi uzatabilir.
                                </p>
                            </div>
                            <button
                                onClick={handleMigration}
                                className="w-full bg-slate-950 text-white py-5 rounded-3xl font-black text-lg hover:bg-indigo-600 shadow-2xl transition-all"
                            >
                                Hızlı Geçişi Başlat (Tahmini 15 Dakika)
                            </button>
                        </div>
                    )}

                    {currentStep === 'migrate' && (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <div className="relative w-48 h-48 mb-10">
                                <div className="absolute inset-0 border-[12px] border-slate-100 rounded-full" />
                                <div
                                    className="absolute inset-0 border-[12px] border-indigo-600 rounded-full transition-all duration-700"
                                    style={{ clipPath: `conic-gradient(transparent ${progress}%, #4f46e5 ${progress}%)`, transform: 'rotate(-90deg)' }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-4xl font-black text-slate-900">{progress}%</span>
                                </div>
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-2">Veriler RetailEX'e Aktarılıyor</h2>
                            <p className="text-slate-500 max-w-xs">{progress < 40 ? "Nebim şeması çözümleniyor..." : progress < 80 ? "Ürün ve Cari kartlar yazılıyor..." : "Stok bakiyeleri RetailEX'e uyarlanıyor..."}</p>
                        </div>
                    )}

                    {currentStep === 'finish' && (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <div className="bg-green-100 text-green-600 p-8 rounded-full mb-8">
                                <CheckCircle2 className="w-20 h-20" />
                            </div>
                            <h1 className="text-4xl font-black text-slate-900 mb-4">Hoş Geldiniz!</h1>
                            <p className="text-slate-500 text-lg mb-10">Nebim'den RetailEX'e geçiş başarıyla tamamlandı. Artık sisteminiz özgür ve akıllı.</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="bg-indigo-600 text-white px-12 py-5 rounded-3xl font-black text-lg shadow-2xl hover:bg-slate-900 transition-all"
                            >
                                RetailEX'i Kullanmaya Başla
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Input({ label, icon, ...props }: any) {
    return (
        <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{label}</label>
            <div className="relative">
                {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>}
                <input className={`w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all ${icon ? 'pl-11' : 'px-4'}`} {...props} />
            </div>
        </div>
    )
}

function StepItem({ label, active, completed }: any) {
    return (
        <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full transition-all duration-500 ${completed ? 'bg-indigo-500' : active ? 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'bg-slate-700'}`} />
            <span className={`text-xs font-bold transition-colors ${active ? 'text-white' : 'text-slate-500'}`}>{label}</span>
        </div>
    )
}

function CountItem({ label, count }: any) {
    return (
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex justify-between items-center">
            <span className="font-bold text-slate-700">{label}</span>
            <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg font-black text-xs">{count} Kayıt</span>
        </div>
    )
}


