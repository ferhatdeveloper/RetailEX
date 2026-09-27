/**
 * Ürün kartı → malzeme raporları ortak alanları.
 * DB: special_code_1..6, brand, group_code, category_code (yedek: category).
 * Envanter / Ambar Durum ile aynı: 6 özel kod klonu.
 */

export const PRODUCT_SPECIAL_CODE_COUNT = 6 as const;

export const PRODUCT_SPECIAL_CODE_INDEXES = [1, 2, 3, 4, 5, 6] as const;

export type ProductSpecialCodeIndex = (typeof PRODUCT_SPECIAL_CODE_INDEXES)[number];

export type ProductCardReportFields = {
  specialCode1: string;
  specialCode2: string;
  specialCode3: string;
  specialCode4: string;
  specialCode5: string;
  specialCode6: string;
  /** Geriye uyum — specialCode1 ile aynı */
  specialCode: string;
  brand: string;
  /** products.group_code / groupCode */
  group: string;
  category: string;
};

type ProductCardSource = {
  specialCode1?: unknown;
  specialCode2?: unknown;
  specialCode3?: unknown;
  specialCode4?: unknown;
  specialCode5?: unknown;
  specialCode6?: unknown;
  special_code_1?: unknown;
  special_code_2?: unknown;
  special_code_3?: unknown;
  special_code_4?: unknown;
  special_code_5?: unknown;
  special_code_6?: unknown;
  specialCode?: unknown;
  special_code?: unknown;
  brand?: unknown;
  group?: unknown;
  groupCode?: unknown;
  group_code?: unknown;
  categoryCode?: unknown;
  category_code?: unknown;
  category?: unknown;
};

function trimStr(v: unknown): string {
  return v != null && String(v).trim() !== '' ? String(v).trim() : '';
}

function pickSpecialCode(source: ProductCardSource, n: ProductSpecialCodeIndex): string {
  const camel = `specialCode${n}` as keyof ProductCardSource;
  const snake = `special_code_${n}` as keyof ProductCardSource;
  const fromN = trimStr(source[camel]) || trimStr(source[snake]);
  if (fromN) return fromN;
  // 1 için eski tek alan yedekleri
  if (n === 1) {
    return trimStr(source.specialCode) || trimStr(source.special_code);
  }
  return '';
}

export function productCardReportFields(
  source: ProductCardSource | null | undefined,
): ProductCardReportFields {
  if (!source) {
    return {
      specialCode1: '',
      specialCode2: '',
      specialCode3: '',
      specialCode4: '',
      specialCode5: '',
      specialCode6: '',
      specialCode: '',
      brand: '',
      group: '',
      category: '',
    };
  }
  const specialCode1 = pickSpecialCode(source, 1);
  const specialCode2 = pickSpecialCode(source, 2);
  const specialCode3 = pickSpecialCode(source, 3);
  const specialCode4 = pickSpecialCode(source, 4);
  const specialCode5 = pickSpecialCode(source, 5);
  const specialCode6 = pickSpecialCode(source, 6);
  return {
    specialCode1,
    specialCode2,
    specialCode3,
    specialCode4,
    specialCode5,
    specialCode6,
    specialCode: specialCode1,
    brand: trimStr(source.brand),
    group: trimStr(source.group ?? source.groupCode ?? source.group_code ?? ''),
    category: trimStr(
      source.categoryCode ?? source.category_code ?? source.category ?? '',
    ),
  };
}

/** SQL SELECT parçası — products alias `p`. special_code = special_code_1 (geriye uyum). */
export const SQL_PRODUCT_CARD_REPORT_FIELDS = `
  COALESCE(NULLIF(TRIM(p.special_code_1), ''), '') AS special_code_1,
  COALESCE(NULLIF(TRIM(p.special_code_2), ''), '') AS special_code_2,
  COALESCE(NULLIF(TRIM(p.special_code_3), ''), '') AS special_code_3,
  COALESCE(NULLIF(TRIM(p.special_code_4), ''), '') AS special_code_4,
  COALESCE(NULLIF(TRIM(p.special_code_5), ''), '') AS special_code_5,
  COALESCE(NULLIF(TRIM(p.special_code_6), ''), '') AS special_code_6,
  COALESCE(NULLIF(TRIM(p.special_code_1), ''), '') AS special_code,
  COALESCE(NULLIF(TRIM(p.brand), ''), '') AS brand,
  COALESCE(NULLIF(TRIM(p.group_code), ''), '') AS group_code,
  COALESCE(NULLIF(TRIM(p.category_code), ''), '') AS category
`.trim();

/**
 * Varsayılan kolon görünürlüğü (camelCase id).
 * Özel Kod 1 + Marka + Grup + Kategori açık; Özel Kod 2–6 menüde, varsayılan gizli.
 */
export const DEFAULT_PRODUCT_CARD_COLUMN_VISIBILITY: Record<string, boolean> = {
  specialCode1: true,
  specialCode2: false,
  specialCode3: false,
  specialCode4: false,
  specialCode5: false,
  specialCode6: false,
  brand: true,
  group: true,
  groupCode: true,
  category: true,
};

/** Geriye uyum — yalnızca özel kod anahtarları */
export const DEFAULT_SPECIAL_CODE_COLUMN_VISIBILITY: Record<string, boolean> =
  DEFAULT_PRODUCT_CARD_COLUMN_VISIBILITY;

