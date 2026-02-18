/**
 * Customer Display Screen (Müşteri Ekranı)
 * Pattern: E-commerce + Loyalty Integration
 * Features: Product display, cart, loyalty points, QR scan
 */

import { ShoppingCart, Heart, Star, Gift, QrCode, Package } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Customer } from '../../App';
import { formatCurrency } from '../../utils/formatNumber';

interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export function CustomerScreen() {
  const [cart, setCart] = useState<Product[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);

  // Simulated product rotation (for demo)
  useEffect(() => {
    const products: Product[] = [
      { id: '1', name: 'Premium Kahve 1kg', price: 450, image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400' },
      { id: '2', name: 'Organik Çay Seti', price: 280, image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400' },
      { id: '3', name: 'Özel Baharat Karışımı', price: 120, image: 'https://images.unsplash.com/photo-1596040033229-a0b676e5ab3f?w=400' }
    ];

    let index = 0;
    const interval = setInterval(() => {
      setCurrentProduct(products[index]);
      index = (index + 1) % products.length;
    }, 5000);

    setCurrentProduct(products[0]);

    return () => clearInterval(interval);
  }, []);

  // Listen for POS updates (via localStorage or WebSocket)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'customer_display_cart') {
        const newCart = e.newValue ? JSON.parse(e.newValue) : [];
        setCart(newCart);
      }

      if (e.key === 'customer_display_customer') {
        const newCustomer = e.newValue ? JSON.parse(e.newValue) : null;
        setCustomer(newCustomer);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Initial load
    const savedCart = localStorage.getItem('customer_display_cart');
    const savedCustomer = localStorage.getItem('customer_display_customer');

    if (savedCart) setCart(JSON.parse(savedCart));
    if (savedCustomer) setCustomer(JSON.parse(savedCustomer));

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = customer ? subtotal * (customer.discount_rate / 100) : 0;
  const total = subtotal - discount;

  // Points to earn
  const pointsToEarn = Math.floor(total);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600">
      <div className="h-screen flex flex-col">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl text-white mb-1">ExRetailOS</h1>
              <p className="text-white/80 text-sm">Alışverişinizin keyfini çıkarın</p>
            </div>

            <button
              onClick={() => setShowQRScanner(true)}
              className="bg-white text-purple-600 px-6 py-3 rounded-xl hover:bg-purple-50 transition-colors flex items-center gap-2 shadow-lg"
            >
              <QrCode className="w-6 h-6" />
              <span>QR Kod Okut, Puan Kazan!</span>
            </button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-6 p-6">
          {/* Left: Product showcase */}
          <div className="space-y-6">
            {/* Featured product */}
            {currentProduct && (
              <div className="bg-white rounded-3xl shadow-2xl overflow-hidden transform hover:scale-105 transition-transform">
                <div className="relative h-96">
                  <img
                    src={currentProduct.image}
                    alt={currentProduct.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-full shadow-lg">
                    ÖNERİLEN!
                  </div>
                </div>
                <div className="p-8">
                  <h3 className="text-2xl mb-3">{currentProduct.name}</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-4xl text-purple-600">{formatCurrency(currentProduct.price)}</span>
                    <button className="bg-purple-600 text-white px-6 py-3 rounded-xl hover:bg-purple-700 flex items-center gap-2">
                      <Heart className="w-5 h-5" />
                      Favorilere Ekle
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Loyalty info */}
            {customer ? (
              <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-3xl shadow-2xl p-8 text-white">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                    <Star className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="text-xl">Hoş Geldiniz</div>
                    <div className="text-3xl">{customer.name}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/20 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-sm mb-1">Puanınız</div>
                    <div className="text-3xl">{customer.points.toLocaleString()}</div>
                  </div>
                  <div className="bg-white/20 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-sm mb-1">Seviyeniz</div>
                    <div className="text-3xl">{customer.tier}</div>
                  </div>
                </div>

                {customer.discount_rate > 0 && (
                  <div className="mt-4 bg-white/20 rounded-xl p-4 text-center backdrop-blur-sm">
                    <div className="text-sm mb-1">İndiriminiz</div>
                    <div className="text-4xl">%{customer.discount_rate}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-2xl p-8 text-center">
                <QrCode className="w-20 h-20 mx-auto text-purple-600 mb-4" />
                <h3 className="text-2xl mb-3">Puan Kazanın!</h3>
                <p className="text-gray-600 mb-6">
                  QR kodunuzu okutarak puan kazanmaya başlayın ve indirimlerden yararlanın
                </p>
                <button
                  onClick={() => setShowQRScanner(true)}
                  className="bg-purple-600 text-white px-8 py-4 rounded-xl hover:bg-purple-700 text-lg"
                >
                  QR Kod Okut
                </button>
              </div>
            )}
          </div>

          {/* Right: Cart */}
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            {/* Cart header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="w-8 h-8" />
                  <div>
                    <div className="text-xl">Sepetiniz</div>
                    <div className="text-sm opacity-90">{cart.length} ürün</div>
                  </div>
                </div>
                {pointsToEarn > 0 && (
                  <div className="bg-white/20 px-4 py-2 rounded-full flex items-center gap-2">
                    <Gift className="w-5 h-5" />
                    <span>+{pointsToEarn} puan</span>
                  </div>
                )}
              </div>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {cart.length === 0 ? (
                <div className="text-center text-gray-400 py-12">
                  <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Sepetiniz boş</p>
                </div>
              ) : (
                cart.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 bg-gray-50 rounded-2xl p-4 border-2 border-purple-100"
                  >
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center">
                      <Package className="w-8 h-8 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <div className="text-lg mb-1">{item.name}</div>
                      <div className="text-sm text-gray-600">
                        {item.quantity} × {formatCurrency(item.price)}
                      </div>
                    </div>
                    <div className="text-2xl text-purple-600">
                      {formatCurrency(item.quantity * item.price)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart total */}
            {cart.length > 0 && (
              <div className="border-t-2 border-gray-200 p-6 space-y-3">
                <div className="flex justify-between text-lg">
                  <span>Ara Toplam</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-lg text-green-600">
                    <span>İndirim (%{customer?.discount_rate})</span>
                    <span>-{formatCurrency(discount)}</span>
                  </div>
                )}

                <div className="border-t-2 border-purple-200 pt-3 flex justify-between text-3xl text-purple-600">
                  <span>TOPLAM</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white/10 backdrop-blur-sm border-t border-white/20 p-4 text-center text-white text-sm">
          ExRetailOS • Müşteri Ekranı • Her 1 alışverişte 1 puan kazanın!
        </div>
      </div>

      {/* QR Scanner Modal - next component will handle this */}
      {showQRScanner && (
        <QRScannerModal
          onClose={() => setShowQRScanner(false)}
          onScan={(customerId) => {
            // Fetch customer and update
            const mockCustomer: Customer = {
              id: customerId,
              name: 'Değerli Müşteri',
              points: 5420,
              tier: 'GOLD',
              discount_rate: 10
            };

            setCustomer(mockCustomer);
            localStorage.setItem('customer_display_customer', JSON.stringify(mockCustomer));
            setShowQRScanner(false);

            toast.success(`Hoş geldiniz! ${mockCustomer.points} puanınız var`, {
              duration: 4000
            });
          }}
        />
      )}
    </div>
  );
}

// QR Scanner Modal Component
interface QRScannerModalProps {
  onClose: () => void;
  onScan: (customerId: string) => void;
}

function QRScannerModal({ onClose, onScan }: QRScannerModalProps) {
  const videoRef = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Initialize camera for QR scanning
    // Real implementation would use a QR scanner library
    // For demo, auto-trigger after 2 seconds
    const timer = setTimeout(() => {
      onScan('customer-123');
    }, 2000);

    return () => clearTimeout(timer);
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-3xl p-8 max-w-lg w-full mx-4">
        <div className="text-center mb-6">
          <QrCode className="w-20 h-20 mx-auto text-purple-600 mb-4" />
          <h2 className="text-2xl mb-2">QR Kod Okutun</h2>
          <p className="text-gray-600">Müşteri kartınızdaki QR kodu kameraya gösterin</p>
        </div>

        <div className="bg-gray-900 rounded-2xl aspect-square mb-6 flex items-center justify-center">
          <div className="border-4 border-purple-500 w-64 h-64 rounded-2xl animate-pulse"></div>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-gray-200 text-gray-700 py-3 rounded-xl hover:bg-gray-300 transition-colors"
        >
          İptal
        </button>
      </div>
    </div>
  );
}
