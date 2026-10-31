/**
 * Gider kategorisi kartını silme planı.
 * Gider satırı, kasa satırı, tutar, işaret, kur ve fiş no silinmez ve değişmez.
 * Pasif yapmak bu planın parçası değildir.
 */

export type ExpenseCategoryFkRef = {
  schemaName: string;
  tableName: string;
  idColumn: string;
  textColumn: string | null;
};

export type SqlStatement = {
  sql: string;
  params: unknown[];
};

export type LinkedExpenseRow = {
  id: string;
  category: string;
  category_id?: string | null;
  amount: number;
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TEXT_COLUMN_ORDER = ['category', 'category_name', 'category_label'] as const;

export function quoteExpenseCategoryIdent(name: string): string {
  const text = String(name || '').trim();
  if (!IDENT.test(text)) {
    throw new Error('Geçersiz tablo veya kolon adı');
  }
  return `"${text}"`;
}

export function pickExpenseCategoryTextColumn(columns: string[], idColumn: string): string | null {
  const present = new Set(columns.map((column) => String(column || '').trim()));
  for (const name of TEXT_COLUMN_ORDER) {
    if (name !== idColumn && present.has(name)) return name;
  }
  return null;
}

export function expenseCategoryRemovalStatements(input: {
  categoryId: string;
  storedLabel: string;
  foreignKeys: ExpenseCategoryFkRef[];
}): SqlStatement[] {
  const statements: SqlStatement[] = [];
  for (const fk of input.foreignKeys) {
    const schema = quoteExpenseCategoryIdent(fk.schemaName);
    const table = quoteExpenseCategoryIdent(fk.tableName);
    const idColumn = quoteExpenseCategoryIdent(fk.idColumn);
    const textColumn = fk.textColumn ? quoteExpenseCategoryIdent(fk.textColumn) : '';
    if (textColumn) {
      statements.push({
        sql: `UPDATE ${schema}.${table}
                 SET ${textColumn} = CASE
                       WHEN ${textColumn} IS NULL OR btrim(${textColumn}::text) = '' THEN $2
                       ELSE ${textColumn}
                     END,
                     ${idColumn} = NULL
               WHERE ${idColumn} = $1`,
        params: [input.categoryId, input.storedLabel],
      });
    } else {
      statements.push({
        sql: `UPDATE ${schema}.${table} SET ${idColumn} = NULL WHERE ${idColumn} = $1`,
        params: [input.categoryId],
      });
    }
  }
  statements.push({
    sql: 'DELETE FROM public.expense_categories WHERE id = $1',
    params: [input.categoryId],
  });
  return statements;
}

/** Silme planı tutara, fiş noya ve pasif bayrağına dokunmaz. Yalnızca kategori kartını siler. */
export function categoryRemovalLeavesMoneyAndExpenseRows(statements: SqlStatement[]): boolean {
  return statements.every((statement) => {
    const sql = statement.sql;
    if (/\bis_active\b/i.test(sql)) return false;
    if (/\bamount\b/i.test(sql)) return false;
    if (/\bfiche_no\b/i.test(sql)) return false;
    if (/\bDELETE\b/i.test(sql) && !/expense_categories/i.test(sql)) return false;
    return true;
  });
}

/**
 * Kategori kimliği kopar. Dolu kategori metni durur. Boşsa kayıtlı ad yazılır.
 * Satır silinmez. Tutar aynı kalır.
 */
export function applyCategoryRemovalToExpenses<T extends LinkedExpenseRow>(
  expenses: T[],
  categoryId: string,
  storedLabel: string,
): T[] {
  return expenses.map((row) => {
    if (String(row.category_id || '') !== categoryId) return { ...row };
    const text = String(row.category || '').trim();
    return {
      ...row,
      category_id: null,
      category: text || storedLabel,
    };
  });
}
