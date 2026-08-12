---
description: Turkish Encoding & Character Safety Workflow
---

This workflow ensures that all file edits and string operations maintain the integrity of Turkish characters and strictly use UTF-8 encoding.

### Core Rules

1. **Strict UTF-8 Encoding**: Always use UTF-8 without BOM for all project files.
2. **Turkish Character Sensitivity**: 
   - Be extremely careful with: **İ, ı, Ğ, ğ, Ü, ü, Ş, ş, Ö, ö, Ç, ç**.
   - **Case Conversion**: Never use standard `.toLowerCase()` or `.toUpperCase()` on Turkish strings unless using locale-aware methods if available. In pure JS, remember that `İ` becomes `i` (not `I`) and `I` becomes `ı` (not `i`).
3. **Pre-Edit Verification**:
   - Before editing a file containing Turkish text, read the content to confirm current character integrity.
4. **Post-Edit Verification**:
   - After every `replace_file_content` or `multi_replace_file_content` call, immediately use `view_file` or a regex search to verify that Turkish characters in the modified section are intact.
5. **Character Replacement Table**:
   - İ (U+0130) -> Capital I with dot
   - ı (U+0131) -> Small i without dot
   - Ğ (U+011E) / ğ (U+011F)
   - Ş (U+015E) / ş (U+015F)
   - Ç (U+00C7) / ç (U+00E7)
   - Ö (U+00D6) / ö (U+00F6)
   - Ü (U+00DC) / ü (U+00FC)

### Prevention Steps

- When using `grep` or `find`, ensure the terminal environment supports UTF-8.
- Avoid any tools or commands that might default to Windows-1254 or other legacy encodings.
- If a string looks "garbled" (e.g., `Ã¼` instead of `ü`), **DO NOT** save it. Re-read the file with explicit UTF-8 intent.
