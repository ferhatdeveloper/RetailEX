/**
 * Ürün kartı → malzeme raporları ortak alanları.
 * DB: special_code_1, brand, category_code (yedek: category).
 */
export type ProductCardReportFields = {
  specialCode: string;
  brand: string;
  category: string;
};

type ProductCardSource = {
  specialCode1?: unknown;
  special_code_1?: unknown;
  specialCode?: unknown;
  special_code?: unknown;
  brand?: unknown;
  categoryCode?: unknown;
  category_code?: unknown;
  category?: unknown;
};

export function productCardReportFields(
  source: ProductCardSource | null | undefined,
): ProductCardReportFields {
  if (!source) return { specialCode: '', brand: '', category: '' };
  return {
    specialCode: String(
      source.specialCode1 ??
        source.special_code_1 ??
        source.specialCode ??
        source.special_code ??
        '',
    ).trim(),
    brand: String(source.brand ?? '').trim(),
    category: String(
      source.categoryCode ?? source.category_code ?? source.category ?? '',
    ).trim(),
  };
}

/** SQL SELECT parçası — products alias `p` */
export const SQL_PRODUCT_CARD_REPORT_FIELDS = `
  COALESCE(NULLIF(TRIM(p.special_code_1), ''), '') AS special_code,
  COALESCE(NULLIF(TRIM(p.brand), ''), '') AS brand,
  COALESCE(NULLIF(TRIM(p.category_code), ''), '') AS category
`.trim();
