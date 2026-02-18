#!/usr/bin/env python3
"""
RetailOS - Remove ₺ currency symbol from all TypeScript files
Usage: python scripts/remove_currency.py
"""

import os
from pathlib import Path

def remove_currency_symbol(file_path):
    """Remove ₺ symbol from a file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Count occurrences before
        count_before = content.count(' ₺')
        
        if count_before > 0:
            # Remove ' ₺' pattern
            new_content = content.replace(' ₺', '')
            
            # Write back
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            
            print(f"✅ {file_path.name}: Removed {count_before} occurrences")
            return count_before
        
        return 0
    
    except Exception as e:
        print(f"❌ Error processing {file_path}: {e}")
        return 0

def main():
    """Main function"""
    print("🚀 RetailOS - Removing ₺ currency symbol...")
    print("=" * 60)
    
    total_removed = 0
    files_processed = 0
    
    # Get script directory and project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    components_dir = project_root / 'components'
    
    if not components_dir.exists():
        print(f"❌ Directory not found: {components_dir}")
        print(f"   Current directory: {Path.cwd()}")
        print(f"   Looking for: {components_dir}")
        return
    
    tsx_files = list(components_dir.glob('*.tsx'))
    
    print(f"Found {len(tsx_files)} .tsx files")
    print("=" * 60)
    
    for file_path in tsx_files:
        removed = remove_currency_symbol(file_path)
        if removed > 0:
            files_processed += 1
            total_removed += removed
    
    print("=" * 60)
    print(f"✅ Processing complete!")
    print(f"   Files processed: {files_processed}")
    print(f"   Total ₺ symbols removed: {total_removed}")

if __name__ == "__main__":
    main()