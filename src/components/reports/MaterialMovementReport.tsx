import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, TrendingUp, TrendingDown, ArrowRight, Filter, Calendar, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatNumber } from '../../utils/formatNumber';
import { postgres, getAppDefaultCurrency } from '../../services/postgres';
import { stockMovementAPI } from '../../services/stockMovementAPI';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { displayItemCode } from '../../utils/lastPurchaseCostSql';
import { formatReportDateCell } from '../../utils/dateLocale';
import { ReportYmdDatePicker } from '../shared/ReportDateRangePresets';
import { ReportColumnTable } from './shared/ReportDataGrid';
import { useRegisterDatagridRefresh } from '../../hooks/useRegisterDatagridRefresh';
import { getFirmLedgerCurrency, getGlobalCurrency } from '../../utils/currency';
import { receiptNotesForDisplay } from '../../utils/receiptNotes';

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

const REPORT_ROW_LIMIT = 5_000;

function dbTypeToUiType(dbType: string, ficheType?: string): Movement['type'] {
  const fiche = String(ficheType || '').trim().toLowerCase();
  if (fiche === 'return_invoice') return 'return';
  switch (String(dbType || '').toLowerCase()) {
    case 'in':
    case 'purchase':
      return 'purchase';
    case 'out':
    case 'sale':
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
    case 'return':
      return 'return';
    default:
      return null;
  }
}

function displayUnit(unit: string | undefined): string {
  const u = String(unit ?? '').trim();
  return u || 'Adet';
}

/** Giriş +, çıkış − — Malzeme ekstresi / stok in-out ile aynı yön. */
function signedQuantity(opts: {
  qty: number;
  dbType: string;
  selectedWarehouse: string;
  sourceWh: string;
  targetWh: string;
}): number {
  const absQty = Math.abs(opts.qty);
  const dbType = String(opts.dbType || '').toLowerCase();
  if (dbType === 'in' || dbType === 'purchase') return absQty;
  if (dbType === 'out' || dbType === 'sale') return -absQty;
  if (dbType === 'transfer') {
    if (opts.selectedWarehouse === 'all') return -absQty;
    if (opts.sourceWh && opts.sourceWh === opts.selectedWarehouse) return -absQty;
    if (opts.targetWh && opts.targetWh === opts.selectedWarehouse) return absQty;
    return -absQty;
  }
  if (dbType === 'adjustment') {
    // Sayım farkı DB'de işaretli gelebilir; olduğu gibi bırak.
    return opts.qty;
  }
  return opts.qty;
}

function matchesMovementTypeFilter(
  filter: string,
  dbType: string,
  ficheType: string,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'return') {
    return String(ficheType || '').toLowerCase() === 'return_invoice';
  }
  const dbWanted = uiTypeToDbType(filter);
  if (!dbWanted) return true;
  const mt = String(dbType || '').toLowerCase();
  if (filter === 'purchase') return mt === 'in' || mt === 'purchase';
  if (filter === 'sale') return mt === 'out' || mt === 'sale';
  return mt === dbWanted;
}

