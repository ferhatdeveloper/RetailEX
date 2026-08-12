// 📏 Shelf Space Management - Raf Alanı Yönetimi
// Brand-based shelf allocation and capacity planning

import { useState, useEffect } from 'react';
import {
  Grid3x3, Package, TrendingUp, Maximize2, AlertCircle,
  Edit, Save, X, Plus, BarChart3, Layers, Box
} from 'lucide-react';

interface ShelfSpaceManagementProps {
  darkMode: boolean;
  onBack: () => void;
}

interface ShelfAllocation {
  id: string;
  product_id: string;
  product_name: string;
  brand: string;
  category: string;
  current_stock: number;
  allocated_space_m2: number;
  used_space_m2: number;
  space_utilization: number;
  shelf_location: string;
  can_expand: boolean;
  alternative_brands_count: number;
}

interface Brand {
  name: string;
  total_space_m2: number;
  product_count: number;
  utilization_avg: number;
}

export function ShelfSpaceManagement({ darkMode, onBack }: ShelfSpaceManagementProps) {
  const [allocations, setAllocations] = useState<ShelfAllocation[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [isEditing, setIsEditing] = useState(false);

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const inputClass = darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900';

  useEffect(() => {
    loadShelfAllocations();
    loadBrandSummary();
  }, []);

  const loadShelfAllocations = async () => {
    // Mock data
    const mockAllocations: ShelfAllocation[] = [
      {
        id: '1',
        product_id: 'P1',
        product_name: 'Zeytinyağı Premium',
        brand: 'Komili',
        category: 'Yağlar',
        current_stock: 145,
        allocated_space_m2: 3.5,
        used_space_m2: 3.2,
        space_utilization: 91.4,
        shelf_location: 'A-12-03',
        can_expand: true,
        alternative_brands_count: 3
      },
      {
        id: '2',
        product_id: 'P2',
        product_name: 'Zeytinyağı Klasik',
        brand: 'Kristal',
        category: 'Yağlar',
        current_stock: 98,
        allocated_space_m2: 2.8,
        used_space_m2: 2.8,
        space_utilization: 100,
        shelf_location: 'A-12-04',
        can_expand: false,
        alternative_brands_count: 2
      },
      {
        id: '3',
        product_id: 'P3',
        product_name: 'Un 1kg',
        brand: 'Söke',
        category: 'Unlar',
        current_stock: 320,
        allocated_space_m2: 5.2,
        used_space_m2: 4.1,
        space_utilization: 78.8,
        shelf_location: 'B-05-01',
        can_expand: true,
        alternative_brands_count: 4
      },
    ];
    setAllocations(mockAllocations);
  };

  const loadBrandSummary = async () => {
    // Mock data
    const mockBrands: Brand[] = [
      { name: 'Komili', total_space_m2: 12.5, product_count: 8, utilization_avg: 87.3 },
      { name: 'Kristal', total_space_m2: 8.2, product_count: 5, utilization_avg: 95.1 },
      { name: 'Söke', total_space_m2: 15.8, product_count: 12, utilization_avg: 76.4 },
      { name: 'Pınar', total_space_m2: 10.3, product_count: 7, utilization_avg: 88.9 },
    ];
    setBrands(mockBrands);
  };

  const expandShelfSpace = (allocationId: string, additionalSpace: number) => {
    setAllocations(allocations.map(a =>
      a.id === allocationId
        ? {
          ...a,
          allocated_space_m2: a.allocated_space_m2 + additionalSpace,
          space_utilization: (a.used_space_m2 / (a.allocated_space_m2 + additionalSpace)) * 100
        }
        : a
    ));
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 95) return 'text-red-600';
    if (utilization >= 80) return 'text-orange-600';
    if (utilization >= 60) return 'text-green-600';
    return 'text-blue-600';
  };

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      {/* Header */}
      <div className="mb-6">
        <button onClick={onBack} className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600">
          ← Geri
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-3xl font-bold ${textClass} mb-2 flex items-center gap-3`}>
              <Grid3x3 className="w-8 h-8 text-blue-500" />
              Raf Alanı Yönetimi
            </h1>
            <p className="text-gray-500">Marka bazında raf tahsisi ve alan optimizasyonu</p>
          </div>
        </div>
      </div>

      {/* Brand Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {brands.map((brand) => (
          <button
            key={brand.name}
            onClick={() => setSelectedBrand(brand.name)}
            className={`${cardClass} border-2 rounded-xl p-4 text-left transition-all ${selectedBrand === brand.name ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
          >
            <div className={`text-lg font-bold ${textClass} mb-2`}>{brand.name}</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Toplam Alan:</span>
                <span className={textClass}>{brand.total_space_m2.toFixed(1)} m²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ürün Sayısı:</span>
                <span className={textClass}>{brand.product_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Doluluk:</span>
                <span className={getUtilizationColor(brand.utilization_avg)}>
                  {brand.utilization_avg.toFixed(1)}%
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Allocations Table */}
      <div className={`${cardClass} border rounded-xl overflow-hidden`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className={`text-lg font-bold ${textClass}`}>Raf Tahsisleri</h3>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${isEditing
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
            >
              {isEditing ? <Save className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
              {isEditing ? 'Kaydet' : 'Düzenle'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ürün</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marka</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Konum</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stok</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tahsisli Alan</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Kullanılan</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Doluluk</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {allocations
                .filter(a => selectedBrand === 'all' || a.brand === selectedBrand)
                .map((allocation) => (
                  <tr key={allocation.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-4">
                      <div className={`font-medium ${textClass}`}>{allocation.product_name}</div>
                      <div className="text-xs text-gray-500">{allocation.category}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`font-medium ${textClass}`}>{allocation.brand}</span>
                      {allocation.alternative_brands_count > 0 && (
                        <div className="text-xs text-gray-500">+{allocation.alternative_brands_count} alternatif</div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="font-mono text-sm">{allocation.shelf_location}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-bold ${textClass}`}>{allocation.current_stock}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {isEditing ? (
                        <input
                          type="number"
                          value={allocation.allocated_space_m2}
                          onChange={(e) => {
                            const newValue = parseFloat(e.target.value);
                            setAllocations(allocations.map(a =>
                              a.id === allocation.id
                                ? { ...a, allocated_space_m2: newValue, space_utilization: (a.used_space_m2 / newValue) * 100 }
                                : a
                            ));
                          }}
                          className={`w-20 px-2 py-1 rounded border text-center ${inputClass}`}
                          step="0.1"
                        />
                      ) : (
                        <span className={textClass}>{allocation.allocated_space_m2.toFixed(1)} m²</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm">{allocation.used_space_m2.toFixed(1)} m²</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-lg font-bold ${getUtilizationColor(allocation.space_utilization)}`}>
                          {allocation.space_utilization.toFixed(1)}%
                        </span>
                        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${allocation.space_utilization >= 95 ? 'bg-red-500' :
                              allocation.space_utilization >= 80 ? 'bg-orange-500' :
                                'bg-green-500'
                              }`}
                            style={{ width: `${Math.min(allocation.space_utilization, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {allocation.can_expand && (
                        <button
                          onClick={() => {
                            const additional = window.prompt('Ek alan (m²):', '0.5');
                            if (additional) {
                              expandShelfSpace(allocation.id, parseFloat(additional));
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs mx-auto"
                        >
                          <Maximize2 className="w-3 h-3" />
                          Genişlet
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alerts */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${cardClass} border-l-4 border-red-500 rounded-xl p-4`}>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <div className={`font-bold ${textClass} mb-1`}>Kapasite Uyarısı</div>
              <div className="text-sm text-gray-500">
                {allocations.filter(a => a.space_utilization >= 95).length} ürün %95+ dolu
              </div>
            </div>
          </div>
        </div>

        <div className={`${cardClass} border-l-4 border-green-500 rounded-xl p-4`}>
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div>
              <div className={`font-bold ${textClass} mb-1`}>Genişleme Fırsatı</div>
              <div className="text-sm text-gray-500">
                {allocations.filter(a => a.can_expand).length} ürün alan genişletebilir
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

