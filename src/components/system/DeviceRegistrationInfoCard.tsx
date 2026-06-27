import type { ComponentType } from 'react';
import {
  Cpu,
  Globe,
  HardDrive,
  Monitor,
  Network,
  User,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import type { DesktopDeviceInfo, PosTerminalRegistration } from '../../services/deviceRegistrationService';

type Props = {
  device?: DesktopDeviceInfo | null;
  registration?: PosTerminalRegistration | null;
  darkMode?: boolean;
  compact?: boolean;
  showStatus?: boolean;
  statusLabel?: string;
};

function pick(
  reg?: PosTerminalRegistration | null,
  dev?: DesktopDeviceInfo | null,
  regKey: keyof PosTerminalRegistration,
  devKey: keyof DesktopDeviceInfo,
): string | undefined {
  const rv = reg?.[regKey];
  if (rv != null && rv !== '') return String(rv);
  const dv = dev?.[devKey];
  if (dv != null && dv !== '') return String(dv);
  return undefined;
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <span className="text-gray-500">{label}: </span>
        <span className={mono ? 'font-mono break-all' : ''}>{value}</span>
      </div>
    </div>
  );
}

export function DeviceRegistrationInfoCard({
  device,
  registration,
  darkMode = false,
  compact = false,
  showStatus = false,
  statusLabel = 'Onay bekliyor',
}: Props) {
  const terminalName = pick(registration, device, 'terminalName', 'terminalName') || '—';
  const deviceId = pick(registration, device, 'deviceId', 'deviceId');
  const computerName = pick(registration, device, 'computerName', 'computerName');
  const osUser = pick(registration, device, 'osUser', 'osUser');
  const osPlatform = pick(registration, device, 'osPlatform', 'osPlatform');
  const osArch = pick(registration, device, 'osArch', 'osArch');
  const osVersion = pick(registration, device, 'osVersion', 'osVersion');
  const localIp = pick(registration, device, 'localIp', 'localIp');
  const timezone = pick(registration, device, 'timezone', 'timezone');
  const locale = pick(registration, device, 'locale', 'locale');
  const appVersion = pick(registration, device, 'appVersion', 'appVersion');
  const role = pick(registration, device, 'role', 'role');
  const cpuCores = device?.cpuCores;

  const osLine = [osPlatform, osArch, osVersion].filter(Boolean).join(' · ');

  return (
    <div
      className={`rounded-lg border ${
        compact ? 'p-3' : 'p-4'
      } ${
        darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-blue-200 bg-blue-50/60'
      }`}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Monitor className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="font-semibold text-sm">{terminalName}</span>
        {role && (
          <Badge variant="outline" className="text-[10px]">
            {role}
          </Badge>
        )}
        {showStatus && (
          <Badge className="text-[10px] bg-amber-500">{statusLabel}</Badge>
        )}
      </div>

      <div className={`grid gap-1.5 ${compact ? '' : 'sm:grid-cols-2'}`}>
        <InfoRow icon={HardDrive} label="Bilgisayar" value={computerName} />
        <InfoRow icon={User} label="OS kullanıcısı" value={osUser} />
        <InfoRow icon={Cpu} label="İşletim sistemi" value={osLine || undefined} />
        <InfoRow icon={Network} label="Yerel IP" value={localIp} mono />
        <InfoRow icon={Globe} label="Saat dilimi" value={timezone} />
        <InfoRow icon={Globe} label="Dil" value={locale} />
        {cpuCores != null && (
          <InfoRow icon={Cpu} label="CPU çekirdek" value={String(cpuCores)} />
        )}
        {appVersion && <InfoRow icon={Monitor} label="Uygulama" value={`v${appVersion}`} />}
        {deviceId && (
          <InfoRow icon={HardDrive} label="Cihaz ID" value={deviceId} mono />
        )}
      </div>
    </div>
  );
}
