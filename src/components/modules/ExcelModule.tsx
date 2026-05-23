/**
 * ExcelModule - Kapsamlı Excel İçe/Dışa Aktarım Modülü
 * Desteklenen varlıklar: Ürünler, Cari Hesaplar, Varyantlar, Hizmet Kartları,
 *                        Tedarikçiler, Kategoriler, Güzellik Randevuları, Güzellik Tahsilatları, Stok Hareketleri
 */

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet, Download, Upload, CheckCircle, XCircle,
  AlertCircle, Loader2, Package, Users, Layers, Wrench,
  Truck, Tag, BarChart3, ChevronRight, RefreshCw, Info, Calendar, CreditCard,
  TrendingUp
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { productAPI } from '../../services/api/products';
import { customerAPI } from '../../services/api/customers';
import { supplierAPI } from '../../services/api/suppliers';
import { productVariantAPI } from '../../services/api/productVariants';
import { createCurrentAccount } from '../../services/api/currentAccounts';
import { mapUnifiedSupplierToCurrentAccountExcelRow, saveCurrentAccountsAsXlsx } from '../../utils/currentAccountsExcelExport';
import { serviceAPI, type Service } from '../../services/serviceAPI';
import { categoryAPI } from '../../services/api/masterData';
import { postgres, ERP_SETTINGS } from '../../services/postgres';
import { useProductStore } from '../../store/useProductStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import { useRestaurantStore } from '../restaurant/store/useRestaurantStore';
import { beautyService } from '../../services/beautyService';
import type { BeautyService } from '../../types/beauty';
import type { Product } from '../../core/types';
import { stockMovementAPI } from '../../services/stockMovementAPI';

// ─── Tip tanımları ────────────────────────────────────────────────────────────

type EntityType =
  | 'products'
  | 'price-updates'
  | 'current-accounts'
  | 'variants'
  | 'services'
  | 'suppliers'
  | 'categories'
  | 'beauty-appointments'
  | 'beauty-sales';

interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: { row: number; message: string; preview?: string; rowData?: Record<string, any> }[];
}

interface ImportRunOptions {
  onLog?: (line: string) => void;
  duplicateCodeMode?: 'update' | 'change-code';
  duplicateBarcodeMode?: 'error' | 'change-barcode';
}

interface Notification {
  type: 'success' | 'error' | 'info' | 'loading';
  message: string;
}

/** Güzellik randevu Excel — hizmet kartı (beauty_services) ile eşlenen sütunlar */
const COL_BEAUTY_APPT_FOLLOW_UP_DAYS = 'Hat\u0131rlatma (g\u00fcn)';
const COL_BEAUTY_APPT_DEFAULT_SESSIONS = 'Seans say\u0131s\u0131 (varsay\u0131lan)';

function isTauriExcelRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

/** Tarayıcı / web görünümünde .xlsx indirme (Tauri save yok) */
function normalizeXlsxBuffer(buf: Uint8Array | ArrayBuffer): Uint8Array {
  if (buf instanceof Uint8Array) return buf;
  return new Uint8Array(buf);
}

