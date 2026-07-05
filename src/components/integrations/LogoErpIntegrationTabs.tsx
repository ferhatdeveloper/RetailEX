import { useState } from 'react';
import { Tabs } from 'antd';
import { LogoTigerRestPanel } from './LogoTigerRestPanel';
import type { LogoErpPanelTab } from './logoErpPanelTypes';

const TAB_ITEMS: { key: LogoErpPanelTab; label: string }[] = [
  { key: 'general', label: 'Bağlantı' },
  { key: 'params', label: 'Parametreler' },
  { key: 'sync', label: 'Veri & İçe Aktar' },
];

export function LogoErpIntegrationTabs() {
  const [activeTab, setActiveTab] = useState<LogoErpPanelTab>('general');

  return (
    <Tabs
      activeKey={activeTab}
      onChange={(key) => setActiveTab(key as LogoErpPanelTab)}
      items={TAB_ITEMS.map((t) => ({
        key: t.key,
        label: t.label,
        children: <LogoTigerRestPanel activeTab={t.key} />,
      }))}
    />
  );
}
