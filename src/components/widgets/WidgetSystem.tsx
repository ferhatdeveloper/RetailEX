/**
 * Widget System
 * Pattern: Composite Pattern + Observer Pattern
 * Drag-drop customizable dashboard widgets
 */

import { ReactNode } from 'react';
import {
  TrendingUp, DollarSign, Package, Users, ShoppingCart,
  AlertTriangle, BarChart3, PieChart, Activity, Clock
} from 'lucide-react';

// Widget Types
export type WidgetType =
  | 'sales-today'
  | 'revenue-month'
  | 'low-stock'
  | 'top-products'
  | 'sales-chart'
  | 'customer-count'
  | 'pending-orders'
  | 'category-pie';

export type WidgetSize = 'small' | 'medium' | 'large' | 'full';

// Widget Configuration
export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  size: WidgetSize;
  position: { x: number; y: number };
  visible: boolean;
  refreshInterval?: number; // seconds
}

// Widget Data Interface
export interface WidgetData {
  value: number | string;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  chartData?: any[];
  items?: any[];
}

/**
 * Widget Base Class (Composite Pattern)
 */
export abstract class Widget {
  constructor(
    public config: WidgetConfig,
    protected data: WidgetData
  ) { }

  abstract render(): ReactNode;

  abstract fetchData(): Promise<WidgetData>;

  getSizeClasses(): string {
    switch (this.config.size) {
      case 'small':
        return 'col-span-1 row-span-1';
      case 'medium':
        return 'col-span-2 row-span-1';
      case 'large':
        return 'col-span-2 row-span-2';
      case 'full':
        return 'col-span-4 row-span-2';
      default:
        return 'col-span-1 row-span-1';
    }
  }
}

/**
 * Sales Today Widget
 */
