import { useState, useRef, useEffect } from 'react';
import { 
  Save, Download, Upload, Copy, Trash2, Eye, Settings, Plus,
  Type, Image, Maximize2, Minus, BarChart3, Grid3x3, AlignLeft,
  AlignCenter, AlignRight, Bold, Move, ZoomIn, ZoomOut
} from 'lucide-react';
import type { Template, TemplateElement, TemplateUsageScope } from '../../core/types/templates';
import {
  INVOICE_FIELDS,
  LABEL_FIELDS,
  TEMPLATE_FORMATS,
  TEMPLATE_USAGE_SCOPES,
  TEMPLATE_USAGE_SCOPE_LABELS,
} from '../../core/types/templates';
import { getTemplatePaperDisplayName } from '../../core/templatePaperFormats';
import { TemplatePaperSizeControls } from './TemplatePaperSizeControls';
import { useTemplateStore } from '../../store/useTemplateStore';

interface TemplateDesignerProps {
  type: 'invoice' | 'label';
  onClose?: () => void;
}

export function TemplateDesigner({ type, onClose }: TemplateDesignerProps) {
  const {
    templates,
    activeTemplate,
    setActiveTemplate,
    updateTemplate,
    addTemplate,
    loadTemplatesFromDatabase,
    persistTemplatesToDatabase,
  } = useTemplateStore();
  
  const [selectedElement, setSelectedElement] = useState<TemplateElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Load active template or create new
  useEffect(() => {
    void loadTemplatesFromDatabase();
  }, [loadTemplatesFromDatabase]);

  useEffect(() => {
    if (!activeTemplate) {
      const defaultTemplate = templates.find(t => t.type === type && t.isDefault);
      if (defaultTemplate) {
        setActiveTemplate({ ...defaultTemplate });
        return;
      }
      const defaultFormat = type === 'invoice' ? 'A4' : 'label-medium';
      const size = TEMPLATE_FORMATS[defaultFormat];
      const created: Template = {
        id: `template-${Date.now()}`,
        name: type === 'invoice' ? 'Yeni Fatura Şablonu' : 'Yeni Etiket Şablonu',
        description: '',
        type,
        format: defaultFormat,
        width: size.width,
        height: size.height,
        orientation: type === 'label' ? 'landscape' : 'portrait',
        engine: 'fastreport-like',
        usageScopes: type === 'label' ? ['global', 'product_bulk_label', 'shelf_label'] : ['global'],
        defaultScopes: [],
        margin: { top: 10, right: 10, bottom: 10, left: 10 },
        isDefault: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        elements: [],
      };
      addTemplate(created);
      setActiveTemplate(created);
    }
  }, [type, activeTemplate, templates, setActiveTemplate, addTemplate]);
  
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
  
  const saveTemplate = async () => {
    updateTemplate(activeTemplate.id, activeTemplate);
    await persistTemplatesToDatabase();
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
  const selectedScopes: TemplateUsageScope[] = activeTemplate.usageScopes?.length
    ? activeTemplate.usageScopes
    : ['global'];

  const toggleScope = (scope: TemplateUsageScope) => {
    const current = new Set(selectedScopes);
    if (scope === 'global') {
      updateTemplate(activeTemplate.id, { usageScopes: ['global'] });
      return;
    }
    current.delete('global');
    if (current.has(scope)) {
      current.delete(scope);
    } else {
      current.add(scope);
    }
    const nextScopes = Array.from(current);
    updateTemplate(activeTemplate.id, {
      usageScopes: nextScopes.length > 0 ? nextScopes : ['global'],
    });
  };
  
  // Convert mm to pixels (assuming 96 DPI)
  const mmToPx = (mm: number) => (mm * 96) / 25.4;
  
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl">{type === 'invoice' ? 'Fatura' : 'Etiket'} Tasarım Editörü</h2>
            <p className="text-sm text-gray-600">
              {activeTemplate.name} — {getTemplatePaperDisplayName(activeTemplate)}
              {' · '}
              {(activeTemplate.engine ?? 'fastreport-like') === 'fastreport-like' ? 'FastReport benzeri motor' : 'Basit motor'}
            </p>
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

            <div className="mt-6 pt-4 border-t border-gray-200 space-y-4">
              <TemplatePaperSizeControls
                template={activeTemplate}
                templateType={type}
                onApply={(patch) => updateTemplate(activeTemplate.id, patch)}
              />

              <div>
                <label className="block text-xs text-gray-600 mb-1">Tasarım Motoru</label>
                <select
                  value={activeTemplate.engine ?? 'fastreport-like'}
                  onChange={(e) =>
                    updateTemplate(activeTemplate.id, { engine: e.target.value as Template['engine'] })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="fastreport-like">FastReport benzeri gelişmiş</option>
                  <option value="simple">Basit motor</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Gelişmiş motor seçildiğinde bu şablon farklı modüllerde yeniden kullanılabilir.
                </p>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-2">Kullanım Alanları</label>
                <div className="grid grid-cols-1 gap-2">
                  {TEMPLATE_USAGE_SCOPES.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                        className="rounded"
                      />
                      <span>{TEMPLATE_USAGE_SCOPE_LABELS[scope]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

