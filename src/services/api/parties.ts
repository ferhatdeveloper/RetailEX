/**
 * Parties API — ortak cari (customer/supplier/employee/partner) CRUD
 *
 * 4 tip tek tabloda yaşar (card_type ile ayrılır). Mevcut customers/suppliers
 * tablolarından bağımsızdır.
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import type { Party, PartyCardType } from '../../core/types/models';

export type { Party, PartyCardType } from '../../core/types/models';

function partiesTable(): string {
  return `rex_${normalizeFirmTableNr(ERP_SETTINGS.firmNr)}_parties`;
}

const PARTY_DB_COLUMNS = new Set([
  'code', 'name', 'card_type', 'phone', 'email', 'address', 'tax_nr', 'tax_office',
  'balance', 'is_active', 'notes', 'salary_base', 'hire_date', 'department', 'position',
  'share_pct', 'capital_contribution', 'partner_role', 'partner_since', 'iban',
  'firm_nr',
  'merged_into_id', 'merged_at', 'merged_by', 'merge_notes',
]);

const ALLOWED_CARD_TYPES: PartyCardType[] = ['customer', 'supplier', 'employee', 'partner'];

export interface PartyListFilter {
  cardType?: PartyCardType | 'all';
  isActive?: boolean;
  search?: string;
}

export const partyAPI = {
  async getAll(filter: PartyListFilter = {}): Promise<Party[]> {
    const conds: string[] = [];
    const params: any[] = [];
    if (filter.cardType && filter.cardType !== 'all') {
      params.push(filter.cardType);
      conds.push(`card_type = $${params.length}::text`);
    }
    if (filter.isActive !== undefined) {
      params.push(filter.isActive);
      conds.push(`is_active = $${params.length}::boolean`);
    }
    if (filter.search) {
      params.push(`%${filter.search}%`);
      conds.push(`(name ILIKE $${params.length}::text OR code ILIKE $${params.length}::text)`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await postgres.query(
      `SELECT * FROM ${partiesTable()} ${where} ORDER BY name ASC`,
      params,
    );
    return (rows || []).map((r: any) => normalizeParty(r));
  },

  async getById(id: string): Promise<Party | null> {
    const { rows } = await postgres.query(
      `SELECT * FROM ${partiesTable()} WHERE id = $1::text::uuid LIMIT 1`,
      [id],
    );
    if (!rows || !rows.length) return null;
    return normalizeParty(rows[0]);
  },

  async create(input: Omit<Party, 'id' | 'created_at' | 'updated_at'>): Promise<Party> {
    if (!ALLOWED_CARD_TYPES.includes(input.card_type)) {
      throw new Error(`Geçersiz card_type: ${input.card_type}`);
    }
    const payload = filterDbColumns(input);
    const cols = Object.keys(payload);
    const placeholders = cols.map((c, i) => `$${i + 1}::text`).join(', ');
    const values = cols.map((c) => formatValue(payload[c]));
    const { rows } = await postgres.query(
      `INSERT INTO ${partiesTable()} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return normalizeParty(rows[0]);
  },

  async update(id: string, patch: Partial<Party>): Promise<Party> {
    const payload = filterDbColumns(patch);
    if ('card_type' in payload && payload.card_type && !ALLOWED_CARD_TYPES.includes(payload.card_type as PartyCardType)) {
      throw new Error(`Geçersiz card_type: ${payload.card_type}`);
    }
    const cols = Object.keys(payload);
    if (!cols.length) {
      const cur = await this.getById(id);
      return cur as Party;
    }
    const setClause = cols.map((c, i) => `${c} = $${i + 1}::text`).join(', ');
    const values = cols.map((c) => formatValue(payload[c]));
    const { rows } = await postgres.query(
      `UPDATE ${partiesTable()} SET ${setClause}, updated_at = NOW() WHERE id = $${values.length + 1}::text::uuid RETURNING *`,
      [...values, id],
    );
    if (!rows || !rows.length) throw new Error('Parti güncellenemedi.');
    return normalizeParty(rows[0]);
  },

  async remove(id: string): Promise<void> {
    await postgres.query(
      `DELETE FROM ${partiesTable()} WHERE id = $1::text::uuid`,
      [id],
    );
  },

  async setActive(id: string, isActive: boolean): Promise<Party> {
    const { rows } = await postgres.query(
      `UPDATE ${partiesTable()} SET is_active = $1::boolean, updated_at = NOW() WHERE id = $2::text::uuid RETURNING *`,
      [isActive, id],
    );
    if (!rows || !rows.length) throw new Error('Parti bulunamadı.');
    return normalizeParty(rows[0]);
  },

  async getBalance(id: string): Promise<number> {
    const { rows } = await postgres.query(
      `SELECT balance FROM ${partiesTable()} WHERE id = $1::text::uuid LIMIT 1`,
      [id],
    );
    return parseFloat(rows?.[0]?.balance || 0);
  },

  async getNextCode(cardType: PartyCardType, prefix: string): Promise<string> {
    const safePrefix = (prefix || cardType.toUpperCase().slice(0, 3)).replace(/[^A-Z0-9]/g, '');
    const { rows } = await postgres.query(
      `SELECT code FROM ${partiesTable()} WHERE card_type = $1::text AND code LIKE $2::text ORDER BY code DESC LIMIT 1`,
      [cardType, `${safePrefix}%`],
    );
    const lastCode = rows?.[0]?.code;
    if (!lastCode) return `${safePrefix}-001`;
    const m = lastCode.match(/(\d+)$/);
    const nextNum = m ? parseInt(m[1], 10) + 1 : 1;
    return `${safePrefix}-${String(nextNum).padStart(3, '0')}`;
  },
};

function filterDbColumns(input: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(input)) {
    if (PARTY_DB_COLUMNS.has(k) && input[k] !== undefined) {
      out[k] = input[k];
    }
  }
  if (!('firm_nr' in out)) {
    out.firm_nr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  }
  return out;
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return v.toString();
  return String(v);
}

function normalizeParty(r: any): Party {
  return {
    id: r.id,
    firm_nr: r.firm_nr,
    code: r.code,
    name: r.name,
    card_type: r.card_type,
    phone: r.phone,
    email: r.email,
    address: r.address,
    tax_nr: r.tax_nr,
    tax_office: r.tax_office,
    balance: parseFloat(r.balance || 0),
    is_active: r.is_active !== false,
    notes: r.notes,
    salary_base: parseFloat(r.salary_base || 0),
    hire_date: r.hire_date,
    department: r.department,
    position: r.position,
    share_pct: parseFloat(r.share_pct || 0),
    capital_contribution: parseFloat(r.capital_contribution || 0),
    partner_role: r.partner_role,
    partner_since: r.partner_since,
    iban: r.iban,
    merged_into_id: r.merged_into_id ?? null,
    merged_at: r.merged_at ?? null,
    merged_by: r.merged_by ?? null,
    merge_notes: r.merge_notes ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
