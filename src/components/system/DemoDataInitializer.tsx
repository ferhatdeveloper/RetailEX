/**
 * ExRetailOS - Demo Data Initializer
 * 
 * Creates demo users and initial data for testing
 * @created 2024-12-24
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users, Database, CheckCircle2, AlertCircle } from 'lucide-react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

export function DemoDataInitializer() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const createDemoData = async () => {
    setLoading(true);
    try {
      console.log('[DemoData] Creating demo users...');
      
      // Create demo users
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/auth/create-demo-users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Demo data oluşturulamadı');
      }

      const data = await response.json();
      console.log('[DemoData] Created successfully:', data);

      setStatus('success');
      
      // Show success toast only in development
      if (import.meta.env.MODE === 'development') {
        toast.success('Demo data başarıyla oluşturuldu!', {
          description: '4 demo kullanıcı hazır: admin, muhasebe, kasiyer, depo'
        });
      }
      
      return true;
    } catch (error: any) {
      console.error('[DemoData] Error:', error);
      setStatus('error');
      
      // Show error toast only in development
      if (import.meta.env.MODE === 'development') {
        toast.error('Demo data oluşturulurken hata oluştu', {
          description: error.message
        });
      }
      
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Auto-create demo data on first load (ALWAYS run, not just in development)
  useEffect(() => {
    const hasCreatedDemo = sessionStorage.getItem('demo_data_initialized');
    if (!hasCreatedDemo) {
      console.log('[DemoData] First load detected, initializing demo users...');
      createDemoData().then((success) => {
        if (success) {
          sessionStorage.setItem('demo_data_initialized', 'true');
        }
      });
    }
  }, []);

  // Only show UI in development mode
  if (import.meta.env.MODE !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-sm">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <Database className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900">Demo Data</h4>
          <p className="text-xs text-gray-600 mt-1">
            Test için demo kullanıcılar oluştur
          </p>
          
          {status === 'success' && (
            <div className="mt-2 flex items-center gap-2 text-green-600 text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Demo data hazır!</span>
            </div>
          )}
          
          {status === 'error' && (
            <div className="mt-2 flex items-center gap-2 text-red-600 text-xs">
              <AlertCircle className="w-4 h-4" />
              <span>Hata oluştu</span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={createDemoData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white text-xs rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Oluşturuluyor...
                </>
              ) : (
                <>
                  <Users className="w-3 h-3" />
                  Demo Data Yenile
                </>
              )}
            </button>
            
            {status === 'success' && (
              <div className="text-xs text-gray-500">
                ✓ 4 kullanıcı
              </div>
            )}
          </div>

          {status === 'success' && (
            <div className="mt-3 p-2 bg-indigo-50 rounded text-xs">
              <div className="font-medium text-indigo-900 mb-1">Login bilgileri:</div>
              <div className="space-y-1 text-indigo-700 font-mono text-xs">
                <div>admin / admin123</div>
                <div>muhasebe / muhasebe123</div>
                <div>kasiyer / kasiyer123</div>
                <div>depo / depo123</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
