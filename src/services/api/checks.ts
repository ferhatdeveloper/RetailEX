/**
 * ExRetailOS - Checks & Promissory Notes API Service
 * 
 * Backend API integration for check and promissory note management
 * 
 * @created 2024-12-24
 */

import { projectId, publicAnonKey } from '../../utils/supabase/info';

const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/checks`;

export interface CheckPromissoryNote {
  id: string;
  firma_id: string;
  donem_id: string;
  tip: 'CEK' | 'SENET';
  yon: 'ALINAN' | 'VERILEN';
  cek_no: string;
  banka_adi: string;
  hesap_no: string;
  sube: string;
  cari_id: string;
  cari_adi: string;
  tutar: number;
  doviz_kodu: string;
  vade_tarihi: string;
  kesilme_tarihi: string;
  durum: 'PORTFOY' | 'BANKADA' | 'CIRO' | 'TAHSIL' | 'ODEME' | 'KARSILIKSIZ' | 'IADE';
  tahsil_tarihi?: string;
  ciro_edilen_firma?: string;
  aciklama: string;
  created_at: string;
  updated_at: string;
}

// GET all checks
export async function fetchChecks(firmaId: string, donemId?: string, tip?: string, durum?: string) {
  const params = new URLSearchParams({ firma_id: firmaId });
  if (donemId) params.append('donem_id', donemId);
  if (tip) params.append('tip', tip);
  if (durum) params.append('durum', durum);

  const response = await fetch(`${API_URL}?${params}`, {
    headers: { 'Authorization': `Bearer ${publicAnonKey}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch checks');
  }

  const data = await response.json();
  return data.checks || [];
}

// GET single check
export async function fetchCheckById(id: string) {
  const response = await fetch(`${API_URL}/${id}`, {
    headers: { 'Authorization': `Bearer ${publicAnonKey}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch check');
  }

  const data = await response.json();
  return data.check;
}

// POST create check
export async function createCheck(check: Partial<CheckPromissoryNote>) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(check)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create check');
  }

  return await response.json();
}

// PUT update check
export async function updateCheck(id: string, updates: Partial<CheckPromissoryNote>) {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update check');
  }

  return await response.json();
}

// DELETE check
export async function deleteCheck(id: string) {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${publicAnonKey}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete check');
  }

  return await response.json();
}

// POST update check status
export async function updateCheckStatus(id: string, yeniDurum: string, aciklama?: string) {
  const response = await fetch(`${API_URL}/${id}/update-status`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ yeni_durum: yeniDurum, aciklama })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update status');
  }

  return await response.json();
}

// GET expiring soon
export async function fetchExpiringSoonChecks(firmaId: string, days: number = 7) {
  const response = await fetch(`${API_URL}/expiring/soon?firma_id=${firmaId}&days=${days}`, {
    headers: { 'Authorization': `Bearer ${publicAnonKey}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch expiring checks');
  }

  const data = await response.json();
  return data.checks || [];
}


