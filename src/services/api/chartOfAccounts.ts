/**
 * ExRetailOS - Chart of Accounts API Service
 */

import { projectId, publicAnonKey } from '../../utils/supabase/info';

const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/chart-of-accounts`;

export async function fetchChartOfAccounts(firmaId: string) {
  const response = await fetch(`${API_URL}?firma_id=${firmaId}`, {
    headers: { 'Authorization': `Bearer ${publicAnonKey}` }
  });

  if (!response.ok) throw new Error('Failed to fetch chart of accounts');
  const data = await response.json();
  return data.accounts || [];
}

export async function createAccount(account: any) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(account)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create account');
  }
  return await response.json();
}

export async function updateAccount(id: string, updates: any) {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) throw new Error('Failed to update account');
  return await response.json();
}

export async function deleteAccount(id: string) {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${publicAnonKey}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete account');
  }
  return await response.json();
}

export async function importTDHP(firmaId: string) {
  const response = await fetch(`${API_URL}/import-tdhp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ firma_id: firmaId })
  });

  if (!response.ok) throw new Error('Failed to import TDHP');
  return await response.json();
}

export async function fetchAccountHierarchy(firmaId: string) {
  const response = await fetch(`${API_URL}/hierarchy/tree?firma_id=${firmaId}`, {
    headers: { 'Authorization': `Bearer ${publicAnonKey}` }
  });

  if (!response.ok) throw new Error('Failed to fetch hierarchy');
  const data = await response.json();
  return data.tree || [];
}


