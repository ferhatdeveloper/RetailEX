import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabNavigator } from './MainTabNavigator';
import { ProductsScreen } from '../screens/ProductsScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { ProductFormScreen } from '../screens/ProductFormScreen';
import { CustomersScreen } from '../screens/CustomersScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { CustomerFormScreen } from '../screens/CustomerFormScreen';
import { InvoicesScreen } from '../screens/InvoicesScreen';
import { InvoiceDetailScreen } from '../screens/InvoiceDetailScreen';
import { InvoiceFormScreen } from '../screens/InvoiceFormScreen';
import {
  ReportSalesScreen,
  ReportStockScreen,
  ReportMizanScreen,
  ReportAgingScreen,
  ReportCariExtractScreen,
  ReportProductSalesScreen,
  ReportCashScreen,
} from '../screens/ReportScreens';
import { StockMovementsScreen } from '../screens/StockMovementsScreen';
import { StockMovementDetailScreen } from '../screens/StockMovementDetailScreen';
import { ProductionRecipeDetailScreen } from '../screens/ProductionRecipeDetailScreen';
import { BeautyScreen } from '../screens/BeautyScreen';
import { WmsScreen } from '../screens/WmsScreen';
import { WmsCountScreen } from '../screens/WmsCountScreen';
import { WmsCountSlipScreen } from '../screens/WmsCountSlipScreen';
import { WmsTransferScreen } from '../screens/WmsTransferScreen';
import { WmsTransferSlipScreen } from '../screens/WmsTransferSlipScreen';
import { WavePickingScreen } from '../screens/WavePickingScreen';
import { WavePickingExecuteScreen } from '../screens/WavePickingExecuteScreen';
import { RestaurantScreen } from '../screens/RestaurantScreen';
import { FinanceScreen } from '../screens/FinanceScreen';
import { FinanceDefinitionsScreen } from '../screens/FinanceDefinitionsScreen';
import { MaterialDefinitionsScreen } from '../screens/MaterialDefinitionsScreen';
import { MaterialDefinitionFormScreen } from '../screens/MaterialDefinitionFormScreen';
import { CashCollectionScreen } from '../screens/CashCollectionScreen';
import { CariDevirScreen } from '../screens/CariDevirScreen';
import { OrganizationScreen } from '../screens/OrganizationScreen';
import { SystemScreen } from '../screens/SystemScreen';
import { CommunicationsScreen } from '../screens/CommunicationsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { StoreManagementScreen } from '../screens/StoreManagementScreen';
import { ETransformScreen } from '../screens/ETransformScreen';
import { PricingScreen } from '../screens/PricingScreen';
import { CampaignsScreen } from '../screens/CampaignsScreen';
import { CampaignDetailScreen } from '../screens/CampaignDetailScreen';
import { CampaignFormScreen } from '../screens/CampaignFormScreen';
import { ModuleScreen } from '../screens/ModuleScreen';
import { ProductionOpsScreen } from '../screens/ProductionOpsScreen';
import { MultiCurrencyScreen } from '../screens/MultiCurrencyScreen';
import { ExcelOpsScreen } from '../screens/ExcelOpsScreen';
import { SystemExtrasScreen } from '../screens/SystemExtrasScreen';
import type { MainStackParamList } from './types';

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabNavigator} />
      <Stack.Screen name="Products" component={ProductsScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="ProductForm" component={ProductFormScreen} />
      {/* Etiket OCR / akıllı malzeme — expo-image-picker cold start’ta çekilmesin */}
      <Stack.Screen
        name="MaterialLabelScan"
        getComponent={() =>
          require('../screens/MaterialLabelScanScreen')
            .MaterialLabelScanScreen as React.ComponentType
        }
      />
      <Stack.Screen name="Customers" component={CustomersScreen} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      <Stack.Screen name="CustomerForm" component={CustomerFormScreen} />
      {/* Kimlik tara / OCR — expo-image-picker cold start’ta çekilmesin */}
      <Stack.Screen
        name="CustomerIdScan"
        getComponent={() =>
          require('../screens/CustomerIdScanScreen').CustomerIdScanScreen as React.ComponentType
        }
      />
      <Stack.Screen name="Invoices" component={InvoicesScreen} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
      <Stack.Screen name="InvoiceForm" component={InvoiceFormScreen} />
      {/* Belge tara / OCR — expo-image-picker cold start’ta çekilmesin */}
      <Stack.Screen
        name="DocumentScan"
        getComponent={() =>
          require('../screens/DocumentScanScreen').DocumentScanScreen as React.ComponentType
        }
      />
      <Stack.Screen name="Campaigns" component={CampaignsScreen} />
      <Stack.Screen name="CampaignDetail" component={CampaignDetailScreen} />
      <Stack.Screen name="CampaignForm" component={CampaignFormScreen} />
      <Stack.Screen name="ReportSales" component={ReportSalesScreen} />
      <Stack.Screen name="ReportStock" component={ReportStockScreen} />
      <Stack.Screen name="ReportMizan" component={ReportMizanScreen} />
      <Stack.Screen name="ReportAging" component={ReportAgingScreen} />
      <Stack.Screen name="ReportCariExtract" component={ReportCariExtractScreen} />
      <Stack.Screen name="ReportProductSales" component={ReportProductSalesScreen} />
      <Stack.Screen name="ReportCash" component={ReportCashScreen} />
      <Stack.Screen name="StockMovements" component={StockMovementsScreen} />
      <Stack.Screen name="StockMovementDetail" component={StockMovementDetailScreen} />
      <Stack.Screen name="Beauty" component={BeautyScreen} />
      <Stack.Screen name="Wms" component={WmsScreen} />
      <Stack.Screen name="WmsCount" component={WmsCountScreen} />
      <Stack.Screen name="WmsCountSlip" component={WmsCountSlipScreen} />
      <Stack.Screen name="WmsTransfer" component={WmsTransferScreen} />
      <Stack.Screen name="WmsTransferSlip" component={WmsTransferSlipScreen} />
      <Stack.Screen name="WmsWavePicking" component={WavePickingScreen} />
      <Stack.Screen name="WmsWavePickingExecute" component={WavePickingExecuteScreen} />
      <Stack.Screen name="Restaurant" component={RestaurantScreen} />
      <Stack.Screen
        name="Delivery"
        getComponent={() =>
          require('../screens/DeliveryScreen').DeliveryScreen as React.ComponentType
        }
      />
      <Stack.Screen name="Finance" component={FinanceScreen} />
      <Stack.Screen name="FinanceDefinitions" component={FinanceDefinitionsScreen} />
      <Stack.Screen name="MaterialDefinitions" component={MaterialDefinitionsScreen} />
      <Stack.Screen name="MaterialDefinitionForm" component={MaterialDefinitionFormScreen} />
      <Stack.Screen name="ProductionOps" component={ProductionOpsScreen} />
      <Stack.Screen name="ProductionRecipeDetail" component={ProductionRecipeDetailScreen} />
      <Stack.Screen name="MultiCurrency" component={MultiCurrencyScreen} />
      <Stack.Screen name="ExcelOps" component={ExcelOpsScreen} />
      <Stack.Screen name="SystemExtras" component={SystemExtrasScreen} />
      <Stack.Screen name="CashCollection" component={CashCollectionScreen} />
      <Stack.Screen name="CariDevir" component={CariDevirScreen} />
      <Stack.Screen name="Organization" component={OrganizationScreen} />
      <Stack.Screen name="System" component={SystemScreen} />
      <Stack.Screen name="Pricing" component={PricingScreen} />
      <Stack.Screen name="Communications" component={CommunicationsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen
        name="PrinterSettings"
        getComponent={() =>
          require('../screens/PrinterSettingsScreen').PrinterSettingsScreen as React.ComponentType
        }
      />
      <Stack.Screen
        name="ScaleManagement"
        getComponent={() =>
          require('../screens/ScaleManagementScreen').ScaleManagementScreen as React.ComponentType
        }
      />
      <Stack.Screen
        name="ScaleSale"
        getComponent={() =>
          require('../screens/ScaleSaleScreen').ScaleSaleScreen as React.ComponentType
        }
      />
      <Stack.Screen name="StoreManagement" component={StoreManagementScreen} />
      <Stack.Screen name="ETransform" component={ETransformScreen} />
      <Stack.Screen name="Module" component={ModuleScreen} />
    </Stack.Navigator>
  );
}
