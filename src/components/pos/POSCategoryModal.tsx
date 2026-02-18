import { X, Package, Grid3x3 } from 'lucide-react';
import { useEffect } from 'react';

interface POSCategoryModalProps {
  categories: string[];
  selectedCategory: string;
  onSelect: (category: string) => void;
  onClose: () => void;
}

export function POSCategoryModal({
  categories,
  selectedCategory,
  onSelect,
  onClose
}: POSCategoryModalProps) {
  // Safe fallback for categories
  const safeCategories = categories || ['Tümü'];
  
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      
      // Number key shortcuts
      const key = e.key;
      if (key >= '1' && key <= '9') {
        const index = parseInt(key) - 1;
        if (index < safeCategories.length) {
          onSelect(safeCategories[index]);
          onClose();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [safeCategories, onSelect, onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <Package className="w-5 h-5" />
            Kategori Seç
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Categories Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-4">
            {safeCategories.map((category, index) => {
              const isSelected = selectedCategory === category;
              const isTumu = category === 'Tümü';
              
              return (
                <button
                  key={category}
                  onClick={() => {
                    onSelect(category);
                    onClose();
                  }}
                  className={`relative p-6 border transition-all text-left ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 shadow-lg'
                      : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  {/* Number Badge */}
                  <div className={`absolute top-3 left-3 w-8 h-8 flex items-center justify-center text-sm ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {index + 1}
                  </div>
                  
                  <div className="flex flex-col items-center gap-3 mt-4">
                    {/* Icon */}
                    <div className={`w-16 h-16 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-gradient-to-br from-blue-600 to-blue-700'
                        : 'bg-gradient-to-br from-blue-500 to-blue-600'
                    }`}>
                      {isTumu ? (
                        <Grid3x3 className="w-8 h-8 text-white" />
                      ) : (
                        <Package className="w-8 h-8 text-white" />
                      )}
                    </div>
                    
                    {/* Text */}
                    <div className="text-center">
                      <p className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                        {category}
                      </p>
                      <p className={`text-sm mt-1 ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
                        {isTumu ? 'Tüm ürünler' : 'Kategori'}
                      </p>
                    </div>
                  </div>

                  {/* Selected Indicator */}
                  {isSelected && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-blue-700">
                      <div className="w-2 h-2 bg-blue-600 animate-pulse" />
                      <span className="text-xs font-medium">Seçili</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Toplam {safeCategories.length} kategori
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors text-sm"
          >
            Kapat (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}
