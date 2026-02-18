import React from 'react';
import { Calendar, Tag } from 'lucide-react';

interface ExpiryAndBatchInputProps {
    batchNo: string;
    onChangeBatch: (val: string) => void;
    expiryDate: string; // YYYY-MM-DD
    onChangeExpiry: (val: string) => void;
    className?: string;
    required?: boolean;
}

export const ExpiryAndBatchInput: React.FC<ExpiryAndBatchInputProps> = ({
    batchNo,
    onChangeBatch,
    expiryDate,
    onChangeExpiry,
    className,
    required = true
}) => {
    return (
        <div className={`flex flex-col sm:flex-row gap-4 ${className}`}>
            {/* Batch Number Input */}
            <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Parti / Lot No {required && <span className="text-red-500">*</span>}
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Tag className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        value={batchNo}
                        onChange={(e) => onChangeBatch(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 
                       focus:ring-blue-500 focus:border-blue-500 sm:text-sm placeholder-gray-400"
                        placeholder="Örn: LT-2024-001"
                        required={required}
                    />
                </div>
            </div>

            {/* Expiry Date Input */}
            <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Son Kullanma Tarihi (SKT) {required && <span className="text-red-500">*</span>}
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Calendar className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => onChangeExpiry(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 
                       focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        required={required}
                    />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                    Otomatik FEFO (First Expired First Out) yönetimi için kritiktir.
                </p>
            </div>
        </div>
    );
};

