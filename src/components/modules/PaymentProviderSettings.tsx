import { useState, useEffect } from 'react';
import { X, Save, Eye, EyeOff, Smartphone, CreditCard, Check, AlertTriangle } from 'lucide-react';
import { paymentGateway, type PaymentProvider } from '../../services/paymentGateway';
import { useTheme } from '../../contexts/ThemeContext';

interface PaymentProviderSettingsProps {
  onClose: () => void;
}

/**
 * Payment Provider Settings Component
 * FIB ve Fast Pay gibi ödeme sağlayıcılarının yapılandırılması
 */
export function PaymentProviderSettings({ onClose }: PaymentProviderSettingsProps) {
  const { darkMode } = useTheme();
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = () => {
    // Load all providers (both enabled and disabled)
    const fibConfig = loadProviderFromStorage('fib');
    const fastPayConfig = loadProviderFromStorage('fastpay');
    setProviders([fibConfig, fastPayConfig]);
  };

  const loadProviderFromStorage = (providerId: string): PaymentProvider => {
    const storedConfig = localStorage.getItem(`payment_provider_${providerId}`);
    
    if (storedConfig) {
      return JSON.parse(storedConfig);
    }

    // Default konfigürasyon
    const defaults: { [key: string]: PaymentProvider } = {
      fib: {
        id: 'fib',
        name: 'FIB (First Iraqi Bank)',
        logo: 'ğŸ¦',
        enabled: false,
        config: {
          apiUrl: 'https://fib.iq/api/v1',
          merchantId: '',
          apiKey: ''
        }
      },
      fastpay: {
        id: 'fastpay',
        name: 'Fast Pay',
        logo: '⚡',
        enabled: false,
        config: {
          apiUrl: 'https://api.fast-pay.iq/v1',
          apiKey: '',
          storeId: ''
        }
      }
    };

    return defaults[providerId];
  };

  const handleSaveProvider = () => {
    if (!selectedProvider) return;

    // Validate
    if (selectedProvider.id === 'fib') {
      if (!selectedProvider.config.merchantId || !selectedProvider.config.apiKey) {
        alert('Lütfen Merchant ID ve API Key bilgilerini girin!');
        return;
      }
    } else if (selectedProvider.id === 'fastpay') {
      if (!selectedProvider.config.storeId || !selectedProvider.config.apiKey) {
        alert('Lütfen Store ID ve API Key bilgilerini girin!');
        return;
      }
    }

    // Save to localStorage
    localStorage.setItem(`payment_provider_${selectedProvider.id}`, JSON.stringify(selectedProvider));
    
    // Update PaymentGatewayManager
    paymentGateway.saveProviderConfig(selectedProvider.id, selectedProvider);

    // Reload providers
    loadProviders();

    alert(`${selectedProvider.name} ayarları kaydedildi!`);
    setSelectedProvider(null);
  };

  const handleTestConnection = async () => {
    if (!selectedProvider) return;

    setTestResult(null);
    
    try {
      // Test payment initiation (mock)
      const result = await paymentGateway.initiatePayment(
        selectedProvider.id,
        {
          amount: 1000,
          currency: 'IQD',
          orderId: `TEST-${Date.now()}`,
          description: 'Test Payment'
        }
      );

      if (result.success) {
        setTestResult({
          success: true,
          message: 'Bağlantı testi başarılı! Ödeme sağlayıcısı ile iletişim kuruldu.'
        });
      } else {
        setTestResult({
          success: false,
          message: `Bağlantı testi başarısız: ${result.error}`
        });
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: `Bağlantı hatası: ${error.message}`
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700'}`}>
          <h3 className={`text-lg flex items-center gap-2 ${darkMode ? 'text-white' : 'text-white'}`}>
            <Smartphone className="w-5 h-5" />
            Ödeme Sağlayıcı Ayarları
          </h3>
          <button onClick={onClose} className={`${darkMode ? 'text-gray-300 hover:text-white' : 'text-white hover:text-gray-200'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Provider List */}
            <div>
              <h4 className={`text-sm font-medium mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Ödeme Sağlayıcıları
              </h4>
              <div className="space-y-3">
                {providers.map(provider => (
                  <button
                    key={provider.id}
                    onClick={() => setSelectedProvider(provider)}
                    className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                      selectedProvider?.id === provider.id
                        ? darkMode
                          ? 'border-blue-500 bg-blue-900/30'
                          : 'border-blue-600 bg-blue-50'
                        : darkMode
                        ? 'border-gray-700 bg-gray-800 hover:border-blue-500'
                        : 'border-gray-200 bg-white hover:border-blue-400'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl">{provider.logo}</div>
                        <div>
                          <h5 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {provider.name}
                          </h5>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              provider.enabled
                                ? 'bg-green-100 text-green-700'
                                : darkMode
                                ? 'bg-gray-700 text-gray-400'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {provider.enabled ? 'Aktif' : 'Devre Dışı'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {selectedProvider?.id === provider.id && (
                        <Check className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Info Box */}
              <div className={`mt-6 p-4 border rounded-lg ${darkMode ? 'border-blue-700 bg-blue-900/20' : 'border-blue-200 bg-blue-50'}`}>
                <h5 className={`text-sm font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-blue-400' : 'text-blue-800'}`}>
                  <AlertTriangle className="w-4 h-4" />
                  Önemli Bilgi
                </h5>
                <ul className={`text-xs space-y-1 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                  <li>• API bilgilerinizi ilgili ödeme sağlayıcısının yönetim panelinden alın</li>
                  <li>• API anahtarlarınızı güvenli bir şekilde saklayın</li>
                  <li>• Test modu kullanarak bağlantıyı doğrulayın</li>
                  <li>• Production ortamında gerçek API bilgileri kullanın</li>
                </ul>
              </div>
            </div>

            {/* Provider Settings */}
            <div>
              {selectedProvider ? (
                <div className="space-y-4">
                  <div className={`p-4 border rounded-lg ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-3xl">{selectedProvider.logo}</span>
                      <h4 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {selectedProvider.name}
                      </h4>
                    </div>

                    {/* Enable/Disable */}
                    <div className="mb-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedProvider.enabled}
                          onChange={(e) => setSelectedProvider({
                            ...selectedProvider,
                            enabled: e.target.checked
                          })}
                          className="w-5 h-5"
                        />
                        <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Bu ödeme sağlayıcısını aktif et
                        </span>
                      </label>
                    </div>

                    {/* FIB Settings */}
                    {selectedProvider.id === 'fib' && (
                      <div className="space-y-3">
                        <div>
                          <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            API URL
                          </label>
                          <input
                            type="text"
                            value={selectedProvider.config.apiUrl || ''}
                            onChange={(e) => setSelectedProvider({
                              ...selectedProvider,
                              config: { ...selectedProvider.config, apiUrl: e.target.value }
                            })}
                            className={`w-full px-3 py-2 border rounded text-sm ${
                              darkMode
                              ? 'bg-gray-700 border-gray-600 text-white'
                              : 'bg-white border-gray-300'
                            }`}
                            placeholder="https://fib.iq/api/v1"
                          />
                        </div>

                        <div>
                          <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Merchant ID *
                          </label>
                          <input
                            type="text"
                            value={selectedProvider.config.merchantId || ''}
                            onChange={(e) => setSelectedProvider({
                              ...selectedProvider,
                              config: { ...selectedProvider.config, merchantId: e.target.value }
                            })}
                            className={`w-full px-3 py-2 border rounded text-sm ${
                              darkMode
                              ? 'bg-gray-700 border-gray-600 text-white'
                              : 'bg-white border-gray-300'
                            }`}
                            placeholder="Merchant ID giriniz"
                          />
                        </div>

                        <div>
                          <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            API Key *
                          </label>
                          <div className="relative">
                            <input
                              type={showApiKey ? 'text' : 'password'}
                              value={selectedProvider.config.apiKey || ''}
                              onChange={(e) => setSelectedProvider({
                                ...selectedProvider,
                                config: { ...selectedProvider.config, apiKey: e.target.value }
                              })}
                              className={`w-full px-3 py-2 border rounded text-sm pr-10 ${
                                darkMode
                                ? 'bg-gray-700 border-gray-600 text-white'
                                : 'bg-white border-gray-300'
                              }`}
                              placeholder="API Key giriniz"
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKey(!showApiKey)}
                              className={`absolute right-2 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}
                            >
                              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Fast Pay Settings */}
                    {selectedProvider.id === 'fastpay' && (
                      <div className="space-y-3">
                        <div>
                          <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            API URL
                          </label>
                          <input
                            type="text"
                            value={selectedProvider.config.apiUrl || ''}
                            onChange={(e) => setSelectedProvider({
                              ...selectedProvider,
                              config: { ...selectedProvider.config, apiUrl: e.target.value }
                            })}
                            className={`w-full px-3 py-2 border rounded text-sm ${
                              darkMode
                              ? 'bg-gray-700 border-gray-600 text-white'
                              : 'bg-white border-gray-300'
                            }`}
                            placeholder="https://api.fast-pay.iq/v1"
                          />
                        </div>

                        <div>
                          <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Store ID *
                          </label>
                          <input
                            type="text"
                            value={selectedProvider.config.storeId || ''}
                            onChange={(e) => setSelectedProvider({
                              ...selectedProvider,
                              config: { ...selectedProvider.config, storeId: e.target.value }
                            })}
                            className={`w-full px-3 py-2 border rounded text-sm ${
                              darkMode
                              ? 'bg-gray-700 border-gray-600 text-white'
                              : 'bg-white border-gray-300'
                            }`}
                            placeholder="Store ID giriniz"
                          />
                        </div>

                        <div>
                          <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            API Key *
                          </label>
                          <div className="relative">
                            <input
                              type={showApiKey ? 'text' : 'password'}
                              value={selectedProvider.config.apiKey || ''}
                              onChange={(e) => setSelectedProvider({
                                ...selectedProvider,
                                config: { ...selectedProvider.config, apiKey: e.target.value }
                              })}
                              className={`w-full px-3 py-2 border rounded text-sm pr-10 ${
                                darkMode
                                ? 'bg-gray-700 border-gray-600 text-white'
                                : 'bg-white border-gray-300'
                              }`}
                              placeholder="API Key giriniz"
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKey(!showApiKey)}
                              className={`absolute right-2 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}
                            >
                              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Test Result */}
                  {testResult && (
                    <div className={`p-4 rounded-lg border ${
                      testResult.success
                        ? darkMode
                          ? 'bg-green-900/20 border-green-700 text-green-400'
                          : 'bg-green-50 border-green-200 text-green-800'
                        : darkMode
                        ? 'bg-red-900/20 border-red-700 text-red-400'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                      <p className="text-sm">{testResult.message}</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleTestConnection}
                      className={`flex-1 py-2 border rounded transition-colors ${
                        darkMode
                        ? 'border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600'
                        : 'border-gray-300 bg-white hover:bg-gray-50'
                      }`}
                    >
                      Bağlantıyı Test Et
                    </button>
                    <button
                      onClick={handleSaveProvider}
                      className="flex-1 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Kaydet
                    </button>
                  </div>

                  {/* Documentation Links */}
                  <div className={`p-3 rounded-lg border text-xs ${darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
                    <p className={`mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Dokümantasyon:
                    </p>
                    {selectedProvider.id === 'fib' && (
                      <a
                        href="https://fib.iq/integrations/web-payments/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline block"
                      >
                        FIB Web Payments Documentation →
                      </a>
                    )}
                    {selectedProvider.id === 'fastpay' && (
                      <a
                        href="https://developer.fast-pay.iq/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline block"
                      >
                        Fast Pay Developer Documentation →
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className={`h-full flex items-center justify-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <div className="text-center">
                    <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Bir ödeme sağlayıcısı seçin</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded transition-colors ${
              darkMode
              ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

