import React, { useState, useEffect } from 'react';
import { Package, TrendingUp, TrendingDown, ArrowRight, Filter, Calendar, Loader2 } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import { postgres } from '../../services/postgres';

interface Movement {
  id: string;
  date: string;
  productCode: string;
  productName: string;
  type: 'purchase' | 'sale' | 'transfer' | 'adjustment' | 'return';
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  warehouse: string;
  reference: string;
  note?: string;
}

interface Warehouse {
  id: string;
  name: string;
}

// Map DB movement_type to UI type
function dbTypeToUiType(dbType: string): Movement['type'] {
  switch (dbType) {
    case 'in':         return 'purchase';
    case 'out':        return 'sale';
    case 'transfer':   return 'transfer';
    case 'adjustment': return 'adjustment';
    default:           return 'purchase';
  }
}

// Map UI filter value to DB movement_type
function uiTypeToDbType(uiType: string): string | null {
  switch (uiType) {
    case 'purchase':   return 'in';
    case 'sale':       return 'out';
    case 'transfer':   return 'transfer';
    case 'adjustment': return 'adjustment';
    default:           return null;
  }
}

export function MaterialMovementReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [movementType, setMovementType] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    loadMovements();
  }, [startDate, endDate, movementType, selectedWarehouse]);

  const loadWarehouses = async () => {
    try {
      const { rows } = await postgres.query(
        `SELECT id, name FROM stores ORDER BY name`
      );
      setWarehouses(rows);
    } catch (err) {
      console.error('[MaterialMovementReport] loadWarehouses failed:', err);
    }
  };

  const loadMovements = async () => {
    setLoading(true);
    try {
      let sql = `
        SELECT
          mi.id,
          m.movement_date  AS date,
          p.code           AS product_code,
          p.name           AS product_name,
          m.movement_type  AS type,
          mi.quantity,
          COALESCE(p.unit, 'Adet') AS unit,
          COALESCE(mi.unit_price, 0) AS unit_cost,
          m.document_no    AS reference,
          m.description    AS note,
          s.name           AS warehouse
        FROM stock_movement_items mi
        JOIN stock_movements m ON mi.movement_id = m.id
        JOIN products p        ON mi.product_id  = p.id
        LEFT JOIN stores s     ON m.warehouse_id  = s.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (startDate) {
        params.push(startDate);
        sql += ` AND m.movement_date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate + ' 23:59:59');
        sql += ` AND m.movement_date <= $${params.length}`;
      }

      const dbType = uiTypeToDbType(movementType);
      if (dbType) {
        params.push(dbType);
        sql += ` AND m.movement_type = $${params.length}`;
      }

      if (selectedWarehouse !== 'all') {
        params.push(selectedWarehouse);
        sql += ` AND m.warehouse_id = $${params.length}`;
      }

      sql += ` ORDER BY m.movement_date DESC, m.created_at DESC LIMIT 500`;

      const { rows } = await postgres.query(sql, params);

      setMovements(rows.map(r => {
        const qty = parseFloat(r.quantity) || 0;
        const dbType = r.type as string;
        // Out-type movements display as negative
        const displayQty = (dbType === 'out') ? -qty : qty;
        const unitCost = parseFloat(r.unit_cost) || 0;
        const totalCost = displayQty * unitCost;
        return {
          id: r.id,
          date: r.date ? new Date(r.date).toLocaleString('tr-TR') : '',
          productCode: r.product_code || '',
          productName: r.product_name || '',
          type: dbTypeToUiType(dbType),
          quantity: displayQty,
          unit: r.unit || 'Adet',
          unitCost,
          totalCost,
          warehouse: r.warehouse || '-',
          reference: r.reference || '',
          note: r.note || undefined,
        };
      }));
    } catch (err) {
      console.error('[MaterialMovementReport] loadMovements failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'purchase':   return 'Alış';
      case 'sale':       return 'Satış';
      case 'transfer':   return 'Transfer';
      case 'adjustment': return 'Düzeltme';
      case 'return':     return 'İade';
      default:           return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'purchase':   return 'bg-green-100 text-green-700';
      case 'sale':       return 'bg-blue-100 text-blue-700';
      case 'transfer':   return 'bg-purple-100 text-purple-700';
      case 'adjustment': return 'bg-yellow-100 text-yellow-700';
      case 'return':     return 'bg-red-100 text-red-700';
      default:           return 'bg-gray-100 text-gray-700';
    }
  };

  const totalInflow = movements
    .filter(m => m.quantity > 0)
    .reduce((sum, m) => sum + m.totalCost, 0);

  const totalOutflow = movements
    .filter(m => m.quantity < 0)
    .reduce((sum, m) => sum + Math.abs(m.totalCost), 0);

  const netMovement = totalInflow - totalOutflow;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border p-4">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Başlangıç Tarihi
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Bitiş Tarihi
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-1" />
              Hareket Tipi
            </label>
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tümü</option>
              <option value="purchase">Alış</option>
              <option value="sale">Satış</option>
              <option value="transfer">Transfer</option>
              <option value="adjustment">Düzeltme</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Package className="w-4 h-4 inline mr-1" />
              Depo
            </label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tüm Depolar</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border-2 border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Giriş</p>
              <p className="text-2xl font-bold text-green-600">{formatNumber(totalInflow, 2, false)} IQD</p>
            </div>
            <div className="bg-green-100 rounded-full p-3">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border-2 border-red-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Çıkış</p>
              <p className="text-2xl font-bold text-red-600">{formatNumber(totalOutflow, 2, false)} IQD</p>
            </div>
            <div className="bg-red-100 rounded-full p-3">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Net Hareket</p>
              <p className={`text-2xl font-bold ${netMovement >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatNumber(netMovement, 2, false)} IQD
              </p>
            </div>
            <div className={`${netMovement >= 0 ? 'bg-green-100' : 'bg-red-100'} rounded-full p-3`}>
              <ArrowRight className={`w-6 h-6 ${netMovement >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            Malzeme Hareketleri
          </h3>
          {loading && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
        </div>
        <div className="overflow-auto">
          {movements.length === 0 && !loading ? (
            <div className="p-8 text-center text-gray-400">Kayıt bulunamadı</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm">Tarih/Saat</th>
                  <th className="px-4 py-3 text-left text-sm">Ürün</th>
                  <th className="px-4 py-3 text-left text-sm">Hareket Tipi</th>
                  <th className="px-4 py-3 text-right text-sm">Miktar</th>
                  <th className="px-4 py-3 text-right text-sm">Birim Maliyet</th>
                  <th className="px-4 py-3 text-right text-sm">Toplam</th>
                  <th className="px-4 py-3 text-left text-sm">Depo</th>
                  <th className="px-4 py-3 text-left text-sm">Referans</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {movements.map((movement) => (
                  <tr key={movement.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{movement.date}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{movement.productName}</p>
                        <p className="text-xs text-gray-500">{movement.productCode}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(movement.type)}`}>
                        {getTypeLabel(movement.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-medium ${movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {movement.quantity > 0 ? '+' : ''}{movement.quantity} {movement.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">
                      {formatNumber(movement.unitCost, 2, false)} IQD
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-medium ${movement.totalCost > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {movement.totalCost > 0 ? '+' : ''}{formatNumber(movement.totalCost, 2, false)} IQD
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{movement.warehouse}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900">{movement.reference}</p>
                      {movement.note && <p className="text-xs text-gray-500">{movement.note}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}


