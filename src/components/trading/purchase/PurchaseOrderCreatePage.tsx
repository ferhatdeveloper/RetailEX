import { useState, useEffect } from 'react';
import {
  ArrowLeft, Save, Calendar, User, ClipboardList,
  Package, Search, Plus, Trash2, CheckCircle2,
  Building, Info, Clock, X, FileText, ChevronDown, ChevronRight,
  MoreVertical, Barcode, AlertCircle, History
} from 'lucide-react';
import { SupplierHistoryModal } from '../contacts/SupplierHistoryModal';
import { APP_VERSION } from '../../../core/version';
import type { Product } from '../../../App';
import { supplierAPI, Supplier } from '../../../services/api/suppliers';
import { purchaseOrderAPI } from '../../../services/purchaseOrderAPI';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';

interface PurchaseOrderCreatePageProps {
  products: Product[];
  onBack: () => void;
  onSuccess: () => void;
}

interface OrderItem {
  id: string;
  productId: string;
  code: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
  supplierId: string;
}

export function PurchaseOrderCreatePage({ products, onBack, onSuccess }: PurchaseOrderCreatePageProps) {
  const [activeTab, setActiveTab] = useState<'siparis' | 'detaylar' | 'ekler'>('siparis');
  const [isFormExpanded, setIsFormExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const { tm } = useLanguage();

  // Header States
  const [orderNo, setOrderNo] = useState(`SIP-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
  const [documentNo, setDocumentNo] = useState('');

  // Supplier & Payment States
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedSupplierName, setSelectedSupplierName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  // Details States
  const [priority, setPriority] = useState<'normal' | 'urgent' | 'critical'>('normal');
  const [description, setDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');

  // Items State
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [showProductSearchModal, setShowProductSearchModal] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // Supplier History State
  const [showSupplierHistory, setShowSupplierHistory] = useState(false);
  const [selectedSupplierHistory, setSelectedSupplierHistory] = useState<{ id: string, name: string } | null>(null);

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      const data = await supplierAPI.getAll();
      setSuppliers(data);
    } catch (error) {
      console.error('Error loading suppliers:', error);
      toast.error('Tedarikçiler yüklenirken hata oluştu');
    }
  };

  const handleCreateOrder = async (status: 'draft' | 'approved' = 'draft') => {
    // Global supplier validation removed per user request (Line-level suppliers used)
    /*
    if (!selectedSupplierId) {
      toast.error('Lütfen tedarikçi seçin!');
      return;
    }
    */

    const validItems = orderItems.filter(i => i.name && i.quantity > 0);
    if (validItems.length === 0) {
      toast.error('Lütfen en az bir geçerli ürün ekleyin!');
      return;
    }

    setLoading(true);

    try {
      // Use the first item's supplier as the main supplier for the order header if global is missing
      const derivedSupplierId = orderItems.find(i => (i as any).supplierId)?.supplierId || selectedSupplierId || 'UNKNOWN';

      const orderData = {
        supplier_id: derivedSupplierId,
        delivery_date: deliveryDate || undefined,
        total_amount: calculateTotal(),
        notes: `${description} ${notes}`.trim(),
        payment_method: paymentMethod || 'Açık Hesap (Cari)',
      };

      const itemsData = validItems.map((item) => ({
        product_id: item.productId || 'UNKNOWN',
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
      }));

      await purchaseOrderAPI.create(orderData, itemsData);

      toast.success(status === 'approved' ? 'Sipariş onaya gönderildi!' : 'Sipariş taslak olarak kaydedildi!');
      APP_VERSION.increment();
      onSuccess();
    } catch (error: any) {
      console.error('❌ Satın alma siparişi oluşturma hatası:', error);
      toast.error('Hata: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  };

  const handleAddItem = () => {
    setOrderItems([
      ...orderItems,
      {
        id: Date.now().toString(),
        productId: '',
        code: '',
        name: '',
        quantity: 1,
        unit: 'Adet',
        price: 0,
        total: 0,
        supplierId: ''
      }
    ]);
  };

  const removeItem = (id: string) => {
    setOrderItems(orderItems.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof OrderItem, value: any) => {
    setOrderItems(orderItems.map(item => {
      if (item.id === id) {
        return {
          ...item,
          [field]: value,
          total: field === 'quantity' ? value * item.price : field === 'price' ? item.quantity * value : item.total
        };
      }
      return item;
    }));
  };

  const handleProductSelect = (product: Product) => {
    setOrderItems([...orderItems, {
      id: Date.now().toString(),
      productId: product.id,
      code: product.barcode,
      name: product.name,
      quantity: 1,
      unit: product.unit || 'Adet',
      price: product.price,
      total: product.price,
      supplierId: ''
    }]);
    setShowProductSearchModal(false);
    setProductSearchTerm('');
    toast.success('Ürün eklendi');
  };

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      setSelectedSupplierId(supplier.id);
      setSelectedSupplierName(supplier.name);
    } else {
      setSelectedSupplierId('');
      setSelectedSupplierName('');
    }
  };
  const handleAddFromHistory = (historyItems: any[]) => {
    const newItems = historyItems.map(hItem => ({
      id: Date.now().toString() + Math.random().toString().slice(2, 5),
      productId: '', // History item doesn't always map to a product ID directly in this mock
      code: '',
      name: hItem.product,
      quantity: hItem.quantity,
      unit: hItem.unit,
      price: hItem.price,
      total: hItem.total,
      supplierId: selectedSupplierHistory?.id || '', // Assign selected supplier
    }));
    setOrderItems(prev => [...prev, ...newItems]);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
    p.barcode.includes(productSearchTerm)
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header with Tabs (Matches UniversalInvoiceForm style) */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 flex-shrink-0">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-5 h-5 text-white" />
            <h2 className="text-lg text-white">{tm('purchaseOrder')} - {orderNo}</h2>
            <div className="flex items-center gap-2 px-3 py-1 bg-purple-500 rounded text-white text-xs">
              <Info className="w-3 h-3" />
              {tm('draft')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCreateOrder('approved')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-400 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {tm('sendForApproval')}
            </button>
            <button
              onClick={() => handleCreateOrder('draft')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {tm('save')}
            </button>
            <div className="w-px h-6 bg-white/20 mx-1" />
            <button
              onClick={onBack}
              className="text-white hover:bg-white/10 rounded p-1.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-white/20">
          {[
            { id: 'siparis', label: tm('orderInfo') },
            { id: 'detaylar', label: tm('details') },
            { id: 'ekler', label: tm('attachments') }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-2 text-sm transition-colors ${activeTab === tab.id
                ? 'bg-white text-gray-900'
                : 'text-white hover:bg-white/10'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="p-6">
          {activeTab === 'siparis' && (
            <>
              {/* Form Area - 4 Columns like UniversalInvoiceForm */}
              <div className="bg-white rounded border border-gray-200 p-3 mb-3">
                <button
                  onClick={() => setIsFormExpanded(!isFormExpanded)}
                  className="w-full flex items-center justify-between mb-3 pb-2 border-b border-gray-200 hover:bg-gray-50 -mx-3 px-3 py-2 rounded transition-colors"
                >
                  <span className="text-sm font-medium text-gray-700">{tm('orderInfo')}</span>
                  {isFormExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  )}
                </button>

                {isFormExpanded && (
                  <div className="grid grid-cols-3 gap-3">
                    {/* Column 1 - Belge Bilgileri */}
                    <div className="space-y-3">
                      <div>
                        <label className="block mb-1 text-gray-700 text-xs">{tm('orderNo')}</label>
                        <input
                          type="text"
                          value={orderNo}
                          readOnly
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-700 text-xs">{tm('date')}</label>
                        <div className="flex gap-1">
                          <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                          <button className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                            <Calendar className="w-4 h-4 text-gray-600" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-700 text-xs">{tm('time')}</label>
                        <input
                          type="text"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-700 text-xs">{tm('priority')}</label>
                        <select
                          value={priority}
                          onChange={(e) => setPriority(e.target.value as any)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                        >
                          <option value="normal">{tm('normal')}</option>
                          <option value="urgent">{tm('urgent')}</option>
                          <option value="critical">{tm('critical')}</option>
                        </select>
                      </div>
                    </div>

                    {/* Column 2 - Ek Bilgiler */}
                    <div className="space-y-3">
                      <div>
                        <label className="block mb-1 text-gray-700 text-xs">{tm('deliveryDate')}</label>
                        <div className="flex gap-1">
                          <input
                            type="date"
                            value={deliveryDate}
                            onChange={(e) => setDeliveryDate(e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-700 text-xs">{tm('documentNo')}</label>
                        <input
                          type="text"
                          value={documentNo}
                          onChange={(e) => setDocumentNo(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                          placeholder="Dış Belge No"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-700 text-xs">{tm('barcode')}</label>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                            placeholder="Barkod..."
                          />
                          <button className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                            <Barcode className="w-4 h-4 text-gray-600" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Column 3 - Ödeme ve Diğer (Previously Column 4) */}
                    <div className="space-y-3">
                      <div>
                        <label className="block mb-1 text-gray-700 text-xs">{tm('payments')}</label>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={paymentMethod || 'Açık Hesap (Cari)'}
                            readOnly
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                            placeholder="Ödeme bilgileri"
                          />
                          <button className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                            <MoreVertical className="w-4 h-4 text-gray-600" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-700 text-xs">{tm('description')}</label>
                        <textarea
                          rows={3}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Items Grid */}
              <div className="bg-white rounded border border-gray-200 flex-1 overflow-hidden flex flex-col min-h-[400px]">
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Package className="w-4 h-4 text-purple-600" />
                    {tm('orderItems')}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowProductSearchModal(true)}
                      className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 bg-purple-50 px-2 py-1 rounded border border-purple-200 hover:bg-purple-100"
                    >
                      <Search className="w-3 h-3" />
                      {tm('addProduct')} (F10)
                    </button>
                    <button
                      onClick={handleAddItem}
                      className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 bg-purple-50 px-2 py-1 rounded border border-purple-200 hover:bg-purple-100"
                    >
                      <Plus className="w-3 h-3" />
                      {tm('addLine')}
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                      <tr>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase border-r border-b border-gray-200 w-10">#</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase border-r border-b border-gray-200 w-32">{tm('code')}</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase border-r border-b border-gray-200">{tm('description')}</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase border-r border-b border-gray-200 w-40 text-purple-700 bg-purple-50/50">{tm('supplier')}</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase border-r border-b border-gray-200 w-24 text-center">{tm('quantity')}</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase border-r border-b border-gray-200 w-24">{tm('unit')}</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase border-r border-b border-gray-200 w-32 text-right">{tm('unitPrice')}</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase border-r border-b border-gray-200 w-32 text-right">{tm('amount')}</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase border-b border-gray-200 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {orderItems.map((item, index) => (
                        <tr key={item.id} className="hover:bg-purple-50/50 transition-colors group">
                          <td className="px-3 py-2 text-xs text-gray-400 border-r border-gray-100 text-center">{index + 1}</td>
                          <td className="p-0 border-r border-gray-100">
                            <input
                              type="text"
                              value={item.code}
                              onChange={(e) => updateItem(item.id, 'code', e.target.value)}
                              className="w-full h-full px-3 py-2 text-xs focus:outline-none focus:bg-purple-50 font-mono bg-transparent"
                              placeholder="..."
                            />
                          </td>
                          <td className="p-0 border-r border-gray-100">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                              className="w-full h-full px-3 py-2 text-xs focus:outline-none focus:bg-purple-50 bg-transparent"
                            />
                          </td>
                          <td className="p-0 border-r border-gray-100 bg-purple-50/20 relative">
                            <select
                              className="w-full h-full px-3 py-2 text-xs focus:outline-none focus:bg-purple-50 bg-transparent appearance-none font-medium text-gray-700"
                              value={(item as any).supplierId || ''}
                              onChange={(e) => updateItem(item.id, 'supplierId' as any, e.target.value)}
                            >
                              <option value="">{tm('select')}...</option>
                              {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}

                            </select>
                            {(item as any).supplierId && (
                              <button
                                onClick={() => {
                                  const supplier = suppliers.find(s => s.id === (item as any).supplierId);
                                  if (supplier) {
                                    setSelectedSupplierHistory({ id: supplier.id, name: supplier.name });
                                    setShowSupplierHistory(true);
                                  }
                                }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-purple-600 hover:bg-white rounded-full transition-all z-10"
                                title="Tedarikçi Geçmişi"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                          <td className="p-0 border-r border-gray-100">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value))}
                              className="w-full h-full px-3 py-2 text-xs text-center focus:outline-none focus:bg-purple-50 font-medium bg-transparent"
                            />
                          </td>
                          <td className="p-0 border-r border-gray-100">
                            <select
                              value={item.unit}
                              onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                              className="w-full h-full px-3 py-2 text-xs focus:outline-none focus:bg-purple-50 bg-transparent appearance-none"
                            >
                              <option value="Adet">Adet</option>
                              <option value="Kg">Kg</option>
                              <option value="Metre">Metre</option>
                              <option value="Kutu">Kutu</option>
                            </select>
                          </td>
                          <td className="p-0 border-r border-gray-100">
                            <input
                              type="number"
                              value={item.price}
                              onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value))}
                              className="w-full h-full px-3 py-2 text-xs text-right focus:outline-none focus:bg-purple-50 font-mono bg-transparent"
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-medium text-gray-700 bg-gray-50/50 border-r border-gray-100">
                            {item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="text-center p-1">
                            <button
                              onClick={() => removeItem(item.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {/* Empty row for adding new items easily (Invoice style often has an empty row at bottom) */}
                      <tr onClick={handleAddItem} className="cursor-pointer hover:bg-gray-50 border-t border-dashed border-gray-200">
                        <td colSpan={9} className="px-3 py-2 text-xs text-gray-400 italic text-center">
                          + {tm('clickToAddRow')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Footer Totals */}
                <div className="bg-gray-50 border-t border-gray-200 px-4 py-3">
                  <div className="flex justify-end gap-6 text-sm">
                    <div className="text-gray-500">{tm('subTotal')}: <span className="text-gray-900 font-medium">{calculateTotal().toLocaleString()}</span></div>
                    <div className="text-gray-500">TAX/Vergi: <span className="text-gray-900 font-medium">0.00</span></div>
                    <div className="font-bold text-gray-800 text-base">{tm('grandTotal')}: <span className="text-purple-600">{calculateTotal().toLocaleString()} IQD</span></div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'detaylar' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <div className="max-w-md mx-auto space-y-4">
                <div className="grid grid-cols-1 gap-4 text-left">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Ek Notlar</label>
                    <textarea
                      rows={6}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={tm('orderNotes')}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ekler' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="max-w-xs mx-auto space-y-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
                  <Package className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-700">{tm('noFile')}</h4>
                  <p className="text-xs text-gray-500 mt-1">{tm('dragDropOrSelect')}</p>
                </div>
              </div>
            </div>

          )}
        </div>
      </div>

      {
        showProductSearchModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-800">{tm('productSelection')}</h3>
                <button onClick={() => setShowProductSearchModal(false)} className="p-1 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 border-b border-gray-100 bg-gray-50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    autoFocus
                    placeholder={tm('searchProductPlaceholder')}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={productSearchTerm}
                    onChange={e => setProductSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-auto p-2">
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">{tm('productNotFound')}</div>
                ) : (
                  <div className="space-y-1">
                    {filteredProducts.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleProductSelect(product)}
                        className="w-full text-left p-3 hover:bg-purple-50 rounded-lg border border-transparent hover:border-purple-100 transition-all flex items-center justify-between group"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{product.name}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded">{product.barcode}</span>
                            <span>{tm('stock')}: <span className={product.stock > 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{product.stock}</span></span>
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-purple-400 group-hover:text-purple-600" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }


      {
        showSupplierHistory && (
          <SupplierHistoryModal
            isOpen={showSupplierHistory}
            onClose={() => setShowSupplierHistory(false)}
            supplierName={selectedSupplierHistory?.name || ''}
            onAddItems={handleAddFromHistory}
          />
        )
      }
    </div >
  );
}

