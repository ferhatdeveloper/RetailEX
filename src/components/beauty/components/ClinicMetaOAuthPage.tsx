import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getPrimarySqlConnectionString } from '../../../services/postgres';
import { completeInstagramConnect } from '../../../services/messaging/clinicInstagramConnect';
import { metaOAuthRedirectUri, readMetaAppId } from '../../../services/messaging/clinicSocialInbox';
import { getBridgeUrl } from '../../../utils/env';

const ERROR_KEY: Record<string, string> = {
    missing_app_id: 'bClinicV2SocialMissingApp',
    missing_app_secret: 'bClinicV2SocialMissingSecret',
    missing_code: 'bClinicV2IgExchangeFailed',
    no_professional_account: 'bClinicV2IgNoProfessional',
    exchange_failed: 'bClinicV2IgExchangeFailed',
};

export function ClinicMetaOAuthPage() {
    const { tm } = useLanguage();
    const [params] = useSearchParams();
    const [text, setText] = useState('');

    useEffect(() => {
        let cancel = false;
        const appId = readMetaAppId();
        const code = params.get('code');
        const state = params.get('state') || '';
        const oauthError = params.get('error');
        if (oauthError || !code) {
            setText(tm(!appId ? 'bClinicV2SocialMissingApp' : 'bClinicV2IgExchangeFailed'));
            return;
        }
        void completeInstagramConnect({
            appId,
            code,
            state,
            redirectUri: metaOAuthRedirectUri(window.location.origin),
            connStr: safeConn(),
            bridgeUrl: getBridgeUrl(),
        }).then((result) => {
            if (cancel) return;
            if (result.ok) {
                setText(`${tm('bClinicV2IgConnected')} · ${result.accountName}`);
                return;
            }
            setText(tm(ERROR_KEY[result.error] || 'bClinicV2IgExchangeFailed'));
        });
        return () => {
            cancel = true;
        };
    }, [params, tm]);

    return (
        <main data-testid="clinic-meta-oauth" className="mx-auto max-w-lg p-8 text-[14px] text-[#071437]">
            <h1 className="text-[18px] font-medium">{tm('bClinicV2SetInstagram')}</h1>
            <p className="mt-3" data-testid="clinic-meta-oauth-status">{text}</p>
        </main>
    );
}

function safeConn(): string {
    try {
        return getPrimarySqlConnectionString();
    } catch {
        return '';
    }
}
