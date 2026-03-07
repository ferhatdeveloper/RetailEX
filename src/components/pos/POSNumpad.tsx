import { Delete, Eraser } from 'lucide-react';

interface POSNumpadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onEnter?: () => void;
  darkMode?: boolean;
  maxValue?: number;
  allowDecimal?: boolean;
  submitLabel?: string;
  showSubmitButton?: boolean;
  quickAmountButton?: {
    label: string;
    value: number;
  };
}

export function POSNumpad({
  value,
  onChange,
  onSubmit,
  onEnter,
  darkMode = false,
  allowDecimal = true,
  submitLabel = 'TAMAM',
  showSubmitButton = true,
  quickAmountButton
}: POSNumpadProps) {

  const handleClick = (input: string) => {
    if (input === 'clear') {
      onChange('');
    } else if (input === 'backspace') {
      onChange(value.slice(0, -1));
    } else if (input === '.') {
      if (allowDecimal && !value.includes('.')) {
        onChange(value + '.');
      }
    } else {
      // Append number
      const newValue = value + input;
      onChange(newValue);
    }
  };

  const handleQuickAmount = () => {
    if (quickAmountButton) {
      onChange(quickAmountButton.value.toString());
    }
  };

  return (
    <div>
      <h4 className={`text-sm mb-2 font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
        Numpad:
      </h4>
      <div className="grid grid-cols-4 gap-0.5">
        {/* Row 1: 00, 000, Clear icon, Backspace icon */}
        <button
          onClick={() => handleClick('00')}
          className={`p-4 text-lg font-medium transition-colors ${darkMode
              ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
            }`}
        >
          00
        </button>

        <button
          onClick={() => handleClick('000')}
          className={`p-4 text-lg font-medium transition-colors ${darkMode
              ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
            }`}
        >
          000
        </button>

        <button
          onClick={() => handleClick('clear')}
          className={`p-4 font-medium transition-colors flex items-center justify-center ${darkMode
              ? 'bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 active:bg-blue-900/80'
              : 'bg-blue-200 hover:bg-blue-300 text-blue-700 active:bg-blue-400'
            }`}
        >
          <Eraser className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleClick('backspace')}
          className={`p-4 font-medium transition-colors flex items-center justify-center ${darkMode
              ? 'bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 active:bg-blue-900/80'
              : 'bg-blue-200 hover:bg-blue-300 text-blue-700 active:bg-blue-400'
            }`}
        >
          <Delete className="w-5 h-5" />
        </button>

        {/* Row 2: 7, 8, 9, C */}
        {[7, 8, 9].map(num => (
          <button
            key={num}
            onClick={() => handleClick(num.toString())}
            className={`p-4 text-lg font-medium transition-colors ${darkMode
                ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
              }`}
          >
            {num}
          </button>
        ))}

        <button
          onClick={() => handleClick('clear')}
          className={`p-4 font-medium transition-colors ${darkMode
              ? 'bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 active:bg-blue-900/80'
              : 'bg-blue-200 hover:bg-blue-300 text-blue-700 active:bg-blue-400'
            }`}
        >
          C
        </button>

        {/* Row 3: 4, 5, 6, Fiyat/Quick */}
        {[4, 5, 6].map(num => (
          <button
            key={num}
            onClick={() => handleClick(num.toString())}
            className={`p-4 text-lg font-medium transition-colors ${darkMode
                ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
              }`}
          >
            {num}
          </button>
        ))}

        {quickAmountButton ? (
          <button
            onClick={handleQuickAmount}
            className={`p-4 text-xs font-medium transition-colors ${darkMode
                ? 'bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 active:bg-blue-900/80'
                : 'bg-blue-200 hover:bg-blue-300 text-blue-700 active:bg-blue-400'
              }`}
          >
            {quickAmountButton.label}
          </button>
        ) : (
          <div className={`p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}></div>
        )}

        {/* Row 4-5: 1, 2, 3, TAMAM (row-span-2) */}
        {[1, 2, 3].map(num => (
          <button
            key={num}
            onClick={() => handleClick(num.toString())}
            className={`p-4 text-lg font-medium transition-colors ${darkMode
                ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
              }`}
          >
            {num}
          </button>
        ))}

        {showSubmitButton && onSubmit ? (
          <button
            onClick={onSubmit}
            disabled={!value || parseFloat(value) <= 0}
            className={`row-span-2 p-4 text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${darkMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white active:bg-blue-800'
                : 'bg-blue-600 hover:bg-blue-700 text-white active:bg-blue-800'
              }`}
          >
            {submitLabel}
          </button>
        ) : (
          <div className={`row-span-2 ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}></div>
        )}

        {/* Row 5: 0 (col-span-2), comma, [empty if submit exists] */}
        <button
          onClick={() => handleClick('0')}
          className={`col-span-2 p-4 text-lg font-medium transition-colors ${darkMode
              ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
            }`}
        >
          0
        </button>

        {allowDecimal ? (
          <button
            onClick={() => handleClick('.')}
            disabled={value.includes('.')}
            className={`p-4 text-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${darkMode
                ? 'bg-gray-800 hover:bg-gray-700 text-white active:bg-gray-600'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-800 active:bg-gray-400'
              }`}
          >
            .
          </button>
        ) : (
          <div className={`${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}></div>
        )}
      </div>
    </div>
  );
}


