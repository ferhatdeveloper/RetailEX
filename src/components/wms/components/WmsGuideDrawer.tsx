import React from 'react';
import { X, BookOpen, PackagePlus, Users, Monitor, ShieldCheck, RotateCcw, Warehouse, Layers, Grid3x3, ChevronRight } from 'lucide-react';

interface WmsGuideDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    currentPage?: string;
}

export const WmsGuideDrawer: React.FC<WmsGuideDrawerProps> = ({ isOpen, onClose, currentPage }) => {
    const manuals: Record<string, { title: string; icon: any; steps: string[] }> = {
        'receiving': {
            title: 'Mal Kabul Yönetimi',
            icon: PackagePlus,
            steps: [
                '<b>Şartlı Mal Kabul:</b> Kabul sırasında hasarlı veya eksik ürünler için "Şartlı Kabul" sekmesini kullanın ve miktarı girin.',
                '<b>SKT Girişi:</b> Ürün bazında SKT sekmesine tıklayarak son kullanma tarihini girin. Sistem bu veriyi stok beslemede önceliklendirecektir.',
                '<b>Parti Numarası:</b> İzlenebilirlik için "Parti No" sekmesine üreticiden gelen parti bilgisini kaydedin.',
                '<b>Palet Seçimi:</b> İşlem sonunda palet sekmesinden uygun tipi seçin: <b>80x120</b> (Euro, Epal, Turpal, Chep, Plastik, Vasıfsız), <b>80x60</b> (Dusseldorf), <b>120x120</b> (Büyük Boy).'
            ]
        },
        'performance': {
            title: 'Performans Paneli',
            icon: Users,
            steps: [
                '<b>Tüm Kullanıcılar:</b> "Performans Değerlendirme" ekranı üzerinden her personelin doğruluk oranı ve hız puanını izleyin.',
                'Sistem, personelin toplama hatası yapma sıklığına göre kalite puanı (Quality Score) hesaplar.',
                'Tarih bazlı filtreleme ile dönemsel performans değişimlerini analiz edebilirsiniz.'
            ]
        },
        'live-performance-tv': {
            title: 'Anlık Performans TV',
            icon: Monitor,
            steps: [
                '<b>Anlık Performans Ekranı:</b> Toplayıcıların performansını artırmak için depo içine yerleştirilen TV ekranlarında anlık liderlik tablosunu açın.',
                'Toplanan ürün miktarı, hız ve doğruluk verileri saniyelik güncellenmektedir.',
                'En iyi performans gösteren 3 kişi ve trendleri (yukarı/aşağı) görsel olarak belirtilir.'
            ]
        },
        'logistic-check': {
            title: 'Lojistik & İrsaliye',
            icon: ShieldCheck,
            steps: [
                '<b>İrsaliye Engeli:</b> Lojistik modülünde araç doluluğu (hacim, ağırlık, palet) %100 veya hedeflenen orana ulaşmadan irsaliye kesilemez.',
                '<b>Personel Yönlendirme:</b> Sipariş miktarı ve mağaza lokasyonuna (rota sırası) göre sistem personeli hangi araca yükleme yapacağı konusunda yönlendirir.',
                'Araç kapasite grafikleri doluluk durumunu anlık gösterir.'
            ]
        },
        'returns': {
            title: 'İade & Geri Dönüşüm',
            icon: RotateCcw,
            steps: [
                '<b>Tam/Eksik İade:</b> İade kabulünde ürünün tam gelip gelmediğini veya eksik/hasarlı parça durumunu seçin.',
                '<b>Geri Dönüşüm Ürünleri:</b> Karton, naylon ve plastik materyaller "Geri Dönüşüm" başlığı altında seçilerek ilgili depoya yönlendirilir.',
                'Müşteri iadeleri sistem tarafından nedenine göre (Fire, Hasarlı vb.) kategorize edilir.'
            ]
        },
        'multi-warehouse': {
            title: 'Depo 1-2-3 Stok',
            icon: Warehouse,
            steps: [
                '<b>Depo 1 (Normal):</b> Satışa hazır, sağlam stokların tutulduğu ekrandır.',
                '<b>Depo 2 (İade/Fire):</b> Müşteriden dönen hasarlı veya son kullanım tarihi geçmiş ürünlerin ekranıdır.',
                '<b>Depo 3 (Hayali):</b> Planlanan stoklar veya sanal rezervasyonlar için kullanılan takip ekranıdır.'
            ]
        },
        'order-splitting': {
            title: 'Sipariş & Toplayıcı Bölme',
            icon: Layers,
            steps: [
                '<b>Birim Bazlı Bölme:</b> Siparişleri ürün türüne göre (Kuru, Değerli, Soğuk/Donuk) otomatik olarak farklı toplama listelerine ayırın.',
                '<b>Çoklu Toplayıcı:</b> Özellikle büyük "Açılış Mağazası" siparişlerini boyutuna göre birden fazla personele (toplayıcıya) aynı anda paylaştırın.',
                'Bu özellik toplama süresini %40\'a kadar hızlandırır.'
            ]
        },
        'shelf-strategy': {
            title: 'Yerleşim & Besleme',
            icon: Grid3x3,
            steps: [
                '<b>SKT Önceliği (FEFO):</b> Sistem, ürün yerleşimi ve stok besleme yaparken SKT\'si en yakın olanı en öne (Priority 1) yerleştirmenizi ister.',
                '<b>Stok Bütünlük Kontrolü:</b> Depoda stok olduğu halde toplanmayan veya toplanması unutulan bir ürün varsa, sistem siparişi kapatmanıza (Close Order) izin vermez.',
                'Tüm picking görevleri "Completed" olmadan sevkiyat onaylanamaz.'
            ]
        }
    };

    if (!isOpen) return null;

    const currentManual = manuals[currentPage || 'receiving'] || manuals['receiving'];

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[60] flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-300">
            <div className="p-4 bg-blue-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5" />
                    <h2 className="font-bold text-white">Kullanım Kılavuzu</h2>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-white/20 rounded transition-colors text-white">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-4 text-blue-600">
                        <currentManual.icon className="w-6 h-6" />
                        <h3 className="text-lg font-bold">{currentManual.title}</h3>
                    </div>

                    <ul className="space-y-4">
                        {currentManual.steps.map((step, index) => (
                            <li key={index} className="flex gap-3 text-sm leading-relaxed text-gray-700">
                                <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold">
                                    {index + 1}
                                </div>
                                <div dangerouslySetInnerHTML={{ __html: step }} />
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100">
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 px-1">Diğer Bölümler</h4>
                    <div className="space-y-1">
                        {Object.entries(manuals).map(([key, value]) => (
                            <div
                                key={key}
                                className={`flex items-center justify-between p-2 rounded-lg text-sm transition-all ${currentPage === key ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-600'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <value.icon className="w-4 h-4" />
                                    <span>{value.title}</span>
                                </div>
                                {currentPage === key && <ChevronRight className="w-4 h-4" />}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200">
                <p className="text-[10px] text-gray-400 text-center uppercase tracking-widest font-bold">
                    ExRetailOS • Akıllı Depo Yönetimi
                </p>
            </div>
        </div>
    );
};

