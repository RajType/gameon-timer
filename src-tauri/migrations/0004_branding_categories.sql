-- Phase 3C · dynamic branding & product categories.

-- Branding joins the existing single-row, typed `settings` table, which
-- already holds `store_name` (printed on receipts). Colours are stored as
-- lowercase #rrggbb.
ALTER TABLE settings ADD COLUMN brand_color TEXT NOT NULL DEFAULT '#d4af37'
  CHECK (brand_color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]');

-- Absolute path of the logo image ('' = no logo).
ALTER TABLE settings ADD COLUMN logo_path TEXT NOT NULL DEFAULT '';

-- Product categories (replaces the fixed drink / snack / food list).
CREATE TABLE categories (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  color TEXT NOT NULL CHECK (color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')
);

INSERT INTO categories (id, name, color) VALUES
  (1, 'نوشیدنی', '#64d2ff'),
  (2, 'تنقلات', '#bf5af2'),
  (3, 'غذا', '#ff6482');

-- NULL = uncategorised; such products keep working everywhere.
ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL;

-- Every existing product keeps its grouping.
UPDATE products SET category_id = CASE category
  WHEN 'drink' THEN 1
  WHEN 'snack' THEN 2
  WHEN 'food' THEN 3
END;

ALTER TABLE products DROP COLUMN category;

CREATE INDEX products_category ON products (category_id);
