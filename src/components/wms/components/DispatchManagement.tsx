// 🚚 Dispatch Management - Sevkiyat Yönetimi
// Assign drivers, manage vehicle status, and track dispatch

import { useState, useEffect } from 'react';
import {
    Truck, User, MapPin, Calendar, Clock, CheckCircle,
    XCircle, Navigation, Phone, FileText, ChevronRight,
    Search, Shield, AlertTriangle
} from 'lucide-react';

interface DispatchManagementProps {
    darkMode: boolean;
    onBack: () => void;
}

interface DispatchVehicle {
    id: string;
    plate: string;
    driver_name?: string;
    driver_phone?: string;
    status: 'loading' | 'ready_to_dispatch' | 'dispatched' | 'delivered';
    route: string;
    load_percentage: number;
    departure_time?: string;
}

interface Driver {
    id: string;
    name: string;
    phone: string;
    status: 'available' | 'on_duty' | 'off_duty';
    license_class: string;
}

export function DispatchManagement({ darkMode, onBack }: DispatchManagementProps) {
    const [vehicles, setVehicles] = useState<DispatchVehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);

    const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
    const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

    useEffect(() => {
        // Mock Data Load
        setVehicles([
            { id: '1', plate: '34 ABC 123', status: 'ready_to_dispatch', route: 'Bağdat Merkez', load_percentage: 85, driver_name: 'Ali Demir', driver_phone: '555-0001' },
            { id: '2', plate: '34 DEF 456', status: 'loading', route: 'Kerkük Kuzey', load_percentage: 45 },
            { id: '3', plate: '34 GHI 789', status: 'dispatched', route: 'Basra Liman', load_percentage: 100, driver_name: 'Mehmet Yılmaz', driver_phone: '555-0002', departure_time: '10:30' },
        ]);

        setDrivers([
            { id: 'd1', name: 'Ayşe Kaya', phone: '555-1001', status: 'available', license_class: 'E' },
            { id: 'd2', name: 'Veli Can', phone: '555-1002', status: 'available', license_class: 'C' },
            { id: 'd3', name: 'Hasan Yücel', phone: '555-1003', status: 'off_duty', license_class: 'E' },
        ]);
    }, []);

    const handleAssignDriver = (vehicleId: string, driver: Driver) => {
        setVehicles(prev => prev.map(v =>
            v.id === vehicleId ? { ...v, driver_name: driver.name, driver_phone: driver.phone } : v
        ));
        setDrivers(prev => prev.map(d =>
            d.id === driver.id ? { ...d, status: 'on_duty' } : d
        ));
        alert(`${driver.name} araca atandı.`);
    };

    const handleDispatch = (vehicleId: string) => {
        setVehicles(prev => prev.map(v =>
            v.id === vehicleId ? { ...v, status: 'dispatched', departure_time: new Date().toLocaleTimeString() } : v
        ));
        alert('Araç yola çıktı!');
    };

    const getStatusBadge = (status: string) => {
        const config: any = {
            loading: { bg: 'bg-blue-100 text-blue-700', label: 'Yükleniyor', icon: Truck },
            ready_to_dispatch: { bg: 'bg-yellow-100 text-yellow-700', label: 'Sevk Hazır', icon: CheckCircle },
            dispatched: { bg: 'bg-green-100 text-green-700', label: 'Yolda', icon: Navigation },
            delivered: { bg: 'bg-gray-100 text-gray-700', label: 'Teslim Edildi', icon: CheckCircle },
        };
        const c = config[status] || config.loading;
        const Icon = c.icon;

        return (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${c.bg}`}>
                <Icon className="w-3 h-3" />
                {c.label}
            </span>
        );
    };

    return (
        <div className={`min-h-screen ${bgClass} p-6`}>
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <button onClick={onBack} className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600">
                        ← Geri
                    </button>
                    <div>
                        <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Sevkiyat Yönetimi</h1>
                        <p className="text-gray-500">Sürücü atama ve araç çıkış işlemleri</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Vehicle List */}
                    <div className="lg:col-span-2 space-y-4">
                        {vehicles.map(vehicle => (
                            <div key={vehicle.id} className={`${cardClass} border rounded-xl p-6`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                            <Truck className="w-8 h-8 text-blue-600" />
                                        </div>
                                        <div>
                                            <h3 className={`text-xl font-bold ${textClass}`}>{vehicle.plate}</h3>
                                            <div className="text-sm text-gray-500 flex items-center gap-2">
                                                <MapPin className="w-3 h-3" /> {vehicle.route}
                                            </div>
                                        </div>
                                    </div>
                                    {getStatusBadge(vehicle.status)}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <div className="text-xs text-gray-500 mb-1">Yük Durumu</div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500" style={{ width: `${vehicle.load_percentage}%` }} />
                                            </div>
                                            <span className="font-bold text-sm">{vehicle.load_percentage}%</span>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <div className="text-xs text-gray-500 mb-1">Sürücü</div>
                                        {vehicle.driver_name ? (
                                            <div className="flex items-center gap-2 font-semibold text-sm">
                                                <User className="w-4 h-4 text-gray-400" />
                                                {vehicle.driver_name}
                                                <span className="text-xs text-gray-400 font-normal">({vehicle.driver_phone})</span>
                                            </div>
                                        ) : (
                                            <div className="text-sm text-red-500 font-medium flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" /> Sürücü Atanmadı
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                    {vehicle.status === 'ready_to_dispatch' && vehicle.driver_name ? (
                                        <button
                                            onClick={() => handleDispatch(vehicle.id)}
                                            className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
                                        >
                                            <Navigation className="w-4 h-4" />
                                            Sevkiyata Çıkar
                                        </button>
                                    ) : !vehicle.driver_name ? (
                                        <button
                                            onClick={() => setSelectedVehicle(vehicle.id)}
                                            className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
                                        >
                                            <User className="w-4 h-4" />
                                            Sürücü Ata
                                        </button>
                                    ) : (
                                        <button disabled className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-400 rounded-lg font-semibold cursor-not-allowed">
                                            İşlem Yapılamaz
                                        </button>
                                    )}

                                    <button className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <FileText className="w-4 h-4 text-gray-500" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Sidebar / Driver Selection */}
                    <div className="space-y-6">
                        {selectedVehicle ? (
                            <div className={`${cardClass} border rounded-xl p-6`}>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className={`font-bold ${textClass}`}>Sürücü Seç</h3>
                                    <button onClick={() => setSelectedVehicle(null)} className="text-sm text-red-500">İptal</button>
                                </div>

                                <div className="space-y-3">
                                    {drivers.filter(d => d.status === 'available').length === 0 && (
                                        <div className="text-sm text-gray-500 text-center py-4">Müsait sürücü yok</div>
                                    )}
                                    {drivers.filter(d => d.status === 'available').map(driver => (
                                        <button
                                            key={driver.id}
                                            onClick={() => {
                                                handleAssignDriver(selectedVehicle, driver);
                                                setSelectedVehicle(null);
                                            }}
                                            className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between items-center"
                                        >
                                            <div>
                                                <div className={`font-semibold ${textClass}`}>{driver.name}</div>
                                                <div className="text-xs text-gray-500">{driver.phone} • Sınıf {driver.license_class}</div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-gray-400" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className={`${cardClass} border rounded-xl p-6`}>
                                <h3 className={`font-bold ${textClass} mb-4`}>Özet İstatistikler</h3>
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Toplam Araç</span>
                                        <span className={textClass}>{vehicles.length}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Yoldaki Araçlar</span>
                                        <span className="text-green-500 font-bold">
                                            {vehicles.filter(v => v.status === 'dispatched').length}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Müsait Sürücü</span>
                                        <span className={textClass}>
                                            {drivers.filter(d => d.status === 'available').length}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

