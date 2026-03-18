import { useState } from 'react';
import { Printer, Search, X, Plus, Minus, Check, Grid3x3, Download } from 'lucide-react';
import type { Product } from '../../../App';
import type { Template } from '../../../core/types/templates';
import { useProductStore, useTemplateStore } from '../store';
import JsBarcode from 'jsbarcode';

interface BulkLabelPrintProps {
  onClose?: () => void;
}

interface PrintItem {
  product: Product;
  quantity: number;
}

export function BulkLabelPrint({ onClose }: BulkLabelPrintProps) {
  const products = useProductStore((state) => state.products);
  const { templates } = useTemplateStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [printItems, setPrintItems] = useState<PrintItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    templates.find(t => t.type === 'label' && t.isDefault) || templates.find(t => t.type === 'label') || null
  );
  const [showPreview, setShowPreview] = useState(false);
  
  const labelTemplates = templates.filter(t => t.type === 'label');
  
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.barcode.includes(searchQuery) ||
    product.category.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const addPrintItem = (product: Product, quantity: number = 1) => {
    const existing = printItems.find(item => item.product.id === product.id);
    
    if (existing) {
      setPrintItems(printItems.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + quantity }
          : item
      ));
    } else {
      setPrintItems([...printItems, { product, quantity }]);
    }
  };
  
  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setPrintItems(printItems.filter(item => item.product.id !== productId));
    } else {
      setPrintItems(printItems.map(item =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      ));
    }
  };
  
  const removePrintItem = (productId: string) => {
    setPrintItems(printItems.filter(item => item.product.id !== productId));
  };
  
  const clearAll = () => {
    setPrintItems([]);
  };
  
  const renderLabel = (product: Product) => {
    if (!selectedTemplate) return null;
    
    const mmToPx = (mm: number) => (mm * 96) / 25.4;
    
    const replaceFields = (text: string) => {
      return text
        .replace('{{productName}}', product.name)
        .replace('{{barcode}}', product.barcode)
        .replace('{{price}}', product.price.toFixed(2))
        .replace('{{category}}', product.category)
        .replace('{{stock}}', product.stock.toString())
        .replace('{{sku}}', product.id);
    };
    
    return (
      <div
        key={product.id}
        className="border border-gray-300 bg-white relative overflow-hidden print-page-break"
        style={{
          width: `${mmToPx(selectedTemplate.width)}px`,
          height: `${mmToPx(selectedTemplate.height)}px`,
          pageBreakAfter: 'always'
        }}
      >
        {selectedTemplate.elements.map(element => {
          if (element.type === 'text') {
            return (
              <div
                key={element.id}
                className="absolute"
                style={{
                  left: `${mmToPx(element.x)}px`,
                  top: `${mmToPx(element.y)}px`,
                  width: `${mmToPx(element.width)}px`,
                  height: `${mmToPx(element.height)}px`,
                  fontSize: `${element.fontSize}px`,
                  fontWeight: element.fontWeight,
                  textAlign: element.textAlign,
                  color: element.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {replaceFields(element.content || element.field || '')}
              </div>
            );
          }
          
          if (element.type === 'barcode') {
            const barcodeValue = element.field === '{{barcode}}' ? product.barcode : product.id;
            
            return (
              <div
                key={element.id}
                className="absolute"
                style={{
                  left: `${mmToPx(element.x)}px`,
                  top: `${mmToPx(element.y)}px`,
                  width: `${mmToPx(element.width)}px`,
                  height: `${mmToPx(element.height)}px`
                }}
              >
                <svg
                  id={`barcode-${product.id}-${element.id}`}
                  ref={(ref) => {
                    if (ref) {
                      try {
                        JsBarcode(ref, barcodeValue, {
                          format: 'EAN13',
                          width: 2,
                          height: mmToPx(element.height),
                          displayValue: false
                        });
                      } catch (error) {
                        console.error('Barcode error:', error);
                      }
                    }
                  }}
                />
              </div>
            );
          }
          
          if (element.type === 'box') {
            return (
              <div
                key={element.id}
                className="absolute"
                style={{
                  left: `${mmToPx(element.x)}px`,
                  top: `${mmToPx(element.y)}px`,
                  width: `${mmToPx(element.width)}px`,
                  height: `${mmToPx(element.height)}px`,
                  border: `${element.borderWidth}px solid ${element.borderColor}`,
                  backgroundColor: element.backgroundColor
                }}
              />
            );
          }
          
          if (element.type === 'line') {
            return (
              <div
                key={element.id}
                className="absolute"
                style={{
                  left: `${mmToPx(element.x)}px`,
                  top: `${mmToPx(element.y)}px`,
                  width: `${mmToPx(element.width)}px`,
                  height: `${element.borderWidth}px`,
                  backgroundColor: element.borderColor || '#000000'
                }}
              />
            );
          }
          
          return null;
        })}
      </div>
    );
  };
  
  const handlePrint = () => {
    setShowPreview(true);
    
    // Wait for render then print
    setTimeout(() => {
      window.print();
    }, 500);
  };
  
  const totalLabels = printItems.reduce((sum, item) => sum + item.quantity, 0);
  
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl">Toplu Etiket Yazdırma</h2>
            <p className="text-sm text-gray-600">
              {printItems.length} ürün, {totalLabels} etiket
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedTemplate?.id || ''}
              onChange={(e) => {
                const template = templates.find(t => t.id === e.target.value);
                setSelectedTemplate(template || null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              {labelTemplates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <button
              onClick={handlePrint}
              disabled={printItems.length === 0 || !selectedTemplate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Yazdır ({totalLabels})
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Product Selection */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Ürün ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => addPrintItem(product)}
                  className="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all text-left"
                >
                  <p className="text-sm truncate mb-1">{product.name}</p>
                  <p className="text-xs text-gray-600 mb-1">{product.barcode}</p>
                  <p className="text-sm text-blue-600">{product.price.toFixed(2)}</p>
                  <p className="text-xs text-gray-500">{product.category}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Print Queue */}
        <div className="w-96 bg-white border-l flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="text-sm">Yazdırma Kuyruğu</h3>
            <button
              onClick={clearAll}
              className="text-xs text-red-600 hover:text-red-700"
            >
              Tümünü Temizle
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {printItems.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Grid3x3 className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">Yazdırılacak ürün yok</p>
              </div>
            ) : (
              <div className="space-y-2">
                {printItems.map(item => (
                  <div key={item.product.id} className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm">{item.product.name}</p>
                        <p className="text-xs text-gray-600">{item.product.barcode}</p>
                      </div>
                      <button
                        onClick={() => removePrintItem(item.product.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="w-7 h-7 flex items-center justify-center bg-gray-200 rounded hover:bg-gray-300"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 0)}
                        className="w-16 text-center border border-gray-300 rounded"
                        min="1"
                      />
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="w-7 h-7 flex items-center justify-center bg-gray-200 rounded hover:bg-gray-300"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <span className="text-sm text-gray-600 ml-auto">etiket</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Print Preview (Hidden, only for printing) */}
      {showPreview && selectedTemplate && (
        <div className="fixed inset-0 bg-white z-50 overflow-auto print-only">
          <style>{`
            @media print {
              body { margin: 0; padding: 0; }
              .print-only { display: block !important; }
              .print-page-break { page-break-after: always; }
              @page { 
                size: ${selectedTemplate.width}mm ${selectedTemplate.height}mm;
                margin: 0;
              }
            }
            @media screen {
              .print-only { display: none; }
            }
          `}</style>
          
          <div className="p-4">
            {printItems.flatMap(item =>
              Array.from({ length: item.quantity }, (_, i) => (
                renderLabel(item.product)
              ))
            )}
          </div>
          
          <div className="fixed top-4 right-4 no-print">
            <button
              onClick={() => setShowPreview(false)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-lg hover:bg-gray-50"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

