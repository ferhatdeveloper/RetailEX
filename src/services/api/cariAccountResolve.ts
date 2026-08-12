/**
 * Cari hesap çözümleme — aynı kod hem müşteri hem tedarikçi tablosunda ise müşteri esas alınır.
 * (Berzin vb.: TED-* tedarikçi olarak açılmış, satış/tahsilat müşteri UUID'sinde.)
 */
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import {
  normalizeFirmTableNr,
  firmCustomersTable,
  firmSuppliersTable,
  normalizeAccountName,
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
        { select: 'id,code,name', id: `eq.${id}`, limit: '1' },
        { schema: 'public' },
      )
      .catch(() => [] as any[]);
    const supHit = Array.isArray(supRows) ? supRows[0] : null;
    // Seçili firmada ne müşteri ne tedarikçi — id'yi körlemesine kabul etme (yanlış firmaya tahsilat)
    if (!supHit?.id) return { id: '', cardType: 'customer', code: undefined };

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

    const supName = String(supHit.name || '').trim();
    if (supName) {
      const allCust = await postgrest
        .get<any[]>(
          `/${custTable}`,
          { select: 'id,code,name', firm_nr: `eq.${firmNr}`, limit: '5000' },
          { schema: 'public' },
        )
        .catch(() => [] as any[]);
      const nameKey = normalizeAccountName(supName);
      const pairByName = (Array.isArray(allCust) ? allCust : []).find(
        (c) => normalizeAccountName(c.name) === nameKey,
      );
      if (pairByName?.id) {
        return {
          id: String(pairByName.id),
          cardType: 'customer',
          code: pairByName.code,
        };
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
    `SELECT id, code, name FROM ${supTable} WHERE id = $1::uuid LIMIT 1`,
    [id],
  );
  const supRow = supDirect[0];
  // Seçili firmada kayıt yok — yanlış firmaya tahsilat yazılmasını engelle
  if (!supRow?.id) return { id: '', cardType: 'customer' };

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

  const supName = String(supRow.name || '').trim();
  if (supName) {
    const { rows: custByName } = await postgres.query(
      `SELECT id, code FROM ${custTable}
       WHERE firm_nr = $1::text
         AND TRIM(LOWER(name)) = TRIM(LOWER($2::text))
       LIMIT 1`,
      [firmNr, supName],
    );
    if (custByName[0]?.id) {
      return {
        id: String(custByName[0].id),
        cardType: 'customer',
        code: custByName[0].code,
      };
    }
  }

  return { id: String(supRow.id), cardType: 'supplier', code: supRow.code };
}

/**
 * Tahsilat/ödeme öncesi: cari seçili firmada olmalı.
 * UUID başka firmadaysa kod/ünvan ile bu firmada eşleşen kartı bulur; yoksa hata fırlatır.
 */
export async function ensureCariAccountInCurrentFirm(
  accountId: string,
  opts?: { code?: string | null; name?: string | null },
): Promise<CanonicalCariAccount> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const canon = await resolveCanonicalCariAccountId(accountId);
  if (canon.id) return canon;

  const code = normalizeCariCode(opts?.code);
  const nameKey = normalizeAccountName(opts?.name);

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const custTable = firmCustomersTable(firmNr);
    const supTable = firmSuppliersTable(firmNr);

    if (code) {
      const custByCode = await postgrest
        .get<any[]>(
          `/${custTable}`,
          { select: 'id,code', code: `eq.${code}`, firm_nr: `eq.${firmNr}`, limit: '1' },
          { schema: 'public' },
        )
        .catch(() => [] as any[]);
      const hit = Array.isArray(custByCode) ? custByCode[0] : null;
      if (hit?.id) return { id: String(hit.id), cardType: 'customer', code: hit.code || code };

      const supByCode = await postgrest
        .get<any[]>(
          `/${supTable}`,
          { select: 'id,code', code: `eq.${code}`, limit: '1' },
          { schema: 'public' },
        )
        .catch(() => [] as any[]);
      const sHit = Array.isArray(supByCode) ? supByCode[0] : null;
      if (sHit?.id) return { id: String(sHit.id), cardType: 'supplier', code: sHit.code || code };
    }

    if (nameKey) {
      const allCust = await postgrest
        .get<any[]>(
          `/${custTable}`,
          { select: 'id,code,name', firm_nr: `eq.${firmNr}`, is_active: 'eq.true', limit: '5000' },
          { schema: 'public' },
        )
        .catch(() => [] as any[]);
      const pair = (Array.isArray(allCust) ? allCust : []).find(
        (c) => normalizeAccountName(c.name) === nameKey,
      );
      if (pair?.id) {
        return { id: String(pair.id), cardType: 'customer', code: pair.code };
      }
    }
  } else {
    const custTable = firmCustomersTable(firmNr);
    const supTable = firmSuppliersTable(firmNr);
    if (code) {
      const { rows: custPair } = await postgres.query(
        `SELECT id, code FROM ${custTable}
         WHERE firm_nr = $1::text AND UPPER(TRIM(code)) = $2::text LIMIT 1`,
        [firmNr, code],
      );
      if (custPair[0]?.id) {
        return { id: String(custPair[0].id), cardType: 'customer', code: custPair[0].code || code };
      }
      const { rows: supPair } = await postgres.query(
        `SELECT id, code FROM ${supTable} WHERE UPPER(TRIM(code)) = $1::text LIMIT 1`,
        [code],
      );
      if (supPair[0]?.id) {
        return { id: String(supPair[0].id), cardType: 'supplier', code: supPair[0].code || code };
      }
    }
    if (nameKey) {
      const { rows: byName } = await postgres.query(
        `SELECT id, code FROM ${custTable}
         WHERE firm_nr = $1::text AND is_active = true
           AND TRIM(LOWER(name)) = TRIM(LOWER($2::text))
         LIMIT 1`,
        [firmNr, String(opts?.name || '').trim()],
      );
      if (byName[0]?.id) {
        return { id: String(byName[0].id), cardType: 'customer', code: byName[0].code };
      }
    }
  }

  throw new Error(
    `Cari hesap seçili firmada bulunamadı (firma ${firmNr}). Doğru firmayı seçmeden tahsilat/ödeme kaydedilemez.`,
  );
}

/** Liste: müşteri tablosunda aynı kod veya ünvan varsa tedarikçi kopyasını gösterme */
export function filterSupplierRowsHiddenByCustomerCode<
  T extends { code?: string | null; name?: string | null },
>(suppliers: T[], customers: T[]): T[] {
  const customerCodes = new Set(
    customers.map((c) => normalizeCariCode(c.code)).filter(Boolean),
  );
  const customerNames = new Set(
    customers.map((c) => normalizeAccountName(c.name)).filter(Boolean),
  );
  return suppliers.filter((s) => {
    const code = normalizeCariCode(s.code);
    if (code && customerCodes.has(code)) return false;
    const name = normalizeAccountName(s.name);
    if (name && customerNames.has(name)) return false;
    return true;
  });
}
