import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabNavigator } from './MainTabNavigator';
import { ProductsScreen } from '../screens/ProductsScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { CustomersScreen } from '../screens/CustomersScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { InvoicesScreen } from '../screens/InvoicesScreen';
import { InvoiceDetailScreen } from '../screens/InvoiceDetailScreen';
import { ReportSalesScreen, ReportStockScreen } from '../screens/ReportScreens';
import { BeautyScreen } from '../screens/BeautyScreen';
import { WmsScreen } from '../screens/WmsScreen';
import { RestaurantScreen } from '../screens/RestaurantScreen';
import { ModuleScreen } from '../screens/ModuleScreen';
import type { MainStackParamList } from './types';

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabNavigator} />
      <Stack.Screen name="Products" component={ProductsScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="Customers" component={CustomersScreen} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      <Stack.Screen name="Invoices" component={InvoicesScreen} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
      <Stack.Screen name="ReportSales" component={ReportSalesScreen} />
      <Stack.Screen name="ReportStock" component={ReportStockScreen} />
      <Stack.Screen name="Beauty" component={BeautyScreen} />
      <Stack.Screen name="Wms" component={WmsScreen} />
      <Stack.Screen name="Restaurant" component={RestaurantScreen} />
      <Stack.Screen name="Module" component={ModuleScreen} />
    </Stack.Navigator>
  );
}
