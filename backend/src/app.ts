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
import { backupsRouter } from './routes/backups.js';
import { demoRouter } from './routes/demo.js';
import { debugRouter } from './routes/debug.js';
import { liveAgentRouter } from './routes/liveAgent.js';
import { authRouter } from './routes/auth.js';
import { requireAuth } from './auth/middleware.js';

export function createApp(): Express {
  const app = express();

  // P6: Restrict CORS to frontend origin from env variable
  const allowedOrigin = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || origin === allowedOrigin || process.env.NODE_ENV === 'test') {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true
  }));

  app.use(express.json());

  // Public Endpoints
  // 1. Health check endpoint (Phase 1 deliverable, public)
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

  // 2. Auth router (login, me, demo-users)
  app.use('/api/auth', authRouter);

  // Authenticated Endpoints (P6: requireAuth middleware protects all operational surfaces)
  app.use('/api', requireAuth);

  // Mount operational API routers
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
  app.use('/api/backups', backupsRouter);
  app.use('/api/demo', demoRouter);
  app.use('/api/debug', debugRouter);
  app.use('/api/live-agent', liveAgentRouter);

  return app;
}
