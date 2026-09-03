/**
 * ProductionModule — birleşik üretim modülü kabuğu.
 *
 * Bu bileşen eski `ProductionModule` (Kasap + Parçalama sekmeleri) ve
 * `ProductionRecipeModule` (Genel BOM) ayrımını kaldırır; tek bir
 * `ProductionHubModule` üzerinden genel + kasap reçete/emir akışını sunar.
 */

import React from 'react';
import { ProductionHubModule } from './production/ProductionHubModule';

export function ProductionModule() {
  return <ProductionHubModule />;
}