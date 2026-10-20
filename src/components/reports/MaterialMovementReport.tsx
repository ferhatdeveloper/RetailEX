import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, TrendingUp, TrendingDown, ArrowRight, RotateCcw, Filter, Calendar, Loader2 } from 'lucide-react';
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
import {
  productCardReportFields,
  productCardCodesCamel,
  specialCodeColumnHeader,
  productCardGroupHeader,
  DEFAULT_PRODUCT_CARD_COLUMN_VISIBILITY,
} from '../../utils/productCardReportFields';
import {
  summarizeMaterialMovementKpis,
  valueMaterialMovementLine,
  type MaterialCostBucket,
  type MaterialMovementUiType,
} from '../../utils/materialMovementValuation';
import {
  fetchWeightedAverageUnitCosts,
  lookupWeightedAvgUnitCost,
} from '../../services/weightedAverageUnitCost';

interface Movement {
  id: string;
  date: string;
  productCode: string;
  productName: string;
  specialCode: string;
  specialCode1: string;
  specialCode2: string;
  specialCode3: string;
  specialCode4: string;
  specialCode5: string;
  specialCode6: string;
  brand: string;
  group: string;
  category: string;
  type: MaterialMovementUiType;
  costBucket: MaterialCostBucket;
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
  const fiche = String(ficheType || '').toLowerCase();
  if (filter === 'purchase') {
    if (fiche === 'return_invoice') return false;
    return mt === 'in' || mt === 'purchase';
  }
  if (filter === 'sale') {
    if (fiche === 'return_invoice') return false;
    return mt === 'out' || mt === 'sale';
  }
  return mt === dbWanted;
}

export function MaterialMovementReport() {
  const { tm } = useLanguage();
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
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
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(
    () => ({ ...DEFAULT_PRODUCT_CARD_COLUMN_VISIBILITY }),
  );

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

      let avgMaps = { byProductId: new Map<string, number>(), byCode: new Map<string, number>() };
      try {
        avgMaps = await fetchWeightedAverageUnitCosts({
          firmNr: selectedFirm?.firm_nr,
          periodNr: selectedPeriod?.nr,
        });
      } catch (avgErr) {
        console.warn('[MaterialMovementReport] ağırlıklı ortalama maliyet alınamadı:', avgErr);
      }

      const mapped: Movement[] = [];
      for (const r of result.rows) {
        const dbTypeRow = String(r.movement_type || r.movement?.movement_type || 'in');
        const ficheType = String(r.fiche_type || r.movement?.fiche_type || '');
        if (!matchesMovementTypeFilter(movementType, dbTypeRow, ficheType)) continue;

        const qty = parseFloat(String(r.quantity)) || 0;
        const sourceWh = r.warehouse_id != null ? String(r.warehouse_id) : '';
        const targetWh = r.target_warehouse_id != null ? String(r.target_warehouse_id) : '';
        const productCode = displayItemCode(r.product_code);
        const codeKey = productCode && productCode !== '—' ? productCode : String(r.item_code || '').trim();
        const itemCode = String(r.item_code || '').trim();
        const avgUnitCost =
          lookupWeightedAvgUnitCost(avgMaps, {
            id: String(r.product_id || ''),
            code: codeKey,
            barcode: String(r.barcode || ''),
          }) ||
          lookupWeightedAvgUnitCost(avgMaps, { code: itemCode });
        const valued = valueMaterialMovementLine({
          quantity: qty,
          unitPrice: parseFloat(String(r.unit_price)) || 0,
          costPrice: parseFloat(String(r.cost_price ?? r.unit_cost)) || 0,
          avgUnitCost,
          movementType: dbTypeRow,
          ficheType,
          trcode: Number(r.trcode ?? r.movement?.trcode ?? 0) || 0,
          sourceType: String(r.source_type || r.movement?.source_type || ''),
          selectedWarehouse,
          sourceWh,
          targetWh,
        });
        const noteRaw = receiptNotesForDisplay(
          r.notes || r.slip_description || r.description || '',
        );

        const card = productCardReportFields(r);
        const codes = productCardCodesCamel(card);
        mapped.push({
          id: String(r.id || `${r.movement_id}-${mapped.length}`),
          date: formatReportDateCell(r.movement_date || r.created_at || r.movement?.movement_date),
          productCode,
          productName: r.product_name || '',
          ...codes,
          specialCode: card.specialCode1,
          brand: card.brand,
          group: card.group,
          category: card.category,
          type: valued.uiType,
          costBucket: valued.bucket,
          quantity: valued.quantity,
          unit: displayUnit(r.unit_name || r.unit),
          unitCost: valued.unitCost,
          totalCost: valued.totalCost,
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
  }, [startDate, endDate, movementType, selectedWarehouse, selectedFirm?.firm_nr, selectedPeriod?.nr]);

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

  // Alış girişi satış iadesini içermez. İade kartı maliyeti bir kez gösterir.
  // Net = alış − satış çıkışı + iade. İade ikinci kez düşülmez.
  const movementKpis = useMemo(
    () =>
      summarizeMaterialMovementKpis(
        movements.map((m) => ({
          bucket: m.costBucket,
          quantity: m.quantity,
          totalCost: m.totalCost,
        })),
      ),
    [movements],
  );
  const netMovement = movementKpis.net;

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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border-2 border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{tm('mmKpiPurchaseIn')}</p>
              <p className="text-2xl font-bold text-green-600">
                {formatNumber(movementKpis.purchaseIn, 2, false)} {currency}
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
              <p className="text-sm text-gray-600">{tm('mmKpiSaleOut')}</p>
              <p className="text-2xl font-bold text-red-600">
                {formatNumber(movementKpis.saleOut, 2, false)} {currency}
              </p>
            </div>
            <div className="bg-red-100 rounded-full p-3">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border-2 border-amber-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{tm('mmMovTypeReturn')}</p>
              <p className="text-2xl font-bold text-amber-700">
                {formatNumber(movementKpis.salesReturn, 2, false)} {currency}
              </p>
            </div>
            <div className="bg-amber-100 rounded-full p-3">
              <RotateCcw className="w-6 h-6 text-amber-700" />
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
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
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
                  key: 'specialCode1',
                  header: specialCodeColumnHeader(tm, 1),
                  size: 100,
                },
                {
                  key: 'specialCode2',
                  header: specialCodeColumnHeader(tm, 2),
                  size: 100,
                },
                {
                  key: 'specialCode3',
                  header: specialCodeColumnHeader(tm, 3),
                  size: 100,
                },
                {
                  key: 'specialCode4',
                  header: specialCodeColumnHeader(tm, 4),
                  size: 100,
                },
                {
                  key: 'specialCode5',
                  header: specialCodeColumnHeader(tm, 5),
                  size: 100,
                },
                {
                  key: 'specialCode6',
                  header: specialCodeColumnHeader(tm, 6),
                  size: 100,
                },
                {
                  key: 'brand',
                  header: tm('brand') || 'Marka',
                  size: 110,
                },
                {
                  key: 'group',
                  header: productCardGroupHeader(tm),
                  size: 110,
                },
                {
                  key: 'category',
                  header: tm('category') || 'Kategori',
                  size: 120,
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
