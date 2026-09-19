#!/usr/bin/env node
/**
 * RetailEX hazır Grafana panoları — docker/grafana/dashboards/
 * Çalıştır: node scripts/generate-grafana-ready-dashboards.mjs
 * Mevcut elle yazılmış panoları silmez; yalnızca bu listedekileri yazar/üzerine yazar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../docker/grafana/dashboards');

const firmPeriodVars = {
  list: [
    {
      name: 'firm',
      type: 'textbox',
      label: 'Firma',
      query: '001',
      current: { selected: true, text: '001', value: '001' },
      hide: 0,
    },
    {
      name: 'period',
      type: 'textbox',
      label: 'Dönem',
      query: '01',
      current: { selected: true, text: '01', value: '01' },
      hide: 0,
    },
  ],
};

function ds() {
  return { type: 'postgres', uid: 'postgres' };
}

function stat(id, title, sql, x, y, w = 6, h = 4, unit = 'short') {
  return {
    id,
    title,
    type: 'stat',
    gridPos: { h, w, x, y },
    datasource: ds(),
    targets: [{ refId: 'A', format: 'table', rawQuery: true, rawSql: sql }],
    fieldConfig: { defaults: { unit }, overrides: [] },
    options: {
      colorMode: 'value',
      graphMode: 'none',
      justifyMode: 'auto',
      orientation: 'auto',
      reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
      textMode: 'auto',
    },
  };
}

function table(id, title, sql, x, y, w = 24, h = 10) {
  return {
    id,
    title,
    type: 'table',
    gridPos: { h, w, x, y },
    datasource: ds(),
    targets: [{ refId: 'A', format: 'table', rawQuery: true, rawSql: sql }],
    fieldConfig: { defaults: {}, overrides: [] },
  };
}

function bar(id, title, sql, x, y, w = 12, h = 8) {
  return {
    id,
    title,
    type: 'barchart',
    gridPos: { h, w, x, y },
    datasource: ds(),
    targets: [{ refId: 'A', format: 'table', rawQuery: true, rawSql: sql }],
    fieldConfig: { defaults: {}, overrides: [] },
    options: {
      legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
      orientation: 'horizontal',
      xTickLabelRotation: 0,
      xTickLabelSpacing: 0,
    },
  };
}

function dash({ uid, title, tags, panels, refresh = '2m' }) {
  return {
    annotations: { list: [] },
    editable: true,
    fiscalYearStartMonth: 0,
    graphTooltip: 1,
    id: null,
    links: [],
    panels,
    refresh,
    schemaVersion: 39,
    tags: ['retailex', 'ready', ...tags],
    templating: firmPeriodVars,
    time: { from: 'now-30d', to: 'now' },
    timepicker: {},
    timezone: 'browser',
    title,
    uid,
    version: 1,
  };
}

const S = 'rex_${firm}_${period}_sales';
const SI = 'rex_${firm}_${period}_sale_items';
const CL = 'rex_${firm}_${period}_cash_lines';
const BL = 'rex_${firm}_${period}_bank_lines';
const AM = 'rex_${firm}_${period}_account_movements';
const P = 'rex_${firm}_products';
const C = 'rex_${firm}_customers';
const SUP = 'rex_${firm}_suppliers';
const EXP = 'rex_${firm}_expenses';
const CR = 'rex_${firm}_cash_registers';
const BR = 'rex_${firm}_bank_registers';

/** @type {Array<{uid:string,title:string,tags:string[],panels:unknown[]}>} */
const DEFS = [
  {
    uid: 'retailex-executive',
    title: 'RetailEX Yönetim Panosu',
    tags: ['executive', 'erp'],
    panels: [
      stat(1, 'Ciro (net)', `SELECT COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false;`, 0, 0, 6, 4, 'currencyTRY'),
      stat(2, 'Fiş adedi', `SELECT count(*)::int AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false;`, 6, 0),
      stat(3, 'Müşteri', `SELECT count(*)::int AS value FROM ${C};`, 12, 0),
      stat(4, 'Ürün kartı', `SELECT count(*)::int AS value FROM ${P};`, 18, 0),
      bar(5, 'Ödeme yöntemi', `SELECT COALESCE(payment_method,'—') AS metric, count(*)::int AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 2 DESC LIMIT 12;`, 0, 4, 12, 8),
      bar(6, 'Günlük ciro', `SELECT to_char(date_trunc('day', COALESCE(date,created_at)),'YYYY-MM-DD') AS metric, COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 1 DESC LIMIT 14;`, 12, 4, 12, 8),
    ],
  },
  {
    uid: 'retailex-pos-z',
    title: 'RetailEX POS / Z Özeti',
    tags: ['pos', 'sales', 'erp'],
    panels: [
      stat(1, 'Bugün fiş', `SELECT count(*)::int AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date = CURRENT_DATE;`, 0, 0),
      stat(2, 'Bugün ciro', `SELECT COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date = CURRENT_DATE;`, 6, 0, 6, 4, 'currencyTRY'),
      stat(3, 'İptal bugün', `SELECT count(*)::int AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=true AND (COALESCE(date,created_at))::date = CURRENT_DATE;`, 12, 0),
      stat(4, 'Ort. sepet', `SELECT COALESCE(avg(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date = CURRENT_DATE;`, 18, 0, 6, 4, 'currencyTRY'),
      table(5, 'Kasiyer özeti (dönem)', `SELECT COALESCE(cashier,'(yok)') AS kasiyer, count(*) AS fis, COALESCE(sum(total_net),0) AS ciro FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY ciro DESC LIMIT 50;`, 0, 4, 24, 10),
    ],
  },
  {
    uid: 'retailex-payments',
    title: 'RetailEX Ödeme Dağılımı',
    tags: ['payments', 'sales', 'erp'],
    panels: [
      bar(1, 'Ödeme yöntemi (adet)', `SELECT COALESCE(payment_method,'—') AS metric, count(*)::int AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 2 DESC;`, 0, 0, 12, 8),
      bar(2, 'Ödeme yöntemi (tutar)', `SELECT COALESCE(payment_method,'—') AS metric, COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 2 DESC;`, 12, 0, 12, 8),
      table(3, 'Detay', `SELECT COALESCE(payment_method,'—') AS yontem, count(*) AS adet, COALESCE(sum(total_net),0) AS tutar, COALESCE(sum(total_vat),0) AS kdv FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY tutar DESC;`, 0, 8, 24, 8),
    ],
  },
  {
    uid: 'retailex-sales-returns',
    title: 'RetailEX Satış İade / İptal',
    tags: ['sales', 'returns', 'erp'],
    panels: [
      stat(1, 'İptal fiş', `SELECT count(*)::int AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=true;`, 0, 0),
      stat(2, 'İptal tutar', `SELECT COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=true;`, 6, 0, 6, 4, 'currencyTRY'),
      stat(3, 'İade trcode', `SELECT count(*)::int AS value FROM ${S} WHERE trcode IN (2,3,7,8) OR lower(COALESCE(fiche_type,'')) LIKE '%iade%';`, 12, 0),
      table(4, 'Son iptaller', `SELECT fiche_no, COALESCE(date,created_at) AS tarih, customer_name, total_net, payment_method, cashier FROM ${S} WHERE COALESCE(is_cancelled,false)=true ORDER BY COALESCE(date,created_at) DESC NULLS LAST LIMIT 100;`, 0, 4, 24, 12),
    ],
  },
  {
    uid: 'retailex-sales-trend',
    title: 'RetailEX Satış Trend',
    tags: ['sales', 'trend', 'erp'],
    panels: [
      bar(1, 'Günlük net ciro', `SELECT to_char(date_trunc('day', COALESCE(date,created_at)),'YYYY-MM-DD') AS metric, COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 1;`, 0, 0, 24, 9),
      table(2, 'Haftalık özet', `SELECT to_char(date_trunc('week', COALESCE(date,created_at)),'IYYY-"W"IW') AS hafta, count(*) AS fis, COALESCE(sum(total_net),0) AS ciro, COALESCE(avg(total_net),0) AS ort FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 1 DESC LIMIT 26;`, 0, 9, 24, 9),
    ],
  },
  {
    uid: 'retailex-cashiers',
    title: 'RetailEX Kasiyer Performansı',
    tags: ['pos', 'cashiers', 'erp'],
    panels: [
      table(1, 'Kasiyer', `SELECT COALESCE(nullif(trim(cashier),''),'(atanmamış)') AS kasiyer, count(*) AS fis_adet, COALESCE(sum(CASE WHEN COALESCE(is_cancelled,false)=false THEN total_net ELSE 0 END),0) AS ciro, sum(CASE WHEN COALESCE(is_cancelled,false)=true THEN 1 ELSE 0 END) AS iptal FROM ${S} GROUP BY 1 ORDER BY ciro DESC LIMIT 100;`, 0, 0, 24, 14),
    ],
  },
  {
    uid: 'retailex-category-profit',
    title: 'RetailEX Ürün / Kalem Karlılık',
    tags: ['sales', 'profit', 'erp'],
    panels: [
      stat(1, 'Brüt kar', `SELECT COALESCE(sum(gross_profit),0)::float AS value FROM ${SI};`, 0, 0, 8, 4, 'currencyTRY'),
      stat(2, 'Satır maliyeti', `SELECT COALESCE(sum(total_cost),0)::float AS value FROM ${SI};`, 8, 0, 8, 4, 'currencyTRY'),
      stat(3, 'Satır net', `SELECT COALESCE(sum(net_amount),0)::float AS value FROM ${SI};`, 16, 0, 8, 4, 'currencyTRY'),
      table(4, 'En karlı kalemler', `SELECT item_code, item_name, sum(quantity) AS qty, sum(net_amount) AS net, sum(gross_profit) AS kar FROM ${SI} GROUP BY 1,2 ORDER BY kar DESC NULLS LAST LIMIT 50;`, 0, 4, 24, 12),
    ],
  },
  {
    uid: 'retailex-purchases',
    title: 'RetailEX Satın Alma Özeti',
    tags: ['purchase', 'erp'],
    panels: [
      stat(1, 'Alış fiş', `SELECT count(*)::int AS value FROM ${S} WHERE trcode IN (1,4,5) OR lower(COALESCE(fiche_type,'')) LIKE '%alis%' OR lower(COALESCE(fiche_type,'')) LIKE '%alış%';`, 0, 0),
      stat(2, 'Alış tutar', `SELECT COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE trcode IN (1,4,5) OR lower(COALESCE(fiche_type,'')) LIKE '%alis%' OR lower(COALESCE(fiche_type,'')) LIKE '%alış%';`, 6, 0, 6, 4, 'currencyTRY'),
      table(3, 'Son alışlar', `SELECT fiche_no, COALESCE(date,created_at) AS tarih, customer_name, trcode, fiche_type, total_net FROM ${S} WHERE trcode IN (1,4,5) OR lower(COALESCE(fiche_type,'')) LIKE '%alis%' OR lower(COALESCE(fiche_type,'')) LIKE '%alış%' ORDER BY COALESCE(date,created_at) DESC NULLS LAST LIMIT 80;`, 0, 4, 24, 12),
    ],
  },
  {
    uid: 'retailex-documents',
    title: 'RetailEX Belge Türü Analizi',
    tags: ['invoices', 'erp'],
    panels: [
      bar(1, 'trcode dağılımı', `SELECT COALESCE(trcode::text,'?') AS metric, count(*)::int AS value FROM ${S} GROUP BY 1 ORDER BY 2 DESC;`, 0, 0, 12, 8),
      bar(2, 'fiche_type', `SELECT COALESCE(nullif(fiche_type,''),'—') AS metric, count(*)::int AS value FROM ${S} GROUP BY 1 ORDER BY 2 DESC LIMIT 15;`, 12, 0, 12, 8),
      table(3, 'Tür özeti', `SELECT trcode, fiche_type, count(*) AS adet, COALESCE(sum(total_net),0) AS tutar FROM ${S} GROUP BY 1,2 ORDER BY adet DESC LIMIT 100;`, 0, 8, 24, 10),
    ],
  },
  {
    uid: 'retailex-invoice-lines',
    title: 'RetailEX Fatura Kalem Detayı',
    tags: ['invoices', 'erp'],
    panels: [
      table(1, 'Son kalemler', `SELECT si.item_code, si.item_name, si.quantity, si.unit_price, si.net_amount, si.vat_rate, s.fiche_no, COALESCE(s.date,s.created_at) AS tarih FROM ${SI} si LEFT JOIN ${S} s ON s.id = si.invoice_id ORDER BY COALESCE(s.date,s.created_at) DESC NULLS LAST LIMIT 200;`, 0, 0, 24, 16),
    ],
  },
  {
    uid: 'retailex-inventory-value',
    title: 'RetailEX Stok Değer',
    tags: ['stock', 'erp'],
    panels: [
      stat(1, 'Ürün adedi', `SELECT count(*)::int AS value FROM ${P};`, 0, 0),
      stat(2, 'Aktif ürün', `SELECT count(*)::int AS value FROM ${P} WHERE COALESCE(is_active,true)=true;`, 6, 0),
      table(3, 'Ürün listesi (değer alanları)', `SELECT code, name, COALESCE(stock,0) AS stok, COALESCE(purchase_price,0) AS alis, COALESCE(price,0) AS satis, COALESCE(stock,0)*COALESCE(purchase_price, cost, 0) AS maliyet_deger FROM ${P} ORDER BY maliyet_deger DESC NULLS LAST LIMIT 200;`, 0, 4, 24, 14),
    ],
  },
  {
    uid: 'retailex-stock-alerts',
    title: 'RetailEX Kritik Stok & SKT',
    tags: ['stock', 'alerts', 'erp'],
    panels: [
      table(1, 'Düşük / kritik stok', `SELECT code, name, COALESCE(stock,0) AS stok, COALESCE(min_stock,0) AS min_stok, COALESCE(critical_stock,0) AS kritik, COALESCE(price,0) AS fiyat FROM ${P} WHERE COALESCE(stock,0) <= GREATEST(COALESCE(min_stock,0), COALESCE(critical_stock,0)) ORDER BY stok ASC NULLS LAST LIMIT 100;`, 0, 0, 24, 8),
      table(2, 'SKT yaklaşan (sale_items)', `SELECT item_code, item_name, expiry_date, sum(quantity) AS qty FROM ${SI} WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '60 days' GROUP BY 1,2,3 ORDER BY expiry_date ASC LIMIT 100;`, 0, 8, 24, 8),
    ],
  },
  {
    uid: 'retailex-stock-movements',
    title: 'RetailEX Stok Hareket (satış kalemi)',
    tags: ['stock', 'erp'],
    panels: [
      bar(1, 'En çok satılan', `SELECT COALESCE(item_name,item_code,'—') AS metric, sum(quantity)::float AS value FROM ${SI} GROUP BY 1 ORDER BY 2 DESC LIMIT 15;`, 0, 0, 24, 8),
      table(2, 'Hareket özeti', `SELECT item_code, item_name, sum(quantity) AS qty, sum(net_amount) AS net FROM ${SI} GROUP BY 1,2 ORDER BY qty DESC LIMIT 100;`, 0, 8, 24, 10),
    ],
  },
  {
    uid: 'retailex-warehouse-stock',
    title: 'RetailEX Ambar / Ürün Durumu',
    tags: ['stock', 'warehouse', 'erp'],
    panels: [
      stat(1, 'Ürün', `SELECT count(*)::int AS value FROM ${P};`, 0, 0, 8, 4),
      stat(2, 'Sıfır stok', `SELECT count(*)::int AS value FROM ${P} WHERE COALESCE(stock,0)=0;`, 8, 0, 8, 4),
      stat(3, 'Negatif stok', `SELECT count(*)::int AS value FROM ${P} WHERE COALESCE(stock,0)<0;`, 16, 0, 8, 4),
      table(4, 'Stok durumu', `SELECT code, name, COALESCE(stock,0) AS stok, COALESCE(unit,'Adet') AS birim, COALESCE(is_active,true) AS aktif FROM ${P} ORDER BY stok ASC NULLS LAST LIMIT 200;`, 0, 4, 24, 12),
    ],
  },
  {
    uid: 'retailex-cash-flow',
    title: 'RetailEX Kasa Defteri / Nakit Akış',
    tags: ['cash', 'finance', 'erp'],
    panels: [
      stat(1, 'Giriş (+)', `SELECT COALESCE(sum(CASE WHEN sign>=0 THEN amount ELSE 0 END),0)::float AS value FROM ${CL};`, 0, 0, 8, 4, 'currencyTRY'),
      stat(2, 'Çıkış (−)', `SELECT COALESCE(sum(CASE WHEN sign<0 THEN amount ELSE 0 END),0)::float AS value FROM ${CL};`, 8, 0, 8, 4, 'currencyTRY'),
      stat(3, 'Net', `SELECT COALESCE(sum(amount * CASE WHEN sign<0 THEN -1 ELSE 1 END),0)::float AS value FROM ${CL};`, 16, 0, 8, 4, 'currencyTRY'),
      table(4, 'Son kasa satırları', `SELECT date, amount, sign, trcode, transaction_type, definition, currency_code FROM ${CL} ORDER BY date DESC NULLS LAST LIMIT 150;`, 0, 4, 24, 12),
    ],
  },
  {
    uid: 'retailex-expenses',
    title: 'RetailEX Gider Özeti',
    tags: ['expenses', 'finance', 'erp'],
    panels: [
      stat(1, 'Gider adedi', `SELECT count(*)::int AS value FROM ${EXP};`, 0, 0),
      stat(2, 'Toplam gider', `SELECT COALESCE(sum(amount),0)::float AS value FROM ${EXP};`, 6, 0, 6, 4, 'currencyTRY'),
      bar(3, 'Kategori', `SELECT COALESCE(category,'—') AS metric, COALESCE(sum(amount),0)::float AS value FROM ${EXP} GROUP BY 1 ORDER BY 2 DESC;`, 12, 0, 12, 8),
      table(4, 'Gider listesi', `SELECT expense_date, category, description, amount, payment_method, document_number FROM ${EXP} ORDER BY expense_date DESC NULLS LAST LIMIT 150;`, 0, 8, 24, 10),
    ],
  },
  {
    uid: 'retailex-collections',
    title: 'RetailEX Tahsilat & Ödeme',
    tags: ['finance', 'erp'],
    panels: [
      stat(1, 'Kasa satır', `SELECT count(*)::int AS value FROM ${CL};`, 0, 0),
      stat(2, 'Banka satır', `SELECT count(*)::int AS value FROM ${BL};`, 6, 0),
      stat(3, 'Cari hareket', `SELECT count(*)::int AS value FROM ${AM};`, 12, 0),
      table(4, 'Cari hareketler', `SELECT date, fiche_no, amount, sign, trcode, definition FROM ${AM} ORDER BY date DESC NULLS LAST LIMIT 150;`, 0, 4, 24, 12),
    ],
  },
  {
    uid: 'retailex-cheques',
    title: 'RetailEX Çek / Senet',
    tags: ['finance', 'erp'],
    panels: [
      table(1, 'Çekler (firma)', 'SELECT * FROM rex_${firm}_cheques ORDER BY created_at DESC NULLS LAST LIMIT 100;', 0, 0, 24, 16),
    ],
  },
  {
    uid: 'retailex-cari-aging',
    title: 'RetailEX Cari Yaşlandırma',
    tags: ['customers', 'finance', 'erp'],
    panels: [
      table(1, 'Müşteri bakiyeleri', `SELECT code, name, COALESCE(balance,0) AS bakiye, phone, is_active FROM ${C} ORDER BY abs(COALESCE(balance,0)) DESC NULLS LAST LIMIT 200;`, 0, 0, 12, 14),
      table(2, 'Tedarikçi bakiyeleri', `SELECT code, name, COALESCE(balance,0) AS bakiye, phone, is_active FROM ${SUP} ORDER BY abs(COALESCE(balance,0)) DESC NULLS LAST LIMIT 200;`, 12, 0, 12, 14),
    ],
  },
  {
    uid: 'retailex-cari-extract',
    title: 'RetailEX Cari Ekstre Özeti',
    tags: ['customers', 'finance', 'erp'],
    panels: [
      stat(1, 'Hareket adedi', `SELECT count(*)::int AS value FROM ${AM};`, 0, 0, 8, 4),
      stat(2, 'Borç (+)', `SELECT COALESCE(sum(CASE WHEN sign>0 THEN amount ELSE 0 END),0)::float AS value FROM ${AM};`, 8, 0, 8, 4, 'currencyTRY'),
      stat(3, 'Alacak (−)', `SELECT COALESCE(sum(CASE WHEN sign<0 THEN amount ELSE 0 END),0)::float AS value FROM ${AM};`, 16, 0, 8, 4, 'currencyTRY'),
      table(4, 'Ekstre satırları', `SELECT date, fiche_no, customer_id, supplier_id, amount, sign, trcode, definition FROM ${AM} ORDER BY date DESC NULLS LAST LIMIT 200;`, 0, 4, 24, 12),
    ],
  },
  {
    uid: 'retailex-customer-sales',
    title: 'RetailEX Müşteri Satış Analizi',
    tags: ['customers', 'sales', 'erp'],
    panels: [
      table(1, 'En çok satılan müşteriler', `SELECT COALESCE(nullif(customer_name,''),'(anonim)') AS musteri, count(*) AS fis, COALESCE(sum(total_net),0) AS ciro FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY ciro DESC LIMIT 100;`, 0, 0, 24, 16),
    ],
  },
  {
    uid: 'retailex-mizan',
    title: 'RetailEX Mizan (özet)',
    tags: ['accounting', 'erp'],
    panels: [
      table(1, 'Kasa bakiyeleri', `SELECT code, name, currency_code, COALESCE(balance,0) AS bakiye, is_active FROM ${CR} ORDER BY code;`, 0, 0, 12, 10),
      table(2, 'Banka bakiyeleri', `SELECT code, name, bank_name, currency_code, COALESCE(balance,0) AS bakiye FROM ${BR} ORDER BY code;`, 12, 0, 12, 10),
      table(3, 'Cari net (müşteri)', `SELECT sum(CASE WHEN COALESCE(balance,0)>0 THEN balance ELSE 0 END) AS borclu, sum(CASE WHEN COALESCE(balance,0)<0 THEN balance ELSE 0 END) AS alacakli, sum(COALESCE(balance,0)) AS net FROM ${C};`, 0, 10, 24, 6),
    ],
  },
  {
    uid: 'retailex-pnl',
    title: 'RetailEX Kar / Zarar (yönetim)',
    tags: ['accounting', 'erp'],
    panels: [
      stat(1, 'Satış net', `SELECT COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false;`, 0, 0, 6, 4, 'currencyTRY'),
      stat(2, 'Brüt kar (fiş)', `SELECT COALESCE(sum(gross_profit),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false;`, 6, 0, 6, 4, 'currencyTRY'),
      stat(3, 'Giderler', `SELECT COALESCE(sum(amount),0)::float AS value FROM ${EXP};`, 12, 0, 6, 4, 'currencyTRY'),
      stat(4, 'Satış − gider', `SELECT (SELECT COALESCE(sum(total_net),0) FROM ${S} WHERE COALESCE(is_cancelled,false)=false) - (SELECT COALESCE(sum(amount),0) FROM ${EXP}) AS value;`, 18, 0, 6, 4, 'currencyTRY'),
      bar(5, 'Aylık ciro', `SELECT to_char(date_trunc('month', COALESCE(date,created_at)),'YYYY-MM') AS metric, COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 1;`, 0, 4, 24, 9),
    ],
  },
  {
    uid: 'retailex-gl',
    title: 'RetailEX Genel Muhasebe Aktivite',
    tags: ['accounting', 'erp'],
    panels: [
      bar(1, 'Cari trcode', `SELECT COALESCE(trcode::text,'?') AS metric, count(*)::int AS value FROM ${AM} GROUP BY 1 ORDER BY 2 DESC;`, 0, 0, 12, 8),
      bar(2, 'Kasa trcode', `SELECT COALESCE(trcode::text,'?') AS metric, count(*)::int AS value FROM ${CL} GROUP BY 1 ORDER BY 2 DESC;`, 12, 0, 12, 8),
      table(3, 'Son cari hareketler', `SELECT date, amount, sign, trcode, module_nr, definition FROM ${AM} ORDER BY date DESC NULLS LAST LIMIT 100;`, 0, 8, 24, 10),
    ],
  },
  {
    uid: 'retailex-wms-ops',
    title: 'RetailEX WMS Operasyon',
    tags: ['wms'],
    panels: [
      stat(1, 'Sayım fişi', `SELECT count(*)::int AS value FROM wms.counting_slips;`, 0, 0),
      stat(2, 'Mal kabul', `SELECT count(*)::int AS value FROM wms.receiving_slips;`, 6, 0),
      stat(3, 'Sevkiyat', `SELECT count(*)::int AS value FROM wms.dispatch_slips;`, 12, 0),
      stat(4, 'Görev kuyruğu', `SELECT count(*)::int AS value FROM wms.task_queue WHERE status IS DISTINCT FROM 'done';`, 18, 0),
      table(5, 'Sayım durumları', `SELECT status, count(*) AS adet FROM wms.counting_slips GROUP BY 1 ORDER BY adet DESC;`, 0, 4, 8, 8),
      table(6, 'Kabul durumları', `SELECT status, count(*) AS adet FROM wms.receiving_slips GROUP BY 1 ORDER BY adet DESC;`, 8, 4, 8, 8),
      table(7, 'Sevkiyat durumları', `SELECT status, count(*) AS adet FROM wms.dispatch_slips GROUP BY 1 ORDER BY adet DESC;`, 16, 4, 8, 8),
    ],
  },
  {
    uid: 'retailex-wms-inout',
    title: 'RetailEX WMS Mal Kabul & Sevkiyat',
    tags: ['wms'],
    panels: [
      table(1, 'Son kabul', `SELECT id, firm_nr, status, created_at FROM wms.receiving_slips ORDER BY created_at DESC NULLS LAST LIMIT 50;`, 0, 0, 12, 12),
      table(2, 'Son sevkiyat', `SELECT id, firm_nr, status, created_at FROM wms.dispatch_slips ORDER BY created_at DESC NULLS LAST LIMIT 50;`, 12, 0, 12, 12),
    ],
  },
  {
    uid: 'retailex-wms-inventory',
    title: 'RetailEX WMS Depo / Bin',
    tags: ['wms'],
    panels: [
      stat(1, 'Bin adedi', `SELECT count(*)::int AS value FROM wms.bins;`, 0, 0, 8, 4),
      stat(2, 'Personel', `SELECT count(*)::int AS value FROM wms.personnel;`, 8, 0, 8, 4),
      stat(3, 'Transfer', `SELECT count(*)::int AS value FROM wms.transfers;`, 16, 0, 8, 4),
      table(4, 'Bin listesi', `SELECT * FROM wms.bins ORDER BY created_at DESC NULLS LAST LIMIT 100;`, 0, 4, 24, 12),
    ],
  },
  {
    uid: 'retailex-restaurant-revenue',
    title: 'RetailEX Restoran Ciro',
    tags: ['restaurant'],
    panels: [
      stat(1, 'Satış fiş (genel)', `SELECT count(*)::int AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false;`, 0, 0),
      stat(2, 'Ciro', `SELECT COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false;`, 6, 0, 6, 4, 'currencyTRY'),
      table(3, 'İade log (rest)', `SELECT * FROM rest.return_log ORDER BY created_at DESC NULLS LAST LIMIT 100;`, 0, 4, 24, 12),
    ],
  },
  {
    uid: 'retailex-restaurant-voids',
    title: 'RetailEX Restoran İptal / İade',
    tags: ['restaurant'],
    panels: [
      bar(1, 'İade nedeni', `SELECT COALESCE(return_reason,'—') AS metric, count(*)::int AS value FROM rest.return_log GROUP BY 1 ORDER BY 2 DESC LIMIT 15;`, 0, 0, 24, 8),
      table(2, 'İade kayıtları', `SELECT * FROM rest.return_log ORDER BY created_at DESC NULLS LAST LIMIT 150;`, 0, 8, 24, 10),
    ],
  },
  {
    uid: 'retailex-beauty-ops',
    title: 'RetailEX Güzellik Operasyon',
    tags: ['beauty'],
    panels: [
      stat(1, 'Randevu', 'SELECT count(*)::int AS value FROM beauty.rex_${firm}_${period}_beauty_appointments;', 0, 0),
      stat(2, 'Hizmet kartı', 'SELECT count(*)::int AS value FROM beauty.rex_${firm}_${period}_beauty_services;', 6, 0),
      stat(3, 'Uzman', 'SELECT count(*)::int AS value FROM beauty.rex_${firm}_${period}_beauty_specialists;', 12, 0),
      stat(4, 'Güzellik satış', 'SELECT COALESCE(sum(total),0)::float AS value FROM beauty.rex_${firm}_${period}_beauty_sales;', 18, 0, 6, 4, 'currencyTRY'),
      table(5, 'Son randevular', 'SELECT appointment_date, appointment_time, status, type, total_price, notes FROM beauty.rex_${firm}_${period}_beauty_appointments ORDER BY appointment_date DESC NULLS LAST, appointment_time DESC NULLS LAST LIMIT 100;', 0, 4, 24, 12),
    ],
  },
  {
    uid: 'retailex-beauty-services',
    title: 'RetailEX Güzellik Hizmet & Komisyon',
    tags: ['beauty'],
    panels: [
      table(1, 'Hizmetler', 'SELECT name, category, duration_min, price, commission_rate, is_active FROM beauty.rex_${firm}_${period}_beauty_services ORDER BY name LIMIT 200;', 0, 0, 12, 14),
      table(2, 'Uzmanlar', 'SELECT name, specialty, commission_rate, product_unit_commission, is_active FROM beauty.rex_${firm}_${period}_beauty_specialists ORDER BY name LIMIT 100;', 12, 0, 12, 14),
    ],
  },
  {
    uid: 'retailex-campaigns',
    title: 'RetailEX Kampanya',
    tags: ['campaigns', 'erp'],
    panels: [
      table(1, 'Kampanyalar', `SELECT * FROM logic.campaigns ORDER BY created_at DESC NULLS LAST LIMIT 100;`, 0, 0, 24, 14),
    ],
  },
  {
    uid: 'retailex-store-performance',
    title: 'RetailEX Mağaza Performansı',
    tags: ['stores', 'sales', 'erp'],
    panels: [
      table(1, 'Mağaza bazlı satış', `SELECT COALESCE(st.code, s.store_id::text, '—') AS magaza, count(*) AS fis, COALESCE(sum(s.total_net),0) AS ciro FROM ${S} s LEFT JOIN stores st ON st.id = s.store_id WHERE COALESCE(s.is_cancelled,false)=false GROUP BY 1 ORDER BY ciro DESC LIMIT 100;`, 0, 0, 24, 8),
      table(2, 'Mağaza listesi', `SELECT code, name, firm_nr, type, is_active FROM stores ORDER BY code LIMIT 200;`, 0, 8, 24, 8),
    ],
  },
  {
    uid: 'retailex-period-compare',
    title: 'RetailEX Dönem Karşılaştırma',
    tags: ['sales', 'erp'],
    panels: [
      table(1, 'Günlük karşılaştırma', `SELECT (COALESCE(date,created_at))::date AS gun, count(*) AS fis, COALESCE(sum(total_net),0) AS ciro, COALESCE(sum(gross_profit),0) AS kar FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 1 DESC LIMIT 60;`, 0, 0, 24, 16),
    ],
  },
  {
    uid: 'retailex-registers',
    title: 'RetailEX Kasa & Banka Kartları',
    tags: ['finance', 'erp'],
    panels: [
      table(1, 'Kasalar', `SELECT code, name, currency_code, balance, is_active FROM ${CR} ORDER BY code;`, 0, 0, 12, 12),
      table(2, 'Bankalar', `SELECT code, name, bank_name, iban, currency_code, balance, is_active FROM ${BR} ORDER BY code;`, 12, 0, 12, 12),
    ],
  },
  {
    uid: 'retailex-sync-health',
    title: 'RetailEX Senkron & Sağlık',
    tags: ['ops', 'system'],
    panels: [
      table(1, 'Sync kuyruk', `SELECT status, count(*) AS adet FROM sync_queue GROUP BY 1 ORDER BY adet DESC;`, 0, 0, 8, 8),
      table(2, 'Servis sağlık', `SELECT * FROM public.service_health ORDER BY updated_at DESC NULLS LAST LIMIT 50;`, 8, 0, 16, 8),
      table(3, 'Son sync log', `SELECT * FROM public.sync_logs ORDER BY created_at DESC NULLS LAST LIMIT 100;`, 0, 8, 24, 10),
    ],
  },
  {
    uid: 'retailex-hr',
    title: 'RetailEX Personel / Satış Elemanı',
    tags: ['hr', 'erp'],
    panels: [
      table(1, 'Satış elemanları', 'SELECT code, name, phone, email, is_active, created_at FROM rex_${firm}_sales_reps ORDER BY name LIMIT 200;', 0, 0, 24, 14),
    ],
  },
  {
    uid: 'retailex-production',
    title: 'RetailEX Üretim Siparişleri',
    tags: ['production', 'erp'],
    panels: [
      table(1, 'Üretim', 'SELECT order_no, status, planned_qty, produced_qty, start_date, end_date, supplier_name, created_at FROM public.rex_${firm}_${period}_production_orders ORDER BY created_at DESC NULLS LAST LIMIT 100;', 0, 0, 24, 14),
    ],
  },
];

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const d of DEFS) {
  // Fix accidental template string in SQL that used '${firm}' literally in JS —
  // panels already use Grafana ${firm} via S/SI constants. For beauty/wms firm filters
  // we need Grafana vars in JSON as ${firm} not interpolated by JS.
  const json = JSON.stringify(dash(d), null, 2)
    // Restore grafana vars if any JS string ate them (none for S constants)
    ;
  const file = path.join(OUT, `${d.uid}.json`);
  fs.writeFileSync(file, json + '\n', 'utf8');
  n++;
  console.log('wrote', path.basename(file));
}
console.log(`OK: ${n} dashboards → ${OUT}`);
