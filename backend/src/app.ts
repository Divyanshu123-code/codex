import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { getDatabase } from './db/connection.js';
import { seedDatabase } from './db/seed.js';
import { agentsRouter } from './routes/agents.js';
import { policiesRouter } from './routes/policies.js';
import { actionsRouter } from './routes/actions.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Mount API routers
  app.use('/api/agents', agentsRouter);
  app.use('/api/policies', policiesRouter);
  app.use('/api/actions', actionsRouter);

  // Health check endpoint (Phase 1 deliverable)
  app.get('/api/health', (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const userCountRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
      const agentCountRow = db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };
      const policyCountRow = db.prepare('SELECT COUNT(*) as count FROM policies').get() as { count: number };

      res.status(200).json({
        status: 'ok',
        service: 'ai-governance-control-plane',
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          users: userCountRow.count,
          agents: agentCountRow.count,
          policies: policyCountRow.count
        }
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Demo reset endpoint (FR-12 demo requirement)
  app.post('/api/demo/reset', (req: Request, res: Response) => {
    try {
      seedDatabase();
      res.status(200).json({
        success: true,
        message: 'Demo environment reset to baseline synthetic state',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return app;
}
