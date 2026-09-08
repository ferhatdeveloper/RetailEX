import React from 'react';
import { useQrCustomer } from './QRCustomerLayout';
import { QRCartViewPremium } from './QRCartViewPremium';
import { QRCartViewClassic } from './QRCartViewClassic';

/** Misafir sepet — ayara göre premium veya klasik */
export function QRCartView() {
  const { settings } = useQrCustomer();
  if (settings?.guest_ui_theme === 'classic') return <QRCartViewClassic />;
  return <QRCartViewPremium />;
}
