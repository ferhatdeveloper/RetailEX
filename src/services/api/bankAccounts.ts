/**
 * ExRetailOS - Bank Accounts API Service
 */

import { projectId, publicAnonKey } from '../../utils/supabase/info';

const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/bank-accounts`;

export async function fetchBankAccounts(firmaId: string) {
  const response = await fetch(`${API_URL}?firma_id=${firmaId}`, {
    headers: { 'Authorization': `Bearer ${publicAnonKey}` }
  });

  if (!response.ok) throw new Error('Failed to fetch bank accounts');
  const data = await response.json();
  return data.accounts || [];
}

export async function createBankAccount(account: any) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(account)
  });

  if (!response.ok) throw new Error('Failed to create bank account');
  return await response.json();
}

export async function updateBankAccount(id: string, updates: any) {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) throw new Error('Failed to update bank account');
  return await response.json();
}

export async function deleteBankAccount(id: string) {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${publicAnonKey}` }
  });

  if (!response.ok) throw new Error('Failed to delete bank account');
  return await response.json();
}

export async function createBankTransaction(accountId: string, transaction: any) {
  const response = await fetch(`${API_URL}/${accountId}/transactions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(transaction)
  });

  if (!response.ok) throw new Error('Failed to create transaction');
  return await response.json();
}

export async function fetchBankStatement(accountId: string, baslangic?: string, bitis?: string) {
  const params = new URLSearchParams();
  if (baslangic) params.append('baslangic_tarihi', baslangic);
  if (bitis) params.append('bitis_tarihi', bitis);

  const response = await fetch(`${API_URL}/${accountId}/statement?${params}`, {
    headers: { 'Authorization': `Bearer ${publicAnonKey}` }
  });

  if (!response.ok) throw new Error('Failed to fetch statement');
  return await response.json();
}


