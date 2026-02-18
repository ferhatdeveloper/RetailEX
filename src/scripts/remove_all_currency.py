#!/usr/bin/env python3
"""
RetailOS v1.0.0 - Remove ALL ₺ currency symbols from components
This script removes ' ₺' from all .tsx files in components directory
"""

import os
from pathlib import Path

def remove_currency_from_file(file_path):
    """Remove ₺ symbol from a single file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Count occurrences
        count_before = content.count(' ₺')
        
        if count_before > 0:
            # Remove ' ₺' pattern
            new_content = content.replace(' ₺', '')
            
            # Write back
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            
            return count_before
        
        return 0
    
    except Exception as e:
        print(f"❌ Error processing {file_path.name}: {e}")
        return 0

def main():
    """Main execution"""
    print("=" * 70)
    print("🚀 RetailOS v1.0.0 - Currency Symbol Removal Tool")
    print("=" * 70)
    print()
    
    # Get the components directory
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    components_dir = project_root / 'components'
    
    if not components_dir.exists():
        print(f"❌ Error: Components directory not found!")
        print(f"   Looking for: {components_dir}")
        return
    
    # Find all .tsx files
    tsx_files = sorted(components_dir.glob('*.tsx'))
    
    if not tsx_files:
        print(f"❌ No .tsx files found in {components_dir}")
        return
    
    print(f"📁 Found {len(tsx_files)} .tsx files in components/")
    print()
    
    total_removed = 0
    files_modified = 0
    
    # Process each file
    for file_path in tsx_files:
        removed = remove_currency_from_file(file_path)
        if removed > 0:
            files_modified += 1
            total_removed += removed
            print(f"✅ {file_path.name:40} → Removed {removed:3} occurrences")
        else:
            print(f"⚪ {file_path.name:40} → No changes needed")
    
    print()
    print("=" * 70)
    print(f"✨ Processing Complete!")
    print("=" * 70)
    print(f"   Files scanned:     {len(tsx_files)}")
    print(f"   Files modified:    {files_modified}")
    print(f"   Total ₺ removed:   {total_removed}")
    print()
    
    if total_removed > 0:
        print("🎉 All currency symbols have been successfully removed!")
    else:
        print("ℹ️  No currency symbols found.")
    
    print()

if __name__ == "__main__":
    main()
