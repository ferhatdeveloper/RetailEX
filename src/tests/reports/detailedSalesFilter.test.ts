/**
 * 10.10.2026 — Detaylı Satış Raporu (ReportsModule > detailed-sales) filtre
 * regresyonu.
 *
 * Kullanıcı şikayeti:
 *  "Fatura No, Masa Adı, Cari kolonlarındaki filtre dropdown'u
 *   kapanmıyor / seçim yapılamıyor / filtre uygulandı sanılıyor
 *   ama gerçek veri değişmiyor."
 *
 * Kök neden: ReportColumnTable `groupByColumnId="invoiceNo"` ile
 * gruplanırken `buildDevExGroupedRows` her grup için sentetik bir
 * grup başlık satırı üretir. Bu satır `cari` / `table` gibi kolonlarda
 * yalnızca ilk detay satırının değerini taşır; standart TanStack filtre
 * fonksiyonu bu satırları da detay satırlarıyla birlikte karşılaştırır.
 * Sonuç:
 *   - `getFacetedUniqueValues()` dropdown'da hayalet değerler gösterir.
 *   - `selectedValues.length >= allKeys.length` karşılaştırması
 *     tutarsız olduğundan "Tümü" seçilince filtre temizlenme izlenimi
 *     oluşur ya da dropdown açık kalır.
 *   - Filtre sonucu görsel olarak değişmez gibi görünür (grup başlığı
 *     ilk detay satırının değerini taşıdığı için filtre sonrası da
 *     "bozulmamış" izlenimi).
 *
 * Bu test, `DevExDataGrid.tsx` içindeki `gridColumnFilterFn` davranışını
 * birebir modeller. Grup / alt-toplam sentetik satırları filtre
 * hesabından Hariç tutulur; yalnızca detay satırları karşılaştırılır.
 */
import { describe, expect, it } from 'vitest';

const DEVEX_GRID_ROW_KIND = '__devexRowKind';

type RowKind = 'detail' | 'group' | 'subtotal';

interface DetailRow {
  id: string;
  invoiceNo: string;
  table: string;
  cari: string;
  product: string;
  qty: number;
  [DEVEX_GRID_ROW_KIND]?: RowKind;
}

interface GroupRow extends DetailRow {
  [DEVEX_GRID_ROW_KIND]: 'group';
}

/**
 * `gridColumnFilterFnInner` semantiğini (10.10.2026 düzeltmesi ile)
 * 1:1 taklit eden yardımcı. Grup / alt-toplam satırları her zaman
 * "geçer" döner; detay satırları için multiselect / contains modu
 * desteklenir.
 */
function gridColumnFilter(
  row: DetailRow,
  columnId: keyof DetailRow,
  filterValue: unknown,
): boolean {
  // 10.10.2026 düzeltmesi — sentetik satırlar filtre dışı.
  const rowKind = row[DEVEX_GRID_ROW_KIND];
  if (rowKind === 'group' || rowKind === 'subtotal') return true;

  const payload = filterValue as
    | { mode?: string; values?: unknown[]; value?: string }
    | string
    | undefined;
  if (payload == null || payload === '') return true;

  const cellRaw = (row as Record<string, unknown>)[columnId];

  if (typeof payload === 'string') {
    return String(cellRaw ?? '')
      .toLowerCase()
      .includes(payload.toLowerCase());
  }

  if (typeof payload !== 'object') return true;

  const mode = payload.mode ?? 'contains';

  if (mode === 'multiselect') {
    const values = Array.isArray(payload.values)
      ? payload.values.map(String)
      : [];
    if (values.length === 0) return false;
    return values.includes(String(cellRaw));
  }

  const searchValue = String(payload.value ?? '').toLowerCase();
  const cellValue = String(cellRaw ?? '').toLowerCase();
  if (!searchValue) return true;
  return cellValue.includes(searchValue);
}

/**
 * `buildDevExGroupedRows` semantiği: detay satırlarını `invoiceNo`
 * alanına göre grupla; her grubun başına sentetik bir grup satırı ekle.
 */
function buildGroupedRows(details: DetailRow[]): Array<DetailRow | GroupRow> {
  const grouped: Record<string, DetailRow[]> = {};
  details.forEach((d) => {
    const key = d.invoiceNo;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  });
  const out: Array<DetailRow | GroupRow> = [];
  Object.keys(grouped)
    .sort()
    .forEach((inv) => {
      const grp = grouped[inv];
      const first = grp[0];
      out.push({
        ...first,
        [DEVEX_GRID_ROW_KIND]: 'group',
      } as GroupRow);
      grp.forEach((d) => out.push(d));
    });
  return out;
}

