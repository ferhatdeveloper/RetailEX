import React from 'react';
import { Bike, Link2, ShieldAlert } from 'lucide-react';
import { FOOD_DELIVERY_CHANNELS } from '../../../config/foodDeliveryChannels';

/**
 * Bilgilendirme: platformların çoğu API erişimini iş ortağı veya aracı entegratör ile verir.
 * Otomatik sipariş aktarımı için pg_bridge üzerindeki webhook uç noktasını kullanın.
 */
export function RestaurantFoodDeliverySettings() {
    const pushUrl = 'http://localhost:3001/api/delivery_order/push';

    return (
        <div className="max-w-3xl space-y-8">
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                        <Bike className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Paket platformları</h3>
                        <p className="text-sm text-slate-500">
                            Yemeksepeti, Getir Yemek, Trendyol Yemek ve diğer kanallar için ortak sipariş modeli
                        </p>
                    </div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 flex gap-3 text-sm text-amber-950">
                    <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                    <p>
                        Bu platformların resmi API anahtarları genelde restoran sözleşmesi veya Posentegra gibi aracılar üzerinden verilir.
                        RetailEX tarafında kanal etiketi, harici sipariş numarası ve webhook ile sipariş oluşturma desteklenir; doğrudan YS/Getir sunucularına bağlanma bu ekrandan yapılmaz.
                    </p>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h4 className="text-sm font-bold text-slate-700 mb-3">Desteklenen kanallar (paket ekranında rozet)</h4>
                <ul className="grid sm:grid-cols-2 gap-2 text-sm">
                    {FOOD_DELIVERY_CHANNELS.filter((c) => c.id !== 'manual').map((c) => (
                        <li
                            key={c.id}
                            className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2"
                        >
                            <span className="font-semibold text-slate-800 shrink-0">{c.label}</span>
                            <span className="text-slate-500 text-xs leading-snug">{c.description}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold">
                    <Link2 className="w-4 h-4" />
                    Webhook (geliştirme köprüsü)
                </div>
                <p className="text-sm text-slate-600 mb-3">
                    Orta katman veya kendi scriptiniz, <code className="px-1.5 py-0.5 bg-white rounded border text-xs">npm run bridge</code> çalışırken aşağıdaki adrese
                    <code className="mx-1 px-1.5 py-0.5 bg-white rounded border text-xs">POST</code> atarak paket siparişi oluşturabilir.
                    Üretimde ortam değişkeni <code className="px-1.5 py-0.5 bg-white rounded border text-xs">DELIVERY_PUSH_TOKEN</code> tanımlıysa istekte aynı token gönderilmelidir.
                </p>
                <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded-xl overflow-x-auto font-mono">
                    {pushUrl}
                </pre>
                <p className="text-xs text-slate-500 mt-3">
                    Gövde örneği: connStr, firmNr, periodNr, channel, customerName, address, phone, isteğe bağlı externalOrderId, totalAmount, itemsSummary.
                </p>
            </div>
        </div>
    );
}
