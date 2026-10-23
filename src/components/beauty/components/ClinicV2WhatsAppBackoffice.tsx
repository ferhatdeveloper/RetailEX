import { useEffect, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
    planWhatsAppInboxList,
    whatsappBridgePort,
    type WhatsAppInboxPlan,
} from '../../../services/messaging/clinicSocialInbox';
import { readBackofficeWhatsApp } from '../../../services/messaging/clinicSocialRepository';

const SOURCE_KEY: Record<Exclude<WhatsAppInboxPlan['source'], 'none'>, string> = {
    evolution: 'bClinicV2WaSourceEvolution',
    bridge: 'bClinicV2WaSourceBridge',
    meta: 'bClinicV2WaSourceMeta',
};

/**
 * WhatsApp bağlantısı backoffice kaydından okunur.
 * Bu ekranda ikinci bir bağlama düğmesi yoktur.
 */
export function ClinicV2WhatsAppBackoffice() {
    const { tm } = useLanguage();
    const [plan, setPlan] = useState<WhatsAppInboxPlan | null>(null);
    const [base, setBase] = useState('');

    useEffect(() => {
        let cancel = false;
        void readBackofficeWhatsApp().then((record) => {
            if (cancel) return;
            setPlan(planWhatsAppInboxList(record));
            setBase(String(record?.whatsapp_base_url || ''));
        });
        return () => {
            cancel = true;
        };
    }, []);

    if (!plan) return null;
    if (!plan.connected) {
        return (
            <p data-testid="clinic-v2-wa-backoffice" className="text-[13px] text-[#7e8299]">
                {tm('bClinicV2WaBackofficeEmpty')}
            </p>
        );
    }
    const port = plan.source === 'bridge' ? whatsappBridgePort(base) : null;
    return (
        <p data-testid="clinic-v2-wa-backoffice" className="text-[13px] text-[#4b5675]">
            {tm('bClinicV2WaBackofficeLinked')}
            {' · '}
            {tm(SOURCE_KEY[plan.source])}
            {port ? ` · ${tm('bClinicV2WaBridgePort')} ${port}` : ''}
        </p>
    );
}
