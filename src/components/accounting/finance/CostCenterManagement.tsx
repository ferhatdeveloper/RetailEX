import { useState, useEffect } from 'react';
import { 
  Target, Plus, Edit, Trash2, Search, X, 
  Layout, BookOpen, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { costCenterAPI, type CostCenter } from '../../../services/api/costCenters';
import { useTheme } from '../../../contexts/ThemeContext';
import { useLanguage } from '../../../contexts/LanguageContext';

export function CostCenterManagement() {
  const { darkMode } = useTheme();
  const { t } = useLanguage();
  
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    is_active: true
  });

  useEffect(() => {
    loadCostCenters();
  }, []);

  const loadCostCenters = async () => {
    setLoading(true);
    try {
      const data = await costCenterAPI.getAll();
      setCostCenters(data);
    } catch (error) {
      console.error('Failed to load cost centers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingId(null);
    setFormData({
      code: '',
      name: '',
      description: '',
      is_active: true
    });
    setShowModal(true);
  };

  const handleEdit = (cc: CostCenter) => {
    setEditingId(cc.id);
    setFormData({
      code: cc.code,
      name: cc.name,
      description: cc.description || '',
      is_active: cc.is_active
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu masraf merkezini silmek istediğinizden emin misiniz?')) return;
    
    try {
      const success = await costCenterAPI.delete(id);
      if (success) {
        setCostCenters(prev => prev.filter(cc => cc.id !== id));
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await costCenterAPI.update(editingId, formData);
      } else {
        await costCenterAPI.create(formData);
      }
      setShowModal(false);
      loadCostCenters();
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  const filtered = costCenters.filter(cc => 
    cc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cc.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`h-full flex flex-col ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <div className={`p-6 border-b ${darkMode ? 'border-gray-800 bg-gray-800/50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Masraf Merkezleri</h1>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Departman bazlı gider takibi ve bütçe yönetimi</p>
            </div>
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Yeni Merkez
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Koda veya isme göre ara..."
            className={`w-full pl-10 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
              darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
            }`}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-xl ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
            <Layout className="w-12 h-12 text-gray-300 mb-2" />
            <p className="text-gray-500">Henüz masraf merkezi tanımlanmamış.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(cc => (
              <div 
                key={cc.id}
                className={`group p-4 rounded-xl border transition-all hover:shadow-md ${
                  darkMode ? 'bg-gray-800 border-gray-700' : 'white border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${
                      darkMode ? 'bg-gray-700 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {cc.code}
                    </span>
                    {!cc.is_active && (
                      <span className="px-2 py-0.5 text-[10px] bg-red-100 text-red-600 rounded">Pasif</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleEdit(cc)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-blue-600"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(cc.id)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold mb-1">{cc.name}</h3>
                <p className={`text-xs line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {cc.description || 'Açıklama girilmemiş.'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold">
                {editingId ? 'Merkezi Düzenle' : 'Yeni Masraf Merkezi'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Kod *</label>
                  <input
                    required
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                    placeholder="Örn: DEP-01"
                    className={`w-full px-4 py-2.5 text-sm border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                      darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                    }`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">İsim *</label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Örn: Pazarlama Departmanı"
                    className={`w-full px-4 py-2.5 text-sm border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                      darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                    }`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Açıklama</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Detaylı bilgi..."
                  className={`w-full px-4 py-2.5 text-sm border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                    darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                  }`}
                />
              </div>

              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="is_active" className="text-sm">Aktif</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={`flex-1 px-4 py-3 text-sm font-bold border rounded-xl transition-colors ${
                    darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-lg active:scale-95"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
