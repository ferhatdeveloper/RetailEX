/**
 * ExRetailOS - Cost Accounting Backend Routes
 * 
 * FIFO inventory valuation endpoints
 * COGS calculation
 * Stock movements tracking
 * 
 * @created 2024-12-18
 */

import { Hono } from 'npm:hono@4.0.0';
import * as kv from './kv_store.tsx';

const app = new Hono();

// ===== TYPES =====

interface StockMovement {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  movement_type: 'IN' | 'OUT';
  quantity: number;
  unit_cost: number;
  unit_price?: number;
  total_cost: number;
  total_price?: number;
  movement_date: string;
  document_no: string;
  document_type: string;
  firma_id: string;
  donem_id: string;
  warehouse_id?: string;
  created_at: string;
}

interface FIFOLayer {
  id: string;
  product_id: string;
  remaining_quantity: number;
  unit_cost: number;
  purchase_date: string;
  document_no: string;
  firma_id: string;
  donem_id: string;
  created_at: string;
}

// ===== STOCK MOVEMENTS =====

/**
 * POST /cost-accounting/movements
 * Stok hareketi kaydet
 */
app.post('/movements', async (c) => {
  try {
    const body = await c.req.json();
    
    const movement: StockMovement = {
      id: `MOV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      product_id: body.product_id,
      product_code: body.product_code,
      product_name: body.product_name,
      movement_type: body.movement_type,
      quantity: body.quantity,
      unit_cost: body.unit_cost,
      unit_price: body.unit_price,
      total_cost: body.total_cost,
      total_price: body.total_price,
      movement_date: body.movement_date,
      document_no: body.document_no,
      document_type: body.document_type,
      firma_id: body.firma_id,
      donem_id: body.donem_id,
      warehouse_id: body.warehouse_id,
      created_at: new Date().toISOString()
    };
    
    // KV'ye kaydet
    const key = `cost_accounting:movement:${movement.firma_id}:${movement.donem_id}:${movement.id}`;
    await kv.set(key, movement);
    
    // Index by product
    const productKey = `cost_accounting:movements_by_product:${movement.firma_id}:${movement.donem_id}:${movement.product_id}`;
    const existingMovements = await kv.get(productKey) || [];
    await kv.set(productKey, [...existingMovements, movement.id]);
    
    console.log('[CostAccounting] Movement recorded:', movement.id);
    
    return c.json({
      success: true,
      data: movement
    });
    
  } catch (error: any) {
    console.error('[CostAccounting] Error recording movement:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * GET /cost-accounting/movements
 * Stok hareketleri listele
 */
app.get('/movements', async (c) => {
  try {
    const firma_id = c.req.query('firma_id');
    const donem_id = c.req.query('donem_id');
    const product_id = c.req.query('product_id');
    const movement_type = c.req.query('movement_type');
    
    if (!firma_id || !donem_id) {
      return c.json({ success: false, error: 'firma_id and donem_id required' }, 400);
    }
    
    let movements: StockMovement[] = [];
    
    if (product_id) {
      // Ürüne göre filtrele
      const productKey = `cost_accounting:movements_by_product:${firma_id}:${donem_id}:${product_id}`;
      const movementIds = await kv.get(productKey) || [];
      
      for (const id of movementIds) {
        const key = `cost_accounting:movement:${firma_id}:${donem_id}:${id}`;
        const movement = await kv.get(key);
        if (movement) {
          movements.push(movement);
        }
      }
    } else {
      // Tüm hareketleri getir
      const prefix = `cost_accounting:movement:${firma_id}:${donem_id}:`;
      const allMovements = await kv.getByPrefix(prefix);
      movements = allMovements;
    }
    
    // Movement type filtresi
    if (movement_type) {
      movements = movements.filter(m => m.movement_type === movement_type);
    }
    
    // Tarihe göre sırala (en yeni en üstte)
    movements.sort((a, b) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime());
    
    return c.json({
      success: true,
      data: movements
    });
    
  } catch (error: any) {
    console.error('[CostAccounting] Error fetching movements:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ===== FIFO LAYERS =====

/**
 * POST /cost-accounting/fifo-layers
 * FIFO layer ekle
 */
app.post('/fifo-layers', async (c) => {
  try {
    const body = await c.req.json();
    
    const layer: FIFOLayer = {
      id: `LAYER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      product_id: body.product_id,
      remaining_quantity: body.remaining_quantity,
      unit_cost: body.unit_cost,
      purchase_date: body.purchase_date,
      document_no: body.document_no,
      firma_id: body.firma_id,
      donem_id: body.donem_id,
      created_at: new Date().toISOString()
    };
    
    // KV'ye kaydet
    const key = `cost_accounting:fifo_layer:${layer.firma_id}:${layer.donem_id}:${layer.id}`;
    await kv.set(key, layer);
    
    // Index by product
    const productKey = `cost_accounting:fifo_layers_by_product:${layer.firma_id}:${layer.donem_id}:${layer.product_id}`;
    const existingLayers = await kv.get(productKey) || [];
    await kv.set(productKey, [...existingLayers, layer.id]);
    
    console.log('[CostAccounting] FIFO layer added:', layer.id);
    
    return c.json({
      success: true,
      data: layer
    });
    
  } catch (error: any) {
    console.error('[CostAccounting] Error adding FIFO layer:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * GET /cost-accounting/fifo-layers
 * FIFO layers listele (en eskiden yeniye)
 */
app.get('/fifo-layers', async (c) => {
  try {
    const firma_id = c.req.query('firma_id');
    const donem_id = c.req.query('donem_id');
    const product_id = c.req.query('product_id');
    
    if (!firma_id || !donem_id || !product_id) {
      return c.json({ success: false, error: 'firma_id, donem_id, and product_id required' }, 400);
    }
    
    // Ürüne ait layer'ları getir
    const productKey = `cost_accounting:fifo_layers_by_product:${firma_id}:${donem_id}:${product_id}`;
    const layerIds = await kv.get(productKey) || [];
    
    const layers: FIFOLayer[] = [];
    
    for (const id of layerIds) {
      const key = `cost_accounting:fifo_layer:${firma_id}:${donem_id}:${id}`;
      const layer = await kv.get(key);
      if (layer && layer.remaining_quantity > 0) {
        layers.push(layer);
      }
    }
    
    // Tarihe göre sırala (en eski en başta - FIFO)
    layers.sort((a, b) => new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime());
    
    return c.json({
      success: true,
      data: layers
    });
    
  } catch (error: any) {
    console.error('[CostAccounting] Error fetching FIFO layers:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * PATCH /cost-accounting/fifo-layers/:id
 * FIFO layer güncelle
 */
app.patch('/fifo-layers/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    
    // Layer'ı bul
    const prefix = `cost_accounting:fifo_layer:`;
    const allLayers = await kv.getByPrefix(prefix);
    const layer = allLayers.find((l: FIFOLayer) => l.id === id);
    
    if (!layer) {
      return c.json({ success: false, error: 'Layer not found' }, 404);
    }
    
    // Güncelle
    const updatedLayer = {
      ...layer,
      remaining_quantity: body.remaining_quantity !== undefined ? body.remaining_quantity : layer.remaining_quantity
    };
    
    const key = `cost_accounting:fifo_layer:${layer.firma_id}:${layer.donem_id}:${layer.id}`;
    await kv.set(key, updatedLayer);
    
    console.log('[CostAccounting] FIFO layer updated:', id, 'remaining:', updatedLayer.remaining_quantity);
    
    return c.json({
      success: true,
      data: updatedLayer
    });
    
  } catch (error: any) {
    console.error('[CostAccounting] Error updating FIFO layer:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ===== STOCK VALUATION =====

/**
 * GET /cost-accounting/stock-valuation
 * Stok değerlemesi (FIFO)
 */
app.get('/stock-valuation', async (c) => {
  try {
    const firma_id = c.req.query('firma_id');
    const donem_id = c.req.query('donem_id');
    const product_id = c.req.query('product_id');
    
    if (!firma_id || !donem_id) {
      return c.json({ success: false, error: 'firma_id and donem_id required' }, 400);
    }
    
    const valuations: any[] = [];
    
    // Tüm ürünlerin layer'larını kontrol et
    const prefix = `cost_accounting:fifo_layers_by_product:${firma_id}:${donem_id}:`;
    const allProductKeys = await kv.getByPrefix(prefix);
    
    // Her ürün için
    const productIds = product_id ? [product_id] : Object.keys(allProductKeys);
    
    for (const pid of productIds) {
      const productKey = `cost_accounting:fifo_layers_by_product:${firma_id}:${donem_id}:${pid}`;
      const layerIds = await kv.get(productKey) || [];
      
      const layers: FIFOLayer[] = [];
      let totalQuantity = 0;
      let totalCost = 0;
      
      for (const id of layerIds) {
        const key = `cost_accounting:fifo_layer:${firma_id}:${donem_id}:${id}`;
        const layer = await kv.get(key);
        if (layer && layer.remaining_quantity > 0) {
          layers.push(layer);
          totalQuantity += layer.remaining_quantity;
          totalCost += layer.remaining_quantity * layer.unit_cost;
        }
      }
      
      if (totalQuantity > 0) {
        valuations.push({
          product_id: pid,
          product_code: `P${pid.substr(0, 4)}`,
          product_name: `Product ${pid}`,
          total_quantity: totalQuantity,
          total_cost: totalCost,
          average_unit_cost: totalCost / totalQuantity,
          layers: layers
        });
      }
    }
    
    return c.json({
      success: true,
      data: valuations
    });
    
  } catch (error: any) {
    console.error('[CostAccounting] Error calculating stock valuation:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ===== PERIOD COGS =====

/**
 * GET /cost-accounting/period-cogs
 * Dönem COGS hesapla
 */
app.get('/period-cogs', async (c) => {
  try {
    const firma_id = c.req.query('firma_id');
    const donem_id = c.req.query('donem_id');
    
    if (!firma_id || !donem_id) {
      return c.json({ success: false, error: 'firma_id and donem_id required' }, 400);
    }
    
    // Tüm OUT (satış) hareketlerini getir
    const prefix = `cost_accounting:movement:${firma_id}:${donem_id}:`;
    const allMovements = await kv.getByPrefix(prefix);
    
    const outMovements = allMovements.filter((m: StockMovement) => m.movement_type === 'OUT');
    
    let total_cogs = 0;
    let total_revenue = 0;
    const itemsMap = new Map();
    
    outMovements.forEach((movement: StockMovement) => {
      const cogs = movement.total_cost || 0;
      const revenue = movement.total_price || 0;
      
      total_cogs += cogs;
      total_revenue += revenue;
      
      // Ürün bazında topla
      if (!itemsMap.has(movement.product_id)) {
        itemsMap.set(movement.product_id, {
          product_id: movement.product_id,
          product_name: movement.product_name,
          quantity_sold: 0,
          revenue: 0,
          cogs: 0,
          profit: 0,
          margin_percent: 0
        });
      }
      
      const item = itemsMap.get(movement.product_id);
      item.quantity_sold += movement.quantity;
      item.revenue += revenue;
      item.cogs += cogs;
      item.profit = item.revenue - item.cogs;
      item.margin_percent = item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0;
    });
    
    const gross_profit = total_revenue - total_cogs;
    const gross_margin_percent = total_revenue > 0 ? (gross_profit / total_revenue) * 100 : 0;
    
    return c.json({
      success: true,
      data: {
        total_cogs,
        total_revenue,
        gross_profit,
        gross_margin_percent,
        items: Array.from(itemsMap.values())
      }
    });
    
  } catch (error: any) {
    console.error('[CostAccounting] Error calculating period COGS:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ===== PROFITABILITY =====

/**
 * GET /cost-accounting/profitability
 * Belge karlılık analizi
 */
app.get('/profitability', async (c) => {
  try {
    const document_no = c.req.query('document_no');
    const firma_id = c.req.query('firma_id');
    const donem_id = c.req.query('donem_id');
    
    if (!document_no || !firma_id || !donem_id) {
      return c.json({ success: false, error: 'document_no, firma_id, and donem_id required' }, 400);
    }
    
    // Belgeye ait hareketleri getir
    const prefix = `cost_accounting:movement:${firma_id}:${donem_id}:`;
    const allMovements = await kv.getByPrefix(prefix);
    
    const documentMovements = allMovements.filter((m: StockMovement) => 
      m.document_no === document_no && m.movement_type === 'OUT'
    );
    
    if (documentMovements.length === 0) {
      return c.json({ success: false, error: 'Document not found' }, 404);
    }
    
    const items = documentMovements.map((movement: StockMovement) => {
      const total_price = movement.total_price || 0;
      const total_cost = movement.total_cost || 0;
      const gross_profit = total_price - total_cost;
      const unit_price = movement.unit_price || 0;
      const unit_cost = movement.unit_cost || 0;
      
      return {
        product_id: movement.product_id,
        product_code: movement.product_code,
        product_name: movement.product_name,
        quantity: movement.quantity,
        unit_price,
        total_price,
        unit_cost,
        total_cost,
        gross_profit,
        gross_margin_percent: total_price > 0 ? (gross_profit / total_price) * 100 : 0
      };
    });
    
    const total_revenue = items.reduce((sum, item) => sum + item.total_price, 0);
    const total_cogs = items.reduce((sum, item) => sum + item.total_cost, 0);
    const total_gross_profit = total_revenue - total_cogs;
    
    return c.json({
      success: true,
      data: {
        document_no,
        document_type: documentMovements[0].document_type,
        document_date: documentMovements[0].movement_date,
        items,
        total_revenue,
        total_cogs,
        total_gross_profit,
        gross_margin_percent: total_revenue > 0 ? (total_gross_profit / total_revenue) * 100 : 0
      }
    });
    
  } catch (error: any) {
    console.error('[CostAccounting] Error calculating profitability:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

export default app;

