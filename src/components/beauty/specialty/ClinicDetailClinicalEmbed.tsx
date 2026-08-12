import React, { useCallback } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautyAppointment, BeautyAppointmentClinicalData } from '../../../types/beauty';
import { useClinicErpSpecialtyOptional } from '../context/ClinicErpSpecialtyContext';
import { useBeautyStore } from '../store/useBeautyStore';
import { DentalChartScreen } from './DentalChartScreen';
import { PhysioBodyScreen } from './PhysioBodyScreen';
import { ObstetricsScreen } from './ObstetricsScreen';
import { DietitianScreen } from './DietitianScreen';

/**
 * Randevu detay paneli — Clinic ERP uzmanlığına göre klinik araç (şema / panel).
 * Veriler `beauty_appointments.clinical_data` (JSONB) üzerinde kalıcıdır.
 */
export function ClinicDetailClinicalEmbed({
    appointment,
}: {
    appointment: Pick<BeautyAppointment, 'id' | 'clinical_data'>;
}) {
    const { tm } = useLanguage();
    const spec = useClinicErpSpecialtyOptional()?.specialty ?? 'beauty_default';
    const appointments = useBeautyStore(s => s.appointments);
    const updateAppointment = useBeautyStore(s => s.updateAppointment);

    const patchClinical = useCallback(
        async (patch: Partial<BeautyAppointmentClinicalData>) => {
            const fresh = appointments.find(a => a.id === appointment.id);
            const prev =
                fresh?.clinical_data && typeof fresh.clinical_data === 'object'
                    ? fresh.clinical_data
                    : appointment.clinical_data && typeof appointment.clinical_data === 'object'
                      ? appointment.clinical_data
                      : {};
            await updateAppointment(appointment.id, {
                clinical_data: { ...prev, ...patch } as BeautyAppointmentClinicalData,
            });
        },
        [appointment.id, appointment.clinical_data, appointments, updateAppointment],
    );

    if (spec === 'dental') {
        return (
            <DentalChartScreen
                compact
                showHeader={false}
                initialDental={appointment.clinical_data?.dental}
                onPersistDental={dental => patchClinical({ dental })}
            />
        );
    }
    if (spec === 'physiotherapy') {
        return (
            <PhysioBodyScreen
                embed
                initialActiveZone={appointment.clinical_data?.physiotherapy?.active_zone ?? null}
                onPersistZone={zone => patchClinical({ physiotherapy: { active_zone: zone } })}
            />
        );
    }
    if (spec === 'obstetrics') {
        const w = appointment.clinical_data?.obstetrics?.weeks;
        return (
            <ObstetricsScreen
                embed
                initialWeeks={typeof w === 'number' ? w : undefined}
                onPersistWeeks={weeks => patchClinical({ obstetrics: { weeks } })}
            />
        );
    }
    if (spec === 'dietitian') {
        const k = appointment.clinical_data?.dietitian?.kcal;
        return (
            <DietitianScreen
                embed
                initialKcal={typeof k === 'number' ? k : undefined}
                onPersistKcal={kcal => patchClinical({ dietitian: { kcal } })}
            />
        );
    }

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600 leading-relaxed">
            {tm('bPanelClinicalPlaceholder')}
        </div>
    );
}
