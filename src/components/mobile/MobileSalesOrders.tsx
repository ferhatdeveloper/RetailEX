import React, { useState, useRef } from 'react';
import { ArrowLeft, Plus, Search, Scan, Package, Trash2, Check, ChevronDown } from 'lucide-react';

interface SalesInvoiceItem {
  id: string;
  productId: number;
  barcode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface SalesInvoice {
  id: string;
  invoiceNo: string;
  customer: string;
  date: string;
  items: SalesInvoiceItem[];
  totalAmount: number;
  status: 'draft' | 'completed';
}

interface MobileSalesOrdersProps {
  onBack?: () => void;
}

// Mock products database
const mockProducts = [
  { id: 1, barcode: '8690000000001', name: 'Samsung Galaxy S24', price: 14000000 },
  { id: 2, barcode: '8690000000002', name: 'iPhone 15 Pro', price: 17000000 },
  { id: 3, barcode: '8690000000003', name: 'Samsung TV 55"', price: 9500000 },
  { id: 4, barcode: '8690000000004', name: 'Sony Headphones', price: 550000 },
  { id: 5, barcode: '8690000000005', name: 'Dell Laptop', price: 11000000 },
];

// Mock customers - Iraqi names
const mockCustomers = [
  'Ahmed Al-Maliki',
  'Mohammed Hassan',
  'Ali Al-Sadr',
  'Omar Abdullah',
  'Hussein Al-Faisal',
  'Khalid Ibrahim',
  'Mustafa Al-Hakim',
  'Tariq Al-Najjar'
];

export function MobileSalesOrders({ onBack }: MobileSalesOrdersProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentView, setCurrentView] = useState<'list' | 'detail'>('list');
  const [invoices, setInvoices] = useState<SalesInvoice[]>([
    {
      id: '1',
      invoiceNo: 'SI-2024-001',
      customer: 'Ahmed Al-Maliki',
      date: '15.12.2024',
      items: [
        {
          id: '1',
          productId: 1,
          barcode: '8690000000001',
          productName: 'Samsung Galaxy S24',
          quantity: 1,
          unitPrice: 14000000,
          total: 14000000
        }
      ],
      totalAmount: 14000000,
      status: 'completed'
    },
    {
      id: '2',
      invoiceNo: 'SI-2024-002',
      customer: 'Mohammed Hassan',
      date: '16.12.2024',
      items: [
        {
          id: '2',
          productId: 2,
          barcode: '8690000000002',
          productName: 'iPhone 15 Pro',
          quantity: 2,
          unitPrice: 17000000,
          total: 34000000
        }
      ],
      totalAmount: 34000000,
      status: 'completed'
    }
  ]);
  
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [showCustomerSelect, setShowCustomerSelect] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Filter invoices by search
  const filteredInvoices = invoices.filter(invoice =>
    invoice.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    invoice.customer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate status counts
  const draftCount = invoices.filter(i => i.status === 'draft').length;
  const completedCount = invoices.filter(i => i.status === 'completed').length;
  const totalRevenue = invoices
    .filter(i => i.status === 'completed')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);

  // Create new invoice
  const handleCreateInvoice = () => {
    const newInvoice: SalesInvoice = {
      id: String(Date.now()),
      invoiceNo: `SI-2024-${String(invoices.length + 1).padStart(3, '0')}`,
      customer: '',
      date: new Date().toLocaleDateString('tr-TR'),
      items: [],
      totalAmount: 0,
      status: 'draft'
    };
    
    setInvoices([newInvoice, ...invoices]);
    setSelectedInvoice(newInvoice);
    setCurrentView('detail');
    
    // Focus barcode input
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  // Open invoice detail
  const handleOpenInvoice = (invoice: SalesInvoice) => {
    setSelectedInvoice(invoice);
    setCurrentView('detail');
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  // Add product by barcode
  const handleBarcodeSubmit = () => {
    if (!barcodeInput.trim() || !selectedInvoice) return;

    const product = mockProducts.find(p => p.barcode === barcodeInput.trim());
    
    if (!product) {
      alert('Ürün bulunamadı!');
      setBarcodeInput('');
      return;
    }

    // Check if product already exists in invoice
    const existingItem = selectedInvoice.items.find(item => item.barcode === barcodeInput.trim());
    
    let updatedItems: SalesInvoiceItem[];
    
    if (existingItem) {
      // Increase quantity
      updatedItems = selectedInvoice.items.map(item =>
        item.barcode === barcodeInput.trim()
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice }
          : item
      );
    } else {
      // Add new item
      const newItem: SalesInvoiceItem = {
        id: String(Date.now()),
        productId: product.id,
        barcode: product.barcode,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
        total: product.price
      };
      updatedItems = [...selectedInvoice.items, newItem];
    }

    const totalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);

    const updatedInvoice = {
      ...selectedInvoice,
      items: updatedItems,
      totalAmount
    };

    setSelectedInvoice(updatedInvoice);
    setInvoices(invoices.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv));
    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  // Remove item
  const handleRemoveItem = (itemId: string) => {
    if (!selectedInvoice) return;

    const updatedItems = selectedInvoice.items.filter(item => item.id !== itemId);
    const totalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);

