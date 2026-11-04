# GameOn Timer & POS

Desktop console-center manager for GameOn: station timers, session control
(start / pause / resume), buffet tabs and checkout billing.
Persian UI, strictly RTL, Apple-inspired dark theme.

**Stack:** Tauri 2 (Rust) · React 19 · TypeScript · Vite · Tailwind CSS v4 · Zustand

## Prerequisites

- Node.js 20.19+ (or 22.12+) and npm
- Rust 1.90+ (`rustup`)
- Tauri system dependencies for your OS: <https://v2.tauri.app/start/prerequisites/>
  (Windows: WebView2 + MSVC build tools; Linux: `libwebkit2gtk-4.1-dev` and friends)

## Scripts

```bash
npm install
```

```bash
npm run tauri dev      # desktop app with hot reload
```

```bash
npm run tauri build    # signed-ready installers in src-tauri/target/release/bundle
```

```bash
npm run dev            # frontend only, in the browser at http://localhost:1420
```

```bash
npm run typecheck && npm run lint && npm test
```

## Project structure

```
src/
  components/          UI building blocks
    StationCard.tsx      one station: status, live meter, actions
    SessionMeter.tsx     the only per-card part that ticks every second
    BuffetQuickAdd.tsx   buffet popover on a running station
    InvoiceModal.tsx     checkout dialog (preview = recorded invoice)
    Sidebar.tsx, Navbar.tsx, DashboardStats.tsx, StatTile.tsx
    ui/                  Button, StatusBadge, SegmentedControl
  pages/Dashboard.tsx  KPI strip + filterable station grid
  store/
    stationStore.ts      stations, open sessions, invoices (persisted)
    uiStore.ts           filter + checkout dialog state (ephemeral)
  types/               station, session, invoice, buffet
  lib/
    currency.ts          Toman formatting, Persian digits, round-to-1,000
    time.ts              elapsed/paused time, duration + Jalali date formatting
    billing.ts           time cost, session charges, invoice builder
  hooks/useNow.ts      one shared, second-aligned clock for all timers
  data/seed.ts         first-run stations and buffet menu (placeholder prices)
src-tauri/             Rust host, window config, capabilities, icons
```

## Key decisions

- **Timers survive restarts.** Sessions store timestamps (`startedAt`,
  `pausedAt`, `pausedMs`), never a running counter. Elapsed time is derived
  from the wall clock on every render, so closing or crashing the app neither
  loses nor double-counts time.
- **Persistence.** Zustand `persist` writes to the WebView's `localStorage`,
  which Tauri keeps in the app data directory. Invoices are planned to move to
  SQLite (`tauri-plugin-sql`) before the invoice history grows large.
- **Money.** All amounts are integer Toman. Time is prorated to the millisecond;
  only the payable total is rounded to the nearest 1,000 Toman, and the invoice
  shows the rounding adjustment.
- **Checkout freezes billing** at the moment the operator presses «تسویه»; the
  dialog preview and the recorded invoice come from the same `buildInvoice`.
- **RTL first.** `<html dir="rtl" lang="fa">`, logical Tailwind utilities
  (`ms-*`, `ps-*`, `start-*`, `border-e`) everywhere; timers and clocks are
  isolated with `dir="ltr"`.
- **Font.** Vazirmatn variable is bundled from `@fontsource-variable/vazirmatn`
  (woff2, no network needed).
- **Design tokens** live in `src/index.css` (`@theme`): gold `#D4AF37` is
  reserved for prices and primary actions; surfaces use Apple's dark system grays
  and a `glass` material.

## Regenerating app icons

```bash
npx tauri icon src-tauri/icons/app-icon.svg -o src-tauri/icons
```

This also generates Android/iOS icon folders; delete them, since this is a desktop-only app.
