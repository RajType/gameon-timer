# GameOn Timer & POS Project

## Context
- Project: GameOn store console management software (Tauri + React + TypeScript).
- Goal: Create a professional-grade game center timer, session management, and POS billing system.

## Design Guidelines (Apple HIG)
- Aesthetic: Minimalism, dark mode, high contrast, clean typography.
- Font: Vazirmatn (Variable Font).
- Colors: Gold (#D4AF37) for pricing/actions, deep grays for UI elements, glassmorphism for surfaces.
- Direction: Always strictly RTL (Right-to-Left).
- Layout: High-density information display (Dashboard).

## Tech Stack
- Frontend: React, Vite, Tailwind CSS, Zustand (state management).
- Backend: Tauri (Rust).
- Formatting: Use Toman (ریال/تومان) for all currency displays; round totals to nearest 1,000 units.

## Operational Rules
- Modular Architecture: Keep components atomic.
- Persistence: Use local storage/SQLite via Tauri to ensure timer state persists through restarts.
- Communication: Persian language UI, professional and concise.
- Performance: Must be lightweight and instantaneous.

## Workflow
- Prioritize feature implementation that ensures business continuity (timers, pausing, checkout).
- Always verify RTL compatibility for new components.

# GameOn Timer & POS Project Rules

## Core Capabilities
1. High-Density Dashboard: Console stations list with active counters.
2. 2D Interactive Floor Plan: Draggable 2D layout editor for store arrangement (stations, VIP rooms, walls, counters) with live status overlay.
3. Pricing & Rates Matrix: Tiered pricing by console type, controller count, and peak hours.
4. Buffet & Inventory Module: Quick-billing snack items attached to active game sessions.
5. Smart Thermal Receipt Printer & POS Checkout: With rounding algorithms and discount support.
6. Settings & Customization Panel: Sound triggers, receipt headers, station configurations.

## Architecture Guidelines
- 2D Canvas: Use HTML5 Canvas or SVG with `@dnd-kit` / `react-grid-layout` or simple relative coordinate state `{ x, y, rotation, width, height }`.
- State Layer: Zustand with persistence (`zustand/middleware/persist`).
- Design System: Strict Apple HIG dark mode, minimalist gold accents (#D4AF37), Vazirmatn font, RTL direction.

