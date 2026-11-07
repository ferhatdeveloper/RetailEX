export type WmsOpsKind = 'receiving' | 'dispatch' | 'bins' | 'putaway' | 'packing' | 'adjustment';

export type BeautyCatalogKind = 'packages' | 'devices' | 'leads' | 'recipes';

export function wmsOpsKind(screen: string): WmsOpsKind {
  switch (screen) {
    case 'wms-dispatch':
      return 'dispatch';
    case 'wms-bins':
      return 'bins';
    case 'wms-putaway':
      return 'putaway';
    case 'wms-packing':
      return 'packing';
    case 'wms-adjustment':
      return 'adjustment';
    default:
      return 'receiving';
  }
}

export function beautyCatalogKind(screen: string): BeautyCatalogKind {
  switch (screen) {
    case 'beauty-devices':
      return 'devices';
    case 'beauty-leads':
      return 'leads';
    case 'beauty-recipes':
      return 'recipes';
    default:
      return 'packages';
  }
}
