import type { ElementType } from 'react';
import {
  clinicDashboardKpiTone,
  type ClinicDashboardKpiKey,
} from '../../../utils/clinicDashboardKpiTones';

/**
 * Klinik Paneli KPI kartı. Yerleşim aynıdır; yalnızca zemin ve yazı rengi değişir.
 */
export function ClinicDashboardKpiCard({
  label,
  value,
  sub,
  toneKey,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  toneKey: ClinicDashboardKpiKey;
  icon: ElementType;
}) {
  const tone = clinicDashboardKpiTone(toneKey);
  return (
    <div
      data-testid={`clinic-dashboard-kpi-${toneKey}`}
      data-clinic-kpi-key={toneKey}
      style={{
        background: tone.background,
        border: `1px solid ${tone.border}`,
        borderRadius: 8,
        padding: '16px 18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: tone.label, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
        <Icon size={15} style={{ color: tone.icon }} />
      </div>
      <p style={{ fontSize: 26, fontWeight: 800, color: tone.value, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, fontWeight: 600, color: tone.hint, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}
