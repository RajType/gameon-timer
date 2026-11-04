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
