-- GameOn Timer · schema v1
--
-- Conventions
--   * Money: INTEGER Toman. Never REAL.
--   * Time:  INTEGER epoch milliseconds (UTC).
--   * Booleans: INTEGER 0/1.
--   * Anything printed on a bill is copied (snapshotted) at the moment it
--     becomes binding, so later edits to rates, products or settings never
--     rewrite history.

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

-- Single-row settings table: typed columns + CHECKs beat a key/value bag.
CREATE TABLE settings (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  store_name          TEXT    NOT NULL,
  receipt_header      TEXT    NOT NULL,
  receipt_footer      TEXT    NOT NULL,
  rounding_unit       INTEGER NOT NULL CHECK (rounding_unit BETWEEN 0 AND 1000000),
  rounding_mode       TEXT    NOT NULL CHECK (rounding_mode IN ('nearest', 'up', 'down')),
  sound_enabled       INTEGER NOT NULL CHECK (sound_enabled IN (0, 1)),
  sound_preset        TEXT    NOT NULL CHECK (sound_preset IN ('chime', 'bell', 'beep')),
  sound_volume        INTEGER NOT NULL CHECK (sound_volume BETWEEN 0 AND 100),
  alert_every_minutes INTEGER NOT NULL CHECK (alert_every_minutes BETWEEN 0 AND 1440),
  long_pause_minutes  INTEGER NOT NULL CHECK (long_pause_minutes BETWEEN 0 AND 1440),
  updated_at          INTEGER NOT NULL
);

INSERT INTO settings VALUES
  (1, 'گیم‌آن', '', 'از حضور شما سپاسگزاریم', 1000, 'nearest', 1, 'chime', 70, 60, 15, 0);

-- Pricing ------------------------------------------------------------------

CREATE TABLE rate_plans (
  id         TEXT PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Hourly price by number of controllers in use.
CREATE TABLE rate_plan_tiers (
  rate_plan_id TEXT    NOT NULL REFERENCES rate_plans (id) ON DELETE CASCADE,
  controllers  INTEGER NOT NULL CHECK (controllers BETWEEN 1 AND 8),
  hourly_rate  INTEGER NOT NULL CHECK (hourly_rate BETWEEN 0 AND 100000000),
  PRIMARY KEY (rate_plan_id, controllers)
) WITHOUT ROWID;

-- Floor --------------------------------------------------------------------

CREATE TABLE stations (
  id           TEXT PRIMARY KEY,
  name         TEXT    NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  kind         TEXT    NOT NULL CHECK (kind IN ('ps5', 'ps4', 'xbox', 'vip')),
  rate_plan_id TEXT    NOT NULL REFERENCES rate_plans (id),
  enabled      INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE products (
  id         TEXT PRIMARY KEY,
  name       TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  category   TEXT    NOT NULL CHECK (category IN ('drink', 'snack', 'food')),
  price      INTEGER NOT NULL CHECK (price BETWEEN 0 AND 100000000),
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sessions -----------------------------------------------------------------

CREATE TABLE sessions (
  id             TEXT PRIMARY KEY,
  station_id     TEXT    NOT NULL REFERENCES stations (id),
  rate_plan_id   TEXT    NOT NULL REFERENCES rate_plans (id),
  rate_plan_name TEXT    NOT NULL,
  controllers    INTEGER NOT NULL CHECK (controllers BETWEEN 1 AND 8),
  started_at     INTEGER NOT NULL,
  closed_at      INTEGER CHECK (closed_at IS NULL OR closed_at >= started_at),
  source         TEXT    NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'legacy'))
);

-- At most one open session per station, enforced by the database itself.
CREATE UNIQUE INDEX sessions_one_open_per_station ON sessions (station_id) WHERE closed_at IS NULL;

-- Rates agreed when the session started (copy of the plan's tiers).
CREATE TABLE session_rates (
  session_id  TEXT    NOT NULL REFERENCES sessions (id),
  controllers INTEGER NOT NULL CHECK (controllers BETWEEN 1 AND 8),
  hourly_rate INTEGER NOT NULL CHECK (hourly_rate >= 0),
  PRIMARY KEY (session_id, controllers)
) WITHOUT ROWID;

-- Billable play intervals. A pause closes the open segment; resuming or
-- changing the controller count opens a new one. Paused time = gaps.
CREATE TABLE session_segments (
  id          INTEGER PRIMARY KEY,
  session_id  TEXT    NOT NULL REFERENCES sessions (id),
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER CHECK (ended_at IS NULL OR ended_at >= started_at),
  controllers INTEGER NOT NULL CHECK (controllers BETWEEN 1 AND 8),
  hourly_rate INTEGER NOT NULL CHECK (hourly_rate >= 0)
);

CREATE INDEX session_segments_session ON session_segments (session_id);
CREATE UNIQUE INDEX session_segments_one_open ON session_segments (session_id) WHERE ended_at IS NULL;

-- Buffet orders on a session. Name and unit price are snapshots.
CREATE TABLE order_items (
  id         INTEGER PRIMARY KEY,
  session_id TEXT    NOT NULL REFERENCES sessions (id),
  product_id TEXT    REFERENCES products (id),
  name       TEXT    NOT NULL,
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  added_at   INTEGER NOT NULL
);

CREATE INDEX order_items_session ON order_items (session_id);

-- Billable data of a closed session is frozen.
CREATE TRIGGER sessions_no_reopen BEFORE UPDATE ON sessions
WHEN OLD.closed_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'closed sessions are immutable');
END;

CREATE TRIGGER segments_closed_session_insert BEFORE INSERT ON session_segments
WHEN (SELECT closed_at FROM sessions WHERE id = NEW.session_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'session is closed');
END;

CREATE TRIGGER segments_closed_session_update BEFORE UPDATE ON session_segments
WHEN (SELECT closed_at FROM sessions WHERE id = OLD.session_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'session is closed');
END;

CREATE TRIGGER segments_no_delete BEFORE DELETE ON session_segments
BEGIN
  SELECT RAISE(ABORT, 'segments are append-only');
END;

CREATE TRIGGER order_items_closed_session_insert BEFORE INSERT ON order_items
WHEN (SELECT closed_at FROM sessions WHERE id = NEW.session_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'session is closed');
END;

CREATE TRIGGER order_items_closed_session_update BEFORE UPDATE ON order_items
WHEN (SELECT closed_at FROM sessions WHERE id = OLD.session_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'session is closed');
END;

CREATE TRIGGER order_items_closed_session_delete BEFORE DELETE ON order_items
WHEN (SELECT closed_at FROM sessions WHERE id = OLD.session_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'session is closed');
END;

-- Invoices -----------------------------------------------------------------

CREATE TABLE invoices (
  id             TEXT PRIMARY KEY,
  number         INTEGER NOT NULL UNIQUE CHECK (number > 0),
  session_id     TEXT    NOT NULL UNIQUE REFERENCES sessions (id),
  station_id     TEXT    NOT NULL REFERENCES stations (id),
  station_name   TEXT    NOT NULL,
  station_kind   TEXT    NOT NULL,
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER NOT NULL CHECK (ended_at >= started_at),
  played_ms      INTEGER NOT NULL CHECK (played_ms >= 0),
  paused_ms      INTEGER NOT NULL CHECK (paused_ms >= 0),
  time_total     INTEGER NOT NULL CHECK (time_total >= 0),
  orders_total   INTEGER NOT NULL CHECK (orders_total >= 0),
  subtotal       INTEGER NOT NULL CHECK (subtotal = time_total + orders_total),
  rounding_unit  INTEGER NOT NULL CHECK (rounding_unit >= 0),
  rounding_mode  TEXT    NOT NULL CHECK (rounding_mode IN ('nearest', 'up', 'down')),
  rounding       INTEGER NOT NULL,
  total          INTEGER NOT NULL CHECK (total >= 0 AND total = subtotal + rounding),
  store_name     TEXT    NOT NULL,
  receipt_header TEXT    NOT NULL,
  receipt_footer TEXT    NOT NULL,
  source         TEXT    NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'legacy')),
  created_at     INTEGER NOT NULL
);

