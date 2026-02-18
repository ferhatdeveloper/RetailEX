import { useState } from 'react';
import { FileText, Plus, Edit, Trash2, Copy, Download, Upload, Eye, LayoutTemplate, Tag } from 'lucide-react';
import type { Template, TemplateType, TemplateFormat } from '../../core/types/templates';
import { TEMPLATE_FORMATS } from '../../core/types/templates';
import { useTemplateStore } from '../store';
import { TemplateDesigner } from './TemplateDesigner';

export function TemplateManager() {
  const { templates, deleteTemplate, duplicateTemplate, setActiveTemplate, addTemplate } = useTemplateStore();
  
  const [showDesigner, setShowDesigner] = useState(false);
  const [designerType, setDesignerType] = useState<TemplateType>('invoice');
  const [filterType, setFilterType] = useState<'all' | TemplateType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredTemplates = templates.filter(template => {
    const matchesType = filterType === 'all' || template.type === filterType;
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.format.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });
  
  const handleEdit = (template: Template) => {
    setActiveTemplate(template);
    setDesignerType(template.type);
    setShowDesigner(true);
  };
  
  const handleNew = (type: TemplateType) => {
    setActiveTemplate(null);
    setDesignerType(type);
    setShowDesigner(true);
  };
  
  const handleDelete = (id: string) => {
    if (confirm('Bu şablonu silmek istediğinizden emin misiniz?')) {
      deleteTemplate(id);
    }
  };
  
  const handleDuplicate = (id: string) => {
    duplicateTemplate(id);
  };
  
  const handleExport = (template: Template) => {
    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const template = JSON.parse(event.target?.result as string) as Template;
          template.id = `imported-${Date.now()}`;
          template.createdAt = new Date().toISOString();
          template.updatedAt = new Date().toISOString();
          addTemplate(template);
          alert('Şablon başarıyla içe aktarıldı!');
        } catch (error) {
          alert('Şablon içe aktarılamadı. Geçersiz dosya formatı.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };
  
  if (showDesigner) {
    return (
      <TemplateDesigner
        type={designerType}
        onClose={() => setShowDesigner(false)}
      />
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl">Şablon Yönetimi</h2>
            <p className="text-sm text-gray-600">Fatura ve etiket şablonlarını yönetin</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              İçe Aktar
            </button>
            <button
              onClick={() => handleNew('label')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Tag className="w-4 h-4" />
              Yeni Etiket Şablonu
            </button>
            <button
              onClick={() => handleNew('invoice')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Yeni Fatura Şablonu
            </button>
          </div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filterType === 'all' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Tümü ({templates.length})
            </button>
            <button
              onClick={() => setFilterType('invoice')}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filterType === 'invoice' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-1" />
              Faturalar ({templates.filter(t => t.type === 'invoice').length})
            </button>
            <button
              onClick={() => setFilterType('label')}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filterType === 'label' 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Tag className="w-4 h-4 inline mr-1" />
              Etiketler ({templates.filter(t => t.type === 'label').length})
            </button>
          </div>
          
          <div className="flex-1">
            <input
              type="text"
              placeholder="Şablon ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
      
      {/* Templates Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-12">
            <LayoutTemplate className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600 mb-2">Şablon bulunamadı</p>
            <p className="text-sm text-gray-500">Yeni bir şablon oluşturun veya mevcut şablonu içe aktarın</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredTemplates.map(template => (
              <div
                key={template.id}
                className="bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all overflow-hidden"
              >
                {/* Template Preview */}
                <div className="aspect-[3/4] bg-gray-50 border-b flex items-center justify-center">
                  <div className="text-center">
                    {template.type === 'invoice' ? (
                      <FileText className="w-16 h-16 mx-auto mb-2 text-blue-500" />
                    ) : (
                      <Tag className="w-16 h-16 mx-auto mb-2 text-green-500" />
                    )}
                    <p className="text-xs text-gray-600">{TEMPLATE_FORMATS[template.format].name}</p>
                    <p className="text-xs text-gray-500">{template.width}x{template.height} mm</p>
                  </div>
                </div>
                
                {/* Template Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="flex-1 truncate">
                      {template.name}
                      {template.isDefault && (
                        <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          Varsayılan
                        </span>
                      )}
                    </h3>
                  </div>
                  
                  <p className="text-xs text-gray-600 mb-3">
                    {template.elements.length} öğe
                  </p>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(template)}
                      className="flex-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 text-sm flex items-center justify-center gap-1"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Düzenle
                    </button>
                    <button
                      onClick={() => handleDuplicate(template.id)}
                      className="px-2.5 py-1.5 bg-gray-50 text-gray-700 rounded hover:bg-gray-100"
                      title="Kopyala"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleExport(template)}
                      className="px-2.5 py-1.5 bg-gray-50 text-gray-700 rounded hover:bg-gray-100"
                      title="Dışa Aktar"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    {!template.isDefault && (
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="px-2.5 py-1.5 bg-red-50 text-red-700 rounded hover:bg-red-100"
                        title="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

