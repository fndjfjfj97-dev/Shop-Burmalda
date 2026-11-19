CREATE TABLE products (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL CHECK (price > 0 AND price <= 100000),
  photo TEXT NOT NULL
);
