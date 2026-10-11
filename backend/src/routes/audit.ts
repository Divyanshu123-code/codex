import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/connection.js';

export const auditRouter = Router();

// GET /api/audit
auditRouter.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM audit_events ORDER BY sequence DESC').all() as any[];
    const events = rows.map((r) => ({
      ...r,
      safe_details: r.safe_details ? JSON.parse(r.safe_details) : {}
    }));
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
