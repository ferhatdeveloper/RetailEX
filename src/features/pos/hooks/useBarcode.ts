// Barcode Hook - POS Feature
import { useState, useEffect, useCallback } from 'react';
import { useProductStore } from '../../../store';
import type { Product, ProductVariant } from '../../../core/types';
import { useNotification } from '../../../shared/hooks';

export const useBarcode = (onProductFound: (product: Product, variant?: ProductVariant) => void) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const findByBarcode = useProductStore((state) => state.findByBarcode);
  const { error } = useNotification();

  const handleBarcodeInput = useCallback((barcode: string) => {
    setBarcodeInput(barcode);
    
    if (barcode.length >= 8) {
      // Try to find product by barcode
      const product = findByBarcode(barcode);
      
      if (product) {
        // Check if it's a variant barcode
        const variant = product.variants?.find(v => v.barcode === barcode);
        
        if (variant) {
          // Variant found
          onProductFound(product, variant);
        } else if (product.barcode === barcode) {
          // Main product found
          onProductFound(product);
        } else {
          error('Ürün bulunamadı!');
        }
        
        // Clear input after processing
        setBarcodeInput('');
      } else {
        error('Ürün bulunamadı!');
      }
    }
  }, [findByBarcode, onProductFound, error]);

  // Auto-submit when Enter is pressed or barcode is complete
  useEffect(() => {
    if (barcodeInput.length >= 13) {
      // EAN-13 barcode complete
      handleBarcodeInput(barcodeInput);
    }
  }, [barcodeInput, handleBarcodeInput]);

  const clearBarcode = useCallback(() => {
    setBarcodeInput('');
  }, []);

  return {
    barcodeInput,
    setBarcodeInput,
    handleBarcodeInput,
    clearBarcode,
  };
};

