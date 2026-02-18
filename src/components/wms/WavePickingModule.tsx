import React, { useState, useEffect } from 'react';
import {
    Box, ClipboardList, Navigation, CheckSquare,
    MapPin, User, ChevronRight, Package, Search
} from 'lucide-react';
import { pickingService, PickWave, PickTask } from '../../services/wms/pickingService';

export function WavePickingModule() {
    const [waves, setWaves] = useState<PickWave[]>([]);
    const [selectedWave, setSelectedWave] = useState<PickWave | null>(null);
    const [tasks, setTasks] = useState<PickTask[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadWaves();
    }, []);

    const loadWaves = async () => {
        // In a real system, we'd fetch from DB
        // Simulating waves for demo
        setWaves([
            { id: '1', wave_no: 'PW-20260216-01', status: 'picking', order_count: 12, total_items: 45, created_at: new Date().toISOString() },
            { id: '2', wave_no: 'PW-20260216-02', status: 'pending', order_count: 5, total_items: 18, created_at: new Date().toISOString() },
        ]);
    };

    const handleSelectWave = async (wave: PickWave) => {
        setLoading(true);
        setSelectedWave(wave);
        try {
            const optimizedTasks = await pickingService.getOptimizedTasks(wave.id);
            setTasks(optimizedTasks);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex bg-gray-50 overflow-hidden">
            {/* Wave List Sidebar */}
            <div className="w-80 bg-white border-r flex flex-col">
                <div className="p-4 border-b bg-orange-600 text-white flex items-center gap-2">
                    <ClipboardList className="w-5 h-5" />
                    <h2 className="font-bold">Toplama Dalgaları (Waves)</h2>
                </div>
                <div className="flex-1 overflow-auto">
                    {waves.map(wave => (
                        <button
                            key={wave.id}
                            onClick={() => handleSelectWave(wave)}
                            className={`w-full p-4 border-b text-left hover:bg-orange-50 transition-colors flex justify-between items-center ${selectedWave?.id === wave.id ? 'bg-orange-50 border-l-4 border-l-orange-600' : ''
                                }`}
                        >
                            <div>
                                <p className="font-mono text-xs text-gray-400">{wave.wave_no}</p>
                                <p className="font-bold text-gray-900">{wave.total_items} Ürün / {wave.order_count} Sipariş</p>
                                <div className="flex items-center gap-1 mt-1">
                                    <span className={`w-2 h-2 rounded-full ${wave.status === 'picking' ? 'bg-blue-500' : 'bg-yellow-500'}`}></span>
                                    <span className="text-[10px] text-gray-500 uppercase">{wave.status}</span>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300" />
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Execution Area */}
            <div className="flex-1 flex flex-col relative">
                {!selectedWave ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <Box className="w-20 h-20 mb-4 opacity-20" />
                        <p className="text-lg">Yürütmek istediğiniz toplama dalgasını seçin</p>
                    </div>
                ) : (
                    <>
                        {/* Execution Header */}
                        <div className="bg-white border-b px-6 py-4 flex justify-between items-center z-10">
                            <div>
                                <h3 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
                                    <Navigation className="w-5 h-5 text-orange-600" />
                                    Optimize Toplama Yolu: {selectedWave.wave_no}
                                </h3>
                                <p className="text-sm text-gray-500">Lokasyon bazlı sıralama aktif (S-Shape Path)</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className="text-xs text-gray-400">Tamamlanma</p>
                                    <p className="font-bold text-orange-600">%45</p>
                                </div>
                                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="w-[45%] h-full bg-orange-500"></div>
                                </div>
                            </div>
                        </div>

                        {/* Task Area */}
                        <div className="flex-1 overflow-auto p-6 space-y-4">
                            {tasks.map((task, index) => (
                                <div
                                    key={task.id}
                                    className={`bg-white rounded-xl shadow-sm border p-4 flex items-center gap-6 transition-all ${task.status === 'completed' ? 'opacity-50 grayscale' : 'hover:border-orange-300'
                                        }`}
                                >
                                    <div className="bg-orange-100 text-orange-700 w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl flex-shrink-0">
                                        {index + 1}
                                    </div>

                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-orange-600" />
                                            <span className="font-mono text-sm font-bold text-gray-700">{task.location_code}</span>
                                        </div>
                                        <h4 className="text-lg font-bold text-gray-900 mt-1">{task.product_name}</h4>
                                        <p className="text-xs text-gray-500">SKU: {task.product_id.split('-')[0]}</p>
                                    </div>

                                    <div className="text-center w-32 border-x px-4">
                                        <p className="text-xs text-gray-400">Hedef</p>
                                        <p className="text-2xl font-bold text-gray-900">{task.quantity} <span className="text-xs font-normal">Adet</span></p>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="bg-gray-50 p-1 rounded-lg border flex items-center gap-2">
                                            <button className="w-8 h-8 bg-white rounded border hover:bg-gray-100 active:scale-95 transition-all">-</button>
                                            <input className="w-12 text-center bg-transparent font-bold" defaultValue={task.quantity} />
                                            <button className="w-8 h-8 bg-white rounded border hover:bg-gray-100 active:scale-95 transition-all">+</button>
                                        </div>
                                        <button
                                            className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 ${task.status === 'completed'
                                                ? 'bg-green-100 text-green-700 cursor-default'
                                                : 'bg-orange-600 text-white hover:bg-orange-700 shadow-md shadow-orange-200'
                                                }`}
                                        >
                                            <CheckSquare className="w-4 h-4" />
                                            {task.status === 'completed' ? 'Toplandı' : 'Onayla'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Bottom Controls */}
                        <div className="bg-white border-t p-4 px-6 flex justify-between items-center shadow-lg">
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <User className="w-4 h-4" />
                                Personel: <span className="font-bold text-gray-800">Ferhat</span>
                            </div>
                            <div className="flex gap-3">
                                <button className="px-6 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">Dalgadan Çık</button>
                                <button className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-lg shadow-green-100">Dalgayı Bitir</button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
