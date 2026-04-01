/**
 * ExcelModule - Kapsamlı Excel İçe/Dışa Aktarım Modülü
 * Desteklenen varlıklar: Ürünler, Cari Hesaplar, Varyantlar, Hizmet Kartları,
 *                        Tedarikçiler, Kategoriler, Stok Hareketleri
 */

import { useState, useCallback } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet, Download, Upload, CheckCircle, XCircle,
  AlertCircle, Loader2, Package, Users, Layers, Wrench,
  Truck, Tag, BarChart3, ChevronRight, RefreshCw, Info
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { productAPI } from '../../services/api/products';
import { customerAPI } from '../../services/api/customers';
import { supplierAPI } from '../../services/api/suppliers';
import { productVariantAPI } from '../../services/api/productVariants';
import { fetchCurrentAccounts, createCurrentAccount } from '../../services/api/currentAccounts';
import { serviceAPI } from '../../services/serviceAPI';
import { categoryAPI } from '../../services/api/masterData';
import { postgres, ERP_SETTINGS } from '../../services/postgres';
import { useProductStore } from '../../store/useProductStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import { useRestaurantStore } from '../restaurant/store/useRestaurantStore';

// ─── Tip tanımları ────────────────────────────────────────────────────────────

type EntityType = 'products' | 'current-accounts' | 'variants' | 'services' | 'suppliers' | 'categories';

interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: { row: number; message: string }[];
}

interface Notification {
  type: 'success' | 'error' | 'info' | 'loading';
  message: string;
}

// ─── Şablon tanımları ─────────────────────────────────────────────────────────

const TEMPLATES: Record<EntityType, { label: string; sheetName: string; sample: any[] }> = {
  products: {
    label: 'Ürünler',
    sheetName: 'Ürünler',
    sample: [
      {
        'Ürün Kodu*': 'URN-001',
        'Ürün Adı*': 'Örnek Ürün',
        'Barkod': '8690000000001',
        'Kategori': 'Giyim',
        'Grup Kodu': 'GRP-01',
        'Marka': 'Marka A',
        'Birim': 'Adet',
        'Alış Fiyatı': 50.00,
        'Satış Fiyatı*': 100.00,
        'KDV Oranı (%)': 18,
        'Min Stok': 5,
        'Max Stok': 200,
        'Özel Kod 1': '',
        'Özel Kod 2': '',
        'Özel Kod 3': '',
        'Açıklama': 'Ürün açıklaması',
        'Aktif (E/H)': 'E',
      },
      {
        'Ürün Kodu*': 'URN-002',
        'Ürün Adı*': 'Örnek Ürün 2',
        'Barkod': '8690000000002',
        'Kategori': 'Elektronik',
        'Grup Kodu': 'GRP-02',
        'Marka': 'Marka B',
        'Birim': 'Adet',
        'Alış Fiyatı': 120.00,
        'Satış Fiyatı*': 250.00,
        'KDV Oranı (%)': 18,
        'Min Stok': 3,
        'Max Stok': 50,
        'Özel Kod 1': '',
        'Özel Kod 2': '',
        'Özel Kod 3': '',
        'Açıklama': '',
        'Aktif (E/H)': 'E',
      },
    ],
  },
  'current-accounts': {
    label: 'Cari Hesaplar',
    sheetName: 'Cari Hesaplar',
    sample: [
      {
        'Hesap Kodu*': 'C-001',
        'Ünvan*': 'Ahmed Al-Rashid Ltd.',
        'Tip (MÜŞTERİ/TEDARİKÇİ)': 'MÜŞTERİ',
        'Telefon': '+964 750 123 4567',
        'E-posta': 'info@example.com',
        'Adres': 'Karrada Mahallesi, 14 Temmuz Caddesi',
        'İlçe': 'Karrada',
        'Şehir': 'Bağdat',
        'Posta Kodu': '10001',
        'Ülke': 'Irak',
        'Vergi No': '123456789',
        'Vergi Dairesi': 'Bağdat V.D.',
        'Kredi Limiti': 50000,
        'Vade Süresi (Gün)': 30,
        'Ödeme Şekli': 'Nakit',
        'İskonto Oranı (%)': 5,
        'Notlar': '',
        'Aktif (E/H)': 'E',
      },
      {
        'Hesap Kodu*': 'T-001',
        'Ünvan*': 'Global Tedarik A.Ş.',
        'Tip (MÜŞTERİ/TEDARİKÇİ)': 'TEDARİKÇİ',
        'Telefon': '+90 212 555 0001',
        'E-posta': 'satis@global.com',
        'Adres': 'İstanbul, Türkiye',
        'İlçe': 'Bağcılar',
        'Şehir': 'İstanbul',
        'Posta Kodu': '34200',
        'Ülke': 'Türkiye',
        'Vergi No': '9876543210',
        'Vergi Dairesi': 'Bağcılar V.D.',
        'Kredi Limiti': 200000,
        'Vade Süresi (Gün)': 45,
        'Ödeme Şekli': 'Havale',
        'İskonto Oranı (%)': 0,
        'Notlar': 'Öncelikli tedarikçi',
        'Aktif (E/H)': 'E',
      },
    ],
  },
  variants: {
    label: 'Varyantlar',
    sheetName: 'Varyantlar',
    sample: [
      {
        'Ürün Kodu*': 'URN-001',
        'Varyant Kodu': 'URN-001-S-MAVİ',
        'Barkod': '8690000000011',
        'Renk': 'Mavi',
        'Beden': 'S',
        'Stok': 20,
        'Alış Fiyatı': 48.00,
        'Satış Fiyatı': 98.00,
      },
      {
        'Ürün Kodu*': 'URN-001',
        'Varyant Kodu': 'URN-001-M-MAVİ',
        'Barkod': '8690000000012',
        'Renk': 'Mavi',
        'Beden': 'M',
        'Stok': 35,
        'Alış Fiyatı': 48.00,
        'Satış Fiyatı': 98.00,
      },
      {
        'Ürün Kodu*': 'URN-001',
        'Varyant Kodu': 'URN-001-L-KIRMIZI',
        'Barkod': '8690000000013',
        'Renk': 'Kırmızı',
        'Beden': 'L',
        'Stok': 15,
        'Alış Fiyatı': 48.00,
        'Satış Fiyatı': 98.00,
      },
    ],
  },
  services: {
    label: 'Hizmet Kartları',
    sheetName: 'Hizmet Kartları',
    sample: [
      {
        'Hizmet Kodu*': 'HZ-001',
        'Hizmet Adı*': 'Teknik Servis',
        'Kategori': 'Bakım',
        'Birim': 'Saat',
        'Birim Fiyat*': 150.00,
        'KDV Oranı (%)': 18,
        'Açıklama': 'Standart teknik servis hizmeti',
        'Aktif (E/H)': 'E',
      },
      {
        'Hizmet Kodu*': 'HZ-002',
        'Hizmet Adı*': 'Kurulum Hizmeti',
        'Kategori': 'Kurulum',
        'Birim': 'Adet',
        'Birim Fiyat*': 500.00,
        'KDV Oranı (%)': 18,
        'Açıklama': 'Cihaz kurulum ve devreye alma',
        'Aktif (E/H)': 'E',
      },
    ],
  },
  suppliers: {
    label: 'Tedarikçiler',
    sheetName: 'Tedarikçiler',
    sample: [
      {
        'Tedarikçi Kodu*': 'T-001',
        'Tedarikçi Adı*': 'Global Tedarik A.Ş.',
        'Telefon': '+90 212 555 0001',
        'Telefon 2': '',
        'E-posta': 'satis@global.com',
        'Adres': 'Bağcılar, İstanbul',
        'İlçe': 'Bağcılar',
        'Şehir': 'İstanbul',
        'Ülke': 'Türkiye',
        'Yetkili Kişi': 'Ali Yılmaz',
        'Yetkili Telefon': '+90 530 555 0001',
        'Vergi No': '9876543210',
        'Vergi Dairesi': 'Bağcılar V.D.',
        'Vade Süresi (Gün)': 45,
        'Kredi Limiti': 200000,
        'Notlar': '',
        'Aktif (E/H)': 'E',
      },
    ],
  },
  categories: {
    label: 'Kategoriler',
    sheetName: 'Kategoriler',
    sample: [
      { 'Kategori Kodu*': 'KAT-001', 'Kategori Adı*': 'Giyim', 'Açıklama': 'Tüm giyim ürünleri', 'Aktif (E/H)': 'E' },
      { 'Kategori Kodu*': 'KAT-002', 'Kategori Adı*': 'Elektronik', 'Açıklama': 'Elektronik ürünler', 'Aktif (E/H)': 'E' },
      { 'Kategori Kodu*': 'KAT-003', 'Kategori Adı*': 'Aksesuar', 'Açıklama': 'Aksesuar ürünleri', 'Aktif (E/H)': 'E' },
    ],
  },
};

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

