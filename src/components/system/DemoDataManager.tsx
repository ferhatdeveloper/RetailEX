import React, { useState } from 'react';
import {
    Database,
    Box,
    Users,
    ShoppingCart,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Layers,
    Building2,
    Calendar,
    ArrowRight,
    Play,
    Truck
} from 'lucide-react';
import { toast } from 'sonner';
import { postgres } from '../../services/postgres';

interface DemoModule {
    id: string;
    name: string;
    description: string;
    icon: React.ElementType;
    sqlTag: string;
}

const DEMO_MODULES: DemoModule[] = [
    {
        id: 'products',
        name: 'Ürünler ve Kategoriler',
        description: 'Örnek kategoriler, ürünler ve barkod tanımları.',
        icon: Box,
        sqlTag: 'PRODUCTS'
    },
    {
        id: 'customers',
        name: 'Müşteriler',
        description: 'Örnek perakende ve kurumsal müşteri kartları.',
        icon: Users,
        sqlTag: 'CUSTOMERS'
    },
    {
        id: 'sales',
        name: 'Satış Hareketleri',
        description: 'Örnek kasa satışları ve faturalar.',
        icon: ShoppingCart,
        sqlTag: 'SALES'
    },
    {
        id: 'stock',
        name: 'Stok Hareketleri',
        description: 'Örnek giriş ve çıkış hareketleri, depo durumları.',
        icon: Layers,
        sqlTag: 'STOCK'
    }
];

