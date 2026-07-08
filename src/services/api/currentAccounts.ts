/**
 * ExRetailOS - Current Accounts API Service
 * Unified access to Customers and Suppliers
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { customerAPI } from './customers';
import { supplierAPI } from './suppliers';

export interface CurrentAccount {
  id: string;
  firma_id: string;
  kod: string;
  unvan: string;
  tip: 'MUSTERI' | 'TEDARIKCI' | 'HER_IKISI';
  cardType?: 'customer' | 'supplier';
  /** Defter bakiyesi (B/A yönü için ham değer) */
  ledgerBalance?: number;
  vergi_no?: string;
  vergi_dairesi?: string;
  adres?: string;
  telefon?: string;
  email?: string;
  kredi_limiti: number;
  vade_suresi: number;
  odeme_sekli?: string;
  risk_grubu?: string;
  borc_bakiye: number;
  alacak_bakiye: number;
  bakiye: number;
  aktif: boolean;
  created_at: string;
  updated_at?: string;
}

export async function fetchCurrentAccounts(_firmaId: string, tip?: string): Promise<CurrentAccount[]> {
  try {
    /** supplierAPI.getAll zaten müşteri + tedarikçi birleşik listesini döner; customerAPI ile tekrar çekmek mükerrer satır üretir (kasa tahsilat listesi vb.). */
    let cardType: 'all' | 'customer' | 'supplier' = 'all';
    if (tip === 'MUSTERI') cardType = 'customer';
    else if (tip === 'TEDARIKCI') cardType = 'supplier';

    const rows = await supplierAPI.getAll({ cardType });
    const accounts = rows.map((row) =>
      row.cardType === 'customer' ? mapCustomerToCurrentAccount(row) : mapSupplierToCurrentAccount(row),
    );

    return accounts.sort((a, b) => a.unvan.localeCompare(b.unvan, 'tr'));
  } catch (error) {
    console.error('fetchCurrentAccounts failed:', error);
    return [];
  }
}

function mapCustomerToCurrentAccount(c: any): CurrentAccount {
  const rawBal = parseFloat(String(c.balance ?? 0)) || 0;
  return {
    id: c.id,
    firma_id: c.firma_id || ERP_SETTINGS.firmNr,
    kod: c.code || '',
    unvan: c.name,
    tip: 'MUSTERI',
    cardType: 'customer',
    ledgerBalance: rawBal,
    vergi_no: c.tax_number || '',
    vergi_dairesi: c.tax_office || '',
    adres: c.address,
    telefon: c.phone,
    email: c.email,
    kredi_limiti: 0,
    vade_suresi: 30,
    borc_bakiye: (c.balance || 0) > 0 ? (c.balance || 0) : 0,
    alacak_bakiye: (c.balance || 0) < 0 ? Math.abs(c.balance || 0) : 0,
    bakiye: c.balance || 0,
    aktif: c.is_active ?? true,
    created_at: c.created_at || new Date().toISOString()
  };
}

function mapSupplierToCurrentAccount(s: any): CurrentAccount {
  const rawBal = parseFloat(String(s.balance ?? 0)) || 0;
  return {
    id: s.id,
    firma_id: s.firma_id || ERP_SETTINGS.firmNr,
    kod: s.code || '',
    unvan: s.name,
    tip: 'TEDARIKCI',
    cardType: 'supplier',
    ledgerBalance: rawBal,
    vergi_no: s.tax_number || '',
    vergi_dairesi: s.tax_office || '',
    adres: s.address,
    telefon: s.phone,
    email: s.email,
    kredi_limiti: s.credit_limit || 0,
    vade_suresi: s.payment_terms || 30,
    borc_bakiye: 0,
    alacak_bakiye: s.balance || 0,
    bakiye: -(s.balance || 0),
    aktif: s.is_active ?? true,
    created_at: s.created_at || new Date().toISOString()
  };
}

export async function createCurrentAccount(account: any): Promise<CurrentAccount | null> {
  try {
    if (account.tip === 'MUSTERI') {
      // Map to Customer
      const newCustomer = await customerAPI.create({
        code: account.kod, // Accessing code if exists in account object
        name: account.unvan,
        phone: account.telefon,
        email: account.email,
        address: account.adres,
        tax_number: account.vergi_no,
        tax_office: account.vergi_dairesi,
        is_active: account.aktif !== false,
        // Add other fields as needed
      } as any);
      return newCustomer ? mapCustomerToCurrentAccount(newCustomer) : null;
    } else {
      // Map to Supplier
      const newSupplier = await supplierAPI.create({
        code: account.kod,
        name: account.unvan,
        phone: account.telefon,
        email: account.email,
        address: account.adres,
        payment_terms: account.vade_suresi,
        credit_limit: account.kredi_limiti,
        tax_number: account.vergi_no,
        tax_office: account.vergi_dairesi,
        is_active: account.aktif !== false,
      } as any);
      return newSupplier ? mapSupplierToCurrentAccount(newSupplier) : null;
    }
  } catch (error) {
    console.error('createCurrentAccount failed:', error);
    throw error;
  }
}

export async function updateCurrentAccount(id: string, updates: any): Promise<CurrentAccount | null> {
  try {
    // Determine if customer or supplier. Ideally ID should tell us, but for now try both or use hint.
    // If we don't know, we might need to check existence.
    // Optimization: check updates.tip if available

    let customer = await customerAPI.getById(id);
    if (customer) {
      const updated = await customerAPI.update(id, {
        name: updates.unvan,
        phone: updates.telefon,
        email: updates.email,
        address: updates.adres,
        tax_number: updates.vergi_no,
        tax_office: updates.vergi_dairesi,
        is_active: updates.aktif
      } as any);
      return updated ? mapCustomerToCurrentAccount(updated) : null;
    }

    let supplier = await supplierAPI.getById(id);
    if (supplier) {
      const updated = await supplierAPI.update(id, {
        name: updates.unvan,
        phone: updates.telefon,
        email: updates.email,
        address: updates.adres,
        payment_terms: updates.vade_suresi,
        credit_limit: updates.kredi_limiti,
        tax_number: updates.vergi_no,
        tax_office: updates.vergi_dairesi,
        is_active: updates.aktif
      } as any);
      return updated ? mapSupplierToCurrentAccount(updated) : null;
    }

    throw new Error('Account not found');
  } catch (error) {
    console.error('updateCurrentAccount failed:', error);
    throw error;
  }
}

export async function deleteCurrentAccount(id: string) {
  // Try delete from both (soft delete)
  await customerAPI.delete(id);
  await supplierAPI.delete(id, 'supplier');
  return { success: true };
}

export async function fetchAccountStatement(id: string, baslangic?: string, bitis?: string) {
  // Placeholder for statement fetching
  // This requires querying transaction tables which are not fully mapped yet in this context
  console.warn('fetchAccountStatement not fully implemented for PostgreSQL yet');
  return [];
}


