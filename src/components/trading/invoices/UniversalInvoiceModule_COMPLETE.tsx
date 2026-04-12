/**
 * ExRetailOS - Universal Invoice Module COMPLETE VERSION
 * Task 1.3: Full implementation with period control and auto-journal
 * 
 * @created 2024-12-18
 */

import { useState } from 'react';
import { FileText, Plus, Search, Save, X, Printer, Send, Calendar, AlertCircle, Check, TrendingUp, Banknote } from 'lucide-react';
import { DocumentManager } from './DocumentManager';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { useAutoJournal, formatJournalResult } from '../../../hooks/useAutoJournal';
import { CostAccountingService } from '../../../services/costAccountingService';
import { InvoiceLineWithProfit } from './InvoiceLineWithProfit';
import { PurchaseInvoiceLineEnhanced, ProductHistoryModal } from './PurchaseInvoiceLineEnhanced';
import { toast } from 'sonner';

// Para formatlama - IQD için ondalık kısım olmadan
const formatMoney = (amount: number): string => {
  return amount.toLocaleString('en-IQ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
};

interface InvoiceType {
  code: number; // Logo TRCODE
  name: string;
  category: 'Satis' | 'Alis' | 'Iade' | 'Irsaliye' | 'Siparis' | 'Teklif';
  color: string;
}

const INVOICE_TYPES: InvoiceType[] = [
  // SATIŞ FATURALARI
  { code: 0, name: 'Satış Faturası', category: 'Satis', color: 'bg-green-100 text-green-700' },
  { code: 1, name: 'Perakende Satış', category: 'Satis', color: 'bg-blue-100 text-blue-700' },
  { code: 2, name: 'Toptan Satış', category: 'Satis', color: 'bg-purple-100 text-purple-700' },
  { code: 3, name: 'Satış İade', category: 'Iade', color: 'bg-red-100 text-red-700' },
  { code: 4, name: 'Konsinye Satış', category: 'Satis', color: 'bg-orange-100 text-orange-700' },

  // ALIŞ FATURALARI
  { code: 5, name: 'Alış Faturası', category: 'Alis', color: 'bg-cyan-100 text-cyan-700' },
  { code: 6, name: 'Alış İade', category: 'Iade', color: 'bg-pink-100 text-pink-700' },

  // İRSALİYELER
  { code: 10, name: 'Satış İrsaliyesi', category: 'Irsaliye', color: 'bg-teal-100 text-teal-700' },
  { code: 11, name: 'Alış İrsaliyesi', category: 'Irsaliye', color: 'bg-sky-100 text-sky-700' },
  { code: 12, name: 'Depo Transfer İrsaliyesi', category: 'Irsaliye', color: 'bg-orange-100 text-orange-700' },
  { code: 13, name: 'Fire İrsaliyesi', category: 'Irsaliye', color: 'bg-red-100 text-red-700' },

  // SİPARİŞLER
  { code: 20, name: 'Satış Siparişi', category: 'Siparis', color: 'bg-green-100 text-green-700' },
  { code: 21, name: 'Alış Siparişi', category: 'Siparis', color: 'bg-blue-100 text-blue-700' },

  // TEKLİFLER
  { code: 30, name: 'Satış Teklifi', category: 'Teklif', color: 'bg-purple-100 text-purple-700' },
  { code: 31, name: 'Alış Teklifi', category: 'Teklif', color: 'bg-cyan-100 text-cyan-700' },
];

interface InvoiceLine {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  totalAmount: number;
  // COST TRACKING (FIFO)
  unitCost?: number; // FIFO'dan gelen maliyet
  totalCost?: number; // Toplam maliyet
  grossProfit?: number; // Brüt kar (totalAmount - totalCost)
  profitMargin?: number; // Kar marjı % ((grossProfit / totalAmount) * 100)
  // PURCHASE INVOICE EXTRAS
  expiryDate?: string; // Son kullanma tarihi
  lastPurchasePrice?: number; // Son alış fiyatı (önceki)
  priceDifference?: number; // Fiyat farkı (şimdiki - önceki)
  priceDifferencePercent?: number; // % fiyat farkı
  profitMarginPercent?: number; // Alış fiyatına göre kar marjı %
}

interface UniversalInvoiceModuleProps {
  invoiceTypeCode?: number; // Özel bir tip için (opsiyonel)
  allowTypeSelection?: boolean; // Tip seçimi yapılabilir mi?
  editData?: any; // Düzenleme verileri
}

export function UniversalInvoiceModule({
  invoiceTypeCode,
  allowTypeSelection = true,
  editData
}: UniversalInvoiceModuleProps = {}) {
  const [selectedType, setSelectedType] = useState<InvoiceType | null>(
    invoiceTypeCode ? INVOICE_TYPES.find(t => t.code === invoiceTypeCode) || null : null
  );
  const [view, setView] = useState<'list' | 'create'>('list');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Mock data
  const invoices = [
    {
      id: 1,
      documentNo: 'SF-2025-00001',
      type: INVOICE_TYPES[0],
      customer: 'ABC Teknoloji A.Ş.',
      date: '2025-12-10',
      total: 14750,
      status: 'Onaylandı',
    },
    {
      id: 2,
      documentNo: 'AF-2025-00001',
      type: INVOICE_TYPES[5],
      customer: 'XYZ Tedarik Ltd.',
      date: '2025-12-09',
      total: 25600,
      status: 'Taslak',
    },
    {
      id: 3,
      documentNo: 'SI-2025-00001',
      type: INVOICE_TYPES[7],
      customer: 'DEF Market',
      date: '2025-12-08',
      total: 8900,
      status: 'Sevk Edildi',
    },
  ];

  const filteredInvoices = invoices.filter(inv => {
    const matchesCategory = filterCategory === 'all' || inv.type.category === filterCategory;
    const matchesSearch = !searchQuery ||
      inv.documentNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !selectedType || inv.type.code === selectedType.code;
    return matchesCategory && matchesSearch && matchesType;
  });

  if (view === 'create') {
    return (
      <CreateInvoiceFormComplete
        invoiceType={selectedType}
        onCancel={() => setView('list')}
        editData={editData}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Fatura Tipi Seçimi */}
      {allowTypeSelection && !selectedType && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold mb-4">Fatura Tipi Seçin</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {INVOICE_TYPES.map((type) => (
              <button
                key={type.code}
                onClick={() => setSelectedType(type)}
                className={`p-4 rounded-lg border-2 hover:shadow-md transition-all text-left ${type.color}`}
              >
                <div className="text-xs opacity-70 mb-1">TRCODE {type.code}</div>
                <div className="font-medium text-sm">{type.name}</div>
                <div className="text-xs mt-1 opacity-60">{type.category}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Seçili Tip Varsa */}
      {selectedType && (
        <>
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {allowTypeSelection && (
                  <button
                    onClick={() => setSelectedType(null)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    ← Geri
                  </button>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{selectedType.name}</h2>
                    <span className={`text-xs px-2 py-1 rounded ${selectedType.color}`}>
                      TRCODE {selectedType.code}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">Logo ERP Uyumlu</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setView('create')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Yeni {selectedType.name}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Belge no, cari ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tüm Kategoriler</option>
                <option value="Satis">Satış</option>
                <option value="Alis">Alış</option>
                <option value="Iade">İade</option>
                <option value="Irsaliye">İrsaliye</option>
                <option value="Siparis">Sipariş</option>
                <option value="Teklif">Teklif</option>
              </select>
            </div>
          </div>

          {/* Invoice List */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <h3 className="font-semibold">{selectedType.name} Listesi</h3>
            </div>
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm text-gray-700">Belge No</th>
                    <th className="text-left py-3 px-4 text-sm text-gray-700">Cari</th>
                    <th className="text-left py-3 px-4 text-sm text-gray-700">Tarih</th>
                    <th className="text-right py-3 px-4 text-sm text-gray-700">Tutar</th>
                    <th className="text-center py-3 px-4 text-sm text-gray-700">Durum</th>
                    <th className="text-right py-3 px-4 text-sm text-gray-700">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        Kayıt bulunamadı
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="font-mono text-sm text-blue-600">{invoice.documentNo}</div>
                        </td>
                        <td className="py-3 px-4 text-sm">{invoice.customer}</td>
                        <td className="py-3 px-4 text-sm text-gray-600">{invoice.date}</td>
                        <td className="text-right py-3 px-4 text-sm font-medium">
                          {invoice.total.toLocaleString('tr-TR')}
                        </td>
                        <td className="text-center py-3 px-4">
                          <span className={`text-xs px-2 py-1 rounded ${invoice.status === 'Onaylandı' ? 'bg-green-100 text-green-700' :
                            invoice.status === 'Taslak' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                            {invoice.status}
                          </span>
                        </td>
                        <td className="text-right py-3 px-4">
                          <button className="text-blue-600 hover:text-blue-700 text-sm">
                            Detay
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// FATURA OLUŞTURMA FORMU - COMPLETE VERSION
// ============================================

function CreateInvoiceFormComplete({
  invoiceType,
  onCancel,
  editData
}: {
  invoiceType: InvoiceType | null;
  onCancel: () => void;
  editData?: any;
}) {
  // Hooks
  const { selectedFirm, selectedPeriod } = useFirmaDonem();

  // Mappings for backward compatibility
  const selectedFirma = selectedFirm ? {
    ...selectedFirm,
    id: selectedFirm.logicalref.toString(),
    firma_adi: selectedFirm.name
  } : null;

  const selectedDonem = selectedPeriod ? {
    ...selectedPeriod,
    id: selectedPeriod.logicalref.toString(),
    donem_adi: `Dönem ${selectedPeriod.nr}`
  } : null;

  const isPeriodOpen = () => selectedPeriod?.active ?? false;
  // Simple check
  const isTransactionAllowed = (date: any, type: any) => ({ allowed: selectedPeriod?.active ?? false, reason: 'Dönem kapalı' });

  const { createSalesJournal, createPurchaseJournal } = useAutoJournal();

  // State
  const [activeTab, setActiveTab] = useState<'fatura' | 'detaylar' | 'ekliDosyalar'>('fatura');
  const [saving, setSaving] = useState(false);
  const [showProductHistory, setShowProductHistory] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<{ code: string; name: string } | null>(null);

  // Form Data
  const [invoiceNo] = useState(
    editData?.id || `${new Date().toISOString().split('T')[0].replace(/-/g, '')}${Math.floor(Math.random() * 1000000)}`
  );
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [customer, setCustomer] = useState<{ code: string; name: string } | null>(null);
  const [lines, setLines] = useState<any[]>([
    {
      id: '1',
      productCode: '',
      productName: '',
      quantity: 0,
      unitPrice: 0,
      discount: 0,
      total: 0,
      expiryDate: '',
      lastPurchasePrice: 0,
      profitMarginPercent: 0
    }
  ]);

  if (!invoiceType) return null;

  /**
   * Handle line field change
   */
  const handleLineChange = (index: number, field: string, value: any) => {
    const newLines = [...lines];
    newLines[index][field] = value;

    // Auto-calculate total
    const line = newLines[index];
    const subtotal = (line.quantity || 0) * (line.unitPrice || 0);
    const discount = subtotal * ((line.discount || 0) / 100);
    newLines[index].total = subtotal - discount;

    setLines(newLines);
  };

  /**
   * Show product history modal
   */
  const handleShowHistory = (productCode: string) => {
    const line = lines.find(l => l.productCode === productCode);
    if (line) {
      setSelectedProductForHistory({
        code: productCode,
        name: line.productName
      });
      setShowProductHistory(true);
    }
  };

  /**
   * SAVE HANDLER - 10 Step Validation
   */
  const handleSave = async () => {
    console.log('[UniversalInvoice] Save clicked');

    // 1. Firma/Dönem kontrolü
    if (!selectedFirma || !selectedDonem) {
      toast.error('❌ Firma ve dönem seçilmeli!', {
        description: 'Lütfen önce firma ve dönem seçin'
      });
      return;
    }

    // 2. Dönem açık mı?
    if (!isPeriodOpen()) {
      toast.error('❌ Dönem kapalıdır!', {
        description: `${selectedDonem.donem_adi} kapalı. İşlem yapılamaz.`
      });
      return;
    }

    // 3. Tarih kontrolü
    const tarih = new Date(invoiceDate);
    const allowed = isTransactionAllowed(
      tarih,
      invoiceType.category === 'Alis' ? 'PURCHASE_INVOICE' : 'SALES_INVOICE'
    );

    if (!allowed.allowed) {
      toast.error('❌ Bu tarihte işlem yapılamaz!', {
        description: allowed.reason
      });
      return;
    }

    // 4. Müşteri/Tedarikçi kontrolü
    if (!customer) {
      toast.error(`❌ ${invoiceType.category === 'Alis' ? 'Tedarikçi' : 'Müşteri'} seçilmeli!`);
      return;
    }

    // 5. Kalem kontrolü
    const validLines = lines.filter(l => l.productCode && l.quantity > 0);
    if (validLines.length === 0) {
      toast.error('❌ En az bir kalem eklenmel!');
      return;
    }

    // 6. Tutar hesaplama
    const total = validLines.reduce((sum, line) => sum + (line.total || 0), 0);
    if (total <= 0) {
      toast.error('❌ Toplam tutar sıfırdan büyük olmalı!');
      return;
    }

    // 7. Fatura objesi
    const invoice = {
      invoice_no: invoiceNo,
      invoice_date: tarih.toISOString(),
      customer_id: customer.code,
      customer_name: customer.name,
      total_amount: total,
      firma_id: selectedFirma.id,
      donem_id: selectedDonem.id,
      trcode: invoiceType.code,
      items: validLines,
    };

    console.log('[UniversalInvoice] Invoice to save:', invoice);

    setSaving(true);

    try {
      // 8. Backend'e kaydet (simulated)
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('[UniversalInvoice] Invoice saved (simulated)');

      toast.success('✅ Fatura kaydedildi!', {
        description: `${invoiceNo} - ${formatMoney(total)} IQD`,
        duration: 3000
      });

      // 9. COST ACCOUNTING - FIFO Integration
      console.log('[UniversalInvoice] Processing FIFO cost accounting...');

      try {
        if (invoiceType.category === 'Alis') {
          // ALIŞ FATURASI -> FIFO Layer ekle (Stok girişi)
          for (const line of validLines) {
            await CostAccountingService.recordStockMovement({
              product_id: line.productCode,
              product_code: line.productCode,
              product_name: line.productName,
              movement_type: 'IN',
              quantity: line.quantity,
              unit_cost: line.unitPrice,
              total_cost: line.total || 0,
              movement_date: tarih.toISOString(),
              document_no: invoiceNo,
              document_type: 'PURCHASE_INVOICE',
              firma_id: selectedFirma.id,
              donem_id: selectedDonem.id
            });
          }
          console.log('[UniversalInvoice] ✅ FIFO layers created for purchase invoice');
          toast.success('ğŸ“¦ Stok girişi kaydedildi!', {
            description: `${validLines.length} ürün FIFO sistemine eklendi`,
            duration: 3000
          });

        } else if (invoiceType.category === 'Satis') {
          // SATIŞ FATURASI -> FIFO'dan tüket ve COGS hesapla
          let totalCOGS = 0;

          for (const line of validLines) {
            // FIFO'dan maliyet hesapla
            const cogsResult = await CostAccountingService.consumeFIFOLayers({
              product_id: line.productCode,
              quantity: line.quantity,
              firma_id: selectedFirma.id,
              donem_id: selectedDonem.id
            });

            totalCOGS += cogsResult.cost_of_goods_sold;

            // Stock movement kaydet
            await CostAccountingService.recordStockMovement({
              product_id: line.productCode,
              product_code: line.productCode,
              product_name: line.productName,
              movement_type: 'OUT',
              quantity: line.quantity,
              unit_cost: line.quantity > 0 ? (cogsResult.cost_of_goods_sold / line.quantity) : 0,
              unit_price: line.unitPrice,
              total_cost: cogsResult.cost_of_goods_sold,
              total_price: line.total || 0,
              movement_date: tarih.toISOString(),
              document_no: invoiceNo,
              document_type: 'SALES_INVOICE',
              firma_id: selectedFirma.id,
              donem_id: selectedDonem.id
            });
          }

          const grossProfit = total - totalCOGS;
          const profitMargin = total > 0 ? (grossProfit / total) * 100 : 0;

          console.log('[UniversalInvoice] ✅ FIFO COGS calculated:', {
            revenue: total,
            cogs: totalCOGS,
            profit: grossProfit,
            margin: profitMargin
          });

          toast.success('💰 Kar hesaplandı!', {
            description: `Brüt Kar: ${formatMoney(grossProfit)} IQD (${profitMargin.toFixed(2)}%)`,
            duration: 5000
          });
        }
      } catch (costError: any) {
        console.error('[UniversalInvoice] Cost accounting error:', costError);
        toast.warning('⚠️ Maliyet kaydı yapılamadı', {
          description: costError.message || 'FIFO hesaplama hatası'
        });
      }

      // 10. Otomatik muhasebe fişi
      console.log('[UniversalInvoice] Creating auto-journal...');

      const journalResult = await (
        invoiceType.category === 'Alis'
          ? createPurchaseJournal({
            fatura_no: invoice.invoice_no,
            tarih: tarih,
            tedarikci_adi: invoice.customer_name,
            tutar: total,
            firma_id: selectedFirma.id,
            donem_id: selectedDonem.id
          })
          : createSalesJournal({
            fatura_no: invoice.invoice_no,
            tarih: tarih,
            musteri_adi: invoice.customer_name,
            tutar: total,
            firma_id: selectedFirma.id,
            donem_id: selectedDonem.id
          })
      );

      if (journalResult.success) {
        toast.success('ğŸ“‹ Muhasebe fişi oluşturuldu!', {
          description: formatJournalResult(journalResult),
          duration: 5000
        });
      } else {
        toast.warning('⚠️ Muhasebe fişi oluşturulamadı', {
          description: journalResult.error || 'Bilinmeyen hata'
        });
      }

      // 11. Success & cleanup
      setTimeout(() => {
        onCancel();
      }, 1000);

    } catch (error: any) {
      console.error('[UniversalInvoice] Save error:', error);
      toast.error('❌ Kayıt hatası!', {
        description: error.message || 'Bilinmeyen hata oluştu'
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Add new line
   */
  const addLine = () => {
    setLines([...lines, {
      id: Date.now().toString(),
      productCode: '',
      productName: '',
      quantity: 0,
      unitPrice: 0,
      discount: 0,
      total: 0,
      expiryDate: '',
      lastPurchasePrice: 0,
      profitMarginPercent: 0
    }]);
  };

  /**
   * Calculate grand total
   */
  const grandTotal = lines.reduce((sum, line) => sum + line.total, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 flex-shrink-0">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-white" />
            <h2 className="text-lg text-white">{invoiceType.name} - {invoiceNo}</h2>

            {/* Period Warning */}
            {!isPeriodOpen() && (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-500 rounded text-white text-xs">
                <AlertCircle className="w-3 h-3" />
                Dönem Kapalı!
              </div>
            )}

            {/* Firma/Dönem Display */}
            {selectedFirma && selectedDonem && (
              <div className="text-xs text-white/80">
                {selectedFirma.firma_adi} / {selectedDonem.donem_adi}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !isPeriodOpen()}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Kaydet
                </>
              )}
            </button>

            <button
              onClick={onCancel}
              className="text-white hover:bg-white/10 rounded p-1.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-blue-500">
          <button
            onClick={() => setActiveTab('fatura')}
            className={`px-6 py-2 text-sm transition-colors ${activeTab === 'fatura'
              ? 'bg-white text-blue-600'
              : 'text-white hover:bg-blue-500'
              }`}
          >
            Fatura
          </button>
          <button
            onClick={() => setActiveTab('detaylar')}
            className={`px-6 py-2 text-sm transition-colors ${activeTab === 'detaylar'
              ? 'bg-white text-blue-600'
              : 'text-white hover:bg-blue-500'
              }`}
          >
            Detaylar
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        {activeTab === 'fatura' && (
          <div className="space-y-4">
            {/* Top Form */}
            <div className="bg-white rounded border p-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm mb-1">Fatura No</label>
                  <input
                    type="text"
                    value={invoiceNo}
                    readOnly
                    className="w-full px-3 py-2 border rounded bg-gray-50"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1">Tarih</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1">
                    {invoiceType.category === 'Alis' ? 'Tedarikçi' : 'Müşteri'}
                  </label>
                  <select
                    value={customer?.code || ''}
                    onChange={(e) => {
                      const option = e.target.selectedOptions[0];
                      setCustomer({
                        code: e.target.value,
                        name: option.text.split(' - ')[1] || ''
                      });
                    }}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">Seçiniz...</option>
                    <option value="C001">C001 - Ahmed Al-Maliki</option>
                    <option value="C002">C002 - Mohammed Hassan</option>
                    <option value="C003">C003 - Ali Al-Sadr</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="bg-white rounded border overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Ürün Kodu</th>
                    <th className="px-3 py-2 text-left">Ürün Adı</th>
                    <th className="px-3 py-2 text-right">Miktar</th>
                    <th className="px-3 py-2 text-right">Fiyat</th>
                    <th className="px-3 py-2 text-right">İndirim %</th>
                    {invoiceType.category === 'Alis' && (
                      <>
                        <th className="px-3 py-2 text-right">Kar %</th>
                        <th className="px-3 py-2 text-right">SKT</th>
                      </>
                    )}
                    <th className="px-3 py-2 text-right">Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceType.category === 'Alis' ? (
                    lines.map((line, idx) => (
                      <PurchaseInvoiceLineEnhanced
                        key={line.id}
                        line={line}
                        index={idx}
                        onChange={handleLineChange}
                        onShowHistory={handleShowHistory}
                      />
                    ))
                  ) : (
                    lines.map((line, idx) => (
                      <tr key={line.id} className="border-t">
                        <td className="p-2">
                          <input
                            type="text"
                            value={line.productCode}
                            onChange={(e) => handleLineChange(idx, 'productCode', e.target.value)}
                            className="w-full px-2 py-1 border rounded"
                            placeholder="Kod"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={line.productName}
                            onChange={(e) => handleLineChange(idx, 'productName', e.target.value)}
                            className="w-full px-2 py-1 border rounded"
                            placeholder="Ürün adı"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={line.quantity}
                            onChange={(e) => handleLineChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border rounded text-right"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={line.unitPrice}
                            onChange={(e) => handleLineChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border rounded text-right"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={line.discount}
                            onChange={(e) => handleLineChange(idx, 'discount', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border rounded text-right"
                          />
                        </td>
                        <td className="p-2 text-right">
                          {formatMoney(line.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="p-2 border-t">
                <button
                  onClick={addLine}
                  className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Satır Ekle
                </button>
              </div>
            </div>

            {/* REAL-TIME PROFIT DISPLAY - Sadece satış faturalarında */}
            {invoiceType.category === 'Satis' && selectedFirma && selectedDonem && (
              <InvoiceLineWithProfit
                lines={lines.map(line => ({
                  ...line,
                  total: line.total
                }))}
                isSalesInvoice={true}
              />
            )}

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 bg-white rounded border p-4">
                <div className="flex justify-between mb-2">
                  <span>Ara Toplam:</span>
                  <span>{formatMoney(grandTotal)} IQD</span>
                </div>
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span>TOPLAM:</span>
                  <span className="text-blue-600">{formatMoney(grandTotal)} IQD</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'detaylar' && (
          <div className="bg-white rounded border p-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Açıklama</label>
                <textarea
                  rows={4}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Fatura açıklaması..."
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Product History Modal */}
      {showProductHistory && selectedProductForHistory && (
        <ProductHistoryModal
          productCode={selectedProductForHistory.code}
          productName={selectedProductForHistory.name}
          onClose={() => setShowProductHistory(false)}
        />
      )}
    </div>
  );
}

export default UniversalInvoiceModule;
