/**
 * ExRetailOS - Cost Accounting Service
 * 
 * FIFO (First-In-First-Out) inventory valuation
 * COGS (Cost of Goods Sold) calculation
 * Stock valuation & profitability analysis
 * 
 * @created 2024-12-18
 */

import { projectId, publicAnonKey } from '../utils/supabase/info';
import { isSupabaseConfigured } from '../config/supabase.config';


// ===== TYPES =====

export interface StockMovement {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  movement_type: 'IN' | 'OUT'; // IN = Alış, OUT = Satış
  quantity: number;
  unit_cost: number; // Birim maliyet (alış fiyatı)
  unit_price?: number; // Birim satış fiyatı (sadece OUT için)
  total_cost: number;
  total_price?: number; // Toplam satış tutarı (sadece OUT için)
  movement_date: string;
  document_no: string;
  document_type: 'PURCHASE_INVOICE' | 'SALES_INVOICE' | 'STOCK_ADJUSTMENT';
  firma_id: string;
  donem_id: string;
  warehouse_id?: string;
  created_at: string;
}

export interface FIFOLayer {
  id: string;
  product_id: string;
  remaining_quantity: number; // Kalan miktar
  unit_cost: number; // Birim maliyet
  purchase_date: string;
  document_no: string;
}

export interface StockValuation {
  product_id: string;
  product_code: string;
  product_name: string;
  total_quantity: number;
  total_cost: number; // FIFO'ya göre toplam maliyet
  average_unit_cost: number;
  layers: FIFOLayer[];
}

export interface COGSCalculation {
  product_id: string;
  quantity_sold: number;
  cost_of_goods_sold: number; // Satılan malın maliyeti
  layers_used: {
    layer_id: string;
    quantity_used: number;
    unit_cost: number;
    cost: number;
  }[];
}

export interface ProfitabilityReport {
  document_no: string;
  document_type: string;
  document_date: string;
  items: {
    product_id: string;
    product_code: string;
    product_name: string;
    quantity: number;
    unit_price: number; // Satış fiyatı
    total_price: number; // Satış tutarı
    unit_cost: number; // FIFO maliyeti
    total_cost: number; // Toplam maliyet
    gross_profit: number; // Brüt kar
    gross_margin_percent: number; // Brüt kar marjı %
  }[];
  total_revenue: number;
  total_cogs: number;
  total_gross_profit: number;
  gross_margin_percent: number;
}

// ===== SERVICE CLASS =====

