import dotenv from 'dotenv';
import { createApp } from './app.js';
import { getDatabase } from './db/connection.js';
import { initializeSchema } from './db/schema.js';

dotenv.config();

const port = process.env.PORT || 4000;

// Ensure database and schema are initialized
const db = getDatabase();
initializeSchema(db);

const app = createApp();

app.listen(port, () => {
  console.log(`🛡️  AI Governance Control Plane backend listening on port ${port}`);
});
