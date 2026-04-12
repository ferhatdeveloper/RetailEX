import { useState } from 'react';
import {
    BookOpen, PackagePlus, Monitor, ShieldCheck,
    RotateCcw, Grid3x3, ArrowLeft,
    CheckCircle2, Info, ExternalLink, Smartphone, Play,
    Truck, CheckSquare, Package, Warehouse, BarChart3,
    TrendingUp, RefreshCw, Banknote, Users, MapPin,
    AlertCircle, Factory, ThumbsUp, Activity
} from 'lucide-react';

interface WmsGuidePageProps {
    darkMode: boolean;
    onBack: () => void;
}

export function WmsGuidePage({ darkMode, onBack }: WmsGuidePageProps) {
    const [activeSection, setActiveSection] = useState('dashboard');
    const [showLive, setShowLive] = useState(false);

    const sections = [
        {
            id: 'dashboard',
            title: 'Genel Bakış & Analitik',
            icon: Monitor,
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
            description: 'Deponun nabzını tutan stratejik yönetim ekranı.',
            content: `
        <p>WMS Dashboard, yöneticilerin tüm operasyonu tek bir ekrandan izlemesini sağlar.</p>
        <h4>Kritik Metrikler:</h4>
        <ul>
            <li><b>Stok Analizi:</b> Toplam ürün adedi ve mali değerini anlık görün.</li>
            <li><b>Personel Verimliliği:</b> Toplama ve mal kabul hızları.</li>
            <li><b>Doluluk Oranı:</b> Rafların fiziksel doluluk yüzdesi.</li>
        </ul>
      `
        },
        {
            id: 'receiving',
            title: 'Mal Kabul (EX-ROSERP)',
            icon: PackagePlus,
            color: 'text-green-500',
            bgColor: 'bg-green-500/10',
            description: 'Gelişmiş SKT ve Lot takibi ile hatasız kabul süreci.',
            content: `
        <p>EX-ROSERP standartlarına göre mal kabul operasyonu:</p>
        <ul>
            <li><b>Detay Girişi:</b> Ürün bazında SKT, Lot ve miktar bilgileri.</li>
            <li><b>Şartlı Kabul:</b> Hasarlı/eksik ürünler için özel onay mekanizması.</li>
            <li><b>Paletleme:</b> Ürünlerin Euro, Turpal veya Chep paletlere atanması.</li>
        </ul>
      `
        },
        {
            id: 'issue',
            title: 'Sevkiyat & Mal Çıkış',
            icon: TrendingUp,
            color: 'text-purple-500',
            bgColor: 'bg-purple-500/10',
            description: 'Sıfır hata ile toplama ve sevkiyat operasyonu.',
            content: `
        <p>Mal çıkış süreci, siparişlerin en hızlı rotayla toplanmasını ve araçlara doğru şekilde yüklenmesini sağlar.</p>
        <ul>
            <li><b>Toplama Listeleri:</b> Personel terminaline düşen dinamik rotalar.</li>
            <li><b>İkili Kontrol:</b> Hatalı sevkiyatı önleyen doğrulama sistemi.</li>
        </ul>
      `
        },
        {
            id: 'stock-query',
            title: 'Stok Sorgulama & Raf',
            icon: Package,
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
            description: 'Lokasyon bazlı anlık envanter takibi.',
            content: `
        <p>Ürünün nerede olduğunu anında bulun. Raf adresi, lot detayları ve rezerve stok miktarlarını görebilirsiniz.</p>
      `
        },
        {
            id: 'transfer',
            title: 'Transfer İşlemleri',
            icon: Truck,
            color: 'text-indigo-500',
            bgColor: 'bg-indigo-500/10',
            description: 'Depolar arası ve depo içi stok hareketleri.',
            content: `
        <p>Mağazalar arası sevkiyat ve depo içi raf transferlerini yönetin.</p>
      `
        },
        {
            id: 'counting',
            title: 'Sayım Yönetimi',
            icon: CheckSquare,
            color: 'text-yellow-500',
            bgColor: 'bg-yellow-500/10',
            description: 'Envanter sayımı ve varyans analizi.',
            content: `
        <p>Kör sayım veya tam sayım yaparak sistem ile fiziksel stok arasındaki farkları raporlayın.</p>
      `
        },
        {
            id: 'returns',
            title: 'İade/Geri Dönüşüm',
            icon: RotateCcw,
            color: 'text-orange-500',
            bgColor: 'bg-orange-500/10',
            description: 'Müşteri iadeleri ve atık yönetimi.',
            content: `
        <p>Mağazalardan dönen ürünlerin durumuna göre ayrıştırılması ve geri dönüşüm (karton, plastik vb.) yönetimi.</p>
      `
        },
        {
            id: 'multi-warehouse',
            title: 'Çoklu Depo Yönetimi',
            icon: Warehouse,
            color: 'text-violet-500',
            bgColor: 'bg-violet-500/10',
            description: 'Birden fazla fiziksel deponun tek elden yönetimi.',
            content: `<p>Global stok görünümü ve depo bazlı kapasite yönetimi.</p>`
        },
        {
            id: 'shelf-space',
            title: 'Raf Alanı Yönetimi',
            icon: Grid3x3,
            color: 'text-blue-400',
            bgColor: 'bg-blue-400/10',
            description: 'Raf bazlı doluluk ve optimizasyon.',
            content: `<p>M2 ve hacim bazlı raf alanı kullanımı analizi.</p>`
        },
        {
            id: 'quality',
            title: 'Kalite Kontrol',
            icon: ShieldCheck,
            color: 'text-teal-500',
            bgColor: 'bg-teal-500/10',
            description: 'Ürün kabul ve çıkış kalite denetimleri.',
            content: `<p>Örneklem bazlı veya %100 kontrol mekanizmaları.</p>`
        },
        {
            id: 'vehicle-loading',
            title: 'Araç Yükleme',
            icon: Truck,
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
            description: 'Sevkiyat araçlarının optimizasyonu.',
            content: `<p>Hacim ve ağırlık limitlerine göre araç yükleme planlaması.</p>`
        },
        {
            id: 'order-splitting',
            title: 'Sipariş Bölme',
            icon: Package,
            color: 'text-green-500',
            bgColor: 'bg-green-500/10',
            description: 'Büyük siparişlerin parçalara ayrılması.',
            content: `<p>Ürün grubuna veya toplayıcı sayısına göre sipariş segmentasyonu.</p>`
        },
        {
            id: 'sales-velocity',
            title: 'Satış Hızı Analizi',
            icon: BarChart3,
            color: 'text-orange-500',
            bgColor: 'bg-orange-500/10',
            description: 'Ürün bazlı sirkülasyon takibi.',
            content: `<p>Popüler ürünlerin daha erişilebilir raflara taşınması için veri sağlar.</p>`
        },
        {
            id: 'profit-loss',
            title: 'Kar-Zarar Raporu',
            icon: TrendingUp,
            color: 'text-green-600',
            bgColor: 'bg-green-600/10',
            description: 'Finansal performans metrikleri.',
            content: `<p>Depo operasyon maliyetleri ve envanter değeri analizi.</p>`
        },
        {
            id: 'reports',
            title: 'Gelişmiş Raporlama',
            icon: BarChart3,
            color: 'text-pink-500',
            bgColor: 'bg-pink-500/10',
            description: 'Özel rapor oluşturucu ve analizler.',
            content: `<p>Periyodik veya anlık operasyonel raporlar.</p>`
        },
        {
            id: 'performance',
            title: 'Personel Performansı',
            icon: Users,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10',
            description: 'Ekip verimliliği ve KPI takibi.',
            content: `<p>Hatalı toplama oranı ve işlem hızı bazlı değerlendirme.</p>`
        },
        {
            id: 'live-performance-tv',
            icon: Activity,
            title: 'Live TV Ekranı',
            color: 'text-red-500',
            bgColor: 'bg-red-500/10',
            description: 'Görselleştirilmiş canlı veri akışı.',
            content: `<p>Depo içi ekranlarda liderlik tablosu ve anlık hedefler.</p>`
        },
        {
            id: 'auto-reorder',
            title: 'Otomatik Sipariş',
            icon: RefreshCw,
            color: 'text-cyan-500',
            bgColor: 'bg-cyan-500/10',
            description: 'Stok bazlı satın alma önerileri.',
            content: `<p>Kritik seviyeye düşen ürünlerin otomatik talebi.</p>`
        },
        {
            id: 'pricing-cost',
            title: 'Fiyatlandırma & Maliyet',
            icon: Banknote,
            color: 'text-green-500',
            bgColor: 'bg-green-500/10',
            description: 'Maliyet yönetimi ve fiyatlandırma desteği.',
            content: `<p>Ürün bazlı maliyet takibi ve fiyat güncelleme.</p>`
        },
        {
            id: 'cashier-management',
            title: 'Personel Yönetimi',
            icon: Users,
            color: 'text-purple-500',
            bgColor: 'bg-purple-500/10',
            description: 'Rol ve yetki bazlı yönetim.',
            content: `<p>Personel atamaları ve çalışma saatleri yönetimi.</p>`
        },
        {
            id: 'live-gps-tracking-enhanced',
            title: 'Canlı Konum Takibi',
            icon: MapPin,
            color: 'text-red-500',
            bgColor: 'bg-red-500/10',
            description: 'Araç ve sevkiyatların GPS üzerinden izlenmesi.',
            content: `<p>Dağıtım araçlarının harita üzerinde anlık konum bilgisi.</p>`
        },
        {
            id: 'alerts',
            title: 'Uyarı Merkezi',
            icon: AlertCircle,
            color: 'text-red-600',
            bgColor: 'bg-red-600/10',
            description: 'Kritik sistem bildirimleri.',
            content: `<p>Sistem genelindeki hatalar ve anlık müdahale gerektiren durumlar.</p>`
        },
        {
            id: 'tasks',
            title: 'Görev Yönetimi',
            icon: CheckSquare,
            color: 'text-cyan-600',
            bgColor: 'bg-cyan-600/10',
            description: 'Operasyonel görev dağılımı.',
            content: `<p>Toplama, yerleştirme ve sayım görevlerinin personele atanması.</p>`
        }
    ];

    const currentSection = sections.find(s => s.id === activeSection) || sections[0];

    const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
    const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const sidebarClass = darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-slate-200';

    return (
        <div className={`h-screen flex flex-col ${darkMode ? 'bg-gray-950' : 'bg-slate-50'}`}>
            <header className={`h-16 flex items-center justify-between px-6 border-b ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-slate-200'} z-20`}>
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className={`p-2 rounded-xl hover:bg-black/5 transition-all active:scale-90 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">W</div>
                        <div>
                            <h1 className={`font-bold text-base leading-tight ${textClass}`}>WMS Sistem Rehberi</h1>
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>Tüm Modüller & Operasyonel Bilgiler</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowLive(!showLive)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-all ${showLive
                            ? 'bg-orange-600 border-orange-500 text-white shadow-lg'
                            : (darkMode ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50')
                            }`}
                    >
                        <Play className={`w-4 h-4 ${showLive ? 'fill-white' : ''}`} />
                        {showLive ? 'Rehberi Göster' : 'Canlı Deneyimi Başlat'}
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                <aside className={`w-72 border-r flex flex-col ${sidebarClass} relative z-10`}>
                    <div className="p-4 space-y-1 overflow-y-auto flex-1 custom-scroll">
                        <p className={`text-[10px] font-black uppercase tracking-widest px-3 mb-4 ${darkMode ? 'text-gray-600' : 'text-slate-300'}`}>Modüller</p>
                        {sections.map(section => (
                            <button
                                key={section.id}
                                onClick={() => { setActiveSection(section.id); setShowLive(false); }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mb-0.5 ${activeSection === section.id
                                    ? (darkMode ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-100')
                                    : (darkMode ? 'text-gray-400 hover:bg-gray-800 border border-transparent' : 'text-slate-500 hover:bg-slate-50 border border-transparent')
                                    }`}
                            >
                                <section.icon className={`w-4.5 h-4.5 ${activeSection === section.id ? (darkMode ? 'text-blue-400' : 'text-blue-600') : (darkMode ? 'text-gray-500' : 'text-slate-400')}`} />
                                <span className={`text-xs font-bold truncate ${activeSection === section.id ? '' : 'font-medium'}`}>{section.title}</span>
                            </button>
                        ))}
                    </div>
                </aside>

                <main className="flex-1 overflow-hidden relative bg-white dark:bg-gray-900">
                    {showLive ? (
                        <div className="w-full h-full p-4 flex flex-col">
                            <div className="flex items-center gap-4 mb-3 px-2 text-blue-500">
                                <Activity className="w-4 h-4 animate-pulse" />
                                <h4 className={`text-[10px] font-black uppercase tracking-tighter`}>
                                    CANLI SİSTEM: {currentSection.title}
                                </h4>
                            </div>
                            <div className={`flex-1 rounded-2xl overflow-hidden border ${darkMode ? 'border-gray-800' : 'border-slate-200'} shadow-2xl`}>
                                <iframe
                                    className="w-full h-full border-none"
                                    src={`${window.location.origin}/?wms_page=${activeSection}`}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-full overflow-y-auto p-12 max-w-4xl mx-auto custom-scroll">
                            <div className="flex items-center gap-5 mb-10">
                                <div className={`w-20 h-20 ${currentSection.bgColor} rounded-3xl flex items-center justify-center shadow-inner`}>
                                    <currentSection.icon className={`w-10 h-10 ${currentSection.color}`} />
                                </div>
                                <div>
                                    <h2 className={`text-4xl font-black ${textClass}`}>{currentSection.title}</h2>
                                    <p className={`text-xl italic mt-1 font-medium opacity-60 ${textClass}`}>{currentSection.description}</p>
                                </div>
                            </div>

                            <div className={`prose prose-slate ${darkMode ? 'prose-invert' : ''} max-w-none`}>
                                <div
                                    className={`text-lg leading-relaxed space-y-6 ${darkMode ? 'text-gray-300' : 'text-slate-600'}`}
                                    dangerouslySetInnerHTML={{ __html: currentSection.content }}
                                />

                                <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className={`p-8 rounded-3xl border ${darkMode ? 'bg-gray-800/20 border-gray-700' : 'bg-slate-50 border-slate-100'} transition-transform hover:scale-[1.02]`}>
                                        <h4 className="font-bold text-blue-500 mb-3 flex items-center gap-2 text-lg">
                                            <TrendingUp className="w-6 h-6" />
                                            Operasyonel Fayda
                                        </h4>
                                        <p className="text-sm leading-relaxed opacity-80">Bu modül, zaman kaybını minimize etmek ve operasyonel verimliliği maksimize etmek için özel olarak tasarlanmıştır.</p>
                                    </div>
                                    <div className={`p-8 rounded-3xl border ${darkMode ? 'bg-gray-800/20 border-gray-700' : 'bg-slate-50 border-slate-100'} transition-transform hover:scale-[1.02]`}>
                                        <h4 className="font-bold text-orange-500 mb-3 flex items-center gap-2 text-lg">
                                            <Info className="w-6 h-6" />
                                            Uzman Notu
                                        </h4>
                                        <p className="text-sm leading-relaxed opacity-80">Veri bütünlüğü için işlemler sırasında mutlaka optik okuyucularınızı (barkod/RFID) aktif kullanın.</p>
                                    </div>
                                </div>

                                <div className="mt-16 pt-10 border-t border-gray-800/10 dark:border-white/5">
                                    <button
                                        onClick={() => setShowLive(true)}
                                        className="w-full md:w-auto px-12 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-3xl font-black text-lg shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/50 transition-all active:scale-95 flex items-center justify-center gap-4 group"
                                    >
                                        <Play className="w-6 h-6 fill-white group-hover:scale-125 transition-transform" />
                                        MODÜLÜ CANLI DENEYİMLE
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            <style>{`
        .custom-scroll::-webkit-scrollbar { width: 5px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .dark .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
        .custom-scroll:hover::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); }
        .dark .custom-scroll:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
      `}</style>
        </div>
    );
}

