/**
 * Kategori grubu → kategori → ürün bazında satış adedi ve brüt kar raporu.
 * Veri kaynağı: dönem tabloları sales + sale_items, ürün kartı + kategori + ürün grubu.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Package, RefreshCw, Download, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { postgres, ERP_SETTINGS, getAppDefaultCurrency } from '../../services/postgres';
import { toSqlDateInputString } from '../../utils/localCalendarDate';
import { SQL_COUNTABLE_SALE_STATUS } from '../../utils/saleInvoiceStatus';
import {
  buildProfitCostCtes,
  INVOICE_LINE_SCALE_JOIN,
  LAST_PURCHASE_JOIN,
  PRODUCTS_JOIN,
  SIGNED_LINE_PROFIT_EXPR,
  SIGNED_LINE_QTY_EXPR,
  SIGNED_LINE_REVENUE_EXPR,
  SQL_LINE_RESOLVED_PRODUCT_ID,
  SQL_PL_SALES_OR_RETURN,
} from '../../utils/lastPurchaseCostSql';
import { toast } from 'sonner';
import {
  ProductMovementHistoryModal,
  type ProductMovementTarget,
} from './ProductMovementHistoryModal';

export interface CategoryGroupProductRow {
  groupName: string;
  categoryName: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  revenue: number;
  grossProfit: number;
}

function groupRows(rows: CategoryGroupProductRow[]) {
  const byGroup = new Map<
    string,
    Map<
      string,
      { products: CategoryGroupProductRow[]; qty: number; revenue: number; profit: number }
    >
  >();

  for (const r of rows) {
    if (!byGroup.has(r.groupName)) byGroup.set(r.groupName, new Map());
    const catMap = byGroup.get(r.groupName)!;
    if (!catMap.has(r.categoryName)) {
      catMap.set(r.categoryName, { products: [], qty: 0, revenue: 0, profit: 0 });
    }
    const bucket = catMap.get(r.categoryName)!;
    bucket.products.push(r);
    bucket.qty += r.quantity;
    bucket.revenue += r.revenue;
    bucket.profit += r.grossProfit;
  }

  const groupTotals = new Map<string, { qty: number; revenue: number; profit: number }>();
  for (const [g, cats] of byGroup) {
    let q = 0,
      rev = 0,
      pr = 0;
    for (const b of cats.values()) {
      q += b.qty;
      rev += b.revenue;
      pr += b.profit;
    }
    groupTotals.set(g, { qty: q, revenue: rev, profit: pr });
  }

  return { byGroup, groupTotals };
}

export function CategoryGroupSalesProfitReport() {
  const { selectedFirma, selectedDonem } = useFirmaDonem();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CategoryGroupProductRow[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [movementTarget, setMovementTarget] = useState<ProductMovementTarget | null>(null);

  const cur = getAppDefaultCurrency();

  useEffect(() => {
    if (selectedDonem?.beg_date && selectedDonem?.end_date) {
      setDateFrom(toSqlDateInputString(selectedDonem.beg_date) || '');
      setDateTo(toSqlDateInputString(selectedDonem.end_date) || '');
    }
  }, [selectedDonem?.beg_date, selectedDonem?.end_date]);

  const load = useCallback(async () => {
    const from = toSqlDateInputString(dateFrom);
    const to = toSqlDateInputString(dateTo);
    if (!selectedFirma || !selectedDonem || !from || !to) return;
    setLoading(true);
    try {
      const firmNr = String(selectedFirma.firm_nr || ERP_SETTINGS.firmNr || '001')
        .replace(/\D/g, '')
        .padStart(3, '0')
        .slice(0, 10);

      const { rows: qrows } = await postgres.query<{
        group_name: string;
        category_name: string;
        product_id: string;
        product_code: string;
        product_name: string;
        qty: string | number;
        revenue: string | number;
        gross_profit: string | number;
      }>(
        `
        WITH ${buildProfitCostCtes('$1')}
        SELECT
          COALESCE(parent_cat.name, pg.name, NULLIF(TRIM(COALESCE(p.group_code, '')), ''), 'Genel') AS group_name,
          COALESCE(leaf_cat.name, NULLIF(TRIM(COALESCE(p.category_code, '')), ''), 'Diğer') AS category_name,
          MAX(COALESCE((${SQL_LINE_RESOLVED_PRODUCT_ID})::text, '')) AS product_id,
          COALESCE(NULLIF(TRIM(p.code), ''), NULLIF(TRIM(si.item_code), ''), '') AS product_code,
          COALESCE(NULLIF(TRIM(si.item_name), ''), p.name, 'Bilinmeyen') AS product_name,
          SUM(${SIGNED_LINE_QTY_EXPR}) AS qty,
          SUM(${SIGNED_LINE_REVENUE_EXPR}) AS revenue,
          SUM(${SIGNED_LINE_PROFIT_EXPR}) AS gross_profit
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.invoice_id
        ${PRODUCTS_JOIN}
        LEFT JOIN categories leaf_cat ON leaf_cat.id = p.category_id
        LEFT JOIN categories parent_cat ON parent_cat.id = leaf_cat.parent_id
        LEFT JOIN product_groups pg ON pg.code = p.group_code
        ${LAST_PURCHASE_JOIN}
        ${INVOICE_LINE_SCALE_JOIN}
        WHERE s.firm_nr = $1
          AND COALESCE(s.is_cancelled, false) = false
          AND ${SQL_COUNTABLE_SALE_STATUS}
          AND ${SQL_PL_SALES_OR_RETURN}
          AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
          AND (s.date AT TIME ZONE 'UTC')::date >= $2::date
          AND (s.date AT TIME ZONE 'UTC')::date <= $3::date
        GROUP BY
          COALESCE(parent_cat.name, pg.name, NULLIF(TRIM(COALESCE(p.group_code, '')), ''), 'Genel'),
          COALESCE(leaf_cat.name, NULLIF(TRIM(COALESCE(p.category_code, '')), ''), 'Diğer'),
          COALESCE(NULLIF(TRIM(p.code), ''), NULLIF(TRIM(si.item_code), ''), ''),
          COALESCE(NULLIF(TRIM(si.item_name), ''), p.name, 'Bilinmeyen')
        HAVING SUM(ABS(si.quantity)) <> 0
        ORDER BY 1, 2, SUM(${SIGNED_LINE_REVENUE_EXPR}) DESC
        `,
        [firmNr, from, to],
        { firmNr: firmNr, periodNr: String(selectedDonem.nr ?? ERP_SETTINGS.periodNr).padStart(2, '0') }
      );

      const mapped: CategoryGroupProductRow[] = qrows.map((r) => ({
        groupName: r.group_name,
        categoryName: r.category_name,
        productId: String(r.product_id || '').trim(),
        productCode: r.product_code,
        productName: r.product_name,
        quantity: Number(r.qty) || 0,
        revenue: Number(r.revenue) || 0,
        grossProfit: Number(r.gross_profit) || 0,
      }));

      setRows(mapped);
      const allG = new Set(mapped.map((x) => x.groupName));
      setOpenGroups(allG);
      const allGC = new Set(mapped.map((x) => `${x.groupName}||${x.categoryName}`));
      setOpenCats(allGC);
    } catch (e: any) {
      console.error('[CategoryGroupSalesProfitReport]', e);
      toast.error(e?.message || 'Rapor yüklenemedi');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFirma, selectedDonem, dateFrom, dateTo]);

  useEffect(() => {
    if (selectedFirma && selectedDonem && dateFrom && dateTo) void load();
  }, [selectedFirma, selectedDonem, dateFrom, dateTo, load]);

  const { byGroup, groupTotals } = useMemo(() => groupRows(rows), [rows]);

  const fmt = (n: number) =>
    n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const exportCsv = () => {
    if (rows.length === 0) return;
    const header = 'Kategori Grubu;Kategori;Ürün Kodu;Ürün Adı;Adet;Ciro;Brüt Kar\n';
    const body = rows
      .map(
        (r) =>
          `${r.groupName};${r.categoryName};${r.productCode};"${r.productName.replace(/"/g, '""')}";${r.quantity};${r.revenue};${r.grossProfit}`
      )
      .join('\n');
    const blob = new Blob(['\ufeff' + header + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kategori-grup-satis-kar-${dateFrom}_${dateTo}.csv`;
    a.click();
    toast.success('CSV indirildi');
  };

  const toggleGroup = (g: string) => {
    setOpenGroups((prev) => {
      const n = new Set(prev);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  };

  const toggleCat = (key: string) => {
    setOpenCats((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  if (!selectedFirma || !selectedDonem) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        Lütfen firma ve dönem seçin.
      </div>
    );
  }

  const grand = rows.reduce(
    (a, r) => ({ qty: a.qty + r.quantity, rev: a.rev + r.revenue, pr: a.pr + r.grossProfit }),
    { qty: 0, rev: 0, pr: 0 }
  );

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Layers className="h-6 w-6 text-indigo-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Kategori grubu — satış ve kar</h2>
            <p className="text-sm text-slate-500">
              {selectedFirma.name || selectedFirma.title} · {selectedDonem.donem_adi || selectedDonem.nr} · Üst kategori veya ürün grubu →
              kategori → ürün
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-slate-600">
            Başlangıç
            <input
              type="date"
              value={toSqlDateInputString(dateFrom) || ''}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            Bitiş
            <input
              type="date"
              value={toSqlDateInputString(dateTo) || ''}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Package className="h-4 w-4" />
            Toplam adet
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{fmt(grand.qty)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <TrendingUp className="h-4 w-4" />
            Toplam ciro ({cur})
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{fmt(grand.rev)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <TrendingUp className="h-4 w-4" />
            Toplam brüt kar ({cur})
          </div>
          <div className="mt-1 text-2xl font-bold text-indigo-700">{fmt(grand.pr)}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-500">Yükleniyor…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-slate-500">
            Bu aralıkta satış satırı bulunamadı.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {Array.from(byGroup.entries()).map(([groupName, catMap]) => {
              const gt = groupTotals.get(groupName)!;
              const gOpen = openGroups.has(groupName);
              return (
                <div key={groupName}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupName)}
                    className="flex w-full items-center justify-between gap-2 bg-indigo-50/80 px-4 py-3 text-left font-semibold text-indigo-950 hover:bg-indigo-100/80"
                  >
                    <span className="flex items-center gap-2">
                      {gOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <Layers className="h-4 w-4 text-indigo-600" />
                      {groupName}
                    </span>
                    <span className="flex gap-6 text-sm font-normal">
                      <span>Adet: {fmt(gt.qty)}</span>
                      <span>Ciro: {fmt(gt.revenue)}</span>
                      <span>Kar: {fmt(gt.profit)}</span>
                    </span>
                  </button>
                  {gOpen &&
                    Array.from(catMap.entries()).map(([catName, bucket]) => {
                      const ck = `${groupName}||${catName}`;
                      const cOpen = openCats.has(ck);
                      return (
                        <div key={ck} className="border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => toggleCat(ck)}
                            className="flex w-full items-center justify-between gap-2 bg-amber-50/90 px-6 py-2.5 pl-10 text-left text-sm font-medium text-amber-950 hover:bg-amber-100/90"
                          >
                            <span className="flex items-center gap-2">
                              {cOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              {catName}
                            </span>
                            <span className="flex gap-4 text-xs font-normal">
                              <span>{fmt(bucket.qty)} ad.</span>
                              <span>{fmt(bucket.revenue)}</span>
                              <span>{fmt(bucket.profit)}</span>
                            </span>
                          </button>
                          {cOpen && (
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[640px] text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                  <tr>
                                    <th className="px-8 py-2 pl-14">Ürün</th>
                                    <th className="px-2 py-2 text-right">Kod</th>
                                    <th className="px-2 py-2 text-right">Adet</th>
                                    <th className="px-2 py-2 text-right">Ciro</th>
                                    <th className="px-2 py-2 text-right">Brüt kar</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {bucket.products
                                    .sort((a, b) => b.revenue - a.revenue)
                                    .map((p, i) => (
                                      <tr
                                        key={`${p.productId}-${p.productCode}-${i}`}
                                        className="hover:bg-emerald-50/80 cursor-pointer"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (!p.productCode && !p.productId) {
                                            toast.error('Ürün kodu bulunamadı');
                                            return;
                                          }
                                          setMovementTarget({
                                            productId: p.productId || undefined,
                                            productCode: p.productCode,
                                            productName: p.productName,
                                            startDate: toSqlDateInputString(dateFrom) || undefined,
                                            endDate: toSqlDateInputString(dateTo) || undefined,
                                          });
                                        }}
                                        title="Satıra tıklayarak ürün hareketlerini görüntüleyin"
                                      >
                                        <td className="px-8 py-2 pl-14 font-medium text-slate-800">{p.productName}</td>
                                        <td className="px-2 py-2 text-right text-slate-500">{p.productCode || '—'}</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{fmt(p.quantity)}</td>
                                        <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{fmt(p.revenue)}</td>
                                        <td className="px-2 py-2 text-right tabular-nums text-indigo-700">{fmt(p.grossProfit)}</td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {movementTarget ? (
        <ProductMovementHistoryModal
          key={`${movementTarget.productId || ''}|${movementTarget.productCode}`}
          target={movementTarget}
          onClose={() => setMovementTarget(null)}
        />
      ) : null}
    </div>
  );
}
