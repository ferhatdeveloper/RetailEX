---
name: ModernModal
description: Standardized design system for premium, modern, flat UI modals.
---

# Modern Modal Design System

This skill defines the visual tokens and structural rules for all modals in the RetailEX / GastroPOS platform.

## Visual Tokens

| Element | Style | Value |
| :--- | :--- | :--- |
| **Overlay** | Backdrop Blur | `bg-black/60 backdrop-blur-sm` |
| **Container** | Background | `bg-white` (Light) / `bg-gray-900` (Dark) |
| **Header** | Color | `bg-[#2563eb]` (Solid Blue) |
| **Radius** | Main | `rounded-xl` |
| **Shadow** | Default | `shadow-2xl` |
| **Borders** | Subtle | `border-gray-200` (Light) / `border-gray-700` (Dark) |

## Structural Rules

1.  **Header**:
    *   Must have a solid blue background.
    *   Must include a relevant `lucide-react` icon on the left.
    *   Title should be clean, medium/base size.
    *   Close button (`X` icon) at the top right.
    *   Secondary actions (like Numpad toggle) can be placed next to the title or on the right side.

2.  **Content Segments**:
    *   Use border-radius `rounded-xl` for inner containers.
    *   Subtle borders `border-gray-200` or `border-blue-100` for sections.
    *   Background for sections: `bg-slate-50` or `bg-blue-50/30`.

3.  **Buttons**:
    *   **Primary Action**: Green (`bg-[#22c55e]`), bold with check icon.
    *   **Cancel/Close**: Gray/Light Gray (`bg-slate-100` or `bg-slate-200`).
    *   **Numeric/Toggle**: Blue background when active, white with border when inactive.
    *   **Interactive States**: All buttons must have smooth transitions (`transition-all`) and subtle hover/active scales (`hover:scale-[1.02] active:scale-[0.98]`).

4.  **Typography**:
    *   Use `font-black` for headers or important status labels.
    *   `tabular-nums` for currency values to prevent jumping.
    *   Clean tracking (`tracking-tight`) for a professional look.

## Implementation Example (Tailwind)

```tsx
<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
  <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
    {/* Header */}
    <div className="bg-[#2563eb] p-4 flex items-center justify-between text-white">
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5" />
        <h3 className="font-bold text-lg">Title</h3>
      </div>
      <button onClick={onClose}><X className="w-6 h-6" /></button>
    </div>
    
    {/* Body */}
    <div className="p-6 flex-1 overflow-auto bg-white">
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
        {/* Content */}
      </div>
    </div>
    
    {/* Footer */}
    <div className="p-4 border-t border-slate-100 flex gap-3">
      <button className="flex-1 py-3 bg-slate-100 rounded-lg">Cancel</button>
      <button className="flex-1 py-3 bg-[#22c55e] text-white rounded-lg font-bold">Confirm</button>
    </div>
  </div>
</div>
```
