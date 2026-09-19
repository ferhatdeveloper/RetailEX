#!/usr/bin/env node
/**
 * Uygulamadaki Genel Rapor / malzeme / muhasebe raporlarının Grafana panoları.
 * node scripts/generate-grafana-app-reports.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../docker/grafana/dashboards');
const CATALOG = path.join(__dirname, '../src/utils/grafanaAppReportsCatalog.ts');

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

const templating = {
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
    {
      name: 'currency',
      type: 'query',
      label: 'Para birimi',
      datasource: { type: 'postgres', uid: 'postgres' },
      query:
        "SELECT COALESCE((SELECT NULLIF(trim(ana_para_birimi),'') FROM firms WHERE firm_nr IN ('${firm}', ltrim('${firm}','0')) LIMIT 1),(SELECT NULLIF(trim(default_currency),'') FROM public.system_settings WHERE id = 1 LIMIT 1),'IQD');",
      current: { selected: true, text: 'IQD', value: 'IQD' },
      hide: 0,
      refresh: 1,
    },
  ],
};

function ds() {
  return { type: 'postgres', uid: 'postgres' };
}

function moneyTitle(t) {
  return `${t} (\${currency})`;
}

function stat(id, title, sql, x, y, w = 6, money = false) {
  return {
    id,
    title: money ? moneyTitle(title) : title,
    type: 'stat',
    gridPos: { h: 4, w, x, y },
    datasource: ds(),
    targets: [{ refId: 'A', format: 'table', rawQuery: true, rawSql: sql }],
    fieldConfig: {
      defaults: money ? { unit: 'none', decimals: 0 } : { unit: 'short' },
      overrides: [],
    },
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

function table(id, title, sql, x, y, w = 24, h = 12) {
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
    },
  };
}

function dash(uid, title, tags, panels) {
  return {
    annotations: { list: [] },
    editable: true,
    fiscalYearStartMonth: 0,
    graphTooltip: 1,
    id: null,
    links: [],
    panels,
    refresh: '2m',
    schemaVersion: 39,
    tags: ['retailex', 'ready', 'app-report', ...tags],
    templating,
    time: { from: 'now-30d', to: 'now' },
    timepicker: {},
    timezone: 'browser',
    title,
    uid,
    version: 1,
  };
}

/** @type {Array<{uid:string,titleTr:string,titleEn:string,descTr:string,descEn:string,category:string,appKey:string,tags:string[],panels:unknown[]}>} */
const REPORTS = [
  // —— Genel ——
  {
    uid: 'retailex-rpt-daily',
    appKey: 'daily',
    category: 'general',
    titleTr: 'Günlük Rapor',
    titleEn: 'Daily Report',
    descTr: 'Bugünkü fiş, ciro, ödeme',
    descEn: 'Today fiches, revenue, payments',
    tags: ['sales', 'general'],
    panels: [
      stat(1, 'Bugün fiş', `SELECT count(*)::int AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date=CURRENT_DATE;`, 0, 0),
      stat(2, 'Bugün ciro', `SELECT COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date=CURRENT_DATE;`, 6, 0, 6, true),
      stat(3, 'İptal', `SELECT count(*)::int AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=true AND (COALESCE(date,created_at))::date=CURRENT_DATE;`, 12, 0),
      stat(4, 'İndirim', `SELECT COALESCE(sum(total_discount),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date=CURRENT_DATE;`, 18, 0, 6, true),
      table(5, 'Bugünkü fişler', `SELECT fiche_no, COALESCE(date,created_at) AS tarih, customer_name, payment_method, total_net, cashier FROM ${S} WHERE (COALESCE(date,created_at))::date=CURRENT_DATE ORDER BY COALESCE(date,created_at) DESC LIMIT 100;`, 0, 4),
    ],
  },
  {
    uid: 'retailex-rpt-z',
    appKey: 'z-report',
    category: 'general',
    titleTr: 'Z Raporu',
    titleEn: 'Z Report',
    descTr: 'Gün sonu / kasa kapanış özeti',
    descEn: 'End of day / cash close summary',
    tags: ['pos', 'general'],
    panels: [
      stat(1, 'Fiş', `SELECT count(*)::int AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date=CURRENT_DATE;`, 0, 0),
      stat(2, 'Net ciro', `SELECT COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date=CURRENT_DATE;`, 6, 0, 6, true),
      stat(3, 'KDV', `SELECT COALESCE(sum(total_vat),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date=CURRENT_DATE;`, 12, 0, 6, true),
      table(4, 'Ödeme kırılımı', `SELECT COALESCE(payment_method,'—') AS yontem, count(*) AS adet, COALESCE(sum(total_net),0) AS tutar FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date=CURRENT_DATE GROUP BY 1 ORDER BY tutar DESC;`, 0, 4, 12, 10),
      table(5, 'Kasiyer', `SELECT COALESCE(cashier,'(yok)') AS kasiyer, count(*) AS fis, COALESCE(sum(total_net),0) AS ciro FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date=CURRENT_DATE GROUP BY 1;`, 12, 4, 12, 10),
    ],
  },
  {
    uid: 'retailex-rpt-monthly-days',
    appKey: 'monthly-days-summary',
    category: 'general',
    titleTr: 'Aylık Gün Özeti',
    titleEn: 'Monthly Day Summary',
    descTr: 'Seçili dönemde günlük ciro',
    descEn: 'Daily revenue in period',
    tags: ['sales', 'general'],
    panels: [
      table(1, 'Günlük özet', `SELECT (COALESCE(date,created_at))::date AS gun, count(*) AS fis, COALESCE(sum(total_net),0) AS ciro, COALESCE(sum(total_discount),0) AS indirim FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 1 DESC LIMIT 62;`, 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-yearly-months',
    appKey: 'yearly-months-summary',
    category: 'general',
    titleTr: 'Yıllık Ay Özeti',
    titleEn: 'Yearly Month Summary',
    descTr: 'Aylık ciro özeti',
    descEn: 'Monthly revenue summary',
    tags: ['sales', 'general'],
    panels: [
      bar(1, 'Aylık ciro', `SELECT to_char(date_trunc('month', COALESCE(date,created_at)),'YYYY-MM') AS metric, COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 1;`, 0, 0, 24, 9),
      table(2, 'Ay detay', `SELECT to_char(date_trunc('month', COALESCE(date,created_at)),'YYYY-MM') AS ay, count(*) AS fis, COALESCE(sum(total_net),0) AS ciro FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 1 DESC;`, 0, 9),
    ],
  },
  {
    uid: 'retailex-rpt-eod',
    appKey: 'end-of-day',
    category: 'general',
    titleTr: 'Gün Sonu Raporu',
    titleEn: 'End of Day Report',
    descTr: 'Gün sonu satış ve kasa',
    descEn: 'End of day sales and cash',
    tags: ['pos', 'general'],
    panels: [
      stat(1, 'Ciro', `SELECT COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false AND (COALESCE(date,created_at))::date=CURRENT_DATE;`, 0, 0, 8, true),
      stat(2, 'Kasa satır', `SELECT count(*)::int AS value FROM ${CL} WHERE date::date=CURRENT_DATE;`, 8, 0, 8),
      stat(3, 'Gider', `SELECT COALESCE(sum(amount),0)::float AS value FROM ${EXP} WHERE expense_date=CURRENT_DATE;`, 16, 0, 8, true),
      table(4, 'Gün detay', `SELECT fiche_no, payment_method, total_net, cashier FROM ${S} WHERE (COALESCE(date,created_at))::date=CURRENT_DATE ORDER BY created_at DESC LIMIT 100;`, 0, 4),
    ],
  },

  // —— Satış ——
  {
    uid: 'retailex-rpt-top-products',
    appKey: 'top-products',
    category: 'sales',
    titleTr: 'En Çok Satanlar',
    titleEn: 'Top Sellers',
    descTr: 'Ürün adet / tutar sıralaması',
    descEn: 'Products by qty and amount',
    tags: ['sales'],
    panels: [
      table(1, 'En çok satılan', `SELECT item_code, item_name, sum(quantity) AS qty, sum(net_amount) AS net FROM ${SI} GROUP BY 1,2 ORDER BY qty DESC NULLS LAST LIMIT 100;`, 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-category',
    appKey: 'category-analysis',
    category: 'sales',
    titleTr: 'Kategori Analizi',
    titleEn: 'Category Analysis',
    descTr: 'Kalem bazlı satış özeti',
    descEn: 'Line-item sales summary',
    tags: ['sales'],
    panels: [
      bar(1, 'Ürün tutar', `SELECT COALESCE(item_name,item_code,'—') AS metric, sum(net_amount)::float AS value FROM ${SI} GROUP BY 1 ORDER BY 2 DESC LIMIT 15;`, 0, 0, 24, 8),
      table(2, 'Detay', `SELECT item_code, item_name, sum(quantity) AS qty, sum(net_amount) AS net, sum(gross_profit) AS kar FROM ${SI} GROUP BY 1,2 ORDER BY net DESC LIMIT 100;`, 0, 8),
    ],
  },
  {
    uid: 'retailex-rpt-hourly',
    appKey: 'hourly-analysis',
    category: 'sales',
    titleTr: 'Saatlik Analiz',
    titleEn: 'Hourly Analysis',
    descTr: 'Saat dilimine göre satış',
    descEn: 'Sales by hour of day',
    tags: ['sales'],
    panels: [
      bar(1, 'Saatlik fiş', `SELECT lpad(extract(hour from COALESCE(date,created_at))::int::text,2,'0') AS metric, count(*)::int AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 1;`, 0, 0, 12, 9),
      bar(2, 'Saatlik ciro', `SELECT lpad(extract(hour from COALESCE(date,created_at))::int::text,2,'0') AS metric, COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 1;`, 12, 0, 12, 9),
      table(3, 'Tablo', `SELECT extract(hour from COALESCE(date,created_at))::int AS saat, count(*) AS fis, COALESCE(sum(total_net),0) AS ciro FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY 1;`, 0, 9),
    ],
  },
  {
    uid: 'retailex-rpt-detailed-sales',
    appKey: 'detailed-sales',
    category: 'sales',
    titleTr: 'Detaylı Satış Raporu',
    titleEn: 'Detailed Sales Report',
    descTr: 'Fiş listesi detay',
    descEn: 'Detailed fiche list',
    tags: ['sales'],
    panels: [
      table(1, 'Satış fişleri', `SELECT fiche_no, COALESCE(date,created_at) AS tarih, customer_name, trcode, fiche_type, payment_method, total_net, total_vat, total_discount, cashier, is_cancelled FROM ${S} ORDER BY COALESCE(date,created_at) DESC NULLS LAST LIMIT 200;`, 0, 0, 24, 16),
    ],
  },
  {
    uid: 'retailex-rpt-sales-target',
    appKey: 'sales-target',
    category: 'sales',
    titleTr: 'Hedef vs Gerçekleşen',
    titleEn: 'Target vs Actual',
    descTr: 'Mağaza / günlük gerçekleşen',
    descEn: 'Store / daily actuals',
    tags: ['sales'],
    panels: [
      table(1, 'Mağaza gerçekleşen', `SELECT COALESCE(st.name, st.code, s.store_id::text, '—') AS magaza, count(*) AS fis, COALESCE(sum(s.total_net),0) AS ciro FROM ${S} s LEFT JOIN stores st ON st.id=s.store_id WHERE COALESCE(s.is_cancelled,false)=false GROUP BY 1 ORDER BY ciro DESC;`, 0, 0),
    ],
  },

  // —— Finans ——
  {
    uid: 'retailex-rpt-discount',
    appKey: 'discount-report',
    category: 'payment',
    titleTr: 'İndirim Raporu',
    titleEn: 'Discount Report',
    descTr: 'Fiş ve kalem indirimleri',
    descEn: 'Fiche and line discounts',
    tags: ['finance', 'sales'],
    panels: [
      stat(1, 'Toplam indirim', `SELECT COALESCE(sum(total_discount),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false;`, 0, 0, 8, true),
      stat(2, 'İndirimli fiş', `SELECT count(*)::int AS value FROM ${S} WHERE COALESCE(total_discount,0)>0 AND COALESCE(is_cancelled,false)=false;`, 8, 0, 8),
      table(3, 'İndirimli satışlar', `SELECT fiche_no, COALESCE(date,created_at) AS tarih, customer_name, total_discount, total_net FROM ${S} WHERE COALESCE(total_discount,0)>0 ORDER BY total_discount DESC LIMIT 100;`, 0, 4),
    ],
  },
  {
    uid: 'retailex-rpt-collection-due',
    appKey: 'collection-due',
    category: 'finance',
    titleTr: 'Vade / Tahsilat',
    titleEn: 'Collection Due',
    descTr: 'Cari hareket ve bakiyeler',
    descEn: 'AR movements and balances',
    tags: ['finance', 'customers'],
    panels: [
      table(1, 'Müşteri bakiyeleri', `SELECT code, name, COALESCE(balance,0) AS bakiye, phone FROM ${C} WHERE COALESCE(balance,0) <> 0 ORDER BY abs(COALESCE(balance,0)) DESC LIMIT 150;`, 0, 0, 12, 14),
      table(2, 'Son hareketler', `SELECT date, fiche_no, amount, sign, definition FROM ${AM} ORDER BY date DESC NULLS LAST LIMIT 100;`, 12, 0, 12, 14),
    ],
  },
  {
    uid: 'retailex-rpt-cash-status',
    appKey: 'cash-status',
    category: 'payment',
    titleTr: 'Kasa Durumu',
    titleEn: 'Cash Status',
    descTr: 'Kasa kart bakiyeleri',
    descEn: 'Cash register balances',
    tags: ['finance'],
    panels: [
      table(1, 'Kasalar', `SELECT code, name, currency_code, COALESCE(balance,0) AS bakiye, is_active FROM ${CR} ORDER BY code;`, 0, 0, 12, 12),
      table(2, 'Bankalar', `SELECT code, name, bank_name, currency_code, COALESCE(balance,0) AS bakiye FROM ${BR} ORDER BY code;`, 12, 0, 12, 12),
    ],
  },
  {
    uid: 'retailex-rpt-commission',
    appKey: 'commission',
    category: 'payment',
    titleTr: 'Komisyon Raporu',
    titleEn: 'Commission Report',
    descTr: 'Kasiyer / satış elemanı ciro',
    descEn: 'Cashier / sales rep revenue',
    tags: ['finance', 'hr'],
    panels: [
      table(1, 'Kasiyer ciro', `SELECT COALESCE(cashier,'(yok)') AS kasiyer, count(*) AS fis, COALESCE(sum(total_net),0) AS ciro FROM ${S} WHERE COALESCE(is_cancelled,false)=false GROUP BY 1 ORDER BY ciro DESC;`, 0, 0),
    ],
  },

  // —— Satın alma ——
  {
    uid: 'retailex-rpt-purchase-returns',
    appKey: 'supplier-purchase-returns',
    category: 'purchase',
    titleTr: 'Tedarikçi Alış İadeleri',
    titleEn: 'Supplier Purchase Returns',
    descTr: 'Alış iade fişleri',
    descEn: 'Purchase return fiches',
    tags: ['purchase'],
    panels: [
      table(1, 'İade / alış', `SELECT fiche_no, COALESCE(date,created_at) AS tarih, customer_name, trcode, fiche_type, total_net FROM ${S} WHERE trcode IN (2,3,6,7,8) OR lower(COALESCE(fiche_type,'')) LIKE '%iade%' ORDER BY COALESCE(date,created_at) DESC LIMIT 100;`, 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-purchase-promo',
    appKey: 'purchase-promotion-report',
    category: 'purchase',
    titleTr: 'Alış Promosyon Raporu',
    titleEn: 'Purchase Promotion',
    descTr: 'İndirimli alış kalemleri',
    descEn: 'Discounted purchase lines',
    tags: ['purchase'],
    panels: [
      table(1, 'İndirimli kalemler', `SELECT item_code, item_name, sum(quantity) AS qty, sum(discount_amount) AS indirim, sum(net_amount) AS net FROM ${SI} WHERE COALESCE(discount_amount,0)>0 OR COALESCE(discount_rate,0)>0 GROUP BY 1,2 ORDER BY indirim DESC LIMIT 100;`, 0, 0),
    ],
  },

  // —— Stok ——
  {
    uid: 'retailex-rpt-stock-status',
    appKey: 'stock-status',
    category: 'stock',
    titleTr: 'Stok Durumu',
    titleEn: 'Stock Status',
    descTr: 'Ürün stok listesi',
    descEn: 'Product stock list',
    tags: ['stock'],
    panels: [
      table(1, 'Stok', `SELECT code, name, COALESCE(stock,0) AS stok, COALESCE(min_stock,0) AS min_stok, COALESCE(critical_stock,0) AS kritik, COALESCE(price,0) AS fiyat, COALESCE(is_active,true) AS aktif FROM ${P} ORDER BY code LIMIT 300;`, 0, 0, 24, 16),
    ],
  },
  {
    uid: 'retailex-rpt-stock-turnover',
    appKey: 'stock-turnover',
    category: 'stock',
    titleTr: 'Stok Dönüş Hızı',
    titleEn: 'Stock Turnover',
    descTr: 'Satış miktarına göre ürünler',
    descEn: 'Products by sold qty',
    tags: ['stock'],
    panels: [
      table(1, 'Dönüş', `SELECT si.item_code, si.item_name, sum(si.quantity) AS satilan, COALESCE(max(p.stock),0) AS stok FROM ${SI} si LEFT JOIN ${P} p ON p.id=si.product_id OR p.code=si.item_code GROUP BY 1,2 ORDER BY satilan DESC LIMIT 100;`, 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-stock-abc',
    appKey: 'stock-abc',
    category: 'stock',
    titleTr: 'Stok ABC Analizi',
    titleEn: 'Stock ABC Analysis',
    descTr: 'Ciro payına göre ABC',
    descEn: 'ABC by revenue share',
    tags: ['stock'],
    panels: [
      table(1, 'ABC (ciro payı)', `WITH t AS (SELECT item_code, item_name, sum(net_amount) AS net FROM ${SI} GROUP BY 1,2), s AS (SELECT *, sum(net) OVER () AS toplam, sum(net) OVER (ORDER BY net DESC) AS kumul FROM t) SELECT item_code, item_name, net, round(100*net/NULLIF(toplam,0),2) AS pay_pct, CASE WHEN kumul/NULLIF(toplam,0)<=0.8 THEN 'A' WHEN kumul/NULLIF(toplam,0)<=0.95 THEN 'B' ELSE 'C' END AS abc FROM s ORDER BY net DESC LIMIT 200;`, 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-material-move',
    appKey: 'materials',
    category: 'stock',
    titleTr: 'Mal Hareket Raporu',
    titleEn: 'Material Movement',
    descTr: 'Satış kalemi hareketleri',
    descEn: 'Sale line movements',
    tags: ['stock'],
    panels: [
      table(1, 'Hareketler', `SELECT si.item_code, si.item_name, si.quantity, si.net_amount, s.fiche_no, COALESCE(s.date,s.created_at) AS tarih FROM ${SI} si LEFT JOIN ${S} s ON s.id=si.invoice_id ORDER BY COALESCE(s.date,s.created_at) DESC NULLS LAST LIMIT 200;`, 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-material-extract',
    appKey: 'report-material-extract',
    category: 'materials',
    titleTr: 'Malzeme Ekstresi',
    titleEn: 'Material Extract',
    descTr: 'Ürün satış ekstresi',
    descEn: 'Product sales extract',
    tags: ['stock', 'materials'],
    panels: [
      table(1, 'Ekstre', `SELECT si.item_code, si.item_name, sum(si.quantity) AS qty, sum(si.net_amount) AS net, sum(si.total_cost) AS maliyet, sum(si.gross_profit) AS kar FROM ${SI} si GROUP BY 1,2 ORDER BY qty DESC LIMIT 200;`, 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-material-value',
    appKey: 'report-material-value',
    category: 'materials',
    titleTr: 'Malzeme Değer',
    titleEn: 'Material Value',
    descTr: 'Stok maliyet değeri',
    descEn: 'Inventory cost value',
    tags: ['stock', 'materials'],
    panels: [
      stat(1, 'Toplam maliyet değer', `SELECT COALESCE(sum(COALESCE(stock,0)*COALESCE(purchase_price,cost,0)),0)::float AS value FROM ${P};`, 0, 0, 8, true),
      stat(2, 'Satış fiyat değer', `SELECT COALESCE(sum(COALESCE(stock,0)*COALESCE(price,0)),0)::float AS value FROM ${P};`, 8, 0, 8, true),
      table(3, 'Ürün değer', `SELECT code, name, COALESCE(stock,0) AS stok, COALESCE(purchase_price,cost,0) AS maliyet, COALESCE(price,0) AS fiyat, COALESCE(stock,0)*COALESCE(purchase_price,cost,0) AS maliyet_deger FROM ${P} ORDER BY maliyet_deger DESC NULLS LAST LIMIT 200;`, 0, 4),
    ],
  },
  {
    uid: 'retailex-rpt-in-out',
    appKey: 'report-in-out-totals',
    category: 'materials',
    titleTr: 'Giriş / Çıkış Toplamları',
    titleEn: 'In/Out Totals',
    descTr: 'Satış çıkış özeti',
    descEn: 'Sales outflow summary',
    tags: ['stock', 'materials'],
    panels: [
      stat(1, 'Çıkış satır', `SELECT count(*)::int AS value FROM ${SI};`, 0, 0, 8),
      stat(2, 'Çıkış miktar', `SELECT COALESCE(sum(quantity),0)::float AS value FROM ${SI};`, 8, 0, 8),
      table(3, 'Ürün çıkış', `SELECT item_code, item_name, sum(quantity) AS qty, sum(net_amount) AS net FROM ${SI} GROUP BY 1,2 ORDER BY qty DESC LIMIT 150;`, 0, 4),
    ],
  },
  {
    uid: 'retailex-rpt-min-max',
    appKey: 'report-min-max',
    category: 'materials',
    titleTr: 'Min / Max Stok',
    titleEn: 'Min/Max Stock',
    descTr: 'Min-max dışı stoklar',
    descEn: 'Stock outside min/max',
    tags: ['stock', 'materials'],
    panels: [
      table(1, 'Min altı / max üstü', `SELECT code, name, COALESCE(stock,0) AS stok, COALESCE(min_stock,0) AS min_stok, COALESCE(max_stock,0) AS max_stok FROM ${P} WHERE (COALESCE(min_stock,0)>0 AND COALESCE(stock,0)<min_stock) OR (COALESCE(max_stock,0)>0 AND COALESCE(stock,0)>max_stock) ORDER BY stok ASC LIMIT 200;`, 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-slip-list',
    appKey: 'report-slip-list',
    category: 'materials',
    titleTr: 'Fiş Listesi',
    titleEn: 'Slip List',
    descTr: 'Satış / belge fiş listesi',
    descEn: 'Sales / document slip list',
    tags: ['sales', 'materials'],
    panels: [
      table(1, 'Fişler', `SELECT fiche_no, document_no, COALESCE(date,created_at) AS tarih, trcode, fiche_type, customer_name, total_net, status, is_cancelled FROM ${S} ORDER BY COALESCE(date,created_at) DESC LIMIT 200;`, 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-warehouse-status',
    appKey: 'report-warehouse-status',
    category: 'materials',
    titleTr: 'Malzeme Ambar Durum',
    titleEn: 'Warehouse Status',
    descTr: 'Ambar / stok durumu',
    descEn: 'Warehouse stock status',
    tags: ['stock', 'materials'],
    panels: [
      table(1, 'Ambar kodlu ürünler', `SELECT COALESCE(warehouse_code,'(yok)') AS ambar, count(*) AS urun, COALESCE(sum(stock),0) AS stok FROM ${P} GROUP BY 1 ORDER BY stok DESC;`, 0, 0, 24, 8),
      table(2, 'Detay', `SELECT warehouse_code, code, name, COALESCE(stock,0) AS stok, shelf_location FROM ${P} ORDER BY warehouse_code NULLS LAST, code LIMIT 200;`, 0, 8),
    ],
  },
  {
    uid: 'retailex-rpt-expiry',
    appKey: 'purchase-expiry-report',
    category: 'materials',
    titleTr: 'Son Kullanma Tarihi',
    titleEn: 'Expiry Date Report',
    descTr: 'SKT yaklaşan kalemler',
    descEn: 'Near-expiry lines',
    tags: ['stock', 'materials'],
    panels: [
      table(1, 'SKT', `SELECT item_code, item_name, expiry_date, sum(quantity) AS qty FROM ${SI} WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '90 days' GROUP BY 1,2,3 ORDER BY expiry_date ASC LIMIT 150;`, 0, 0),
    ],
  },

  // —— Muhasebe ——
  {
    uid: 'retailex-rpt-income',
    appKey: 'income-statement',
    category: 'accounting',
    titleTr: 'Gelir Tablosu',
    titleEn: 'Income Statement',
    descTr: 'Satış − maliyet − gider',
    descEn: 'Sales − cost − expenses',
    tags: ['accounting'],
    panels: [
      stat(1, 'Satış net', `SELECT COALESCE(sum(total_net),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false;`, 0, 0, 6, true),
      stat(2, 'Brüt kar', `SELECT COALESCE(sum(gross_profit),0)::float AS value FROM ${S} WHERE COALESCE(is_cancelled,false)=false;`, 6, 0, 6, true),
      stat(3, 'Gider', `SELECT COALESCE(sum(amount),0)::float AS value FROM ${EXP};`, 12, 0, 6, true),
      stat(4, 'Net (satış−gider)', `SELECT (SELECT COALESCE(sum(total_net),0) FROM ${S} WHERE COALESCE(is_cancelled,false)=false)-(SELECT COALESCE(sum(amount),0) FROM ${EXP}) AS value;`, 18, 0, 6, true),
      table(5, 'Gider kırılımı', `SELECT category, COALESCE(sum(amount),0) AS tutar FROM ${EXP} GROUP BY 1 ORDER BY tutar DESC;`, 0, 4),
    ],
  },
  {
    uid: 'retailex-rpt-balance',
    appKey: 'balance-sheet',
    category: 'accounting',
    titleTr: 'Bilanço',
    titleEn: 'Balance Sheet',
    descTr: 'Kasa, banka, cari özeti',
    descEn: 'Cash, bank, AR summary',
    tags: ['accounting'],
    panels: [
      stat(1, 'Kasa toplam', `SELECT COALESCE(sum(balance),0)::float AS value FROM ${CR};`, 0, 0, 8, true),
      stat(2, 'Banka toplam', `SELECT COALESCE(sum(balance),0)::float AS value FROM ${BR};`, 8, 0, 8, true),
      stat(3, 'Cari net', `SELECT COALESCE(sum(balance),0)::float AS value FROM ${C};`, 16, 0, 8, true),
      table(4, 'Kasa', `SELECT code, name, balance, currency_code FROM ${CR} ORDER BY code;`, 0, 4, 8, 10),
      table(5, 'Banka', `SELECT code, name, balance, currency_code FROM ${BR} ORDER BY code;`, 8, 4, 8, 10),
      table(6, 'Tedarikçi net', `SELECT COALESCE(sum(balance),0) AS net FROM ${SUP};`, 16, 4, 8, 10),
    ],
  },
  {
    uid: 'retailex-rpt-mizan',
    appKey: 'mizan',
    category: 'accounting',
    titleTr: 'Mizan Raporu',
    titleEn: 'Trial Balance',
    descTr: 'Kasa / banka / cari mizan',
    descEn: 'Cash / bank / AR trial',
    tags: ['accounting'],
    panels: [
      table(1, 'Kasa mizan', `SELECT code, name, currency_code, COALESCE(balance,0) AS bakiye FROM ${CR} ORDER BY code;`, 0, 0, 12, 10),
      table(2, 'Banka mizan', `SELECT code, name, currency_code, COALESCE(balance,0) AS bakiye FROM ${BR} ORDER BY code;`, 12, 0, 12, 10),
      table(3, 'Cari özet', `SELECT count(*) AS kart, sum(CASE WHEN balance>0 THEN balance ELSE 0 END) AS borclu, sum(CASE WHEN balance<0 THEN balance ELSE 0 END) AS alacakli, sum(balance) AS net FROM ${C};`, 0, 10, 24, 6),
    ],
  },

  // —— Güzellik ——
  {
    uid: 'retailex-rpt-beauty-cancelled',
    appKey: 'beauty-cancelled-report',
    category: 'beauty',
    titleTr: 'Güzellik İptaller',
    titleEn: 'Beauty Cancelled',
    descTr: 'İptal randevular',
    descEn: 'Cancelled appointments',
    tags: ['beauty'],
    panels: [
      table(1, 'İptaller', "SELECT appointment_date, appointment_time, status, type, total_price, notes FROM beauty.rex_${firm}_${period}_beauty_appointments WHERE lower(COALESCE(status,'')) LIKE '%cancel%' OR lower(COALESCE(status,'')) LIKE '%iptal%' ORDER BY appointment_date DESC LIMIT 150;", 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-beauty-commission',
    appKey: 'beauty-commission-report',
    category: 'beauty',
    titleTr: 'Güzellik Prim Raporu',
    titleEn: 'Beauty Commission',
    descTr: 'Uzman komisyonları',
    descEn: 'Specialist commissions',
    tags: ['beauty'],
    panels: [
      table(1, 'Uzman komisyon', "SELECT name, specialty, commission_rate, product_unit_commission, is_active FROM beauty.rex_${firm}_${period}_beauty_specialists ORDER BY name;", 0, 0, 12, 12),
      table(2, 'Randevu komisyon', "SELECT appointment_date, specialist_id, commission_amount, total_price, status FROM beauty.rex_${firm}_${period}_beauty_appointments WHERE COALESCE(commission_amount,0)>0 ORDER BY appointment_date DESC LIMIT 100;", 12, 0, 12, 12),
    ],
  },
  {
    uid: 'retailex-rpt-beauty-survey',
    appKey: 'beauty-survey-report',
    category: 'beauty',
    titleTr: 'Güzellik Anket',
    titleEn: 'Beauty Survey',
    descTr: 'Müşteri geri bildirimi',
    descEn: 'Customer feedback',
    tags: ['beauty'],
    panels: [
      table(1, 'Geri bildirim', "SELECT created_at, service_rating, staff_rating, clinic_rating, overall_rating, would_recommend, comment FROM beauty.rex_${firm}_${period}_beauty_customer_feedback ORDER BY created_at DESC LIMIT 150;", 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-beauty-appt-product',
    appKey: 'beauty-appointment-product-report',
    category: 'beauty',
    titleTr: 'Randevu Ürün Satışları',
    titleEn: 'Appointment Product Sales',
    descTr: 'Güzellik satış kalemleri',
    descEn: 'Beauty sale lines',
    tags: ['beauty'],
    panels: [
      table(1, 'Satış kalemleri', "SELECT name, item_type, quantity, unit_price, total, commission_amount, created_at FROM beauty.rex_${firm}_${period}_beauty_sale_items ORDER BY created_at DESC LIMIT 150;", 0, 0),
    ],
  },

  // —— Restoran ——
  {
    uid: 'retailex-rpt-rest-product-qty',
    appKey: 'product-reports',
    category: 'restaurant',
    titleTr: 'Ürün Adet Raporu',
    titleEn: 'Product Qty Report',
    descTr: 'Satılan ürün adetleri',
    descEn: 'Sold product quantities',
    tags: ['restaurant'],
    panels: [
      table(1, 'Ürün adet', `SELECT item_code, item_name, sum(quantity) AS qty, sum(net_amount) AS net FROM ${SI} GROUP BY 1,2 ORDER BY qty DESC LIMIT 150;`, 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-rest-tables',
    appKey: 'table-reports',
    category: 'restaurant',
    titleTr: 'Masa Raporları',
    titleEn: 'Table Reports',
    descTr: 'Restoran iade / masa özeti',
    descEn: 'Restaurant voids / table summary',
    tags: ['restaurant'],
    panels: [
      table(1, 'İade log', 'SELECT * FROM rest.return_log ORDER BY created_at DESC NULLS LAST LIMIT 100;', 0, 0),
    ],
  },
  {
    uid: 'retailex-rpt-rest-courier',
    appKey: 'courier-reports',
    category: 'restaurant',
    titleTr: 'Kurye Raporları',
    titleEn: 'Courier Reports',
    descTr: 'Paket / not alanı satışlar',
    descEn: 'Delivery-ish sales via notes',
    tags: ['restaurant'],
    panels: [
      table(1, 'Not içeren fişler', `SELECT fiche_no, COALESCE(date,created_at) AS tarih, customer_name, total_net, notes FROM ${S} WHERE notes IS NOT NULL AND notes <> '' ORDER BY COALESCE(date,created_at) DESC LIMIT 100;`, 0, 0),
    ],
  },
];

fs.mkdirSync(OUT, { recursive: true });

const catalogRows = [];
for (const r of REPORTS) {
  const json = dash(r.uid, `RetailEX ${r.titleTr}`, r.tags, r.panels);
  fs.writeFileSync(path.join(OUT, `${r.uid}.json`), JSON.stringify(json, null, 2) + '\n', 'utf8');
  catalogRows.push({
    id: r.appKey,
    uid: r.uid,
    category: r.category,
    titleTr: r.titleTr,
    titleEn: r.titleEn,
    descriptionTr: r.descTr,
    descriptionEn: r.descEn,
  });
  console.log('wrote', r.uid);
}

const catalogSrc = `/**
 * Genel Rapor / malzeme / muhasebe — Grafana karşılıkları
 * Üretir: node scripts/generate-grafana-app-reports.mjs
 */
import { dashEmbed, type GrafanaReadyReport, type GrafanaReportCategory } from './grafanaEmbed';

export type GrafanaAppReportMeta = {
  id: string;
  uid: string;
  category: GrafanaReportCategory | string;
  titleTr: string;
  titleEn: string;
  descriptionTr: string;
  descriptionEn: string;
};

export const GRAFANA_APP_REPORTS_META: GrafanaAppReportMeta[] = ${JSON.stringify(catalogRows, null, 2)};

export const GRAFANA_APP_CATEGORY_LABELS: Record<string, { tr: string; en: string; order: number }> = {
  general: { tr: 'Genel', en: 'General', order: 1 },
  sales: { tr: 'Satış analizleri', en: 'Sales analytics', order: 2 },
  finance: { tr: 'Finansal raporlar', en: 'Financial', order: 3 },
  payment: { tr: 'Ödeme ve işlemler', en: 'Payments', order: 4 },
  purchase: { tr: 'Satın alma', en: 'Purchasing', order: 5 },
  stock: { tr: 'Stok raporları', en: 'Stock', order: 6 },
  materials: { tr: 'Malzeme raporları', en: 'Materials', order: 7 },
  accounting: { tr: 'Muhasebe', en: 'Accounting', order: 8 },
  beauty: { tr: 'Güzellik', en: 'Beauty', order: 9 },
  restaurant: { tr: 'Restoran', en: 'Restaurant', order: 10 },
};

export function grafanaAppReportsAsReady(): GrafanaReadyReport[] {
  return GRAFANA_APP_REPORTS_META.map((m) => ({
    id: m.id,
    uid: m.uid,
    category: (m.category as GrafanaReportCategory) || 'sales',
    titleTr: m.titleTr,
    titleEn: m.titleEn,
    descriptionTr: m.descriptionTr,
    descriptionEn: m.descriptionEn,
    embedPath: (theme, vars) => dashEmbed(m.uid, theme, '&refresh=2m', vars),
  }));
}
`;

fs.writeFileSync(CATALOG, catalogSrc, 'utf8');
console.log(`OK: ${REPORTS.length} dashboards + catalog → ${CATALOG}`);
