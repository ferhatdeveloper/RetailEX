import React, { useState, useEffect } from 'react';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { TableRoutingService } from '../../../services/TableRoutingService';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Account } from './ChartOfAccounts'; // Re-using type

// Re-using the Account type for consistency
interface AccountPickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (account: Account) => void;
}

export function AccountPicker({ open, onOpenChange, onSelect }: AccountPickerProps) {
    const { selectedFirm, selectedPeriod } = useFirmaDonem();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [filteredAccounts, setFilteredAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (open && selectedFirm && selectedPeriod) {
            loadAccounts();
        }
    }, [open, selectedFirm, selectedPeriod]);

    useEffect(() => {
        if (!searchQuery) {
            setFilteredAccounts(accounts);
        } else {
            const lowerQuery = searchQuery.toLowerCase();
            setFilteredAccounts(accounts.filter(acc =>
                acc.code.toLowerCase().includes(lowerQuery) ||
                acc.name.toLowerCase().includes(lowerQuery)
            ));
        }
    }, [searchQuery, accounts]);

    const loadAccounts = async () => {
        if (!selectedFirm || !selectedPeriod) return;

        setLoading(true);
        try {
            const tableName = TableRoutingService.getTableName({
                firmNr: selectedFirm.nr,
                periodNr: selectedPeriod.nr
            }, TableRoutingService.Tables.ACCOUNT_PLAN);

            const res = await fetch(`https://${projectId}.supabase.co/rest/v1/${tableName}?select=*&order=code`, {
                headers: {
                    'apikey': publicAnonKey,
                    'Authorization': `Bearer ${publicAnonKey}`
                }
            });

            if (!res.ok) throw new Error('Hesap planı yüklenemedi');

            const data: Account[] = await res.json();
            // We usually only want to select lowest level accounts (no children/not group)
            // But checking children requires tree building or a 'is_group' flag.
            // For now, let's allow selecting any account, but UI acts better if we filter only 'child' accounts?
            // Let's load all, user decides.
            setAccounts(data);
            setFilteredAccounts(data);

        } catch (error: any) {
            console.error('Error loading accounts:', error);
            toast.error('Hesaplar yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 pb-2">
                    <DialogTitle>Hesap Seçin</DialogTitle>
                    <div className="relative mt-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Hesap Kodu veya Adı ile arayın..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                            autoFocus
                        />
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-auto p-2">
                    {loading ? (
                        <div className="p-4 text-center text-gray-500">Yükleniyor...</div>
                    ) : filteredAccounts.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">Hesap bulunamadı.</div>
                    ) : (
                        <div className="grid gap-1">
                            {filteredAccounts.map((account) => (
                                <div
                                    key={account.logicalref}
                                    className="flex items-center p-2 rounded hover:bg-gray-100 cursor-pointer transition-colors group"
                                    onClick={() => {
                                        onSelect(account);
                                        onOpenChange(false);
                                    }}
                                >
                                    <span className="font-mono font-bold text-gray-700 w-32">{account.code}</span>
                                    <span className="flex-1 text-gray-900 group-hover:text-blue-700">{account.name}</span>
                                    {/* Indication of type/level could go here */}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

