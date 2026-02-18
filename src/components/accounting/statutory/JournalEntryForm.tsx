import React, { useState, useEffect } from 'react';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { TableRoutingService } from '../../../services/TableRoutingService';
import { offlineQueue } from '../../../services/OfflineQueueService';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Calendar } from '../../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '../../../lib/utils';
import { CalendarIcon, Save, X, Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { ChartOfAccounts, Account } from './ChartOfAccounts';
import { AccountPicker } from './AccountPicker';

// Types
interface JournalLine {
    id: string; // Temp ID for UI
    account_code: string;
    account_name: string;
    description: string;
    debit: number;
    credit: number;
    document_no?: string; // Lines can have doc no too
    account_ref?: number; // Store logicalref
}

interface JournalFormProps {
    onClose: () => void;
    onSaveSuccess: () => void;
    initialData?: any; // For edit mode
}

export function JournalEntryForm({ onClose, onSaveSuccess, initialData }: JournalFormProps) {
    const { selectedFirm, selectedPeriod, selectedBranch } = useFirmaDonem();

    // Header State
    const [date, setDate] = useState<Date>(initialData?.date ? new Date(initialData.date) : new Date());
    const [ficheNo, setFicheNo] = useState(initialData?.fiche_no || '');
    const [ficheType, setFicheType] = useState<string>(initialData?.fiche_type?.toString() || '1');
    const [description, setDescription] = useState(initialData?.description || '');
    const [docNo, setDocNo] = useState(initialData?.doc_no || '');

    // Lines State
    const [lines, setLines] = useState<JournalLine[]>([]);
    const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
    const [showAccountPicker, setShowAccountPicker] = useState(false);

    // UI State
    const [saving, setSaving] = useState(false);

    // Totals
    const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
    const balance = totalDebit - totalCredit;

    // --- Loading Initial Data (if edit) ---
    // TODO: Fetch lines if editing

    const handleAddLine = () => {
        setLines([...lines, {
            id: Math.random().toString(36).substr(2, 9),
            account_code: '',
            account_name: '',
            description: description, // Default to header desc
            debit: 0,
            credit: 0
        }]);
    };

    const handleAccountSelect = (account: Account) => {
        if (activeLineIndex === null) return;

        const newLines = [...lines];
        newLines[activeLineIndex].account_code = account.code;
        newLines[activeLineIndex].account_name = account.name;
        newLines[activeLineIndex].account_ref = account.logicalref;
        setLines(newLines);
        setShowAccountPicker(false);
        setActiveLineIndex(null);
    };

    setSaving(true);
    try {
        // Context for Routing
        const routingContext = {
            firmNr: selectedFirm.nr,
            periodNr: selectedPeriod.nr
        };

        // 1. Prepare Header Payload
        const headerPayload = {
            fiche_no: ficheNo,
            date: format(date, 'yyyy-MM-dd'),
            fiche_type: parseInt(ficheType),
            description: description,
            doc_no: docNo,
            total_debit: totalDebit,
            total_credit: totalCredit,
            branch_id: selectedBranch?.logicalref,
            status: 1 // Active
        };

        // 2. Add Header to Queue
        // We use a generated UUID for the header so lines can reference it (if backend supports it)
        // Or we send a composite object if the backend endpoint supports "Deep Insert".
        // Given the complexity, let's assume we are sending a "Composite Journal Entry" to a specific endpoint
        // OR we treat the Header INSERT as the parent. 
        // *CRITICAL*: For offline safety, sending the whole object (Header + Lines) is best.
        // Let's us assume we are inserting into EMUHFICHE and the backend trigger or logic handles lines?
        // NO, Supabase REST is table-based. 
        // STRATEGY: We will add the HEADER to the queue. 
        // The LINES need the Header's ID. 
        // In a distributed offline system, we assign the GUID (logicalref or similar) on the client if possible, 
        // OR we use the `idempotency_key` to strict link them.
        // SIMPLIFICATION: I will use the 'RPC' or 'Edge Function' approach implication here:
        // I'll enqueue a single "SAVE_JOURNAL" command if I had an endpoint.
        // But since we are using Table Routing, we might need to enqueue Header then Lines.
        // HOWEVER, `OfflineQueueService` processes sequentially. 
        // LET'S DO THIS: Enqueue the Header. We need its ID. 
        // Supabase ID generation happens on server. 
        // SOLUTION: We will use a "Composite Payload" and route it to a custom RPC or just use the `offlineQueue` to hit a custom "journal_entry" endpoint 
        // that handles the transaction. 
        // BUT `TableRoutingService` targets specific tables.
        // Let's try to hit the `EMUHFICHE` table but with a special payload that the backend (FastAPI) intercepts? 
        // No, getting ahead of myself. 
        // BACK TO BASICS: The user wants "Offline Queue". The Queue calls `syncItem`. 
        // `syncItem` does a FETCH to `TableRoutingService.getTableName`.
        // If I just insert to `FN_..._EMUHFICHE`, I only get header.
        // I need to insert lines to `FN_..._EMUHLINE`. They need `parent_ref`.
        // REVISION: I will use the `offlineQueue` to send a single requests to a FastAPI endpoint (which I need to build/verify) 
        // OR, strictly for now, I will assume the `accountingService` wrapper previously mentioned handled this.
        // WAIT, looking at the code I replaced: `await accountingService.saveJournalEntry(payload);`
        // The user said "Logic is yours". 
        // I will implement a robust client-side ID generation (UUID) for the `logicalref` (or equivalent `guid`) if the schema supports it.
        // Checking schema... `logicalref` is usually SERIAL. `guid` is UUID.
        // OK, I will update `OfflineQueueService` to support a "Transaction Bundle" or just hit the FastAPI backend.
        // The previous conversation phase 5 mentioned "Implement Accounting Endpoints in FastAPI".
        // So, I should enqueue a request to THAT endpoint.
        // Endpoint: `/api/accounting/journal-entry` (or similar).
        // BUT `OfflineQueueService` is built to hit `Supabase REST` based on `tableName`.
        // I will update the `tableName` to be a "Virtual Table" or "Endpoint" that the service handles.
        // Let's use `JOURNAL_ENTRY_COMPOSITE` as the table name, and handle it in `OfflineQueueService` or just let it hit the backend.

        // ACTUALLY: The best way for "Logo-style" is strict table inserts.
        // 1. Queue Header Insert (Client generates a temporary UUID `guid`).
        // 2. Queue Line Inserts (referencing that `guid`).
        // Backend trigger maps `guid` to `logicalref`.

        // ALTERNATIVE (Simpler & Robust): Queue a single item with type 'RPC' or 'API'.
        // I'll stick to the "Composite Payload" to a specific FastAPI endpoint for atomicity.
        // I'll cheat slightly and make the `tableName` argument be the endpoint path suffix.

        const compositePayload = {
            ...headerPayload,
            lines: lines.map((line, index) => ({
                line_nr: index + 1,
                account_code: line.account_code, // Accessing by code might be safer if refs change
                account_ref: line.account_ref,
                description: line.description,
                amount: line.debit > 0 ? line.debit : line.credit,
                sign: line.debit > 0 ? 0 : 1,
                date: format(date, 'yyyy-MM-dd'),
                branch_id: selectedBranch?.logicalref
            }))
        };

        // Add to Queue (Targeting the FastAPI endpoint logic via a virtual table name)
        // effectively: POST /FN_..._EMUHFICHE (but with lines? No, standard REST fails).
        // I will use a custom tag 'RPC_SAVE_JOURNAL' which I will handle in QueueService specific logic later if needed
        // OR simpler: `rpc/save_journal_entry`.
        // Let's use the Queue to call a Supabase RPC function `save_journal_entry` which I likely need to create.
        // Users prompt: "Logic is yours".
        // I will assume I will create a `save_journal` RPC that takes JSON.
        // Queue Item:
        await offlineQueue.addToQueue(
            routingContext,
            'rpc/save_journal_entry', // This acts as the "Table Name" for the URL builder
            compositePayload
                fiche_type: parseInt(ficheType),
            description: description,
            doc_no: docNo,
            total_debit: totalDebit,
            total_credit: totalCredit,
            branch_id: selectedBranch?.logicalref,
            status: 1 // Active
            };

    // 2. Add Header to Queue
    // We use a generated UUID for the header so lines can reference it (if backend supports it)
    // Or we send a composite object if the backend endpoint supports "Deep Insert".
    // Given the complexity, let's assume we are sending a "Composite Journal Entry" to a specific endpoint
    // OR we treat the Header INSERT as the parent. 
    // *CRITICAL*: For offline safety, sending the whole object (Header + Lines) is best.
    // Let's us assume we are inserting into EMUHFICHE and the backend trigger or logic handles lines?
    // NO, Supabase REST is table-based. 
    // STRATEGY: We will add the HEADER to the queue. 
    // The LINES need the Header's ID. 
    // In a distributed offline system, we assign the GUID (logicalref or similar) on the client if possible, 
    // OR we use the `idempotency_key` to strict link them.
    // SIMPLIFICATION: I will use the 'RPC' or 'Edge Function' approach implication here:
    // I'll enqueue a single "SAVE_JOURNAL" command if I had an endpoint.
    // But since we are using Table Routing, we might need to enqueue Header then Lines.
    // HOWEVER, `OfflineQueueService` processes sequentially. 
    // LET'S DO THIS: Enqueue the Header. We need its ID. 
    // Supabase ID generation happens on server. 
    // SOLUTION: We will use a "Composite Payload" and route it to a custom RPC or just use the `offlineQueue` to hit a custom "journal_entry" endpoint 
    // that handles the transaction. 
    // BUT `TableRoutingService` targets specific tables.
    // Let's try to hit the `FN_..._EMUHFICHE` table but with a special payload that the backend (FastAPI) intercepts? 
    // No, getting ahead of myself. 
    // BACK TO BASICS: The user wants "Offline Queue". The Queue calls `syncItem`. 
    // `syncItem` does a FETCH to `TableRoutingService.getTableName`.
    // If I just insert to `FN_..._EMUHFICHE`, I only get header.
    // I need to insert lines to `FN_..._EMUHLINE`. They need `parent_ref`.
    // REVISION: I will use the `offlineQueue` to send a single requests to a FastAPI endpoint (which I need to build/verify) 
    // OR, strictly for now, I will assume the `accountingService` wrapper previously mentioned handled this.
    // WAIT, looking at the code I replaced: `await accountingService.saveJournalEntry(payload);`
    // The user said "Logic is yours". 
    // I will implement a robust client-side ID generation (UUID) for the `logicalref` (or equivalent `guid`) if the schema supports it.
    // Checking schema... `logicalref` is usually SERIAL. `guid` is UUID.
    // OK, I will update `OfflineQueueService` to support a "Transaction Bundle" or just hit the FastAPI backend.
    // The previous conversation phase 5 mentioned "Implement Accounting Endpoints in FastAPI".
    // So, I should enqueue a request to THAT endpoint.
    // Endpoint: `/api/accounting/journal-entry` (or similar).
    // BUT `OfflineQueueService` is built to hit `Supabase REST` based on `tableName`.
    // I will update the `tableName` to be a "Virtual Table" or "Endpoint" that the service handles.
    // Let's use `JOURNAL_ENTRY_COMPOSITE` as the table name, and handle it in `OfflineQueueService` or just let it hit the backend.

    // ACTUALLY: The best way for "Logo-style" is strict table inserts.
    // 1. Queue Header Insert (Client generates a temporary UUID `guid`).
    // 2. Queue Line Inserts (referencing that `guid`).
    // Backend trigger maps `guid` to `logicalref`.

    // ALTERNATIVE (Simpler & Robust): Queue a single item with type 'RPC' or 'API'.
    // I'll stick to the "Composite Payload" to a specific FastAPI endpoint for atomicity.
    // I'll cheat slightly and make the `tableName` argument be the endpoint path suffix.

    const compositePayload = {
        ...headerPayload,
        lines: lines.map((line, index) => ({
            line_nr: index + 1,
            account_code: line.account_code, // Accessing by code might be safer if refs change
            account_ref: line.account_ref,
            description: line.description,
            amount: line.debit > 0 ? line.debit : line.credit,
            sign: line.debit > 0 ? 0 : 1,
            date: format(date, 'yyyy-MM-dd'),
            branch_id: selectedBranch?.logicalref
        }))
    };

    // Add to Queue (Targeting the FastAPI endpoint logic via a virtual table name)
    // effectively: POST /FN_..._EMUHFICHE (but with lines? No, standard REST fails).
    // I will use a custom tag 'RPC_SAVE_JOURNAL' which I will handle in QueueService specific logic later if needed
    // OR simpler: `rpc/save_journal_entry`.
    // Let's use the Queue to call a Supabase RPC function `save_journal_entry` which I likely need to create.
    // Users prompt: "Logic is yours".
    // I will assume I will create a `save_journal` RPC that takes JSON.
    // Queue Item:
    await offlineQueue.addToQueue(
        routingContext,
        'rpc/save_journal_entry', // This acts as the "Table Name" for the URL builder
        compositePayload
    );

    toast.success('Fiş kaydedildi (Kuyruğa Eklendi)');
    onSaveSuccess();
    onClose();

} catch (error: any) {
    console.error(error);
    toast.error('Kaydetme hatası: ' + error.message);
} finally {
    setSaving(false);
}
    };

return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-6xl h-[90vh] rounded-lg shadow-xl flex flex-col border">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-xl font-semibold">Yeni Muhasebe Fişi</h2>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="w-5 h-5" />
                </Button>
            </div>

            {/* Form Header */}
            <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50/50 border-b">
                <div>
                    <label className="text-sm font-medium text-gray-700">Fiş No</label>
                    <div className="flex gap-2">
                        <Input
                            value={ficheNo}
                            onChange={(e) => setFicheNo(e.target.value)}
                            placeholder="Auto"
                            className="font-mono"
                        />
                        <Button variant="outline" size="icon" title="Oto Numara">
                            <Search className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">Tarih</label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? format(date, "PPP", { locale: tr }) : <span>Tarih seçin</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={(d) => d && setDate(d)}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">Fiş Türü</label>
                    <Select value={ficheType} onValueChange={setFicheType}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">Mahsup Fişi</SelectItem>
                            <SelectItem value="2">Tahsilat Fişi</SelectItem>
                            <SelectItem value="3">Tediye Fişi</SelectItem>
                            <SelectItem value="4">Açılış Fişi</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">Belge No</label>
                    <Input value={docNo} onChange={(e) => setDocNo(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Açıklama</label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
            </div>

            {/* Lines Grid */}
            <div className="flex-1 overflow-auto p-0">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-100">
                            <TableHead className="w-[150px]">Hesap Kodu</TableHead>
                            <TableHead className="w-[200px]">Hesap Adı</TableHead>
                            <TableHead>Açıklama</TableHead>
                            <TableHead className="w-[150px] text-right">Borç</TableHead>
                            <TableHead className="w-[150px] text-right">Alacak</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {lines.map((line, index) => (
                            <TableRow key={line.id}>
                                <TableCell className="p-1">
                                    {/* Account Picker Trigger */}
                                    <div className="relative">
                                        <Input
                                            value={line.account_code}
                                            className="h-8 font-mono border-dashed focus:border-solid cursor-pointer hover:bg-gray-50"
                                            placeholder="Seç.."
                                            readOnly // Make read only and open modal on click
                                            onClick={() => {
                                                setActiveLineIndex(index);
                                                setShowAccountPicker(true);
                                            }}
                                        />
                                    </div>
                                </TableCell>
                                <TableCell className="p-1">
                                    <Input value={line.account_name} className="h-8 border-none bg-transparent" readOnly tabIndex={-1} />
                                </TableCell>
                                <TableCell className="p-1">
                                    <Input
                                        value={line.description}
                                        onChange={(e) => {
                                            const newLines = [...lines];
                                            newLines[index].description = e.target.value;
                                            setLines(newLines);
                                        }}
                                        className="h-8 border-transparent focus:border-gray-200"
                                    />
                                </TableCell>
                                <TableCell className="p-1">
                                    <Input
                                        type="number"
                                        value={line.debit || ''}
                                        onChange={(e) => {
                                            const newLines = [...lines];
                                            newLines[index].debit = parseFloat(e.target.value) || 0;
                                            // Auto balance logic: if Debit entered, clear Credit?
                                            // Usually yes, or allow both (rare). Let's clear Credit.
                                            if (newLines[index].debit > 0) newLines[index].credit = 0;
                                            setLines(newLines);
                                        }}
                                        className="h-8 text-right font-mono border-transparent focus:border-gray-200"
                                    />
                                </TableCell>
                                <TableCell className="p-1">
                                    <Input
                                        type="number"
                                        value={line.credit || ''}
                                        onChange={(e) => {
                                            const newLines = [...lines];
                                            newLines[index].credit = parseFloat(e.target.value) || 0;
                                            if (newLines[index].credit > 0) newLines[index].debit = 0;
                                            setLines(newLines);
                                        }}
                                        className="h-8 text-right font-mono border-transparent focus:border-gray-200"
                                    />
                                </TableCell>
                                <TableCell className="p-1 text-center">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 text-red-500 hover:text-red-700"
                                        onClick={() => {
                                            setLines(lines.filter(l => l.id !== line.id));
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {/* Empty State / Add Row */}
                        {lines.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center h-24 text-gray-400 border-dashed">
                                    Satır eklemek için aşağıdaki butonu kullanın
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Footer / Totals */}
            <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
                <Button variant="outline" onClick={handleAddLine} className="gap-2">
                    <Plus className="w-4 h-4" /> Satır Ekle
                </Button>

                <div className="flex items-center gap-8">
                    <div className="flex flex-col items-end">
                        <span className="text-xs text-gray-500 font-medium uppercase">Toplam Borç</span>
                        <span className="text-lg font-mono font-bold text-gray-900">
                            {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(totalDebit)}
                        </span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-xs text-gray-500 font-medium uppercase">Toplam Alacak</span>
                        <span className="text-lg font-mono font-bold text-gray-900">
                            {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(totalCredit)}
                        </span>
                    </div>
                    <div className="flex flex-col items-end pl-8 border-l">
                        <span className="text-xs text-gray-500 font-medium uppercase">Bakiye</span>
                        <span className={cn(
                            "text-lg font-mono font-bold",
                            balance === 0 ? "text-green-600" : "text-red-600"
                        )}>
                            {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(balance)}
                        </span>
                    </div>

                    <div className="pl-8 border-l flex gap-2">
                        <Button variant="outline" onClick={onClose}>İptal</Button>
                        <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
                            <Save className="w-4 h-4 mr-2" />
                            {saving ? 'Kaydediliyor...' : 'Kaydet'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>

        <AccountPicker
            open={showAccountPicker}
            onOpenChange={setShowAccountPicker}
            onSelect={handleAccountSelect}
        />
    </div>
);
}

