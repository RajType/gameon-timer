# GameOn Timer & POS

Desktop console-center manager for GameOn: station timers, session control
(start / pause / resume / controller count), buffet tabs and inventory,
checkout billing, store branding and admin settings. Persian UI, strictly RTL, Apple-inspired dark theme.

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

**نقشه‌ی سالن** (sidebar) is the live, read-only floor view: every station at
its saved position with the dashboard's own card — live timer and cost, start,
buffet and checkout through the same invoice dialog. Nothing can be moved
there and nothing is written on timer ticks. Tab follows the visual
right-to-left reading order, and on narrower windows the board shrinks to fit
(down to 70%, then scrolls) without changing any saved coordinate.

**ایستگاه‌ها → ویرایش چیدمان** is the layout editor (`@dnd-kit/core`).
Drag a card, or focus it and use Space / arrow keys / Space; the position is
saved immediately (`update_station_position`). Coordinates are physical room
positions in px from the board's top-left, so the board is not mirrored for
RTL (the cards are). `0, 0` means "not placed yet": such stations are shown in a
default right-to-left grid until moved.

### Buffet & inventory

**بوفه** (sidebar) lists the buffet items (`products`) with price and stock,
orders an item onto a station's open session, and adds or edits items. Orders
are `order_items` rows on that session, so they appear on its live total and
as invoice lines; name and unit price are snapshotted at order time.

- **Stock never goes negative**: a database `CHECK`, plus a conditional
  decrement in the same transaction as the order (`add_order_item`).
- **Orders need an active session** (running or paused); unknown or closed
  sessions are rejected, and a closed session's orders are frozen by triggers.
- `stock_quantity` `NULL` = not counted (always available) — what every item
  starts as after the 0003 upgrade, so nothing becomes unsellable. Reducing an
  order line returns to stock exactly the units that were taken from it.
- The stock field in the item form is a count of what is on hand now (stocktake).

### Branding & categories

**تنظیمات → برند** sets the store name (sidebar and receipt header), the brand
colour and a logo. They are saved with the rest of the settings
(`update_settings`).

- **Brand colour** drives the whole UI through CSS variables:
  - `applyBranding()` sets `--brand-color` and `--brand-contrast` on `:root`.
  - Tailwind's `brand` tokens (`bg-brand`, `text-brand`, `brand-300…700`) are
    derived from those variables with `color-mix`. No component hard-codes the
    gold.
  - Text on brand surfaces switches between black and white for contrast, and
    a warning appears when a colour is hard to read on the dark canvas.
  - While editing, the colour previews live. Leaving without saving restores
    the saved colour.
  - The saved colour is cached locally and applied before the first render, so
    a restart does not flash gold.
- **Logo**:
  - The file is chosen with the native dialog (`pick_logo_file`), and only its
    absolute path is stored.
  - Rust validates the path (absolute; png/jpg/webp/gif/svg; at most 2 MB).
  - The image is served to the UI as a `data:` URL (`read_logo`), so no extra
    file-system scope is opened.
  - A missing file shows an error in settings. It never blocks the app.
- **Storage.** The settings live in the existing typed `settings` row (columns
  `brand_color` and `logo_path`), not in a separate key/value table.

**Categories** are a `categories` table (name, colour). `products.category_id`
is nullable, and `NULL` means uncategorised.

- They are managed under **تنظیمات → دسته‌بندی کالا**.
- **بوفه** filters by category and has a «بدون دسته» view. Selected items can
  be moved to another category, or out of all of them, in one request
  (`assign_products_category`).
- Re-categorising is all-or-nothing, in one transaction:
  - A bulk move with one unknown item changes nothing.
  - Deleting a category moves its items to the chosen target first.
  - `ON DELETE SET NULL` is only a safety net.
- Uncategorised items sell, order and invoice exactly like the others.
- **Upgrading to 0004.** The old fixed `category` values (drink/snack/food)
  become the categories «نوشیدنی», «تنقلات» and «غذا», with every item keeping
  its group.

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
    buffet/             BuffetOrderModal, ProductForm, StockBadge, CategoryDot
    admin/              StationForm, RatePlanForm, ReceiptPreview, BrandingSection, CategoryManager
    ui/                 Button, Field, MoneyInput, ColorField, Switch, Modal, Popover, Section, …
  pages/                Dashboard, FloorPage, BuffetPage, StationsPage, RatesPage, SettingsPage, DataPage
  store/                Zustand: appStore (boot), stationStore (floor), settingsStore, uiStore
  lib/                  api (typed commands), billing (mirror of Rust), currency, time,
                        legacy (localStorage hand-off), alerts, sound, rates, station,
                        buffet (stock + category helpers), branding (CSS variables, contrast)
  types/                shared shapes (match src-tauri/src/models.rs)
src-tauri/
  migrations/           versioned SQL
  src/                  db (migrations), repo (sessions/checkout), admin, billing, legacy,
                        backup, bootstrap, logo (path validation, data URL), commands, state
  tests/                integration tests + fixtures (real v0.1.0 payload, billing golden cases)
e2e/                    WebDriver tests against the real app (tauri-driver)
```

## Tests

| Layer | Command | Covers |
| --- | --- | --- |
| Rust unit + integration | `npm run test:rust` | migrations (upgrade, rollback, refusal), restart & crash recovery, invoice consistency & immutability, rate/price snapshots, legacy import + duplicate prevention, backup/restore validation, buffet stock (never negative, active session only, returns, invoice lines, v2 → v3 upgrade), branding & categories (v3 → v4 upgrade keeps every item's group, colour/logo validation, category CRUD, atomic delete-with-reassign and bulk move, uncategorised items still sell) |
| TypeScript | `npm test` | billing parity with Rust (shared golden fixture), input parsing, alerts, legacy hand-off, layout helpers, double-submission guards, live floor map, buffet and category filter/bulk move, branding (CSS variables, contrast, startup cache), settings brand + category panels (jsdom) |
| End-to-end (Linux) | `xvfb-run -a npm run e2e` | real WebKitGTK window: v0.1.0 → v0.2.0 upgrade, duplicate import, restart + `kill -9`, admin screens, rounding at checkout, backup → restore, floor-map drag (pointer + keyboard) persisting across restart, live floor map (read-only, start/checkout once, keyboard, window resize), buffet (stock, order on an open session, sold out, invoice line, restart), branding & categories (live brand colour on the real UI, store name, logo, category CRUD, delete with reassign, bulk move, filter, restart) |

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
