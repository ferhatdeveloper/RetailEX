// ğŸ§ª API Connection Test Component

import { useState } from 'react';
import { warehouseApi } from '../utils/api';
import { LoadingSpinner } from './Loading';

export function ApiTest() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testConnection = async () => {
    setTesting(true);
    setError(null);
    setResult(null);

    try {
      console.log('ğŸ” Testing API connection...');
      
      const response = await warehouseApi.list();
      console.log('ğŸ“¡ Response:', response);

      if (response.success) {
        setResult(response.data);
      } else {
        setError(response.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('❌ Test failed:', err);
      setError(err.message || 'Connection failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold mb-4">ğŸ§ª API Connection Test</h1>
          
          <button
            onClick={testConnection}
            disabled={testing}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {testing ? 'Testing...' : 'Test API Connection'}
          </button>

          {testing && (
            <div className="mt-6">
              <LoadingSpinner size="lg" message="Connecting to API..." />
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="text-red-800 font-semibold mb-2">❌ Error</h3>
              <pre className="text-sm text-red-600">{error}</pre>
            </div>
          )}

          {result && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-green-800 font-semibold mb-2">✅ Success</h3>
              <pre className="text-sm text-green-600 overflow-auto max-h-96">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-8 p-4 bg-gray-100 rounded-lg">
            <h3 className="font-semibold mb-2">ğŸ“ Expected Behavior:</h3>
            <ul className="text-sm space-y-1 text-gray-700">
              <li>✓ Should fetch list of warehouses</li>
              <li>✓ Should return stores with WMS config</li>
              <li>✓ Check browser console for detailed logs</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

