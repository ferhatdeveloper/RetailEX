/**
 * Giriş noktası — online mağaza (/magaza, /shop) ERP'den izole bootstrap kullanır.
 */
import { isEticaretStorefrontPath } from '../eticaret/storefront/isStorefrontPath';

if (isEticaretStorefrontPath()) {
  void import('../eticaret/storefront/bootstrap');
} else {
  void import('./bootstrap-erp');
}
