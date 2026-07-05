/**
 * Giriş noktası — online mağaza ve /mgz admin ERP'den izole bootstrap kullanır.
 */
import { isEticaretAdminPath } from '../eticaret/admin/isAdminPath';
import { isEticaretStorefrontPath } from '../eticaret/storefront/isStorefrontPath';

if (isEticaretStorefrontPath()) {
  void import('../eticaret/storefront/bootstrap');
} else if (isEticaretAdminPath()) {
  void import('../eticaret/admin/bootstrap');
} else {
  void import('./bootstrap-erp');
}
