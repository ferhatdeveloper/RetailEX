import { X, Tag, Trash2, Filter, Search } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { formatNumber } from '../../utils/formatNumber';
import type { Campaign } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';

interface POSCampaignModalProps {
  campaigns: Campaign[];
  selectedCampaign: Campaign | null;
  onSelect: (campaign: Campaign | null) => void;
  onClose: () => void;
}

export function POSCampaignModal({
  campaigns,
  selectedCampaign,
  onSelect,
  onClose
}: POSCampaignModalProps) {
  const { t } = useLanguage();

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Number key shortcuts
      const key = e.key;
      if (key >= '1' && key <= '9') {
        const index = parseInt(key);

        // 1 = Kampanya İptal
        if (index === 1 && selectedCampaign) {
          onSelect(null);
          onClose();
        }
        // 2+ = Kampanyalar (index - 2 çünkü 1 iptal için ayrıldı)
        else if (index >= 2) {
          const campaignIndex = index - 2;
          if (campaignIndex < campaigns.length) {
            onSelect(campaigns[campaignIndex]);
            onClose();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [campaigns, selectedCampaign, onSelect, onClose]);

  // Filter and search
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(campaign => {
      if (filter === 'active') {
        return campaign.isActive;
      }
      return true;
    }).filter(campaign => {
      return campaign.name.toLowerCase().includes(search.toLowerCase());
    });
  }, [campaigns, filter, search]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-orange-500 to-orange-600">
          <h3 className="text-base text-white flex items-center gap-2">
            <Tag className="w-5 h-5" />
            {t.selectCampaign}
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Campaigns Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-4">
            {/* Clear Campaign Button - Her zaman göster */}
            <button
              onClick={() => {
                if (selectedCampaign) {
                  onSelect(null);
                  onClose();
                }
              }}
              disabled={!selectedCampaign}
              className={`relative p-6 border transition-all ${selectedCampaign
                  ? 'border-gray-300 bg-white hover:bg-gray-50 cursor-pointer'
                  : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
                }`}
            >
              {/* Number Badge */}
              <div className={`absolute top-3 left-3 w-8 h-8 flex items-center justify-center text-sm ${selectedCampaign
                  ? 'bg-gray-600 text-white'
                  : 'bg-gray-300 text-gray-500'
                }`}>
                1
              </div>

              <div className="flex flex-col items-center gap-3 mt-4">
                {/* Icon */}
                <div className={`w-16 h-16 flex items-center justify-center ${selectedCampaign
                    ? 'bg-gradient-to-br from-gray-400 to-gray-500'
                    : 'bg-gradient-to-br from-gray-300 to-gray-400'
                  }`}>
                  <X className="w-8 h-8 text-white" />
                </div>

                {/* Text */}
                <div className="text-center">
                  <p className={`font-medium ${selectedCampaign ? 'text-gray-900' : 'text-gray-500'}`}>
                    Kampanya İptal
                  </p>
                  <p className={`text-sm mt-1 ${selectedCampaign ? 'text-gray-500' : 'text-gray-400'}`}>
                    {selectedCampaign ? 'Seçimi kaldır' : 'Seçili kampanya yok'}
                  </p>
                </div>
              </div>
            </button>

            {/* Campaign List */}
            {filteredCampaigns.map((campaign, index) => {
              const isSelected = selectedCampaign?.id === campaign.id;
              const displayNumber = index + 2; // İptal butonu her zaman 1, kampanyalar 2'den başlar

              return (
                <button
                  key={campaign.id}
                  onClick={() => {
                    onSelect(campaign);
                    onClose();
                  }}
                  className={`relative p-6 border transition-all text-left ${isSelected
                      ? 'border-orange-600 bg-orange-50 shadow-lg'
                      : 'border-gray-300 bg-white hover:border-orange-400 hover:bg-orange-50'
                    }`}
                >
                  {/* Number Badge */}
                  <div className={`absolute top-3 left-3 w-8 h-8 flex items-center justify-center text-sm ${isSelected
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                    }`}>
                    {displayNumber}
                  </div>

                  <div className="flex flex-col items-center gap-3 mt-4">
                    {/* Icon */}
                    <div className={`w-16 h-16 flex items-center justify-center transition-all ${isSelected
                        ? 'bg-gradient-to-br from-orange-600 to-orange-700'
                        : 'bg-gradient-to-br from-orange-500 to-orange-600'
                      }`}>
                      <Tag className="w-8 h-8 text-white" />
                    </div>

                    {/* Text */}
                    <div className="text-center">
                      <p className={`font-medium ${isSelected ? 'text-orange-900' : 'text-gray-900'}`}>
                        {campaign.name}
                        {campaign.autoApply && (
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">OTO</span>
                        )}
                      </p>
                      <p className={`text-sm mt-1 ${isSelected ? 'text-orange-700' : 'text-gray-500'}`}>
                        {campaign.description}
                      </p>
                      {/* Discount Badge */}
                      <div className={`mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium ${isSelected
                          ? 'bg-orange-200 text-orange-800'
                          : 'bg-gray-100 text-gray-700'
                        }`}>
                        {campaign.discountType === 'percentage' ? (
                          <span>%{campaign.discountValue}</span>
                        ) : (
                          <span>{formatNumber(campaign.discountValue)} IQD</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Selected Indicator */}
                  {isSelected && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-orange-700">
                      <div className="w-2 h-2 bg-orange-600 animate-pulse" />
                      <span className="text-xs font-medium">Seçili</span>
                    </div>
                  )}
                </button>
              );
            })}

            {filteredCampaigns.length === 0 && !selectedCampaign && (
              <div className="col-span-3 text-center py-12">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Tag className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500">Aktif kampanya bulunmuyor</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {t.totalCampaigns}: {campaigns.length}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors text-sm"
          >
            {t.closeEsc}
          </button>
        </div>
      </div>
    </div>
  );
}
