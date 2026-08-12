import type { Product } from '../../../core/types';
import type { ReportTemplate } from '../../reports/designerUtils';
import { formatCurrency, formatMoneyWithCode } from '../../../utils/currency';
import { resolveLabelBarcodeValue } from './labelBarcodeValue';

export interface QuickRetailLabelInput {
  name: string;
  code?: string;
  sku?: string;
  barcode?: string;
  price: number;
  stock?: number;
  brand?: string;
  category?: string;
  unit?: string;
  specialCode2?: string;
}

export function productToQuickRetailLabelInput(product: Product): QuickRetailLabelInput {
  return {
    name: product.name,
    code: product.code,
    sku: product.sku,
    barcode: product.barcode,
    price: Number(product.price) || 0,
    stock: product.stock,
    brand: product.brand,
    category: product.category,
    unit: product.unit,
    specialCode2: product.specialCode2,
  };
}

/** Malzeme listesi hızlı etiket — sağ tık yazdır ile aynı düzen. */
export function buildQuickRetailProductLabelTemplate(
  input: QuickRetailLabelInput,
  size: { w: number; h: number },
  currencyCode?: string,
): ReportTemplate {
  const w = size.w;
  const h = size.h;
  const m = Math.max(0.5, Math.min(1.2, w * 0.028));
  const innerW = w - 2 * m;
  const brandRaw = (input.brand || '').trim();
  const catFirst = (input.category || '').split(/[>/|]/)[0]?.trim() || '';
  const brand = (brandRaw || catFirst || '—').toLocaleUpperCase('tr-TR');
  const codePart = (input.code || input.sku || '').toString().trim();
  const title = `${codePart} ${input.name || ''}`.replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr-TR');
  const priceStr = currencyCode
    ? formatMoneyWithCode(Number(input.price) || 0, currencyCode)
    : formatCurrency(Number(input.price) || 0, 2, false);
  const unit = (input.unit || 'Adet').trim() || 'Adet';
  const rawSc2 = (input.specialCode2 || '').toString().trim();
  const qtyCore = `${Math.round(Number(input.stock) || 0)} ${unit}`;
  const qtyHasSpecialCode = rawSc2 !== '';
  const qtyStr = qtyHasSpecialCode ? `${rawSc2} - ${qtyCore}` : qtyCore;
  const barcodeValue = resolveLabelBarcodeValue(input.barcode, input.code, input.sku);

  if (h < 24) {
    const nameH = Math.min(7, Math.max(4, h * 0.35));
    const priceH = Math.min(6, Math.max(4, h * 0.28));
    const qtyH = Math.max(2.2, Math.min(3.8, h * 0.18));
    const barH = Math.max(4.2, h - m * 2 - nameH - priceH - qtyH - 1.2);
    return {
      name: `${w}x${h}mm Ürün Etiketi`,
      category: 'etiket',
      pageSize: { width: w, height: h },
      components: [
        {
          id: 'p_name',
          type: 'text',
          x: m,
          y: m,
          width: innerW,
          height: nameH,
          content: title.slice(0, 120),
          style: { fontSize: w < 50 ? '7px' : '8px', fontWeight: '700', textAlign: 'center' },
        },
        {
          id: 'p_price',
          type: 'text',
          x: m,
          y: m + nameH + 0.5,
          width: innerW,
          height: priceH,
          content: priceStr,
          style: { fontSize: w < 50 ? '10px' : '12px', fontWeight: '900', textAlign: 'center', color: '#1d4ed8' },
        },
        {
          id: 'p_qty',
          type: 'text',
          x: m,
          y: m + nameH + priceH + 0.9,
          width: innerW,
          height: qtyH,
          content: qtyStr,
          style: {
            fontSize: w < 50 ? (qtyHasSpecialCode ? '5.5px' : '6.5px') : (qtyHasSpecialCode ? '6px' : '7px'),
            fontWeight: '700',
            textAlign: 'center',
            color: '#374151',
          },
        },
        {
          id: 'barcode',
          type: 'barcode',
          x: m + w * 0.04,
          y: m + nameH + priceH + qtyH + 1.2,
          width: Math.max(4, innerW - w * 0.08),
          height: barH,
          content: barcodeValue,
        },
      ],
    };
  }

  const half = innerW / 2 - 0.5;
  const usable = h - 2 * m;
  const hBrand = Math.max(3, Math.min(5, usable * 0.12));
  const hTitle = Math.max(4.5, Math.min(10, usable * 0.3));
  const hRow = Math.max(3.2, Math.min(5, usable * 0.12));
  const gap = Math.max(0.35, usable * 0.02);
  let y = m;
  const components: ReportTemplate['components'] = [
    {
      id: 'lb_brand',
      type: 'text',
      x: m,
      y,
      width: innerW,
      height: hBrand,
      content: brand,
      style: { fontSize: w < 50 ? '7px' : '9px', fontWeight: '800', textAlign: 'center' },
    },
  ];
  y += hBrand + gap;
  components.push({
    id: 'lb_title',
    type: 'text',
    x: m,
    y,
    width: innerW,
    height: hTitle,
    content: title.slice(0, 160),
    style: {
      fontSize: w < 50 ? '6px' : '7px',
      fontWeight: '600',
      textAlign: 'center',
      overflow: 'hidden',
      lineHeight: '1.15',
    },
  });
  y += hTitle + gap;
  components.push(
    {
      id: 'lb_price',
      type: 'text',
      x: m,
      y,
      width: half,
      height: hRow,
      content: priceStr,
      style: { fontSize: w < 50 ? '9px' : '11px', fontWeight: '800', textAlign: 'left' },
    },
    {
      id: 'lb_qty',
      type: 'text',
      x: m + half + 1,
      y,
      width: half,
      height: hRow,
      content: qtyStr,
      style: {
        fontSize: w < 50 ? (qtyHasSpecialCode ? '6.5px' : '8px') : (qtyHasSpecialCode ? '8px' : '10px'),
        fontWeight: '700',
        textAlign: 'right',
      },
    },
  );
  y += hRow + gap;
  const barH = Math.max(6, h - m - y - 0.3);
  const barPad = Math.max(0.3, w * 0.03);
  components.push({
    id: 'barcode',
    type: 'barcode',
    x: m + barPad,
    y,
    width: Math.max(4, innerW - 2 * barPad),
    height: barH,
    content: barcodeValue,
  });

  return {
    name: `${w}x${h}mm Ürün Etiketi`,
    category: 'etiket',
    pageSize: { width: w, height: h },
    components,
  };
}
