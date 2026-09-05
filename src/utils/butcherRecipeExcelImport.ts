/**
 * Kasap reçete Excel içe aktarımı — Ürünler_YYYY-MM-DD.xlsx şablonu.
 *
 * Her satır bir **çıktı ürün** gibi davranır:
 *   - RECETE ADI  →  butcher_recipes.name  (aynı ad → aynı reçete)
 *   - Ürün Kodu   →  output.product_id (code ile çözümlenir)
 *   - Ürün Adı   →  yalnız doğrulama/etiket
 *   - Barkod     →  yardımcı, çözümleme için
 *   - KAC KG CIKAR →  output.standard_ratio_percent referansı (outputKg =
 *                    VoucherForm tarafında input * ratio / 100 ile hesaplanır;
 *                    burada saklanmaz, sadece oran DB'ye yazılır)
 *   - YUZDE BAZI  →  output.standard_ratio_percent
 *   - Birim       →  ürün birimi (KG/Kilogram zorunlu; aksi halde satır atlanır)
 *
 * Notlar:
 *   - animalType: Excel'de ayrı kolon yok; recete adından tahmin edilir
 *     (Türkçe/kürtçe/Arapça anahtar kelimelerle: kuzu→sheep, dana/sığır→cattle,
 *      keçi→goat; aksi halde 'other').
 *   - input_product_id: Excel'de yok → import sonrası kullanıcı modal'dan manuel
 *     seçer; standard_ratio_percent yüklü tarifler "taslak" işaretlenir.
 */

export interface ButcherRecipeExcelRow {
  rowIndex: number;
  recipeName: string;
  animalType: 'cattle' | 'sheep' | 'goat' | 'other';
  outputProductCode: string;
  outputProductName?: string;
  outputBarkod?: string;
  /** Satır başına kg çıktı (Excel "KAC KG CIKAR"). Yalnız analiz için; DB'ye yazılmaz. */
  outputKg?: number;
  /** Dağılım yüzdesi (Excel "YUZDE BAZI"). */
  standardRatioPercent?: number;
  unit?: string;
  purchasePrice?: number;
  salePrice?: number;
}

export interface ButcherRecipeExcelValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  rows: ButcherRecipeExcelRow[];
}

const HEADER_KEYS = {
  code: ['ÜRÜN KODU', 'URUN KODU', 'ÜRÜN KODU*'],
  name: ['ÜRÜN ADI', 'URUN ADI', 'ÜRÜN ADI*'],
  barkod: ['BARKOD'],
  outputKg: ['KAC KG CIKAR', 'KAÇ KG ÇIKAR', 'KAC_KG_CIKAR'],
  ratio: ['YUZDE BAZI', 'YÜZDE BAZI', 'YUZDE BAZI', 'YUZDE_BAZI'],
  category: ['KATEGORİ', 'KATEGORI'],
  recipeName: ['RECETE ADI', 'REÇETE ADI', 'RECETE_ADI', 'COME FROM', 'COMEFROM', 'COME_FROM'],
  brand: ['MARKA'],
  unit: ['BİRİM', 'BIRIM'],
  purchasePrice: ['ALIŞ FİYATI', 'ALIS FIYATI', 'ALIŞFİYATI'],
  salePrice: ['SATIŞ FİYATI', 'SATIS FIYATI', 'SATIŞFİYATI'],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/İ/g, 'I')
    .replace(/\*+$/, '')
    .trim();
}

function pickColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const cand of candidates) {
    const candNorm = normalizeHeader(cand);
    const idx = normalized.indexOf(candNorm);
    if (idx >= 0) return idx;
  }
  return -1;
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const raw = String(value).trim().replace(',', '.');
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function detectAnimalType(recipeName: string): 'cattle' | 'sheep' | 'goat' | 'other' {
  const n = normalizeHeader(recipeName);
  if (!n) return 'other';
  if (/(KUZU|BAFREN|XOMALE|KAL|TELE)/.test(n)) return 'sheep';
  if (/(DANA|SIGIR|SIĞIR|KARSI|STEK|STEAK|BRISKET|RIB|RUMP)/.test(n)) return 'cattle';
  if (/(KECI|KEÇI|TIHI|TEKE)/.test(n)) return 'goat';
  return 'other';
}

