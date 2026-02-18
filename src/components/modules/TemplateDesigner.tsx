import { useState, useRef, useEffect } from 'react';
import { 
  Save, Download, Upload, Copy, Trash2, Eye, Settings, Plus,
  Type, Image, Maximize2, Minus, BarChart3, Grid3x3, AlignLeft,
  AlignCenter, AlignRight, Bold, Move, ZoomIn, ZoomOut
} from 'lucide-react';
import type { Template, TemplateElement, TemplateFormat } from '../../core/types/templates';
import { TEMPLATE_FORMATS, INVOICE_FIELDS, LABEL_FIELDS } from '../../core/types/templates';
import { useTemplateStore } from '../../store/useTemplateStore';

interface TemplateDesignerProps {
  type: 'invoice' | 'label';
  onClose?: () => void;
}

export function TemplateDesigner({ type, onClose }: TemplateDesignerProps) {
  const { templates, activeTemplate, setActiveTemplate, updateTemplate, addTemplate } = useTemplateStore();
  
  const [selectedElement, setSelectedElement] = useState<TemplateElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Load active template or create new
  useEffect(() => {
    if (!activeTemplate) {
      const defaultTemplate = templates.find(t => t.type === type && t.isDefault);
      if (defaultTemplate) {
        setActiveTemplate({ ...defaultTemplate });
      }
    }
  }, [type]);
  
  if (!activeTemplate) {
    return <div className="p-6">Yükleniyor...</div>;
  }
  
  const addElement = (elementType: TemplateElement['type']) => {
    const newElement: TemplateElement = {
      id: `element-${Date.now()}`,
      type: elementType,
      x: 20,
      y: 20,
      width: elementType === 'barcode' ? 40 : 60,
      height: elementType === 'barcode' ? 15 : elementType === 'line' ? 1 : 20,
      content: elementType === 'text' ? 'Yeni metin' : '',
      fontSize: 12,
      fontWeight: 'normal',
      textAlign: 'left',
      color: '#000000',
      borderWidth: elementType === 'box' ? 1 : 0,
      borderColor: '#000000'
    };
    
    updateTemplate(activeTemplate.id, {
      elements: [...activeTemplate.elements, newElement]
    });
  };
  
  const deleteElement = (id: string) => {
    updateTemplate(activeTemplate.id, {
      elements: activeTemplate.elements.filter(e => e.id !== id)
    });
    setSelectedElement(null);
  };
  
  const updateElement = (id: string, updates: Partial<TemplateElement>) => {
    updateTemplate(activeTemplate.id, {
      elements: activeTemplate.elements.map(e => 
        e.id === id ? { ...e, ...updates } : e
      )
    });
    
    if (selectedElement?.id === id) {
      setSelectedElement({ ...selectedElement, ...updates });
    }
  };
  
  const handleMouseDown = (e: React.MouseEvent, element: TemplateElement) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setSelectedElement(element);
    setDragStart({
      x: e.clientX - element.x * zoom,
      y: e.clientY - element.y * zoom
    });
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedElement) return;
    
    const newX = (e.clientX - dragStart.x) / zoom;
    const newY = (e.clientY - dragStart.y) / zoom;
    
    updateElement(selectedElement.id, {
      x: Math.max(0, Math.min(newX, activeTemplate.width - selectedElement.width)),
      y: Math.max(0, Math.min(newY, activeTemplate.height - selectedElement.height))
    });
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  const saveTemplate = () => {
    updateTemplate(activeTemplate.id, activeTemplate);
    alert('Şablon kaydedildi!');
  };
  
  const exportTemplate = () => {
    const json = JSON.stringify(activeTemplate, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTemplate.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const availableFields = type === 'invoice' ? INVOICE_FIELDS : LABEL_FIELDS;
  
  // Convert mm to pixels (assuming 96 DPI)
  const mmToPx = (mm: number) => (mm * 96) / 25.4;
  
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl">{type === 'invoice' ? 'Fatura' : 'Etiket'} Tasarım Editörü</h2>
            <p className="text-sm text-gray-600">{activeTemplate.name} - {TEMPLATE_FORMATS[activeTemplate.format].name}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-600">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.1))}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`px-3 py-2 border rounded-lg ${showGrid ? 'bg-blue-50 border-blue-500' : 'border-gray-300 hover:bg-gray-50'}`}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              onClick={saveTemplate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Kaydet
            </button>
            <button
              onClick={exportTemplate}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Dışa Aktar
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Kapat
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Toolbar */}
        <div className="w-64 bg-white border-r overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm mb-3">Öğe Ekle</h3>
            <div className="space-y-2">
              <button
                onClick={() => addElement('text')}
                className="w-full flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Type className="w-4 h-4" />
                Metin
              </button>
              <button
                onClick={() => addElement('image')}
                className="w-full flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Image className="w-4 h-4" />
                Resim
              </button>
              <button
                onClick={() => addElement('barcode')}
                className="w-full flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <BarChart3 className="w-4 h-4" />
                Barkod
              </button>
              <button
                onClick={() => addElement('line')}
                className="w-full flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Minus className="w-4 h-4" />
                Çizgi
              </button>
              <button
                onClick={() => addElement('box')}
                className="w-full flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Maximize2 className="w-4 h-4" />
                Kutu
              </button>
              <button
                onClick={() => addElement('table')}
                className="w-full flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Grid3x3 className="w-4 h-4" />
                Tablo
              </button>
            </div>
            
            <h3 className="text-sm mt-6 mb-3">Dinamik Alanlar</h3>
            <div className="space-y-1 text-xs">
              {Object.entries(availableFields).map(([field, label]) => (
                <div
                  key={field}
                  className="px-2 py-1 bg-gray-100 rounded cursor-pointer hover:bg-blue-100"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('field', field);
                  }}
                >
                  <code className="text-blue-600">{field}</code>
                  <p className="text-gray-600">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Canvas */}
        <div className="flex-1 overflow-auto p-8 bg-gray-100">
          <div className="flex justify-center">
            <div
              ref={canvasRef}
              className="bg-white shadow-lg relative"
              style={{
                width: `${mmToPx(activeTemplate.width) * zoom}px`,
                height: `${mmToPx(activeTemplate.height) * zoom}px`,
                backgroundImage: showGrid 
                  ? `linear-gradient(to right, #e5e7eb 1px, transparent 1px),
                     linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)`
                  : 'none',
                backgroundSize: showGrid ? `${10 * zoom}px ${10 * zoom}px` : 'auto'
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {activeTemplate.elements.map(element => (
                <div
                  key={element.id}
                  className={`absolute cursor-move ${selectedElement?.id === element.id ? 'ring-2 ring-blue-500' : ''}`}
                  style={{
                    left: `${mmToPx(element.x) * zoom}px`,
                    top: `${mmToPx(element.y) * zoom}px`,
                    width: `${mmToPx(element.width) * zoom}px`,
                    height: `${mmToPx(element.height) * zoom}px`,
                    fontSize: `${(element.fontSize || 12) * zoom}px`,
                    fontWeight: element.fontWeight,
                    textAlign: element.textAlign,
                    color: element.color,
                    backgroundColor: element.backgroundColor,
                    border: element.borderWidth ? `${element.borderWidth}px solid ${element.borderColor}` : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start',
                    padding: '2px'
                  }}
                  onMouseDown={(e) => handleMouseDown(e, element)}
                  onClick={() => setSelectedElement(element)}
                >
                  {element.type === 'text' && (element.content || element.field || 'Metin')}
                  {element.type === 'barcode' && (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs">
                      BARKOD
                    </div>
                  )}
                  {element.type === 'image' && (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs">
                      RESİM
                    </div>
                  )}
                  {element.type === 'line' && <div className="w-full h-full bg-black" />}
                  {element.type === 'table' && (
                    <div className="w-full h-full border border-gray-300 text-xs p-1">
                      TABLO
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Properties Panel */}
        <div className="w-80 bg-white border-l overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm mb-4">Özellikler</h3>
            
            {selectedElement ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Tip</label>
                  <input
                    type="text"
                    value={selectedElement.type}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">X (mm)</label>
                    <input
                      type="number"
                      value={selectedElement.x}
                      onChange={(e) => updateElement(selectedElement.id, { x: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Y (mm)</label>
                    <input
                      type="number"
                      value={selectedElement.y}
                      onChange={(e) => updateElement(selectedElement.id, { y: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Genişlik (mm)</label>
                    <input
                      type="number"
                      value={selectedElement.width}
                      onChange={(e) => updateElement(selectedElement.id, { width: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Yükseklik (mm)</label>
                    <input
                      type="number"
                      value={selectedElement.height}
                      onChange={(e) => updateElement(selectedElement.id, { height: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
                
                {selectedElement.type === 'text' && (
                  <>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">İçerik / Alan</label>
                      <textarea
                        value={selectedElement.content || selectedElement.field || ''}
                        onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        rows={3}
                        placeholder="Metin veya {{alan}}"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Font Boyutu</label>
                      <input
                        type="number"
                        value={selectedElement.fontSize || 12}
                        onChange={(e) => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Hizalama</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateElement(selectedElement.id, { textAlign: 'left' })}
                          className={`flex-1 px-3 py-2 border rounded-lg ${selectedElement.textAlign === 'left' ? 'bg-blue-50 border-blue-500' : 'border-gray-300'}`}
                        >
                          <AlignLeft className="w-4 h-4 mx-auto" />
                        </button>
                        <button
                          onClick={() => updateElement(selectedElement.id, { textAlign: 'center' })}
                          className={`flex-1 px-3 py-2 border rounded-lg ${selectedElement.textAlign === 'center' ? 'bg-blue-50 border-blue-500' : 'border-gray-300'}`}
                        >
                          <AlignCenter className="w-4 h-4 mx-auto" />
                        </button>
                        <button
                          onClick={() => updateElement(selectedElement.id, { textAlign: 'right' })}
                          className={`flex-1 px-3 py-2 border rounded-lg ${selectedElement.textAlign === 'right' ? 'bg-blue-50 border-blue-500' : 'border-gray-300'}`}
                        >
                          <AlignRight className="w-4 h-4 mx-auto" />
                        </button>
                      </div>
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedElement.fontWeight === 'bold'}
                          onChange={(e) => updateElement(selectedElement.id, { fontWeight: e.target.checked ? 'bold' : 'normal' })}
                          className="rounded"
                        />
                        <span className="text-sm">Kalın</span>
                      </label>
                    </div>
                  </>
                )}
                
                {selectedElement.type === 'barcode' && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Barkod Alanı</label>
                    <select
                      value={selectedElement.field || ''}
                      onChange={(e) => updateElement(selectedElement.id, { field: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">Seçin...</option>
                      {Object.keys(availableFields).map(field => (
                        <option key={field} value={field}>{field}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <button
                  onClick={() => deleteElement(selectedElement.id)}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Sil
                </button>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <Move className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">Düzenlemek için bir öğe seçin</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

