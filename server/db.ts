import Database from 'better-sqlite3';
import path from 'path';

// Create/open SQLite database in server directory
const dbPath = path.join(__dirname, 'searches.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
export function initializeDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT,
      audience TEXT,
      topicFocus TEXT,
      generations TEXT,
      sourcesType TEXT,
      results TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export default db;