/** Excel sütun başlıklarını şablonla eşleşecek şekilde normalize eder (boşluk, BOM, * farkları) */
function normalizeRowKeys(row: Record<string, any>, entityType: EntityType): Record<string, any> {
  const keyMap: Record<string, string> = {};
  if (entityType === 'products') {
    keyMap['Ürün Kodu'] = 'Ürün Kodu*';
    keyMap['Ürün Adı'] = 'Ürün Adı*';
    keyMap['Satış Fiyatı'] = 'Satış Fiyatı*';
  } else if (entityType === 'current-accounts') {
    keyMap['Hesap Kodu'] = 'Hesap Kodu*';
    keyMap['Ünvan'] = 'Ünvan*';
  } else if (entityType === 'variants') {
    keyMap['Ürün Kodu'] = 'Ürün Kodu*';
  } else if (entityType === 'services') {
    keyMap['Hizmet Kodu'] = 'Hizmet Kodu*';
    keyMap['Hizmet Adı'] = 'Hizmet Adı*';
    keyMap['Birim Fiyat'] = 'Birim Fiyat*';
  } else if (entityType === 'suppliers') {
    keyMap['Tedarikçi Kodu'] = 'Tedarikçi Kodu*';
    keyMap['Tedarikçi Adı'] = 'Tedarikçi Adı*';
  } else if (entityType === 'categories') {
    keyMap['Kategori Kodu'] = 'Kategori Kodu*';
    keyMap['Kategori Adı'] = 'Kategori Adı*';
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    const trimmed = String(k).replace(/\uFEFF/g, '').trim();
    const base = trimmed.replace(/\*\s*$/, '').trim();
    const canonical = keyMap[base] ?? trimmed;
    out[canonical] = v;
  }
  return out;
}

