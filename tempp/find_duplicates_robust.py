import re

def find_duplicates(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    path = []
    stack = []
    
    for i, line in enumerate(lines):
        line_num = i + 1
        # Match keys like '  key: {' or '  key: "value",'
        match = re.search(r'^\s+([a-zA-Z0-9_]+)\s*:', line)
        if match:
            key = match.group(1)
            # Find current object context
            current_context = " -> ".join(path)
            # Check for duplicates in the current level
            if stack and key in stack[-1]:
                print(f"DUPLICATE KEY FOUND: '{key}' at line {line_num} in context '{current_context}'")
            if stack:
                stack[-1].add(key)
        
        # Track nesting
        if '{' in line:
            # If line has a key, it's the start of a new object
            if match:
                path.append(match.group(1))
            else:
                path.append("unknown")
            stack.append(set())
        
        if '}' in line:
            if path:
                path.pop()
            if stack:
                stack.pop()

if __name__ == "__main__":
    find_duplicates('d:/RetailEX/src/locales/translations.ts')
