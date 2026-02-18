// Hierarchical tree view for unlimited stores with lazy loading

import { useState } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder,
  FolderOpen,
  Store as StoreIcon,
  MapPin,
  TrendingUp,
  Users,
  Loader2
} from 'lucide-react';
import { useInfiniteStores } from '../hooks/useInfiniteStores';
import { storeApiService, type SearchFilters } from '../../services/storeApiService';

interface TreeNode {
  id: string;
  label: string;
  type: 'region' | 'subRegion' | 'store';
  count?: number;
  isExpanded?: boolean;
  children?: TreeNode[];
}

interface HierarchicalStoreTreeProps {
  onStoreSelect?: (storeId: string) => void;
}

export function HierarchicalStoreTree({ onStoreSelect }: HierarchicalStoreTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
  const [storesByRegion, setStoresByRegion] = useState<Map<string, any[]>>(new Map());

  const regions = storeApiService.getRegions();
  
  // Calculate total stores dynamically
  const totalStores = regions.reduce((total, region) => {
    return total + (region.subRegions.length * 312); // ~312 stores per sub-region average
  }, 0);
  
  // Calculate stores per region
  const getRegionStoreCount = (region: any) => {
    return region.subRegions.length * 312; // ~312 stores per sub-region
  };

  const toggleNode = async (nodeId: string, type: 'region' | 'subRegion', regionName?: string, subRegionName?: string) => {
    const newExpanded = new Set(expandedNodes);
    
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
      setExpandedNodes(newExpanded);
    } else {
      newExpanded.add(nodeId);
      setExpandedNodes(newExpanded);

      // Lazy load stores when expanding sub-region
      if (type === 'subRegion' && !storesByRegion.has(nodeId)) {
        setLoadingNodes(new Set(loadingNodes).add(nodeId));
        
        try {
          const filters: SearchFilters = {
            region: regionName,
            subRegion: subRegionName
          };
          
          const response = await storeApiService.fetchStores(0, 20, filters);
          const newStoresMap = new Map(storesByRegion);
          newStoresMap.set(nodeId, response.data);
          setStoresByRegion(newStoresMap);
        } catch (error) {
          console.error('Failed to load stores:', error);
        } finally {
          const newLoading = new Set(loadingNodes);
          newLoading.delete(nodeId);
          setLoadingNodes(newLoading);
        }
      }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-blue-100">
        <div className="flex items-center gap-2">
          <Folder className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Hiyerarşik Mağaza Görünümü</h3>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          {regions.length} Bölge • Dinamik yükleme
        </p>
      </div>

      {/* Tree */}
      <div className="p-2 max-h-[600px] overflow-auto">
        {regions.map((region) => {
          const regionNodeId = `region-${region.id}`;
          const isRegionExpanded = expandedNodes.has(regionNodeId);

          return (
            <div key={region.id} className="mb-2">
              {/* Region Node */}
              <button
                onClick={() => toggleNode(regionNodeId, 'region')}
                className="w-full flex items-center gap-2 p-3 rounded-lg hover:bg-blue-50 transition-colors text-left group"
              >
                {isRegionExpanded ? (
                  <ChevronDown className="h-5 w-5 text-gray-600 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-600 flex-shrink-0" />
                )}
                {isRegionExpanded ? (
                  <FolderOpen className="h-5 w-5 text-blue-600 flex-shrink-0" />
                ) : (
                  <Folder className="h-5 w-5 text-blue-600 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{region.name}</div>
                  <div className="text-sm text-gray-600">
                    {region.subRegions.length} alt bölge
                  </div>
                </div>
              </button>

              {/* Sub-Regions */}
              {isRegionExpanded && (
                <div className="ml-7 mt-1 space-y-1">
                  {region.subRegions.map((subRegion) => {
                    const subRegionNodeId = `subregion-${region.id}-${subRegion}`;
                    const isSubRegionExpanded = expandedNodes.has(subRegionNodeId);
                    const isLoading = loadingNodes.has(subRegionNodeId);
                    const stores = storesByRegion.get(subRegionNodeId) || [];

                    return (
                      <div key={subRegion} className="mb-1">
                        {/* Sub-Region Node */}
                        <button
                          onClick={() => toggleNode(subRegionNodeId, 'subRegion', region.name, subRegion)}
                          className="w-full flex items-center gap-2 p-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 text-gray-400 flex-shrink-0 animate-spin" />
                          ) : isSubRegionExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-600 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-600 flex-shrink-0" />
                          )}
                          <MapPin className="h-4 w-4 text-gray-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-gray-800">{subRegion}</span>
                          </div>
                          {/* Store count removed - dynamic data will be shown when expanded */}
                        </button>

                        {/* Stores */}
                        {isSubRegionExpanded && !isLoading && (
                          <div className="ml-6 mt-1 space-y-1">
                            {stores.length === 0 ? (
                              <div className="p-2 text-sm text-gray-500 italic">
                                Mağaza yükleniyor...
                              </div>
                            ) : (
                              <>
                                {stores.map((store) => (
                                  <button
                                    key={store.id}
                                    onClick={() => onStoreSelect?.(store.id)}
                                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-green-50 transition-colors text-left group"
                                  >
                                    <div className="w-1 h-8 bg-green-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <StoreIcon className="h-4 w-4 text-green-600 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-gray-800 truncate">
                                        {store.name}
                                      </div>
                                      <div className="text-xs text-gray-600 flex items-center gap-2">
                                        <span className="font-mono">{store.code}</span>
                                        <span className="text-gray-400">•</span>
                                        <span>{store.manager}</span>
                                      </div>
                                    </div>
                                    <div className={`px-2 py-0.5 rounded-full text-xs ${
                                      store.status === 'active' ? 'bg-green-100 text-green-700' :
                                      store.status === 'maintenance' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {store.status === 'active' ? 'Aktif' :
                                       store.status === 'maintenance' ? 'Bakımda' :
                                       'Kapalı'}
                                    </div>
                                  </button>
                                ))}
                                {stores.length === 20 && (
                                  <div className="p-2 text-sm text-gray-500 italic text-center">
                                    İlk 20 mağaza gösteriliyor...
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
