// Warehouse Selector Component
// Allows user to select active warehouse

import { useState, useEffect } from 'react';
import { Warehouse, Check, ChevronDown } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info'; // 🆕 IMPORT

interface WarehouseSelectorProps {
  darkMode: boolean;
  onWarehouseChange?: (warehouseId: string) => void;
}

interface WarehouseItem {
  id: string;
  code: string;
  name: string;
  city: string;
  is_main: boolean;
  wms_config: any[];
}

export function WarehouseSelector({ darkMode, onWarehouseChange }: WarehouseSelectorProps) {
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseItem | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadWarehouses();
  }, []);

  const loadWarehouses = async () => {
    try {
      const supabaseUrl = `https://${projectId}.supabase.co`;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/make-server-eae94dc0/wms/warehouses`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          }
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setWarehouses(result.data);

          // Auto-select first warehouse or main warehouse
          const savedId = localStorage.getItem('wms_warehouse_id');
          const savedWarehouse = result.data.find((w: WarehouseItem) => w.id === savedId);
          const mainWarehouse = result.data.find((w: WarehouseItem) => w.is_main);
          const firstWarehouse = result.data[0];

          const selected = savedWarehouse || mainWarehouse || firstWarehouse;
          if (selected) {
            selectWarehouse(selected);
          }
        }
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading warehouses:', error);
      setIsLoading(false);
    }
  };

  const selectWarehouse = (warehouse: WarehouseItem) => {
    setSelectedWarehouse(warehouse);
    localStorage.setItem('wms_warehouse_id', warehouse.id);
    setIsOpen(false);
    if (onWarehouseChange) {
      onWarehouseChange(warehouse.id);
    }
  };

  const bgClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const hoverClass = darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50';

  if (isLoading) {
    return (
      <div className={`${bgClass} border rounded-lg px-4 py-2 animate-pulse`}>
        <div className="h-6 w-32 bg-gray-300 dark:bg-gray-600 rounded" />
      </div>
    );
  }

  if (warehouses.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${bgClass} border rounded-lg px-4 py-2 flex items-center gap-3 ${hoverClass} transition-colors min-w-[200px]`}
      >
        <Warehouse className="w-5 h-5 text-blue-500" />
        <div className="flex-1 text-left">
          <p className={`text-sm font-semibold ${textClass}`}>
            {selectedWarehouse?.name || 'Depo Seçin'}
          </p>
          {selectedWarehouse?.city && (
            <p className="text-xs text-gray-500">{selectedWarehouse.city}</p>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className={`absolute top-full left-0 right-0 mt-2 ${bgClass} border rounded-lg shadow-xl z-20 max-h-80 overflow-y-auto`}>
            {warehouses.map((warehouse) => (
              <button
                key={warehouse.id}
                onClick={() => selectWarehouse(warehouse)}
                className={`w-full px-4 py-3 flex items-center gap-3 ${hoverClass} transition-colors border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'
                  } last:border-0`}
              >
                <Warehouse className={`w-5 h-5 ${warehouse.id === selectedWarehouse?.id ? 'text-blue-500' : 'text-gray-400'
                  }`} />
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${textClass}`}>{warehouse.name}</p>
                    {warehouse.is_main && (
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                        Merkez
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{warehouse.code} • {warehouse.city}</p>
                </div>
                {warehouse.id === selectedWarehouse?.id && (
                  <Check className="w-5 h-5 text-blue-500" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
