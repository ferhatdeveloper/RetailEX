import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
    SOCIAL_INBOX_CHANNELS,
    type SocialChannel,
    type SocialInboxMessage,
} from '../../../services/messaging/clinicSocialInbox';
import { prepareClinicInbox } from '../../../services/messaging/clinicSocialSync';

function channelLabelKey(channel: SocialChannel): string {
    return channel === 'instagram' ? 'bClinicV2SetInstagram' : 'bClinicV2SetWhatsapp';
}

export function ClinicV2Inbox() {
    const { tm, language } = useLanguage();
    const [channel, setChannel] = useState<SocialChannel>('instagram');
    const [messages, setMessages] = useState<SocialInboxMessage[]>([]);
    const [instagramConnected, setInstagramConnected] = useState(false);
    const [whatsappConnected, setWhatsappConnected] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        let cancel = false;
        void prepareClinicInbox().then((snapshot) => {
            if (cancel) return;
            setMessages(snapshot.messages);
            setInstagramConnected(snapshot.instagramConnected);
            setWhatsappConnected(snapshot.whatsappConnected);
        }).catch(() => {
            if (cancel) return;
            setMessages([]);
        });
        return () => {
            cancel = true;
        };
    }, []);

    const visible = messages.filter((row) => row.channel === channel);
    const selected = visible.find((row) => row.id === selectedId) ?? null;
    const channelConnected = channel === 'instagram' ? instagramConnected : whatsappConnected;

    const columns = useMemo<ColumnDef<SocialInboxMessage>[]>(() => [
        {
            id: 'channelLabel',
            accessorFn: (row) => tm(channelLabelKey(row.channel)),
            header: tm('bClinicV2InboxChannel'),
        },
        { id: 'counterparty', accessorKey: 'counterparty', header: tm('bClinicV2InboxCounterparty') },
        {
            id: 'directionLabel',
            accessorFn: (row) => (row.direction === 'in' ? tm('bClinicV2InboxIn') : tm('bClinicV2InboxOut')),
            header: tm('bClinicV2InboxDirection'),
        },
        { id: 'body', accessorKey: 'body', header: tm('bClinicV2InboxBody') },
        {
            id: 'timeLabel',
            accessorFn: (row) => formatInboxTime(row.occurredAt, language),
            header: tm('bClinicV2InboxTime'),
        },
    ], [language, tm]);

    const emptyKey = !channelConnected
        ? (channel === 'whatsapp' ? 'bClinicV2WaBackofficeEmpty' : 'bClinicV2InboxIgOff')
        : 'bClinicV2InboxEmpty';

    return (
        <div data-testid="clinic-v2-inbox" className="flex h-full min-h-0 gap-4 p-4" style={{ background: '#fcfcfc' }}>
            <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                <div role="group" aria-label={tm('bClinicV2InboxChannel')} className="flex gap-2">
                    {SOCIAL_INBOX_CHANNELS.map((id) => {
                        const on = channel === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                data-testid={`clinic-v2-inbox-channel-${id}`}
                                aria-pressed={on}
                                onClick={() => {
                                    setChannel(id);
                                    setSelectedId(null);
                                }}
                                className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                                style={{
                                    borderColor: on ? '#1b84ff' : '#e1e3ea',
                                    background: on ? '#eef6ff' : '#fff',
                                    color: on ? '#1b84ff' : '#4b5675',
                                }}
                            >
                                {tm(channelLabelKey(id))}
                            </button>
                        );
                    })}
                </div>
                {visible.length === 0 ? (
                    <p data-testid="clinic-v2-inbox-empty" className="text-[13px] text-[#7e8299]">
                        {tm(emptyKey)}
                    </p>
                ) : null}
                <div className="min-h-0 flex-1">
                    <DevExDataGrid
                        data={visible}
                        columns={columns}
                        pageSize={50}
                        enableFiltering
                        enablePagination
                        enableExcelExport={false}
                        enableRefresh={false}
                        storageNamespace="clinicV2Inbox"
                        height={480}
                        onRowClick={(row) => setSelectedId(row.id)}
                    />
                </div>
            </section>
            <aside
                data-testid="clinic-v2-inbox-thread"
                className="flex w-[360px] shrink-0 flex-col overflow-y-auto rounded-lg border border-[#f1f1f4] bg-white p-4"
            >
                {!selected ? (
                    <p className="text-[13px] text-[#a1a5b7]">{tm('bClinicV2InboxPick')}</p>
                ) : (
                    <div className="text-[13px] text-[#071437]">
                        <p className="text-[12px] text-[#7e8299]">
                            {tm(channelLabelKey(selected.channel))}
                            {' · '}
                            {selected.counterparty}
                            {' · '}
                            {selected.direction === 'in' ? tm('bClinicV2InboxIn') : tm('bClinicV2InboxOut')}
                            {' · '}
                            {formatInboxTime(selected.occurredAt, language)}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap">{selected.body}</p>
                    </div>
                )}
            </aside>
        </div>
    );
}

function formatInboxTime(iso: string, language: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const locale = language === 'ar' ? 'ar' : language === 'ku' ? 'ku' : language === 'en' ? 'en' : 'tr';
    return date.toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
