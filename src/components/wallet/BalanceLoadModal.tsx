import { useState, useEffect } from 'react';
import { X, Search, CreditCard, Banknote, Smartphone, Check, Plus, Loader2, Globe, Wifi, MessageSquare, Briefcase, DollarSign } from 'lucide-react';
import { paymentGateway } from '../../services/paymentGateway';
import { customerAPI } from '../../services/api/customers';
import { serviceTransactions } from '../../services/api/serviceTransactions';
import type { Customer } from '../../core/types';
import { formatNumber } from '../../utils/formatNumber';
import { useTheme } from '../../contexts/ThemeContext';
import { ServiceReceipt80mm } from '../pos/ServiceReceipt80mm';

interface BalanceLoadModalProps {
    onClose: () => void;
}

type TabMode = 'internal' | 'service';
type ServiceProvider = 'fastlink' | 'korek' | 'zain';

const SERVICE_PACKAGES: Record<ServiceProvider, { name: string; amount: number; cost: number }[]> = {
    fastlink: [
        { name: 'Weekly Unlimited', amount: 10000, cost: 8500 },
        { name: 'Monthly 10GB', amount: 15000, cost: 13000 },
        { name: 'Monthly Unlimited', amount: 35000, cost: 31000 },
        { name: '3 Months Unlimited', amount: 90000, cost: 82000 },
    ],
    korek: [
        { name: '5,000 IQD Credit', amount: 5000, cost: 4800 },
        { name: '10,000 IQD Credit', amount: 10000, cost: 9600 },
        { name: 'Monthly Internet', amount: 15000, cost: 14000 },
        { name: 'Unlimited Internet', amount: 40000, cost: 38000 },
    ],
    zain: [
        { name: '5,000 IQD Credit', amount: 5000, cost: 4750 },
        { name: '10,000 IQD Credit', amount: 10000, cost: 9500 },
        { name: 'Super Data 20GB', amount: 20000, cost: 18500 },
        { name: 'Unlimited Max', amount: 45000, cost: 42000 },
    ]
};

