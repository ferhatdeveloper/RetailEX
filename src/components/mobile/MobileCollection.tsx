/**
 * Mobile Collection (Sahada Tahsilat)
 * Features: Payment collection, receipt photo, multiple payment methods
 */

import { useState } from 'react';
import { DollarSign, Camera, CreditCard, Banknote, Check } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface Payment {
  method: 'CASH' | 'CREDIT_CARD' | 'CHECK' | 'TRANSFER';
  amount: number;
  reference?: string;
}

export function MobileCollection({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Payment['method']>('CASH');
  const [reference, setReference] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  const submitCollection = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Geçerli tutar girin');
      return;
    }

    const collection = {
      id: `coll-${Date.now()}`,
      customer_id: customerId,
      customer_name: customerName,
      amount: parseFloat(amount),
      method,
      reference,
      photo,
      created_at: new Date().toISOString(),
      synced: false
    };

    const pending = JSON.parse(localStorage.getItem('pending_collections') || '[]');
    pending.push(collection);
    localStorage.setItem('pending_collections', JSON.stringify(pending));

    toast.success(`${parseFloat(amount).toFixed(2)} TL tahsilat kaydedildi`);
    
    // Reset
    setAmount('');
    setReference('');
    setPhoto(null);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center mb-6">
            <DollarSign className="w-16 h-16 mx-auto text-green-600 mb-4" />
            <h1 className="text-xl mb-1">Tahsilat</h1>
            <p className="text-sm text-gray-600">{customerName}</p>
          </div>

          <div className="space-y-4">
            {/* Amount */}
            <div>
              <label className="block text-sm mb-2">Tutar (TL)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-3 border rounded-lg text-2xl text-center"
                placeholder="0.00"
              />
            </div>

            {/* Payment method */}
            <div>
              <label className="block text-sm mb-2">Ödeme Yöntemi</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMethod('CASH')}
                  className={`p-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                    method === 'CASH' ? 'border-green-600 bg-green-50' : 'border-gray-300'
                  }`}
                >
                  <Banknote className="w-6 h-6" />
                  <span className="text-xs">Nakit</span>
                </button>
                <button
                  onClick={() => setMethod('CREDIT_CARD')}
                  className={`p-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                    method === 'CREDIT_CARD' ? 'border-green-600 bg-green-50' : 'border-gray-300'
                  }`}
                >
                  <CreditCard className="w-6 h-6" />
                  <span className="text-xs">Kart</span>
                </button>
                <button
                  onClick={() => setMethod('CHECK')}
                  className={`p-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                    method === 'CHECK' ? 'border-green-600 bg-green-50' : 'border-gray-300'
                  }`}
                >
                  <Check className="w-6 h-6" />
                  <span className="text-xs">Çek</span>
                </button>
                <button
                  onClick={() => setMethod('TRANSFER')}
                  className={`p-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                    method === 'TRANSFER' ? 'border-green-600 bg-green-50' : 'border-gray-300'
                  }`}
                >
                  <DollarSign className="w-6 h-6" />
                  <span className="text-xs">Havale</span>
                </button>
              </div>
            </div>

            {/* Reference */}
            {(method === 'CHECK' || method === 'TRANSFER') && (
              <div>
                <label className="block text-sm mb-2">
                  {method === 'CHECK' ? 'Çek No' : 'Referans No'}
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="Referans numarası"
                />
              </div>
            )}

            {/* Photo */}
            <div>
              <label className="block text-sm mb-2">Dekont/Makbuz Fotoğrafı</label>
              <button className="w-full border-2 border-dashed border-gray-300 rounded-lg py-8 hover:border-green-500 hover:bg-green-50">
                <Camera className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <div className="text-sm text-gray-600">Fotoğraf Çek</div>
              </button>
            </div>

            {/* Submit */}
            <button
              onClick={submitCollection}
              className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 text-lg"
            >
              Tahsilatı Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

