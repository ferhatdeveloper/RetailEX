import type { Product } from '../../core/types';
import { useLongPressHandlers } from '../../hooks/useLongPress';

interface QuickProductSlotButtonProps {
  product: Product | null;
  slotIndex: number;
  onShortPress: (product: Product) => void;
  onLongPress: (product: Product) => void;
  onShiftPress?: (product: Product, slotIndex: number) => void;
  onEmptyPress?: (slotIndex: number) => void;
  className?: string;
}

export function QuickProductSlotButton({
  product,
  slotIndex,
  onShortPress,
  onLongPress,
  onShiftPress,
  onEmptyPress,
  className = '',
}: QuickProductSlotButtonProps) {
  const handlers = useLongPressHandlers(
    () => {
      if (product) onShortPress(product);
      else onEmptyPress?.(slotIndex);
    },
    () => {
      if (product) onLongPress(product);
    }
  );

  const { cancel, ...pressHandlers } = handlers;

  const stock = product?.stock ?? 0;

  return (
    <button
      type="button"
      {...pressHandlers}
      onMouseUp={(e) => {
        if (product && e.shiftKey && onShiftPress) {
          cancel();
          onShiftPress(product, slotIndex);
          return;
        }
        pressHandlers.onMouseUp(e);
      }}
      className={className}
    >
      {product ? (
        <>
          <div className="font-semibold truncate w-full text-center mb-1 text-[11px]">{product.name}</div>
          <div className="text-[10px] text-blue-600 font-bold">{product.price.toFixed(2)}</div>
          {stock !== undefined && (
            <div className="absolute top-1 right-1 bg-blue-600 text-white text-[9px] px-1 py-0.5 leading-none font-medium">
              {stock}
            </div>
          )}
        </>
      ) : (
        <span className="text-gray-400 font-medium">{slotIndex + 1}</span>
      )}
    </button>
  );
}
