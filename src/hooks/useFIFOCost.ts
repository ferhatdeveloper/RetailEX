/**
 * ExRetailOS - FIFO Cost Hook
 * 
 * Ürün maliyetini FIFO'ya göre hesaplar
 * Satış sırasında anlık kar hesabı için kullanılır
 * 
 * @created 2024-12-18
 */

import { useState, useEffect } from 'react';
import { CostAccountingService } from '../services/costAccountingService';

interface FIFOCostResult {
  unitCost: number;
  totalCost: number;
  available: boolean;
  loading: boolean;
}

/**
 * Ürün için FIFO maliyetini hesapla
 */
export function useFIFOCost(params: {
  productId: string;
  quantity: number;
  firmaId: string;
  donemId: string;
  enabled?: boolean;
}): FIFOCostResult {
  const [cost, setCost] = useState<FIFOCostResult>({
    unitCost: 0,
    totalCost: 0,
    available: false,
    loading: false
  });
  
  const { productId, quantity, firmaId, donemId, enabled = true } = params;
  
  useEffect(() => {
    if (!enabled || !productId || !quantity || !firmaId || !donemId) {
      return;
    }
    
    let cancelled = false;
    
    const calculateCost = async () => {
      setCost(prev => ({ ...prev, loading: true }));
      
      try {
        // FIFO layers'ları getir
        const layers = await CostAccountingService.getFIFOLayers({
          product_id: productId,
          firma_id: firmaId,
          donem_id: donemId
        });
        
        if (cancelled) return;
        
        if (layers.length === 0) {
          // Stok yok
          setCost({
            unitCost: 0,
            totalCost: 0,
            available: false,
            loading: false
          });
          return;
        }
        
        // FIFO hesaplama
        let remainingQty = quantity;
        let totalCost = 0;
        
        for (const layer of layers) {
          if (remainingQty <= 0) break;
          
          const qtyToUse = Math.min(remainingQty, layer.remaining_quantity);
          totalCost += qtyToUse * layer.unit_cost;
          remainingQty -= qtyToUse;
        }
        
        // Eğer yeterli stok yoksa, son bilinen maliyeti kullan
        if (remainingQty > 0 && layers.length > 0) {
          const lastCost = layers[layers.length - 1].unit_cost;
          totalCost += remainingQty * lastCost;
        }
        
        const unitCost = quantity > 0 ? totalCost / quantity : 0;
        
        setCost({
          unitCost,
          totalCost,
          available: true,
          loading: false
        });
        
      } catch (error) {
        console.error('[useFIFOCost] Error:', error);
        if (!cancelled) {
          setCost({
            unitCost: 0,
            totalCost: 0,
            available: false,
            loading: false
          });
        }
      }
    };
    
    calculateCost();
    
    return () => {
      cancelled = true;
    };
  }, [productId, quantity, firmaId, donemId, enabled]);
  
  return cost;
}

/**
 * Batch FIFO cost calculation for multiple products
 */
export async function batchCalculateFIFOCost(params: {
  items: Array<{
    productId: string;
    productCode: string;
    quantity: number;
  }>;
  firmaId: string;
  donemId: string;
}): Promise<Map<string, { unitCost: number; totalCost: number; available: boolean }>> {
  const results = new Map();
  
  for (const item of params.items) {
    try {
      const layers = await CostAccountingService.getFIFOLayers({
        product_id: item.productId,
        firma_id: params.firmaId,
        donem_id: params.donemId
      });
      
      if (layers.length === 0) {
        results.set(item.productId, {
          unitCost: 0,
          totalCost: 0,
          available: false
        });
        continue;
      }
      
      // FIFO calculation
      let remainingQty = item.quantity;
      let totalCost = 0;
      
      for (const layer of layers) {
        if (remainingQty <= 0) break;
        
        const qtyToUse = Math.min(remainingQty, layer.remaining_quantity);
        totalCost += qtyToUse * layer.unit_cost;
        remainingQty -= qtyToUse;
      }
      
      // Use last known cost for remaining quantity
      if (remainingQty > 0 && layers.length > 0) {
        const lastCost = layers[layers.length - 1].unit_cost;
        totalCost += remainingQty * lastCost;
      }
      
      const unitCost = item.quantity > 0 ? totalCost / item.quantity : 0;
      
      results.set(item.productId, {
        unitCost,
        totalCost,
        available: true
      });
      
    } catch (error) {
      console.error(`[batchCalculateFIFOCost] Error for product ${item.productId}:`, error);
      results.set(item.productId, {
        unitCost: 0,
        totalCost: 0,
        available: false
      });
    }
  }
  
  return results;
}

