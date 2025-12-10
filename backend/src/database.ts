import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '../data/database.sqlite'));

export const initDatabase = () => {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      profile_picture TEXT,
      catalog_connected INTEGER DEFAULT 0,
      catalog_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Products table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      sku TEXT,
      title TEXT,
      description TEXT,
      price REAL,
      image_url TEXT,
      catalog_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Generated posts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS generated_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      product_id TEXT,
      type TEXT,
      content TEXT,
      media_url TEXT,
      status TEXT DEFAULT 'draft',
      shared_to_facebook INTEGER DEFAULT 0,
      shared_to_instagram INTEGER DEFAULT 0,
      facebook_post_id TEXT,
      instagram_post_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Checkout sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkout_sessions (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      checkout_url TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  console.log('✅ Database initialized');
};

export default db;

