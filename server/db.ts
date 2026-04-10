import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    CREATE TABLE IF NOT EXISTS feedback_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      message TEXT NOT NULL,
      pageUrl TEXT,
      userAgent TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_messages_createdAt
      ON feedback_messages (createdAt DESC);

    CREATE INDEX IF NOT EXISTS idx_feedback_messages_status
      ON feedback_messages (status);
  `);
}

export default db;
