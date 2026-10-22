import { useEffect, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ERP_SETTINGS } from '../../../services/postgres';
import {
    buildMetaOAuthStart,
    metaOAuthRedirectUri,
    metaOAuthState,
    openSocialOAuth,
    readMetaAppId,
    whatsappBridgeHealth,
    whatsappBridgePort,
    type SocialChannel,
    type WhatsAppBridgeHealth,
} from '../../../services/messaging/clinicSocialInbox';
import {
    disconnectSocialAccount,
    listSocialAccounts,
    type SocialChannelAccount,
} from '../../../services/messaging/clinicSocialRepository';
import { getEmbeddedBridgeStatus } from '../../../services/messaging/whatsappEmbeddedBridge';

type Props = {
    channel: SocialChannel;
    bridgeBaseUrl?: string | null;
    bridgeToken?: string | null;
};

const HEALTH_KEY: Record<WhatsAppBridgeHealth, string> = {
    loading: 'bClinicV2WaBridgeOff',
    connected: 'bClinicV2WaBridgeOk',
    scanning: 'bClinicV2WaBridgeScan',
    disconnected: 'bClinicV2WaBridgeOff',
    down: 'bClinicV2WaBridgeDown',
};

export function ClinicV2SocialConnect({ channel, bridgeBaseUrl, bridgeToken }: Props) {
    const { tm } = useLanguage();
    const [account, setAccount] = useState<SocialChannelAccount | null>(null);
    const [health, setHealth] = useState<WhatsAppBridgeHealth>('loading');
    const [bridgeError, setBridgeError] = useState('');
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
            setAccount(rows.find((row) => row.channel === channel) ?? null);
        });
        return () => {
            cancel = true;
        };
    }, [channel]);

    useEffect(() => {
        if (channel !== 'whatsapp') return;
        let cancel = false;
        const base = String(bridgeBaseUrl || '').trim() || '/__wa_bridge';
        void getEmbeddedBridgeStatus({
            whatsapp_base_url: base,
            whatsapp_token: bridgeToken,
        }).then((res) => {
            if (cancel) return;
            setHealth(whatsappBridgeHealth(res));
            setBridgeError(res.ok ? '' : String(res.error || ''));
        });
        return () => {
            cancel = true;
        };
    }, [channel, bridgeBaseUrl, bridgeToken]);

    const disconnect = async () => {
        try {
            await disconnectSocialAccount(channel);
            setAccount(null);
        } catch {
            /* tablo yoksa hesap satırı durur */
        }
    };

    const bridgeBase = String(bridgeBaseUrl || '').trim() || '/__wa_bridge';
    const port = channel === 'whatsapp' ? whatsappBridgePort(bridgeBase) : null;

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
            {channel === 'whatsapp' ? (
                <p className="mt-4 text-[13px] text-[#4b5675]" data-testid="clinic-v2-wa-bridge">
                    {tm('bClinicV2WaBridge')}
                    {port ? ` · ${tm('bClinicV2WaBridgePort')} ${port}` : ''}
                    {' · '}
                    {health === 'down' && bridgeError ? bridgeError : tm(HEALTH_KEY[health])}
                </p>
            ) : null}
        </div>
    );
}