function triggerBrowserXlsxDownload(fileName: string, buf: Uint8Array | ArrayBuffer): void {
  const normalized = normalizeXlsxBuffer(buf);
  const bytes = normalized.buffer.slice(normalized.byteOffset, normalized.byteOffset + normalized.byteLength);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/[/\\?%*:|"<>]/g, '-');
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
        'Mevcut Stok': '',
        'Min Stok': 5,
        'Max Stok': 200,
        'Özel Kod 1': '',
        'Özel Kod 2': '',
        'Özel Kod 3': '',
        'Açıklama': 'Ürün açıklaması',
        'Görsel URL': '',
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
        'Mevcut Stok': '',
        'Min Stok': 3,
        'Max Stok': 50,
        'Özel Kod 1': '',
        'Özel Kod 2': '',
        'Özel Kod 3': '',
        'Açıklama': '',
        'Görsel URL': '',
        'Aktif (E/H)': 'E',
      },
    ],
  },
  'price-updates': {
    label: 'Fiyat Güncelleme',
    sheetName: 'Fiyat Güncelleme',
    sample: [
      {
        'Ürün Kodu': 'URN-001',
        'Barkod': '8690000000001',
        'Ürün Adı': '(dışa aktarımda sistemden gelir)',
        'Mevcut Alış': '(sistem)',
        'Mevcut Satış': '(sistem)',
        'Yeni Alış': 55.00,
        'Yeni Satış': 110.00,
      },
      {
        'Ürün Kodu': '',
        'Barkod': '8690000000999',
        'Ürün Adı': '(yalnızca barkod ile)',
        'Mevcut Alış': '(sistem)',
        'Mevcut Satış': '(sistem)',
        'Yeni Alış': '',
        'Yeni Satış': 19.9,
      },
      {
        'Ürün Kodu': 'URN-ONLY-CODE',
        'Barkod': '',
        'Ürün Adı': '(yalnızca ürün kodu ile)',
        'Mevcut Alış': '(sistem)',
        'Mevcut Satış': '(sistem)',
        'Yeni Alış': 10,
        'Yeni Satış': '',
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
  'beauty-appointments': {
    label: 'Güzellik Randevuları',
    sheetName: 'Güzellik Randevuları',
    sample: [
      {
        'Randevu ID': '',
        'Müşteri Kodu': 'C-001',
        'Müşteri Telefon': '',
        'Müşteri Adı': '',
        'Hizmet Adı*': 'Cilt Bakımı',
        'Hizmet Kodu': '',
        [COL_BEAUTY_APPT_FOLLOW_UP_DAYS]: 30,
        [COL_BEAUTY_APPT_DEFAULT_SESSIONS]: 1,
        'Tarih*': '2026-04-20',
        'Saat*': '10:30',
        'Süre (dk)': 45,
        'Uzman Adı': 'Ayşe Yılmaz',
        'Durum': 'scheduled',
        'Tutar': 1500,
        'Notlar': 'İlk seans',
      },
      {
        'Randevu ID': '',
        'Müşteri Kodu': '',
        'Müşteri Telefon': '+90 532 000 0000',
        'Müşteri Adı': '',
        'Hizmet Adı*': 'Lazer Epilasyon',
        'Hizmet Kodu': '',
        [COL_BEAUTY_APPT_FOLLOW_UP_DAYS]: '',
        [COL_BEAUTY_APPT_DEFAULT_SESSIONS]: '',
        'Tarih*': '2026-04-21',
        'Saat*': '14:00',
        'Süre (dk)': 30,
        'Uzman Adı': '',
        'Durum': 'confirmed',
        'Tutar': 0,
        'Notlar': '',
      },
    ],
  },
  'beauty-sales': {
    label: 'Güzellik Tahsilatları',
    sheetName: 'Tahsilat Ozeti',
    sample: [
      {
        'Satış ID': '(dışa aktarımda dolu)',
        'Fatura No': 'BEA-2026-XXXX',
        'Tarih': '2026-04-19 14:30:00',
        'Müşteri Kodu': 'C-001',
        'Müşteri Adı': 'Örnek Müşteri',
        'Ara Toplam': 1000,
        'İndirim': 0,
        'KDV': 180,
        'Toplam': 1180,
        'Ödenen': 1180,
        'Kalan': 0,
        'Ödeme Şekli': 'cash',
        'Ödeme Durumu': 'paid',
        'Notlar': '',
      },
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
    /** DB: rex_*_products.image_url — alternatif sütun başlıkları */
    keyMap['Ürün Resmi URL'] = 'Görsel URL';
    keyMap['Resim URL'] = 'Görsel URL';
    keyMap['Ürün Görsel URL'] = 'Görsel URL';
    keyMap['image_url'] = 'Görsel URL';
    keyMap['Image URL'] = 'Görsel URL';
    keyMap['Mevcut stok'] = 'Mevcut Stok';
    keyMap['Current Stock'] = 'Mevcut Stok';
  } else if (entityType === 'price-updates') {
    /** Alternatif sütun başlıkları — kullanıcı dışa aktarımdaki satış/alış yıldızlı kolonları getirebilir */
    keyMap['Ürün Kodu*'] = 'Ürün Kodu';
    keyMap['Satış Fiyatı*'] = 'Yeni Satış';
    keyMap['Satış Fiyatı'] = 'Yeni Satış';
    keyMap['Alış Fiyatı'] = 'Yeni Alış';
    keyMap['Yeni Satış Fiyatı'] = 'Yeni Satış';
    keyMap['Yeni Alış Fiyatı'] = 'Yeni Alış';
    keyMap['New Sale Price'] = 'Yeni Satış';
    keyMap['New Cost'] = 'Yeni Alış';
    keyMap['New Purchase Price'] = 'Yeni Alış';
    keyMap['Sale Price'] = 'Yeni Satış';
    keyMap['Cost'] = 'Yeni Alış';
    keyMap['Purchase Price'] = 'Yeni Alış';
    keyMap['Code'] = 'Ürün Kodu';
    keyMap['Product Code'] = 'Ürün Kodu';
    keyMap['Barcode'] = 'Barkod';
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
  } else if (entityType === 'beauty-appointments') {
    keyMap['Hizmet Adı'] = 'Hizmet Adı*';
    keyMap['Tarih'] = 'Tarih*';
    keyMap['Saat'] = 'Saat*';
    keyMap['Hatirlatma (gun)'] = COL_BEAUTY_APPT_FOLLOW_UP_DAYS;
    keyMap['Hatirlatma gun'] = COL_BEAUTY_APPT_FOLLOW_UP_DAYS;
    keyMap['Reminder (days)'] = COL_BEAUTY_APPT_FOLLOW_UP_DAYS;
    keyMap['follow_up_reminder_days'] = COL_BEAUTY_APPT_FOLLOW_UP_DAYS;
    keyMap['Seans sayisi (varsayilan)'] = COL_BEAUTY_APPT_DEFAULT_SESSIONS;
    keyMap['Seans sayısı'] = COL_BEAUTY_APPT_DEFAULT_SESSIONS;
    keyMap['Default sessions'] = COL_BEAUTY_APPT_DEFAULT_SESSIONS;
    keyMap['default_sessions'] = COL_BEAUTY_APPT_DEFAULT_SESSIONS;
  } else if (entityType === 'beauty-sales') {
    /* yalnızca dışa aktarım */
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

/**
 * Excel / TR sayı biçimi: 5.000 veya 1.250.000 (binlik nokta), ondalık virgül (1.234,56).
 * Saf JS parseFloat("5.000") → 5 hatasını önler.
 */
function parseLocaleNumberTR(val: any): number {
  if (val === null || val === undefined || val === '') return NaN;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  let s = String(val).trim().replace(/\s/g, '').replace(/\u00A0/g, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    const idx = s.lastIndexOf(',');
    const intPart = s.slice(0, idx).replace(/\./g, '');
    const decPart = s.slice(idx + 1).replace(/[^\d]/g, '');
    return parseFloat(`${intPart}.${decPart}`);
  }
  if (s.includes('.')) {
    const parts = s.split('.');
    const last = parts[parts.length - 1] ?? '';
    if (/^\d{3}$/.test(last) && parts.length >= 2) {
      return parseFloat(s.replace(/\./g, ''));
    }
    if (parts.length === 2 && last.length <= 2) {
      return parseFloat(s);
    }
    return parseFloat(s.replace(/\./g, ''));
  }
  return parseFloat(s);
}

function numFromExcel(val: any, fallback = 0): number {
  const n = parseLocaleNumberTR(val);
  return Number.isNaN(n) ? fallback : n;
}

/** Ürün Excel: açılış/mevcut stok (boş hücre = güncellemede stok alanına dokunma). */
function pickCurrentStockFromProductRow(row: Record<string, unknown>): number | undefined {
  const keys = ['Mevcut Stok', 'Mevcut stok', 'Current Stock'];
  for (const k of keys) {
    if (!(k in row)) continue;
    const raw = row[k];
    if (raw === null || raw === undefined || String(raw).trim() === '') return undefined;
    return numFromExcel(raw, 0);
  }
  for (const rk of Object.keys(row)) {
    const norm = rk.replace(/\uFEFF/g, '').trim().toLowerCase();
    if (norm === 'mevcut stok' || norm === 'current stock') {
      const raw = row[rk];
      if (raw === null || raw === undefined || String(raw).trim() === '') return undefined;
      return numFromExcel(raw, 0);
    }
  }
  return undefined;
}

function strFromExcel(val: any): string {
  return String(val ?? '').trim();
}

function buildRowPreview(row: Record<string, any> | undefined, maxPairs = 4): string {
  if (!row) return '';
  const entries = Object.entries(row)
    .map(([k, v]) => [String(k).trim(), strFromExcel(v)] as const)
    .filter(([k, v]) => k.length > 0 && v.length > 0)
    .slice(0, maxPairs);
  return entries.map(([k, v]) => `${k}: ${v}`).join(' | ');
}

/**
 * Excel "Genel" biçimindeki büyük sayılar barkodda bilimsel gösterime (örn. 8.69001E+12) düşebilir.
 * Barkod alanını metin gibi ele alıp mümkünse düz hane dizisine çevirir.
 */
function normalizeScientificToPlainDigits(input: string): string {
  const s = input.trim();
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)e([+-]?\d+)$/i);
  if (!m) return s;

  let mantissa = m[1];
  const exponent = parseInt(m[2], 10);
  const negative = mantissa.startsWith('-');
  mantissa = mantissa.replace(/^[+-]/, '');

  const [intPartRaw, decPartRaw = ''] = mantissa.split('.');
  const digits = `${intPartRaw}${decPartRaw}`;
  const decimalIndex = intPartRaw.length;
  const newDecimalIndex = decimalIndex + exponent;

  let plain: string;
  if (newDecimalIndex <= 0) {
    plain = `0.${'0'.repeat(Math.abs(newDecimalIndex))}${digits}`;
  } else if (newDecimalIndex >= digits.length) {
    plain = `${digits}${'0'.repeat(newDecimalIndex - digits.length)}`;
  } else {
    plain = `${digits.slice(0, newDecimalIndex)}.${digits.slice(newDecimalIndex)}`;
  }

  const cleaned = plain.replace(/^0+(?=\d)/, '').replace(/\.0+$/, '').replace(/\.$/, '');
  if (!cleaned) return '0';
  return negative ? `-${cleaned}` : cleaned;
}

function barcodeFromExcel(val: any): string {
  if (val == null) return '';
  if (typeof val === 'string') return normalizeScientificToPlainDigits(val).trim();
  if (typeof val === 'number' && Number.isFinite(val)) {
    const asText = XLSX.SSF.format('0', val);
    return normalizeScientificToPlainDigits(asText).trim();
  }
  return normalizeScientificToPlainDigits(String(val)).trim();
}

function barcodeSuffixForCode(barcode: string): string {
  const cleaned = String(barcode || '').replace(/[^0-9A-Za-z]/g, '');
  return cleaned ? cleaned.slice(-8) : 'EK';
}

async function buildUniqueProductCode(baseCode: string, barcode: string): Promise<string> {
  const safeBase = strFromExcel(baseCode).slice(0, 90) || 'URUN';
  const suffix = barcodeSuffixForCode(barcode);
  let candidate = `${safeBase}-${suffix}`.slice(0, 100);
  let n = 1;
  while (await productAPI.getByCode(candidate)) {
    const numbered = `${safeBase}-${suffix}-${n}`;
    candidate = numbered.slice(0, 100);
    n++;
    if (n > 9999) {
      throw new Error(`"${baseCode}" için benzersiz ek ürün kodu üretilemedi.`);
    }
  }
  return candidate;
}

async function buildUniqueBarcode(baseBarcode: string): Promise<string> {
  const cleaned = strFromExcel(baseBarcode).replace(/\s+/g, '');
  const safeBase = (cleaned || `BR-${Date.now()}`).slice(0, 92);
  let candidate = `${safeBase}-D`;
  let n = 1;
  while (await productAPI.getByBarcode(candidate)) {
    candidate = `${safeBase}-D${n}`.slice(0, 100);
    n++;
    if (n > 9999) {
      throw new Error(`"${baseBarcode}" için benzersiz barkod üretilemedi.`);
    }
  }
  return candidate;
}

/** Excel hücresinden YYYY-MM-DD (veya dd.mm.yyyy, seri sayı) */
function parseAppointmentDate(val: unknown): string | null {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  const s = strFromExcel(val);
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const tr = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (tr) {
    const d = tr[1].padStart(2, '0');
    const m = tr[2].padStart(2, '0');
    const y = tr[3];
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number' && Number.isFinite(val) && val > 20000 && val < 60000) {
    const epoch = new Date(1899, 11, 30);
    const dt = new Date(epoch.getTime() + val * 86400000);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  return null;
}

/** Excel hücresinden HH:mm:ss veya HH:mm (TIME / kesir) */
function parseAppointmentTime(val: unknown): string | null {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const hh = val.getHours();
    const mm = val.getMinutes();
    const ss = val.getSeconds();
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  const s = strFromExcel(val);
  if (s) {
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
      const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
      const ss = m[3] != null ? Math.min(59, Math.max(0, parseInt(m[3], 10))) : 0;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }
  }
  if (typeof val === 'number' && Number.isFinite(val) && val >= 0 && val < 1) {
    const secs = Math.round(val * 86400) % 86400;
    const hh = Math.floor(secs / 3600);
    const mm = Math.floor((secs % 3600) / 60);
    const sec = secs % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return null;
}

function formatAppointmentTimeForExcel(t: unknown): string {
  if (t == null || t === '') return '';
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return s.slice(0, 8);
}

/** Excel satırından ürün görsel adresi — `rex_{firma}_products.image_url` alanına yazılır (POS/restoran önce image_url_cdn kullanır). */
function productImageUrlFromExcelRow(row: Record<string, any>): string {
  const keys = [
    'Görsel URL',
    'Görsel URL*',
    'Ürün Resmi URL',
    'Resim URL',
    'Ürün Görsel URL',
    'image_url',
    'Image URL',
  ];
  for (const k of keys) {
    const v = strFromExcel(row[k]);
    if (v) return v;
  }
  return '';
}

/** @returns true = dosya yazıldı/indirildi; false = kullanıcı iptal (yalnızca Tauri diyalog) */
async function downloadExcel(sheetName: string, data: any[], fileName: string): Promise<boolean> {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  const maxWidth = 30;
  const cols = Object.keys(data[0] ?? {}).map(k => ({ wch: Math.min(Math.max(k.length + 2, 12), maxWidth) }));
  ws['!cols'] = cols;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const rawBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array | ArrayBuffer;
  const buf = normalizeXlsxBuffer(rawBuf);

  if (!isTauriExcelRuntime()) {
    triggerBrowserXlsxDownload(fileName, rawBuf);
    return true;
  }

  const [{ save }, { writeFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);
  const savePath = await save({
    defaultPath: fileName,
    filters: [{ name: 'Excel Dosyası', extensions: ['xlsx'] }],
  });
  if (!savePath) return false;

  await writeFile(savePath, buf);
  return true;
}

const EXCEL_EXPORT_CANCELLED = '__EXCEL_EXPORT_CANCELLED__';

function isExcelExportCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === EXCEL_EXPORT_CANCELLED;
}

async function saveExcelOrThrow(...args: Parameters<typeof downloadExcel>): Promise<void> {
  const ok = await downloadExcel(...args);
  if (!ok) throw new Error(EXCEL_EXPORT_CANCELLED);
}

async function saveExcelWorkbookOrThrow(...args: Parameters<typeof downloadExcelWorkbook>): Promise<void> {
  const ok = await downloadExcelWorkbook(...args);
  if (!ok) throw new Error(EXCEL_EXPORT_CANCELLED);
}

function sheetColWidths(keys: string[], maxW = 34): { wch: number }[] {
  return keys.map((k) => ({ wch: Math.min(Math.max(k.length + 2, 10), maxW) }));
}

async function downloadExcelWorkbook(wb: XLSX.WorkBook, fileName: string): Promise<boolean> {
  const rawBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array | ArrayBuffer;
  const buf = normalizeXlsxBuffer(rawBuf);

  if (!isTauriExcelRuntime()) {
    triggerBrowserXlsxDownload(fileName, rawBuf);
    return true;
  }

  const [{ save }, { writeFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);
  const savePath = await save({
    defaultPath: fileName,
    filters: [{ name: 'Excel Dosyası', extensions: ['xlsx'] }],
  });
  if (!savePath) return false;
  await writeFile(savePath, buf);
  return true;
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
    'KDV Oranı (%)': p.taxRate ?? (p as any).vat_rate ?? 18,
    'Mevcut Stok': p.stock ?? 0,
    'Min Stok': p.minStock ?? p.min_stock ?? 0,
    'Max Stok': (p as any).maxStock ?? (p as any).max_stock ?? 0,
    'Özel Kod 1': (p as any).special_code_1 || '',
    'Özel Kod 2': (p as any).special_code_2 || '',
    'Özel Kod 3': (p as any).special_code_3 || '',
    'Açıklama': p.description || '',
    'Görsel URL': (p as any).image_url || '',
    'Aktif (E/H)': p.is_active !== false ? 'E' : 'H',
  }));
  await saveExcelOrThrow('Ürünler', data, `Ürünler_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function exportCurrentAccounts(): Promise<void> {
  const suppliers = await supplierAPI.getAll();
  if (suppliers.length === 0) throw new Error('Dışa aktarılacak cari hesap bulunamadı.');
  const data = suppliers.map(mapUnifiedSupplierToCurrentAccountExcelRow);
  await saveCurrentAccountsAsXlsx(data);
}

/**
 * Fiyat güncelleme dışa aktarımı: yalnızca eşleştirme alanları + mevcut fiyatlar.
 * Kullanıcı dosyayı doldurup yalnızca alış/satış fiyatlarını günceller; başka alan etkilenmez.
 */
async function exportPriceUpdates(): Promise<void> {
  const products = await productAPI.getAll();
  if (products.length === 0) throw new Error('Dışa aktarılacak ürün bulunamadı.');
  const data = products.map(p => ({
    'Ürün Kodu': p.code || '',
    'Barkod': p.barcode || '',
    'Ürün Adı': p.name || '',
    'Mevcut Alış': Number(p.cost || 0),
    'Mevcut Satış': Number(p.price || 0),
    'Yeni Alış': '',
    'Yeni Satış': '',
  }));
  await saveExcelOrThrow(
    'Fiyat Güncelleme',
    data,
    `Fiyat_Guncelleme_${new Date().toISOString().split('T')[0]}.xlsx`
  );
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
  await saveExcelOrThrow('Varyantlar', rows, `Varyantlar_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function exportServices(): Promise<void> {
  const [services, erpServices] = await Promise.all([
    beautyService.getServices(),
    serviceAPI.getAll().catch(() => [] as Service[]),
  ]);
  if (services.length === 0) throw new Error('Dışa aktarılacak hizmet kartı bulunamadı.');

  const erpById = new Map<string, Service>();
  for (const e of erpServices) {
    erpById.set(String(e.id), e);
  }

  const productCodeById = new Map<string, string>();
  try {
    const allProducts = await productAPI.getAll();
    for (const p of allProducts) {
      const mt = String((p as { materialType?: string }).materialType ?? '').toLowerCase();
      if (mt === 'service') {
        const c = String((p as { code?: string }).code ?? '').trim();
        if (c) productCodeById.set(String(p.id), c);
      }
    }
  } catch {
    /* stok hizmet kodları olmadan devam */
  }

  const data = services.map((s: BeautyService) => {
    const id = String(s.id);
    const erp = erpById.get(id);
    const code = (erp?.code ?? productCodeById.get(id) ?? '').trim();
    return {
      'Hizmet Kodu*': code,
      'Hizmet Adı*': s.name,
      'Kategori': String(s.category ?? erp?.category ?? ''),
      'Birim': erp?.unit || 'Adet',
      'Birim Fiyat*': erp != null ? Number(erp.unit_price ?? 0) : Number(s.price ?? 0),
      'KDV Oranı (%)': erp != null ? Number(erp.tax_rate ?? 18) : 18,
      'Açıklama': String(s.description ?? erp?.description ?? ''),
      'Aktif (E/H)': s.is_active !== false ? 'E' : 'H',
      'Süre (dk)': s.duration_min ?? 30,
      'Maliyet': Number(s.cost_price ?? erp?.purchase_price ?? 0),
      'Komisyon (%)': Number(s.commission_rate ?? 0),
      'Hatırlatma (gün)':
        s.follow_up_reminder_days != null && s.follow_up_reminder_days > 0 ? s.follow_up_reminder_days : '',
      'Seans sayısı (varsayılan)': s.default_sessions ?? 1,
    };
  });
  await saveExcelOrThrow('Hizmet Kartları', data, `HizmetKartlari_${new Date().toISOString().split('T')[0]}.xlsx`);
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
  await saveExcelOrThrow('Tedarikçiler', data, `Tedarikciler_${new Date().toISOString().split('T')[0]}.xlsx`);
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
  await saveExcelOrThrow('Kategoriler', data, `Kategoriler_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function exportBeautyAppointments(): Promise<void> {
  const end = new Date();
  end.setDate(end.getDate() + 366);
  const start = new Date();
  start.setFullYear(start.getFullYear() - 5);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const [list, customers, services] = await Promise.all([
    beautyService.getAppointmentsInRange(startStr, endStr),
    beautyService.getCustomers(),
    beautyService.getServices(),
  ]);
  const codeByCustomerId = new Map<string, string>();
  const phoneByCustomerId = new Map<string, string>();
  for (const c of customers) {
    codeByCustomerId.set(String(c.id), String(c.code || '').trim());
    phoneByCustomerId.set(String(c.id), String(c.phone || '').trim());
  }
  const svcMeta = new Map<
    string,
    { code: string; follow_up_reminder_days: number | null; default_sessions: number }
  >();
  for (const s of services) {
    const r = s as unknown as Record<string, unknown>;
    const code =
      r.code != null
        ? String(r.code).trim()
        : r.product_code != null
          ? String(r.product_code).trim()
          : '';
    const fuRaw = s.follow_up_reminder_days as string | number | null | undefined;
    const fuN =
      fuRaw == null || (typeof fuRaw === 'string' && fuRaw.trim() === '')
        ? NaN
        : Math.round(Number(fuRaw));
    const follow_up_reminder_days =
      Number.isFinite(fuN) && fuN > 0 ? Math.min(3650, fuN) : null;
    const dsN = Math.round(Number(s.default_sessions ?? 1));
    const default_sessions = Number.isFinite(dsN) && dsN >= 1 ? Math.min(99, dsN) : 1;
    svcMeta.set(String(s.id), { code, follow_up_reminder_days, default_sessions });
  }
  if (list.length === 0) {
    throw new Error('Dışa aktarılacak randevu bulunamadı (son 5 yıl ile bir yıl ileri aralığında).');
  }
  const data = list.map((a) => {
    const cid = String(a.customer_id ?? a.client_id ?? '');
    const svc = a.service_id ? svcMeta.get(String(a.service_id)) : undefined;
    const ymd = String(a.date ?? a.appointment_date ?? '').slice(0, 10);
    return {
      'Randevu ID': a.id,
      'Müşteri Kodu': codeByCustomerId.get(cid) ?? '',
      'Müşteri Telefon': phoneByCustomerId.get(cid) ?? '',
      'Müşteri Adı': a.customer_name ?? '',
      'Hizmet Adı*': a.service_name ?? '',
      'Hizmet Kodu': svc?.code ?? '',
      [COL_BEAUTY_APPT_FOLLOW_UP_DAYS]:
        svc?.follow_up_reminder_days != null && svc.follow_up_reminder_days > 0
          ? svc.follow_up_reminder_days
          : '',
      [COL_BEAUTY_APPT_DEFAULT_SESSIONS]: svc?.default_sessions ?? '',
      'Tarih*': ymd,
      'Saat*': formatAppointmentTimeForExcel(a.time ?? a.appointment_time),
      'Süre (dk)': a.duration ?? 30,
      'Uzman Adı': a.specialist_name ?? '',
      'Durum': String(a.status ?? 'scheduled'),
      'Tutar': Number(a.total_price ?? 0),
      'Notlar': a.notes ?? '',
    };
  });
  await saveExcelOrThrow(
    'Güzellik Randevuları',
    data,
    `Guzellik_Randevular_${new Date().toISOString().split('T')[0]}.xlsx`
  );
}

async function exportBeautySales(): Promise<void> {
  const end = new Date();
  const endStr = end.toISOString().slice(0, 10);
  const start = new Date();
  start.setFullYear(start.getFullYear() - 5);
  const startStr = start.toISOString().slice(0, 10);
  const sales = await beautyService.getSalesWithItemsForExportRange(startStr, endStr);
  if (sales.length === 0) {
    throw new Error('Dışa aktarılacak güzellik tahsilatı bulunamadı (son 5 yıl).');
  }

  const summary = sales.map((s) => {
    const ext = s as { customer_code?: string };
    const created = s.created_at ? String(s.created_at).replace('T', ' ').slice(0, 19) : '';
    return {
      'Satış ID': s.id,
      'Fatura No': s.invoice_number ?? '',
      'Tarih': created,
      'Müşteri Kodu': ext.customer_code ?? '',
      'Müşteri Adı': s.customer_name ?? '',
      'Ara Toplam': Number(s.subtotal ?? 0),
      'İndirim': Number(s.discount ?? 0),
      'KDV': Number(s.tax ?? 0),
      'Toplam': Number(s.total ?? 0),
      'Ödenen': Number(s.paid_amount ?? 0),
      'Kalan': Number(s.remaining_amount ?? 0),
      'Ödeme Şekli': s.payment_method ?? '',
      'Ödeme Durumu': s.payment_status ?? '',
      'Notlar': s.notes ?? '',
    };
  });

  const itemHeader = {
    'Satış ID': '',
    'Fatura No': '',
    'Kalem Adı': '',
    'Tür': '',
    'Miktar': '',
    'Birim Fiyat': '',
    'İndirim': '',
    'Satır Toplamı': '',
    'Komisyon': '',
  };
  const itemRows: Record<string, string | number>[] = [];
  for (const s of sales) {
    const inv = s.invoice_number ?? '';
    for (const it of s.items ?? []) {
      itemRows.push({
        'Satış ID': s.id,
        'Fatura No': inv,
        'Kalem Adı': it.name ?? '',
        'Tür': it.item_type ?? '',
        'Miktar': Number(it.quantity ?? 0),
        'Birim Fiyat': Number(it.unit_price ?? 0),
        'İndirim': Number(it.discount ?? 0),
        'Satır Toplamı': Number(it.total ?? 0),
        'Komisyon': Number(it.commission_amount ?? 0),
      });
    }
  }
  const itemsSheetData = itemRows.length > 0 ? itemRows : [itemHeader];

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  const sumKeys = Object.keys(summary[0] ?? {});
  wsSummary['!cols'] = sheetColWidths(sumKeys);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Tahsilat Ozeti');

  const wsItems = XLSX.utils.json_to_sheet(itemsSheetData);
  const itemKeys = Object.keys(itemsSheetData[0] ?? {});
  wsItems['!cols'] = sheetColWidths(itemKeys);
  XLSX.utils.book_append_sheet(wb, wsItems, 'Kalemler');

  await saveExcelWorkbookOrThrow(wb, `Guzellik_Tahsilatlar_${new Date().toISOString().split('T')[0]}.xlsx`);
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

/**
 * Excel hücresi gerçekten boş mu? (sadece beyaz boşluk / tire / "-" sayılır)
 * 0 dahil tüm sayısal değerler "dolu" kabul edilir; o yüzden ayrı kontrol gerekir.
 */
function isPriceCellEmpty(val: any): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'number') return false;
  const s = String(val).trim();
  return s === '' || s === '-';
}

/** Fiyat içe aktarımı için ürün özeti (eski fiyatlar her satırda canlı haritadan okunur). */
type PriceImportProductMeta = {
  id: string;
  code: string;
  barcode: string;
  name: string;
  cost: number;
  price: number;
  unit: string;
};

function productToPriceImportMeta(p: Product): PriceImportProductMeta {
  return {
    id: String(p.id),
    code: String(p.code || '').trim(),
    barcode: String(p.barcode || '').trim(),
    name: String(p.name || '').trim(),
    cost: Number(p.cost ?? 0),
    price: Number(p.price ?? 0),
    unit: String(p.unit || 'Adet'),
  };
}

/**
 * Barkod veya ürün kodundan tek ürün: önce barkod (ana barkod haritası, yoksa `lookupByBarcode`),
 * bulunamazsa ürün kodu. İkisi de doluysa önce barkod yolu denenir.
 */
async function resolveProductForPriceImportRow(
  codeRaw: string,
  barcodeRaw: string,
  codeKey: string,
  byBarcode: Map<string, PriceImportProductMeta>,
  byCode: Map<string, PriceImportProductMeta>
): Promise<{ meta: PriceImportProductMeta; matchedBy: 'barcode' | 'code' } | null> {
  if (barcodeRaw) {
    const fromMap = byBarcode.get(barcodeRaw);
    if (fromMap) return { meta: fromMap, matchedBy: 'barcode' };
    const lookup = await productAPI.lookupByBarcode(barcodeRaw);
    if (lookup?.product) {
      return { meta: productToPriceImportMeta(lookup.product as Product), matchedBy: 'barcode' };
    }
  }
  if (codeKey) {
    const fromCode = byCode.get(codeKey);
    if (fromCode) return { meta: fromCode, matchedBy: 'code' };
  }
  return null;
}

/**
 * Fiyat güncelleme içe aktarımı.
 *
 * Davranış:
 *  - Yalnızca `cost` (alış) ve `price` (satış) güncellenir. Diğer ürün alanları korunur.
 *  - Eşleştirme: yalnızca barkod veya yalnızca ürün kodu yeterli; barkod varsa önce barkod (alternatif barkodlar dahil).
 *  - Eski alış/satış her zaman içe aktarım anında veritabanındaki güncel ürün kaydından alınır (Excel’deki "Mevcut" sütunları yok sayılır).
 *  - Başarılı güncellemelerden sonra tek bir fiyat değişim fişi (`stock_movements` / `price_change`) oluşturulur; malzeme hareketlerinde görünür.
 *  - Boş bırakılan `Yeni Alış` veya `Yeni Satış` hücresi o alanı atlar (silmez).
 *  - 0 değeri geçerlidir; kullanıcı bilinçli olarak 0 yazabilir.
 *  - Bulunamayan satırlar hata listesine yazılır; **yeni ürün eklenmez**.
 */
async function importPriceUpdates(rows: any[], options?: ImportRunOptions): Promise<ImportResult> {
  const log = options?.onLog;
  const result: ImportResult = { total: rows.length, success: 0, failed: 0, errors: [] };
  log?.(`[START] Fiyat güncelleme başladı. Toplam satır: ${rows.length}.`);

  const allProducts = await productAPI.getAll();
  const byBarcode = new Map<string, PriceImportProductMeta>();
  const byCode = new Map<string, PriceImportProductMeta>();
  const livePrices = new Map<string, { cost: number; price: number }>();

  for (const p of allProducts) {
    const meta = productToPriceImportMeta(p);
    if (meta.barcode) byBarcode.set(meta.barcode, meta);
    if (meta.code) byCode.set(meta.code.toUpperCase(), meta);
    livePrices.set(meta.id, { cost: meta.cost, price: meta.price });
  }

  const slipLines: Parameters<typeof stockMovementAPI.createPriceChangeSlip>[0] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const codeRaw = strFromExcel(row['Ürün Kodu']);
    const barcodeRaw = barcodeFromExcel(row['Barkod']);
    const codeKey = codeRaw.toUpperCase();

    if (!codeRaw && !barcodeRaw) {
      result.failed++;
      result.errors.push({ row: rowNum, message: 'Eşleştirme için en az "Ürün Kodu" veya "Barkod" doldurulmalıdır.' });
      log?.(`[ROW ${rowNum}] SKIP - Kod/Barkod yok`);
      continue;
    }

    const resolved = await resolveProductForPriceImportRow(codeRaw, barcodeRaw, codeKey, byBarcode, byCode);
    if (!resolved) {
      result.failed++;
      const lookupInfo = [
        barcodeRaw ? `barkod: ${barcodeRaw}` : '',
        codeRaw ? `kod: ${codeRaw}` : '',
      ].filter(Boolean).join(' / ');
      result.errors.push({
        row: rowNum,
        message: `Ürün bulunamadı (${lookupInfo}).`,
      });
      log?.(`[ROW ${rowNum}] SKIP - Ürün bulunamadı (${lookupInfo})`);
      continue;
    }

    const { meta: matched, matchedBy } = resolved;
    const live = livePrices.get(matched.id);
    const oldCost = live?.cost ?? matched.cost;
    const oldPrice = live?.price ?? matched.price;

    const updates: Partial<{ cost: number; price: number }> = {};
    const newCostCell = row['Yeni Alış'];
    const newPriceCell = row['Yeni Satış'];
    if (!isPriceCellEmpty(newCostCell)) {
      const cost = parseLocaleNumberTR(newCostCell);
      if (!Number.isFinite(cost) || cost < 0) {
        result.failed++;
        result.errors.push({ row: rowNum, message: `Yeni Alış geçersiz: "${strFromExcel(newCostCell)}"` });
        log?.(`[ROW ${rowNum}] ERROR - Yeni Alış geçersiz: ${strFromExcel(newCostCell)}`);
        continue;
      }
      updates.cost = cost;
    }
    if (!isPriceCellEmpty(newPriceCell)) {
      const price = parseLocaleNumberTR(newPriceCell);
      if (!Number.isFinite(price) || price < 0) {
        result.failed++;
        result.errors.push({ row: rowNum, message: `Yeni Satış geçersiz: "${strFromExcel(newPriceCell)}"` });
        log?.(`[ROW ${rowNum}] ERROR - Yeni Satış geçersiz: ${strFromExcel(newPriceCell)}`);
        continue;
      }
      updates.price = price;
    }

    if (Object.keys(updates).length === 0) {
      result.failed++;
      result.errors.push({
        row: rowNum,
        message: 'Hem "Yeni Alış" hem "Yeni Satış" boş. Bu satır atlandı (güncelleme yok).',
      });
      log?.(`[ROW ${rowNum}] SKIP - ${matched.code || matched.barcode} için yeni fiyat girilmedi`);
      continue;
    }

    try {
      await productAPI.update(matched.id, updates as any);
      result.success++;
      const newCost = updates.cost !== undefined ? updates.cost : oldCost;
      const newPrice = updates.price !== undefined ? updates.price : oldPrice;
      livePrices.set(matched.id, { cost: newCost, price: newPrice });

      slipLines.push({
        product_id: matched.id,
        product_name: matched.name,
        product_code: matched.code,
        old_cost: oldCost,
        old_price: oldPrice,
        new_cost: newCost,
        new_price: newPrice,
        unit_name: matched.unit,
      });

      const parts: string[] = [];
      if (updates.cost !== undefined) parts.push(`alış→${updates.cost}`);
      if (updates.price !== undefined) parts.push(`satış→${updates.price}`);
      log?.(`[ROW ${rowNum}] UPDATE - ${matched.code || matched.barcode} (${matched.name}) [${matchedBy}] | ${parts.join(', ')}`);
    } catch (err: any) {
      result.failed++;
      const msg = typeof err?.message === 'string' && err.message.trim() ? err.message.trim() : String(err);
      result.errors.push({ row: rowNum, message: `Güncellenemedi: ${msg}` });
      log?.(`[ROW ${rowNum}] ERROR - ${matched.code || matched.barcode} | ${msg}`);
    }
  }

  if (slipLines.length > 0) {
    try {
      await stockMovementAPI.createPriceChangeSlip(slipLines, { sourceNote: 'Excel fiyat güncelleme' });
      log?.(`[SLIP] Fiyat değişim fişi kaydedildi (${slipLines.length} kalem).`);
    } catch (slipErr: any) {
      const slipMsg = typeof slipErr?.message === 'string' && slipErr.message.trim() ? slipErr.message.trim() : String(slipErr);
      log?.(`[WARN] Fiyat değişim fişi oluşturulamadı: ${slipMsg}`);
      console.warn('[ExcelModule] createPriceChangeSlip', slipErr);
    }
  }

  log?.(`[END] Fiyat güncelleme bitti. Başarılı: ${result.success}, Hatalı: ${result.failed}`);
  return result;
}

async function importProducts(rows: any[], options?: ImportRunOptions): Promise<ImportResult> {
  const log = options?.onLog;
  const duplicateCodeMode = options?.duplicateCodeMode ?? 'update';
  const duplicateBarcodeMode = options?.duplicateBarcodeMode ?? 'error';
  const result: ImportResult = { total: rows.length, success: 0, failed: 0, errors: [] };
  log?.(`[START] Ürün aktarımı başladı. Toplam satır: ${rows.length}`);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Excel satırı (başlık = 1)
    const code = strFromExcel(row['Ürün Kodu*'] ?? row['Ürün Kodu']);
    const name = strFromExcel(row['Ürün Adı*'] ?? row['Ürün Adı']);
    if (!code || !name) {
      result.failed++;
      result.errors.push({ row: rowNum, message: 'Ürün Kodu ve Ürün Adı zorunludur.' });
      log?.(`[ROW ${rowNum}] SKIP - Zorunlu alan eksik (Kod/Ad).`);
      continue;
    }
    const openingStock = pickCurrentStockFromProductRow(row);
    const payload = {
      code,
      name,
      barcode: barcodeFromExcel(row['Barkod']),
      category: strFromExcel(row['Kategori']),
      group_code: strFromExcel(row['Grup Kodu']),
      brand: strFromExcel(row['Marka']),
      unit: strFromExcel(row['Birim']) || 'Adet',
      cost: numFromExcel(row['Alış Fiyatı']),
      price: numFromExcel(row['Satış Fiyatı*'] ?? row['Satış Fiyatı']),
      taxRate: numFromExcel(row['KDV Oranı (%)'], 18),
      min_stock: numFromExcel(row['Min Stok']),
      max_stock: numFromExcel(row['Max Stok']),
      special_code_1: strFromExcel(row['Özel Kod 1']),
      special_code_2: strFromExcel(row['Özel Kod 2']),
      special_code_3: strFromExcel(row['Özel Kod 3']),
      description: strFromExcel(row['Açıklama']),
      image_url: productImageUrlFromExcelRow(row),
      is_active: boolFromExcel(row['Aktif (E/H)'] ?? 'E'),
      firm_nr: ERP_SETTINGS.firmNr,
      stock: openingStock ?? 0,
    } as any;
    try {
      const existing = await productAPI.getByCode(code);
      if (existing) {
        const incomingBarcode = strFromExcel(payload.barcode);
        const existingBarcode = strFromExcel((existing as any).barcode);
        const hasDifferentBarcode =
          incomingBarcode.length > 0 &&
          existingBarcode.length > 0 &&
          incomingBarcode !== existingBarcode;

        if (hasDifferentBarcode && duplicateCodeMode === 'change-code') {
          const uniqueCode = await buildUniqueProductCode(code, incomingBarcode);
          await productAPI.create({ ...payload, code: uniqueCode } as any);
          result.success++;
          log?.(`[ROW ${rowNum}] CREATE - Kod çakıştı, barkod farklı. Yeni kod: ${uniqueCode} (kural: ürün kodunu değiştir)`);
          continue;
        } else if (hasDifferentBarcode && duplicateCodeMode === 'update') {
          log?.(`[ROW ${rowNum}] UPDATE - Kod aynı, barkod farklı ama kural "güncelle" olduğu için mevcut ürün güncellenecek.`);
        }

        let updateBarcode = strFromExcel(payload.barcode);
        if (updateBarcode) {
          const barcodeOwner = await productAPI.getByBarcode(updateBarcode);
          const barcodeBelongsAnother =
            barcodeOwner &&
            strFromExcel((barcodeOwner as any).id) !== strFromExcel((existing as any).id);
          if (barcodeBelongsAnother) {
            if (duplicateBarcodeMode === 'change-barcode') {
              const uniqueBarcode = await buildUniqueBarcode(updateBarcode);
              log?.(`[ROW ${rowNum}] FIX - Tekrarlı barkod (${updateBarcode}) değiştirildi: ${uniqueBarcode}`);
              updateBarcode = uniqueBarcode;
            } else {
              throw new Error(`Barkod başka üründe var: ${updateBarcode}`);
            }
          }
        }

        const upd: Record<string, any> = {
          name: payload.name,
          barcode: updateBarcode,
          category: payload.category,
          group_code: payload.group_code,
          brand: payload.brand,
          unit: payload.unit,
          cost: payload.cost,
          price: payload.price,
          taxRate: payload.taxRate,
          minStock: payload.min_stock,
          maxStock: payload.max_stock,
          specialCode1: payload.special_code_1,
          specialCode2: payload.special_code_2,
          specialCode3: payload.special_code_3,
          description: payload.description,
          isActive: payload.is_active,
        };
        if (payload.image_url) {
          upd.image_url = payload.image_url;
        }
        if (openingStock !== undefined) {
          upd.stock = openingStock;
        }
        await productAPI.update(existing.id, upd as any);
        result.success++;
        log?.(`[ROW ${rowNum}] UPDATE - ${code}`);
      } else {
        let createPayload = { ...payload };
        const incomingBarcode = strFromExcel(createPayload.barcode);
        if (incomingBarcode) {
          const barcodeOwner = await productAPI.getByBarcode(incomingBarcode);
          if (barcodeOwner) {
            if (duplicateBarcodeMode === 'change-barcode') {
              const uniqueBarcode = await buildUniqueBarcode(incomingBarcode);
              createPayload = { ...createPayload, barcode: uniqueBarcode };
              log?.(`[ROW ${rowNum}] FIX - Tekrarlı barkod (${incomingBarcode}) değiştirildi: ${uniqueBarcode}`);
            } else {
              throw new Error(`Barkod başka üründe var: ${incomingBarcode}`);
            }
          }
        }
        await productAPI.create(createPayload as any);
        result.success++;
        log?.(`[ROW ${rowNum}] CREATE - ${code}`);
      }
    } catch (err: any) {
      result.failed++;
      const msg =
        typeof err?.message === 'string' && err.message.trim()
          ? err.message.trim()
          : err != null
            ? String(err)
            : 'Kayıt oluşturulamadı.';
      result.errors.push({ row: rowNum, message: msg });
      log?.(`[ROW ${rowNum}] ERROR - ${code || '-'} | ${msg}`);
    }
  }
  log?.(`[END] Ürün aktarımı bitti. Başarılı: ${result.success}, Hatalı: ${result.failed}`);
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
        barcode: barcodeFromExcel(row['Barkod']),
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

async function importBeautyAppointments(rows: any[]): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, success: 0, failed: 0, errors: [] };
  const [customers, services, specialists] = await Promise.all([
    beautyService.getCustomers(),
    beautyService.getServices(),
    beautyService.getSpecialists(),
  ]);
  /** İçe aktarımda aynı hizmete ardışık satırlarda güncel kart alanları kalsın */
  let serviceSnapshot = services.slice() as BeautyService[];
  const byCode = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const pushPhone = (digits: string, id: string) => {
    if (digits.length >= 8 && !byPhone.has(digits)) byPhone.set(digits, id);
  };
  for (const c of customers) {
    const id = String(c.id);
    const code = String(c.code || '').trim().toUpperCase();
    if (code) byCode.set(code, id);
    pushPhone(String(c.phone || '').replace(/\D/g, ''), id);
    pushPhone(String((c as { phone2?: string }).phone2 || '').replace(/\D/g, ''), id);
  }
  const byServiceName = new Map<string, string>();
  const byServiceCode = new Map<string, string>();
  for (const s of serviceSnapshot) {
    const r = s as unknown as Record<string, unknown>;
    const nm = String(s.name || '').trim().toLowerCase();
    if (nm && !byServiceName.has(nm)) byServiceName.set(nm, String(s.id));
    const cd = String(r.code ?? r.product_code ?? '').trim().toUpperCase();
    if (cd && !byServiceCode.has(cd)) byServiceCode.set(cd, String(s.id));
  }
  const bySpecName = new Map<string, string>();
  for (const sp of specialists) {
    if (sp.is_active === false) continue;
    const nm = String(sp.name || '').trim().toLowerCase();
    if (nm) bySpecName.set(nm, String(sp.id));
  }

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = normalizeRowKeys(rows[i], 'beauty-appointments');
    try {
      const custCode = strFromExcel(row['Müşteri Kodu']);
      const custPhone = strFromExcel(row['Müşteri Telefon']);
      let customerId: string | null = null;
      if (custCode) customerId = byCode.get(custCode.toUpperCase()) ?? null;
      if (!customerId && custPhone) {
        const dig = custPhone.replace(/\D/g, '');
        if (dig.length >= 8) customerId = byPhone.get(dig) ?? null;
      }
      if (!customerId) {
        result.failed++;
        result.errors.push({ row: rowNum, message: 'Müşteri bulunamadı (Müşteri Kodu veya Müşteri Telefon zorunlu; sistemde kayıtlı olmalı).' });
        continue;
      }
      const svcName = strFromExcel(row['Hizmet Adı*']);
      const svcCode = strFromExcel(row['Hizmet Kodu']);
      let serviceId: string | null = null;
      if (svcCode) serviceId = byServiceCode.get(svcCode.toUpperCase()) ?? null;
      if (!serviceId && svcName) serviceId = byServiceName.get(svcName.toLowerCase()) ?? null;
      if (!serviceId) {
        result.failed++;
        result.errors.push({ row: rowNum, message: 'Hizmet bulunamadı (Hizmet Adı veya Hizmet Kodu; sistemdeki ad/kod ile birebir eşleşmeli).' });
        continue;
      }
      const dateStr = parseAppointmentDate(row['Tarih*']);
      const timeStr = parseAppointmentTime(row['Saat*']);
      if (!dateStr || !timeStr) {
        result.failed++;
        result.errors.push({ row: rowNum, message: 'Tarih veya Saat okunamadı (YYYY-MM-DD ve HH:mm önerilir).' });
        continue;
      }
      const specName = strFromExcel(row['Uzman Adı']).toLowerCase();
      const staffId = specName ? (bySpecName.get(specName) ?? null) : null;
      if (specName && !staffId) {
        result.failed++;
        result.errors.push({ row: rowNum, message: `Uzman bulunamadı: "${row['Uzman Adı'] || specName}"` });
        continue;
      }
      const duration = Math.max(1, Math.round(numFromExcel(row['Süre (dk)'], 30)) || 30);
      const statusRaw = (strFromExcel(row['Durum']).toLowerCase() || 'scheduled').slice(0, 20);
      const totalPrice = numFromExcel(row['Tutar'], 0);
      const notes = strFromExcel(row['Notlar']) || undefined;

      const fuCell = row[COL_BEAUTY_APPT_FOLLOW_UP_DAYS];
      const dsCell = row[COL_BEAUTY_APPT_DEFAULT_SESSIONS];
      const fuTrim = fuCell !== undefined && fuCell !== null ? String(fuCell).trim() : '';
      const dsTrim = dsCell !== undefined && dsCell !== null ? String(dsCell).trim() : '';

      let followUpForService: number | null | undefined = undefined;
      if (fuTrim.length > 0) {
        const n = Math.round(numFromExcel(fuCell, NaN));
        if (!Number.isFinite(n) || n < 0) {
          result.failed++;
          result.errors.push({
            row: rowNum,
            message:
              'Hatırlatma (gün): sütunu boş bırakın veya 0 (kapalı) ya da 1–3650 arasında tam sayı girin.',
          });
          continue;
        }
        followUpForService = n <= 0 ? null : Math.min(3650, n);
      }

      let defaultSessionsForService: number | undefined = undefined;
      if (dsTrim.length > 0) {
        const n = Math.round(numFromExcel(dsCell, NaN));
        if (!Number.isFinite(n) || n < 1 || n > 99) {
          result.failed++;
          result.errors.push({
            row: rowNum,
            message: 'Seans sayısı (varsayılan): boş bırakın veya 1–99 arası tam sayı girin.',
          });
          continue;
        }
        defaultSessionsForService = n;
      }

      await beautyService.createAppointment({
        customer_id: customerId,
        service_id: serviceId,
        staff_id: staffId ?? undefined,
        date: dateStr,
        time: timeStr,
        duration,
        status: statusRaw as any,
        notes,
        total_price: totalPrice,
      });

      if (followUpForService !== undefined || defaultSessionsForService !== undefined) {
        const idx = serviceSnapshot.findIndex(s => String(s.id) === serviceId);
        const svcFull = idx >= 0 ? serviceSnapshot[idx] : undefined;
        if (svcFull) {
          await beautyService.updateService(serviceId, {
            ...svcFull,
            ...(followUpForService !== undefined ? { follow_up_reminder_days: followUpForService } : {}),
            ...(defaultSessionsForService !== undefined ? { default_sessions: defaultSessionsForService } : {}),
          });
          if (idx >= 0) {
            serviceSnapshot[idx] = {
              ...svcFull,
              ...(followUpForService !== undefined ? { follow_up_reminder_days: followUpForService } : {}),
              ...(defaultSessionsForService !== undefined
                ? { default_sessions: defaultSessionsForService }
                : {}),
            };
          }
        }
      }

      result.success++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: rowNum, message: err?.message || 'Randevu oluşturulamadı.' });
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
  importFn?: (rows: any[], options?: ImportRunOptions) => Promise<ImportResult>;
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
    importNote:
      '"Görsel URL" → image_url. Fiyatlar Türkçe biçimde olabilir: binlik ayırıcı nokta (örn. 5.000 veya 125.000), ondalık virgül (örn. 99,90). Sayfa adı "Ürünler" olmalı.',
  },
  {
    id: 'price-updates',
    label: 'priceUpdatesEntities',
    icon: TrendingUp,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    exportFn: exportPriceUpdates,
    importFn: importPriceUpdates,
    importNote:
      'Yalnızca alış ve satış fiyatlarını günceller; diğer ürün alanlarına dokunmaz. Eşleştirme barkod veya ürün kodu ile yapılır. Boş bırakılan "Yeni Alış" / "Yeni Satış" hücresi atlanır (silmez). Bulunamayan ürünler hata listesine yazılır — yeni ürün eklenmez. Sayfa adı "Fiyat Güncelleme" olmalı.',
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
  {
    id: 'beauty-appointments',
    label: 'beautyAppointmentsEntities',
    icon: Calendar,
    color: 'text-fuchsia-600',
    bgColor: 'bg-fuchsia-50',
    borderColor: 'border-fuchsia-200',
    exportFn: exportBeautyAppointments,
    importFn: importBeautyAppointments,
    importNote:
      'Müşteri sistemde (güzellik CRM) kayıtlı olmalı: Müşteri Kodu veya telefon (en az 8 rakam) ile eşlenir. Hizmet adı/kodu güzellik hizmet listesiyle aynı olmalı. Durum: scheduled, confirmed, in_progress, completed, cancelled, no_show. Uzman adı doluysa kullanıcı listesindeki adla birebir eşleşmeli. Her içe aktarım yeni randevu oluşturur. İsteğe bağlı: «Hatırlatma (gün)» ve «Seans sayısı (varsayılan)» doluysa ilgili güzellik hizmet kartı güncellenir (0 = hatırlatma kapalı).',
  },
  {
    id: 'beauty-sales',
    label: 'beautySalesEntities',
    icon: CreditCard,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    exportFn: exportBeautySales,
    importNote:
      'Yalnızca dışa aktarım: Güzellik POS / tahsilat kayıtları Excel’e aktarılır. Ödeme satırları içe aktarılmaz (çift kayıt ve muhasebe tutarlılığı).',
  },
];

export function ExcelModule() {
  const { tm } = useLanguage();
  const loadProducts = useProductStore((s) => s.loadProducts);
  const loadCustomers = useCustomerStore((s) => s.loadCustomers);
  const [activeTab, setActiveTab] = useState<EntityType>('products');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [duplicateCodeMode, setDuplicateCodeMode] = useState<'update' | 'change-code'>('change-code');
  const [duplicateBarcodeMode, setDuplicateBarcodeMode] = useState<'error' | 'change-barcode'>('change-barcode');
  const [isLoading, setIsLoading] = useState(false);
  const [editErrorModal, setEditErrorModal] = useState<{
    open: true;
    row: number;
    draft: Record<string, any>;
  } | { open: false }>({ open: false });
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

  const appendImportLog = useCallback((line: string) => {
    setImportLogs((prev) => {
      const next = [...prev, `${new Date().toLocaleTimeString()} ${line}`];
      // Terminal panelinin şişmesini önle
      if (next.length > 500) return next.slice(next.length - 500);
      return next;
    });
  }, []);

  // Şablon indir
  const handleDownloadTemplate = useCallback(async () => {
    try {
      await saveExcelOrThrow(
        template.sheetName,
        template.sample,
        `Sablon_${template.sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`
      );
      showNotification({ type: 'success', message: `${tm(template.label as any) || template.label} şablonu indirildi.` });
    } catch (err: any) {
      if (isExcelExportCancelled(err)) {
        setNotification(null);
        return;
      }
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
      if (isExcelExportCancelled(err)) {
        setNotification(null);
        return;
      }
      showNotification({ type: 'error', message: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [tab, showNotification]);

  // İçe aktar
  const runImportWithRows = useCallback(async (rows: any[]) => {
    if (!tab.importFn) return;
    setImportResult(null);
    setImportLogs([]);
    showNotification({ type: 'loading', message: `${tm(tab.label as any) || tab.label} içe aktarılıyor...` }, false);
    try {
      const result = await tab.importFn(rows, {
        onLog: appendImportLog,
        duplicateCodeMode,
        duplicateBarcodeMode,
      });
      result.errors = result.errors.map((err) => {
        const rowData = rows[err.row - 2] as Record<string, any> | undefined;
        return { ...err, preview: buildRowPreview(rowData), rowData };
      });
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
        if (tab.id === 'products' || tab.id === 'price-updates') loadProducts(true);
        else if (tab.id === 'current-accounts') loadCustomers();
      }
    } catch (err: any) {
      showNotification({ type: 'error', message: 'İçe aktarım hatası: ' + (err?.message || 'Bilinmeyen hata') });
    } finally {
      setIsLoading(false);
    }
  }, [tab, showNotification, loadProducts, loadCustomers, appendImportLog, duplicateCodeMode, duplicateBarcodeMode]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tab.importFn) return;

    setIsLoading(true);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, {
          type: 'array',
          cellDates: tab.id === 'beauty-appointments',
        });
        const worksheet = getSheetForImport(workbook, tab.id);
        if (!worksheet) {
          showNotification({ type: 'error', message: 'Excel sayfası bulunamadı.' });
          setIsLoading(false);
          return;
        }
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false }) as Record<string, any>[];
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

  const handleOpenErrorEditor = useCallback((err: { row: number; rowData?: Record<string, any> }) => {
    if (!err.rowData) return;
    setEditErrorModal({ open: true, row: err.row, draft: { ...err.rowData } });
  }, []);

  const handleErrorFieldChange = useCallback((key: string, value: string) => {
    setEditErrorModal((prev) => {
      if (!prev.open) return prev;
      return { ...prev, draft: { ...prev.draft, [key]: value } };
    });
  }, []);

  const handleRetryEditedRow = useCallback(async () => {
    if (!editErrorModal.open) return;
    if (!tab.importFn) return;

    const originalRow = editErrorModal.row;
    const draft = { ...editErrorModal.draft };

    setIsLoading(true);
    setImportLogs([]);
    showNotification({ type: 'loading', message: `Satır ${originalRow} tekrar içe aktarılıyor...` }, false);
    try {
      const retryResult = await tab.importFn([draft], {
        onLog: appendImportLog,
        duplicateCodeMode,
        duplicateBarcodeMode,
      });
      const retryErrors = retryResult.errors.map((err) => ({
        ...err,
        row: originalRow,
        rowData: draft,
        preview: buildRowPreview(draft),
      }));

      setImportResult((prev) => {
        if (!prev) {
          return {
            total: 1,
            success: retryResult.success,
            failed: retryResult.failed,
            errors: retryErrors,
          };
        }

        const withoutCurrent = prev.errors.filter((e) => e.row !== originalRow);
        return {
          total: prev.total,
          success: prev.success + retryResult.success,
          failed: Math.max(0, prev.failed - 1) + retryResult.failed,
          errors: [...withoutCurrent, ...retryErrors],
        };
      });

      if (retryResult.failed === 0) {
        showNotification({ type: 'success', message: `Satır ${originalRow} başarıyla aktarıldı.` });
        if (tab.id === 'products' || tab.id === 'price-updates') loadProducts(true);
        else if (tab.id === 'current-accounts') loadCustomers();
      } else {
        showNotification({ type: 'error', message: `Satır ${originalRow} için hata devam ediyor.` });
      }

      setEditErrorModal({ open: false });
    } catch (err: any) {
      showNotification({ type: 'error', message: 'Tekrar aktarım hatası: ' + (err?.message || 'Bilinmeyen hata') });
    } finally {
      setIsLoading(false);
    }
  }, [editErrorModal, tab, showNotification, loadProducts, loadCustomers, appendImportLog, duplicateCodeMode, duplicateBarcodeMode]);

  const handleCloseErrorEditor = useCallback(() => {
    setEditErrorModal({ open: false });
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
            <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-black/50">
              <div className="flex min-h-[100dvh] min-h-screen items-center justify-center p-3 py-6 sm:p-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-w-md w-full max-h-[min(90vh,100dvh)] min-h-0 flex flex-col overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Aktarım öncesi oluşturulacak kategoriler
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Aşağıdaki kategoriler sistemde bulunmuyor; aktarım sırasında oluşturulacak.
                    </p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-5">
                    <ul className="space-y-2">
                      {categoryPreviewModal.newCategories.map((name, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                          <Tag className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span>{name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 shrink-0">
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
            </div>
          )}

          {/* Hatalı satır düzenleme modalı */}
          {editErrorModal.open && (
            <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-black/50">
              <div className="flex min-h-[100dvh] min-h-screen items-center justify-center p-3 py-6 sm:p-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-w-2xl w-full max-h-[min(90vh,100dvh)] min-h-0 flex flex-col overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Hatalı satırı düzelt (Satır {editErrorModal.row})
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Alanları güncelleyip yalnızca bu satırı tekrar içe aktarabilirsiniz.
                    </p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
                    {Object.keys(editErrorModal.draft).map((key) => (
                      <label key={key} className="block">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{key}</span>
                        <input
                          type="text"
                          value={strFromExcel(editErrorModal.draft[key])}
                          onChange={(e) => handleErrorFieldChange(key, e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCloseErrorEditor}
                      className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      İptal
                    </button>
                    <button
                      type="button"
                      onClick={handleRetryEditedRow}
                      disabled={isLoading}
                      className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      Düzelt ve tekrar aktar
                    </button>
                  </div>
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
                {tab.id === 'products' && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                        Tekrar eden ürün kodu (kod aynı, barkod farklı)
                      </label>
                      <select
                        value={duplicateCodeMode}
                        onChange={(e) => setDuplicateCodeMode(e.target.value as 'update' | 'change-code')}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-2 text-xs text-gray-700 dark:text-gray-200"
                      >
                        <option value="change-code">Ürün kodunu değiştirip yeni ürün ekle</option>
                        <option value="update">Mevcut ürünü güncelle</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                        Tekrar eden barkod
                      </label>
                      <select
                        value={duplicateBarcodeMode}
                        onChange={(e) => setDuplicateBarcodeMode(e.target.value as 'error' | 'change-barcode')}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-2 text-xs text-gray-700 dark:text-gray-200"
                      >
                        <option value="change-barcode">Barkodu değiştirip ekle</option>
                        <option value="error">Hata ver, aktarma</option>
                      </select>
                    </div>
                  </div>
                )}
                {tab.id === 'price-updates' && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      {tm('priceMatchHint') ||
                        'Ürün kodu veya barkoddan biri yeterlidir; barkod varsa önce barkod (alternatif barkodlar dahil), yoksa kod ile eşlenir. Mevcut fiyatlar her zaman sistemden okunur. Başarılı aktarımdan sonra tek bir fiyat değişim fişi oluşturulur ve ürün hareketlerinde görünür.'}
                    </div>
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

          {/* Import Terminal Log */}
          {(isLoading || importLogs.length > 0) && (
            <div className="bg-black rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-green-400">Import Terminal</h3>
                <span className="text-[11px] text-gray-400">{importLogs.length} log</span>
              </div>
              <div className="max-h-64 overflow-y-auto p-3 font-mono text-[11px] leading-5 text-green-300 space-y-0.5">
                {importLogs.length === 0 ? (
                  <div className="text-gray-500">Log bekleniyor...</div>
                ) : (
                  importLogs.map((line, idx) => <div key={idx}>{line}</div>)
                )}
              </div>
            </div>
          )}

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
                        <div key={idx} className="text-xs bg-red-50 dark:bg-red-900/10 rounded p-2">
                          <div className="flex items-start gap-2">
                            <span className="font-mono font-semibold text-red-500 flex-shrink-0">Satır {err.row}:</span>
                            <span className="text-red-700 dark:text-red-300">{err.message}</span>
                          </div>
                          {err.preview && (
                            <div className="mt-1 pl-14 text-red-600/90 dark:text-red-300/90 break-words">
                              Önizleme: {err.preview}
                            </div>
                          )}
                          {err.rowData && (
                            <div className="mt-2 pl-14">
                              <button
                                type="button"
                                onClick={() => handleOpenErrorEditor(err)}
                                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Bu satırı düzelt
                              </button>
                            </div>
                          )}
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
