import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { TableRoutingService } from '../../../services/TableRoutingService';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { toast } from 'sonner';
import {
    ChevronRight,
    ChevronDown,
    Plus,
    MoreHorizontal,
    Search,
    Filter,
    Download,
    FolderOpen,
    FileText,
    Edit2,
    Trash2
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../ui/dialog';
import { Label } from '../../ui/label';
import { ScrollArea } from '../../ui/scroll-area';

// Types for Chart of Accounts
export interface Account {
    logicalref: number;
    code: string;
    name: string;
    parent_code?: string;
    account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
    level: number; // 0, 1, 2...
    balance_type: 0 | 1; // 0: Debit, 1: Credit
    balance?: number; // Calculated or fetched
    children?: Account[];
    is_group?: boolean; // UI helper
}

// Recursive Account Item Component
const AccountItem = ({
    account,
    level = 0,
    onToggle,
    expanded,
    onAddSubAccount,
    onEditAccount,
    darkMode
}: {
    account: Account,
    level?: number,
    onToggle: (code: string) => void,
    expanded: Set<string>,
    onAddSubAccount: (account: Account) => void,
    onEditAccount: (account: Account) => void,
    darkMode: boolean
}) => {
    const isExpanded = expanded.has(account.code);
    const hasChildren = account.children && account.children.length > 0;

    // Padding based on tree level
    const paddingLeft = `${level * 24 + 12}px`;

    return (
        <div className="select-none">
            <div
                className={`flex items-center py-2 pr-4 hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 transition-colors group
          ${account.level === 0 ? 'bg-gray-50/50 dark:bg-gray-800/30 font-semibold' : ''}
        `}
                style={{ paddingLeft }}
            >
                {/* Toggle Button / Icon */}
                <div
                    className="mr-2 cursor-pointer w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                    onClick={(e) => {
                        e.stopPropagation();
                        // Always allow toggle if it might have children (could be lazy loaded in future)
                        onToggle(account.code);
                    }}
                >
                    {hasChildren ? (
                        isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />
                    ) : (
                        <div className="w-4 h-4" />
                    )}
                </div>

                {/* Icon based on group/detail - simple heuristic: if level < 2 assume group or has children */}
                <div className="mr-3 text-blue-600 dark:text-blue-400">
                    {hasChildren || account.level < 2 ? <FolderOpen className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </div>

                {/* Code & Name */}
                <div className="flex-1 flex items-center gap-3">
                    <span className={`font-mono text-sm ${account.level < 1 ? 'font-bold' : ''} text-gray-600 dark:text-gray-400`}>
                        {account.code}
                    </span>
                    <span className={`text-sm ${account.level < 1 ? 'font-bold' : 'font-medium'} ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                        {account.name}
                    </span>
                </div>

                {/* Balance (Mock for now or 0) */}
                <div className="text-right w-32 font-mono text-sm mr-6">
                    <span className={'text-gray-400'}>
                        0.00
                    </span>
                </div>

                {/* Actions Menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onAddSubAccount(account)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Alt Hesap Ekle
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditAccount(account)}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Düzenle
                        </DropdownMenuItem>
                        {!hasChildren && (
                            <DropdownMenuItem className="text-red-600">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Sil
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Children */}
            {isExpanded && hasChildren && (
                <div>
                    {account.children!.map(child => (
                        <AccountItem
                            key={child.code}
                            account={child}
                            level={level + 1}
                            onToggle={onToggle}
                            expanded={expanded}
                            onAddSubAccount={onAddSubAccount}
                            onEditAccount={onEditAccount}
                            darkMode={darkMode}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export function ChartOfAccounts() {
    const { t } = useLanguage();
    const { darkMode } = useTheme();

    // Enterprise Context
    const { selectedFirm, selectedPeriod } = useFirmaDonem();

    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set(['100', '102', '120', '320', '600'])); // Default expanded
    const [searchQuery, setSearchQuery] = useState('');

    // Modal states
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedParent, setSelectedParent] = useState<Account | null>(null);

    // Form States
    const [newAccountCode, setNewAccountCode] = useState('');
    const [newAccountName, setNewAccountName] = useState('');

    useEffect(() => {
        if (selectedFirm && selectedPeriod) {
            loadAccounts();
        } else {
            setAccounts([]);
        }
    }, [selectedFirm, selectedPeriod]);

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

            if (!res.ok) {
                if (res.status === 404) {
                    toast.error('Bu dönem için hesap planı tablosu bulunamadı.');
                } else {
                    throw new Error('Hesap planı yüklenemedi');
                }
                setAccounts([]);
                return;
            }

            const data: Account[] = await res.json();

            // Transform flat list to tree
            const tree = buildAccountTree(data);
            setAccounts(tree);

        } catch (error: any) {
            console.error('Error loading accounts:', error);
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const buildAccountTree = (flatAccounts: Account[]): Account[] => {
        const accountMap = new Map<string, Account>();
        const rootAccounts: Account[] = [];

        // 1. Map all accounts
        flatAccounts.forEach(acc => {
            accountMap.set(acc.code, { ...acc, children: [] });
        });

        // 2. Build Hierarchy
        flatAccounts.forEach(acc => {
            const current = accountMap.get(acc.code)!;
            // Determine parent code logic (e.g. 100.01 -> parent 100)
            // But if specific parent_code field exists, use it. Code based logic is fallback.

            let parentCode = acc.parent_code;

            // Fallback logic if parent_code is null but structure implies parent
            if (!parentCode && acc.code.includes('.')) {
                parentCode = acc.code.substring(0, acc.code.lastIndexOf('.'));
            } else if (!parentCode && acc.code.length > 1 && !acc.code.includes('.')) {
                // E.g. 10 -> 1
                // Tek Düzen logic: 1 -> 10 -> 100
                // This is tricky without strict rules, relying on database `parent_code` is safer
            }

            if (parentCode && accountMap.has(parentCode)) {
                accountMap.get(parentCode)!.children!.push(current);
            } else {
                rootAccounts.push(current);
            }
        });

        return rootAccounts;
    };

    const toggleNode = (code: string) => {
        const newExpanded = new Set(expanded);
        if (newExpanded.has(code)) {
            newExpanded.delete(code);
        } else {
            newExpanded.add(code);
        }
        setExpanded(newExpanded);
    };

    const handleAddSubAccount = (parent: Account) => {
        setSelectedParent(parent);
        setNewAccountCode(`${parent.code}.`);
        setNewAccountName('');
        setShowAddModal(true);
    };

    const createAccount = async () => {
        if (!selectedFirm || !selectedPeriod || !newAccountCode || !newAccountName) return;

        try {
            const tableName = TableRoutingService.getTableName({
                firmNr: selectedFirm.nr,
                periodNr: selectedPeriod.nr
            }, TableRoutingService.Tables.ACCOUNT_PLAN);

            const newAccount = {
                code: newAccountCode,
                name: newAccountName,
                parent_code: selectedParent?.code,
                level: (selectedParent?.level || 0) + 1,
                account_type: selectedParent?.account_type || 'asset', // Inherit or select
                balance_type: selectedParent?.balance_type || 0 // Inherit
            };

            const res = await fetch(`https://${projectId}.supabase.co/rest/v1/${tableName}`, {
                method: 'POST',
                headers: {
                    'apikey': publicAnonKey,
                    'Authorization': `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(newAccount)
            });

            if (!res.ok) throw new Error('Hesap oluşturulamadı');

            toast.success('Hesap oluşturuldu');
            setShowAddModal(false);
            loadAccounts(); // Refresh tree

        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleEditAccount = (account: Account) => {
        // Implement edit logic
        toast.info(`${account.name} düzenlenecek`);
    };

    return (
        <div className="h-full flex flex-col">
            {/* Toolbar */}
            <div className={`p-4 border-b flex items-center justify-between gap-4 ${darkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center gap-2 flex-1 max-w-md">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder={(t as any).searchAccount || "Hesap kodu veya adı ara..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Button variant="outline" size="icon">
                        <Filter className="w-4 h-4 text-gray-500" />
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2">
                        <Download className="w-4 h-4" />
                        {(t as any).exportExcel || "Excel"}
                    </Button>
                    <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
                        <Plus className="w-4 h-4" />
                        {(t as any).newAccount || "Yeni Ana Hesap"}
                    </Button>
                </div>
            </div>

            {/* Tree Content */}
            <ScrollArea className="flex-1">
                <div className="min-w-[800px]">
                    {/* Header */}
                    <div className={`flex items-center px-4 py-2 text-xs font-semibold uppercase tracking-wider ${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                        <div className="w-8"></div> {/* Spacer for toggle/icon */}
                        <div className="w-8"></div> {/* Spacer for folder icon */}
                        <div className="flex-1">Hesap Kodu / Adı</div>
                        <div className="w-32 text-right mr-12">Bakiye</div>
                    </div>

                    {/* List */}
                    <div className="pb-4">
                        {loading ? (
                            <div className="p-8 text-center text-gray-500">Hesap planı yükleniyor...</div>
                        ) : accounts.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                {selectedFirm ? 'Hesap bulunamadı veya henüz oluşturulmadı.' : 'Lütfen Firma ve Dönem seçiniz.'}
                            </div>
                        ) : (
                            accounts.map(account => (
                                <AccountItem
                                    key={account.code}
                                    account={account}
                                    onToggle={toggleNode}
                                    expanded={expanded}
                                    onAddSubAccount={handleAddSubAccount}
                                    onEditAccount={handleEditAccount}
                                    darkMode={darkMode}
                                />
                            ))
                        )}
                    </div>
                </div>
            </ScrollArea>

            {/* Add Account Modal */}
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Yeni Alt Hesap Ekle</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Üst Hesap</Label>
                            <div className={`p-2 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200'}`}>
                                <span className="font-mono font-bold mr-2">{selectedParent?.code}</span>
                                <span>{selectedParent?.name}</span>
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label>Hesap Kodu</Label>
                            <Input
                                value={newAccountCode}
                                onChange={(e) => setNewAccountCode(e.target.value)}
                                placeholder={`${selectedParent?.code}.XX`}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Hesap Adı</Label>
                            <Input
                                value={newAccountName}
                                onChange={(e) => setNewAccountName(e.target.value)}
                                placeholder="Örn: AKBANK hesabı"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)}>İptal</Button>
                        <Button onClick={createAccount}>Kaydet</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

