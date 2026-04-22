import React, { useState, useEffect, useCallback } from 'react';
import { Package, TrendingUp, TrendingDown, ArrowRight, Filter, Calendar, Loader2 } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import { postgres } from '../../services/postgres';
import { useLanguage } from '../../contexts/LanguageContext';

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

function dbTypeToUiType(dbType: string): Movement['type'] {
  switch (dbType) {
    case 'in':
      return 'purchase';
    case 'out':
      return 'sale';
    case 'transfer':
      return 'transfer';
    case 'adjustment':
      return 'adjustment';
    default:
      return 'purchase';
  }
}

function uiTypeToDbType(uiType: string): string | null {
  switch (uiType) {
    case 'purchase':
      return 'in';
    case 'sale':
      return 'out';
    case 'transfer':
      return 'transfer';
    case 'adjustment':
      return 'adjustment';
    default:
      return null;
  }
}

export function MaterialMovementReport() {
  const { tm } = useLanguage();
  const dateLocale = tm('localeCode');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [movementType, setMovementType] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'purchase':
        return tm('mmMovTypePurchase');
      case 'sale':
        return tm('mmMovTypeSale');
      case 'transfer':
        return tm('mmMovTypeTransfer');
      case 'adjustment':
        return tm('mmMovTypeAdjustment');
      case 'return':
        return tm('mmMovTypeReturn');
      default:
        return type;
    }
  };

  useEffect(() => {
    loadWarehouses();
  }, []);

  const loadWarehouses = async () => {
    try {
      const { rows } = await postgres.query(`SELECT id, name FROM stores ORDER BY name`);
      setWarehouses(rows);
    } catch (err) {
      console.error('[MaterialMovementReport] loadWarehouses failed:', err);
    }
  };

  const loadMovements = useCallback(async () => {
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

      setMovements(
        rows.map((r) => {
          const qty = parseFloat(r.quantity) || 0;
          const dbTypeRow = r.type as string;
          const displayQty = dbTypeRow === 'out' ? -qty : qty;
          const unitCost = parseFloat(r.unit_cost) || 0;
          const totalCost = displayQty * unitCost;
          const rawUnit = r.unit || 'Adet';
          return {
            id: r.id,
            date: r.date ? new Date(r.date).toLocaleString(dateLocale) : '',
            productCode: r.product_code || '',
            productName: r.product_name || '',
            type: dbTypeToUiType(dbTypeRow),
            quantity: displayQty,
            unit: rawUnit,
            unitCost,
            totalCost,
            warehouse: r.warehouse || '-',
            reference: r.reference || '',
            note: r.note || undefined,
          };
        })
      );
    } catch (err) {
      console.error('[MaterialMovementReport] loadMovements failed:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, movementType, selectedWarehouse, dateLocale]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'purchase':
        return 'bg-green-100 text-green-700';
      case 'sale':
        return 'bg-blue-100 text-blue-700';
      case 'transfer':
        return 'bg-purple-100 text-purple-700';
      case 'adjustment':
        return 'bg-yellow-100 text-yellow-700';
      case 'return':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const totalInflow = movements.filter((m) => m.quantity > 0).reduce((sum, m) => sum + m.totalCost, 0);

  const totalOutflow = movements.filter((m) => m.quantity < 0).reduce((sum, m) => sum + Math.abs(m.totalCost), 0);

  const netMovement = totalInflow - totalOutflow;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              {tm('reportsPlStartDate')}
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
              {tm('reportsPlEndDate')}
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
              {tm('mmMovementType')}
            </label>
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">{tm('bHistoryFilterAll')}</option>
              <option value="purchase">{tm('mmMovTypePurchase')}</option>
              <option value="sale">{tm('mmMovTypeSale')}</option>
              <option value="transfer">{tm('mmMovTypeTransfer')}</option>
              <option value="adjustment">{tm('mmMovTypeAdjustment')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Package className="w-4 h-4 inline mr-1" />
              {tm('warehouse')}
            </label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">{tm('mmAllWarehouses')}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border-2 border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{tm('totalIn')}</p>
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
              <p className="text-sm text-gray-600">{tm('totalOut')}</p>
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
              <p className="text-sm text-gray-600">{tm('mmNetMovement')}</p>
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

      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            {tm('materialMovements')}
          </h3>
          {loading && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
        </div>
        <div className="overflow-auto">
          {movements.length === 0 && !loading ? (
            <div className="p-8 text-center text-gray-400">{tm('noRecordFound')}</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm">{tm('mmDateTimeCol')}</th>
                  <th className="px-4 py-3 text-left text-sm">{tm('reportColProduct')}</th>
                  <th className="px-4 py-3 text-left text-sm">{tm('mmMovementTypeCol')}</th>
                  <th className="px-4 py-3 text-right text-sm">{tm('reportsThQty')}</th>
                  <th className="px-4 py-3 text-right text-sm">{tm('reportsColUnitCost')}</th>
                  <th className="px-4 py-3 text-right text-sm">{tm('mmRowTotal')}</th>
                  <th className="px-4 py-3 text-left text-sm">{tm('warehouse')}</th>
                  <th className="px-4 py-3 text-left text-sm">{tm('mmReferenceCol')}</th>
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
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(movement.type)}`}
                      >
                        {getTypeLabel(movement.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-medium ${movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {movement.quantity > 0 ? '+' : ''}
                        {movement.quantity} {displayUnit(movement.unit)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">
                      {formatNumber(movement.unitCost, 2, false)} IQD
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-medium ${movement.totalCost > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {movement.totalCost > 0 ? '+' : ''}
                        {formatNumber(movement.totalCost, 2, false)} IQD
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
