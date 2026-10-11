import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { getDatabase } from './db/connection.js';
import { seedDatabase } from './db/seed.js';
import { agentsRouter } from './routes/agents.js';
import { policiesRouter } from './routes/policies.js';
import { actionsRouter } from './routes/actions.js';
import { approvalsRouter } from './routes/approvals.js';
import { incidentsRouter } from './routes/incidents.js';
import { auditRouter } from './routes/audit.js';
import { correctionsRouter } from './routes/corrections.js';
import { tasksRouter } from './routes/tasks.js';
import { dashboardRouter } from './routes/dashboard.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Mount API routers
  app.use('/api/agents', agentsRouter);
  app.use('/api/policies', policiesRouter);
  app.use('/api/actions', actionsRouter);
  app.use('/api/approvals', approvalsRouter);
  app.use('/api/incidents', incidentsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/corrections', correctionsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/task-types', (req: Request, res: Response, next) => {
    // Map /api/task-types to tasksRouter's /types
    req.url = '/types';
    tasksRouter(req, res, next);
  });
  app.use('/api/dashboard', dashboardRouter);

  // Health check endpoint (Phase 1 deliverable)
  app.get('/api/health', (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const userCountRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
      const agentCountRow = db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };
      const policyCountRow = db.prepare('SELECT COUNT(*) as count FROM policies').get() as { count: number };
      const incidentCountRow = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE status = 'OPEN'").get() as { count: number };
      const approvalCountRow = db.prepare("SELECT COUNT(*) as count FROM approvals WHERE status = 'PENDING'").get() as { count: number };

      res.status(200).json({
        status: 'ok',
        service: 'ai-governance-control-plane',
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          users: userCountRow.count,
          agents: agentCountRow.count,
          policies: policyCountRow.count,
          openIncidents: incidentCountRow.count,
          pendingApprovals: approvalCountRow.count
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