/**
 * Excel satırlarını doğrular ve normalize eder.
 * `sheetRows` genelde `XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })` çıktısı.
 * İlk satır başlıktır.
 */
export function parseButcherRecipeExcel(sheetRows: unknown[][]): ButcherRecipeExcelValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: ButcherRecipeExcelRow[] = [];

  if (!Array.isArray(sheetRows) || sheetRows.length < 2) {
    return { ok: false, errors: ['Excel boş veya yalnız başlık satırı içeriyor.'], warnings, rows };
  }

  const headers = (sheetRows[0] as unknown[]).map((h) => String(h ?? ''));
  const codeIdx = pickColumn(headers, HEADER_KEYS.code);
  const nameIdx = pickColumn(headers, HEADER_KEYS.name);
  const barkodIdx = pickColumn(headers, HEADER_KEYS.barkod);
  const outputKgIdx = pickColumn(headers, HEADER_KEYS.outputKg);
  const ratioIdx = pickColumn(headers, HEADER_KEYS.ratio);
  const recipeIdx = pickColumn(headers, HEADER_KEYS.recipeName);
  const unitIdx = pickColumn(headers, HEADER_KEYS.unit);
  const purchaseIdx = pickColumn(headers, HEADER_KEYS.purchasePrice);
  const saleIdx = pickColumn(headers, HEADER_KEYS.salePrice);

  // Kolon harfleri (Excel 1-indexed → 0-indexed array): D=3, E=4, F=5, G=6
  const COL_LETTER_TO_IDX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11 };

  // Bazı Excel şablonlarında (ör. kasap Ürünler_YYYY-MM-DD.xlsx) yüzde/kg için
  // açık sütun başlığı yoktur; bunun yerine konumsal kolonlar kullanılır ve
  // COME FROM (reçete adı) değerine göre hangi kolonun geçerli olduğu anlaşılır.
  // GOLK ailesi → D (yüzde) + E (kg)
  // KALASHE KAML ailesi → F (yüzde) + G (kg)
  const ratioIdxFallback = ratioIdx >= 0
    ? ratioIdx
    : (recipeIdx >= 0
      ? -1 // aşağıda satır bazında çözülecek
      : -1);
  const outputKgIdxFallback = outputKgIdx >= 0
    ? outputKgIdx
    : (recipeIdx >= 0
      ? -1 // aşağıda satır bazında çözülecek
      : -1);

  function pickPositionalForRecipe(recipeNameRaw: string, kind: 'ratio' | 'kg'): number {
    const n = normalizeHeader(recipeNameRaw);
    // KALASHE KAML ailesi → F (5) / G (6)
    if (/(KALASHE|KAML)/.test(n)) {
      return COL_LETTER_TO_IDX[kind === 'ratio' ? 'F' : 'G'];
    }
    // GOLK / SINGE / FROZEN vb. → D (3) / E (4)
    return COL_LETTER_TO_IDX[kind === 'ratio' ? 'D' : 'E'];
  }

  if (codeIdx < 0) errors.push('"Ürün Kodu" sütunu bulunamadı.');
  if (nameIdx < 0) errors.push('"Ürün Adı" sütunu bulunamadı.');
  if (recipeIdx < 0) errors.push('"Reçete Adı" sütunu bulunamadı.');

  if (errors.length) {
    return { ok: false, errors, warnings, rows };
  }

  for (let i = 1; i < sheetRows.length; i++) {
    const row = sheetRows[i] as unknown[];
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;

    const code = String(row[codeIdx] ?? '').trim();
    const name = String(row[nameIdx] ?? '').trim();
    if (!code && !name) continue;
    if (!code) {
      warnings.push(`Satır ${i + 1}: Ürün kodu boş, atlandı.`);
      continue;
    }
    if (!name) {
      warnings.push(`Satır ${i + 1}: Ürün adı boş, atlandı.`);
      continue;
    }

    const recipeName = String(row[recipeIdx] ?? '').trim();
    if (!recipeName) {
      warnings.push(`Satır ${i + 1}: Reçete adı boş, atlandı.`);
      continue;
    }

    const unit = unitIdx >= 0 ? String(row[unitIdx] ?? '').trim() : '';
    const unitNormalized = unit.toUpperCase().replace(/İ/g, 'I');
    if (unitNormalized && !/(KG|KILOG|KILOGRAM|GR|GRAM|LT|LITRE|LITER|ADET|PCS)/.test(unitNormalized)) {
      warnings.push(`Satır ${i + 1}: Tanınmayan birim "${unit}", yine de alınıyor.`);
    }

    const ratioCellIdx = ratioIdx >= 0
      ? ratioIdx
      : pickPositionalForRecipe(recipeName, 'ratio');
    const kgCellIdx = outputKgIdx >= 0
      ? outputKgIdx
      : pickPositionalForRecipe(recipeName, 'kg');
    const ratio = ratioCellIdx >= 0 ? toNumber(row[ratioCellIdx]) : undefined;
    if (ratio !== undefined && (ratio < 0 || ratio > 100)) {
      warnings.push(`Satır ${i + 1}: Yüzde ${ratio} aralık dışı (0-100), yine de alınıyor.`);
    }

    rows.push({
      rowIndex: i + 1,
      recipeName,
      animalType: detectAnimalType(recipeName),
      outputProductCode: code,
      outputProductName: name,
      outputBarkod: barkodIdx >= 0 ? String(row[barkodIdx] ?? '').trim() || undefined : undefined,
      outputKg: kgCellIdx >= 0 ? toNumber(row[kgCellIdx]) : undefined,
      standardRatioPercent: ratio,
      unit: unit || undefined,
      purchasePrice: purchaseIdx >= 0 ? toNumber(row[purchaseIdx]) : undefined,
      salePrice: saleIdx >= 0 ? toNumber(row[saleIdx]) : undefined,
    });
  }

  if (!rows.length) {
    errors.push('Geçerli satır bulunamadı. Başlık satırı haricinde tüm satırlar boş.');
    return { ok: false, errors, warnings, rows };
  }

  const recipeStats = new Map<string, { count: number; pctSum: number; kgSum: number }>();
  for (const r of rows) {
    const s = recipeStats.get(r.recipeName) ?? { count: 0, pctSum: 0, kgSum: 0 };
    s.count += 1;
    s.pctSum += r.standardRatioPercent ?? 0;
    s.kgSum += r.outputKg ?? 0;
    recipeStats.set(r.recipeName, s);
  }
  for (const [name, s] of recipeStats) {
    if (s.pctSum > 0 && (s.pctSum < 90 || s.pctSum > 110)) {
      warnings.push(
        `Reçete "${name}": yüzdeler toplamı ${s.pctSum.toFixed(2)}% — %100 civarı beklenir.`,
      );
    }
  }

  return { ok: true, errors, warnings, rows };
}

