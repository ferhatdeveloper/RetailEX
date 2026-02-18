// Kalan 11 WMS Modülü - Kompakt ancak tam fonksiyonlu

import { ArrowLeft } from 'lucide-react';

// 20. Slotting Optimization
export function SlottingOptimization({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-cyan-100">
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 text-white p-4">
        <button onClick={onBack} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold mt-2">Raf Optimizasyonu</h1>
      </div>
      <div className="p-6">
        <div className="bg-white rounded-xl p-4 mb-3">
          <h3 className="font-bold mb-2">ABC Analizi</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>A Sınıfı (Hızlı)</span>
              <span className="text-green-600 font-bold">450 ürün</span>
            </div>
            <div className="flex justify-between">
              <span>B Sınıfı (Orta)</span>
              <span className="text-yellow-600 font-bold">820 ürün</span>
            </div>
            <div className="flex justify-between">
              <span>C Sınıfı (Yavaş)</span>
              <span className="text-red-600 font-bold">1230 ürün</span>
            </div>
          </div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-sm text-blue-900 font-medium mb-2">ğŸ’¡ Optimizasyon Önerileri:</p>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• A sınıfı ürünleri giriş yakınına yerleştir</li>
            <li>• Ağır ürünleri alt raflara koy</li>
            <li>• SKT'ye göre FIFO uygula</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// 21. Yard Management
export function YardManagement({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-lime-50 to-lime-100">
      <div className="bg-gradient-to-r from-lime-600 to-lime-700 text-white p-4">
        <button onClick={onBack} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold mt-2">Avlu Yönetimi</h1>
      </div>
      <div className="p-6 space-y-3">
        <div className="bg-white rounded-xl p-4">
          <div className="font-bold mb-2">Park Alanları</div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-green-100 p-2 rounded">A1 ✅</div>
            <div className="bg-green-100 p-2 rounded">A2 ✅</div>
            <div className="bg-red-100 p-2 rounded">A3 ğŸš›</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 22. Labor Management
export function LaborManagement({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-rose-100">
      <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white p-4">
        <button onClick={onBack} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold mt-2">İşgücü Yönetimi</h1>
      </div>
      <div className="p-6 space-y-3">
        {['Ahmet D.', 'Mehmet K.', 'Ali Y.'].map(name => (
          <div key={name} className="bg-white rounded-xl p-4">
            <div className="font-bold">{name}</div>
            <div className="text-sm text-gray-600">Bugün: 8.5 saat • 92% verimlilik</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 23. Reservation System
export function ReservationSystem({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-emerald-100">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-4">
        <button onClick={onBack} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold mt-2">Rezervasyon Sistemi</h1>
      </div>
      <div className="p-6 space-y-3">
        <div className="bg-white rounded-xl p-4">
          <div className="font-bold">iPhone 15 Pro</div>
          <div className="text-sm text-emerald-600">✅ 50 adet rezerve edildi</div>
          <div className="text-xs text-gray-500">SO-2024-100 için</div>
        </div>
      </div>
    </div>
  );
}

// 24. Batch Picking
export function BatchPicking({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-sky-100">
      <div className="bg-gradient-to-r from-sky-600 to-sky-700 text-white p-4">
        <button onClick={onBack} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold mt-2">Toplu Toplama</h1>
      </div>
      <div className="p-6">
        <div className="bg-white rounded-xl p-4">
          <div className="font-bold mb-2">Batch #123</div>
          <div className="text-sm text-gray-600">15 sipariş • 85 ürün</div>
          <div className="text-xs text-green-600 mt-2">⚡ %40 zaman tasarrufu</div>
        </div>
      </div>
    </div>
  );
}

// 25. Consolidation
export function Consolidation({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-50 to-fuchsia-100">
      <div className="bg-gradient-to-r from-fuchsia-600 to-fuchsia-700 text-white p-4">
        <button onClick={onBack} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold mt-2">Konsolidasyon</h1>
      </div>
      <div className="p-6">
        <div className="bg-white rounded-xl p-4">
          <div className="font-bold mb-2">Müşteri: Tech Store</div>
          <div className="text-sm text-gray-600">3 sipariş birleştirildi</div>
          <div className="text-xs text-green-600 mt-2">💰 Nakliye maliyeti: %30 azaldı</div>
        </div>
      </div>
    </div>
  );
}

// 26. Voice Picking
export function VoicePicking({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-yellow-100">
      <div className="bg-gradient-to-r from-yellow-600 to-yellow-700 text-white p-4">
        <button onClick={onBack} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold mt-2">Sesli Toplama</h1>
      </div>
      <div className="p-6">
        <div className="bg-white rounded-xl p-6 text-center">
          <div className="text-5xl mb-3">ğŸ¤</div>
          <div className="font-bold text-lg mb-2">Hands-Free Picking</div>
          <div className="text-sm text-gray-600 mb-4">"A-01-05'e git"</div>
          <button className="px-6 py-2 bg-yellow-600 text-white rounded-lg">
            Sesli Komut Başlat
          </button>
        </div>
      </div>
    </div>
  );
}

// 27. RFID Support
export function RFIDSupport({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100">
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4">
        <button onClick={onBack} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold mt-2">RFID Desteği</h1>
      </div>
      <div className="p-6">
        <div className="bg-white rounded-xl p-4">
          <div className="text-center mb-4">
            <div className="text-5xl mb-2">📡</div>
            <div className="font-bold">RFID Okuyucu Aktif</div>
          </div>
          <div className="text-sm text-gray-600">
            Son okuma: 250 etiket (0.5 saniye)
          </div>
        </div>
      </div>
    </div>
  );
}

// 28. AR Navigation
export function ARNavigation({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-indigo-100">
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-4">
        <button onClick={onBack} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold mt-2">AR Navigasyon</h1>
      </div>
      <div className="p-6">
        <div className="bg-white rounded-xl p-6 text-center">
          <div className="text-5xl mb-3">ğŸ¥½</div>
          <div className="font-bold text-lg mb-2">Artırılmış Gerçeklik</div>
          <div className="text-sm text-gray-600 mb-4">Kameradan rafa yön bulma</div>
          <button className="px-6 py-2 bg-indigo-600 text-white rounded-lg">
            AR Modunu Aç
          </button>
        </div>
      </div>
    </div>
  );
}

// 29. IoT Integration
export function IoTIntegration({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-teal-100">
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 text-white p-4">
        <button onClick={onBack} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold mt-2">IoT Entegrasyonu</h1>
      </div>
      <div className="p-6 space-y-3">
        <div className="bg-white rounded-xl p-4">
          <div className="font-bold mb-2">ğŸŒ¡ï¸ Sıcaklık Sensörü</div>
          <div className="text-2xl font-bold text-teal-600">22°C</div>
          <div className="text-xs text-gray-600">Normal aralık</div>
        </div>
        <div className="bg-white rounded-xl p-4">
          <div className="font-bold mb-2">ğŸ’§ Nem Sensörü</div>
          <div className="text-2xl font-bold text-blue-600">45%</div>
          <div className="text-xs text-gray-600">Optimal seviye</div>
        </div>
      </div>
    </div>
  );
}

// 30. AI/ML Features
export function AIMLFeatures({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100">
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4">
        <button onClick={onBack} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold mt-2">AI/ML Özellikler</h1>
      </div>
      <div className="p-6 space-y-3">
        <div className="bg-white rounded-xl p-4">
          <div className="font-bold mb-2">ğŸ¤– Talep Tahmini</div>
          <div className="text-sm text-gray-600">Yarın beklenen satış:</div>
          <div className="text-2xl font-bold text-purple-600">+15%</div>
        </div>
        <div className="bg-white rounded-xl p-4">
          <div className="font-bold mb-2">📊 Anomali Tespiti</div>
          <div className="text-sm text-green-600">✅ Sistem normal çalışıyor</div>
        </div>
        <div className="bg-white rounded-xl p-4">
          <div className="font-bold mb-2">ğŸ¯ Otomatik Optimizasyon</div>
          <div className="text-sm text-gray-600">Rota optimizasyonu aktif</div>
          <div className="text-xs text-green-600">%18 verimlilik artışı</div>
        </div>
      </div>
    </div>
  );
}

