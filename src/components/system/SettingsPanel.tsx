import { AuthorizationSettings } from './AuthorizationSettings';

export function SettingsPanel() {
  const {
    selectedFirm,
    // ... (keep existing setup)
  } = useFirmaDonem();

  // Need to handle state inside component or just render

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-700 via-gray-700 to-slate-800 text-white px-6 py-4 border-b shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="w-6 h-6" />
          <h2 className="text-2xl">Sistem Ayarları</h2>
        </div>
        <p className="text-slate-200 text-sm mt-1">RetailOS • Yapılandırma ve özelleştirme</p>
      </div>

      <div className="p-6 space-y-6">

        {/* TOP: Authorization Module (Requested by User) */}
        <div className="bg-white rounded-lg border border-indigo-200 shadow-sm">
          <div className="p-6 border-b bg-indigo-50/50">
            <AuthorizationSettings />
          </div>
        </div>

        {/* Enterprise Context Settings */}
        <div className="bg-white rounded-lg border border-blue-200 shadow-sm">
          <div className="p-6 border-b bg-blue-50/50 flex items-center gap-3">
            <Building2 className="w-6 h-6 text-blue-700" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Kurumsal Yapılandırma</h3>
              <p className="text-sm text-gray-500">Çalışma alanı ve organizasyonel birimler</p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Read-Only Context */}
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  Aktif Firma
                </label>
                <div className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-700 font-medium">
                  {selectedFirm ? `${selectedFirm.nr.toString().padStart(3, '0')} - ${selectedFirm.name}` : '-'}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Aktif Dönem
                </label>
                <div className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-700 font-medium">
                  {selectedPeriod ? `${selectedPeriod.nr.toString().padStart(2, '0')} (${selectedPeriod.beg_date} - ${selectedPeriod.end_date})` : '-'}
                </div>
              </div>
            </div>

            {/* Selectable Context */}
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  Çalışma Şubesi
                </label>
                <select
                  value={selectedBranch?.nr || ''}
                  onChange={handleBranchChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {branches.map(branch => (
                    <option key={branch.nr} value={branch.nr}>
                      {branch.nr.toString().padStart(2, '0')} - {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <Box className="w-4 h-4 text-blue-600" />
                  Çalışma Ambarı
                </label>
                <select
                  value={selectedWarehouse?.nr || ''}
                  onChange={handleWarehouseChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {warehouses.map(warehouse => (
                    <option key={warehouse.nr} value={warehouse.nr}>
                      {warehouse.nr.toString().padStart(2, '0')} - {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="md:col-span-2 pt-4 border-t flex justify-end">
              <button
                onClick={handleChangeFirmaDonem}
                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors"
              >
                Firma/Dönem Değiştir
              </button>
            </div>
          </div>
        </div>

        {/* Existing Modules (Simplified for Brevity) */}
        {/* Store Settings */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b flex items-center gap-3">
            <Store className="w-6 h-6 text-blue-600" />
            <h3 className="text-lg">Mağaza Bilgileri</h3>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Mağaza Adı</label>
              <input type="text" defaultValue="Merkez Mağaza" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            {/* ... other fields ... */}
          </div>
        </div>

        {/* Other settings placeholders can remain or be fully implemented here similarly */}
      </div>
    </div>
  );
}
