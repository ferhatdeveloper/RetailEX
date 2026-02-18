import { useState } from 'react';
import { FileText, FileCheck, FileMinus, Truck, ShoppingBag, FileSignature, Plus, X } from 'lucide-react';
import { SalesInvoiceModule } from '../sales/SalesInvoiceModule';
import { PurchaseInvoiceModule } from '../purchase/PurchaseInvoiceModule';
import { UniversalInvoiceForm } from './UniversalInvoiceForm';
import { InvoiceActionsModal } from './InvoiceActionsModal';
import type { Customer, Product } from '../../../App';

interface UnifiedInvoiceModuleProps {
  customers?: Customer[];
  products?: Product[];
  defaultCategory?: 'Satis' | 'Alis' | 'Iade' | 'Irsaliye' | 'Siparis' | 'Teklif' | 'Hizmet'; // Varsayılan kategori
  defaultInvoiceTypeCode?: number; // Varsayılan fatura tipi kodu
}

import { useLanguage } from '../../../contexts/LanguageContext';

// Logo Fatura Türleri
interface InvoiceType {
  code: number;
  name: string;
  category: 'Satis' | 'Alis' | 'Iade' | 'Irsaliye' | 'Siparis' | 'Teklif' | 'Hizmet';
  color: string;
  icon: 'FileText' | 'FileCheck' | 'FileMinus' | 'Truck' | 'ShoppingBag' | 'FileSignature';
}

// Removed static constant to use inside component with translations
// const INVOICE_TYPES: InvoiceType[] = ...

const getIcon = (iconName: string) => {
  switch (iconName) {
    case 'FileCheck': return FileCheck;
    case 'FileMinus': return FileMinus;
    case 'Truck': return Truck;
    case 'ShoppingBag': return ShoppingBag;
    case 'FileSignature': return FileSignature;
    default: return FileText;
  }
};

