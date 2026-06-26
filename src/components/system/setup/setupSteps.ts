import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  CheckCircle,
  Cpu,
  Database,
  Globe,
  Layout,
  Server,
  Settings2,
} from 'lucide-react';

export interface SetupWizardStep {
  id: number;
  label: string;
  icon: LucideIcon;
}

export function getSetupWizardSteps(skipIntegration: boolean): SetupWizardStep[] {
  if (skipIntegration) {
    return [
      { id: 1, label: 'Altyapı Seçimi', icon: Server },
      { id: 2, label: 'Entegrasyon Tercihi', icon: Layout },
      { id: 3, label: 'Firma & Dönem', icon: Globe },
      { id: 4, label: 'Sistem Veritabanı', icon: Database },
      { id: 5, label: 'Cihaz Kaydı', icon: Cpu },
      { id: 6, label: 'Özet ve Onay', icon: CheckCircle },
      { id: 7, label: 'Sistem Kurulumu', icon: Activity },
    ];
  }

  return [
    { id: 1, label: 'Altyapı Seçimi', icon: Server },
    { id: 2, label: 'Entegrasyon Tercihi', icon: Layout },
    { id: 3, label: 'ERP Bağlantısı', icon: Settings2 },
    { id: 4, label: 'Firma & Dönem', icon: Globe },
    { id: 5, label: 'Kasa Seçimi', icon: Database },
    { id: 6, label: 'Sistem Veritabanı', icon: Database },
    { id: 7, label: 'Cihaz Kaydı', icon: Cpu },
    { id: 8, label: 'Özet ve Onay', icon: CheckCircle },
    { id: 9, label: 'Sistem Kurulumu', icon: Activity },
  ];
}

export function getSetupFinalStep(skipIntegration: boolean): number {
  return skipIntegration ? 7 : 9;
}

export function getFirmPeriodStep(skipIntegration: boolean): number {
  return skipIntegration ? 3 : 4;
}

export function getDbSettingsStep(skipIntegration: boolean): number {
  return skipIntegration ? 4 : 6;
}

export function getSummaryStep(skipIntegration: boolean): number {
  return skipIntegration ? 6 : 8;
}

export function getDeviceStep(skipIntegration: boolean): number {
  return skipIntegration ? 5 : 7;
}
