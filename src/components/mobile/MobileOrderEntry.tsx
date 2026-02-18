/**
 * Mobile Order Entry (Sahada Sipariş Alma)
 * Features: Product search, cart, customer selection, offline support
 */

import { useState } from 'react';
import { Search, ShoppingCart, Plus, Minus, Check, Camera } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface OrderItem {
  id: string;
  code: string;
  name: string;
  price: number;
  quantity: number;
  discount: number;
  tax: number;
}

export function MobileOrderEntry({ customerId }: { customerId: string }) {
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const addToCart = (product: any) => {
    const existing = cart.find(i => i.id === product.id);

    if (existing) {
      setCart(cart.map(i => 
        i.id === product.id 
          ? { ...i, quantity: i.quantity + 1 }
          : i
      ));
    } else {
      setCart([...cart, {
        id: product.id,
        code: product.code,
        name: product.name,
        price: product.price,
        quantity: 1,
        discount: 0,
        tax: 18
      }]);
    }

    toast.success(`${product.name} eklendi`);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const total = cart.reduce((sum, item) => 
    sum + (item.price * item.quantity * (1 - item.discount / 100) * (1 + item.tax / 100)), 
    0
  );

  const submitOrder = () => {
    if (cart.length === 0) {
      toast.error('Sepet boş');
      return;
    }

    // Save to local storage for sync
    const order = {
      id: `order-${Date.now()}`,
      customer_id: customerId,
      items: cart,
      total,
      created_at: new Date().toISOString(),
      synced: false
    };

    const pending = JSON.parse(localStorage.getItem('pending_orders') || '[]');
    pending.push(order);
    localStorage.setItem('pending_orders', JSON.stringify(pending));

    toast.success('Sipariş kaydedildi (senkronize edilecek)');
    setCart([]);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="bg-blue-600 text-white p-4">
        <h1 className="text-lg mb-2">Sipariş Al</h1>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Ürün ara..."
          className="w-full px-4 py-2 rounded-lg text-gray-900"
        />
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-2">
        {/* Mock products */}
        {['Ürün A', 'Ürün B', 'Ürün C'].map((name, i) => (
          <div key={i} className="bg-white p-3 rounded-lg flex items-center justify-between">
            <div>
              <div className="font-medium">{name}</div>
              <div className="text-sm text-gray-600">{(100 + i * 50)} TL</div>
            </div>
            <button
              onClick={() => addToCart({ id: `p${i}`, code: `P00${i}`, name, price: 100 + i * 50 })}
              className="bg-blue-600 text-white p-2 rounded-lg"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="bg-white border-t p-4">
          <div className="mb-3 space-y-2">
            {cart.map(item => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span>{item.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQuantity(item.id, -1)} className="p-1">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="p-1">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mb-3 text-lg">
            <span>Toplam</span>
            <span className="text-blue-600">{total.toFixed(2)} TL</span>
          </div>
          <button
            onClick={submitOrder}
            className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            Siparişi Kaydet
          </button>
        </div>
      )}
    </div>
  );
}

