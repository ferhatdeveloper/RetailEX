import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Bot, User, Loader2, Sparkles, X } from 'lucide-react';
import type { Sale, Product } from '../../App';
import { generateAIResponse, ChatHistory } from '../../services/reportAIService';
import type { ChatMessage } from '../../services/reportAIService';

interface ReportChatAIProps {
  sales: Sale[];
  products: Product[];
  dailySales: Sale[];
  dailyTotal: number;
  dailyCash: number;
  dailyCard: number;
  productSales: Array<{
    product: Product;
    quantity: number;
    revenue: number;
  }>;
  cashierPerformance: Array<{
    name: string;
    salesCount: number;
    totalRevenue: number;
  }>;
  categoryAnalysis: Array<{
    name: string;
    totalRevenue: number;
    totalQuantity: number;
  }>;
  hourlyAnalysis: Array<{
    hour: number;
    sales: number;
    revenue: number;
    label?: string;
  }>;
}

export function ReportChatAI({
  sales,
  products,
  dailySales,
  dailyTotal,
  dailyCash,
  dailyCard,
  productSales,
  cashierPerformance,
  categoryAnalysis,
  hourlyAnalysis
}: ReportChatAIProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory] = useState(() => new ChatHistory());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Örnek sorular
  const exampleQuestions = [
    'Bugünkü satışlar nasıl?',
    'En çok satan ürünler neler?',
    'Kasiyer performansı nasıl?',
    'Stok durumu nedir?',
    'En yoğun saat hangisi?',
    'Kategori analizi göster'
  ];

  useEffect(() => {
    // Hoş geldin mesajı
    const welcomeMessage: ChatMessage = {
      role: 'assistant',
      content: 'Merhaba! ğŸ‘‹\n\nRaporlar hakkında sorular sorabilirsiniz. Size yardımcı olmaya hazırım!\n\nÖrnek sorular:\n• "Bugünkü satışlar nasıl?"\n• "En çok satan ürünler neler?"\n• "Kasiyer performansı nasıl?"\n• "Stok durumu nedir?"',
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
    chatHistory.addMessage('assistant', welcomeMessage.content);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    chatHistory.addMessage('user', userMessage.content);
    setInput('');
    setIsLoading(true);

    try {
      const reportData = {
        sales,
        products,
        dailySales,
        dailyTotal,
        dailyCash,
        dailyCard,
        productSales,
        cashierPerformance,
        categoryAnalysis,
        hourlyAnalysis
      };

      // ChatGPT ile analiz yap (fallback ile)
      const conversationHistory = messages
        .filter(m => m.role !== 'assistant' || m.content !== 'Merhaba! ğŸ‘‹\n\nRaporlar hakkında sorular sorabilirsiniz. Size yardımcı olmaya hazırım!')
        .map(m => ({ role: m.role, content: m.content }));
      
      const response = await generateAIResponse(
        userMessage.content, 
        reportData,
        conversationHistory,
        true // ChatGPT kullan
      );

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.answer,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      chatHistory.addMessage('assistant', assistantMessage.content);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleExampleClick = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    chatHistory.clear();
    const welcomeMessage: ChatMessage = {
      role: 'assistant',
      content: 'Merhaba! ğŸ‘‹\n\nRaporlar hakkında sorular sorabilirsiniz. Size yardımcı olmaya hazırım!',
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
    chatHistory.addMessage('assistant', welcomeMessage.content);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Chat AI (Beta)</h3>
            <p className="text-sm text-gray-600">Sorularınızı sorun, size raporlar hakkında bilgi vereyim</p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          title="Sohbeti Temizle"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-lg px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-900'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.content}
              </div>
              <div
                className={`text-xs mt-2 ${
                  message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                }`}
              >
                {message.timestamp.toLocaleTimeString('tr-TR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
            {message.role === 'user' && (
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-sm text-gray-600">Düşünüyorum...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Example Questions */}
      {messages.length <= 1 && (
        <div className="px-6 py-4 bg-white border-t flex-shrink-0">
          <p className="text-sm text-gray-600 mb-3">Örnek sorular:</p>
          <div className="flex flex-wrap gap-2">
            {exampleQuestions.map((question, index) => (
              <button
                key={index}
                onClick={() => handleExampleClick(question)}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t px-6 py-4 flex-shrink-0">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Raporlar hakkında soru sorun..."
              className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            <span>Gönder</span>
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Enter tuşuna basarak gönderebilirsiniz
        </p>
      </div>
    </div>
  );
}


