CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  buyer_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  shipping TEXT NOT NULL CHECK (shipping IN ('nova', 'ukr')),
  items TEXT NOT NULL,
  created TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);
--> statement-breakpoint
CREATE INDEX orders_buyer ON orders (buyer_hash, created);
--> statement-breakpoint
CREATE INDEX orders_recent ON orders (created);
--> statement-breakpoint
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders (id),
  role TEXT NOT NULL CHECK (role IN ('buyer', 'seller')),
  message TEXT NOT NULL,
  created TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX messages_order ON messages (order_id, id);
