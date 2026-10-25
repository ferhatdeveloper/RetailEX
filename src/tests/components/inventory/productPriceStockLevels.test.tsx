import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProductBasicPricingPanel } from '../../../components/inventory/products/ProductBasicPricingPanel';

const labels: Record<string, string> = {
  basicPricing: 'Temel Fiyatlandırma',
  currency: 'Para Birimi',
  iraqiDinar: 'Irak Dinarı',
  usDollar: 'ABD Doları',
  euro: 'Euro',
  britishPound: 'İngiliz Sterlini',
  purchasePrice: 'Alış Fiyatı',
  salePrice: 'Satış Fiyatı',
  profitMargin: '% Kâr Marjı',
  auto: 'Otomatik',
  productMinStockLevel: 'Minimum stok',
  productMaxStockLevel: 'Maksimum stok',
  productSafeStockLevel: 'Güvenli stok',
  productStockLevelHint: 'Kritik stok raporunda kullanılır. Stok miktarı ve maliyet değişmez.',
  taxType: 'Vergi Tipi',
  withholdingTax: '% Tevkifat',
};

function renderPanel(onChange = vi.fn()) {
  render(
    <ProductBasicPricingPanel
      tm={(key) => labels[key] ?? key}
      showPurchasePricing
      currency="IQD"
      purchasePrice={10}
      salePrice={25}
      autoCalculateUSD={false}
      minStock={2}
      maxStock={9}
      safeStock={4}
      profitMarginValue="150.00"
      profitMarginDisabled={false}
      onChange={onChange}
      onProfitMarginFocus={() => undefined}
      onProfitMarginChange={() => undefined}
      onProfitMarginBlur={() => undefined}
    />,
  );
  return onChange;
}

describe('malzeme kartı fiyat sekmesi stok seviyeleri', () => {
  it('üç seviye alanını gösterir, vergi bloğu bu sekmede yoktur', () => {
    renderPanel();
    expect(screen.getByLabelText('Minimum stok')).toBeTruthy();
    expect(screen.getByLabelText('Maksimum stok')).toBeTruthy();
    expect(screen.getByLabelText('Güvenli stok')).toBeTruthy();
    expect(screen.getByLabelText('Para Birimi')).toBeTruthy();
    expect(screen.getByLabelText('Alış Fiyatı')).toBeTruthy();
    expect(screen.getByLabelText('Satış Fiyatı')).toBeTruthy();
    expect(screen.getByLabelText('% Kâr Marjı')).toBeTruthy();
    expect(screen.queryByText('Vergi Tipi')).toBeNull();
    expect(screen.queryByText('TAX %')).toBeNull();
    expect(screen.queryByText('% Tevkifat')).toBeNull();
    expect(screen.queryByText(/KDV ayrıdır/)).toBeNull();
  });

  it('üç alan değişince kayıt state alanlarına yazılır', () => {
    const onChange = renderPanel();
    fireEvent.change(screen.getByLabelText('Minimum stok'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Maksimum stok'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Güvenli stok'), { target: { value: '9' } });
    expect(onChange).toHaveBeenCalledWith('minStock', 6);
    expect(onChange).toHaveBeenCalledWith('maxStock', 18);
    expect(onChange).toHaveBeenCalledWith('safeStock', 9);
    expect(onChange).not.toHaveBeenCalledWith('purchasePrice', expect.anything());
    expect(onChange).not.toHaveBeenCalledWith('salePrice', expect.anything());
    expect(onChange).not.toHaveBeenCalledWith('taxRate', expect.anything());
  });
});
