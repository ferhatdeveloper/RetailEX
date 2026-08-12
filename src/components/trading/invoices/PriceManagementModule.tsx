import { FileText, Percent, Plus } from 'lucide-react';
import type { Product } from '../../../App';
import { useState, useEffect } from 'react';
import { useCampaignStore } from '../../../store';
import { useNavigate } from 'react-router-dom';

interface PriceManagementModuleProps {
  products: Product[];
}

export function PriceManagementModule({ products }: PriceManagementModuleProps) {
  const campaigns = useCampaignStore((state) => state.campaigns);
  const [activeCampaigns, setActiveCampaigns] = useState(campaigns.filter(c => c.active));

  useEffect(() => {
    setActiveCampaigns(campaigns.filter(c => c.active));
  }, [campaigns]);

  const handleNewCampaign = () => {
    // Kampanya yönetimi ekranına git
    window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: 'campaigns_mgmt' }));
  };

  const priceLists = [
    { id: '1', name: 'Perakende Fiyat Listesi', products: products.length, active: true, validFrom: '2025-01-01', validTo: '2025-12-31' },
    { id: '2', name: 'Toptan Fiyat Listesi', products: products.length, active: true, validFrom: '2025-01-01', validTo: '2025-12-31' },
    { id: '3', name: 'VIP Müşteri Fiyatları', products: 45, active: true, validFrom: '2025-01-01', validTo: '2025-06-30' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-6 py-6 border-b shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                <Percent className="w-6 h-6" />
              </div>
              <h2 className="text-3xl">Fiyat & Kampanya Yönetimi</h2>
            </div>
            <p className="text-amber-100 ml-13">RetailOS • Fiyat listeleri ve promosyonlar</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl">Fiyat Listeleri</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700">
              <Plus className="w-4 h-4" />
              Yeni Liste
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-lg border">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2">
                <tr>
                  <th className="px-4 py-3 text-left text-sm text-gray-700">LİSTE ADI</th>
                  <th className="px-4 py-3 text-center text-sm text-gray-700">ÜRÜN SAYISI</th>
                  <th className="px-4 py-3 text-left text-sm text-gray-700">GEÇERLİLİK</th>
                  <th className="px-4 py-3 text-center text-sm text-gray-700">DURUM</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {priceLists.map(list => (
                  <tr key={list.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        {list.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">{list.products}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(list.validFrom).toLocaleDateString('tr-TR')} - {new Date(list.validTo).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs ${list.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {list.active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl">Aktif Kampanyalar</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700" onClick={handleNewCampaign}>
              <Plus className="w-4 h-4" />
              Yeni Kampanya
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-lg border">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2">
                <tr>
                  <th className="px-4 py-3 text-left text-sm text-gray-700">KAMPANYA ADI</th>
                  <th className="px-4 py-3 text-center text-sm text-gray-700">İNDİRİM</th>
                  <th className="px-4 py-3 text-center text-sm text-gray-700">ÜRÜN SAYISI</th>
                  <th className="px-4 py-3 text-left text-sm text-gray-700">SÜRE</th>
                  <th className="px-4 py-3 text-center text-sm text-gray-700">DURUM</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeCampaigns.map(campaign => (
                  <tr key={campaign.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Percent className="w-4 h-4 text-orange-500" />
                        {campaign.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-lg text-orange-600">
                        {campaign.type === 'percentage' ? `%${campaign.discountValue}` : `${campaign.discountValue.toLocaleString('tr-TR')} IQD`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">{campaign.productIds?.length || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(campaign.startDate).toLocaleDateString('tr-TR')} - {new Date(campaign.endDate).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs">Aktif</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
