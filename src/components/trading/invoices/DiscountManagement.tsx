/**
 * Discount Management Module - İndirim Yönetimi
 * 
 * Features:
 * - İndirim kayıtları listesi
 * - İndirim nedenleri yönetimi
 * - İndirim onay kuralları
 * - Kullanıcı bazlı indirim limitleri
 * - İndirim raporları
 */

import { useState, useEffect } from 'react';
import { Percent, Plus, Edit, Trash2, Shield, TrendingDown, Users, CheckCircle } from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCurrency } from '../../../utils/formatNumber';

interface DiscountLog {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  original_price: number;
  discounted_price: number;
  discount_amount: number;
  discount_percentage: number;
  reason_id: string;
  reason_name: string;
  approved_by: string;
  approved_by_name: string;
  created_at: string;
}

interface DiscountReason {
  id: string;
  code: string;
  name: string;
  description: string;
  max_discount_percentage: number;
  requires_approval: boolean;
  approval_role?: string;
  is_active: boolean;
}

interface DiscountApprovalRule {
  id: string;
  role: string;
  max_discount_percentage: number;
  requires_approval: boolean;
}

export function DiscountManagement() {
  const [activeTab, setActiveTab] = useState<'logs' | 'reasons' | 'rules'>('logs');
  const [discountLogs, setDiscountLogs] = useState<DiscountLog[]>([]);
  const [discountReasons, setDiscountReasons] = useState<DiscountReason[]>([]);
  const [approvalRules, setApprovalRules] = useState<DiscountApprovalRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // TODO: API calls
      // Mock data
      setDiscountLogs([
        {
          id: '1',
          sale_id: 'SAL-001',
          product_id: 'p1',
          product_name: 'Beyaz T-Shirt',
          original_price: 35000,
          discounted_price: 26250,
          discount_amount: 8750,
          discount_percentage: 25,
          reason_id: '1',
          reason_name: 'Kampanya',
          approved_by: 'admin',
          approved_by_name: 'Admin User',
          created_at: new Date().toISOString(),
        },
      ]);

      setDiscountReasons([
        { id: '1', code: 'CAMP', name: 'Kampanya', description: 'Kampanya kapsamında indirim', max_discount_percentage: 100, requires_approval: false, is_active: true },
        { id: '2', code: 'DMG', name: 'Hasarlı Ürün', description: 'Ürün hasarlı/kusurlu', max_discount_percentage: 50, requires_approval: false, is_active: true },
        { id: '3', code: 'VIP', name: 'VIP Müşteri', description: 'VIP müşteri indirimi', max_discount_percentage: 40, requires_approval: true, approval_role: 'manager', is_active: true },
        { id: '4', code: 'CSAT', name: 'Müşteri Memnuniyeti', description: 'Müşteri memnuniyeti', max_discount_percentage: 30, requires_approval: true, approval_role: 'manager', is_active: true },
        { id: '5', code: 'SEAS', name: 'Sezon Sonu', description: 'Sezon sonu tasfiye', max_discount_percentage: 60, requires_approval: true, approval_role: 'admin', is_active: true },
      ]);

      setApprovalRules([
        { id: '1', role: 'cashier', max_discount_percentage: 5, requires_approval: false },
        { id: '2', role: 'manager', max_discount_percentage: 25, requires_approval: false },
        { id: '3', role: 'admin', max_discount_percentage: 100, requires_approval: false },
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Discount Logs Columns
  const logColumnHelper = createColumnHelper<DiscountLog>();
  const logColumns = [
    logColumnHelper.accessor('created_at', {
      header: 'TARİH',
      cell: info => new Date(info.getValue()).toLocaleString('tr-TR'),
      size: 140
    }),
    logColumnHelper.accessor('product_name', {
      header: 'ÜRÜN',
      cell: info => info.getValue(),
      size: 200
    }),
    logColumnHelper.accessor('original_price', {
      header: 'ORİJİNAL FİYAT',
      cell: info => formatCurrency(info.getValue()),
      size: 130
    }),
    logColumnHelper.accessor('discount_percentage', {
      header: 'İNDİRİM',
      cell: info => (
        <span className="font-semibold text-red-600">%{info.getValue()}</span>
      ),
      size: 80
    }),
    logColumnHelper.accessor('discounted_price', {
      header: 'İNDİRİMLİ FİYAT',
      cell: info => (
        <span className="font-semibold text-green-600">
          {formatCurrency(info.getValue())}
        </span>
      ),
      size: 130
    }),
    logColumnHelper.accessor('reason_name', {
      header: 'NEDEN',
      cell: info => (
        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
          {info.getValue()}
        </span>
      ),
      size: 120
    }),
    logColumnHelper.accessor('approved_by_name', {
      header: 'ONAYLAYAN',
      cell: info => info.getValue(),
      size: 120
    }),
  ];

  // Discount Reasons Columns
  const reasonColumnHelper = createColumnHelper<DiscountReason>();
  const reasonColumns = [
    reasonColumnHelper.accessor('code', {
      header: 'KOD',
      cell: info => <span className="font-mono font-semibold">{info.getValue()}</span>,
      size: 80
    }),
    reasonColumnHelper.accessor('name', {
      header: 'NEDEN',
      cell: info => info.getValue(),
      size: 150
    }),
    reasonColumnHelper.accessor('description', {
      header: 'AÇIKLAMA',
      cell: info => info.getValue(),
      size: 250
    }),
    reasonColumnHelper.accessor('max_discount_percentage', {
      header: 'MAX İNDİRİM',
      cell: info => <span className="font-semibold">%{info.getValue()}</span>,
      size: 100
    }),
    reasonColumnHelper.accessor('requires_approval', {
      header: 'ONAY GEREKTİRİR',
      cell: info => info.getValue() ? (
        <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
      ) : (
        <span className="text-gray-400">-</span>
      ),
      size: 130
    }),
    reasonColumnHelper.accessor('approval_role', {
      header: 'ONAYLAYICI ROL',
      cell: info => info.getValue() || '-',
      size: 120
    }),
    reasonColumnHelper.accessor('is_active', {
      header: 'DURUM',
      cell: info => (
        <span className={`px-2 py-1 rounded text-xs font-semibold ${
          info.getValue() ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
        }`}>
          {info.getValue() ? 'Aktif' : 'Pasif'}
        </span>
      ),
      size: 80
    }),
    reasonColumnHelper.display({
      id: 'actions',
      header: 'İŞLEMLER',
      cell: () => (
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-blue-50 rounded">
            <Edit className="w-4 h-4 text-blue-600" />
          </button>
          <button className="p-2 hover:bg-red-50 rounded">
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      ),
      size: 100
    }),
  ];

  // Approval Rules Columns
  const ruleColumnHelper = createColumnHelper<DiscountApprovalRule>();
  const ruleColumns = [
    ruleColumnHelper.accessor('role', {
      header: 'ROL',
      cell: info => {
        const role = info.getValue();
        const roleColors: Record<string, string> = {
          admin: 'bg-purple-100 text-purple-700',
          manager: 'bg-blue-100 text-blue-700',
          cashier: 'bg-green-100 text-green-700',
        };
        return (
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${roleColors[role] || 'bg-gray-100 text-gray-700'}`}>
            {role.toUpperCase()}
          </span>
        );
      },
      size: 150
    }),
    ruleColumnHelper.accessor('max_discount_percentage', {
      header: 'MAKSİMUM İNDİRİM YÜZDE',
      cell: info => (
        <span className="text-lg font-bold text-red-600">%{info.getValue()}</span>
      ),
      size: 200
    }),
    ruleColumnHelper.accessor('requires_approval', {
      header: 'ÜST ONAY GEREKTİRİR',
      cell: info => info.getValue() ? (
        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">
          Evet
        </span>
      ) : (
        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
          Hayır
        </span>
      ),
      size: 170
    }),
    ruleColumnHelper.display({
      id: 'actions',
      header: 'İŞLEMLER',
      cell: () => (
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-blue-50 rounded">
            <Edit className="w-4 h-4 text-blue-600" />
          </button>
        </div>
      ),
      size: 100
    }),
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Percent className="w-8 h-8 text-red-600" />
            İndirim Yönetimi
          </h1>
          <p className="text-gray-600 mt-1">
            İndirim kayıtları, nedenleri ve onay kuralları
          </p>
        </div>
        <button
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Yeni İndirim Nedeni
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'logs'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            İndirim Kayıtları
          </button>
          <button
            onClick={() => setActiveTab('reasons')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'reasons'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            İndirim Nedenleri
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'rules'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Onay Kuralları
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Tüm İndirim Kayıtları</h3>
            <p className="text-sm text-gray-600">Yapılan tüm indirimler ve onay durumları</p>
          </div>
          <DevExDataGrid
            data={discountLogs}
            columns={logColumns}
            enableFiltering
            enableSorting
            enablePagination
            pageSize={20}
          />
        </div>
      )}

      {activeTab === 'reasons' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">İndirim Nedenleri</h3>
              <p className="text-sm text-gray-600">Kasiyerlerin seçebileceği indirim nedenleri</p>
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Yeni Neden Ekle
            </button>
          </div>
          <DevExDataGrid
            data={discountReasons}
            columns={reasonColumns}
            enableFiltering
            enableSorting
            enablePagination
            pageSize={10}
          />
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">İndirim Onay Kuralları</h3>
            <p className="text-sm text-gray-600">Rollere göre maksimum indirim yüzdeleri</p>
          </div>
          <DevExDataGrid
            data={approvalRules}
            columns={ruleColumns}
            enableFiltering={false}
            enableSorting={false}
            enablePagination={false}
          />
          
          {/* Info Panel */}
          <div className="p-6 bg-blue-50 border-t border-blue-100">
            <div className="flex items-start gap-3">
              <Shield className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-blue-900 mb-2">Nasıl Çalışır?</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• <strong>Kasiyer</strong>: Kendi limitine kadar (%5) indirim yapabilir</li>
                  <li>• <strong>Müdür</strong>: %25'e kadar indirim yapabilir</li>
                  <li>• <strong>Admin</strong>: Limitsiz indirim yetkisi</li>
                  <li>• Limit üstü indirimler otomatik olarak üst onaya gider</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