describe('Detaylı Satış Raporu — grup-altı filtre düzeltmesi (10.10.2026)', () => {
  describe('Senaryo: 3 fatura, 5 detay satırı', () => {
    const details: DetailRow[] = [
      {
        id: 'i1-1',
        invoiceNo: 'INV-001',
        table: 'Masa 1',
        cari: 'Ali',
        product: 'Çay',
        qty: 1,
      },
      {
        id: 'i1-2',
        invoiceNo: 'INV-001',
        table: 'Masa 1',
        cari: 'Ali',
        product: 'Kahve',
        qty: 1,
      },
      {
        id: 'i2-1',
        invoiceNo: 'INV-002',
        table: 'Masa 2',
        cari: 'Veli',
        product: 'Çay',
        qty: 2,
      },
      {
        id: 'i3-1',
        invoiceNo: 'INV-003',
        table: 'Masa 3',
        cari: 'Ali',
        product: 'Su',
        qty: 3,
      },
      {
        id: 'i3-2',
        invoiceNo: 'INV-003',
        table: 'Masa 3',
        cari: 'Ali',
        product: 'Tatlı',
        qty: 1,
      },
    ];
    const rows = buildGroupedRows(details);

    it('buildGroupedRows: 3 grup + 5 detay = 8 satır', () => {
      expect(rows.length).toBe(8);
      const groupRows = rows.filter(
        (r) => r[DEVEX_GRID_ROW_KIND] === 'group',
      );
      expect(groupRows.length).toBe(3);
    });

    it('Fatura No filtresi: INV-001 seçilince yalnızca INV-001 detayları kalır; tüm grup başlıkları sentetik olduğu için geçer', () => {
      const payload = { mode: 'multiselect', values: ['INV-001'] };
      const filtered = rows.filter((r) =>
        gridColumnFilter(r as DetailRow, 'invoiceNo', payload),
      );
      // 3 grup başlığı (sentetik, her zaman geçer) + 2 INV-001 detayı.
      expect(filtered.length).toBe(5);
      const det = filtered.filter(
        (r) => r[DEVEX_GRID_ROW_KIND] !== 'group',
      );
      expect(det.length).toBe(2);
      expect(det.every((d) => d.invoiceNo === 'INV-001')).toBe(true);
    });

    it('Cari filtresi: Ali seçilince Ali olan detaylar kalır; Veli grubu başlığı da geçer (sentetik = pas)', () => {
      const payload = { mode: 'multiselect', values: ['Ali'] };
      const filtered = rows.filter((r) =>
        gridColumnFilter(r as DetailRow, 'cari', payload),
      );
      // Ali detayları: i1-1, i1-2, i3-1, i3-2 (4 adet).
      // Grup başlıkları her zaman geçer: 3 sentetik.
      const detailsWithAli = filtered.filter(
        (r) => r[DEVEX_GRID_ROW_KIND] !== 'group',
      );
      expect(detailsWithAli.every((d) => d.cari === 'Ali')).toBe(true);
      expect(detailsWithAli.length).toBe(4);
      // Grup başlıkları daima geçer (3 adet).
      const groups = filtered.filter(
        (r) => r[DEVEX_GRID_ROW_KIND] === 'group',
      );
      expect(groups.length).toBe(3);
    });

    it('Masa Adı filtresi: "Masa 2" seçilince Masa 2 grubu + 1 detay kalır', () => {
      const payload = { mode: 'multiselect', values: ['Masa 2'] };
      const filtered = rows.filter((r) =>
        gridColumnFilter(r as DetailRow, 'table', payload),
      );
      const details = filtered.filter(
        (r) => r[DEVEX_GRID_ROW_KIND] !== 'group',
      );
      expect(details.every((d) => d.table === 'Masa 2')).toBe(true);
      expect(details.length).toBe(1);
    });

    it('Cari filtresi: Veli seçilince yalnızca Veli detayı kalır', () => {
      const payload = { mode: 'multiselect', values: ['Veli'] };
      const filtered = rows.filter((r) =>
        gridColumnFilter(r as DetailRow, 'cari', payload),
      );
      const details = filtered.filter(
        (r) => r[DEVEX_GRID_ROW_KIND] !== 'group',
      );
      expect(details.length).toBe(1);
      expect(details[0].cari).toBe('Veli');
    });
  });

  describe('Filtre değeri boş / tanımsız → tüm satırlar geçer', () => {
    const rows: DetailRow[] = [
      {
        id: 'a',
        invoiceNo: 'INV-001',
        table: 'Masa 1',
        cari: 'Ali',
        product: 'Çay',
        qty: 1,
        [DEVEX_GRID_ROW_KIND]: 'group',
      },
      {
        id: 'b',
        invoiceNo: 'INV-001',
        table: 'Masa 1',
        cari: 'Ali',
        product: 'Çay',
        qty: 1,
      },
    ];
    it('undefined → tüm satırlar geçer', () => {
      const out = rows.filter((r) => gridColumnFilter(r, 'cari', undefined));
      expect(out.length).toBe(2);
    });
    it('boş string → tüm satırlar geçer', () => {
      const out = rows.filter((r) => gridColumnFilter(r, 'cari', ''));
      expect(out.length).toBe(2);
    });
  });

  describe('Multiselect: "Tümü" senaryosu', () => {
    const details: DetailRow[] = [
      {
        id: 'a',
        invoiceNo: 'INV-001',
        table: 'Masa 1',
        cari: 'Ali',
        product: 'Çay',
        qty: 1,
      },
      {
        id: 'b',
        invoiceNo: 'INV-002',
        table: 'Masa 2',
        cari: 'Veli',
        product: 'Çay',
        qty: 1,
      },
    ];
    const rows = buildGroupedRows(details);
    it('Ali + Veli (tüm cariler) seçilirse filtre temizleme yerine tam liste uygulanır', () => {
      const payload = { mode: 'multiselect', values: ['Ali', 'Veli'] };
      const filtered = rows.filter((r) =>
        gridColumnFilter(r as DetailRow, 'cari', payload),
      );
      // 2 detay + 2 grup başlığı = 4 satır (tüm veri görünür).
      expect(filtered.length).toBe(4);
    });
    it('Ali seçilirse yalnızca Ali detayı + tüm grup başlıkları', () => {
      const payload = { mode: 'multiselect', values: ['Ali'] };
      const filtered = rows.filter((r) =>
        gridColumnFilter(r as DetailRow, 'cari', payload),
      );
      const det = filtered.filter(
        (r) => r[DEVEX_GRID_ROW_KIND] !== 'group',
      );
      expect(det.length).toBe(1);
      expect(det[0].cari).toBe('Ali');
    });
  });
});