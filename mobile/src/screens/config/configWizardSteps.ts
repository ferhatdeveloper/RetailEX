/**
 * Mobil bağlantı kurulum sihirbazı — Windows SetupWizard adımlarının sade karşılığı.
 */
import type { LucideIcon } from 'lucide-react-native';
import {
  CheckCircle,
  Cloud,
  Database,
  Server,
  Wifi,
} from 'lucide-react-native';
import type { ApiMode } from '../../store/configStore';

export type ConfigWizardStepId =
  | 'infra'
  | 'cloud'
  | 'bridge'
  | 'postgres'
  | 'summary';

export type ConfigWizardStep = {
  id: ConfigWizardStepId;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
};

/** Windows: Altyapı (işletme tipi + DB) → DB → Özet — mobilde bağlantı odaklı 5 adım. */
export function getConfigWizardSteps(apiMode: ApiMode): ConfigWizardStep[] {
  const steps: ConfigWizardStep[] = [
    {
      id: 'infra',
      label: 'Altyapı Seçimi',
      shortLabel: 'Altyapı',
      icon: Server,
    },
    {
      id: 'cloud',
      label: 'Kiracı / API',
      shortLabel: 'Kiracı',
      icon: Cloud,
    },
    {
      id: 'bridge',
      label: 'Bağlantı',
      shortLabel: 'Bağlantı',
      icon: Wifi,
    },
  ];

  if (apiMode !== 'postgrest') {
    steps.push({
      id: 'postgres',
      label: 'Sistem Veritabanı',
      shortLabel: 'PostgreSQL',
      icon: Database,
    });
  }

  steps.push({
    id: 'summary',
    label: 'Özet ve Onay',
    shortLabel: 'Özet',
    icon: CheckCircle,
  });

  return steps;
}
