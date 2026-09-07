/**
 * QR Menü — backoffice / personel servisleri (PostgresConnection prefix rewrite).
 */
import { PostgresConnection, ERP_SETTINGS } from './postgres';

export type QrSettings = {
  id?: string;
  restaurant_name?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  primary_color?: string | null;
  wifi_ssid?: string | null;
  wifi_password?: string | null;
  public_base_url?: string | null;
  default_language?: string | null;
  supported_languages?: string[] | null;
  ordering_enabled?: boolean;
  call_waiter_enabled?: boolean;
  request_bill_enabled?: boolean;
  valet_enabled?: boolean;
  feedback_enabled?: boolean;
  wifi_enabled?: boolean;
  auto_send_kitchen?: boolean;
  /** manual = adisyona yazılmaz (onay sonrası); auto = hemen adisyona */
  order_approval_mode?: 'manual' | 'auto';
  is_active?: boolean;
};

export type QrFeedbackQuestion = {
  id: string;
  code: string;
  name_tr: string;
  name_en?: string | null;
  name_ar?: string | null;
  name_ku?: string | null;
  icon_key?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export type ServiceRequestRow = {
  id: string;
  request_type: string;
  status: string;
  table_id?: string | null;
  table_number?: string | null;
  order_id?: string | null;
  payload?: Record<string, unknown> | null;
  customer_note?: string | null;
  staff_note?: string | null;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  created_at?: string;
};

export type QrFeedbackRow = {
  id: string;
  question_code?: string | null;
  rating?: number | null;
  table_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  comment?: string | null;
  status?: string;
  created_at?: string;
};

function db() {
  return PostgresConnection.getInstance();
}

export class QrMenuService {
  static getPublicQrUrl(tenantCode: string, tableToken: string, baseUrl?: string): string {
    const base = (baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
      /\/+$/,
      ''
    );
    const code = encodeURIComponent(String(tenantCode || '').trim());
    const token = encodeURIComponent(String(tableToken || '').trim());
    return `${base}/m/${code}/t/${token}`;
  }

  static async getSettings(): Promise<QrSettings> {
    const { rows } = await db().query(`SELECT * FROM qr_settings LIMIT 1`);
    if (rows[0]) return rows[0] as QrSettings;
    await db().query(`INSERT INTO qr_settings (restaurant_name) VALUES (NULL)`);
    const again = await db().query(`SELECT * FROM qr_settings LIMIT 1`);
    return (again.rows[0] || {}) as QrSettings;
  }

  static async upsertSettings(patch: Partial<QrSettings>): Promise<QrSettings> {
    const cur = await this.getSettings();
    const next = { ...cur, ...patch };
    if (cur.id) {
      const { rows } = await db().query(
        `UPDATE qr_settings SET
          restaurant_name=$2, logo_url=$3, cover_image_url=$4, primary_color=$5,
          wifi_ssid=$6, wifi_password=$7, public_base_url=$8, default_language=$9,
          ordering_enabled=$10, call_waiter_enabled=$11, request_bill_enabled=$12,
          valet_enabled=$13, feedback_enabled=$14, wifi_enabled=$15,
          auto_send_kitchen=$16, is_active=$17, order_approval_mode=$18, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [
          cur.id,
          next.restaurant_name ?? null,
          next.logo_url ?? null,
          next.cover_image_url ?? null,
          next.primary_color ?? '#f59e0b',
          next.wifi_ssid ?? null,
          next.wifi_password ?? null,
          next.public_base_url ?? null,
          next.default_language ?? 'tr',
          next.ordering_enabled !== false,
          next.call_waiter_enabled !== false,
          next.request_bill_enabled !== false,
          !!next.valet_enabled,
          next.feedback_enabled !== false,
          next.wifi_enabled !== false,
          !!next.auto_send_kitchen,
          next.is_active !== false,
          next.order_approval_mode === 'auto' ? 'auto' : 'manual',
        ]
      );
      return rows[0] as QrSettings;
    }
    return this.getSettings();
  }

  static async listFeedbackQuestions(): Promise<QrFeedbackQuestion[]> {
    const { rows } = await db().query(
      `SELECT * FROM qr_feedback_questions ORDER BY sort_order ASC, code ASC`
    );
    return rows as QrFeedbackQuestion[];
  }

  static async saveFeedbackQuestion(
    q: Partial<QrFeedbackQuestion> & { code: string; name_tr: string }
  ): Promise<QrFeedbackQuestion> {
    if (q.id) {
      const { rows } = await db().query(
        `UPDATE qr_feedback_questions SET
          code=$2, name_tr=$3, name_en=$4, name_ar=$5, name_ku=$6,
          icon_key=$7, sort_order=$8, is_active=$9
         WHERE id=$1 RETURNING *`,
        [
          q.id,
          q.code,
          q.name_tr,
          q.name_en ?? null,
          q.name_ar ?? null,
          q.name_ku ?? null,
          q.icon_key ?? 'star',
          q.sort_order ?? 0,
          q.is_active !== false,
        ]
      );
      return rows[0] as QrFeedbackQuestion;
    }
    const { rows } = await db().query(
      `INSERT INTO qr_feedback_questions
         (code, name_tr, name_en, name_ar, name_ku, icon_key, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        q.code,
        q.name_tr,
        q.name_en ?? null,
        q.name_ar ?? null,
        q.name_ku ?? null,
        q.icon_key ?? 'star',
        q.sort_order ?? 0,
        q.is_active !== false,
      ]
    );
    return rows[0] as QrFeedbackQuestion;
  }

  static async deleteFeedbackQuestion(id: string): Promise<void> {
    await db().query(`DELETE FROM qr_feedback_questions WHERE id=$1`, [id]);
  }

  static async ensureTableQrToken(tableId: string): Promise<string> {
    const { rows } = await db().query(
      `SELECT qr_token FROM rest_tables WHERE id=$1`,
      [tableId]
    );
    if (rows[0]?.qr_token) return String(rows[0].qr_token);
    const { rows: upd } = await db().query(
      `UPDATE rest_tables SET qr_token = gen_random_uuid(), updated_at=NOW()
       WHERE id=$1 RETURNING qr_token`,
      [tableId]
    );
    return String(upd[0]?.qr_token || '');
  }

  static async regenerateTableQrToken(tableId: string): Promise<string> {
    const { rows } = await db().query(
      `UPDATE rest_tables SET qr_token = gen_random_uuid(), updated_at=NOW()
       WHERE id=$1 RETURNING qr_token`,
      [tableId]
    );
    return String(rows[0]?.qr_token || '');
  }

  static async listTablesWithQr(): Promise<
    Array<{ id: string; number: string; seats: number; status: string; qr_token: string | null }>
  > {
    const { rows } = await db().query(
      `SELECT id, number, seats, status, qr_token FROM rest_tables ORDER BY number ASC`
    );
    for (const r of rows) {
      if (!r.qr_token) {
        r.qr_token = await this.ensureTableQrToken(r.id);
      }
    }
    return rows;
  }

  static async listServiceRequests(status?: string): Promise<ServiceRequestRow[]> {
    if (status) {
      const { rows } = await db().query(
        `SELECT * FROM rest_service_requests WHERE status=$1 ORDER BY created_at DESC LIMIT 200`,
        [status]
      );
      return rows as ServiceRequestRow[];
    }
    const { rows } = await db().query(
      `SELECT * FROM rest_service_requests ORDER BY created_at DESC LIMIT 200`
    );
    return rows as ServiceRequestRow[];
  }

  static async listPendingNotifications(): Promise<ServiceRequestRow[]> {
    const { rows } = await db().query(
      `SELECT * FROM rest_service_requests
       WHERE status = 'pending'
       ORDER BY created_at DESC
       LIMIT 50`
    );
    return rows as ServiceRequestRow[];
  }

  static async updateServiceRequestStatus(
    id: string,
    status: 'pending' | 'acked' | 'done' | 'cancelled',
    staff?: string
  ): Promise<ServiceRequestRow> {
    const sets = [`status=$2`, `updated_at=NOW()`];
    const vals: unknown[] = [id, status];
    if (status === 'acked') {
      sets.push(`acknowledged_at=NOW()`);
      sets.push(`acknowledged_by=$3`);
      vals.push(staff || null);
    }
    if (status === 'done') {
      sets.push(`resolved_at=NOW()`);
    }
    const { rows } = await db().query(
      `UPDATE rest_service_requests SET ${sets.join(', ')} WHERE id=$1 RETURNING *`,
      vals
    );
    return rows[0] as ServiceRequestRow;
  }

  static async createServiceRequest(params: {
    requestType: string;
    tableId?: string;
    tableNumber?: string;
    orderId?: string;
    payload?: Record<string, unknown>;
    customerNote?: string;
  }): Promise<ServiceRequestRow> {
    const { rows } = await db().query(
      `INSERT INTO rest_service_requests
         (request_type, status, table_id, table_number, order_id, payload, customer_note)
       VALUES ($1,'pending',$2,$3,$4,$5::jsonb,$6) RETURNING *`,
      [
        params.requestType,
        params.tableId ?? null,
        params.tableNumber ?? null,
        params.orderId ?? null,
        JSON.stringify(params.payload ?? {}),
        params.customerNote ?? null,
      ]
    );
    return rows[0] as ServiceRequestRow;
  }

  static async listFeedback(limit = 100): Promise<QrFeedbackRow[]> {
    const { rows } = await db().query(
      `SELECT * FROM rest_feedback ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return rows as QrFeedbackRow[];
  }

  static async updateFeedbackStatus(
    id: string,
    status: string,
    responseText?: string
  ): Promise<void> {
    await db().query(
      `UPDATE rest_feedback SET status=$2, response_text=COALESCE($3, response_text),
         responded_at = CASE WHEN $3 IS NOT NULL THEN NOW() ELSE responded_at END
       WHERE id=$1`,
      [id, status, responseText ?? null]
    );
  }

  /** Manuel QR siparişi onayla → adisyona yaz; auto_send_kitchen açıksa mutfağa da gönder. */
  static async approveQrOrderRequest(requestId: string): Promise<{
    tableId: string;
    orderId: string;
    sendKitchen: boolean;
  }> {
    const { RestaurantService } = await import('./restaurant');
    const { rows } = await db().query(
      `SELECT * FROM rest_service_requests WHERE id=$1`,
      [requestId]
    );
    const row = rows[0] as ServiceRequestRow | undefined;
    if (!row) throw new Error('Sipariş talebi bulunamadı');
    if (row.request_type !== 'qr_order') throw new Error('Bu kayıt QR sipariş değil');
    if (row.status !== 'pending') throw new Error('Talep zaten işlenmiş');

    const tableId = row.table_id;
    if (!tableId) throw new Error('Masa bilgisi yok');

    let payload = row.payload as Record<string, unknown> | null;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = {};
      }
    }
    const awaiting = payload?.awaitingApproval !== false && !row.order_id;
    const settings = await this.getSettings();
    const sendKitchen = !!settings.auto_send_kitchen;

    // Zaten adisyona yazılmış (eski akış: sadece mutfak onayı)
    if (!awaiting && row.order_id) {
      await this.updateServiceRequestStatus(requestId, 'done');
      return { tableId, orderId: row.order_id, sendKitchen: true };
    }

    const rawItems = Array.isArray(payload?.items) ? payload!.items : [];
    if (!rawItems.length) throw new Error('Onaylanacak kalem yok');

    let order = await RestaurantService.getActiveOrder(tableId);
    if (!order) {
      const tableRows = await db().query(`SELECT floor_id FROM rest_tables WHERE id=$1`, [tableId]);
      order = await RestaurantService.createOrder({
        tableId,
        floorId: tableRows.rows[0]?.floor_id || undefined,
        waiter: 'QR Menü',
        source: 'qr_menu',
        note: JSON.stringify({ channel: 'qr_menu', approved_from: requestId }),
      });
      await db().query(
        `UPDATE rest_tables SET status='occupied', waiter=COALESCE(waiter,'QR Menü'),
         start_time=COALESCE(start_time,NOW()), updated_at=NOW()
         WHERE id=$1 AND status='empty'`,
        [tableId]
      );
    }

    for (const it of rawItems as Array<Record<string, unknown>>) {
      await RestaurantService.addOrderItem(order.id, {
        productId: typeof it.productId === 'string' ? it.productId : undefined,
        productName: String(it.name || 'Ürün'),
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
        note: typeof it.note === 'string' ? it.note : undefined,
      });
    }

    await db().query(
      `UPDATE rest_service_requests SET status='done', order_id=$2, resolved_at=NOW(),
         acknowledged_at=COALESCE(acknowledged_at,NOW()), updated_at=NOW()
       WHERE id=$1`,
      [requestId, order.id]
    );

    return { tableId, orderId: order.id, sendKitchen };
  }

  /** QR sipariş bildirimi onay: pending kalemleri mutfağa gönder (store.sendToKitchen ile). */
  static async getQrOrderContext(requestId: string): Promise<{
    tableId: string | null;
    orderId: string | null;
    tableNumber: string | null;
    itemIds: string[];
  }> {
    const { rows } = await db().query(
      `SELECT * FROM rest_service_requests WHERE id=$1`,
      [requestId]
    );
    const row = rows[0] as ServiceRequestRow | undefined;
    if (!row) return { tableId: null, orderId: null, tableNumber: null, itemIds: [] };
    const payload = (row.payload || {}) as { itemIds?: string[] };
    return {
      tableId: row.table_id ?? null,
      orderId: row.order_id ?? null,
      tableNumber: row.table_number ?? null,
      itemIds: Array.isArray(payload.itemIds) ? payload.itemIds : [],
    };
  }

  static tenantCodeHint(): string {
    try {
      const raw = localStorage.getItem('retailex_web_config');
      if (raw) {
        const o = JSON.parse(raw) as { merkez_tenant_code?: string };
        if (o.merkez_tenant_code) return String(o.merkez_tenant_code).trim();
      }
    } catch {
      /* ignore */
    }
    return String(ERP_SETTINGS.firmNr || '001');
  }
}
