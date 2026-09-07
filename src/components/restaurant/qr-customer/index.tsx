import React, { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { QRCustomerLayout } from './QRCustomerLayout';
import { QRMenuHome } from './QRMenuHome';
import { QRMenuView } from './QRMenuView';
import { QRCartView } from './QRCartView';
import { QROrdersView } from './QROrdersView';
import { QRCallWaiterView } from './QRCallWaiterView';
import { QRRequestBillView } from './QRRequestBillView';
import { QRValetView } from './QRValetView';
import { QRWifiView } from './QRWifiView';
import { QRFeedbackView } from './QRFeedbackView';

function Fallback() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950 text-slate-400 text-sm animate-pulse">
      Yükleniyor…
    </div>
  );
}

const pageRoutes = (
  <>
    <Route index element={<QRMenuHome />} />
    <Route path="menu" element={<QRMenuView />} />
    <Route path="cart" element={<QRCartView />} />
    <Route path="orders" element={<QROrdersView />} />
    <Route path="call-waiter" element={<QRCallWaiterView />} />
    <Route path="request-bill" element={<QRRequestBillView />} />
    <Route path="valet" element={<QRValetView />} />
    <Route path="wifi" element={<QRWifiView />} />
    <Route path="feedback" element={<QRFeedbackView />} />
  </>
);

/** Public QR menü — AppRouter: `/m/:tenantCode/*` */
export function PublicQrMenuRoutes() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="t/:tableToken" element={<QRCustomerLayout />}>
          {pageRoutes}
        </Route>
        <Route element={<QRCustomerLayout />}>{pageRoutes}</Route>
      </Routes>
    </Suspense>
  );
}

export const PublicQrMenuApp = PublicQrMenuRoutes;

export {
  QRCustomerLayout,
  QRMenuHome,
  QRMenuView,
  QRCartView,
  QROrdersView,
  QRCallWaiterView,
  QRRequestBillView,
  QRValetView,
  QRWifiView,
  QRFeedbackView,
};
