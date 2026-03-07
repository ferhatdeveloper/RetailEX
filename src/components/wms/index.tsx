// WMS Main Entry Point
import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { WMSReceiving } from './components/WMSReceiving';
import { WMSDispatch } from './components/WMSDispatch';
import { StockQuery } from './components/StockQuery';
import { ApiTest } from './components/ApiTest';
import { PerformanceDashboard } from './components/PerformanceDashboard';
import { MultiWarehouseStock } from './components/MultiWarehouseStock';
import { EnhancedReturnsManagement } from './components/EnhancedReturnsManagement';
import { VehicleLoadingManagement } from './components/VehicleLoadingManagement';
import { OrderSplittingManagement } from './components/OrderSplittingManagement';
import { LivePerformanceTV } from './components/LivePerformanceTV';
import { ShelfSpaceManagement } from './components/ShelfSpaceManagement';
import { SalesVelocityAnalysis } from './components/SalesVelocityAnalysis';
import { AutoReorderSuggestions } from './components/AutoReorderSuggestions';
import { PricingCostManagement } from './components/PricingCostManagement';
import { ProfitLossReports } from './components/ProfitLossReports';
import { CashierManagement } from './components/CashierManagement';
import { LiveGPSTrackingEnhanced } from './components/LiveGPSTrackingEnhanced';
import {
  TransferManagement, CountingModule,
  ReturnsManagement, AlertCenter, QualityControl,
  ReportsCenter, TaskManagement
} from './components/AllWMSModules';
import { SlottingOptimization, YardManagement, LaborManagement } from './RemainingWMSModules';
import { ToastProvider } from './utils/toast';
import { LanguageProvider } from './utils/i18n/LanguageContext';
import type { Product, Customer, Sale, Campaign } from '../../core/types';

interface WarehouseManagementProps {
  onNavigateToModule?: (module: 'pos' | 'management') => void;
  products?: Product[];
  customers?: Customer[];
  campaigns?: Campaign[];
  onSaleComplete?: (sale: Sale) => void;
}

function WarehouseManagementInner() {
  const [darkMode, setDarkMode] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');

  // Initialize deep-linking and toast system
  useEffect(() => {
    // Check for page parameter in URL
    const params = new URLSearchParams(window.location.search);
    const pageParam = params.get('wms_page');
    if (pageParam) {
      setCurrentPage(pageParam);
    }
  }, []);


  const renderPage = () => {
    const onBack = () => setCurrentPage('dashboard');

    switch (currentPage) {
      case 'api-test':
        return <ApiTest />;
      case 'dashboard':
        return <Dashboard darkMode={darkMode} onNavigate={setCurrentPage} />;
      case 'receiving':
        return <WMSReceiving darkMode={darkMode} onBack={onBack} />;
      case 'stock-query':
        return <StockQuery darkMode={darkMode} onBack={onBack} />;
      case 'multi-warehouse':
        return <MultiWarehouseStock darkMode={darkMode} onBack={onBack} />;
      case 'performance':
        return <PerformanceDashboard darkMode={darkMode} onBack={onBack} onNavigate={setCurrentPage} />;
      case 'live-performance-tv':
        return <LivePerformanceTV darkMode={darkMode} onBack={onBack} />;
      case 'returns':
        return <EnhancedReturnsManagement darkMode={darkMode} onBack={onBack} />;
      case 'vehicle-loading':
        return <VehicleLoadingManagement darkMode={darkMode} onBack={onBack} />;
      case 'order-splitting':
        return <OrderSplittingManagement darkMode={darkMode} onBack={onBack} />;
      case 'shelf-space':
        return <ShelfSpaceManagement darkMode={darkMode} onBack={onBack} />;
      case 'sales-velocity':
        return <SalesVelocityAnalysis darkMode={darkMode} onBack={onBack} />;
      case 'auto-reorder':
        return <AutoReorderSuggestions darkMode={darkMode} onBack={onBack} />;
      case 'pricing-cost':
        return <PricingCostManagement darkMode={darkMode} onBack={onBack} />;
      case 'profit-loss':
        return <ProfitLossReports darkMode={darkMode} onBack={onBack} />;
      case 'cashier-management':
        return <CashierManagement darkMode={darkMode} onBack={onBack} />;
      case 'live-gps-tracking-enhanced':
        return <LiveGPSTrackingEnhanced darkMode={darkMode} onBack={onBack} />;
      case 'issue':
        return <WMSDispatch darkMode={darkMode} onBack={onBack} />;
      case 'transfer':
        return <TransferManagement darkMode={darkMode} onBack={onBack} />;
      case 'counting':
        return <CountingModule darkMode={darkMode} onBack={onBack} />;
      case 'alerts':
        return <AlertCenter darkMode={darkMode} onBack={onBack} />;
      case 'quality':
        return <QualityControl darkMode={darkMode} onBack={onBack} />;
      case 'reports':
        return <ReportsCenter darkMode={darkMode} onBack={onBack} />;
      case 'tasks':
        return <TaskManagement darkMode={darkMode} onBack={onBack} />;
      case 'slotting':
        return <SlottingOptimization onBack={onBack} />;
      case 'yard':
        return <YardManagement onBack={onBack} />;
      case 'labor':
        return <LaborManagement onBack={onBack} />;
      default:
        return <Dashboard darkMode={darkMode} onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="relative h-full">
        {renderPage()}
      </div>
    </div>
  );
}

function WarehouseManagement(_props: WarehouseManagementProps) {
  return (
    <LanguageProvider>
      <ToastProvider>
        <WarehouseManagementInner />
      </ToastProvider>
    </LanguageProvider>
  );
}

export default WarehouseManagement;

// Export types for external use
export * from './types';
export * from './utils';


