import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

let dbInstance: DatabaseSync | null = null;

export function getDatabase(dbPath?: string, forceNew: boolean = false): DatabaseSync {
  if (dbInstance && !forceNew && !dbPath) {
    return dbInstance;
  }

  if (forceNew) {
    const db = new DatabaseSync(dbPath || ':memory:');
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    return db;
  }

  if (dbInstance) {
    return dbInstance;
  }

  const resolvedPath = dbPath || process.env.DATABASE_PATH || './data/governance.db';
  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  dbInstance = new DatabaseSync(resolvedPath);
  dbInstance.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return dbInstance;
}

export function logDatabaseErrorIfBusyOrLocked(err: any, context?: string): void {
  if (!err) return;
  const msg = err.message || String(err);
  const code = err.code || '';
  if (
    msg.toLowerCase().includes('busy') ||
    msg.toLowerCase().includes('locked') ||
    code.includes('BUSY') ||
    code.includes('LOCKED')
  ) {
    console.error(`[DATABASE BUSY/LOCKED ERROR] ${context ? `[${context}] ` : ''}${msg}`);
  }
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
