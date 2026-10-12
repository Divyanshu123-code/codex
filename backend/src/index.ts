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

app.listen(port, () => {
  console.log(`🛡️  AI Governance Control Plane backend listening on port ${port}`);
});
