# ExRetailOS: Codebase Map

This document explains the project structure and the purpose of each major directory to ensure all AI agents have full context of where things are and how they interact.

## 📂 Project Root
- `.agent/`: Jules configuration, rulesets, and project context.
- `src/`: Main frontend application (React + TypeScript).
- `src-tauri/`: Desktop application backend (Rust).
- `supabase/`: Database schema, migrations, and edge functions.
- `scanner-service-app/`: (If applicable) Specialized service for barcode/QR scanning.

## 💻 Frontend (src/)
- `components/`: UI components organized by domain.
  - `trading/`: Invoices, quotes, orders.
  - `inventory/`: Product management, stock reports, warehouse management.
  - `system/`: Layouts, store management, dashboard.
  - `modules/`: Feature-specific dashboard modules.
- `services/`: API clients and core business logic.
  - `api/`: Supabase/Backend communication.
  - `voiceService.ts`: AI Voice Assistant integration.
  - `VisionService.ts`: OCR and image processing.
- `store/`: State management (likely using Riverpod or similar Hooks-based stores).
- `config/`: Static menus, command definitions, and constants.
- `hooks/`: Reusable React hooks for shared logic.
- `styles/`: CSS modules and global Tailwind v4 setup (`index.css`).

## 🦀 Desktop Backend (src-tauri/)
- `src/`: Rust modules.
  - `commands/`: Functions exposed to the frontend via `invoke`.
  - `database/`: Local database or cache management.
  - `rfid_writer.rs`, `label_printer.rs`, `scale_integration.rs`: Hardware drivers.
  - `vnc/`, `vpn/`: Remote management and secure connection modules.
  - `main.rs`: Entry point and Tauri builder configuration.

## 🗄️ Database (supabase/)
- `migrations/`: SQL files for schema updates and initial data seeds.
- `functions/`: Edge functions for server-side logic (Node.js/Deno).

## 🎯 Global Rules for Agents
1. **Locate First**: Before creating a new file, check if a similar component or service exists in the corresponding directory.
2. **Reuse Patterns**: Follow the patterns in `UniversalInvoiceForm.tsx` for complex forms and `voiceService.ts` for AI integrations.
3. **Cross-Language Awareness**: Remember that UI actions often trigger Rust commands in `src-tauri`.