CREATE INDEX invoices_ended_at ON invoices (ended_at);

CREATE TABLE invoice_lines (
  id          INTEGER PRIMARY KEY,
  invoice_id  TEXT    NOT NULL REFERENCES invoices (id),
  position    INTEGER NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('time', 'item')),
  label       TEXT    NOT NULL,
  product_id  TEXT,
  controllers INTEGER,
  duration_ms INTEGER,
  unit_price  INTEGER NOT NULL CHECK (unit_price >= 0),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  amount      INTEGER NOT NULL CHECK (amount >= 0),
  UNIQUE (invoice_id, position),
  CHECK (kind = 'time' OR amount = unit_price * quantity),
  CHECK (kind = 'item' OR (controllers IS NOT NULL AND duration_ms IS NOT NULL AND duration_ms >= 0))
);

-- Closed invoices are financial records: never updated, never deleted.
CREATE TRIGGER invoices_no_update BEFORE UPDATE ON invoices
BEGIN
  SELECT RAISE(ABORT, 'invoices are immutable');
END;

CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices
BEGIN
  SELECT RAISE(ABORT, 'invoices are immutable');
END;

CREATE TRIGGER invoice_lines_no_update BEFORE UPDATE ON invoice_lines
BEGIN
  SELECT RAISE(ABORT, 'invoices are immutable');
END;

CREATE TRIGGER invoice_lines_no_delete BEFORE DELETE ON invoice_lines
BEGIN
  SELECT RAISE(ABORT, 'invoices are immutable');
END;

-- Legacy (localStorage) import log ------------------------------------------

-- The raw payload is always kept, whatever the outcome.
CREATE TABLE legacy_imports (
  id           INTEGER PRIMARY KEY,
  payload_hash TEXT    NOT NULL,
  payload      TEXT    NOT NULL,
  status       TEXT    NOT NULL CHECK (status IN ('imported', 'skipped', 'failed')),
  detail       TEXT    NOT NULL,
  created_at   INTEGER NOT NULL
);

-- A given payload can be imported at most once.
CREATE UNIQUE INDEX legacy_imports_once ON legacy_imports (payload_hash) WHERE status = 'imported';
