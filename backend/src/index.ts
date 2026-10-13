import dotenv from 'dotenv';
import { createApp } from './app.js';
import { getDatabase } from './db/connection.js';
import { initializeSchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';

dotenv.config();

const port = process.env.PORT || 4000;

// Ensure database and schema are initialized
const db = getDatabase();
initializeSchema(db);

const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any)?.count || 0;
if (userCount === 0) {
  console.log('🌱 Seeding initial database records...');
  seedDatabase(db);
}

const app = createApp();

const server = app.listen(Number(port), '127.0.0.1', () => {
  console.log(`🛡️  AI Governance Control Plane backend listening on http://127.0.0.1:${port}`);
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ FATAL: Port ${port} is already in use (EADDRINUSE). Another AegisOS server process is already running on 127.0.0.1:${port}. Terminating immediately.`);
    process.exit(1);
  } else {
    console.error('❌ Server startup error:', err);
    process.exit(1);
  }
});

