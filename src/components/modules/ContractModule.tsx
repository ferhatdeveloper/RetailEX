import { useState } from 'react';
import { FileSignature, Calendar, Plus, Edit2, Trash2, X, Save, Search, FileText, Users, Banknote } from 'lucide-react';

interface Contract {
  id: string;
  customer: string;
  type: string;
  startDate: string;
  endDate: string;
  value: number;
  status: 'Aktif' | 'Sona Eriyor' | 'Sona Erdi' | 'İptal';
  description?: string;
  terms?: string;
}

export function ContractModule() {
  const [contracts, setContracts] = useState<Contract[]>([
    { 
      id: 'SOZ-2025-001', 
      customer: 'Mohammed Hassan A.Ş.', 
      type: 'Yıllık Anlaşma', 
      startDate: '2025-01-01', 
      endDate: '2025-12-31', 
      value: 500000, 
      status: 'Aktif',
      description: 'Yıllık toplu alım sözleşmesi',
      terms: 'Net 30 gün, %5 erken ödeme indirimi'
    },
    { 
      id: 'SOZ-2025-002', 
      customer: 'Layla Hassan Ltd.', 
      type: 'Hizmet Sözleşmesi', 
      startDate: '2025-03-15', 
      endDate: '2026-03-15', 
      value: 120000, 
      status: 'Aktif',
      description: 'Teknik destek ve bakım hizmeti',
      terms: 'Aylık ödemeler, yıllık enflasyon ayarlaması'
    },
    { 
      id: 'SOZ-2024-015', 
      customer: 'Ali Al-Obeidi', 
      type: 'Toplu Alım', 
      startDate: '2024-06-01', 
      endDate: '2025-06-01', 
      value: 250000, 
      status: 'Sona Eriyor',
      description: 'Toplu gıda ürünleri tedarik sözleşmesi',
      terms: 'Aylık sevkiyatlar, net 15 gün ödeme'
    },
  ]);

  const [showModal, setShowModal] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<Partial<Contract>>({
    customer: '',
    type: '',
    startDate: '',
    endDate: '',
    value: 0,
    status: 'Aktif',
    description: '',
    terms: ''
  });

  const contractTypes = [
    'Yıllık Anlaşma',
    'Hizmet Sözleşmesi',
    'Toplu Alım',
    'Tedarik Sözleşmesi',
    'Distribütörlük',
    'Bayilik',
    'Lisans Anlaşması',
    'Ürün Sözleşmesi'
  ];

  const statusOptions: Contract['status'][] = ['Aktif', 'Sona Eriyor', 'Sona Erdi', 'İptal'];

  const handleOpenModal = (contract?: Contract) => {
    if (contract) {
      setEditingContract(contract);
      setFormData(contract);
    } else {
      setEditingContract(null);
      const newId = `SOZ-${new Date().getFullYear()}-${String(contracts.length + 1).padStart(3, '0')}`;
      setFormData({
        id: newId,
        customer: '',
        type: '',
        startDate: '',
        endDate: '',
        value: 0,
        status: 'Aktif',
        description: '',
        terms: ''
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingContract(null);
    setFormData({
      customer: '',
      type: '',
      startDate: '',
      endDate: '',
      value: 0,
      status: 'Aktif',
      description: '',
      terms: ''
    });
  };

  const handleSave = () => {
    if (!formData.customer || !formData.type || !formData.startDate || !formData.endDate) {
      alert('Lütfen zorunlu alanları doldurun!');
      return;
    }

    if (editingContract) {
      // Güncelleme
      setContracts(contracts.map(c => 
        c.id === editingContract.id ? { ...formData as Contract } : c
      ));
    } else {
      // Yeni ekleme
      setContracts([...contracts, formData as Contract]);
    }

    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (confirm('Bu sözleşmeyi silmek istediğinizden emin misiniz?')) {
      setContracts(contracts.filter(c => c.id !== id));
    }
  };

  const filteredContracts = contracts.filter(contract =>
    contract.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contract.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contract.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalActiveValue = contracts
    .filter(c => c.status === 'Aktif')
    .reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-4 py-3 border-b border-indigo-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSignature className="w-5 h-5" />
            <div>
              <h2 className="text-sm font-semibold">Sözleşme Yönetimi</h2>
              <p className="text-[10px] text-indigo-100">Müşteri ve tedarikçi sözleşmelerini yönetin</p>
            </div>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-indigo-600 rounded hover:bg-indigo-50 transition-colors text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Sözleşme</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 bg-gray-50">
        {/* Özet Kartlar */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-gray-200 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-600">Toplam Sözleşme</span>
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-xl font-semibold text-gray-900">{contracts.length}</div>
          </div>

          <div className="bg-white border border-gray-200 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-600">Aktif Sözleşme</span>
              <FileSignature className="w-4 h-4 text-green-600" />
            </div>
            <div className="text-xl font-semibold text-green-600">
              {contracts.filter(c => c.status === 'Aktif').length}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-600">Toplam Değer (Aktif)</span>
              <Banknote className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-base font-semibold text-blue-600">
              {totalActiveValue.toLocaleString()} IQD
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-600">Sona Eriyor</span>
              <Calendar className="w-4 h-4 text-orange-600" />
            </div>
            <div className="text-xl font-semibold text-orange-600">
              {contracts.filter(c => c.status === 'Sona Eriyor').length}
            </div>
          </div>
        </div>

        {/* Arama ve Filtreler */}
        <div className="bg-white border border-gray-200 rounded mb-3 p-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Sözleşme ara (No, Müşteri, Tip...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Tablo */}
        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-300">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Sözleşme No</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Müşteri/Cari</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Tip</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Başlangıç</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Bitiş</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-700 uppercase">Değer (IQD)</th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-700 uppercase">Durum</th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-700 uppercase">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                      {searchQuery ? 'Arama sonucu bulunamadı' : 'Henüz sözleşme eklenmedi'}
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map((contract) => (
                    <tr key={contract.id} className="border-b border-gray-100 hover:bg-indigo-50/30 transition-colors">
                      <td className="px-3 py-2 text-xs font-mono text-indigo-600">{contract.id}</td>
                      <td className="px-3 py-2 text-xs text-gray-900">{contract.customer}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{contract.type}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {new Date(contract.startDate).toLocaleDateString('tr-TR')}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {new Date(contract.endDate).toLocaleDateString('tr-TR')}
                      </td>
                      <td className="px-3 py-2 text-xs text-right font-semibold text-green-600">
                        {contract.value.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          contract.status === 'Aktif' ? 'bg-green-100 text-green-700' :
                          contract.status === 'Sona Eriyor' ? 'bg-orange-100 text-orange-700' :
                          contract.status === 'Sona Erdi' ? 'bg-gray-100 text-gray-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {contract.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenModal(contract)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Düzenle"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(contract.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal - Sözleşme Ekle/Düzenle */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-4 py-3 flex items-center justify-between border-b border-indigo-800">
              <div className="flex items-center gap-2">
                <FileSignature className="w-5 h-5" />
                <h3 className="text-sm font-semibold">
                  {editingContract ? 'Sözleşme Düzenle' : 'Yeni Sözleşme Ekle'}
                </h3>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-white hover:text-indigo-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Sözleşme No */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Sözleşme No *
                  </label>
                  <input
                    type="text"
                    value={formData.id || ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50 text-gray-600"
                  />
                </div>

                {/* Müşteri/Cari */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Müşteri/Cari Adı *
                  </label>
                  <input
                    type="text"
                    value={formData.customer || ''}
                    onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                    placeholder="Örn: Mohammed Hassan A.Ş."
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Sözleşme Tipi */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Sözleşme Tipi *
                  </label>
                  <select
                    value={formData.type || ''}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Seçiniz...</option>
                    {contractTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* Başlangıç Tarihi */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Başlangıç Tarihi *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate || ''}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Bitiş Tarihi */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Bitiş Tarihi *
                  </label>
                  <input
                    type="date"
                    value={formData.endDate || ''}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Sözleşme Değeri */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Sözleşme Değeri (IQD)
                  </label>
                  <input
                    type="number"
                    value={formData.value || 0}
                    onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Durum */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Durum
                  </label>
                  <select
                    value={formData.status || 'Aktif'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Contract['status'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  >
                    {statusOptions.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>

                {/* Açıklama */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Açıklama
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Sözleşme hakkında genel bilgiler..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                {/* Şartlar */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Ödeme Şartları ve Koşullar
                  </label>
                  <textarea
                    value={formData.terms || ''}
                    onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                    placeholder="Ödeme koşulları, vade bilgileri..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>{editingContract ? 'Güncelle' : 'Kaydet'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