export interface RecipeGroup {
  recipeName: string;
  animalType: 'cattle' | 'sheep' | 'goat' | 'other';
  totalPercent: number;
  totalKg: number;
  rows: ButcherRecipeExcelRow[];
}

/**
 * Parse edilmiş satırları `RECETE ADI`'na göre gruplar (DB import için).
 */
export function groupRowsByRecipe(rows: ButcherRecipeExcelRow[]): RecipeGroup[] {
  const map = new Map<string, RecipeGroup>();
  for (const r of rows) {
    const g = map.get(r.recipeName) ?? {
      recipeName: r.recipeName,
      animalType: r.animalType,
      totalPercent: 0,
      totalKg: 0,
      rows: [],
    };
    g.totalPercent += r.standardRatioPercent ?? 0;
    g.totalKg += r.outputKg ?? 0;
    g.rows.push(r);
    map.set(r.recipeName, g);
  }
  return [...map.values()].sort((a, b) => a.recipeName.localeCompare(b.recipeName, 'tr'));
}

/**
 * Body kabul eden workbook array buffer veya dosya yolu.
 * Tarayıcıda `FileReader`/`arrayBuffer`, Node'da `fs.readFileSync` ile kullanılır.
 */
export async function parseButcherRecipeExcelFromBuffer(
  buf: ArrayBuffer | Uint8Array,
): Promise<ButcherRecipeExcelValidation> {
  // Dinamik import: bundle'da xlsx ağır; build-time yüklenmesin
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  if (!wb.SheetNames.length) {
    return { ok: false, errors: ['Excel hiçbir sayfa içermiyor.'], warnings: [], rows: [] };
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  return parseButcherRecipeExcel(data);
}