export function MaterialMovementReport() {
  const { tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const currency = getFirmLedgerCurrency(
    selectedFirm,
    getAppDefaultCurrency() || getGlobalCurrency(),
  );

  const today = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return format(d, 'yyyy-MM-dd');
  }, [today]);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));
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
    if (!startDate || !endDate) {
      setMovements([]);
      return;
    }
    setLoading(true);
    try {
      const result = await stockMovementAPI.getExtractMovementsInDateRange({
        startDate,
        endDate,
        limit: REPORT_ROW_LIMIT,
        firmNr: selectedFirm?.firm_nr,
        warehouseId: selectedWarehouse === 'all' ? null : selectedWarehouse,
      });

      const mapped: Movement[] = [];
      for (const r of result.rows) {
        const dbTypeRow = String(r.movement_type || r.movement?.movement_type || 'in');
        const ficheType = String(r.fiche_type || r.movement?.fiche_type || '');
        if (!matchesMovementTypeFilter(movementType, dbTypeRow, ficheType)) continue;

        const qty = parseFloat(String(r.quantity)) || 0;
        const sourceWh = r.warehouse_id != null ? String(r.warehouse_id) : '';
        const targetWh = r.target_warehouse_id != null ? String(r.target_warehouse_id) : '';
        const displayQty = signedQuantity({
          qty,
          dbType: dbTypeRow,
          selectedWarehouse,
          sourceWh,
          targetWh,
        });
        // Birim tutar: satışta unit_price, yoksa cost_price (giriş maliyet)
        const unitCost =
          parseFloat(String(r.unit_price)) ||
          parseFloat(String(r.cost_price)) ||
          0;
        const totalCost = displayQty * unitCost;
        const noteRaw = receiptNotesForDisplay(
          r.notes || r.slip_description || r.description || '',
        );

        mapped.push({
          id: String(r.id || `${r.movement_id}-${mapped.length}`),
          date: formatReportDateCell(r.movement_date || r.created_at || r.movement?.movement_date),
          productCode: displayItemCode(r.product_code),
          productName: r.product_name || '',
          type: dbTypeToUiType(dbTypeRow, ficheType),
          quantity: displayQty,
          unit: displayUnit(r.unit_name || r.unit),
          unitCost,
          totalCost,
          warehouse: r.warehouse_name || r.movement?.warehouses?.name || '-',
          reference: r.document_no || r.movement?.document_no || '',
          note: noteRaw || undefined,
        });
      }

      // API ASC döner; rapor yeniden eskiye
      mapped.reverse();
      setMovements(mapped);
    } catch (err) {
      console.error('[MaterialMovementReport] loadMovements failed:', err);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, movementType, selectedWarehouse, selectedFirm?.firm_nr]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  useRegisterDatagridRefresh(loadMovements);

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

  // displayQty zaten işaretli (+ giriş, − çıkış); totalCost = displayQty * unitCost yine işaretli.
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
            <ReportYmdDatePicker value={startDate} onChange={setStartDate} className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              {tm('reportsPlEndDate')}
            </label>
            <ReportYmdDatePicker value={endDate} onChange={setEndDate} className="w-full" />
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
              <option value="return">{tm('mmMovTypeReturn')}</option>
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
              <p className="text-2xl font-bold text-green-600">
                {formatNumber(totalInflow, 2, false)} {currency}
              </p>
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
              <p className="text-2xl font-bold text-red-600">
                {formatNumber(totalOutflow, 2, false)} {currency}
              </p>
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
                {formatNumber(netMovement, 2, false)} {currency}
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
        <div className="p-2">
          {movements.length === 0 && !loading ? (
            <div className="p-8 text-center text-gray-400">{tm('noRecordFound')}</div>
          ) : (
            <ReportColumnTable
              data={movements}
              height={520}
              storageNamespace="material-movement"
              columns={[
                { key: 'date', header: tm('mmDateTimeCol'), type: 'date', size: 140 },
                {
                  key: 'productName',
                  header: tm('reportColProduct'),
                  size: 220,
                  cell: (movement) => (
                    <div>
                      <p className="text-sm font-medium text-gray-900">{movement.productName}</p>
                      {movement.productCode && movement.productCode !== '—' ? (
                        <p className="text-xs text-gray-500">{movement.productCode}</p>
                      ) : null}
                    </div>
                  ),
                },
                {
                  key: 'type',
                  header: tm('mmMovementTypeCol'),
                  size: 120,
                  cell: (movement) => (
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(movement.type)}`}
                    >
                      {getTypeLabel(movement.type)}
                    </span>
                  ),
                },
                {
                  key: 'quantity',
                  header: tm('reportsThQty'),
                  type: 'number',
                  align: 'right',
                  cell: (movement) => (
                    <span className={`text-sm font-medium ${movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {movement.quantity > 0 ? '+' : ''}
                      {movement.quantity} {displayUnit(movement.unit)}
                    </span>
                  ),
                },
                {
                  key: 'unitCost',
                  header: tm('reportsColUnitCost'),
                  type: 'number',
                  align: 'right',
                  cell: (movement) => `${formatNumber(movement.unitCost, 2, false)} ${currency}`,
                },
                {
                  key: 'totalCost',
                  header: tm('mmRowTotal'),
                  type: 'number',
                  align: 'right',
                  footerSum: true,
                  footerFormat: (n) => `${formatNumber(n, 2, false)} ${currency}`,
                  cell: (movement) => (
                    <span className={`text-sm font-medium ${movement.totalCost > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {movement.totalCost > 0 ? '+' : ''}
                      {formatNumber(movement.totalCost, 2, false)} {currency}
                    </span>
                  ),
                },
                { key: 'warehouse', header: tm('warehouse'), size: 120 },
                {
                  key: 'reference',
                  header: tm('mmReferenceCol'),
                  size: 180,
                  cell: (movement) => (
                    <div>
                      <p className="text-sm text-gray-900">{movement.reference}</p>
                      {movement.note ? <p className="text-xs text-gray-500">{movement.note}</p> : null}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
