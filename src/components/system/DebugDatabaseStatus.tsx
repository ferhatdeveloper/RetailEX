/**
 * Database Status Debug Component
 * Veritabanı durumunu ve demo verileri kontrol eder
 */

import { useState, useEffect } from 'react';
import { Database, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase, SUPABASE_CONFIGURED } from '../../utils/supabase/client';
import { useProductStore } from '../store';

export function DebugDatabaseStatus() {
  const [isOpen, setIsOpen] = useState(false);
  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    productCount: number;
    categoryCount: number;
    customerCount: number;
    saleCount: number;
    error?: string;
  }>({
    connected: false,
    productCount: 0,
    categoryCount: 0,
    customerCount: 0,
    saleCount: 0,
  });
  const [checking, setChecking] = useState(false);
  
  const products = useProductStore(state => state.products);

  const checkDatabase = async () => {
    setChecking(true);
    try {
      // Check products
      const { count: productCount, error: productError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      // Check categories
      const { count: categoryCount } = await supabase
        .from('categories')
        .select('*', { count: 'exact', head: true });

      // Check customers
      const { count: customerCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      // Check sales
      const { count: saleCount } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true });

      if (productError) {
        setDbStatus({
          connected: false,
          productCount: 0,
          categoryCount: 0,
          customerCount: 0,
          saleCount: 0,
          error: productError.message,
        });
      } else {
        setDbStatus({
          connected: true,
          productCount: productCount || 0,
          categoryCount: categoryCount || 0,
          customerCount: customerCount || 0,
          saleCount: saleCount || 0,
        });
      }
    } catch (error: any) {
      setDbStatus({
        connected: false,
        productCount: 0,
        categoryCount: 0,
        customerCount: 0,
        saleCount: 0,
        error: error.message,
      });
    }
    setChecking(false);
  };

  useEffect(() => {
    if (isOpen) {
      checkDatabase();
    }
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all"
        title="Veritabanı Durumu"
      >
        <Database className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white rounded-lg shadow-2xl border border-gray-200 w-96">
      <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          <h3 className="font-medium">Veritabanı Durumu</h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="hover:bg-white/10 p-1 rounded transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Supabase Configuration */}
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          {SUPABASE_CONFIGURED ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm">Supabase Yapılandırıldı</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-orange-500" />
              <span className="text-sm">Demo Mode (Supabase YOK)</span>
            </>
          )}
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          {dbStatus.connected ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm">Veritabanına Bağlı</span>
            </>
          ) : dbStatus.error ? (
            <>
              <XCircle className="w-5 h-5 text-red-600" />
              <span className="text-sm">Bağlantı Hatası</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-gray-400" />
              <span className="text-sm">Kontrol Ediliyor...</span>
            </>
          )}
        </div>

        {dbStatus.error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {dbStatus.error}
          </div>
        )}

        {/* Data Counts */}
        <div className="border-t pt-3 space-y-2">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Veritabanı Kayıtları</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between p-2 bg-blue-50 rounded">
              <span className="text-gray-600">Ürünler:</span>
              <span className="font-medium text-blue-700">{dbStatus.productCount}</span>
            </div>
            <div className="flex justify-between p-2 bg-purple-50 rounded">
              <span className="text-gray-600">Kategoriler:</span>
              <span className="font-medium text-purple-700">{dbStatus.categoryCount}</span>
            </div>
            <div className="flex justify-between p-2 bg-green-50 rounded">
              <span className="text-gray-600">Müşteriler:</span>
              <span className="font-medium text-green-700">{dbStatus.customerCount}</span>
            </div>
            <div className="flex justify-between p-2 bg-orange-50 rounded">
              <span className="text-gray-600">Satışlar:</span>
              <span className="font-medium text-orange-700">{dbStatus.saleCount}</span>
            </div>
          </div>
        </div>

        {/* Frontend Cache */}
        <div className="border-t pt-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Frontend Cache</h4>
          <div className="p-2 bg-gray-50 rounded text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Yüklü Ürünler:</span>
              <span className="font-medium">{products.length}</span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        {dbStatus.connected && dbStatus.productCount === 0 && (
          <div className="border-t pt-3">
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-xs">
              <div className="font-medium text-yellow-900 mb-2">⚠️ Demo Veriler Yüklenmedi</div>
              <div className="text-yellow-800 space-y-1">
                <p>1. Supabase Dashboard'a git</p>
                <p>2. SQL Editor'ü aç</p>
                <p>3. <code className="bg-yellow-200 px-1 rounded">ULTIMATE_MASTER_ALL_TABLES.sql</code> çalıştır</p>
                <p>4. <code className="bg-yellow-200 px-1 rounded">999_DEMO_SEED_DATA.sql</code> çalıştır</p>
                <p>5. Bu sayfayı yenile</p>
              </div>
            </div>
          </div>
        )}

        {dbStatus.connected && dbStatus.productCount > 0 && (
          <div className="border-t pt-3">
            <div className="p-3 bg-green-50 border border-green-200 rounded text-xs">
              <div className="font-medium text-green-900 mb-1">✅ Demo Veriler Başarıyla Yüklendi!</div>
              <div className="text-green-700">
                Sistemde {dbStatus.productCount} ürün, {dbStatus.customerCount} müşteri ve {dbStatus.saleCount} satış kaydı bulunuyor.
              </div>
            </div>
          </div>
        )}

        {/* Refresh Button */}
        <button
          onClick={checkDatabase}
          disabled={checking}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Kontrol Ediliyor...' : 'Yeniden Kontrol Et'}
        </button>
      </div>
    </div>
  );
}

