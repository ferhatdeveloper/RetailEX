/**
 * ProductionModule — sadece Kasap Üretim + Eski Karkas Parçalama sekmeleri.
 *
 * Not: Genel üretim reçetesi (BOM) ve üretim emirleri ekranı bu modülden
 * ayrıştırıldı. Artık `ProductionRecipeModule` (screen: "production-recipe")
 * bağımsız menü öğesi olarak duruyor. Kasap / karkas parçalama işlemleri
 * burada kendi içlerinde çalışmaya devam eder.
 */

import React, { useState } from 'react';
import { Beef, Briefcase } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CarcassDisassemblyPanel } from './CarcassDisassemblyPanel';
import { ButcherProductionModule } from './butcher/ButcherProductionModule';

export function ProductionModule() {
  const [activeTab, setActiveTab] = useState('butcher');

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500 rounded-lg">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Üretim Yönetimi</h2>
            <p className="text-xs text-slate-400">
              Kasap üretim, karkas parçalama ve fire maliyeti dağıtımı
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="h-full flex flex-col gap-6"
        >
          <TabsList className="bg-white border border-slate-200 p-1 self-start shadow-sm">
            <TabsTrigger
              value="butcher"
              className="data-[state=active]:bg-amber-50 data-[state=active]:text-amber-800"
            >
              <Beef className="w-4 h-4 mr-2" /> Kasap Üretim
            </TabsTrigger>
            <TabsTrigger
              value="disassembly"
              className="data-[state=active]:bg-amber-50 data-[state=active]:text-amber-800"
            >
              <Beef className="w-4 h-4 mr-2" /> Eski Parçalama
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="butcher"
            className="flex-1 overflow-auto m-0 mt-0 bg-transparent border-0 shadow-none"
          >
            <ButcherProductionModule embedded />
          </TabsContent>

          <TabsContent
            value="disassembly"
            className="flex-1 overflow-auto m-0 mt-0 bg-transparent border-0 shadow-none"
          >
            <CarcassDisassemblyPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}