export class CostAccountingService {
  /**
   * Stok hareketi kaydet (Alış veya Satış)
   */
  static async recordStockMovement(movement: Omit<StockMovement, 'id' | 'created_at'>): Promise<{ success: boolean; movement_id?: string; error?: string }> {
    try {
      if (!isSupabaseConfigured()) {
        console.warn('[CostAccounting] Supabase is not configured. Skipping remote recording.');
        return { success: true }; // Return success to not block local flow
      }
      console.log('[CostAccounting] Recording stock movement:', movement);

      const url = `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/cost-accounting/movements`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(movement)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      // FIFO layers'ı güncelle
      if (movement.movement_type === 'IN') {
        await this.addFIFOLayer({
          product_id: movement.product_id,
          quantity: movement.quantity,
          unit_cost: movement.unit_cost,
          purchase_date: movement.movement_date,
          document_no: movement.document_no,
          firma_id: movement.firma_id,
          donem_id: movement.donem_id
        });
      } else if (movement.movement_type === 'OUT') {
        await this.consumeFIFOLayers({
          product_id: movement.product_id,
          quantity: movement.quantity,
          firma_id: movement.firma_id,
          donem_id: movement.donem_id
        });
      }

      return { success: true, movement_id: result.data?.id };

    } catch (error: any) {
      console.error('[CostAccounting] Error recording movement:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * FIFO layer ekle (Alış hareketi)
   */
  static async addFIFOLayer(params: {
    product_id: string;
    quantity: number;
    unit_cost: number;
    purchase_date: string;
    document_no: string;
    firma_id: string;
    donem_id: string;
  }): Promise<{ success: boolean; layer_id?: string; error?: string }> {
    try {
      if (!isSupabaseConfigured()) return { success: true };
      console.log('[CostAccounting] Adding FIFO layer:', params);

      const url = `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/cost-accounting/fifo-layers`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product_id: params.product_id,
          remaining_quantity: params.quantity,
          unit_cost: params.unit_cost,
          purchase_date: params.purchase_date,
          document_no: params.document_no,
          firma_id: params.firma_id,
          donem_id: params.donem_id
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return { success: true, layer_id: result.data?.id };

    } catch (error: any) {
      console.error('[CostAccounting] Error adding FIFO layer:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * FIFO layers'dan tüket (Satış hareketi)
   */
  static async consumeFIFOLayers(params: {
    product_id: string;
    quantity: number;
    firma_id: string;
    donem_id: string;
  }): Promise<COGSCalculation> {
    try {
      console.log('[CostAccounting] Consuming FIFO layers:', params);

      // En eski layer'ları getir
      const layers = await this.getFIFOLayers({
        product_id: params.product_id,
        firma_id: params.firma_id,
        donem_id: params.donem_id
      });

      let remainingQuantity = params.quantity;
      let totalCOGS = 0;
      const layersUsed: COGSCalculation['layers_used'] = [];

      // FIFO: En eski layer'dan başlayarak tüket
      for (const layer of layers) {
        if (remainingQuantity <= 0) break;

        const quantityToUse = Math.min(remainingQuantity, layer.remaining_quantity);
        const cost = quantityToUse * layer.unit_cost;

        layersUsed.push({
          layer_id: layer.id,
          quantity_used: quantityToUse,
          unit_cost: layer.unit_cost,
          cost
        });

        totalCOGS += cost;
        remainingQuantity -= quantityToUse;

        // Layer'ı güncelle
        await this.updateFIFOLayer({
          layer_id: layer.id,
          remaining_quantity: layer.remaining_quantity - quantityToUse
        });
      }

      if (remainingQuantity > 0) {
        console.warn(`[CostAccounting] WARNING: Not enough stock! Remaining: ${remainingQuantity}`);
        // Negative stock - use zero cost or last known cost
        const lastCost = layers[layers.length - 1]?.unit_cost || 0;
        totalCOGS += remainingQuantity * lastCost;
        layersUsed.push({
          layer_id: 'negative-stock',
          quantity_used: remainingQuantity,
          unit_cost: lastCost,
          cost: remainingQuantity * lastCost
        });
      }

      return {
        product_id: params.product_id,
        quantity_sold: params.quantity,
        cost_of_goods_sold: totalCOGS,
        layers_used: layersUsed
      };

    } catch (error: any) {
      console.error('[CostAccounting] Error consuming FIFO layers:', error);
      return {
        product_id: params.product_id,
        quantity_sold: params.quantity,
        cost_of_goods_sold: 0,
        layers_used: []
      };
    }
  }

  /**
   * FIFO layers'ları getir (en eskiden yeniye)
   */
  static async getFIFOLayers(params: {
    product_id: string;
    firma_id: string;
    donem_id: string;
  }): Promise<FIFOLayer[]> {
    try {
      if (!isSupabaseConfigured()) return [];
      const url = new URL(`https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/cost-accounting/fifo-layers`);
      url.searchParams.append('product_id', params.product_id);
      url.searchParams.append('firma_id', params.firma_id);
      url.searchParams.append('donem_id', params.donem_id);

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.data || [];

    } catch (error) {
      console.error('[CostAccounting] Error fetching FIFO layers:', error);
      return [];
    }
  }

  /**
   * FIFO layer güncelle
   */
  static async updateFIFOLayer(params: {
    layer_id: string;
    remaining_quantity: number;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      if (!isSupabaseConfigured()) return { success: true };
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/cost-accounting/fifo-layers/${params.layer_id}`;

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          remaining_quantity: params.remaining_quantity
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return { success: true };

    } catch (error: any) {
      console.error('[CostAccounting] Error updating FIFO layer:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Ürün stok değerlemesi (FIFO)
   */
  static async getStockValuation(params: {
    product_id?: string;
    firma_id: string;
    donem_id: string;
  }): Promise<StockValuation[]> {
    try {
      if (!isSupabaseConfigured()) return [];
      const url = new URL(`https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/cost-accounting/stock-valuation`);
      if (params.product_id) {
        url.searchParams.append('product_id', params.product_id);
      }
      url.searchParams.append('firma_id', params.firma_id);
      url.searchParams.append('donem_id', params.donem_id);

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.data || [];

    } catch (error) {
      console.error('[CostAccounting] Error fetching stock valuation:', error);
      return [];
    }
  }

  /**
   * Belge karlılık analizi
   */
  static async getDocumentProfitability(params: {
    document_no: string;
    firma_id: string;
    donem_id: string;
  }): Promise<ProfitabilityReport | null> {
    try {
      if (!isSupabaseConfigured()) return null;
      const url = new URL(`https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/cost-accounting/profitability`);
      url.searchParams.append('document_no', params.document_no);
      url.searchParams.append('firma_id', params.firma_id);
      url.searchParams.append('donem_id', params.donem_id);

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.data || null;

    } catch (error) {
      console.error('[CostAccounting] Error fetching profitability:', error);
      return null;
    }
  }

  /**
   * Dönem COGS (Satılan Mal Maliyeti) hesapla
   */
  static async calculatePeriodCOGS(params: {
    firma_id: string;
    donem_id: string;
    baslangic_tarihi?: string;
    bitis_tarihi?: string;
  }): Promise<{
    total_cogs: number;
    total_revenue: number;
    gross_profit: number;
    gross_margin_percent: number;
    items: {
      product_id: string;
      product_name: string;
      quantity_sold: number;
      revenue: number;
      cogs: number;
      profit: number;
      margin_percent: number;
    }[];
  }> {
    try {
      if (!isSupabaseConfigured()) return { total_cogs: 0, total_revenue: 0, gross_profit: 0, gross_margin_percent: 0, items: [] };
      const url = new URL(`https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/cost-accounting/period-cogs`);
      url.searchParams.append('firma_id', params.firma_id);
      url.searchParams.append('donem_id', params.donem_id);
      if (params.baslangic_tarihi) {
        url.searchParams.append('baslangic_tarihi', params.baslangic_tarihi);
      }
      if (params.bitis_tarihi) {
        url.searchParams.append('bitis_tarihi', params.bitis_tarihi);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.data || {
        total_cogs: 0,
        total_revenue: 0,
        gross_profit: 0,
        gross_margin_percent: 0,
        items: []
      };

    } catch (error) {
      console.error('[CostAccounting] Error calculating period COGS:', error);
      return {
        total_cogs: 0,
        total_revenue: 0,
        gross_profit: 0,
        gross_margin_percent: 0,
        items: []
      };
    }
  }

  /**
   * Stok hareketleri raporu
   */
  static async getStockMovements(params: {
    product_id?: string;
    firma_id: string;
    donem_id: string;
    baslangic_tarihi?: string;
    bitis_tarihi?: string;
    movement_type?: 'IN' | 'OUT';
  }): Promise<StockMovement[]> {
    try {
      if (!isSupabaseConfigured()) return [];
      const url = new URL(`https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/cost-accounting/movements`);
      if (params.product_id) {
        url.searchParams.append('product_id', params.product_id);
      }
      url.searchParams.append('firma_id', params.firma_id);
      url.searchParams.append('donem_id', params.donem_id);
      if (params.baslangic_tarihi) {
        url.searchParams.append('baslangic_tarihi', params.baslangic_tarihi);
      }
      if (params.bitis_tarihi) {
        url.searchParams.append('bitis_tarihi', params.bitis_tarihi);
      }
      if (params.movement_type) {
        url.searchParams.append('movement_type', params.movement_type);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.data || [];

    } catch (error) {
      console.error('[CostAccounting] Error fetching stock movements:', error);
      return [];
    }
  }
}

/**
 * Format money
 */
export function formatMoney(amount: number): string {
  let formatted = amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  // Eğer ondalık kısım sıfırsa (örn: ,00), virgül ve sıfırları kaldır
  if (formatted.endsWith(',00') || formatted.endsWith(',0')) {
    formatted = formatted.replace(/[,]0+$/, '');
  }

  return formatted;
}

/**
 * Format percentage
 */
export function formatPercent(value: number): string {
  return value.toFixed(2) + '%';
}

