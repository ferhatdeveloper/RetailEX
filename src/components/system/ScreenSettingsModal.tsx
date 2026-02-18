import { X, ZoomIn, ZoomOut, Monitor, Moon, Sun, ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';

// Layout order types
export type LayoutOrder =
  // 3 Kolonlu Klasik Düzenler
  | 'cart-numpad-quick'
  | 'cart-quick-numpad'
  | 'numpad-cart-quick'
  | 'numpad-quick-cart'
  | 'quick-cart-numpad'
  | 'quick-numpad-cart'
  // 2 Kolonlu Düzenler (Numpad Gizli)
  | 'cart-quick-2col'
  | 'quick-cart-2col'
  | 'cart-wide-quick'
  // Dikey Split Düzenler
  | 'cart-top-actions-bottom'
  | 'quick-top-cart-bottom'
  // Tek Panel Dominant Modlar
  | 'cart-fullscreen'
  | 'quick-dominant'
  | 'numpad-dominant'
  // Floating/Overlay Modlar
  | 'cart-quick-numpad-float'
  // Özel Modlar
  | 'restaurant-style'
  | 'grocery-style'
  | 'compact-all'
  // Sidebar Modlar
  | 'quick-with-detail-sidebar'
  | 'quick-sidebar-numpad';

interface ScreenSettingsModalProps {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
  // posMode kaldırıldı - sadece MarketPOS kullanılıyor
  gridColumns: number;
  setGridColumns: (value: number) => void;
  fontSize: number;
  setFontSize: (value: number) => void;
  fontWeight: number;
  setFontWeight: (value: number) => void;
  zoomLevel: number;
  setZoomLevel: (value: number) => void;
  cartViewMode: 'table' | 'cards';
  setCartViewMode: (value: 'table' | 'cards') => void;
  buttonColorStyle: 'filled' | 'outline';
  setButtonColorStyle: (value: 'filled' | 'outline') => void;
  rtlMode: boolean;
  setRtlMode: (value: boolean) => void;
  layoutOrder: LayoutOrder;
  setLayoutOrder: (value: LayoutOrder) => void;
  onClose: () => void;
}

export function ScreenSettingsModal({
  darkMode,
  setDarkMode,
  // posMode, setPosMode kaldırıldı
  gridColumns,
  setGridColumns,
  fontSize,
  setFontSize,
  fontWeight,
  setFontWeight,
  zoomLevel,
  setZoomLevel,
  cartViewMode,
  setCartViewMode,
  buttonColorStyle,
  setButtonColorStyle,
  rtlMode,
  setRtlMode,
  layoutOrder,
  setLayoutOrder,
  onClose
}: ScreenSettingsModalProps) {

  // Layout category filter state
  const [layoutCategory, setLayoutCategory] = useState<'3col' | '2col' | 'vertical' | 'special'>('3col');

  const handleZoomChange = (newZoom: number) => {
    setZoomLevel(newZoom);
    localStorage.setItem('retailos_zoom_level', newZoom.toString());
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className={`rounded-lg sm:rounded-xl w-full max-w-[95vw] sm:max-w-6xl shadow-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'
        }`}>
        {/* Header */}
        <div className={`px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b flex items-center justify-between ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700'
          }`}>
          <h3 className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-white'}`}>
            <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
            Ekran Ayarları
          </h3>
          <button
            onClick={onClose}
            className={`p-2 sm:p-1.5 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95 ${darkMode ? 'hover:bg-gray-700 text-gray-300' : 'text-white/90 hover:bg-white/10'
              }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - 2 Columns */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {/* Left Column */}
            <div className="space-y-5">
              {/* Dark Mode Toggle */}
              <div>
                <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Tema
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDarkMode(false)}
                    className={`px-4 py-3 rounded-lg transition-all text-center border ${!darkMode
                      ? darkMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600 text-white border-blue-600'
                      : darkMode ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <Sun className="w-5 h-5 mx-auto mb-1" />
                    <div className="text-sm font-medium">Açık</div>
                  </button>
                  <button
                    onClick={() => setDarkMode(true)}
                    className={`px-4 py-3 rounded-lg transition-all text-center border ${darkMode
                      ? darkMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600 text-white border-blue-600'
                      : darkMode ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <Moon className="w-5 h-5 mx-auto mb-1" />
                    <div className="text-sm font-medium">Koyu</div>
                  </button>
                </div>
              </div>

              {/* Grid Columns */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Ürün Grid Sütun Sayısı: <span className="font-semibold">{gridColumns}</span>
                </label>
                <input
                  type="range"
                  min="2"
                  max="8"
                  step="1"
                  value={gridColumns}
                  onChange={(e) => {
                    const newColumns = parseInt(e.target.value);
                    setGridColumns(newColumns);
                    localStorage.setItem('retailos_grid_columns', newColumns.toString());
                  }}
                  className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${darkMode ? 'bg-gray-700 accent-blue-500' : 'bg-gray-200 accent-blue-600'
                    }`}
                />
                <div className={`flex justify-between text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  <span>2 Sütun</span>
                  <span>5 Sütun</span>
                  <span>8 Sütun</span>
                </div>

                {/* Quick Select Buttons */}
                <div className="grid grid-cols-5 gap-1.5 mt-3">
                  {[2, 3, 4, 5, 6, 7, 8].map(col => (
                    <button
                      key={col}
                      onClick={() => {
                        setGridColumns(col);
                        localStorage.setItem('retailos_grid_columns', col.toString());
                      }}
                      className={`px-2 py-1.5 rounded transition-all text-center text-xs border ${gridColumns === col
                        ? darkMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600 text-white border-blue-600'
                        : darkMode ? 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                      {col}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cart View Mode */}
              <div>
                <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Sepet Görünümü (MarketPOS)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setCartViewMode('cards');
                      localStorage.setItem('retailos_cart_view_mode', 'cards');
                    }}
                    className={`px-4 py-3 rounded-lg transition-all text-center border ${cartViewMode === 'cards'
                      ? darkMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600 text-white border-blue-600'
                      : darkMode ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <div className="text-xl mb-1">📦</div>
                    <div className="text-sm font-medium">Kartlar</div>
                  </button>
                  <button
                    onClick={() => {
                      setCartViewMode('table');
                      localStorage.setItem('retailos_cart_view_mode', 'table');
                    }}
                    className={`px-4 py-3 rounded-lg transition-all text-center border ${cartViewMode === 'table'
                      ? darkMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600 text-white border-blue-600'
                      : darkMode ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <div className="text-xl mb-1">📊</div>
                    <div className="text-sm font-medium">Tablo</div>
                  </button>
                </div>
              </div>

              {/* Button Style */}
              <div>
                <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Buton Stili (MarketPOS)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setButtonColorStyle('filled');
                      localStorage.setItem('retailos_button_color_style', 'filled');
                    }}
                    className={`px-4 py-3 rounded-lg transition-all text-center border ${buttonColorStyle === 'filled'
                      ? darkMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600 text-white border-blue-600'
                      : darkMode ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <div className="text-xl mb-1">🎨</div>
                    <div className="text-sm font-medium">Renkli</div>
                  </button>
                  <button
                    onClick={() => {
                      setButtonColorStyle('outline');
                      localStorage.setItem('retailos_button_color_style', 'outline');
                    }}
                    className={`px-4 py-3 rounded-lg transition-all text-center border ${buttonColorStyle === 'outline'
                      ? darkMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600 text-white border-blue-600'
                      : darkMode ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <div className="text-xl mb-1">⬜</div>
                    <div className="text-sm font-medium">Çerçeve</div>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-5">
              {/* Zoom Level Display & Controls */}
              <div className={`rounded-xl p-4 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100'}`}>
                <div className="text-center mb-4">
                  <div className={`text-6xl font-light tabular-nums ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                    {zoomLevel}%
                  </div>
                  <div className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {zoomLevel === 100 ? 'Normal Boyut' : zoomLevel < 100 ? 'Küçültülmüş' : 'Büyütülmüş'}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 mb-4">
                  <button
                    onClick={() => handleZoomChange(Math.max(50, zoomLevel - 10))}
                    disabled={zoomLevel <= 50}
                    className={`w-12 h-12 flex items-center justify-center rounded-lg transition-colors ${darkMode
                      ? 'bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed'
                      : 'bg-white hover:bg-gray-50 shadow disabled:opacity-30 disabled:cursor-not-allowed'
                      }`}
                  >
                    <ZoomOut className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => handleZoomChange(100)}
                    className={`px-6 py-2.5 rounded-lg transition-colors font-medium ${darkMode
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                      }`}
                  >
                    Sıfırla
                  </button>

                  <button
                    onClick={() => handleZoomChange(Math.min(200, zoomLevel + 10))}
                    disabled={zoomLevel >= 200}
                    className={`w-12 h-12 flex items-center justify-center rounded-lg transition-colors ${darkMode
                      ? 'bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed'
                      : 'bg-white hover:bg-gray-50 shadow disabled:opacity-30 disabled:cursor-not-allowed'
                      }`}
                  >
                    <ZoomIn className="w-5 h-5" />
                  </button>
                </div>

                <input
                  type="range"
                  min="50"
                  max="200"
                  step="10"
                  value={zoomLevel}
                  onChange={(e) => handleZoomChange(parseInt(e.target.value))}
                  className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${darkMode ? 'bg-gray-700 accent-blue-500' : 'bg-gray-200 accent-blue-600'
                    }`}
                />
                <div className={`flex justify-between text-xs mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  <span>50%</span>
                  <span>100%</span>
                  <span>200%</span>
                </div>
              </div>

              {/* Font Size */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Yazı Boyutu: <span className="font-semibold">{fontSize}%</span>
                </label>
                <input
                  type="range"
                  min="80"
                  max="150"
                  step="10"
                  value={fontSize}
                  onChange={(e) => {
                    const newSize = parseInt(e.target.value);
                    setFontSize(newSize);
                    localStorage.setItem('retailos_font_size', newSize.toString());
                  }}
                  className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${darkMode ? 'bg-gray-700 accent-blue-500' : 'bg-gray-200 accent-blue-600'
                    }`}
                />
                <div className={`flex justify-between text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  <span>Küçük (80%)</span>
                  <span>Büyük (150%)</span>
                </div>
              </div>

              {/* Font Weight */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Yazı Kalınlığı: <span className="font-semibold">{fontWeight}</span>
                </label>
                <input
                  type="range"
                  min="300"
                  max="700"
                  step="100"
                  value={fontWeight}
                  onChange={(e) => {
                    const newWeight = parseInt(e.target.value);
                    setFontWeight(newWeight);
                    localStorage.setItem('retailos_font_weight', newWeight.toString());
                  }}
                  className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${darkMode ? 'bg-gray-700 accent-blue-500' : 'bg-gray-200 accent-blue-600'
                    }`}
                />
                <div className={`flex justify-between text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  <span>İnce (300)</span>
                  <span>Normal (400)</span>
                  <span>Kalın (700)</span>
                </div>
              </div>

              {/* Layout Order - MarketPOS Column Layout */}
              <div>
                <label className={`block text-sm font-medium mb-3 flex items-center gap-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <ArrowLeftRight className="w-4 h-4" />
                  Kolon Sırası (MarketPOS)
                </label>

                {/* Category Tabs */}
                <div className={`grid grid-cols-4 gap-1.5 mb-3 p-1 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <button
                    className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${layoutCategory === '3col'
                      ? darkMode ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 shadow-sm'
                      : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    onClick={() => setLayoutCategory('3col')}
                  >
                    3 Kolon
                  </button>
                  <button
                    className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${layoutCategory === '2col'
                      ? darkMode ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 shadow-sm'
                      : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    onClick={() => setLayoutCategory('2col')}
                  >
                    2 Kolon
                  </button>
                  <button
                    className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${layoutCategory === 'vertical'
                      ? darkMode ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 shadow-sm'
                      : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    onClick={() => setLayoutCategory('vertical')}
                  >
                    Dikey
                  </button>
                  <button
                    className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${layoutCategory === 'special'
                      ? darkMode ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 shadow-sm'
                      : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    onClick={() => setLayoutCategory('special')}
                  >
                    Özel
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1.5 max-h-[320px] overflow-y-auto pr-1">
                  {[
                    // 3 Kolonlu Klasik Düzenler (6 kombinasyon)
                    { value: 'cart-numpad-quick', label: 'Klasik', emoji: '🛒|🔢|⚡', desc: 'Sepet-NumPad-Hızlı' },
                    { value: 'cart-quick-numpad', label: 'Hızlı Orta', emoji: '🛒|⚡|🔢', desc: 'Sepet-Hızlı-NumPad' },
                    { value: 'numpad-cart-quick', label: 'NumPad Sol', emoji: '🔢|🛒|⚡', desc: 'NumPad-Sepet-Hızlı' },
                    { value: 'numpad-quick-cart', label: 'NumPad Önce', emoji: '🔢|⚡|🛒', desc: 'NumPad-Hızlı-Sepet' },
                    { value: 'quick-cart-numpad', label: 'Hızlı Sol', emoji: '⚡|🛒|🔢', desc: 'Hızlı-Sepet-NumPad' },
                    { value: 'quick-numpad-cart', label: 'Hızlı Önce', emoji: '⚡|🔢|🛒', desc: 'Hızlı-NumPad-Sepet' },

                    // 2 Kolonlu Düzenler (Numpad Gizli) (3 kombinasyon)
                    { value: 'cart-quick-2col', label: 'Sepet+Hızlı', emoji: '🛒|⚡', desc: 'NumPad Gizli' },
                    { value: 'quick-cart-2col', label: 'Hızlı+Sepet', emoji: '⚡|🛒', desc: 'NumPad Gizli' },
                    { value: 'cart-wide-quick', label: 'Geniş Sepet', emoji: '🛒🛒|⚡', desc: 'Sepet Çok Geniş' },

                    // Dikey Split Düzenler (2 kombinasyon)
                    { value: 'cart-top-actions-bottom', label: 'Sepet Üstte', emoji: '🛒🛒🛒', desc: 'NumPad+Hızlı Altta' },
                    { value: 'quick-top-cart-bottom', label: 'Hızlı Üstte', emoji: '⚡⚡⚡', desc: 'Sepet+NumPad Altta' },

                    // Tek Panel Dominant Modlar (3 kombinasyon)
                    { value: 'cart-fullscreen', label: 'Tam Ekran', emoji: '🛒', desc: 'NumPad Float' },
                    { value: 'quick-dominant', label: 'Hızlı Satış', emoji: '⚡⚡', desc: 'Sepet Minimal' },
                    { value: 'numpad-dominant', label: 'NumPad Büyük', emoji: '🔢🔢', desc: 'Sayısal Odaklı' },
                    { value: 'numpad-dominant', label: 'NumPad Büyük', emoji: '🔢🔢', desc: 'Sayısal Odaklı' },

                    // Floating/Overlay Modlar (1 kombinasyon)
                    { value: 'cart-quick-numpad-float', label: 'Float NumPad', emoji: '🛒|⚡+🔢', desc: 'NumPad Overlay' },

                    // Özel Modlar (3 kombinasyon)
                    { value: 'restaurant-style', label: 'Restaurant', emoji: '📋|🍽️|🛒', desc: 'Kat-Ürün-Sepet' },
                    { value: 'grocery-style', label: 'Market', emoji: '🔍|🛒|⚡', desc: 'Arama Odaklı' },
                    { value: 'compact-all', label: 'Kompakt', emoji: '▪️▪️▪️', desc: 'Tablet Modu' },

                    // Sidebar Modlar (2 kombinasyon)
                    { value: 'quick-with-detail-sidebar', label: 'Detaylı Sidebar', emoji: '🛒|⚡|📋', desc: 'Hızlı Satış ve Detaylar' },
                    { value: 'quick-sidebar-numpad', label: 'Sidebar NumPad', emoji: '🛒|⚡|🔢', desc: 'Hızlı Satış ve NumPad' },
                  ].filter(option => {
                    switch (layoutCategory) {
                      case '3col':
                        return ['cart-numpad-quick', 'cart-quick-numpad', 'numpad-cart-quick', 'numpad-quick-cart', 'quick-cart-numpad', 'quick-numpad-cart'].includes(option.value);
                      case '2col':
                        return ['cart-quick-2col', 'quick-cart-2col', 'cart-wide-quick'].includes(option.value);
                      case 'vertical':
                        return ['cart-top-actions-bottom', 'quick-top-cart-bottom'].includes(option.value);
                      case 'special':
                        return ['cart-fullscreen', 'quick-dominant', 'numpad-dominant', 'cart-quick-numpad-float', 'restaurant-style', 'grocery-style', 'compact-all', 'quick-with-detail-sidebar', 'quick-sidebar-numpad'].includes(option.value);
                      default:
                        return true;
                    }
                  }).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setLayoutOrder(option.value as LayoutOrder);
                        localStorage.setItem('retailos_layout_order', option.value);
                      }}
                      className={`px-1.5 py-2 rounded-lg transition-all border text-left hover:scale-[1.02] ${layoutOrder === option.value
                        ? darkMode ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20'
                        : darkMode ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750 hover:border-gray-600' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm'
                        }`}
                    >
                      <div className="text-center mb-1">
                        <div className="text-xs mb-0.5">{option.emoji}</div>
                        <div className="text-[9px] font-semibold leading-tight">{option.label}</div>
                      </div>
                      <div className={`text-[8px] leading-tight text-center px-0.5 ${layoutOrder === option.value ? 'opacity-90' : 'opacity-60'}`}>
                        {option.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}
