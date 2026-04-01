/**
 * Firma (ERP_SETTINGS.firmNr) değişince rex_{firma}_* tablolarına göre
 * önbellekte kalan eski firma verilerini temizleyip yeniden yükler.
 */
import { useCustomerStore } from './useCustomerStore';
import { useProductStore } from './useProductStore';
import { useSaleStore } from './useSaleStore';
import { useCampaignStore } from './useCampaignStore';
import { usePendingPurchaseStore } from './usePendingPurchaseStore';

export function clearFirmScopedCachesOnly(): void {
  useCustomerStore.getState().setCustomers([]);
  useProductStore.getState().setProducts([]);
  useSaleStore.getState().setSales([]);
  useCampaignStore.getState().setCampaigns([]);
  usePendingPurchaseStore.getState().clearInvoice();
}

export async function refreshFirmScopedStores(): Promise<void> {
  clearFirmScopedCachesOnly();

  await Promise.all(
    [
      useCustomerStore.getState().loadCustomers(),
      useProductStore.getState().loadProducts(true),
      useSaleStore.getState().loadSales(500),
      useCampaignStore.getState().loadCampaigns(),
    ].map((p) =>
      p.catch((e) => console.warn('[refreshFirmScopedStores]', e))
    )
  );
}

/** Dönem değişimi: satışlar `ERP_SETTINGS.periodNr` ile filtrelenir — sadece satış önbelleğini yeniler */
export async function refreshPeriodScopedStores(): Promise<void> {
  useSaleStore.getState().setSales([]);
  await useSaleStore.getState().loadSales(500).catch((e) =>
    console.warn('[refreshPeriodScopedStores]', e)
  );
}
