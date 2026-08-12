#!/bin/bash
# RetailOS - Remove ₺ currency symbol from all files

echo "Removing ₺ symbol from all TypeScript files..."

# Find all .tsx and .ts files and remove ₺ symbol
find components -name "*.tsx" -type f -exec sed -i 's/ ₺//g' {} +

echo "✅ Currency symbol removed from all files!"