/** Varlık tipine göre doğru sayfayı döndürür (sayfa adı eşleşmesi) */
function getSheetForImport(workbook: XLSX.WorkBook, entityType: EntityType): XLSX.WorkSheet | null {
  const wanted = TEMPLATES[entityType].sheetName;
  const sheet = workbook.SheetNames.find(n => n.trim() === wanted);
  const ws = sheet ? workbook.Sheets[sheet] : workbook.Sheets[workbook.SheetNames[0]];
  return ws || null;
}

function boolFromExcel(val: any): boolean {
  if (typeof val === 'boolean') return val;
  const s = String(val ?? '').trim().toUpperCase();
  return s === 'E' || s === 'EVET' || s === 'TRUE' || s === '1' || s === 'YES';
}

function numFromExcel(val: any, fallback = 0): number {
  const n = parseFloat(String(val ?? '').replace(',', '.'));
  return isNaN(n) ? fallback : n;
}

function strFromExcel(val: any): string {
  return String(val ?? '').trim();
}

async function downloadExcel(sheetName: string, data: any[], fileName: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  const maxWidth = 30;
  const cols = Object.keys(data[0] ?? {}).map(k => ({ wch: Math.min(Math.max(k.length + 2, 12), maxWidth) }));
  ws['!cols'] = cols;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf: Uint8Array = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  // Tauri: kayıt yeri seçtir
  const savePath = await save({
    defaultPath: fileName,
    filters: [{ name: 'Excel Dosyası', extensions: ['xlsx'] }],
  });
  if (!savePath) return; // kullanıcı iptal etti

  await writeFile(savePath, buf);
}

// ─── Dışa aktarım fonksiyonları ───────────────────────────────────────────────

