import type { RestOrderDetail, SendToKitchenResult } from '../api/restaurantApi';
import {
  printKitchenTicketsForOrder as printEscposKitchenTicketsForOrder,
  type KitchenTicketPrintResult,
} from './escpos/buildKitchenTicketEscPos';
import type { ReceiptLangCode } from '../types/printerSettings';

export type KitchenTicketPrintRequest = {
  order: RestOrderDetail;
  kitchenResult: SendToKitchenResult;
  tableName?: string | null;
  menu?: Array<{ id: string; category?: string | null }>;
  locale?: ReceiptLangCode | null;
};

/**
 * RestaurantScreen entegrasyon noktası.
 * Kategori rotası + ortak yazıcı ayarı app_settings üzerinden çözülür.
 */
export async function printKitchenTicketsForOrder(
  request: KitchenTicketPrintRequest,
): Promise<KitchenTicketPrintResult> {
  const sentIds = new Set(request.kitchenResult.sentItemIds);
  const pendingItems = request.order.items
    .filter((item) => sentIds.has(item.id))
    .map((item) => ({
      id: item.id,
      productId: item.product_id,
      product_id: item.product_id,
      name: item.product_name,
      product_name: item.product_name,
      quantity: item.quantity,
      course: item.course,
      note: item.note,
      options: item.options,
      categoryName: item.category_name,
      categoryId: item.category_id,
      categoryCode: item.category_code,
    }));

  return printEscposKitchenTicketsForOrder({
    table: {
      number: request.tableName || request.order.table_name || request.order.table_id || 'Masa',
      waiter: request.order.waiter,
    },
    pendingItems,
    menu: request.menu,
    locale: request.locale,
  });
}
