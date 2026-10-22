import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
    SOCIAL_INBOX_CHANNELS,
    buildInboxThreads,
    type SocialChannel,
    type SocialInboxThread,
} from '../../../services/messaging/clinicSocialInbox';
import { listSocialMessages } from '../../../services/messaging/clinicSocialRepository';

function channelLabelKey(channel: SocialChannel): string {
    return channel === 'instagram' ? 'bClinicV2SetInstagram' : 'bClinicV2SetWhatsapp';
}

export function ClinicV2Inbox() {
    const { tm, language } = useLanguage();
    const [channel, setChannel] = useState<SocialChannel>('instagram');
    const [threads, setThreads] = useState<SocialInboxThread[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        let cancel = false;
        void listSocialMessages().then((messages) => {
            if (cancel) return;
            // Belirteç yok: tablo okunur, ekranda uydurma veya gerçek satır gösterilmez.
            setThreads(buildInboxThreads({ token: '', messages }));
        });
        return () => {
            cancel = true;
        };
    }, []);

    const visible = threads.filter((row) => row.channel === channel);
    const selected = visible.find((row) => row.id === selectedId) ?? null;

    const columns = useMemo<ColumnDef<SocialInboxThread>[]>(() => [
        { id: 'sender', accessorKey: 'sender', header: tm('bClinicV2InboxSender') },
        { id: 'lastMessage', accessorKey: 'lastMessage', header: tm('bClinicV2InboxLast') },
        {
            id: 'timeLabel',
            accessorFn: (row) => formatInboxTime(row.occurredAt, language),
            header: tm('bClinicV2InboxTime'),
        },
        {
            id: 'channelLabel',
            accessorFn: (row) => tm(channelLabelKey(row.channel)),
            header: tm('bClinicV2InboxChannel'),
        },
    ], [language, tm]);

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
                        {tm('bClinicV2InboxEmpty')}
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
                    <ul className="flex flex-col gap-3">
                        {selected.messages.map((message) => (
                            <li key={message.id} className="text-[13px] text-[#071437]">
                                <p className="text-[12px] text-[#7e8299]">
                                    {message.direction === 'in' ? tm('bClinicV2InboxIn') : tm('bClinicV2InboxOut')}
                                    {' · '}
                                    {formatInboxTime(message.occurredAt, language)}
                                </p>
                                <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
                            </li>
                        ))}
                    </ul>
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