export function BalanceLoadModal({ onClose }: BalanceLoadModalProps) {
    const { darkMode } = useTheme();

    // States
    const [activeTab, setActiveTab] = useState<TabMode>('internal');
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [amount, setAmount] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'zaincash'>('cash');
    const [processing, setProcessing] = useState(false);

    // UI States
    const [showCustomerSearch, setShowCustomerSearch] = useState(false);
    const [numpadMode, setNumpadMode] = useState<'replace' | 'concat'>('concat');

    // Service States
    const [selectedProvider, setSelectedProvider] = useState<ServiceProvider>('fastlink');
    const [servicePhoneNumber, setServicePhoneNumber] = useState('');
    const [selectedPackage, setSelectedPackage] = useState<{ name: string; amount: number; cost: number } | null>(null);
    const [sendSMS, setSendSMS] = useState(false);

    // Receipt State
    const [receiptData, setReceiptData] = useState<any>(null);

    // Load Customers - Removed initial loadEx
    useEffect(() => {
        if (searchQuery.length >= 2) {
            const timer = setTimeout(() => {
                handleSearch(searchQuery);
            }, 300);
            return () => clearTimeout(timer);
        } else {
            setCustomers([]);
        }
    }, [searchQuery]);

    const handleSearch = async (query: string) => {
        setLoading(true);
        const data = await customerAPI.search(query);
        setCustomers(data);
        setLoading(false);
    };

    // No longer filtering client-side, using `customers` directly as search results
    const filteredCustomers = customers;

    const handleNumpadClick = (value: string) => {
        if (value === 'C') {
            setAmount('');
            setSelectedPackage(null);
            return;
        }

        if (numpadMode === 'concat') {
            setAmount(prev => {
                // If appending '.' and already has it, ignore
                if (value === '.' && prev.includes('.')) return prev;
                // If empty and appending '.', treat as '0.'
                if (value === '.' && prev === '') return '0.';

                // Prevent multiple leading zeros
                if (prev === '0' && value !== '.') {
                    return value;
                }

                const newValue = prev + value;
                return newValue;
            });
            setSelectedPackage(null);
        } else {
            // Replace mode
            setAmount(value);
            setSelectedPackage(null);
        }
    };

    const handleBackspace = () => {
        setAmount(prev => prev.slice(0, -1));
        setSelectedPackage(null);
    };

    const handleLoadBalance = async () => {
        const value = parseFloat(amount);
        if (!value || value <= 0) return;

        // Internal Balance Check
        if (activeTab === 'internal' && !selectedCustomer) {
            alert("Lütfen müşteri seçiniz.");
            return;
        }

        // Service Top-up Check
        if (activeTab === 'service' && !servicePhoneNumber) {
            alert("Lütfen telefon numarası giriniz.");
            return;
        }

        setProcessing(true);
        try {
            // 1. Process Payment (Common for both)
            let transactionId = `TRX-${Date.now()}`;

            if (paymentMethod === 'zaincash') {
                const result = await paymentGateway.initiatePayment('zaincash', {
                    amount: value,
                    currency: 'IQD',
                    orderId: transactionId,
                    description: activeTab === 'internal'
                        ? `Balance Load - ${selectedCustomer?.name}`
                        : `${selectedProvider.toUpperCase()} Top-up - ${servicePhoneNumber}`
                });

                if (!result.success) {
                    alert(`Payment Failed: ${result.error}`);
                    setProcessing(false);
                    return;
                }

                if (result.paymentUrl) {
                    window.open(result.paymentUrl, '_blank');
                    const confirmed = confirm("Please complete payment in the new tab. Click OK when done.");
                    if (!confirmed) {
                        setProcessing(false);
                        return;
                    }
                }
            }

            // 2. Execution Logic
            if (activeTab === 'internal' && selectedCustomer) {
                // Internal: Update Customer Balance
                const success = await customerAPI.addBalance(selectedCustomer.id, value);
                if (success) {
                    // Show Receipt
                    setReceiptData({
                        type: 'internal',
                        provider: 'System',
                        target: selectedCustomer.name,
                        amount: value,
                        currency: 'IQD',
                        transactionId: transactionId,
                        date: new Date().toISOString(),
                        paymentMethod: paymentMethod
                    });
                } else {
                    alert("Veritabanı güncellenemedi.");
                }
            } else {
                // Service: Record Transaction (Manual)
                const cost = selectedPackage ? selectedPackage.cost : 0;

                await serviceTransactions.create({
                    firm_nr: '000', // Default
                    transaction_type: 'topup',
                    provider: selectedProvider,
                    target_number: servicePhoneNumber,
                    package_name: selectedPackage?.name || 'Custom Amount',
                    amount: value,
                    cost: cost,
                    currency: 'IQD',
                    payment_method: paymentMethod,
                    status: 'completed',
                    transaction_ref: transactionId,
                    sms_sent: sendSMS
                });

                // Show Receipt
                setReceiptData({
                    type: 'service',
                    provider: selectedProvider,
                    target: selectedCustomer ? `${selectedCustomer.name} (${servicePhoneNumber})` : servicePhoneNumber,
                    amount: value,
                    currency: 'IQD',
                    transactionId: transactionId,
                    date: new Date().toISOString(),
                    paymentMethod: paymentMethod,
                    smsSent: sendSMS
                });
            }

        } catch (err) {
            console.error(err);
            alert("İşlem sırasında hata oluştu");
        } finally {
            setProcessing(false);
        }
    };

    if (receiptData) {
        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                <div className={`w-full max-w-md ${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-2xl p-6`}>
                    <ServiceReceipt80mm
                        data={receiptData}
                        onClose={() => {
                            setReceiptData(null);
                            onClose();
                        }}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl rounded-lg overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
                {/* Header - POS Style */}
                <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'border-gray-700 bg-gradient-to-r from-gray-700 to-gray-600' : 'border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700'}`}>
                    <h3 className="text-xl text-white flex items-center gap-2 font-bold">
                        <DollarSign className="w-6 h-6" />
                        Cüzdan ve Hizmet Yükleme
                    </h3>
                    <button onClick={onClose} className="text-white hover:text-gray-200 p-2 rounded-full hover:bg-white/10 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden grid grid-cols-3 gap-4 p-4">

                    {/* LEFT COLUMN: CONTEXT & SUMMARY */}
                    <div className={`flex flex-col gap-4 overflow-y-auto pr-2`}>
                        {/* Tab Switcher - Premium Style */}
                        <div className={`p-1 rounded-xl flex gap-1 ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                            <button
                                onClick={() => setActiveTab('internal')}
                                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'internal'
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                Müşteri Bakiyesi
                            </button>
                            <button
                                onClick={() => setActiveTab('service')}
                                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'service'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                Hizmet / Kontör
                            </button>
                        </div>

                        {/* Service / Mode Specific Details */}
                        {activeTab === 'service' ? (
                            <div className={`border rounded-xl p-5 space-y-5 ${darkMode ? 'bg-gray-800 border-gray-700 shadow-inner' : 'bg-blue-50/50 border-blue-100 shadow-inner'}`}>
                                <h4 className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-gray-400' : 'text-blue-800/60'}`}>Hizmet Detayları</h4>

                                <div className="grid grid-cols-3 gap-2">
                                    {(['fastlink', 'korek', 'zain'] as ServiceProvider[]).map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setSelectedProvider(p)}
                                            className={`p-3 border-2 rounded-xl flex flex-col items-center gap-2 transition-all ${selectedProvider === p
                                                ? 'border-blue-600 bg-blue-600 text-white shadow-lg'
                                                : darkMode ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-white border-gray-200 text-gray-500'
                                                }`}
                                        >
                                            {p === 'fastlink' ? <Wifi className="w-6 h-6" /> : p === 'korek' ? <Smartphone className="w-6 h-6" /> : <Globe className="w-6 h-6" />}
                                            <span className="text-[10px] uppercase font-black">{p}</span>
                                        </button>
                                    ))}
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wide">Hedef Numara</label>
                                    <input
                                        type="text"
                                        value={servicePhoneNumber}
                                        onChange={(e) => setServicePhoneNumber(e.target.value)}
                                        placeholder="0750 XXX XX XX"
                                        className={`w-full px-4 py-3 rounded-xl border-2 text-xl font-mono focus:border-blue-500 outline-none transition-all ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-200'}`}
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 rounded-xl border shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <MessageSquare className={`w-5 h-5 ${sendSMS ? 'text-blue-500' : 'text-gray-400'}`} />
                                        <span className="text-sm font-bold">SMS Bildirimi</span>
                                    </div>
                                    <button
                                        onClick={() => setSendSMS(!sendSMS)}
                                        className={`w-12 h-6 rounded-full transition-all relative ${sendSMS ? 'bg-blue-600' : 'bg-gray-300'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${sendSMS ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400 opacity-50 space-y-4">
                                <Briefcase className="w-16 h-16" />
                                <p className="text-sm font-medium italic">Müşteri bakiyesi yüklemek için sağ taraftan miktar seçin.</p>
                            </div>
                        )}

                        {/* Customer Summary (Always Visible if selected) */}
                        <div className={`mt-auto border rounded-xl p-5 space-y-4 ${darkMode ? 'bg-gray-800 border-gray-700 shadow-inner' : 'bg-gray-50 border-gray-200 shadow-inner'}`}>
                            <h4 className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Müşteri Bağlantısı</h4>

                            {selectedCustomer ? (
                                <div className="flex items-center justify-between bg-white dark:bg-gray-700 p-4 rounded-xl border shadow-sm group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-xl shadow-inner">
                                            {selectedCustomer.name[0]}
                                        </div>
                                        <div>
                                            <div className="font-black text-blue-600">{selectedCustomer.name}</div>
                                            <div className="font-mono text-sm opacity-60">{selectedCustomer.phone}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedCustomer(null)}
                                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowCustomerSearch(true)}
                                    className={`w-full py-8 border-2 border-dashed rounded-xl flex flex-col items-center gap-3 transition-all group ${darkMode ? 'border-gray-700 hover:border-blue-500' : 'border-gray-300 hover:border-blue-600 bg-white hover:bg-blue-50/10'}`}
                                >
                                    <Search className="w-8 h-8 text-gray-300 group-hover:text-blue-600" />
                                    <span className="text-sm font-black text-gray-400 group-hover:text-blue-600 uppercase tracking-widest">Müşteri Seçilmedi</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* MIDDLE COLUMN: AMOUNT & PAYMENT & PACKAGES */}
                    <div className="flex flex-col gap-4 overflow-y-auto px-1">
                        {/* Amount Display - POS Style */}
                        <div className={`p-6 rounded-2xl border-4 text-center transition-all ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-blue-50 shadow-xl shadow-blue-500/5'}`}>
                            <div className="text-[10px] text-blue-600 font-black uppercase tracking-[0.2em] mb-2">Yüklenecek Tutar</div>
                            <div className="flex items-baseline justify-center gap-3">
                                <span className="text-7xl font-black font-mono tracking-tighter leading-none">
                                    {amount || '0'}
                                </span>
                                <span className="text-2xl font-black text-gray-300 tracking-widest">IQD</span>
                            </div>
                        </div>

                        {/* Payment Method - POS Style */}
                        <div className="grid grid-cols-3 gap-3">
                            {(['cash', 'card', 'zaincash'] as const).map((method) => (
                                <button
                                    key={method}
                                    onClick={() => setPaymentMethod(method)}
                                    className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all shadow-sm ${paymentMethod === method
                                        ? (method === 'cash' ? 'border-green-500 bg-green-50 dark:bg-green-900/10 text-green-600 ring-2 ring-green-500' :
                                            method === 'card' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10 text-blue-600 ring-2 ring-blue-500' :
                                                'border-purple-500 bg-purple-50 dark:bg-purple-900/10 text-purple-600 ring-2 ring-purple-500')
                                        : darkMode ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                        }`}
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${paymentMethod === method ? 'shadow-inner' : 'bg-gray-100 dark:bg-gray-700'
                                        }`}>
                                        {method === 'cash' ? <Banknote className="w-6 h-6" /> :
                                            method === 'card' ? <CreditCard className="w-6 h-6" /> :
                                                <Smartphone className="w-6 h-6" />}
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-wide">{
                                        method === 'cash' ? 'Nakit' :
                                            method === 'card' ? 'Kart' : 'ZainCash'
                                    }</span>
                                </button>
                            ))}
                        </div>

                        {/* Packages / Quick Amounts */}
                        <div className={`flex-1 border rounded-2xl p-4 overflow-y-auto ${darkMode ? 'bg-gray-800 border-gray-700 shadow-inner' : 'bg-white border-gray-200 shadow-inner'}`}>
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                                {activeTab === 'service' ? 'Hazır Servis Paketleri' : 'Hızlı Bakiye Miktarları'}
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                {activeTab === 'service' ? (
                                    SERVICE_PACKAGES[selectedProvider].map((pkg) => (
                                        <button
                                            key={pkg.name}
                                            onClick={() => {
                                                setAmount(pkg.amount.toString());
                                                setSelectedPackage(pkg);
                                                setNumpadMode('replace');
                                            }}
                                            className={`p-4 border-2 rounded-xl text-left transition-all ${selectedPackage?.name === pkg.name
                                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 shadow-md ring-1 ring-blue-600'
                                                : darkMode ? 'border-gray-700 hover:border-gray-500 hover:bg-gray-700' : 'border-gray-100 hover:border-blue-300 bg-gray-50/50 hover:bg-white'
                                                }`}
                                        >
                                            <div className="text-[10px] font-black uppercase tracking-tight text-gray-500 mb-2 truncate">{pkg.name}</div>
                                            <div className="text-xl font-black text-blue-600">
                                                {formatNumber(pkg.amount, 0)} <span className="text-xs">IQD</span>
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    [5000, 10000, 20000, 25000, 50000, 100000].map(amt => (
                                        <button
                                            key={amt}
                                            onClick={() => {
                                                setAmount(amt.toString());
                                                setNumpadMode('replace');
                                            }}
                                            className={`p-5 border-2 rounded-xl text-2xl font-black transition-all ${amount === amt.toString()
                                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600 shadow-md'
                                                : darkMode ? 'border-gray-700 hover:border-gray-500 hover:bg-gray-700' : 'border-gray-100 hover:border-blue-300 bg-gray-50/50 hover:bg-white'
                                                }`}
                                        >
                                            {formatNumber(amt, 0)}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: NUMPAD */}
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col h-full gap-3">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Sayısal Tuş Takımı</span>
                                <div className={`flex p-1 rounded-lg border-2 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-300'}`}>
                                    <button
                                        onClick={() => setNumpadMode('concat')}
                                        className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${numpadMode === 'concat' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600' : 'text-gray-400'}`}
                                    >ÜSTÜNE EKLE</button>
                                    <button
                                        onClick={() => setNumpadMode('replace')}
                                        className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${numpadMode === 'replace' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600' : 'text-gray-400'}`}
                                    >YERİNE YAZ</button>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 flex-1">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, '00', 0].map((num) => (
                                    <button
                                        key={num}
                                        onClick={() => handleNumpadClick(num.toString())}
                                        className={`text-3xl font-black rounded-2xl transition-all shadow-md border-b-4 active:border-b-0 active:translate-y-1 ${darkMode
                                            ? 'bg-gray-800 border-gray-900 hover:bg-gray-700 text-white active:bg-blue-900/50'
                                            : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700 active:bg-blue-50'
                                            }`}
                                    >
                                        {num}
                                    </button>
                                ))}
                                <button
                                    onClick={() => handleNumpadClick('C')}
                                    className={`text-3xl rounded-2xl flex items-center justify-center transition-all shadow-md border-b-4 active:border-b-0 active:translate-y-1 ${darkMode
                                        ? 'bg-gray-800 border-gray-900 text-red-500 hover:bg-red-500/10'
                                        : 'bg-white border-gray-200 text-red-500 hover:bg-red-50'
                                        }`}
                                >
                                    <X className="w-8 h-8" />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <button
                                    onClick={() => setAmount('')}
                                    className={`py-4 text-xs font-black uppercase tracking-widest rounded-xl transition-all border-2 ${darkMode ? 'border-red-900/50 text-red-500 hover:bg-red-900/10' : 'border-red-100 text-red-500 hover:bg-red-50'}`}
                                >
                                    TEMİZLE
                                </button>
                                <button
                                    onClick={() => handleLoadBalance()}
                                    className="py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all"
                                >
                                    TAMAM
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer - Final Actions */}
                <div className={`p-5 border-t flex gap-4 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                    <button
                        onClick={onClose}
                        className={`flex-1 px-4 py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${darkMode
                            ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            : 'bg-white border-2 border-gray-200 text-gray-500 hover:bg-gray-100'
                            }`}
                    >
                        İptal
                    </button>
                    <button
                        onClick={handleLoadBalance}
                        disabled={processing || !amount || parseFloat(amount) <= 0 || (activeTab === 'service' && !servicePhoneNumber) || (activeTab === 'internal' && !selectedCustomer)}
                        className="flex-[2] px-4 py-5 bg-green-600 text-white rounded-2xl font-black text-xl hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-4 shadow-xl shadow-green-500/30"
                    >
                        {processing ? (
                            <Loader2 className="w-8 h-8 animate-spin" />
                        ) : (
                            <><Check className="w-8 h-8" /> İŞLEMİ TAMAMLA</>
                        )}
                    </button>
                </div>

                {/* Customer Search Overlay */}
                {showCustomerSearch && (
                    <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-center justify-center p-12">
                        <div className={`w-full max-w-2xl h-[80vh] flex flex-col rounded-3xl shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden ${darkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white'}`}>
                            <div className={`p-6 border-b flex items-center justify-between ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                                <h4 className="text-xl font-black flex items-center gap-3">
                                    <Search className="w-6 h-6 text-blue-600" />
                                    Müşteri Seçin
                                </h4>
                                <button onClick={() => setShowCustomerSearch(false)} className="p-2 hover:bg-red-500 hover:text-white rounded-xl transition-all">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="p-6 border-b bg-white/50 dark:bg-black/20">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="İsim, telefon veya kod ile hızlı arama..."
                                    autoFocus
                                    className={`w-full px-6 py-4 rounded-2xl border-4 text-xl outline-none focus:border-blue-600 transition-all shadow-inner ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-50 border-gray-200'}`}
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50/30 dark:bg-black/10">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
                                        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                                        <p className="font-bold uppercase tracking-widest text-xs">Aranıyor...</p>
                                    </div>
                                ) : filteredCustomers.length > 0 ? (
                                    filteredCustomers.map((customer) => (
                                        <button
                                            key={customer.id}
                                            onClick={() => {
                                                setSelectedCustomer(customer);
                                                if (activeTab === 'service') setServicePhoneNumber(customer.phone);
                                                setShowCustomerSearch(false);
                                            }}
                                            className={`w-full p-5 rounded-2xl border-2 text-left flex items-center justify-between transition-all group ${darkMode ? 'border-gray-800 bg-gray-800/40 hover:bg-gray-800 hover:border-blue-500' : 'border-white bg-white hover:border-blue-500 shadow-sm hover:shadow-xl'}`}
                                        >
                                            <div className="flex items-center gap-5">
                                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center font-black text-2xl shadow-lg">
                                                    {customer.name[0]}
                                                </div>
                                                <div>
                                                    <div className="font-black text-lg group-hover:text-blue-600 transition-colors uppercase">{customer.name}</div>
                                                    <div className="font-mono text-sm opacity-50">{customer.phone}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-black text-blue-600 group-hover:scale-110 transition-transform origin-right">
                                                    {formatNumber(customer.balance || 0, 0)}
                                                </div>
                                                <div className="text-[10px] font-black uppercase text-gray-400">IQD Bakiye</div>
                                            </div>
                                        </button>
                                    ))
                                ) : searchQuery.length < 2 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-4 opacity-40">
                                        <Search className="w-20 h-20" />
                                        <p className="font-black uppercase tracking-[0.3em]">Aramak için yazın</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-4 opacity-40">
                                        <X className="w-20 h-20" />
                                        <p className="font-black uppercase tracking-[0.3em]">Sonuç bulunamadı</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
