```javascript
import React, { useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Button } from '../../ui/button';
import { Plus } from 'lucide-react';

import { ChartOfAccounts } from './ChartOfAccounts';
import { JournalEntryList } from './JournalEntryList';
import { JournalEntryForm } from './JournalEntryForm';
import { GeneralLedgerView } from './GeneralLedgerView';
import { TrialBalanceReport } from './TrialBalanceReport';

export function StatutoryAccountingModule() {
  const { t } = useLanguage();
  const { darkMode } = useTheme();
  
  const [activeTab, setActiveTab] = useState('chart');
  const [showNewFicheModal, setShowNewFicheModal] = useState(false);

  return (
    <div className={`h - full flex flex - col ${ darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900' } `}>
        {/* Header Section */}
        <div className={`px - 6 py - 4 flex items - center justify - between border - b ${ darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white' } `}>
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Resmi Muhasebe</h1>
                <p className={`text - sm mt - 1 ${ darkMode ? 'text-gray-400' : 'text-gray-500' } `}>
                    Tek Düzen Hesap Planı ve Yevmiye Fişleri
                </p>
            </div>
            <div className="flex items-center gap-2">
                {activeTab === 'fiches' && (
                    <Button onClick={() => setShowNewFicheModal(true)} className="bg-blue-600 hover:bg-blue-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Yeni Fiş
                    </Button>
                )}
            </div>
        </div>

        {/* Content Section */}
        <div className="flex-1 overflow-hidden p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                <TabsList className={`w - full justify - start border - b rounded - none p - 0 h - auto bg - transparent ${ darkMode ? 'border-gray-800' : 'border-gray-200' } `}>
                    <TabsTrigger 
                        value="chart"
                        className={`rounded - t - lg border - b - 2 border - transparent px - 4 py - 2 font - medium data - [state = active]: border - blue - 600 data - [state = active]: text - blue - 600 ${ darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900' } `}
                    >
                        Hesap Planı
                    </TabsTrigger>
                    <TabsTrigger 
                        value="fiches"
                        className={`rounded - t - lg border - b - 2 border - transparent px - 4 py - 2 font - medium data - [state = active]: border - blue - 600 data - [state = active]: text - blue - 600 ${ darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900' } `}
                    >
                        Fiş İşlemleri
                    </TabsTrigger>
                    <TabsTrigger 
                        value="ledger"
                        className={`rounded - t - lg border - b - 2 border - transparent px - 4 py - 2 font - medium data - [state = active]: border - blue - 600 data - [state = active]: text - blue - 600 ${ darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900' } `}
                    >
                        Muavin Defter
                    </TabsTrigger>
                    <TabsTrigger 
                        value="trial_balance"
                        className={`rounded - t - lg border - b - 2 border - transparent px - 4 py - 2 font - medium data - [state = active]: border - blue - 600 data - [state = active]: text - blue - 600 ${ darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900' } `}
                    >
                        Mizan
                    </TabsTrigger>
                    <TabsTrigger 
                        value="declarations"
                        className={`rounded - t - lg border - b - 2 border - transparent px - 4 py - 2 font - medium data - [state = active]: border - blue - 600 data - [state = active]: text - blue - 600 ${ darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900' } `}
                    >
                        Beyannameler
                    </TabsTrigger>
                </TabsList>

                <div className="flex-1 mt-4 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm overflow-hidden">
                    <TabsContent value="chart" className="h-full m-0 p-0">
                        <ChartOfAccounts />
                    </TabsContent>
                    <TabsContent value="fiches" className="h-full m-0 p-0">
                        <JournalEntryList />
                    </TabsContent>
                    <TabsContent value="ledger" className="h-full m-0 p-0">
                        <GeneralLedgerView />
                    </TabsContent>
                    <TabsContent value="trial_balance" className="h-full m-0 p-0">
                        <TrialBalanceReport />
                    </TabsContent>
                    <TabsContent value="declarations" className="h-full m-0 p-0">
                        <div className="p-8 text-center text-gray-500">Beyannameler modülü hazırlanıyor...</div>
                    </TabsContent>
                </div>
            </Tabs>
        </div>

        {/* Modals */}
        {showNewFicheModal && (
            <JournalEntryForm 
                onClose={() => setShowNewFicheModal(false)} 
                onSaveSuccess={() => {
                    // Refresh list logic would go here if JournalEntryList had a refresh trigger prop
                    // Ideally pass a refresh key or signal
                }} 
            />
        )}
    </div>
  );
}
```

