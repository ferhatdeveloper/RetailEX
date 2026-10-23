import { useEffect, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ERP_SETTINGS } from '../../../services/postgres';
import {
    buildMetaOAuthStart,
    metaOAuthRedirectUri,
    metaOAuthState,
    openSocialOAuth,
    readMetaAppId,
} from '../../../services/messaging/clinicSocialInbox';
import {
    disconnectSocialAccount,
    listSocialAccounts,
    type SocialChannelAccount,
} from '../../../services/messaging/clinicSocialRepository';

type Props = {
    channel: 'instagram';
};

export function ClinicV2SocialConnect({ channel }: Props) {
    const { tm } = useLanguage();
    const [account, setAccount] = useState<SocialChannelAccount | null>(null);
    const appId = readMetaAppId();
    const oauth = buildMetaOAuthStart({
        appId,
        channel,
        redirectUri: metaOAuthRedirectUri(typeof window !== 'undefined' ? window.location.origin : ''),
        state: metaOAuthState(channel, String(ERP_SETTINGS.firmNr || '')),
    });
    const oauthUrl = 'url' in oauth ? oauth.url : '';

    useEffect(() => {
        let cancel = false;
        void listSocialAccounts().then((rows) => {
            if (cancel) return;
            const row = rows.find((item) => item.channel === channel && item.linked) ?? null;
            setAccount(row);
        });
        return () => {
            cancel = true;
        };
    }, [channel]);

    const disconnect = async () => {
        try {
            await disconnectSocialAccount(channel);
            setAccount(null);
        } catch {
            /* tablo yoksa hesap satırı durur */
        }
    };

    return (
        <div data-testid={`clinic-v2-social-${channel}`} className="max-w-xl">
            {account ? (
                <div>
                    <p className="text-[13px] text-[#7e8299]">{tm('bClinicV2SocialAccount')}</p>
                    <p className="mt-1 text-[15px] font-medium text-[#071437]" data-testid={`clinic-v2-social-account-${channel}`}>
                        {account.accountName}
                    </p>
                    <button type="button" className="cv2s-ghost mt-4" onClick={() => void disconnect()}>
                        {tm('bClinicV2SocialDisconnect')}
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    data-testid={`clinic-v2-social-connect-${channel}`}
                    data-oauth-url={oauthUrl}
                    aria-disabled={oauthUrl ? undefined : true}
                    className={oauthUrl ? 'cv2s-save' : 'cv2s-ghost'}
                    onClick={() => {
                        if (!oauthUrl) return;
                        openSocialOAuth(oauthUrl);
                    }}
                >
                    {oauthUrl ? tm('bClinicV2SocialConnect') : tm('bClinicV2SocialMissingApp')}
                </button>
            )}
        </div>
    );
}
