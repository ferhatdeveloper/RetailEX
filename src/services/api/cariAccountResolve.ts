/**
 * Cari hesap çözümleme — aynı kod hem müşteri hem tedarikçi tablosunda ise müşteri esas alınır.
 * (Berzin vb.: TED-* tedarikçi olarak açılmış, satış/tahsilat müşteri UUID'sinde.)
 */
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import {
  normalizeFirmTableNr,
  firmCustomersTable,
  firmSuppliersTable,
} from './accountBalance';

export function normalizeCariCode(code: string | null | undefined): string {
  return String(code || '').trim().toLocaleUpperCase('tr-TR');
}

export type CanonicalCariAccount = {
  id: string;
  cardType: 'customer' | 'supplier';
  code?: string;
};

/**
 * Tahsilat/ödeme ve kasa satırı için tek cari UUID — müşteri kaydı öncelikli.
 */
export async function resolveCanonicalCariAccountId(
  accountId: string,
): Promise<CanonicalCariAccount> {
  const id = String(accountId || '').trim();
  if (!id) return { id, cardType: 'customer' };

  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const custTable = firmCustomersTable(firmNr);
    const supTable = firmSuppliersTable(firmNr);

    const custRows = await postgrest
      .get<any[]>(
        `/${custTable}`,
        { select: 'id,code', id: `eq.${id}`, firm_nr: `eq.${firmNr}`, limit: '1' },
        { schema: 'public' },
      )
      .catch(() => [] as any[]);
    const custHit = Array.isArray(custRows) ? custRows[0] : null;
    if (custHit?.id) {
      return { id: String(custHit.id), cardType: 'customer', code: custHit.code };
    }

    const supRows = await postgrest
      .get<any[]>(
        `/${supTable}`,
        { select: 'id,code', id: `eq.${id}`, limit: '1' },
        { schema: 'public' },
      )
      .catch(() => [] as any[]);
    const supHit = Array.isArray(supRows) ? supRows[0] : null;
    if (!supHit?.id) return { id, cardType: 'supplier' };

    const code = String(supHit.code || '').trim();
    if (code) {
      const custByCode = await postgrest
        .get<any[]>(
          `/${custTable}`,
          { select: 'id,code', code: `eq.${code}`, firm_nr: `eq.${firmNr}`, limit: '1' },
          { schema: 'public' },
        )
        .catch(() => [] as any[]);
      const pair = Array.isArray(custByCode) ? custByCode[0] : null;
      if (pair?.id) {
        return { id: String(pair.id), cardType: 'customer', code: pair.code || code };
      }
    }

    return { id: String(supHit.id), cardType: 'supplier', code: supHit.code };
  }

  const custTable = firmCustomersTable(firmNr);
  const supTable = firmSuppliersTable(firmNr);

  const { rows: custDirect } = await postgres.query(
    `SELECT id, code FROM ${custTable} WHERE id = $1::uuid AND firm_nr = $2::text LIMIT 1`,
    [id, firmNr],
  );
  if (custDirect[0]?.id) {
    return {
      id: String(custDirect[0].id),
      cardType: 'customer',
      code: custDirect[0].code,
    };
  }

  const { rows: supDirect } = await postgres.query(
    `SELECT id, code FROM ${supTable} WHERE id = $1::uuid LIMIT 1`,
    [id],
  );
  const supRow = supDirect[0];
  if (!supRow?.id) return { id, cardType: 'supplier' };

  const code = String(supRow.code || '').trim();
  if (code) {
    const { rows: custPair } = await postgres.query(
      `SELECT id, code FROM ${custTable}
       WHERE firm_nr = $1::text AND TRIM(code) = $2::text LIMIT 1`,
      [firmNr, code],
    );
    if (custPair[0]?.id) {
      return {
        id: String(custPair[0].id),
        cardType: 'customer',
        code: custPair[0].code || code,
      };
    }
  }

  return { id: String(supRow.id), cardType: 'supplier', code: supRow.code };
}

/** Liste: aynı kod müşteri tablosunda varsa tedarikçi kopyasını gösterme */
export function filterSupplierRowsHiddenByCustomerCode<T extends { code?: string | null }>(
  suppliers: T[],
  customers: T[],
): T[] {
  const customerCodes = new Set(
    customers.map((c) => normalizeCariCode(c.code)).filter(Boolean),
  );
  return suppliers.filter((s) => {
    const code = normalizeCariCode(s.code);
    if (!code) return true;
    return !customerCodes.has(code);
  });
}
