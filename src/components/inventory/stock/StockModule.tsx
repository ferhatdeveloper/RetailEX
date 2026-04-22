import { useState, useEffect } from 'react';
import { Package, TrendingDown, AlertTriangle, ArrowLeftRight, FileText, Download, Upload, Printer } from 'lucide-react';
import type { Product } from '../../../App';
import { formatNumber } from '../../../utils/formatNumber';
import { WarehouseTransferModule } from '../warehouse/WarehouseTransferModule';
import { stockMovementAPI } from '../../../services/stockMovementAPI';
import { WavePickingModule } from '../../wms/WavePickingModule';
import { useLanguage } from '../../../contexts/LanguageContext';

interface StockModuleProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
}

export function StockModule({ products, setProducts }: StockModuleProps) {
  const { tm } = useLanguage();
  const dateLocale = tm('localeCode');
  const [selectedTab, setSelectedTab] = useState<'overview' | 'movements' | 'count' | 'transfer' | 'picking'>('overview');
  const [showStockUpdateModal, setShowStockUpdateModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [updateQuantity, setUpdateQuantity] = useState(0);
  const [updateType, setUpdateType] = useState<'add' | 'subtract' | 'set'>('add');
  const [updateNote, setUpdateNote] = useState('');

  // Transfer states
  const [transferProduct, setTransferProduct] = useState<Product | null>(null);
  const [transferQuantity, setTransferQuantity] = useState(0);
  const [sourceStore, setSourceStore] = useState('store1');
  const [targetStore, setTargetStore] = useState('store2');
  const [transferNote, setTransferNote] = useState('');
  
  // Movement filtering states
  const [movementFilter, setMovementFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate stock statistics
  const totalItems = products.reduce((sum, p) => sum + p.stock, 0);
  const totalCostValue = products.reduce((sum, p) => sum + (p.stock * p.cost), 0);
  const totalSaleValue = products.reduce((sum, p) => sum + (p.stock * p.price), 0);
  const lowStockCount = products.filter(p => p.stock < 30).length;
  const criticalStockCount = products.filter(p => p.stock < 10).length;
  const outOfStockCount = products.filter(p => p.stock === 0).length;

  // Stock movements (mock data for demo)
  // Stock movements
  const [stockMovements, setStockMovements] = useState<any[]>([]);

  useEffect(() => {
    loadRecentMovements();
  }, []);

  const loadRecentMovements = async () => {
    try {
      const data = await stockMovementAPI.getAll();
      setStockMovements(data);
    } catch (error) {
      console.error('Error loading movements:', error);
    }
  };

  const handleStockUpdate = () => {
    if (!selectedProduct) return;

    const updatedProducts = products.map(p => {
      if (p.id === selectedProduct.id) {
        let newStock = p.stock;
        if (updateType === 'add') newStock += updateQuantity;
        else if (updateType === 'subtract') newStock -= updateQuantity;
        else newStock = updateQuantity;

        return { ...p, stock: Math.max(0, newStock) };
      }
      return p;
    });

    setProducts(updatedProducts);
    setShowStockUpdateModal(false);
    setSelectedProduct(null);
    setUpdateQuantity(0);
    setUpdateNote('');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            <h2 className="text-sm">{tm('invStockInventoryTitle')}</h2>
            <span className="text-orange-100 text-[10px] ml-2">
              {tm('invProductCountBadge').replace('{n}', String(totalItems))}
            </span>
          </div>
          <div className="flex gap-1.5">
            <button className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
              <Download className="w-3 h-3" />
              {tm('export')}
            </button>
            <button className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
              <Upload className="w-3 h-3" />
              {tm('import')}
            </button>
            <button className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
              <Printer className="w-3 h-3" />
              {tm('print')}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="flex gap-1 px-6">
          <button
            onClick={() => setSelectedTab('overview')}
            className={`px-6 py-3 border-b-2 transition-colors ${selectedTab === 'overview'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
          >
            {tm('stockStatus')}
          </button>
          <button
            onClick={() => setSelectedTab('movements')}
            className={`px-6 py-3 border-b-2 transition-colors ${selectedTab === 'movements'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
          >
            {tm('stockMovements')}
          </button>
          <button
            onClick={() => setSelectedTab('count')}
            className={`px-6 py-3 border-b-2 transition-colors ${selectedTab === 'count'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
          >
            {tm('invTabCountWaste')}
          </button>
          <button
            onClick={() => setSelectedTab('transfer')}
            className={`px-6 py-3 border-b-2 transition-colors ${selectedTab === 'transfer'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
          >
            {tm('invTabWarehouseTransferSingle')}
          </button>
          <button
            onClick={() => setSelectedTab('picking')}
            className={`px-6 py-3 border-b-2 transition-colors ${selectedTab === 'picking'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
          >
            {tm('invTabOrderPicking')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {selectedTab === 'overview' && (
          <>
            {/* Kurumsal Özet Panel */}
            <div className="bg-white border border-gray-300 rounded mb-3">
              <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
                <h3 className="text-[11px] text-gray-700">{tm('invStockSummaryTitle')}</h3>
              </div>
              <div className="grid grid-cols-4 divide-x divide-gray-200">
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span className="text-[10px] text-gray-600">{tm('invTotalStockQty')}</span>
                  </div>
                  <div className="text-base text-gray-900">{formatNumber(totalItems, 0, false)}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">
                    {tm('invDistinctProducts').replace('{n}', String(products.length))}
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-4 h-4 text-green-600" />
                    <span className="text-[10px] text-gray-600">{tm('invTotalInventoryPurchase')}</span>
                  </div>
                  <div className="text-base text-green-600">{formatNumber(totalCostValue, 0, false)} IQD</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">{tm('invCostBased')}</div>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-purple-600" />
                    <span className="text-[10px] text-gray-600">{tm('invLowStock')}</span>
                  </div>
                  <div className="text-base text-purple-600">{lowStockCount}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">{tm('invLowStockHint')}</div>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowLeftRight className="w-4 h-4 text-red-600" />
                    <span className="text-[10px] text-gray-600">{tm('invCriticalStock')}</span>
                  </div>
                  <div className="text-base text-red-600">{criticalStockCount}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">{tm('invCriticalUrgentOrder')}</div>
                </div>
              </div>
            </div>

            {/* Stock Status Table - Minimal */}
            <div className="bg-white border border-gray-300">
              <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
                <h3 className="text-[11px] text-gray-700">{tm('invDetailedStockStatus')}</h3>
              </div>
              <div className="overflow-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#E3F2FD] border-b border-gray-300">
                      <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">{tm('invThProductCode')}</th>
                      <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">{tm('invThProductName')}</th>
                      <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">{tm('invThCategory')}</th>
                      <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">{tm('invThCurrentStock')}</th>
                      <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">{tm('invThUnitCost')}</th>
                      <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">{tm('invThStockValue')}</th>
                      <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">{tm('invThStatus')}</th>
                      <th className="px-2 py-1 text-center text-[10px] text-gray-700">{tm('invThAction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(product => {
                      const stockValue = product.stock * product.cost;
                      let statusColor = 'bg-green-100 text-green-700';
                      let statusText = tm('invStatusNormal');

                      if (product.stock === 0) {
                        statusColor = 'bg-gray-100 text-gray-700';
                        statusText = tm('invStatusDepleted');
                      } else if (product.stock < 10) {
                        statusColor = 'bg-red-100 text-red-700';
                        statusText = tm('invStatusCritical');
                      } else if (product.stock < 30) {
                        statusColor = 'bg-yellow-100 text-yellow-700';
                        statusText = tm('invStatusLow');
                      }

                      return (
                        <tr key={product.id} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">{product.barcode}</td>
                          <td className="px-2 py-0.5 border-r border-gray-200">
                            <div>
                              <p className="text-[10px]">{product.name}</p>
                              <p className="text-[9px] text-gray-500">{product.barcode}</p>
                            </div>
                          </td>
                          <td className="px-2 py-0.5 border-r border-gray-200">
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                              {product.category}
                            </span>
                          </td>
                          <td className="px-2 py-0.5 text-center border-r border-gray-200">
                            <span className="text-lg">{product.stock}</span>
                            <span className="text-xs text-gray-500 ml-1">{product.unit}</span>
                          </td>
                          <td className="px-2 py-0.5 text-right border-r border-gray-200 text-gray-700">{formatNumber(product.cost, 2, false)} IQD</td>
                          <td className="px-2 py-0.5 text-right border-r border-gray-200 text-blue-600">{formatNumber(stockValue, 2, false)} IQD</td>
                          <td className="px-2 py-0.5 text-center border-r border-gray-200">
                            <span className={`px-3 py-1 text-xs rounded-full ${statusColor}`}>
                              {statusText}
                            </span>
                          </td>
                          <td className="px-2 py-0.5 text-center">
                            <button
                              onClick={() => {
                                setSelectedProduct(product);
                                setShowStockUpdateModal(true);
                              }}
                              className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 text-xs"
                            >
                              {tm('update')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h4 className="text-sm text-gray-600 mb-4">{tm('invValueSummaryTitle')}</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">{tm('invCostValueLbl')}</span>
                    <span className="text-blue-600">{formatNumber(totalCostValue, 2, false)} IQD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">{tm('invSaleValueLbl')}</span>
                    <span className="text-green-600">{formatNumber(totalSaleValue, 2, false)} IQD</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm">{tm('invPotentialProfitLbl')}</span>
                    <span className="text-purple-600">{formatNumber(totalSaleValue - totalCostValue, 2, false)} IQD</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h4 className="text-sm text-gray-600 mb-4">{tm('invDistributionTitle')}</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">{tm('invNormalStockLbl')}</span>
                    <span className="text-green-600">
                      {tm('invProductsCount').replace('{n}', String(products.filter(p => p.stock >= 30).length))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">{tm('invLowStockLbl')}</span>
                    <span className="text-yellow-600">{tm('invProductsCount').replace('{n}', String(lowStockCount))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">{tm('invCriticalStockLbl')}</span>
                    <span className="text-red-600">{tm('invProductsCount').replace('{n}', String(criticalStockCount))}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm">{tm('invDepletedLbl')}</span>
                    <span className="text-gray-600">{tm('invProductsCount').replace('{n}', String(outOfStockCount))}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h4 className="text-sm text-gray-600 mb-4">{tm('invCategoryDistTitle')}</h4>
                <div className="space-y-3">
                  {Array.from(new Set(products.map(p => p.category))).slice(0, 4).map((category, index) => {
                    const categoryProducts = products.filter(p => p.category === category);
                    const categoryStock = categoryProducts.reduce((sum, p) => sum + p.stock, 0);
                    return (
                      <div key={`category-${category}-${index}`} className="flex justify-between">
                        <span className="text-sm text-gray-600">{category}:</span>
                        <span className="text-sm text-gray-600">
                          {tm('invProductsCount').replace('{n}', String(categoryStock))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {selectedTab === 'movements' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-xl">{tm('stockMovements')}</h3>
                <p className="text-sm text-gray-600 mt-1">{tm('invMovementsSubtitle')}</p>
              </div>
              <div className="flex gap-2">
                <select 
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-orange-500 outline-none"
                  value={movementFilter}
                  onChange={(e) => setMovementFilter(e.target.value)}
                >
                  <option value="all">{tm('invMovFilterAll')}</option>
                  <option value="in">{tm('invMovFilterIn')}</option>
                  <option value="out">{tm('invMovFilterOut')}</option>
                  <option value="transfer">{tm('invMovFilterTransfer')}</option>
                </select>
                <input 
                  type="text" 
                  placeholder={tm('invMovSearchPlaceholder')}
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-orange-500 outline-none w-64"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="bg-[#f8fafc] border-b-2 border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-700">{tm('invThDocumentNo')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-700">{tm('invThDateTime')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-700">{tm('invThProduct')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-700">{tm('invThType')}</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-700">{tm('invThQty')}</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-700">{tm('invThPrice')}</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-700">{tm('invThCost')}</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-700">{tm('invThProfit')}</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-700">{tm('invThFx')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-700">{tm('invThNotes')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {stockMovements
                    .filter(item => {
                      const m = item.movement || item;
                      if (movementFilter !== 'all' && m.movement_type !== movementFilter) return false;
                      if (!searchQuery) return true;
                      const q = searchQuery.toLowerCase();
                      const p = item.product_name || '';
                      const doc = m.document_no || '';
                      return p.toLowerCase().includes(q) || doc.toLowerCase().includes(q);
                    })
                    .map((item: any) => {
                      const movement = item.movement || item;
                      const isIncoming = movement.movement_type === 'in';
                      const isOutgoing = movement.movement_type === 'out';
                      
                      const qty = Number(item.quantity) || 0;
                      const price = Number(item.unit_price) || 0;
                      const cost = Number(item.cost_price) || 0;
                      const profit = isOutgoing ? (price - cost) * qty : 0;
                      const rate = Number(movement.exchange_rate) || Number(item.exchange_rate) || 1;

                      return (
                        <tr key={item.id} className="hover:bg-[#f1f5f9] transition-colors border-b border-gray-100">
                          <td className="px-4 py-2 text-[11px] font-medium text-blue-700">{movement.document_no || '-'}</td>
                          <td className="px-4 py-2 text-[11px] text-gray-500">
                            {movement.movement_date ? new Date(movement.movement_date).toLocaleString(dateLocale) : '-'}
                          </td>
                          <td className="px-4 py-2 text-[11px]">
                            <span className="font-semibold block">{item.product_name || tm('invUnknownProduct')}</span>
                            <span className="text-[10px] text-gray-400">{item.product_code}</span>
                          </td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${isIncoming ? 'bg-green-100 text-green-700' :
                              isOutgoing ? 'bg-red-100 text-red-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                              {isIncoming ? tm('invMovTypeIn') : isOutgoing ? tm('invMovTypeOut') : movement.movement_type}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-[11px] font-bold">
                            <span className={qty > 0 ? 'text-green-600' : 'text-red-600'}>
                              {qty > 0 ? '+' : ''}{formatNumber(qty, 0, false)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-[11px]">{formatNumber(price, 2, false)}</td>
                          <td className="px-4 py-2 text-right text-[11px] text-gray-500 italic">{formatNumber(cost, 2, false)}</td>
                          <td className="px-4 py-2 text-right text-[11px] font-bold text-purple-600">
                            {profit !== 0 ? formatNumber(profit, 2, false) : '-'}
                          </td>
                          <td className="px-4 py-2 text-center text-[11px] text-orange-600 font-mono">
                            {rate > 1 ? `x${rate}` : '-'}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-gray-500 truncate max-w-[150px]">{item.notes || movement.description || '-'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedTab === 'count' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl">{tm('invCountTabTitle')}</h3>
              <p className="text-sm text-gray-600 mt-1">{tm('invCountTabSubtitle')}</p>
            </div>
            <div className="p-6">
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">{tm('invCountComingSoon')}</p>
                <p className="text-sm text-gray-500 mt-2">{tm('invCountInDev')}</p>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'transfer' && (
          <WarehouseTransferModule />
        )}

        {selectedTab === 'picking' && (
          <div className="h-[600px] border rounded-xl overflow-hidden shadow-inner bg-gray-100">
            <WavePickingModule />
          </div>
        )}
      </div>

      {/* Stock Update Modal */}
      {showStockUpdateModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="p-6 border-b bg-gradient-to-r from-orange-600 to-orange-700 text-white">
              <h3 className="text-xl">{tm('invUpdateStockTitle')}</h3>
              <p className="text-sm text-orange-100 mt-1">{selectedProduct?.name}</p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">{tm('invCurrentStockLbl')}</label>
                <p className="text-2xl text-blue-600">{selectedProduct?.stock} {selectedProduct?.unit}</p>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">{tm('invOpTypeLbl')}</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setUpdateType('add')}
                    className={`px-4 py-2 rounded-lg border-2 transition-colors ${updateType === 'add'
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-gray-300 hover:border-green-600'
                      }`}
                  >
                    {tm('invOpAdd')}
                  </button>
                  <button
                    onClick={() => setUpdateType('subtract')}
                    className={`px-4 py-2 rounded-lg border-2 transition-colors ${updateType === 'subtract'
                      ? 'border-red-600 bg-red-50 text-red-700'
                      : 'border-gray-300 hover:border-red-600'
                      }`}
                  >
                    {tm('invOpSubtract')}
                  </button>
                  <button
                    onClick={() => setUpdateType('set')}
                    className={`px-4 py-2 rounded-lg border-2 transition-colors ${updateType === 'set'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-blue-600'
                      }`}
                  >
                    {tm('invOpSet')}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">{tm('invQtyLbl')}</label>
                <input
                  type="number"
                  value={updateQuantity}
                  onChange={(e) => setUpdateQuantity(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">{tm('invNotesLbl')}</label>
                <textarea
                  value={updateNote}
                  onChange={(e) => setUpdateNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder={tm('invNotesPlaceholder')}
                />
              </div>

              {updateQuantity > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-gray-700">
                    {tm('invNewStockPreview')}{' '}
                    <span className="text-blue-600">
                      {updateType === 'add'
                        ? (selectedProduct?.stock || 0) + updateQuantity
                        : updateType === 'subtract'
                          ? Math.max(0, (selectedProduct?.stock || 0) - updateQuantity)
                          : updateQuantity
                      } {selectedProduct?.unit}
                    </span>
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 pt-0 flex gap-3">
              <button
                onClick={handleStockUpdate}
                disabled={updateQuantity <= 0}
                className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {tm('update')}
              </button>
              <button
                onClick={() => {
                  setShowStockUpdateModal(false);
                  setSelectedProduct(null);
                  setUpdateQuantity(0);
                  setUpdateNote('');
                }}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {tm('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
