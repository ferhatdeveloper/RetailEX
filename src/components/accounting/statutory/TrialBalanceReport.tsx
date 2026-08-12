import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Button } from '../../ui/button';
import { Download, RefreshCw, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { cn } from '../../../lib/utils';

interface TrialBalanceItem {
    account_ref: number;
    account_code: string;
    account_name: string;
    total_debit: number;
    total_credit: number;
    balance_debit: number;
    balance_credit: number;
}

export function TrialBalanceReport() {
    const { t } = useLanguage();
    const { darkMode } = useTheme();
    const { selectedFirm, selectedPeriod } = useFirmaDonem();

    const [data, setData] = useState<TrialBalanceItem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (selectedFirm && selectedPeriod) {
            loadData();
        }
    }, [selectedFirm, selectedPeriod]);

    const loadData = async () => {
        if (!selectedFirm || !selectedPeriod) return;

        setLoading(true);
        try {
            // Call the RPC function
            const { data: result, error } = await fetch(`https://${projectId}.supabase.co/rest/v1/rpc/get_trial_balance`, {
                method: 'POST',
                headers: {
                    'apikey': publicAnonKey,
                    'Authorization': `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    firm_nr: selectedFirm.nr,
                    period_nr: selectedPeriod.nr
                })
            }).then(res => res.json().then(d => ({ data: res.ok ? d : null, error: res.ok ? null : d })));

            if (error) throw error;

            setData(result || []);

        } catch (error: any) {
            console.error('Mizan yüklenirken hata:', error);
            toast.error('Mizan raporu alınamadı: ' + (error.message || 'Bilinmeyen hata'));
        } finally {
            setLoading(false);
        }
    };

    // Calculate Grand Totals
    const totals = data.reduce((acc, item) => ({
        debit: acc.debit + item.total_debit,
        credit: acc.credit + item.total_credit,
        balDebit: acc.balDebit + item.balance_debit,
        balCredit: acc.balCredit + item.balance_credit
    }), { debit: 0, credit: 0, balDebit: 0, balCredit: 0 });

    const formatMoney = (amount: number) => {
        return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    };

    return (
        <div className="h-full flex flex-col p-4 gap-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Mizan Raporu</h2>
                    <p className="text-sm text-gray-500">
                        {selectedFirm?.name} - {selectedPeriod?.name} Dönemi Genel Mizanı
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                        <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                        Yenile
                    </Button>
                    <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Excel
                    </Button>
                </div>
            </div>

            <Card className="flex-1 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                            <TableRow>
                                <TableHead className="w-[150px]">Hesap Kodu</TableHead>
                                <TableHead>Hesap Adı</TableHead>
                                <TableHead className="text-right bg-blue-50/50">Toplam Borç</TableHead>
                                <TableHead className="text-right bg-blue-50/50">Toplam Alacak</TableHead>
                                <TableHead className="text-right bg-green-50/50">Borç Bakiye</TableHead>
                                <TableHead className="text-right bg-green-50/50">Alacak Bakiye</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8">Yükleniyor...</TableCell>
                                </TableRow>
                            ) : data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">Kayıt bulunamadı.</TableCell>
                                </TableRow>
                            ) : (
                                data.map((item) => (
                                    <TableRow key={item.account_ref} className="hover:bg-gray-50">
                                        <TableCell className="font-mono font-medium">{item.account_code}</TableCell>
                                        <TableCell>{item.account_name}</TableCell>
                                        <TableCell className="text-right font-mono text-gray-600">{formatMoney(item.total_debit)}</TableCell>
                                        <TableCell className="text-right font-mono text-gray-600">{formatMoney(item.total_credit)}</TableCell>
                                        <TableCell className={cn("text-right font-mono font-bold", item.balance_debit > 0 ? "text-blue-600" : "text-gray-300")}>
                                            {formatMoney(item.balance_debit)}
                                        </TableCell>
                                        <TableCell className={cn("text-right font-mono font-bold", item.balance_credit > 0 ? "text-red-600" : "text-gray-300")}>
                                            {formatMoney(item.balance_credit)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Footer Totals */}
                <div className="bg-gray-100 border-t p-2">
                    <Table>
                        <TableBody>
                            <TableRow className="hover:bg-transparent">
                                <TableCell className="font-bold w-[300px]">GENEL TOPLAM</TableCell>
                                <TableCell className="text-right font-bold w-[150px]">{formatMoney(totals.debit)}</TableCell>
                                <TableCell className="text-right font-bold w-[150px]">{formatMoney(totals.credit)}</TableCell>
                                <TableCell className="text-right font-bold w-[150px] text-blue-700">{formatMoney(totals.balDebit)}</TableCell>
                                <TableCell className="text-right font-bold w-[150px] text-red-700">{formatMoney(totals.balCredit)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
}

