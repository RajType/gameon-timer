-- Phase 3B · buffet inventory.
--
-- Extends the existing buffet tables instead of duplicating them:
-- `products` are the buffet items, `order_items` the buffet orders (each
-- linked to a session, with the name and unit price snapshotted).

-- Units on hand. NULL = not counted (made to order, or stock not set up yet),
-- so every existing item keeps selling after this upgrade. Never negative.
ALTER TABLE products ADD COLUMN stock_quantity INTEGER
  CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

-- Units of an order line that were taken from counted stock. Exactly these go
-- back to stock if the line is reduced before checkout.
ALTER TABLE order_items ADD COLUMN stock_units INTEGER NOT NULL DEFAULT 0
  CHECK (stock_units >= 0);

CREATE TRIGGER order_items_stock_units_insert BEFORE INSERT ON order_items
WHEN NEW.stock_units > NEW.quantity
BEGIN
  SELECT RAISE(ABORT, 'stock_units cannot exceed quantity');
END;

CREATE TRIGGER order_items_stock_units_update BEFORE UPDATE ON order_items
WHEN NEW.stock_units > NEW.quantity
BEGIN
  SELECT RAISE(ABORT, 'stock_units cannot exceed quantity');
END;