/** snake_case id’ler (special_code_1…) */
export const DEFAULT_PRODUCT_CARD_COLUMN_VISIBILITY_SNAKE: Record<string, boolean> = {
  special_code_1: true,
  special_code_2: false,
  special_code_3: false,
  special_code_4: false,
  special_code_5: false,
  special_code_6: false,
  brand: true,
  group: true,
  group_code: true,
  category: true,
};

/** Geriye uyum */
export const DEFAULT_SPECIAL_CODE_COLUMN_VISIBILITY_SNAKE: Record<string, boolean> =
  DEFAULT_PRODUCT_CARD_COLUMN_VISIBILITY_SNAKE;

/** Özel Kod (1) / Özel Kod 2 … */
export function specialCodeColumnHeader(
  tm: (key: string) => string,
  n: number,
): string {
  const base = tm('specialCode');
  const label = !base || base === 'specialCode' ? 'Özel Kod' : base;
  return n <= 1 ? label : `${label} ${n}`;
}

export function productCardGroupHeader(tm: (key: string) => string): string {
  const v = tm('groupCode');
  return !v || v === 'groupCode' ? 'Grup' : v;
}

/** API / satır eşlemesi — snake_case (+ group) */
export function mapSqlRowProductCardFields(r: Record<string, unknown> | null | undefined): {
  special_code_1: string;
  special_code_2: string;
  special_code_3: string;
  special_code_4: string;
  special_code_5: string;
  special_code_6: string;
  special_code: string;
  brand: string;
  group: string;
  group_code: string;
  category: string;
} {
  const card = productCardReportFields(r as ProductCardSource);
  return {
    special_code_1: card.specialCode1,
    special_code_2: card.specialCode2,
    special_code_3: card.specialCode3,
    special_code_4: card.specialCode4,
    special_code_5: card.specialCode5,
    special_code_6: card.specialCode6,
    special_code: card.specialCode1,
    brand: card.brand,
    group: card.group,
    group_code: card.group,
    category: card.category,
  };
}

/** camelCase satır alanları (specialCode1…) */
export function productCardCodesCamel(card: ProductCardReportFields): {
  specialCode1: string;
  specialCode2: string;
  specialCode3: string;
  specialCode4: string;
  specialCode5: string;
  specialCode6: string;
  specialCode: string;
  brand: string;
  group: string;
  category: string;
} {
  return {
    specialCode1: card.specialCode1,
    specialCode2: card.specialCode2,
    specialCode3: card.specialCode3,
    specialCode4: card.specialCode4,
    specialCode5: card.specialCode5,
    specialCode6: card.specialCode6,
    specialCode: card.specialCode1,
    brand: card.brand,
    group: card.group,
    category: card.category,
  };
}

/** snake_case satır alanları (special_code_1…) */
export function productCardCodesSnake(card: ProductCardReportFields): {
  special_code_1: string;
  special_code_2: string;
  special_code_3: string;
  special_code_4: string;
  special_code_5: string;
  special_code_6: string;
  special_code: string;
  brand: string;
  group: string;
  group_code: string;
  category: string;
} {
  return {
    special_code_1: card.specialCode1,
    special_code_2: card.specialCode2,
    special_code_3: card.specialCode3,
    special_code_4: card.specialCode4,
    special_code_5: card.specialCode5,
    special_code_6: card.specialCode6,
    special_code: card.specialCode1,
    brand: card.brand,
    group: card.group,
    group_code: card.group,
    category: card.category,
  };
}

/** buildReportGridColumns için ürün kartı kolon tanımları (Malzeme Adı sonrası sıra). */
export function productCardReportGridColumnDefs(
  tm: (key: string) => string,
  opts?: {
    /** Label satır alanları (ExtractGridRow: specialCode1Label…) */
    labelSuffix?: boolean;
    emptyDisplay?: string;
  },
): Array<{
  id: string;
  header: string;
  size: number;
  cell: (r: Record<string, unknown>) => string;
}> {
  const empty = opts?.emptyDisplay ?? '';
  const cellOf = (key: string) => (r: Record<string, unknown>) => {
    const v = r[key];
    return v != null && String(v).trim() !== '' ? String(v).trim() : empty;
  };
  const specialCols = PRODUCT_SPECIAL_CODE_INDEXES.map((n) => {
    const id = opts?.labelSuffix ? `specialCode${n}Label` : `specialCode${n}`;
    return {
      id,
      header: specialCodeColumnHeader(tm, n),
      size: 110,
      cell: cellOf(id),
    };
  });
  return [
    ...specialCols,
    {
      id: opts?.labelSuffix ? 'brandLabel' : 'brand',
      header: tm('brand') || 'Marka',
      size: 110,
      cell: cellOf(opts?.labelSuffix ? 'brandLabel' : 'brand'),
    },
    {
      id: opts?.labelSuffix ? 'groupLabel' : 'group',
      header: productCardGroupHeader(tm),
      size: 110,
      cell: cellOf(opts?.labelSuffix ? 'groupLabel' : 'group'),
    },
    {
      id: opts?.labelSuffix ? 'categoryLabel' : 'category',
      header: tm('category') || 'Kategori',
      size: 120,
      cell: cellOf(opts?.labelSuffix ? 'categoryLabel' : 'category'),
    },
  ];
}
