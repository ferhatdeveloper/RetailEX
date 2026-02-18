import { memo } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import { Package } from 'lucide-react';
import type { Product } from '../../App';

interface VirtualProductGridProps {
  products: Product[];
  onProductClick: (product: Product) => void;
  containerWidth: number;
  containerHeight: number;
  gridColumns: number;
}

const ProductCard = memo(({ 
  product, 
  onClick,
  style 
}: { 
  product: Product; 
  onClick: () => void;
  style: React.CSSProperties;
}) => (
  <div style={style}>
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all p-3 text-left group m-1 w-[calc(100%-8px)] h-[calc(100%-8px)]"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 mb-1 truncate">
            {product.category}
          </div>
          <div className="text-sm text-gray-900 mb-1 line-clamp-2">
            {product.name}
          </div>
        </div>
        {product.variants && product.variants.length > 0 && (
          <div className="ml-2 flex-shrink-0">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
              <Package className="w-3 h-3 text-blue-600" />
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="text-base text-blue-600">
          {product.price.toFixed(2)}
        </div>
        <div className={`text-xs px-2 py-0.5 rounded ${
          product.stock > 10 ? 'bg-green-100 text-green-700' :
          product.stock > 0 ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {product.stock} adet
        </div>
      </div>
    </button>
  </div>
));

ProductCard.displayName = 'ProductCard';

export const VirtualProductGrid = memo(({
  products,
  onProductClick,
  containerWidth,
  containerHeight,
  gridColumns,
}: VirtualProductGridProps) => {
  const columnWidth = Math.floor(containerWidth / gridColumns);
  const rowHeight = 120;
  const rowCount = Math.ceil(products.length / gridColumns);

  const Cell = ({ columnIndex, rowIndex, style }: any) => {
    const index = rowIndex * gridColumns + columnIndex;
    if (index >= products.length) return null;
    
    const product = products[index];
    return (
      <ProductCard
        product={product}
        onClick={() => onProductClick(product)}
        style={style}
      />
    );
  };

  return (
    <Grid
      columnCount={gridColumns}
      columnWidth={columnWidth}
      height={containerHeight}
      rowCount={rowCount}
      rowHeight={rowHeight}
      width={containerWidth}
      overscanRowCount={2}
    >
      {Cell}
    </Grid>
  );
});

VirtualProductGrid.displayName = 'VirtualProductGrid';

