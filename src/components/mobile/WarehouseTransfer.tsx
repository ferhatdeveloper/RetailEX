/**
 * Mobile Warehouse Transfer
 * Pattern: Parameter-driven workflow
 * Features: Transfer between warehouses with approval control
 */

import { useState, useEffect } from 'react';
import { Camera, ArrowRight, Check, Clock, Package } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { warehouseService, type Warehouse } from '../../services/warehouseService';

// System parameters
interface SystemParameters {
  require_transfer_approval: boolean;
  approval_threshold: number; // Transfer değeri bu tutarın üstündeyse onay gerekli
  allow_negative_stock: boolean;
}

interface TransferItem {
  id: string;
  barcode: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  scanned_at: string;
}

interface TransferSession {
  id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  items: TransferItem[];
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'COMPLETED';
  requires_approval: boolean;
  total_value: number;
  created_by: string;
  created_at: string;
}

export function WarehouseTransfer() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [session, setSession] = useState<TransferSession | null>(null);
  const [systemParams, setSystemParams] = useState<SystemParameters>({
    require_transfer_approval: true, // Varsayılan: Onay gerekli
    approval_threshold: 5000, // 5000 TL üstü onay
    allow_negative_stock: false
  });
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [fromWarehouse, setFromWarehouse] = useState<string>('');
  const [toWarehouse, setToWarehouse] = useState<string>('');

  // Load warehouses
  useEffect(() => {
    const whs = warehouseService.getWarehouses();
    setWarehouses(whs);
  }, []);

  // Load system parameters (from API or localStorage)
  useEffect(() => {
    const saved = localStorage.getItem('system_parameters');
    if (saved) {
      setSystemParams(JSON.parse(saved));
    }
  }, []);

  // Load session
  useEffect(() => {
    const saved = localStorage.getItem('transfer_session');
    if (saved) {
      setSession(JSON.parse(saved));
    }
  }, []);

  // Save session
  useEffect(() => {
    if (session) {
      localStorage.setItem('transfer_session', JSON.stringify(session));
    }
  }, [session]);

  // Start transfer
  const startTransfer = () => {
    if (!fromWarehouse || !toWarehouse) {
      toast.error('Kaynak ve hedef depo seçin');
      return;
    }

    if (fromWarehouse === toWarehouse) {
      toast.error('Aynı depo seçilemez');
      return;
    }

    const newSession: TransferSession = {
      id: `tr-${Date.now()}`,
      from_warehouse_id: fromWarehouse,
      to_warehouse_id: toWarehouse,
      items: [],
      status: 'DRAFT',
      requires_approval: false, // Will be determined when completing
      total_value: 0,
      created_by: 'user-1',
      created_at: new Date().toISOString()
    };

    setSession(newSession);
    toast.success('Transfer başlatıldı');
  };

  // Scan product
  const handleScan = async (barcode: string) => {
    if (!session) {
      toast.error('Önce transfer başlatın');
      return;
    }

    // Check if already added
    const existing = session.items.find(item => item.barcode === barcode);

    if (existing) {
      // Increment quantity
      const updatedItems = session.items.map(item =>
        item.barcode === barcode
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );

      updateSession({ items: updatedItems });
      toast.success(`${existing.product_name} - Miktar: ${existing.quantity + 1}`);
    } else {
      // Fetch product
      const product = await fetchProduct(barcode);

      if (!product) {
        toast.error('Ürün bulunamadı');
        return;
      }

      // Check stock availability
      const stockCheck = warehouseService.checkAvailability(
        session.from_warehouse_id,
        product.id,
        1
      );

      if (!stockCheck.available && !systemParams.allow_negative_stock) {
        toast.error(`Yetersiz stok: ${stockCheck.message}`);
        return;
      }

      const newItem: TransferItem = {
        id: `item-${Date.now()}`,
        barcode,
        product_code: product.code,
        product_name: product.name,
        quantity: 1,
        unit_price: product.price,
        scanned_at: new Date().toISOString()
      };

      updateSession({ items: [...session.items, newItem] });
      toast.success(`${product.name} eklendi`);
    }

    setScannedBarcode('');
  };

  // Mock product fetch
  const fetchProduct = async (barcode: string): Promise<any> => {
    await new Promise(resolve => setTimeout(resolve, 300));

    return {
      id: `prod-${barcode}`,
      code: `P${barcode}`,
      name: `Ürün ${barcode}`,
      price: Math.floor(Math.random() * 1000) + 50
    };
  };

  // Update session
  const updateSession = (updates: Partial<TransferSession>) => {
    if (!session) return;

    const updatedSession = { ...session, ...updates };

    // Recalculate total value
    const total = updatedSession.items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0
    );

    updatedSession.total_value = total;

    setSession(updatedSession);
  };

  // Update item quantity
  const updateQuantity = (itemId: string, newQuantity: number) => {
    if (!session) return;

    if (newQuantity <= 0) {
      // Remove item
      const updatedItems = session.items.filter(item => item.id !== itemId);
      updateSession({ items: updatedItems });
      toast.info('Ürün kaldırıldı');
    } else {
      const updatedItems = session.items.map(item =>
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      );

      updateSession({ items: updatedItems });
    }
  };

  // Submit transfer
  const submitTransfer = async () => {
    if (!session || session.items.length === 0) {
      toast.error('Transfer listesi boş');
      return;
    }

    // Check if approval required
    const requiresApproval =
      systemParams.require_transfer_approval &&
      session.total_value > systemParams.approval_threshold;

    const newStatus = requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED';

    // Create transfer via service
    const result = await warehouseService.createTransfer(
      session.from_warehouse_id,
      session.to_warehouse_id,
      session.items.map(item => ({
        product_id: item.id,
        product_code: item.product_code,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.quantity * item.unit_price
      })),
      session.created_by,
      'Mobil transfer'
    );

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    if (requiresApproval) {
      toast.info(
        `Transfer ${systemParams.approval_threshold} TL üstünde olduğu için onaya gönderildi`,
        { duration: 4000 }
      );
    } else {
      toast.success('Transfer başarıyla oluşturuldu ve işleniyor');
    }

    // Clear session
    localStorage.removeItem('transfer_session');
    setSession(null);
    setFromWarehouse('');
    setToWarehouse('');
  };

  // Cancel transfer
  const cancelTransfer = () => {
    if (confirm('Transferi iptal etmek istediğinizden emin misiniz?')) {
      localStorage.removeItem('transfer_session');
      setSession(null);
      setFromWarehouse('');
      setToWarehouse('');
      toast.info('Transfer iptal edildi');
    }
  };

  // Warehouse select screen
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Package className="w-12 h-12 text-blue-600" />
                <ArrowRight className="w-6 h-6 text-gray-400" />
                <Package className="w-12 h-12 text-green-600" />
              </div>
              <h1 className="text-xl mb-2">Depo Transferi</h1>
              <p className="text-sm text-gray-600">Depolar arası ürün transferi</p>
            </div>

            {/* System info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="font-medium">Sistem Parametreleri</span>
              </div>
              <div className="space-y-1 text-gray-700">
                <div>• Onay Gerekliliği: {systemParams.require_transfer_approval ? 'Aktif' : 'Pasif'}</div>
                {systemParams.require_transfer_approval && (
                  <div>• Onay Limiti: {systemParams.approval_threshold.toLocaleString()} TL</div>
                )}
                <div>• Eksi Stok: {systemParams.allow_negative_stock ? 'İzinli' : 'İzinsiz'}</div>
              </div>
            </div>

            {/* From warehouse */}
            <div className="mb-4">
              <label className="block text-sm text-gray-700 mb-2">Kaynak Depo</label>
              <select
                value={fromWarehouse}
                onChange={(e) => setFromWarehouse(e.target.value)}
                className="w-full px-4 py-3 border rounded-lg text-base"
              >
                <option value="">Depo seçin</option>
                {warehouses.map(wh => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name} ({wh.code})
                  </option>
                ))}
              </select>
            </div>

            {/* To warehouse */}
            <div className="mb-6">
              <label className="block text-sm text-gray-700 mb-2">Hedef Depo</label>
              <select
                value={toWarehouse}
                onChange={(e) => setToWarehouse(e.target.value)}
                className="w-full px-4 py-3 border rounded-lg text-base"
              >
                <option value="">Depo seçin</option>
                {warehouses.map(wh => (
                  <option key={wh.id} value={wh.id} disabled={wh.id === fromWarehouse}>
                    {wh.name} ({wh.code})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={startTransfer}
              disabled={!fromWarehouse || !toWarehouse}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
            >
              Transfer Başlat
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Transfer screen
  const fromWh = warehouses.find(w => w.id === session.from_warehouse_id);
  const toWh = warehouses.find(w => w.id === session.to_warehouse_id);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <h1 className="text-lg mb-2">Depo Transferi</h1>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span>{fromWh?.name}</span>
            <ArrowRight className="w-4 h-4" />
            <span>{toWh?.name}</span>
          </div>
          <div className="bg-blue-700 px-2 py-1 rounded">
            {session.total_value.toLocaleString()} TL
          </div>
        </div>
      </div>

      {/* Approval warning */}
      {systemParams.require_transfer_approval &&
        session.total_value > systemParams.approval_threshold && (
          <div className="bg-orange-50 border-l-4 border-orange-500 p-3 text-xs">
            <div className="flex items-center gap-2 text-orange-700">
              <Clock className="w-4 h-4" />
              <span>Bu transfer {systemParams.approval_threshold.toLocaleString()} TL üstünde olduğu için onay gerektirecek</span>
            </div>
          </div>
        )}

      {/* Scanner */}
      <div className="p-4 bg-white border-b">
        <div className="flex gap-2">
          <input
            type="text"
            value={scannedBarcode}
            onChange={(e) => setScannedBarcode(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && scannedBarcode) {
                handleScan(scannedBarcode);
              }
            }}
            placeholder="Barkod okutun"
            className="flex-1 px-4 py-3 border rounded-lg text-base"
          />
          <button className="bg-blue-600 text-white px-4 rounded-lg">
            <Camera className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {session.items.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Ürün eklemek için barkod okutun</p>
          </div>
        ) : (
          session.items.map((item) => (
            <div key={item.id} className="bg-white rounded-lg p-3 border shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="text-sm mb-1">{item.product_name}</div>
                  <div className="text-xs text-gray-600">{item.product_code}</div>
                </div>
                <div className="text-sm text-blue-600">
                  {(item.quantity * item.unit_price).toLocaleString()} TL
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
                >
                  -
                </button>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                  className="w-20 px-2 py-1 border rounded text-center"
                />
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
                >
                  +
                </button>
                <div className="flex-1 text-right text-xs text-gray-600">
                  @ {item.unit_price.toLocaleString()} TL
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="bg-white border-t p-4 space-y-2">
        <button
          onClick={submitTransfer}
          disabled={session.items.length === 0}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" />
          Transfer Gönder
        </button>

        <button
          onClick={cancelTransfer}
          className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300"
        >
          İptal
        </button>
      </div>
    </div>
  );
}

