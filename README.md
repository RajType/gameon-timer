# GameOn Timer & POS

Desktop console-center manager for GameOn: station timers, session control
(start / pause / resume / controller count), buffet tabs, checkout billing and
admin settings. Persian UI, strictly RTL, Apple-inspired dark theme.

**Stack:** Tauri 2 (Rust, SQLite via `rusqlite`) · React 19 · TypeScript · Vite · Tailwind CSS v4 · Zustand

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
npm run tauri build    # installers in src-tauri/target/release/bundle
```

```bash
npm run typecheck && npm run lint && npm test && npm run test:rust
```

The UI needs the desktop host: opened in a plain browser (`npm run dev`) it
shows a notice instead of the dashboard, because all data lives in SQLite.

## Data & reliability

All operational data — stations, rate plans, sessions (with their play
segments and buffet orders), invoices and settings — is stored in one SQLite
file:

| OS | Location |
| --- | --- |
| Windows | `%APPDATA%\com.gameon.timer\gameon.db` |
| Linux | `~/.local/share/com.gameon.timer/gameon.db` |
| macOS | `~/Library/Application Support/com.gameon.timer/gameon.db` |

(`GAMEON_DATA_DIR` overrides the folder; tests use it.)

- **Durable writes.** WAL journal, `synchronous=FULL`, foreign keys on. Every
  command runs in a single transaction — a checkout either fully happens or not
  at all.
- **Timers survive restarts and crashes.** Sessions are stored as segments of
  wall-clock timestamps; elapsed time is recomputed on every render.
- **Versioned migrations.** `src-tauri/migrations/NNNN_*.sql`, applied in order,
  each in its own transaction, tracked by `PRAGMA user_version`. A backup is
  taken automatically before any upgrade. Files from a newer app version or
  non-GameOn databases are refused (`PRAGMA application_id`).
- **History is never rewritten.** Each session stores the rate table agreed at
  start; each order line stores its name and unit price; each invoice stores its
  lines, rounding rule and receipt text. Invoices are immutable (database
  triggers reject `UPDATE`/`DELETE`).
- **Money** is integer Toman everywhere. Time is prorated to the millisecond
  per line (half-up to whole Toman); only the grand total is rounded, by the
  configured rule (default: nearest 1,000).

### Upgrading from v0.1.0 (localStorage)

On first start, the app hands the old `gameon:floor` localStorage payload to
the backend, which imports it atomically, exactly once (SHA-256 of the
payload), and stores the raw payload in the `legacy_imports` table. Open
sessions keep billing exactly as before; invoices keep their numbers and
amounts. Only after the database confirms it is stored is the localStorage key
moved to `gameon:floor:archived:<hash>`. If the old data cannot be imported, the
database is left untouched and the operator chooses to retry or continue — the
original key is kept either way. Status is shown under **داده و پشتیبان**.

### Floor map

**ایستگاه‌ها → ویرایش چیدمان** shows the stations on a 2D board (`@dnd-kit/core`).
Drag a card, or focus it and use Space / arrow keys / Space; the position is
saved immediately (`update_station_position`). Coordinates are physical room
positions in px from the board's top-left, so the board is not mirrored for
RTL (the cards are). `0, 0` means "not placed yet": such stations are shown in a
default right-to-left grid until moved.

### Backups

- Automatic: once a day at startup (last 14 kept), before migrations, and
  before every restore (safety copy).
- Manual: **پشتیبان‌گیری الان** (backups folder) or **ذخیره در فایل…** (e.g. USB).
- Restore from the list or **بازگردانی از فایل…**. Candidates are validated
  (application id, schema version, `integrity_check`) before anything changes.

## Project structure

```
src/
  components/           dashboard building blocks (StationCard, SessionMeter, InvoiceModal, FloorMap, …)
    admin/              StationForm, RatePlanForm, ReceiptPreview
    ui/                 Button, Field, MoneyInput, Switch, Modal, Popover, Section, …
  pages/                Dashboard, StationsPage, RatesPage, SettingsPage, DataPage
  store/                Zustand: appStore (boot), stationStore (floor), settingsStore, uiStore
  lib/                  api (typed commands), billing (mirror of Rust), currency, time,
                        legacy (localStorage hand-off), alerts, sound, rates, station
  types/                shared shapes (match src-tauri/src/models.rs)
src-tauri/
  migrations/           versioned SQL
  src/                  db (migrations), repo (sessions/checkout), admin, billing, legacy,
                        backup, bootstrap, commands, state
  tests/                integration tests + fixtures (real v0.1.0 payload, billing golden cases)
e2e/                    WebDriver tests against the real app (tauri-driver)
```

## Tests

| Layer | Command | Covers |
| --- | --- | --- |
| Rust unit + integration | `npm run test:rust` | migrations (upgrade, rollback, refusal), restart & crash recovery, invoice consistency & immutability, rate/price snapshots, legacy import + duplicate prevention, backup/restore validation |
| TypeScript | `npm test` | billing parity with Rust (shared golden fixture), input parsing, alerts, legacy hand-off |
| End-to-end (Linux) | `xvfb-run -a npm run e2e` | real WebKitGTK window: v0.1.0 → v0.2.0 upgrade, duplicate import, restart + `kill -9`, admin screens, rounding at checkout, backup → restore, floor-map drag (pointer + keyboard) persisting across restart |

E2E needs `tauri-driver` (`cargo install tauri-driver --locked`), `WebKitWebDriver`
(`webkit2gtk-driver` package) and a debug build with the embedded frontend:

```bash
npx tauri build --debug --no-bundle
```

Set `E2E_LEGACY_APP` to a v0.1.0 binary to include the upgrade scenario.

## Regenerating app icons

```bash
npx tauri icon src-tauri/icons/app-icon.svg -o src-tauri/icons
```

This also generates Android/iOS icon folders; delete them, since this is a desktop-only app.
