// Cart Hook - POS Feature
import { useState, useCallback } from 'react';
import type { CartItem, Product, ProductVariant } from '../../../core/types';
import { calculateItemSubtotal, calculateCartSubtotal, calculateCartTotalDiscount, calculateCartTotal } from '../../../shared/utils';
import { useNotification } from '../../../shared/hooks';

export const useCart = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const { success, error } = useNotification();

  const addToCart = useCallback((product: Product, variant?: ProductVariant) => {
    setCart((prevCart) => {
      const existingItemIndex = prevCart.findIndex(
        (item) =>
          item.product.id === product.id &&
          item.variant?.id === variant?.id
      );

      if (existingItemIndex > -1) {
        // Update quantity if item already in cart
        const updatedCart = [...prevCart];
        const item = updatedCart[existingItemIndex];
        const newQuantity = item.quantity + 1;
        
        // Check stock
        const availableStock = variant ? variant.stock : product.stock;
        if (newQuantity > availableStock) {
          error('Yetersiz stok!');
          return prevCart;
        }

        item.quantity = newQuantity;
        item.subtotal = calculateItemSubtotal(item.quantity, item.product.price) - item.discount;
        
        success(`${product.name} miktarı artırıldı`);
        return updatedCart;
      } else {
        // Add new item to cart
        const newItem: CartItem = {
          product,
          quantity: 1,
          discount: 0,
          subtotal: product.price,
          variant,
        };
        
        success(`${product.name} sepete eklendi`);
        return [...prevCart, newItem];
      }
    });
  }, [success, error]);

  const removeFromCart = useCallback((index: number) => {
    setCart((prevCart) => {
      const item = prevCart[index];
      success(`${item.product.name} sepetten çıkarıldı`);
      return prevCart.filter((_, i) => i !== index);
    });
  }, [success]);

  const updateQuantity = useCallback((index: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(index);
      return;
    }

    setCart((prevCart) => {
      const updatedCart = [...prevCart];
      const item = updatedCart[index];
      
      // Check stock
      const availableStock = item.variant ? item.variant.stock : item.product.stock;
      if (quantity > availableStock) {
        error('Yetersiz stok!');
        return prevCart;
      }

      item.quantity = quantity;
      item.subtotal = calculateItemSubtotal(quantity, item.product.price) - item.discount;
      return updatedCart;
    });
  }, [removeFromCart, error]);

  const updateDiscount = useCallback((index: number, discount: number) => {
    setCart((prevCart) => {
      const updatedCart = [...prevCart];
      const item = updatedCart[index];
      const itemSubtotal = calculateItemSubtotal(item.quantity, item.product.price);
      
      if (discount > itemSubtotal) {
        error('İndirim tutarı ürün fiyatından fazla olamaz!');
        return prevCart;
      }

      item.discount = discount;
      item.subtotal = itemSubtotal - discount;
      return updatedCart;
    });
  }, [error]);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const getCartSummary = useCallback(() => {
    const subtotal = calculateCartSubtotal(cart);
    const totalDiscount = calculateCartTotalDiscount(cart);
    const total = calculateCartTotal(cart);

    return {
      subtotal,
      totalDiscount,
      total,
      itemCount: cart.length,
      totalQuantity: cart.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, [cart]);

  return {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateDiscount,
    clearCart,
    getCartSummary,
  };
};