async function exportProducts(): Promise<void> {
  const products = await productAPI.getAll();
  if (products.length === 0) throw new Error('Dışa aktarılacak ürün bulunamadı.');
  const data = products.map(p => ({
    'Ürün Kodu*': p.code || '',
    'Ürün Adı*': p.name,
    'Barkod': p.barcode || '',
    'Kategori': p.category || '',
    'Grup Kodu': (p as any).group_code || '',
    'Marka': (p as any).brand || '',
    'Birim': p.unit || 'Adet',
    'Alış Fiyatı': p.cost || 0,
    'Satış Fiyatı*': p.price || 0,
    'KDV Oranı (%)': (p as any).vat_rate || 18,
    'Min Stok': p.minStock || p.min_stock || 0,
    'Max Stok': (p as any).max_stock || 0,
    'Özel Kod 1': (p as any).special_code_1 || '',
    'Özel Kod 2': (p as any).special_code_2 || '',
    'Özel Kod 3': (p as any).special_code_3 || '',
    'Açıklama': p.description || '',
    'Aktif (E/H)': p.is_active !== false ? 'E' : 'H',
  }));
  await downloadExcel('Ürünler', data, `Ürünler_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function exportCurrentAccounts(): Promise<void> {
  const accounts = await fetchCurrentAccounts(ERP_SETTINGS.firmNr);
  if (accounts.length === 0) throw new Error('Dışa aktarılacak cari hesap bulunamadı.');
  const data = accounts.map(a => ({
    'Hesap Kodu*': a.kod,
    'Ünvan*': a.unvan,
    'Tip (MÜŞTERİ/TEDARİKÇİ)': a.tip === 'MUSTERI' ? 'MÜŞTERİ' : 'TEDARİKÇİ',
    'Telefon': a.telefon || '',
    'E-posta': a.email || '',
    'Adres': a.adres || '',
    'İlçe': '',
    'Şehir': '',
    'Posta Kodu': '',
    'Ülke': '',
    'Vergi No': a.vergi_no || '',
    'Vergi Dairesi': a.vergi_dairesi || '',
    'Kredi Limiti': a.kredi_limiti || 0,
    'Vade Süresi (Gün)': a.vade_suresi || 30,
    'Ödeme Şekli': a.odeme_sekli || '',
    'İskonto Oranı (%)': 0,
    'Notlar': '',
    'Aktif (E/H)': a.aktif ? 'E' : 'H',
  }));
  await downloadExcel('Cari Hesaplar', data, `CariHesaplar_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function exportVariants(): Promise<void> {
  const products = await productAPI.getAll();
  const rows: any[] = [];
  for (const p of products) {
    const variants = await productVariantAPI.getByProductId(p.id);
    for (const v of variants) {
      rows.push({
        'Ürün Kodu*': p.code || '',
        'Varyant Kodu': v.code || '',
        'Barkod': v.barcode || '',
        'Renk': v.color || '',
        'Beden': v.size || '',
        'Stok': v.stock || 0,
        'Alış Fiyatı': v.cost || 0,
        'Satış Fiyatı': v.price || 0,
      });
    }
  }
  if (rows.length === 0) throw new Error('Dışa aktarılacak varyant bulunamadı.');
  await downloadExcel('Varyantlar', rows, `Varyantlar_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function exportServices(): Promise<void> {
  const services = await serviceAPI.getAll();
  if (services.length === 0) throw new Error('Dışa aktarılacak hizmet kartı bulunamadı.');
  const data = services.map(s => ({
    'Hizmet Kodu*': s.code,
    'Hizmet Adı*': s.name,
    'Kategori': s.category || '',
    'Birim': s.unit || 'Adet',
    'Birim Fiyat*': s.unit_price,
    'KDV Oranı (%)': s.tax_rate || 18,
    'Açıklama': s.description || '',
    'Aktif (E/H)': s.is_active ? 'E' : 'H',
  }));
  await downloadExcel('Hizmet Kartları', data, `HizmetKartlari_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function exportSuppliers(): Promise<void> {
  const suppliers = await supplierAPI.getAll();
  if (suppliers.length === 0) throw new Error('Dışa aktarılacak tedarikçi bulunamadı.');
  const data = suppliers.map(s => ({
    'Tedarikçi Kodu*': s.code || '',
    'Tedarikçi Adı*': s.name,
    'Telefon': s.phone || '',
    'Telefon 2': (s as any).phone2 || '',
    'E-posta': s.email || '',
    'Adres': s.address || '',
    'İlçe': (s as any).district || '',
    'Şehir': (s as any).city || '',
    'Ülke': (s as any).country || '',
    'Yetkili Kişi': (s as any).contact_person || '',
    'Yetkili Telefon': (s as any).contact_person_phone || '',
    'Vergi No': (s as any).tax_number || '',
    'Vergi Dairesi': (s as any).tax_office || '',
    'Vade Süresi (Gün)': (s as any).payment_terms || 30,
    'Kredi Limiti': (s as any).credit_limit || 0,
    'Notlar': (s as any).notes || '',
    'Aktif (E/H)': s.is_active !== false ? 'E' : 'H',
  }));
  await downloadExcel('Tedarikçiler', data, `Tedarikciler_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function exportCategories(): Promise<void> {
  const { rows } = await postgres.query(
    `SELECT code, name, description, is_active FROM categories WHERE firm_nr = $1 ORDER BY name ASC`,
    [ERP_SETTINGS.firmNr]
  );
  if (rows.length === 0) throw new Error('Dışa aktarılacak kategori bulunamadı.');
  const data = rows.map((r: any) => ({
    'Kategori Kodu*': r.code || '',
    'Kategori Adı*': r.name,
    'Açıklama': r.description || '',
    'Aktif (E/H)': r.is_active ? 'E' : 'H',
  }));
  await downloadExcel('Kategoriler', data, `Kategoriler_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ─── İçe aktarım fonksiyonları ────────────────────────────────────────────────

/** Excel'deki ürün satırlarından benzersiz kategori adlarını toplar (boş hariç) */
function getUniqueCategoryNamesFromProductRows(rows: any[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const cat = strFromExcel(row['Kategori'] ?? row['Kategori*']);
    if (cat) set.add(cat);
  }
  return Array.from(set);
}

/** Kategori adından tekil kod üretir (aynı isim her zaman aynı kodu verir) */
function categoryNameToCode(name: string): string {
  const n = name.trim();
  const code = n.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_ĞÜŞÖÇİ]/gi, (ch) => {
    const map: Record<string, string> = { 'Ğ': 'G', 'Ü': 'U', 'Ş': 'S', 'Ö': 'O', 'Ç': 'C', 'İ': 'I' };
    return map[ch] || '';
  }).slice(0, 50);
  return code || `KAT_${Date.now().toString(36)}`;
}

/** Sistemde olmayan kategorileri oluşturur. Aynı isim/kod bir kez eklenir, sonraki aktarımlarda modal çıkmaz. */
async function ensureCategoriesByNames(names: string[]): Promise<void> {
  const existing = await categoryAPI.getAll();
  const existingNames = new Set((existing as any[]).map((c: any) => (c.name || '').trim().toLowerCase()));
  const existingCodes = new Set((existing as any[]).map((c: any) => (c.code || '').trim().toUpperCase()));

  for (const name of names) {
    const n = name.trim();
    if (!n) continue;
    if (existingNames.has(n.toLowerCase())) continue;
    const code = categoryNameToCode(n);
    if (existingCodes.has(code)) continue; // Aynı kodla kayıt varsa ekleme (isim farklı yazılmış olabilir)
    existingCodes.add(code);
    try {
      await postgres.query(
        `INSERT INTO categories (code, name, description, is_active) VALUES ($1, $2, $3, true)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
        [code, n, '']
      );
    } catch (e) {
      console.warn('[ExcelModule] Kategori eklenemedi:', code, n, e);
      try {
        await postgres.query(
          `INSERT INTO categories (code, name, description, firm_nr, is_active) VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (code, firm_nr) DO UPDATE SET name = EXCLUDED.name`,
          [code, n, '', ERP_SETTINGS.firmNr]
        );
      } catch (e2) {
        console.warn('[ExcelModule] Kategori (firm_nr ile) eklenemedi:', e2);
      }
    }
  }
}

async function importProducts(rows: any[]): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, success: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Excel satırı (başlık = 1)
    const code = strFromExcel(row['Ürün Kodu*'] ?? row['Ürün Kodu']);
    const name = strFromExcel(row['Ürün Adı*'] ?? row['Ürün Adı']);
    if (!code || !name) {
      result.failed++;
      result.errors.push({ row: rowNum, message: 'Ürün Kodu ve Ürün Adı zorunludur.' });
      continue;
    }
    const payload = {
      code,
      name,
      barcode: strFromExcel(row['Barkod']),
      category: strFromExcel(row['Kategori']),
      group_code: strFromExcel(row['Grup Kodu']),
      brand: strFromExcel(row['Marka']),
      unit: strFromExcel(row['Birim']) || 'Adet',
      cost: numFromExcel(row['Alış Fiyatı']),
      price: numFromExcel(row['Satış Fiyatı*'] ?? row['Satış Fiyatı']),
      vat_rate: numFromExcel(row['KDV Oranı (%)'], 18),
      min_stock: numFromExcel(row['Min Stok']),
      max_stock: numFromExcel(row['Max Stok']),
      special_code_1: strFromExcel(row['Özel Kod 1']),
      special_code_2: strFromExcel(row['Özel Kod 2']),
      special_code_3: strFromExcel(row['Özel Kod 3']),
      description: strFromExcel(row['Açıklama']),
      is_active: boolFromExcel(row['Aktif (E/H)'] ?? 'E'),
      firm_nr: ERP_SETTINGS.firmNr,
      stock: 0,
    } as any;
    try {
      const existing = await productAPI.getByCode(code);
      if (existing) {
        await productAPI.update(existing.id, {
          name: payload.name,
          barcode: payload.barcode,
          category: payload.category,
          group_code: payload.group_code,
          brand: payload.brand,
          unit: payload.unit,
          cost: payload.cost,
          price: payload.price,
          taxRate: payload.vat_rate,
          min_stock: payload.min_stock,
          max_stock: payload.max_stock,
          specialCode1: payload.special_code_1,
          specialCode2: payload.special_code_2,
          specialCode3: payload.special_code_3,
          description: payload.description,
          isActive: payload.is_active,
        } as any);
        result.success++;
      } else {
        await productAPI.create(payload);
        result.success++;
      }
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: rowNum, message: err?.message || 'Kayıt oluşturulamadı.' });
    }
  }
  return result;
}

async function importCurrentAccounts(rows: any[]): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, success: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const kod = strFromExcel(row['Hesap Kodu*']);
    const unvan = strFromExcel(row['Ünvan*']);
    if (!kod || !unvan) {
      result.failed++;
      result.errors.push({ row: rowNum, message: 'Hesap Kodu ve Ünvan zorunludur.' });
      continue;
    }
    const tipRaw = strFromExcel(row['Tip (MÜŞTERİ/TEDARİKÇİ)']).toUpperCase();
    const tip = tipRaw.includes('TEDAİ') || tipRaw === 'TEDARİKÇİ' || tipRaw === 'TEDARIKCI'
      ? 'TEDARIKCI'
      : 'MUSTERI';
    try {
      await createCurrentAccount({
        kod,
        unvan,
        tip,
        telefon: strFromExcel(row['Telefon']),
        email: strFromExcel(row['E-posta']),
        adres: strFromExcel(row['Adres']),
        vergi_no: strFromExcel(row['Vergi No']),
        vergi_dairesi: strFromExcel(row['Vergi Dairesi']),
        kredi_limiti: numFromExcel(row['Kredi Limiti']),
        vade_suresi: numFromExcel(row['Vade Süresi (Gün)'], 30),
        odeme_sekli: strFromExcel(row['Ödeme Şekli']),
        aktif: boolFromExcel(row['Aktif (E/H)'] ?? 'E'),
      });
      result.success++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: rowNum, message: err?.message || 'Kayıt oluşturulamadı.' });
    }
  }
  return result;
}

async function importVariants(rows: any[]): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, success: 0, failed: 0, errors: [] };
  // Ürün kodunu ID'ye çevirmek için önbellekle
  const productCodeToId: Record<string, string> = {};
  const allProducts = await productAPI.getAll();
  allProducts.forEach(p => { if (p.code) productCodeToId[p.code] = p.id; });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const productCode = strFromExcel(row['Ürün Kodu*']);
    if (!productCode) {
      result.failed++;
      result.errors.push({ row: rowNum, message: 'Ürün Kodu zorunludur.' });
      continue;
    }
    const productId = productCodeToId[productCode];
    if (!productId) {
      result.failed++;
      result.errors.push({ row: rowNum, message: `"${productCode}" kodlu ürün bulunamadı.` });
      continue;
    }
    try {
      await productVariantAPI.create(productId, {
        code: strFromExcel(row['Varyant Kodu']),
        barcode: strFromExcel(row['Barkod']),
        color: strFromExcel(row['Renk']),
        size: strFromExcel(row['Beden']),
        stock: numFromExcel(row['Stok']),
        cost: numFromExcel(row['Alış Fiyatı']),
        price: numFromExcel(row['Satış Fiyatı']),
      } as any);
      result.success++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: rowNum, message: err?.message || 'Varyant oluşturulamadı.' });
    }
  }
  return result;
}

async function importServices(rows: any[]): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, success: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const code = strFromExcel(row['Hizmet Kodu*']);
    const name = strFromExcel(row['Hizmet Adı*']);
    if (!code || !name) {
      result.failed++;
      result.errors.push({ row: rowNum, message: 'Hizmet Kodu ve Hizmet Adı zorunludur.' });
      continue;
    }
    const payload = {
      code,
      name,
      category: strFromExcel(row['Kategori']),
      unit: strFromExcel(row['Birim']) || 'Adet',
      unit_price: numFromExcel(row['Birim Fiyat*']),
      tax_rate: numFromExcel(row['KDV Oranı (%)'], 18),
      description: strFromExcel(row['Açıklama']),
      is_active: boolFromExcel(row['Aktif (E/H)'] ?? 'E'),
    };
    try {
      const existing = await serviceAPI.getByCode(code);
      if (existing) {
        await serviceAPI.update(existing.id, {
          name: payload.name,
          category: payload.category,
          unit: payload.unit,
          unit_price: payload.unit_price,
          tax_rate: payload.tax_rate,
          description: payload.description,
          is_active: payload.is_active,
        });
        result.success++;
      } else {
        await serviceAPI.create(payload);
        result.success++;
      }
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: rowNum, message: err?.message || 'Kayıt oluşturulamadı.' });
    }
  }
  return result;
}

async function importSuppliers(rows: any[]): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, success: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const code = strFromExcel(row['Tedarikçi Kodu*']);
    const name = strFromExcel(row['Tedarikçi Adı*']);
    if (!code || !name) {
      result.failed++;
      result.errors.push({ row: rowNum, message: 'Tedarikçi Kodu ve Adı zorunludur.' });
      continue;
    }
    try {
      await supplierAPI.create({
        code,
        name,
        phone: strFromExcel(row['Telefon']),
        phone2: strFromExcel(row['Telefon 2']),
        email: strFromExcel(row['E-posta']),
        address: strFromExcel(row['Adres']),
        district: strFromExcel(row['İlçe']),
        city: strFromExcel(row['Şehir']),
        country: strFromExcel(row['Ülke']),
        contact_person: strFromExcel(row['Yetkili Kişi']),
        contact_person_phone: strFromExcel(row['Yetkili Telefon']),
        tax_number: strFromExcel(row['Vergi No']),
        tax_office: strFromExcel(row['Vergi Dairesi']),
        payment_terms: numFromExcel(row['Vade Süresi (Gün)'], 30),
        credit_limit: numFromExcel(row['Kredi Limiti']),
        notes: strFromExcel(row['Notlar']),
        is_active: boolFromExcel(row['Aktif (E/H)'] ?? 'E'),
      } as any);
      result.success++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: rowNum, message: err?.message || 'Kayıt oluşturulamadı.' });
    }
  }
  return result;
}

async function importCategories(rows: any[]): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, success: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const code = strFromExcel(row['Kategori Kodu*']);
    const name = strFromExcel(row['Kategori Adı*']);
    if (!code || !name) {
      result.failed++;
      result.errors.push({ row: rowNum, message: 'Kategori Kodu ve Adı zorunludur.' });
      continue;
    }
    try {
      await postgres.query(
        `INSERT INTO categories (code, name, description, firm_nr, is_active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code, firm_nr) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
        [
          code, name,
          strFromExcel(row['Açıklama']),
          ERP_SETTINGS.firmNr,
          boolFromExcel(row['Aktif (E/H)'] ?? 'E'),
        ]
      );
      result.success++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: rowNum, message: err?.message || 'Kategori oluşturulamadı.' });
    }
  }
  return result;
}

// ─── Tab konfigürasyonu ───────────────────────────────────────────────────────

interface TabConfig {
  id: EntityType;
  label: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
  exportFn?: () => Promise<void>;
  importFn?: (rows: any[]) => Promise<ImportResult>;
  importNote?: string;
}

const TABS: TabConfig[] = [
  {
    id: 'products',
    label: 'productsEntities',
    icon: Package,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    exportFn: exportProducts,
    importFn: importProducts,
  },
  {
    id: 'current-accounts',
    label: 'currentAccountsEntities',
    icon: Users,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    exportFn: exportCurrentAccounts,
    importFn: importCurrentAccounts,
    importNote: 'Müşteri ve Tedarikçiler için "Tip" sütununu MÜŞTERİ veya TEDARİKÇİ olarak doldurun.',
  },
  {
    id: 'variants',
    label: 'variantsEntities',
    icon: Layers,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    exportFn: exportVariants,
    importFn: importVariants,
    importNote: '"Ürün Kodu" sütunu sistemde kayıtlı bir ürün koduna karşılık gelmelidir.',
  },
  {
    id: 'services',
    label: 'serviceCardsEntities',
    icon: Wrench,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    exportFn: exportServices,
    importFn: importServices,
  },
  {
    id: 'suppliers',
    label: 'suppliersEntities',
    icon: Truck,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
    exportFn: exportSuppliers,
    importFn: importSuppliers,
  },
  {
    id: 'categories',
    label: 'categoriesEntities',
    icon: Tag,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    exportFn: exportCategories,
    importFn: importCategories,
  },
];

export function ExcelModule() {
  const { tm } = useLanguage();
  const loadProducts = useProductStore((s) => s.loadProducts);
  const loadCustomers = useCustomerStore((s) => s.loadCustomers);
  const [activeTab, setActiveTab] = useState<EntityType>('products');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [categoryPreviewModal, setCategoryPreviewModal] = useState<{
    open: true;
    newCategories: string[];
    pendingRows: any[];
  } | { open: false }>({ open: false });

  const tab = TABS.find(t => t.id === activeTab)!;
  const template = TEMPLATES[activeTab];

  const showNotification = useCallback((n: Notification, autoDismiss = true) => {
    setNotification(n);
    if (autoDismiss && n.type !== 'loading') {
      setTimeout(() => setNotification(null), 4000);
    }
  }, []);

  // Şablon indir
  const handleDownloadTemplate = useCallback(async () => {
    try {
      await downloadExcel(
        template.sheetName,
        template.sample,
        `Sablon_${template.sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`
      );
      showNotification({ type: 'success', message: `${tm(template.label as any) || template.label} şablonu indirildi.` });
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message });
    }
  }, [template, showNotification]);

  // Dışa aktar
  const handleExport = useCallback(async () => {
    if (!tab.exportFn) return;
    setIsLoading(true);
    showNotification({ type: 'loading', message: `${tm(tab.label as any) || tab.label} dışa aktarılıyor...` }, false);
    try {
      await tab.exportFn();
      showNotification({ type: 'success', message: `${tm(tab.label as any) || tab.label} başarıyla Excel'e aktarıldı.` });
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [tab, showNotification]);

  // İçe aktar
  const runImportWithRows = useCallback(async (rows: any[]) => {
    if (!tab.importFn) return;
    setImportResult(null);
    showNotification({ type: 'loading', message: `${tm(tab.label as any) || tab.label} içe aktarılıyor...` }, false);
    try {
      const result = await tab.importFn(rows);
      setImportResult(result);
      if (result.failed === 0) {
        showNotification({ type: 'success', message: `${result.success} kayıt başarıyla içe aktarıldı.` });
      } else if (result.success > 0) {
        showNotification({ type: 'info', message: `${result.success} başarılı, ${result.failed} başarısız.` });
      } else {
        showNotification({ type: 'error', message: `Hiçbir kayıt içe aktarılamadı. ${result.failed} hata.` });
      }
      // Aktarılan varlığa göre listeyi yenile — Ürün Yönetimi / Cari vb. güncel veriyi göstersin
      if (result.success > 0) {
        if (tab.id === 'products') loadProducts(true);
        else if (tab.id === 'current-accounts') loadCustomers();
      }
    } catch (err: any) {
      showNotification({ type: 'error', message: 'İçe aktarım hatası: ' + (err?.message || 'Bilinmeyen hata') });
    } finally {
      setIsLoading(false);
    }
  }, [tab, showNotification, loadProducts, loadCustomers]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tab.importFn) return;

    setIsLoading(true);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = getSheetForImport(workbook, tab.id);
        if (!worksheet) {
          showNotification({ type: 'error', message: 'Excel sayfası bulunamadı.' });
          setIsLoading(false);
          return;
        }
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, any>[];
        const rows = rawRows.map(r => normalizeRowKeys(r, tab.id));

        if (rows.length === 0) {
          showNotification({ type: 'error', message: 'Excel dosyası boş veya okunamadı.' });
          setIsLoading(false);
          return;
        }

        if (tab.id === 'products') {
          const uniqueNames = getUniqueCategoryNamesFromProductRows(rows);
          const existing = await categoryAPI.getAll();
          const existingNamesLower = new Set((existing as any[]).map((c: any) => (c.name || '').trim().toLowerCase()));
          const existingCodesUpper = new Set((existing as any[]).map((c: any) => (c.code || '').trim().toUpperCase()));
          const newCategories = uniqueNames.filter(n => {
            const t = n.trim();
            if (!t) return false;
            if (existingNamesLower.has(t.toLowerCase())) return false;
            if (existingCodesUpper.has(categoryNameToCode(t))) return false;
            return true;
          });
          if (newCategories.length > 0) {
            setCategoryPreviewModal({ open: true, newCategories, pendingRows: rows });
            setIsLoading(false);
            return;
          }
        }

        await runImportWithRows(rows);
      } catch (err: any) {
        showNotification({ type: 'error', message: 'Dosya okunamadı: ' + (err?.message || 'Bilinmeyen hata') });
        setIsLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, [tab, runImportWithRows, showNotification]);

  const handleCategoryPreviewConfirm = useCallback(async () => {
    if (!categoryPreviewModal.open || categoryPreviewModal.newCategories.length === 0) {
      setCategoryPreviewModal({ open: false });
      return;
    }
    setIsLoading(true);
    try {
      await ensureCategoriesByNames(categoryPreviewModal.newCategories);
      // Restaurant POS kategorileri güncellensin (eklenen kategoriler sağda görünsün)
      useRestaurantStore.getState().loadCategories().catch(() => {});
      await runImportWithRows(categoryPreviewModal.pendingRows);
    } finally {
      setCategoryPreviewModal({ open: false });
    }
  }, [categoryPreviewModal, runImportWithRows]);

  const handleCategoryPreviewCancel = useCallback(() => {
    setCategoryPreviewModal({ open: false });
  }, []);

  const Icon = tab.icon;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Başlık */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{tm('excelTitle')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {tm('excelSubtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Tab navigasyonu */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 flex-shrink-0">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(t => {
            const TIcon = t.icon;
            const isActive = t.id === activeTab;
            return (
              <button
                key={t.id}
                onClick={() => { setActiveTab(t.id); setImportResult(null); setNotification(null); }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${isActive
                  ? `border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400`
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
              >
                <TIcon className="w-4 h-4" />
                {tm(t.label as any) || t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-5">

          {/* Bildirim */}
          {notification && (
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${notification.type === 'success' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700' :
              notification.type === 'error' ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700' :
                notification.type === 'loading' ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700' :
                  'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700'
              }`}>
              {notification.type === 'success' && <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />}
              {notification.type === 'error' && <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
              {notification.type === 'loading' && <Loader2 className="w-5 h-5 text-blue-600 flex-shrink-0 animate-spin" />}
              {notification.type === 'info' && <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />}
              <p className={`text-sm font-medium ${notification.type === 'success' ? 'text-green-800 dark:text-green-200' :
                notification.type === 'error' ? 'text-red-800 dark:text-red-200' :
                  notification.type === 'loading' ? 'text-blue-800 dark:text-blue-200' :
                    'text-amber-800 dark:text-amber-200'
                }`}>{notification.message}</p>
            </div>
          )}

          {/* Kategori önizleme modalı (ürün aktarımında sistemde olmayan kategoriler) */}
          {categoryPreviewModal.open && categoryPreviewModal.newCategories.length > 0 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-w-md w-full max-h-[80vh] flex flex-col">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Aktarım öncesi oluşturulacak kategoriler
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Aşağıdaki kategoriler sistemde bulunmuyor; aktarım sırasında oluşturulacak.
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  <ul className="space-y-2">
                    {categoryPreviewModal.newCategories.map((name, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                        <Tag className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span>{name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCategoryPreviewCancel}
                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={handleCategoryPreviewConfirm}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Devam et ve aktar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3 Kart: Şablon | Dışa Aktar | İçe Aktar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

            {/* 1. Şablon İndir */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className={`px-5 py-4 ${tab.bgColor} dark:bg-opacity-10 border-b ${tab.borderColor}`}>
                <div className="flex items-center gap-2">
                  <BarChart3 className={`w-4 h-4 ${tab.color}`} />
                  <h2 className={`text-sm font-semibold ${tab.color}`}>{tm('downloadTemplate')}</h2>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {tm('downloadTemplateDesc')}
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{tm('requiredFieldsNote')}</span>
                  </span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{tm('templateColumns')}</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(template.sample[0] ?? {}).map(col => (
                      <span key={col} className={`text-xs px-1.5 py-0.5 rounded ${col.endsWith('*')
                        ? `${tab.bgColor} ${tab.color} font-medium`
                        : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                        }`}>
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 dark:bg-gray-700 hover:bg-gray-900 dark:hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  {tm('downloadTemplateBtn')}
                </button>
              </div>
            </div>

            {/* 2. Dışa Aktar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-blue-600" />
                  <h2 className="text-sm font-semibold text-blue-600">{tm('exportData')}</h2>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {tm('exportDataDesc')}
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    {tm('exportDataDetailsPart1')} <strong className="text-gray-700 dark:text-gray-300">{tm(tab.label as any) || tab.label}</strong>{' '}
                    {tm('exportDataDetailsPart2')}
                  </span>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
                  {tm('exportDataWarning')}
                </div>
                <button
                  onClick={handleExport}
                  disabled={isLoading || !tab.exportFn}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {tm(tab.label as any) || tab.label}{tm('exportBtn')}
                </button>
              </div>
            </div>

            {/* 3. İçe Aktar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 bg-green-50 dark:bg-green-900/10 border-b border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-green-600" />
                  <h2 className="text-sm font-semibold text-green-600">{tm('importData')}</h2>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {tm('importDataDesc')}
                </p>
              </div>
              <div className="p-5 space-y-4">
                {tab.importNote && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{tab.importNote}</span>
                  </div>
                )}
                {!tab.importNote && (
                  <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{tm('supportedFormats')}</span>
                  </div>
                )}
                <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3 text-xs text-green-700 dark:text-green-300">
                  {tm('importWarning')}
                </div>
                <label className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-colors cursor-pointer text-sm font-medium text-white ${isLoading || !tab.importFn
                  ? 'bg-green-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700'
                  }`}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {tm('selectExcelFile')}
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleImport}
                    disabled={isLoading || !tab.importFn}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* İçe Aktarım Sonuçları */}
          {importResult && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">{tm('summary')}</h3>
              </div>
              <div className="p-5">
                {/* İstatistikler */}
                <div className="grid grid-cols-3 gap-4 mb-5">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-gray-700 dark:text-gray-200">{importResult.total}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tm('rowNumber')}</div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">{importResult.success}</div>
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1">{tm('successfulRecords')}</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">{importResult.failed}</div>
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">{tm('failedRecords')}</div>
                  </div>
                </div>

                {/* İlerleme çubuğu */}
                {importResult.total > 0 && (
                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>Başarı oranı</span>
                      <span>{Math.round((importResult.success / importResult.total) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${(importResult.success / importResult.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Hata listesi */}
                {importResult.errors.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      {tm('errorLogs')} ({importResult.errors.length})
                    </h4>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {importResult.errors.map((err, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-900/10 rounded p-2">
                          <span className="font-mono font-semibold text-red-500 flex-shrink-0">Satır {err.row}:</span>
                          <span className="text-red-700 dark:text-red-300">{err.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tekrar içe aktar */}
                <button
                  onClick={() => setImportResult(null)}
                  className="mt-4 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sonuçları Temizle
                </button>
              </div>
            </div>
          )}

          {/* Kullanım kılavuzu */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-white mb-2">{tm('usageSteps')}</h4>
                <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5 list-none">
                  {[
                    tm('step1'),
                    tm('step2'),
                    tm('step3'),
                    tm('step4'),
                    tm('step5'),
                    tm('step6'),
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