    const updatedInvoice = {
      ...selectedInvoice,
      items: updatedItems,
      totalAmount
    };

    setSelectedInvoice(updatedInvoice);
    setInvoices(invoices.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv));
  };

  // Update quantity
  const handleUpdateQuantity = (itemId: string, newQuantity: number) => {
    if (!selectedInvoice || newQuantity < 1) return;

    const updatedItems = selectedInvoice.items.map(item =>
      item.id === itemId
        ? { ...item, quantity: newQuantity, total: newQuantity * item.unitPrice }
        : item
    );

    const totalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);

    const updatedInvoice = {
      ...selectedInvoice,
      items: updatedItems,
      totalAmount
    };

    setSelectedInvoice(updatedInvoice);
    setInvoices(invoices.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv));
  };

  // Select customer
  const handleSelectCustomer = (customer: string) => {
    if (!selectedInvoice) return;

    const updatedInvoice = {
      ...selectedInvoice,
      customer
    };

    setSelectedInvoice(updatedInvoice);
    setInvoices(invoices.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv));
    setShowCustomerSelect(false);
  };

  // Complete invoice
  const handleCompleteInvoice = () => {
    if (!selectedInvoice) return;

    if (!selectedInvoice.customer) {
      alert('Lütfen müşteri seçin!');
      return;
    }

    if (selectedInvoice.items.length === 0) {
      alert('Lütfen en az bir ürün ekleyin!');
      return;
    }

    const updatedInvoice = {
      ...selectedInvoice,
      status: 'completed' as const
    };

    setInvoices(invoices.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv));
    setCurrentView('list');
    setSelectedInvoice(null);
  };

  // Invoice List View
  if (currentView === 'list') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {onBack && (
                <button 
                  onClick={onBack}
                  className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div>
                <h1 className="text-2xl font-bold">Sales Invoices</h1>
                <p className="text-sm text-blue-100">{invoices.length} total invoices</p>
              </div>
            </div>
            
            <button 
              onClick={handleCreateInvoice}
              className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>

          {/* Search */}
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 flex items-center gap-2">
            <Search className="w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoices..."
              className="flex-1 bg-transparent text-white placeholder:text-white/70 outline-none"
            />
          </div>
        </div>

        {/* Status Cards */}
        <div className="p-4 grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Draft</div>
            <div className="text-3xl font-bold text-yellow-600">{draftCount}</div>
          </div>
          
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Completed</div>
            <div className="text-3xl font-bold text-green-600">{completedCount}</div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Revenue</div>
            <div className="text-xl font-bold text-blue-600">
              {(totalRevenue / 1000000).toFixed(1)}M
            </div>
          </div>
        </div>

        {/* Invoices List */}
        <div className="flex-1 overflow-auto px-4 pb-4">
          <div className="space-y-3">
            {filteredInvoices.map((invoice) => (
              <button
                key={invoice.id}
                onClick={() => handleOpenInvoice(invoice)}
                className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-200 text-left hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-gray-900 mb-1">{invoice.invoiceNo}</h3>
                    <p className="text-sm text-gray-600">{invoice.customer || 'No customer'}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                    invoice.status === 'draft' 
                      ? 'bg-yellow-100 text-yellow-700' 
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {invoice.status}
                  </span>
                </div>
                
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="text-sm text-gray-600">
                    {invoice.items.length} items • {invoice.date}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-orange-600">
                      IQD {invoice.totalAmount.toLocaleString('tr-TR')}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Invoice Detail View
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setCurrentView('list');
                setSelectedInvoice(null);
              }}
              className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">{selectedInvoice?.invoiceNo}</h1>
              <p className="text-sm text-blue-100">
                {selectedInvoice?.status === 'draft' ? 'Draft Invoice' : 'Completed Invoice'}
              </p>
            </div>
          </div>
          
          {selectedInvoice?.status === 'draft' && (
            <button 
              onClick={handleCompleteInvoice}
              className="px-4 py-2 bg-white border border-green-500 text-green-600 rounded-xl flex items-center gap-2 hover:bg-green-50 transition-colors"
            >
              <Check className="w-5 h-5" />
              <span className="font-bold">Complete</span>
            </button>
          )}
        </div>

        {/* Barcode Scanner */}
        {selectedInvoice?.status === 'draft' && (
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Scan className="w-5 h-5" />
              <span className="text-sm font-bold">Scan Barcode</span>
            </div>
            <div className="flex gap-2">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleBarcodeSubmit();
                  }
                }}
                placeholder="Scan or type barcode..."
                className="flex-1 px-4 py-3 bg-white/90 text-gray-900 rounded-xl outline-none"
              />
              <button
                onClick={handleBarcodeSubmit}
                className="px-6 py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Customer Selection */}
      <div className="p-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600 mb-2 font-bold">Customer</div>
          {selectedInvoice?.status === 'draft' ? (
            <button
              onClick={() => setShowCustomerSelect(!showCustomerSelect)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-300 hover:bg-gray-100 transition-colors"
            >
              <span className={selectedInvoice?.customer ? 'text-gray-900' : 'text-gray-400'}>
                {selectedInvoice?.customer || 'Select customer...'}
              </span>
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </button>
          ) : (
            <div className="px-4 py-3 bg-gray-50 rounded-xl text-gray-900">
              {selectedInvoice?.customer}
            </div>
          )}
          
          {/* Customer Dropdown */}
          {showCustomerSelect && selectedInvoice?.status === 'draft' && (
            <div className="mt-2 bg-white border border-gray-300 rounded-xl shadow-lg max-h-60 overflow-auto">
              {mockCustomers.map((customer) => (
                <button
                  key={customer}
                  onClick={() => handleSelectCustomer(customer)}
                  className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                >
                  {customer}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="space-y-3">
          {selectedInvoice?.items.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No items yet</p>
              <p className="text-sm text-gray-400 mt-1">Scan barcodes to add products</p>
            </div>
          ) : (
            selectedInvoice?.items.map((item) => (
              <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Package className="w-6 h-6 text-blue-600" />
                  </div>
                  
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 mb-1">{item.productName}</h4>
                    <p className="text-sm text-gray-500">Barcode: {item.barcode}</p>
                    
                    <div className="flex items-center gap-4 mt-3">
                      {selectedInvoice?.status === 'draft' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                            className="w-8 h-8 bg-white border border-gray-300 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-700 font-bold"
                          >
                            -
                          </button>
                          <span className="w-12 text-center font-bold">{item.quantity}</span>
                          <button
                            onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                            className="w-8 h-8 bg-white border border-blue-500 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-50 transition-colors font-bold"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600">
                          Qty: <span className="font-bold">{item.quantity}</span>
                        </div>
                      )}
                      
                      <div className="text-sm text-gray-600">
                        x IQD {item.unitPrice.toLocaleString('tr-TR')}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-lg font-bold text-orange-600 mb-2">
                      IQD {item.total.toLocaleString('tr-TR')}
                    </div>
                    {selectedInvoice?.status === 'draft' && (
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="w-8 h-8 bg-white border border-red-300 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors ml-auto"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Total Footer */}
      <div className="bg-white border-t border-gray-200 p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Total Amount</div>
            <div className="text-3xl font-bold text-blue-600">
              IQD {selectedInvoice?.totalAmount.toLocaleString('tr-TR')}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Total Items</div>
            <div className="text-2xl font-bold text-gray-900">
              {selectedInvoice?.items.reduce((sum, item) => sum + item.quantity, 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