export const DemoDataManager: React.FC = () => {
    const [selectedFirm, setSelectedFirm] = useState('001');
    const [selectedPeriod, setSelectedPeriod] = useState('01');
    const [selectedModules, setSelectedModules] = useState<string[]>(['products', 'customers']);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState<string | null>(null);
    const [isRunningMigrations, setIsRunningMigrations] = useState(false);

    const toggleModule = (id: string) => {
        setSelectedModules(prev =>
            prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
        );
    };

    const handleImport = async () => {
        if (selectedModules.length === 0) {
            toast.error('Lütfen en az bir modül seçin.');
            return;
        }

        setIsImporting(true);
        setImportProgress('Hazırlanıyor...');

        try {
            // 1. Ensure firm tables exist
            setImportProgress(`Firma ${selectedFirm} tabloları kontrol ediliyor...`);
            await postgres.query(`SELECT create_firm_tables($1)`, [selectedFirm]);
            await postgres.query(`SELECT create_period_tables($1, $2)`, [selectedFirm, selectedPeriod]);

            const firmSuffix = `_${selectedFirm}`;
            const periodSuffix = `_${selectedFirm}_${selectedPeriod}`;

            // 2. Import each selected module
            for (const moduleId of selectedModules) {
                const module = DEMO_MODULES.find(m => m.id === moduleId);
                if (!module) continue;

                setImportProgress(`${module.name} yükleniyor...`);

                if (moduleId === 'products') {
                    await postgres.query(`
                        INSERT INTO categories (code, name, is_active) VALUES
                        ('ELEC', 'Elektronik', true), ('FOOD', 'Gıda', true), ('CLOTH', 'Giyim', true)
                        ON CONFLICT (code) DO NOTHING;

                        INSERT INTO rex${firmSuffix}_products (code, name, category_id, vat_rate, price, stock, is_active) VALUES
                        ('PHONE-001', 'iPhone 15 Pro', (SELECT id FROM categories WHERE code = 'ELEC' LIMIT 1), 20, 45000.00, 15, true),
                        ('LAPTOP-001', 'MacBook Pro 16"', (SELECT id FROM categories WHERE code = 'ELEC' LIMIT 1), 20, 95000.00, 8, true),
                        ('SNACK-001', 'Çikolata Bar', (SELECT id FROM categories WHERE code = 'FOOD' LIMIT 1), 10, 15.00, 500, true)
                        ON CONFLICT (code) DO NOTHING;
                    `);
                } else if (moduleId === 'customers') {
                    await postgres.query(`
                        INSERT INTO rex${firmSuffix}_customers (code, name, tax_nr, address, city, is_active) VALUES
                        ('CUST-001', 'Ahmet Yılmaz', '1234567890', 'Bağdat Cad. No:123', 'İstanbul', true),
                        ('CORP-001', 'ABC Teknoloji A.Ş.', '9876543210', 'Maslak No:100', 'İstanbul', true)
                        ON CONFLICT (code) DO NOTHING;
                    `);
                } else if (moduleId === 'sales') {
                    await postgres.query(`
                        INSERT INTO rex${periodSuffix}_sales (fiche_no, date, customer_ref, total_net, total_vat, total_gross)
                        SELECT 'SAT-DEMO-001', NOW(), logicalref, 1000, 200, 1200 
                        FROM rex${firmSuffix}_customers LIMIT 1
                        ON CONFLICT (fiche_no) DO NOTHING;
                    `);
                }
            }

            setImportProgress(null);
            toast.success('Örnek veriler başarıyla yüklendi!');
        } catch (error: any) {
            console.error('Import error:', error);
            toast.error(`Yükleme hatası: ${error.message}`);
        } finally {
            setIsImporting(false);
            setImportProgress(null);
        }
    };

    const handleRunMaterialMigrations = async () => {
        setIsRunningMigrations(true);
        try {
            toast.info('Malzeme migrasyonları çalıştırılıyor...');

            // Run migration 008 (add description columns)
            await postgres.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brands' AND column_name='description') THEN
                        ALTER TABLE brands ADD COLUMN description TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='units' AND column_name='description') THEN
                        ALTER TABLE units ADD COLUMN description TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='product_groups' AND column_name='description') THEN
                        ALTER TABLE product_groups ADD COLUMN description TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='description') THEN
                        ALTER TABLE categories ADD COLUMN description TEXT;
                    END IF;
                END $$;
            `);

            // Run migration 009 (insert demo data)
            await postgres.query(`
                INSERT INTO brands (code, name, is_active, description) VALUES
                ('APPLE', 'Apple', true, 'Premium teknoloji markası'),
                ('SAMSUNG', 'Samsung', true, 'Elektronik ve beyaz eşya'),
                ('DELL', 'Dell', true, 'Bilgisayar ve aksesuarlar'),
                ('LENOVO', 'Lenovo', true, 'İş istasyonları ve laptoplar'),
                ('NESTLE', 'Nestlé', true, 'Gıda ve içecek ürünleri'),
                ('NIKE', 'Nike', true, 'Spor giyim ve ayakkabı')
                ON CONFLICT (code) DO NOTHING;

                INSERT INTO units (code, name, is_active, description) VALUES
                ('ADET', 'Adet', true, 'Birim ölçü'),
                ('KG', 'Kilogram', true, 'Ağırlık ölçüsü'),
                ('M', 'Metre', true, 'Uzunluk ölçüsü'),
                ('PAKET', 'Paket', true, 'Paket ölçüsü'),
                ('KOLI', 'Koli', true, 'Toplu paket')
                ON CONFLICT (code) DO NOTHING;

                INSERT INTO product_groups (code, name, is_active, description) VALUES
                ('ELEC', 'Elektronik', true, 'Elektronik ürünler'),
                ('FOOD', 'Gıda ve İçecek', true, 'Gıda ürünleri'),
                ('TEXT', 'Tekstil', true, 'Giyim ve kumaş ürünleri')
                ON CONFLICT (code) DO NOTHING;
            `);

            toast.success('Malzeme demo verileri başarıyla yüklendi!');
        } catch (error: any) {
            console.error('Migration error:', error);
            toast.error(`Migration hatası: ${error.message}`);
        } finally {
            setIsRunningMigrations(false);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex items-center justify-between mb-12">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4">
                        <div className="p-3 bg-blue-600 rounded-2xl shadow-xl shadow-blue-200">
                            <Database className="w-8 h-8 text-white" />
                        </div>
                        Örnek Veri Yönetimi
                    </h1>
                    <p className="text-slate-500 font-medium mt-3 flex items-center gap-2">
                        Sistemi test etmek için seçili firmaya örnek veriler yükleyin.
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-lg uppercase tracking-wider">Geliştirici Aracı</span>
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Panel: Configuration */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="p-6 rounded-[32px] bg-white border border-slate-100 shadow-xl shadow-slate-200/50 space-y-8">
                        <div>
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Hedef Yapılandırma</h3>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Firma No</label>
                                    <div className="relative">
                                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={selectedFirm}
                                            onChange={(e) => setSelectedFirm(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            placeholder="Örn: 001"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Dönem No</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={selectedPeriod}
                                            onChange={(e) => setSelectedPeriod(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            placeholder="Örn: 01"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-slate-50">
                            <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100/50 flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
                                    Veriler mevcut kayıtların üzerine yazılmaz, sadece eksik olanlar eklenir.
                                    Firmaya ait tablolar yoksa otomatik oluşturulur.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handleImport}
                            disabled={isImporting || selectedModules.length === 0}
                            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all ${isImporting
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-[0.98]'
                                }`}
                        >
                            {isImporting ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                                <RefreshCw className="w-5 h-5" />
                            )}
                            {isImporting ? 'Yükleniyor...' : 'Verileri Aktar'}
                        </button>

                        <button
                            onClick={handleRunMaterialMigrations}
                            disabled={isRunningMigrations}
                            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all ${isRunningMigrations
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-green-600 text-white shadow-lg shadow-green-600/20 hover:bg-green-700 active:scale-[0.98]'
                                }`}
                        >
                            {isRunningMigrations ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                                <Play className="w-5 h-5" />
                            )}
                            {isRunningMigrations ? 'Çalıştırılıyor...' : 'Malzeme Demo Verilerini Yükle'}
                        </button>

                        <button
                            onClick={async () => {
                                setIsRunningMigrations(true);
                                try {
                                    toast.info('Tedarikçi tablosu oluşturuluyor...');
                                    const { postgres } = await import('../../services/postgres');
                                    await postgres.runMigrations(true);
                                    toast.success('Tedarikçi tablosu ve verileri oluşturuldu!');
                                } catch (err: any) {
                                    console.error(err);
                                    toast.error('Hata: ' + err.message);
                                } finally {
                                    setIsRunningMigrations(false);
                                }
                            }}
                            disabled={isRunningMigrations}
                            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all ${isRunningMigrations
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-purple-600 text-white shadow-lg shadow-purple-600/20 hover:bg-purple-700 active:scale-[0.98]'
                                }`}
                        >
                            {isRunningMigrations ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                                <Truck className="w-5 h-5" />
                            )}
                            {isRunningMigrations ? 'Çalıştırılıyor...' : 'Tedarikçi Tablosunu Kur'}
                        </button>
                    </div>

                    {importProgress && (
                        <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-lg flex items-center gap-3 animate-pulse">
                            <div className="w-2 h-2 rounded-full bg-blue-600" />
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{importProgress}</span>
                        </div>
                    )}
                </div>

                {/* Right Panel: Module Selection */}
                <div className="lg:col-span-2 space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2">Modül Seçimi</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {DEMO_MODULES.map((module) => {
                            const isSelected = selectedModules.includes(module.id);
                            return (
                                <button
                                    key={module.id}
                                    onClick={() => toggleModule(module.id)}
                                    className={`p-6 rounded-[32px] border-2 text-left transition-all relative overflow-hidden group ${isSelected
                                        ? 'bg-white border-blue-500 shadow-xl shadow-blue-500/10'
                                        : 'bg-white border-slate-100 hover:border-slate-200'
                                        }`}
                                >
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                            <module.icon className="w-6 h-6" />
                                        </div>
                                        {isSelected && (
                                            <CheckCircle2 className="w-5 h-5 text-blue-500 absolute top-6 right-6" />
                                        )}
                                    </div>
                                    <h4 className={`text-lg font-bold transition-colors ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>
                                        {module.name}
                                    </h4>
                                    <p className="text-xs text-slate-400 font-medium mt-1 leading-relaxed">
                                        {module.description}
                                    </p>

                                    <div className={`mt-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-blue-600' : 'text-slate-400'
                                        }`}>
                                        Seç {!isSelected ? 'Gerekiyor' : 'Tamam'}
                                        <ArrowRight className="w-3 h-3" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}; 
