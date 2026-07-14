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
  ReportCariExtractScreen,
} from '../screens/ReportScreens';
import { BeautyScreen } from '../screens/BeautyScreen';
import { WmsScreen } from '../screens/WmsScreen';
import { WmsCountScreen } from '../screens/WmsCountScreen';
import { WmsCountSlipScreen } from '../screens/WmsCountSlipScreen';
import { RestaurantScreen } from '../screens/RestaurantScreen';
import { DeliveryScreen } from '../screens/DeliveryScreen';
import { OrganizationScreen } from '../screens/OrganizationScreen';
import { SystemScreen } from '../screens/SystemScreen';
import { ModuleScreen } from '../screens/ModuleScreen';
import type { MainStackParamList } from './types';

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabNavigator} />
      <Stack.Screen name="Products" component={ProductsScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="ProductForm" component={ProductFormScreen} />
      <Stack.Screen name="Customers" component={CustomersScreen} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      <Stack.Screen name="CustomerForm" component={CustomerFormScreen} />
      <Stack.Screen name="Invoices" component={InvoicesScreen} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
      <Stack.Screen name="InvoiceForm" component={InvoiceFormScreen} />
      <Stack.Screen name="ReportSales" component={ReportSalesScreen} />
      <Stack.Screen name="ReportStock" component={ReportStockScreen} />
      <Stack.Screen name="ReportMizan" component={ReportMizanScreen} />
      <Stack.Screen name="ReportCariExtract" component={ReportCariExtractScreen} />
      <Stack.Screen name="Beauty" component={BeautyScreen} />
      <Stack.Screen name="Wms" component={WmsScreen} />
      <Stack.Screen name="WmsCount" component={WmsCountScreen} />
      <Stack.Screen name="WmsCountSlip" component={WmsCountSlipScreen} />
      <Stack.Screen name="Restaurant" component={RestaurantScreen} />
      <Stack.Screen name="Delivery" component={DeliveryScreen} />
      <Stack.Screen name="Organization" component={OrganizationScreen} />
      <Stack.Screen name="System" component={SystemScreen} />
      <Stack.Screen name="Module" component={ModuleScreen} />
    </Stack.Navigator>
  );
}
