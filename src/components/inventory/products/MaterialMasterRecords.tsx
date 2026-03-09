import React, { useState } from 'react';
import { Settings, Tag, Layers, FileText, Component, Hash, Boxes, AlertCircle, ShoppingBag } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { GenericDefinitionModule } from '../../modules/GenericDefinitionModule';

export type MasterRecordType =
    | 'suppliers_def'
    | 'barcode'
    | 'seriallot'
    | 'scale'
    | 'warehousetransfer_def'
    | 'material-classes'
    | 'unit-sets'
    | 'variants'
    | 'special-codes'
    | 'brand-definitions'
    | 'group-codes'
    | 'product-categories';

interface MaterialMasterRecordsProps {
    viewType: MasterRecordType;
}

import UnitSetsPage from './UnitSetsPage';

export function MaterialMasterRecords({ viewType }: MaterialMasterRecordsProps) {
    const { t, tm } = useLanguage();

    if (viewType === 'unit-sets') {
        return <UnitSetsPage />;
    }

    const getDefinitionConfig = (type: MasterRecordType) => {
        const commonColumns = [
            { key: 'code', header: tm('definitionCode') },
            { key: 'name', header: tm('definitionName') },
            { key: 'description', header: tm('definitionDescription') }
        ];

        switch (type) {
            case 'brand-definitions':
                return {
                    title: tm('brandDefinitions'),
                    description: tm('brandDefDesc'),
                    tableName: 'brands',
                    columns: commonColumns,
                    icon: Tag
                };
            case 'group-codes':
                return {
                    title: tm('groupCodes'),
                    description: tm('groupCodeDesc'),
                    tableName: 'product_groups',
                    columns: commonColumns,
                    icon: Layers
                };
            case 'unit-sets':
                return null; // Handled separately above
            case 'product-categories':
                return {
                    title: tm('productCategories'),
                    description: tm('productCatDesc'),
                    tableName: 'categories',
                    columns: [
                        ...commonColumns,
                        { key: 'is_restaurant', header: 'REST. KATEGORİ', type: 'boolean' },
                        { key: 'icon', header: 'İKON', type: 'icon' }
                    ],
                    icon: FileText
                };
            case 'material-classes':
                return {
                    title: tm('materialClasses'),
                    description: tm('materialClassDesc'),
                    tableName: 'categories', // Using categories for now as per schema
                    columns: commonColumns,
                    icon: Layers
                };
            case 'warehousetransfer_def':
                return {
                    title: tm('warehouseDefinitions'),
                    description: tm('warehouseDefDesc'),
                    tableName: 'stores', // Mapping warehouses to stores table
                    columns: commonColumns,
                    icon: Tag
                };
            case 'variants':
                return {
                    title: tm('variantDefinitions'),
                    description: tm('variantDefDesc'),
                    tableName: 'variants',
                    columns: commonColumns,
                    icon: Boxes
                };
            case 'special-codes':
                return {
                    title: tm('specialCodes'),
                    description: tm('specialCodeDesc'),
                    tableName: 'special_codes',
                    columns: commonColumns,
                    icon: Hash
                };
            // For items without a dedicated DB table yet, we can keep placeholders or map to generic tables
            case 'suppliers_def':
                return null; // Will be handled by SupplierModule normally, but if routed here?
            default:
                return null;
        }
    };

    const config = getDefinitionConfig(viewType);

    if (config) {
        return <GenericDefinitionModule {...config} />;
    }

    // Fallback for non-generic pages or placeholders
    const getViewInfo = (type: MasterRecordType) => {
        switch (type) {
            case 'suppliers_def':
                return { title: tm('supplierDefinitions'), icon: Layers, desc: tm('supplierDefDesc') };
            case 'barcode':
                return { title: tm('barcodeDefinitions'), icon: Component, desc: tm('barcodeDefDesc') };
            case 'seriallot':
                return { title: tm('serialLotDefinitions'), icon: Boxes, desc: tm('serialLotDefDesc') };
            case 'scale':
                return { title: tm('scaleDefinitions'), icon: Hash, desc: tm('scaleDefDesc') };
            default:
                return { title: tm('developmentInProgress'), icon: Settings, desc: tm('moduleComingSoon') };
        }
    };

    const info = getViewInfo(viewType);
    const Icon = info.icon;

    return (
        <div className="h-full flex flex-col bg-background">
            <div className="bg-[var(--surface-card)] border-b border-[var(--border-subtle)] px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                        <Icon className="w-6 h-6 text-orange-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{info.title}</h1>
                        <p className="text-sm text-[var(--text-muted)]">{info.desc}</p>
                    </div>
                </div>
            </div>
            <div className="flex-1 p-6 flex items-center justify-center">
                <div className="text-center max-w-md">
                    <div className="w-20 h-20 bg-[var(--surface-input)] rounded-full flex items-center justify-center mx-auto mb-6">
                        <Settings className="w-10 h-10 text-[var(--text-muted)]" />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground mb-2">{tm('developmentInProgress')}</h2>
                    <p className="text-[var(--text-muted)]">
                        <strong className="text-foreground">{info.title}</strong> {tm('moduleDevDesc')}
                    </p>
                </div>
            </div>
        </div>
    );
}



