/**
 * Kasa / banka — hareket listesi + basit giriş/çıkış (FinanceScreen).
 * Okuma/yazım: `cashApi.ts` (PostgREST → bridge).
 */

import {
  fetchBankRegisters as fetchBankRegistersCash,
  fetchBankMovements as fetchBankMovementsCash,
  fetchCashRegisters as fetchCashRegistersCash,
  fetchCashMovements as fetchCashMovementsCash,
  createSimpleBankMovement as createSimpleBankMovementCash,
  createSimpleCashMovement as createSimpleCashMovementCash,
} from './cashApi';
import { cashTransactionTypeLabel } from './cashTransactionTypes';

export type CashRegisterRow = {
  id: string;
  code: string | null;
  name: string;
  currency_code: string | null;
  balance: number;
  is_active: boolean;
};

export type BankRegisterRow = {
  id: string;
  code: string | null;
  name: string | null;
  bank_name: string | null;
  currency_code: string | null;
  balance: number;
  is_active: boolean;
};

export type CashMovementRow = {
  id: string;
  fiche_no: string | null;
  date: string | null;
  definition: string | null;
  amount: number;
  sign: number;
  transaction_type: string | null;
  register_name: string | null;
};

export type BankMovementRow = CashMovementRow;

export async function fetchCashRegisters(limit = 50): Promise<CashRegisterRow[]> {
  const rows = await fetchCashRegistersCash(limit);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    currency_code: r.currency_code,
    balance: r.balance,
    is_active: r.is_active,
  }));
}

export async function fetchBankRegisters(limit = 50): Promise<BankRegisterRow[]> {
  const rows = await fetchBankRegistersCash(limit);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    bank_name: r.bank_name,
    currency_code: r.currency_code,
    balance: r.balance,
    is_active: r.is_active,
  }));
}

export async function fetchCashMovements(opts?: {
  registerId?: string | null;
  limit?: number;
}): Promise<CashMovementRow[]> {
  const rows = await fetchCashMovementsCash({
    registerId: opts?.registerId,
    limit: opts?.limit,
  });
  return rows.map((r) => ({
    id: r.id,
    fiche_no: r.fiche_no,
    date: r.date,
    definition: r.definition,
    amount: r.amount,
    sign: r.sign,
    transaction_type: r.transaction_type,
    register_name: r.register_name,
  }));
}

export async function fetchBankMovements(opts?: {
  registerId?: string | null;
  limit?: number;
}): Promise<BankMovementRow[]> {
  const rows = await fetchBankMovementsCash({
    registerId: opts?.registerId,
    limit: opts?.limit,
  });
  return rows.map((r) => ({
    id: r.id,
    fiche_no: r.fiche_no,
    date: r.date,
    definition: r.definition,
    amount: r.amount,
    sign: r.sign,
    transaction_type: r.transaction_type,
    register_name: r.register_name,
  }));
}

export async function createSimpleCashMovement(opts: {
  registerId: string;
  amount: number;
  direction: 'in' | 'out';
  date?: string;
  description?: string;
}): Promise<void> {
  await createSimpleCashMovementCash({
    registerId: opts.registerId,
    amount: opts.amount,
    direction: opts.direction,
    date: opts.date,
    description: opts.description,
  });
}

export async function createSimpleBankMovement(opts: {
  registerId: string;
  amount: number;
  direction: 'in' | 'out';
  date?: string;
  description?: string;
}): Promise<void> {
  await createSimpleBankMovementCash({
    registerId: opts.registerId,
    amount: opts.amount,
    direction: opts.direction,
    date: opts.date,
    description: opts.description,
  });
}

export function movementTypeLabel(type: string | null | undefined, sign: number): string {
  return cashTransactionTypeLabel(type, sign);
}