export function UnifiedInvoiceModule({ customers = [], products = [], defaultCategory, defaultInvoiceTypeCode }: UnifiedInvoiceModuleProps) {
  const { tm } = useLanguage();

  const INVOICE_TYPES: InvoiceType[] = [
    // SATIŞ FATURALARI
    { code: 0, name: tm('salesInvoice'), category: 'Satis', color: 'bg-green-100 text-green-700 border-green-300', icon: 'FileText' },
    { code: 1, name: tm('retailSalesInvoice'), category: 'Satis', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: 'FileText' },
    { code: 2, name: tm('wholesaleInvoice'), category: 'Satis', color: 'bg-purple-100 text-purple-700 border-purple-300', icon: 'FileText' },
    { code: 3, name: tm('salesReturnInvoice'), category: 'Iade', color: 'bg-red-100 text-red-700 border-red-300', icon: 'FileMinus' },
    { code: 4, name: tm('consignmentInvoice'), category: 'Satis', color: 'bg-orange-100 text-orange-700 border-orange-300', icon: 'FileText' },

    // ALIŞ FATURALARI
    { code: 5, name: tm('purchaseInvoice'), category: 'Alis', color: 'bg-cyan-100 text-cyan-700 border-cyan-300', icon: 'FileCheck' },
    { code: 6, name: tm('purchaseReturnInvoice'), category: 'Iade', color: 'bg-pink-100 text-pink-700 border-pink-300', icon: 'FileMinus' },

    // HİZMET FATURALARI
    { code: 7, name: tm('serviceGivenInvoice'), category: 'Hizmet', color: 'bg-indigo-100 text-indigo-700 border-indigo-300', icon: 'FileText' },
    { code: 8, name: tm('serviceReceivedInvoice'), category: 'Hizmet', color: 'bg-violet-100 text-violet-700 border-violet-300', icon: 'FileCheck' },

    // İRSALİYELER
    { code: 10, name: tm('salesWaybill'), category: 'Irsaliye', color: 'bg-teal-100 text-teal-700 border-teal-300', icon: 'Truck' },
    { code: 11, name: tm('purchaseWaybill'), category: 'Irsaliye', color: 'bg-sky-100 text-sky-700 border-sky-300', icon: 'Truck' },
    { code: 12, name: tm('transferWaybill'), category: 'Irsaliye', color: 'bg-orange-100 text-orange-700 border-orange-300', icon: 'Truck' },
    { code: 13, name: tm('wastageWaybill'), category: 'Irsaliye', color: 'bg-red-100 text-red-700 border-red-300', icon: 'Truck' },

    // SİPARİŞLER
    { code: 20, name: tm('salesOrder'), category: 'Siparis', color: 'bg-green-100 text-green-700 border-green-300', icon: 'ShoppingBag' },
    { code: 21, name: tm('purchaseOrder'), category: 'Siparis', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: 'ShoppingBag' },

    // TEKLİFLER
    { code: 30, name: tm('salesOffer'), category: 'Teklif', color: 'bg-purple-100 text-purple-700 border-purple-300', icon: 'FileSignature' },
    { code: 31, name: tm('purchaseOffer'), category: 'Teklif', color: 'bg-cyan-100 text-cyan-700 border-cyan-300', icon: 'FileSignature' },
  ];

  // Varsayılan kategoriye göre aktif tab'ı belirle
  const getInitialTab = (): 'sales' | 'purchase' => {
    if (defaultCategory === 'Satis' || (defaultInvoiceTypeCode !== undefined && defaultInvoiceTypeCode < 5)) {
      return 'sales';
    }
    if (defaultCategory === 'Alis' || (defaultInvoiceTypeCode !== undefined && defaultInvoiceTypeCode >= 5 && defaultInvoiceTypeCode < 10)) {
      return 'purchase';
    }
    // Hizmet faturaları: Verilen (7) -> sales, Alınan (8) -> purchase
    if (defaultCategory === 'Hizmet') {
      if (defaultInvoiceTypeCode === 7) {
        return 'sales';
      }
      if (defaultInvoiceTypeCode === 8) {
        return 'purchase';
      }
    }
    return 'sales'; // Varsayılan
  };

  const [activeTab, setActiveTab] = useState<'sales' | 'purchase'>(getInitialTab());
  const [showInvoiceTypeModal, setShowInvoiceTypeModal] = useState(false);
  const [selectedInvoiceType, setSelectedInvoiceType] = useState<InvoiceType | null>(
    defaultInvoiceTypeCode !== undefined
      ? INVOICE_TYPES.find(t => t.code === defaultInvoiceTypeCode) || null
      : null
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory || 'all');
  const [hoveredInvoiceType, setHoveredInvoiceType] = useState<InvoiceType | null>(null);
  const [selectedInvoiceForAction, setSelectedInvoiceForAction] = useState<any | null>(null);

  // Yeni fatura oluşturma - modal aç (direkt fatura tipi seçimi yapılmaz)
  const handleCreateInvoice = (invoiceTypeCode?: number) => {
    setShowInvoiceTypeModal(true);

    // Varsayılan olarak kategori seçilmez, kullanıcı seçsin
    setSelectedCategory('all');
    setHoveredInvoiceType(null);

    // Eğer özel bir fatura tipi kodu verilmişse onu hover et ve kategoriyi seç (opsiyonel)
    if (invoiceTypeCode !== undefined) {
      const type = INVOICE_TYPES.find(t => t.code === invoiceTypeCode);
      if (type) {
        setHoveredInvoiceType(type);
        setSelectedCategory(type.category);
      }
    }
  };

  // Fatura türü seçildiğinde
  const handleSelectInvoiceType = (type: InvoiceType) => {
    setSelectedInvoiceType(type);
    setShowInvoiceTypeModal(false);
  };

  // Fatura formu kapatıldığında
  const handleCloseInvoiceForm = () => {
    setSelectedInvoiceType(null);
  };

  // Kategorilere göre filtreleme
  const categories = [
    { id: 'all', label: tm('all'), count: INVOICE_TYPES.length },
    { id: 'Satis', label: tm('sales'), count: INVOICE_TYPES.filter(t => t.category === 'Satis').length },
    { id: 'Alis', label: tm('purchase'), count: INVOICE_TYPES.filter(t => t.category === 'Alis').length },
    { id: 'Hizmet', label: tm('service'), count: INVOICE_TYPES.filter(t => t.category === 'Hizmet').length },
    { id: 'Irsaliye', label: tm('waybill'), count: INVOICE_TYPES.filter(t => t.category === 'Irsaliye').length },
    { id: 'Siparis', label: tm('order'), count: INVOICE_TYPES.filter(t => t.category === 'Siparis').length },
    { id: 'Teklif', label: tm('offer'), count: INVOICE_TYPES.filter(t => t.category === 'Teklif').length },
    { id: 'Iade', label: tm('return'), count: INVOICE_TYPES.filter(t => t.category === 'Iade').length },
  ];

  const filteredTypes = selectedCategory === 'all'
    ? INVOICE_TYPES
    : INVOICE_TYPES.filter(t => t.category === selectedCategory);

  // Fatura formu açıksa UniversalInvoiceForm'u göster
  if (selectedInvoiceType) {
    return (
      <UniversalInvoiceForm
        invoiceType={selectedInvoiceType}
        customers={customers}
        products={products}
        onClose={handleCloseInvoiceForm}
      />
    );
  }

  // Fatura işlemleri için handler'lar
  const handleInvoiceAction = {
    view: (invoice: any) => {
      // İnceleme - detay görünümü açılabilir
      setSelectedInvoiceForAction(invoice);
    },
    edit: (invoice: any) => {
      // Düzenleme - UniversalInvoiceForm'u edit modunda aç
      const invoiceType = INVOICE_TYPES.find(t => t.code === invoice.invoiceTypeCode || t.code === 0);
      if (invoiceType) {
        setSelectedInvoiceType(invoiceType);
        // TODO: Edit data'yı form'a aktar
      }
      setSelectedInvoiceForAction(null);
    },
    copy: (invoice: any) => {
      // Kopyalama - yeni fatura oluştur ama verileri kopyala
      const invoiceType = INVOICE_TYPES.find(t => t.code === invoice.invoiceTypeCode || t.code === 0);
      if (invoiceType) {
        setSelectedInvoiceType(invoiceType);
        // TODO: Copy data'yı form'a aktar
      }
      setSelectedInvoiceForAction(null);
    },
    delete: (invoice: any) => {
      // Silme - TODO: API çağrısı
      console.log('Delete invoice:', invoice);
      setSelectedInvoiceForAction(null);
    },
    print: async (invoice: any) => {
      // Yazdırma
      console.log('Print invoice:', invoice);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Liste Görünümleri - Her modülün kendi header'ı ve Fatura Türü Seçin butonu var */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'sales' && (
          <SalesInvoiceModule
            customers={customers}
            products={products}
            onCreateInvoice={handleCreateInvoice}
            onSwitchTab={() => setActiveTab('purchase')}
            activeTab={activeTab}
            onInvoiceClick={(invoice) => setSelectedInvoiceForAction(invoice)}
          />
        )}
        {activeTab === 'purchase' && (
          <PurchaseInvoiceModule
            onCreateInvoice={handleCreateInvoice}
            onSwitchTab={() => setActiveTab('sales')}
            activeTab={activeTab}
            onInvoiceClick={(invoice) => setSelectedInvoiceForAction(invoice)}
          />
        )}
      </div>

      {/* Fatura İşlemleri Modalı */}
      {selectedInvoiceForAction && (
        <InvoiceActionsModal
          invoice={{
            id: selectedInvoiceForAction.id,
            invoice_no: selectedInvoiceForAction.id || selectedInvoiceForAction.invoice_no,
            invoice_date: selectedInvoiceForAction.date || new Date().toISOString(),
            customer_name: selectedInvoiceForAction.customer,
            supplier_name: selectedInvoiceForAction.supplier,
            total_amount: selectedInvoiceForAction.grandTotal || selectedInvoiceForAction.total || 0,
            status: selectedInvoiceForAction.status || 'Beklemede',
            invoice_type: selectedInvoiceForAction.invoiceTypeCode,
            invoice_category: selectedInvoiceForAction.category
          }}
          onClose={() => setSelectedInvoiceForAction(null)}
          onView={handleInvoiceAction.view}
          onEdit={handleInvoiceAction.edit}
          onCopy={handleInvoiceAction.copy}
          onDelete={handleInvoiceAction.delete}
          onPrint={handleInvoiceAction.print}
        />
      )}

      {/* Fatura Türü Seçim Modalı - Ödeme Al Modalı Tarzı (İki Panelli) */}
      {showInvoiceTypeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl bg-white">
            {/* Header - Ödeme Al gibi */}
            <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-between">
              <h3 className="text-base text-white flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {tm('selectInvoiceType')}
              </h3>
              <button
                onClick={() => setShowInvoiceTypeModal(false)}
                className="text-white hover:text-gray-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - İki Panelli (Ödeme Al gibi) */}
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Sol Panel - Fatura Türleri (Kategorilere göre) */}
                <div className="space-y-3">
                  {/* Kategori Filtreleri */}
                  <div className="border border-gray-300 bg-blue-50 p-3">
                    <h4 className="text-sm text-blue-800 mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      {tm('invoiceCategories')}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-3 py-1.5 text-xs border transition-colors ${selectedCategory === cat.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                            }`}
                        >
                          {cat.label} ({cat.count})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fatura Türleri Listesi */}
                  <div className="border border-gray-300 bg-white p-3">
                    <h4 className="text-sm text-gray-700 mb-3">{tm('invoiceTypes')}</h4>
                    <div className="space-y-2 max-h-[400px] overflow-auto">
                      {filteredTypes.map((type) => {
                        const Icon = getIcon(type.icon);
                        const isHovered = hoveredInvoiceType?.code === type.code;
                        return (
                          <button
                            key={type.code}
                            onClick={() => handleSelectInvoiceType(type)}
                            onMouseEnter={() => setHoveredInvoiceType(type)}
                            onMouseLeave={() => setHoveredInvoiceType(null)}
                            className={`w-full p-3 rounded border-2 transition-all text-left ${isHovered
                              ? 'border-blue-600 bg-blue-50 shadow-md'
                              : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
                              }`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <Icon className={`w-5 h-5 ${isHovered ? 'text-blue-600' : 'text-gray-600'}`} />
                                <span className="font-semibold text-sm text-gray-900">{type.name}</span>
                              </div>
                              <span className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                                TRCODE {type.code}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">{type.category}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Sağ Panel - Seçilen Fatura Türü Detayları */}
                <div className="space-y-3">
                  {hoveredInvoiceType ? (
                    <>
                      {/* Seçilen Tür Özeti */}
                      <div className="border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 p-5 shadow-sm">
                        <h4 className="text-xs uppercase tracking-wide mb-3 text-gray-600">
                          {tm('invoiceTypeDetails')}
                        </h4>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 mb-3">
                            {(() => {
                              const Icon = getIcon(hoveredInvoiceType.icon);
                              return <Icon className="w-10 h-10 text-blue-600" />;
                            })()}
                            <div>
                              <div className="text-xl font-bold text-gray-900">{hoveredInvoiceType.name}</div>
                              <div className="text-sm text-gray-600">TRCODE: {hoveredInvoiceType.code}</div>
                            </div>
                          </div>

                          <div className="border-t border-gray-300 pt-3">
                            <div className="flex justify-between mb-2">
                              <span className="text-sm text-gray-600">{tm('category')}:</span>
                              <span className="text-sm font-medium text-gray-900">{hoveredInvoiceType.category}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">{tm('status')}:</span>
                              <span className="text-sm font-medium text-green-600">{tm('ready')}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bilgilendirme */}
                      <div className="border border-gray-300 bg-white p-4">
                        <h4 className="text-sm text-gray-700 mb-2">{tm('description')}</h4>
                        <div className="text-xs text-gray-600 space-y-2">
                          {hoveredInvoiceType.code === 0 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Standart satış işlemlerinizi kayıt altına almak için kullanılır. Müşterilere mal/hizmet satışı yapıldığında bu fatura türü ile fatura kesilir. Muhasebe kayıtları otomatik oluşturulur ve stok hareketleri kaydedilir.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 1 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Perakende satış işlemleri için kullanılır. Mağaza veya satış noktasından yapılan bireysel satışlar için kesilir. Genellikle daha küçük miktarlı ve nakit/kkart ödemeli işlemler için kullanılır.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 2 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Toptan satış işlemleri için kullanılır. Büyük miktarlı, indirimli satışlar ve kurumsal müşterilere yapılan satışlar için kesilir. Genellikle vade farkı veya özel fiyatlandırma ile birlikte kullanılır.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 3 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Müşteriden geri gelen satış iadeleri için kullanılır. Defolu, hasarlı veya istenmeyen ürünlerin geri alınması durumunda kesilir. Stok girişi ve muhasebe kaydı otomatik oluşturulur.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 4 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Konsinye satış işlemleri için kullanılır. Ürünler başka bir işletmeye satış yapılana kadar depolarda tutulur. Satış gerçekleştiğinde fatura kesilir ve stok çıkışı yapılır.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 5 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Tedarikçilerden yapılan alış işlemlerini kayıt altına almak için kullanılır. Satın alınan mal/hizmetlerin muhasebe kaydı yapılır ve stok girişi otomatik oluşturulur. FIFO maliyet hesaplaması yapılır.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 6 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Tedarikçilere yapılan iadeler için kullanılır. Defolu veya hatalı gelen ürünlerin geri gönderilmesi durumunda kesilir. Stok çıkışı ve muhasebe kaydı otomatik oluşturulur.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 7 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Müşterilere verilen hizmetler için kullanılır. Mal teslimi olmayan, sadece hizmet sunulan işlemler için kesilir. Muhasebe kaydı yapılır ancak stok hareketi oluşturulmaz.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 8 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Tedarikçilerden alınan hizmetler için kullanılır. Dışarıdan alınan danışmanlık, bakım, onarım gibi hizmetler için kesilir. Gider muhasebesi yapılır, stok hareketi oluşturulmaz.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 10 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Müşterilere yapılan sevkiyatları kayıt altına almak için kullanılır. Mal teslim edildiğinde kesilir, fatura sonradan kesilebilir. Stok çıkışı yapılır.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 11 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Tedarikçilerden gelen sevkiyatları kayıt altına almak için kullanılır. Mal teslim alındığında kesilir, fatura sonradan kesilebilir. Stok girişi yapılır.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 12 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Depolar arası ürün transferlerini kayıt altına almak için kullanılır. Bir depodan diğerine yapılan ürün aktarımları için kesilir. Stok hareketi oluşturulur.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 13 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Fire, bozulmuş veya kullanılamaz hale gelmiş ürünlerin stoktan çıkarılması için kullanılır. Stok çıkışı yapılır ve maliyet kaydı oluşturulur.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 20 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Müşterilerden gelen satış siparişlerini kayıt altına almak için kullanılır. Sipariş alındığında oluşturulur, sonradan faturaya dönüştürülebilir. Stok rezervasyonu yapılır.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 21 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Tedarikçilere verilen alış siparişlerini kayıt altına almak için kullanılır. Sipariş verildiğinde oluşturulur, mal geldiğinde faturaya dönüştürülebilir.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 30 && (
                            <>
                              <p className="font-medium text-gray-800">Ne İşe Yarar:</p>
                              <p>Müşterilere gönderilen satış tekliflerini kayıt altına almak için kullanılır. Fiyat ve koşul teklifi sunulduğunda oluşturulur, kabul edilirse siparişe veya faturaya dönüştürülebilir.</p>
                            </>
                          )}
                          {hoveredInvoiceType.code === 31 && (
                            <>
                              <p className="font-medium text-gray-800">{tm('whatIsItFor')}:</p>
                              <p>{tm('purchaseOfferDesc')}</p>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="border border-gray-300 bg-gray-50 p-8 text-center">
                      <FileText className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-600">
                        {tm('hoverInvoiceType')}
                        <br />
                        {tm('toViewDetails')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer - Ödeme Al gibi */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowInvoiceTypeModal(false)}
                className="px-6 py-2.5 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
              >
                {tm('cancel')}
              </button>
              {hoveredInvoiceType && (
                <button
                  onClick={() => handleSelectInvoiceType(hoveredInvoiceType)}
                  className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
                >
                  {tm('selectAndContinue')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
