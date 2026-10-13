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
import { governanceRouter, controlRouter, governanceAuthMiddleware } from './routes/governance.js';
import { integrationRouter } from './routes/integration.js';
import { requireAuth } from './auth/middleware.js';

export function createApp(): Express {
  const app = express();

  // P6: Restrict CORS to frontend origin from env variable
  const allowedOrigins = new Set([
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4100'
  ]);
  if (process.env.CORS_ORIGIN) allowedOrigins.add(process.env.CORS_ORIGIN);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin) || process.env.NODE_ENV === 'test') {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true
  }));

  app.use(express.json());

  // Request timing logs
  app.use((req: Request, res: Response, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      console.log(`[HTTP ${req.method} ${req.originalUrl}] ${res.statusCode} in ${durationMs}ms`);
    });
    next();
  });

  // Public Endpoints
  // 1. Health check endpoint (Phase 1 deliverable, public)
  const healthCheckHandler = (req: Request, res: Response) => {
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
  };

  app.get('/api/health', healthCheckHandler);
  app.get('/health', healthCheckHandler);

  // 2. Auth router (login, me, demo-users)
  app.use('/api/auth', authRouter);

  // 3. Host-site & Agent Governance Integration Routes (API Key Authenticated)
  app.use('/api/governance', governanceAuthMiddleware, governanceRouter);
  app.use('/api/control', governanceAuthMiddleware, controlRouter);
  app.use('/api/integration', integrationRouter);

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

  // Database busy/locked error logger & general error handler
  app.use((err: any, req: Request, res: Response, next: any) => {
    if (err) {
      const msg = err.message || String(err);
      const code = err.code || '';
      if (
        msg.toLowerCase().includes('busy') ||
        msg.toLowerCase().includes('locked') ||
        code.includes('BUSY') ||
        code.includes('LOCKED')
      ) {
        console.error(`[DATABASE BUSY/LOCKED ERROR] on ${req.method} ${req.originalUrl}: ${msg}`);
      }
    }
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.code || 'INTERNAL_ERROR', message: err.message });
  });

  return app;
}
