import React from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Search, X, Code, CheckCircle, AlertCircle } from 'lucide-react';
import { BroadcastMessage } from '../../utils/centralDataBroadcast';

interface BroadcastFormFieldsProps {
  type: BroadcastMessage['type'];
  action: BroadcastMessage['action'];
  formData: Record<string, any>;
  setFormData: (data: Record<string, any>) => void;
  onRequestSelect?: (type: 'product' | 'customer' | 'campaign') => void;
  theme: string;
}

export function BroadcastFormFields({ type, action, formData, setFormData, onRequestSelect, theme }: BroadcastFormFieldsProps) {
  const updateField = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const inputClass = `w-full p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
    }`;

  const hasData = (field: string) => !!formData[field];

  const renderSelectionState = (
    label: string,
    idField: string,
    selectType: 'product' | 'customer' | 'campaign',
    summaryFields: { label: string; value: any }[]
  ) => {
    const isSelected = hasData(idField);

    return (
      <div className="space-y-4">
        {!isSelected ? (
          <div className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition-all ${theme === 'dark' ? 'border-gray-700 hover:border-blue-500/50 hover:bg-gray-800' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
            }`}>
            <div className={`p-4 rounded-full mb-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white shadow-sm'
              }`}>
              <Search className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-medium mb-2">{label} Seçimi</h3>
            <p className="text-sm opacity-60 text-center max-w-xs mb-6">
              Veritabanından {label.toLowerCase()} seçerek yayınlanacak veriyi otomatik oluşturun.
            </p>
            {onRequestSelect && (
              <Button
                onClick={() => onRequestSelect(selectType)}
                className="gap-2"
              >
                <Search className="w-4 h-4" />
                Listeden {label} Seç
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Selected Item Card */}
            <div className={`relative p-4 rounded-lg border overflow-hidden ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200 shadow-sm'
              }`}>
              <div className="absolute top-0 right-0 p-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={() => setFormData({})}
                  title="Seçimi Temizle"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 bg-green-100 text-green-600 rounded-lg">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-lg mb-4">Seçilen {label}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {summaryFields.map((field, idx) => (
                      <div key={idx}>
                        <div className="text-xs opacity-50 uppercase tracking-wider mb-0.5">{field.label}</div>
                        <div className="font-medium truncate" title={String(field.value)}>
                          {field.value || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Payload Preview */}
            <div className={`rounded-lg border overflow-hidden ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'
              }`}>
              <div className={`px-4 py-2 border-b text-xs font-mono flex items-center gap-2 ${theme === 'dark' ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'
                }`}>
                <Code className="w-3 h-3" />
                <span>PAYLOAD PREVIEW</span>
              </div>
              <pre className={`p-4 text-xs font-mono overflow-auto max-h-60 ${theme === 'dark' ? 'text-green-400' : 'text-green-700'
                }`}>
                {JSON.stringify(formData, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Product Forms
  if (type === 'product') {
    return renderSelectionState('Ürün', 'productId', 'product', [
      { label: 'ID', value: formData.productId },
      { label: 'Barkod', value: formData.productBarcode },
      { label: 'Ürün Adı', value: formData.productName },
      { label: 'Fiyat', value: String(formData.productPrice) },
      { label: 'Stok', value: formData.productStock },
      { label: 'Kategori', value: formData.productCategory },
    ]);
  }

  // Price Forms
  if (type === 'price') {
    return renderSelectionState('Ürün (Fiyat Güncellemesi)', 'priceProductId', 'product', [
      { label: 'ID', value: formData.priceProductId },
      { label: 'Eski Fiyat', value: String(formData.oldPrice) },
      { label: 'Yeni Fiyat', value: formData.newPrice ? String(formData.newPrice) : '(Girilecek)' }, // Yeni fiyat manuel girilmeli mi? Kullanıcı "tümü değişenler DB'den" dedi, fiyat değişimi broadcast ediliyorsa yeni fiyat DB'deki fiyattır.
    ]);
    // Note: For price update, usually you select a product and the "new price" is whatever is in the DB currently, 
    // or maybe you want to broadcast a change TO the DB value. Assuming DB value is the source of truth.
  }

  // Customer Forms
  if (type === 'customer') {
    return renderSelectionState('Müşteri', 'customerId', 'customer', [
      { label: 'ID', value: formData.customerId },
      { label: 'Ad Soyad', value: formData.customerName },
      { label: 'Telefon', value: formData.customerPhone },
      { label: 'E-posta', value: formData.customerEmail },
      { label: 'Adres', value: formData.customerAddress },
    ]);
  }

  // Campaign Forms
  if (type === 'campaign') {
    return renderSelectionState('Kampanya', 'campaignId', 'campaign', [
      { label: 'ID', value: formData.campaignId },
      { label: 'Kampanya Adı', value: formData.campaignName },
      { label: 'İndirim', value: `%${formData.campaignDiscount}` },
      { label: 'Tarihler', value: `${formData.campaignStartDate} - ${formData.campaignEndDate}` },
    ]);
  }

  // Inventory Forms
  if (type === 'inventory') {
    return renderSelectionState('Ürün (Stok Güncellemesi)', 'inventoryProductId', 'product', [
      { label: 'ID', value: formData.inventoryProductId },
      { label: 'Miktar', value: formData.inventoryQuantity },
      { label: 'Depo', value: formData.inventoryLocation },
    ]);
  }

  // Config Forms - Manual Input Required (Not DB linked usually)
  if (type === 'config') {
    return (
      <div className="space-y-4">
        <div className={`p-4 rounded-lg border flex items-start gap-3 ${theme === 'dark' ? 'bg-blue-900/20 border-blue-800 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            Konfigürasyon broadcastleri genellikle manuel parametre girişleri gerektirir.
          </div>
        </div>

        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
          <div>
            <label className="block text-sm mb-1">Ayar Anahtarı *</label>
            <Input
              type="text"
              value={formData.configKey || ''}
              onChange={(e) => updateField('configKey', e.target.value)}
              placeholder="max_discount"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Değer *</label>
            <Input
              type="text"
              value={formData.configValue || ''}
              onChange={(e) => updateField('configValue', e.target.value)}
              placeholder="50"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Açıklama</label>
            <Input
              type="text"
              value={formData.configDescription || ''}
              onChange={(e) => updateField('configDescription', e.target.value)}
              placeholder="Maksimum indirim oranı (%)"
              className={inputClass}
            />
          </div>
        </div>
      </div>
    );
  }

  // Notification Forms - Manual Input Required
  if (type === 'notification') {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Bildirim Başlığı *</label>
            <Input
              type="text"
              value={formData.notificationTitle || ''}
              onChange={(e) => updateField('notificationTitle', e.target.value)}
              placeholder="Sistem Güncellemesi"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Mesaj *</label>
            <textarea
              value={formData.notificationMessage || ''}
              onChange={(e) => updateField('notificationMessage', e.target.value)}
              placeholder="Sistem 15 dakika içinde güncellenecektir..."
              rows={3}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Tip</label>
            <select
              value={formData.notificationType || 'info'}
              onChange={(e) => updateField('notificationType', e.target.value)}
              className={inputClass}
            >
              <option value="info">Bilgi</option>
              <option value="success">Başarılı</option>
              <option value="warning">Uyarı</option>
              <option value="error">Hata</option>
            </select>
          </div>
        </div>

        {/* Preview */}
        {formData.notificationTitle && (
          <div className={`rounded-lg border overflow-hidden ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'
            }`}>
            <div className={`px-4 py-2 border-b text-xs font-mono flex items-center gap-2 ${theme === 'dark' ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'
              }`}>
              <Code className="w-3 h-3" />
              <span>PAYLOAD PREVIEW</span>
            </div>
            <pre className={`p-4 text-xs font-mono overflow-auto ${theme === 'dark' ? 'text-green-400' : 'text-green-700'
              }`}>
              {JSON.stringify(formData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // User Forms (Manual for now, or could select from user list if store exists)
  if (type === 'user') {
    return (
      <div className="space-y-4">
        <div className={`p-4 rounded-lg border flex items-start gap-3 ${theme === 'dark' ? 'bg-blue-900/20 border-blue-800 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            Kullanıcı broadcast işlemleri için manuel giriş yapılmaktadır.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">Kullanıcı ID</label>
            <Input
              type="text"
              value={formData.userId || ''}
              onChange={(e) => updateField('userId', e.target.value)}
              placeholder="USR001"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Ad Soyad *</label>
            <Input
              type="text"
              value={formData.userName || ''}
              onChange={(e) => updateField('userName', e.target.value)}
              placeholder="Layla Hassan"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">E-posta</label>
            <Input
              type="email"
              value={formData.userEmail || ''}
              onChange={(e) => updateField('userEmail', e.target.value)}
              placeholder="kullanici@sirket.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Rol</label>
            <select
              value={formData.userRole || 'user'}
              onChange={(e) => updateField('userRole', e.target.value)}
              className={inputClass}
            >
              <option value="admin">Yönetici</option>
              <option value="manager">Müdür</option>
              <option value="cashier">Kasiyer</option>
              <option value="user">Kullanıcı</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  // Report Forms
  if (type === 'report') {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Rapor Tipi *</label>
          <select
            value={formData.reportType || 'sales'}
            onChange={(e) => updateField('reportType', e.target.value)}
            className={inputClass}
          >
            <option value="sales">Satış Raporu</option>
            <option value="inventory">Stok Raporu</option>
            <option value="financial">Mali Rapor</option>
            <option value="customer">Müşteri Raporu</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">Başlangıç Tarihi</label>
            <Input
              type="date"
              value={formData.reportStartDate || ''}
              onChange={(e) => updateField('reportStartDate', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Bitiş Tarihi</label>
            <Input
              type="date"
              value={formData.reportEndDate || ''}
              onChange={(e) => updateField('reportEndDate', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>
    );
  }

  // Bulk & Custom - Generic JSON form
  return (
    <div className="space-y-3">
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          <strong>{type === 'bulk' ? 'Toplu İşlem' : 'Özel Veri'}</strong> tipi için veri JSON formatında girilmelidir.
        </p>
      </div>

      <div>
        <label className="block text-sm mb-1">Veri (JSON Format)</label>
        <textarea
          value={formData.customJson || ''}
          onChange={(e) => updateField('customJson', e.target.value)}
          placeholder={'{\n  "field1": "value1",\n  "field2": "value2"\n}'}
          rows={8}
          className={`${inputClass} font-mono text-sm`}
        />
      </div>
    </div>
  );
}
