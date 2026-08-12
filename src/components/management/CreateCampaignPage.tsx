// Create Campaign Page - Comprehensive Campaign Creation Interface

import { useState, useEffect } from 'react';
import { ArrowLeft, Save, X, Plus, Trash2, Calendar, Percent, Tag, Users, Package, Image as ImageIcon, Globe, Banknote, Clock, Info } from 'lucide-react';
import type { Campaign, Product } from '../../App';
import { campaignsAPI } from '../../services/api/campaigns';

interface CreateCampaignPageProps {
  onBack: () => void;
  onSave: (campaign: Campaign) => void;
  editingCampaign?: Campaign | null;
  products: Product[];
}

type CampaignType = 'product' | 'category' | 'cart' | 'customer';
type DiscountType = 'percentage' | 'fixed' | 'buyXgetY' | 'priceOverride';

export function CreateCampaignPage({ onBack, onSave, editingCampaign, products }: CreateCampaignPageProps) {
  const [loading, setLoading] = useState(false);

  // Basic Info
  const [name, setName] = useState(editingCampaign?.name || '');
  const [description, setDescription] = useState(editingCampaign?.description || '');
  const [campaignType, setCampaignType] = useState<CampaignType>('product');

  // Discount Settings
  const [discountType, setDiscountType] = useState<DiscountType>(editingCampaign?.discountType || 'percentage');
  const [discountValue, setDiscountValue] = useState(editingCampaign?.discountValue || 0);
  const [maxDiscountAmount, setMaxDiscountAmount] = useState(0);
  const [minPurchaseAmount, setMinPurchaseAmount] = useState(0);

  // Price Override Settings (Fiyat bazlı indirim)
  const [priceOverrides, setPriceOverrides] = useState<{ [productId: string]: { originalPrice: number, campaignPrice: number } }>({});

  // Date & Time
  const [startDate, setStartDate] = useState(editingCampaign?.startDate || '');
  const [endDate, setEndDate] = useState(editingCampaign?.endDate || '');
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');

  // Products & Categories
  const [selectedProducts, setSelectedProducts] = useState<string[]>(editingCampaign?.productIds || []);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // Customer Segments
  const [customerSegments, setCustomerSegments] = useState<string[]>([]);
  const [applyToAllCustomers, setApplyToAllCustomers] = useState(true);

  // Advanced Settings
  const [usageLimit, setUsageLimit] = useState(0);
  const [usageLimitPerCustomer, setUsageLimitPerCustomer] = useState(0);
  const [stackable, setStackable] = useState(false);
  const [active, setActive] = useState(editingCampaign?.active ?? true);

  // Multi-language
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [campaignUnit, setCampaignUnit] = useState<string>(editingCampaign?.campaignUnit || 'NONE');

  // Buy X Get Y Settings
  const [buyQuantity, setBuyQuantity] = useState(2);
  const [getQuantity, setGetQuantity] = useState(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !startDate || !endDate) {
      alert('Lütfen zorunlu alanları doldurun!');
      return;
    }

    setLoading(true);

    const campaign: Campaign = {
      id: editingCampaign?.id || `CMP${Date.now()}`,
      name,
      description,
      type: discountType === 'percentage' ? 'percentage' : 'fixed',
      discountType,
      discountValue,
      startDate,
      endDate,
      campaignUnit,
      productIds: selectedProducts,
      active,
      // Extended fields
      campaignType,
      maxDiscountAmount,
      minPurchaseAmount,
      startTime,
      endTime,
      selectedCategories,
      customerSegments,
      applyToAllCustomers,
      usageLimit,
      usageLimitPerCustomer,
      stackable,
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      buyQuantity,
      getQuantity,
      createdAt: editingCampaign?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      let result;
      if (editingCampaign) {
        result = await campaignsAPI.update(editingCampaign.id, campaign);
      } else {
        result = await campaignsAPI.create(campaign);
      }

      if (result) {
        onSave(result);
        alert(editingCampaign ? 'Kampanya güncellendi!' : 'Kampanya oluşturuldu!');
        onBack();
      } else {
        alert('Kampanya kaydedilemedi!');
      }
    } catch (error) {
      console.error('Kampanya kaydetme hatası:', error);
      alert('Bağlantı hatası!');
    } finally {
      setLoading(false);
    }
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.code?.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const categories = ['Elektronik', 'Giyim', 'Gıda', 'Ev & Yaşam', 'Kozmetik', 'Kitap & Kırtasiye'];
  const segments = ['VIP Müşteriler', 'Yeni Müşteriler', 'Sadık Müşteriler', 'Toptan Alıcılar'];

  return (
    <div className="h-full bg-gray-50 overflow-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl text-gray-900">
                  {editingCampaign ? 'Kampanyayı Düzenle' : 'Yeni Kampanya Oluştur'}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Kampanya detaylarını girin ve kaydedin
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onBack}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                İptal
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* Left Column - Main Info */}
          <div className="col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg text-gray-900">Temel Bilgiler</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Kampanya Adı <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Örn: Yaz İndirimi 2025"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Açıklama
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Kampanya hakkında detaylı açıklama..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      Kampanya Türü
                    </label>
                    <select
                      value={campaignType}
                      onChange={(e) => setCampaignType(e.target.value as CampaignType)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="product">Ürün Bazlı</option>
                      <option value="category">Kategori Bazlı</option>
                      <option value="cart">Sepet Bazlı</option>
                      <option value="customer">Müşteri Segmenti Bazlı</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      İndirim Tipi
                    </label>
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="percentage">Yüzde İndirim (%)</option>
                      <option value="fixed">Sabit Tutar (IQD)</option>
                      <option value="buyXgetY">X Al Y Öde</option>
                      <option value="priceOverride">Fiyat Bazlı İndirim</option>
                    </select>
                  </div>
                </div>

                {discountType === 'buyXgetY' ? (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Alım Miktarı (X)
                      </label>
                      <input
                        type="number"
                        value={buyQuantity}
                        onChange={(e) => setBuyQuantity(Number(e.target.value))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Ödeme Miktarı (Y)
                      </label>
                      <input
                        type="number"
                        value={getQuantity}
                        onChange={(e) => setGetQuantity(Number(e.target.value))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        min="0"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        İndirim Değeri {discountType === 'percentage' ? '(%)' : '(IQD)'}
                      </label>
                      <input
                        type="number"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(Number(e.target.value))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        min="0"
                        max={discountType === 'percentage' ? 100 : undefined}
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Maksimum İndirim Tutarı (IQD)
                      </label>
                      <input
                        type="number"
                        value={maxDiscountAmount}
                        onChange={(e) => setMaxDiscountAmount(Number(e.target.value))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        min="0"
                        placeholder="Sınırsız için 0"
                      />
                    </div>
                  </div>
                )}

                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="block text-sm font-bold text-gray-700 mb-3">
                    Birim Bazında İndirim
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'NONE', label: 'ADET (YOK)', color: 'blue' },
                      { id: 'KG', label: 'KG', color: 'orange' },
                      { id: 'GR', label: 'GRAM', color: 'orange' },
                      { id: 'PAKET', label: 'PAKET', color: 'purple' },
                      { id: 'LİTRE', label: 'LİTRE', color: 'emerald' },
                      { id: 'KOLI', label: 'KOLİ', color: 'indigo' },
                    ].map(unit => (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => setCampaignUnit(unit.id)}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all border ${campaignUnit === unit.id
                          ? unit.color === 'blue' ? 'bg-blue-600 text-white border-blue-700 shadow-sm' :
                            unit.color === 'orange' ? 'bg-orange-600 text-white border-orange-700 shadow-sm' :
                              unit.color === 'purple' ? 'bg-purple-600 text-white border-purple-700 shadow-sm' :
                                unit.color === 'emerald' ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm' :
                                  'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                          }`}
                      >
                        {unit.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2 italic font-medium">
                    {campaignUnit === 'NONE'
                      ? "â–ª İndirim toplam ürün adeti üzerinden uygulanır."
                      : `â–ª İndirim her ${campaignUnit} birim için ayrı hesaplanır.`}
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Minimum Alışveriş Tutarı (IQD)
                  </label>
                  <input
                    type="number"
                    value={minPurchaseAmount}
                    onChange={(e) => setMinPurchaseAmount(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="0"
                    placeholder="Minimum tutar yok için 0"
                  />
                </div>
              </div>
            </div>

            {/* Date & Time */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg text-gray-900">Kampanya Dönemi</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Başlangıç Tarihi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Başlangıç Saati
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Bitiş Tarihi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Bitiş Saati
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Products Selection */}
            {(campaignType === 'product' || campaignType === 'category') && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="w-5 h-5 text-gray-600" />
                  <h2 className="text-lg text-gray-900">
                    {campaignType === 'product' ? 'Ürün Seçimi' : 'Kategori Seçimi'}
                  </h2>
                </div>

                {campaignType === 'product' ? (
                  <>
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ürün ara..."
                    />

                    <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                      {filteredProducts.map((product) => (
                        <label
                          key={product.id}
                          className="flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-100 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedProducts.includes(product.id)}
                            onChange={() => toggleProduct(product.id)}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <div className="flex-1">
                            <p className="text-sm text-gray-900">{product.name}</p>
                            <p className="text-xs text-gray-500">{product.code}</p>
                          </div>
                          <span className="text-sm text-gray-600">{product.price.toLocaleString()} IQD</span>
                        </label>
                      ))}
                    </div>

                    <p className="text-sm text-gray-600 mt-3">
                      {selectedProducts.length} ürün seçildi
                    </p>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {categories.map((cat) => (
                      <label
                        key={cat}
                        className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(cat)}
                          onChange={() => {
                            setSelectedCategories(prev =>
                              prev.includes(cat)
                                ? prev.filter(c => c !== cat)
                                : [...prev, cat]
                            );
                          }}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm text-gray-900">{cat}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Multi-Language Support */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg text-gray-900">Çoklu Dil Desteği</h2>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      Kampanya Adı (İngilizce)
                    </label>
                    <input
                      type="text"
                      value={nameEn}
                      onChange={(e) => setNameEn(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="Campaign Name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      Kampanya Adı (Arapça)
                    </label>
                    <input
                      type="text"
                      value={nameAr}
                      onChange={(e) => setNameAr(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
                      placeholder="اسم الحملة"
                      dir="rtl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      Açıklama (İngilizce)
                    </label>
                    <textarea
                      value={descriptionEn}
                      onChange={(e) => setDescriptionEn(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="Description"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      Açıklama (Arapça)
                    </label>
                    <textarea
                      value={descriptionAr}
                      onChange={(e) => setDescriptionAr(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right"
                      placeholder="وصف"
                      rows={2}
                      dir="rtl"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Settings & Preview */}
          <div className="space-y-6">
            {/* Customer Segments */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg text-gray-900">Müşteri Segmenti</h2>
              </div>

              <label className="flex items-center gap-2 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyToAllCustomers}
                  onChange={(e) => setApplyToAllCustomers(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Tüm müşterilere uygula</span>
              </label>

              {!applyToAllCustomers && (
                <div className="space-y-2">
                  {segments.map((segment) => (
                    <label
                      key={segment}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={customerSegments.includes(segment)}
                        onChange={() => {
                          setCustomerSegments(prev =>
                            prev.includes(segment)
                              ? prev.filter(s => s !== segment)
                              : [...prev, segment]
                          );
                        }}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-700">{segment}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Advanced Settings */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg text-gray-900">Gelişmiş Ayarlar</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Toplam Kullanım Limiti
                  </label>
                  <input
                    type="number"
                    value={usageLimit}
                    onChange={(e) => setUsageLimit(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    min="0"
                    placeholder="Sınırsız için 0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Kampanyanın toplam kullanım sayısı
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Müşteri Başına Kullanım Limiti
                  </label>
                  <input
                    type="number"
                    value={usageLimitPerCustomer}
                    onChange={(e) => setUsageLimitPerCustomer(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    min="0"
                    placeholder="Sınırsız için 0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Her müşteri için kullanım limiti
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stackable}
                    onChange={(e) => setStackable(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">Diğer kampanyalarla birleştirilebilir</span>
                </label>
              </div>
            </div>

            {/* Status */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg text-gray-900">Durum</h2>
              </div>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700">Kampanya Aktif</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                </div>
              </label>

              <p className="text-xs text-gray-500 mt-2">
                {active ? 'Kampanya şu anda aktif' : 'Kampanya pasif durumda'}
              </p>
            </div>

            {/* Campaign Summary */}
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
              <h3 className="text-sm font-medium text-blue-900 mb-3">Kampanya Özeti</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-700">İndirim:</span>
                  <span className="text-blue-900 font-medium">
                    {discountType === 'percentage' && `%${discountValue}`}
                    {discountType === 'fixed' && `${discountValue.toLocaleString()} IQD`}
                    {discountType === 'buyXgetY' && `${buyQuantity} Al ${getQuantity} Öde`}
                  </span>
                </div>
                {minPurchaseAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-blue-700">Min. Tutar:</span>
                    <span className="text-blue-900">{minPurchaseAmount.toLocaleString()} IQD</span>
                  </div>
                )}
                {maxDiscountAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-blue-700">Maks. İndirim:</span>
                    <span className="text-blue-900">{maxDiscountAmount.toLocaleString()} IQD</span>
                  </div>
                )}
                {selectedProducts.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-blue-700">Ürün Sayısı:</span>
                    <span className="text-blue-900">{selectedProducts.length}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
