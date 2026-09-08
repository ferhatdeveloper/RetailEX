import React from 'react';
import { useQrCustomer } from './QRCustomerLayout';
import { QRMenuViewPremium } from './QRMenuViewPremium';
import { QRMenuViewClassic } from './QRMenuViewClassic';

/** Misafir menü — ayara göre premium veya klasik */
export function QRMenuView() {
  const { settings } = useQrCustomer();
  if (settings?.guest_ui_theme === 'classic') return <QRMenuViewClassic />;
  return <QRMenuViewPremium />;
}