export class SalesTodayWidget extends Widget {
  render(): ReactNode {
    return (
      <WidgetCard
        title={this.config.title}
        icon={<ShoppingCart className="w-5 h-5" />}
        size={this.config.size}
      >
        <div className="p-4">
          <div className="text-3xl text-blue-600">{this.data.value}</div>
          {this.data.change && (
            <div className={`text-sm mt-1 ${this.data.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {this.data.trend === 'up' ? '↑' : '↓'} {Math.abs(this.data.change)}%
            </div>
          )}
        </div>
      </WidgetCard>
    );
  }

  async fetchData(): Promise<WidgetData> {
    // Mock data - gerçek implementation'da API call yapılır
    return {
      value: '125',
      change: 12.5,
      trend: 'up'
    };
  }
}

/**
 * Revenue Widget
 */
export class RevenueWidget extends Widget {
  render(): ReactNode {
    return (
      <WidgetCard
        title={this.config.title}
        icon={<DollarSign className="w-5 h-5" />}
        size={this.config.size}
      >
        <div className="p-4">
          <div className="text-3xl text-green-600">{this.data.value} TL</div>
          {this.data.change && (
            <div className={`text-sm mt-1 ${this.data.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {this.data.trend === 'up' ? '↑' : '↓'} {Math.abs(this.data.change)}%
            </div>
          )}
        </div>
      </WidgetCard>
    );
  }

  async fetchData(): Promise<WidgetData> {
    return {
      value: '45,250',
      change: 8.3,
      trend: 'up'
    };
  }
}

/**
 * Low Stock Widget
 */
export class LowStockWidget extends Widget {
  render(): ReactNode {
    return (
      <WidgetCard
        title={this.config.title}
        icon={<AlertTriangle className="w-5 h-5" />}
        size={this.config.size}
      >
        <div className="p-4">
          <div className="text-3xl text-orange-600">{this.data.value}</div>
          <div className="text-xs text-gray-600 mt-1">Ürün kritik seviyede</div>
          {this.data.items && (
            <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
              {this.data.items.slice(0, 3).map((item: any, idx: number) => (
                <div key={idx} className="text-xs text-gray-700 flex justify-between">
                  <span>{item.name}</span>
                  <span className="text-orange-600">{item.stock} adet</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </WidgetCard>
    );
  }

  async fetchData(): Promise<WidgetData> {
    return {
      value: '8',
      items: [
        { name: 'Süt 1L', stock: 5 },
        { name: 'Ekmek', stock: 12 },
        { name: 'Yumurta', stock: 8 }
      ]
    };
  }
}

/**
 * Customer Count Widget
 */
export class CustomerCountWidget extends Widget {
  render(): ReactNode {
    return (
      <WidgetCard
        title={this.config.title}
        icon={<Users className="w-5 h-5" />}
        size={this.config.size}
      >
        <div className="p-4">
          <div className="text-3xl text-purple-600">{this.data.value}</div>
          {this.data.change && (
            <div className="text-sm text-gray-600 mt-1">
              +{this.data.change} bu ay
            </div>
          )}
        </div>
      </WidgetCard>
    );
  }

  async fetchData(): Promise<WidgetData> {
    return {
      value: '1,245',
      change: 23
    };
  }
}

/**
 * Top Products Widget
 */
export class TopProductsWidget extends Widget {
  render(): ReactNode {
    return (
      <WidgetCard
        title={this.config.title}
        icon={<Package className="w-5 h-5" />}
        size={this.config.size}
      >
        <div className="p-3">
          {this.data.items && (
            <div className="space-y-2">
              {this.data.items.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">#{idx + 1}</span>
                    <span className="text-gray-700">{item.name}</span>
                  </div>
                  <span className="text-blue-600">{item.count} adet</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </WidgetCard>
    );
  }

  async fetchData(): Promise<WidgetData> {
    return {
      value: '10',
      items: [
        { name: 'Coca Cola 330ml', count: 145 },
        { name: 'Ekmek', count: 132 },
        { name: 'Süt 1L', count: 98 },
        { name: 'Yumurta', count: 87 },
        { name: 'Su 1.5L', count: 76 }
      ]
    };
  }
}

/**
 * Widget Card Component (Presentation)
 */
interface WidgetCardProps {
  title: string;
  icon: ReactNode;
  size: WidgetSize;
  children: ReactNode;
  onRemove?: () => void;
  onResize?: () => void;
}

function WidgetCard({ title, icon, children, onRemove, onResize }: WidgetCardProps) {
  return (
    <div className="bg-white border border-gray-300 rounded shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-blue-600">{icon}</div>
          <h3 className="text-[11px] text-gray-700">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          {onResize && (
            <button
              onClick={onResize}
              className="p-0.5 hover:bg-blue-100 rounded text-gray-600"
              title="Boyutlandır"
            >
              <Activity className="w-3 h-3" />
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="p-0.5 hover:bg-red-100 rounded text-gray-600"
              title="Kaldır"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {/* Content */}
      {children}
    </div>
  );
}

/**
 * Widget Factory (Factory Pattern)
 */
export class WidgetFactory {
  static createWidget(config: WidgetConfig): Widget {
    const initialData: WidgetData = { value: 0 };

    switch (config.type) {
      case 'sales-today':
        return new SalesTodayWidget(config, initialData);
      case 'revenue-month':
        return new RevenueWidget(config, initialData);
      case 'low-stock':
        return new LowStockWidget(config, initialData);
      case 'customer-count':
        return new CustomerCountWidget(config, initialData);
      case 'top-products':
        return new TopProductsWidget(config, initialData);
      default:
        throw new Error(`Unknown widget type: ${config.type}`);
    }
  }
}

/**
 * Widget Manager (Observer Pattern)
 */
export class WidgetManager {
  private widgets: Map<string, Widget> = new Map();
  private observers: Array<(widgets: Widget[]) => void> = [];

  addWidget(config: WidgetConfig): void {
    const widget = WidgetFactory.createWidget(config);
    this.widgets.set(config.id, widget);
    this.notifyObservers();
  }

  removeWidget(id: string): void {
    this.widgets.delete(id);
    this.notifyObservers();
  }

  updateWidget(id: string, data: Partial<WidgetData>): void {
    const widget = this.widgets.get(id);
    if (widget) {
      Object.assign(widget, { data: { ...widget['data'], ...data } });
      this.notifyObservers();
    }
  }

  getWidgets(): Widget[] {
    return Array.from(this.widgets.values());
  }

  subscribe(observer: (widgets: Widget[]) => void): void {
    this.observers.push(observer);
  }

  private notifyObservers(): void {
    const widgets = this.getWidgets();
    this.observers.forEach(observer => observer(widgets));
  }

  async refreshAll(): Promise<void> {
    const promises = Array.from(this.widgets.values()).map(async (widget) => {
      const data = await widget.fetchData();
      this.updateWidget(widget.config.id, data);
    });

    await Promise.all(promises);
  }
}

/**
 * Default Widget Configurations
 */
export const defaultWidgets: WidgetConfig[] = [
  {
    id: 'sales-1',
    type: 'sales-today',
    title: 'Bugünkü Satışlar',
    size: 'small',
    position: { x: 0, y: 0 },
    visible: true,
    refreshInterval: 30
  },
  {
    id: 'revenue-1',
    type: 'revenue-month',
    title: 'Aylık Ciro',
    size: 'small',
    position: { x: 1, y: 0 },
    visible: true,
    refreshInterval: 60
  },
  {
    id: 'stock-1',
    type: 'low-stock',
    title: 'Düşük Stok Uyarısı',
    size: 'small',
    position: { x: 2, y: 0 },
    visible: true,
    refreshInterval: 300
  },
  {
    id: 'customer-1',
    type: 'customer-count',
    title: 'Toplam Müşteri',
    size: 'small',
    position: { x: 3, y: 0 },
    visible: true,
    refreshInterval: 3600
  },
  {
    id: 'products-1',
    type: 'top-products',
    title: 'En Çok Satanlar',
    size: 'medium',
    position: { x: 0, y: 1 },
    visible: true,
    refreshInterval: 60
  }
];

// Singleton instance
export const widgetManager = new WidgetManager();

