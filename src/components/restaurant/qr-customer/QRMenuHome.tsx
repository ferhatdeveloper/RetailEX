import React from 'react';
import { useQrCustomer } from './QRCustomerLayout';
import { QRMenuHomePremium } from './QRMenuHomePremium';
import { QRMenuHomeClassic } from './QRMenuHomeClassic';

/** Misafir ana sayfa — ayara göre premium veya klasik */
export function QRMenuHome() {
  const { settings } = useQrCustomer();
  if (settings?.guest_ui_theme === 'classic') return <QRMenuHomeClassic />;
  return <QRMenuHomePremium />;
}
