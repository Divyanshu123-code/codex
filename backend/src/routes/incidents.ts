import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/connection.js';
import { diagnoseIncident } from '../engine/diagnostics.js';
import { generateIncidentReport } from '../engine/incidentReport.js';

export const incidentsRouter = Router();

// GET /api/incidents
incidentsRouter.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT 
        i.*,
        a.name as agent_name,
        r.operation,
        r.resource
      FROM incidents i
      LEFT JOIN agents a ON i.agent_id = a.id
      LEFT JOIN action_requests r ON i.triggering_request_id = r.id
      ORDER BY i.opened_at DESC
    `).all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/incidents/:id
incidentsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    res.json({
      ...row,
      diagnostic_result: row.diagnostic_result ? JSON.parse(row.diagnostic_result) : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/incidents/:id/report (Audit-Ready Incident Accountability Report)
incidentsRouter.get('/:id/report', (req: Request, res: Response) => {
  try {
    const report = generateIncidentReport(req.params.id);
    res.json(report);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// POST /api/incidents/:id/diagnose (Run bounded diagnostics)
incidentsRouter.post('/:id/diagnose', (req: Request, res: Response) => {
  try {
    const result = diagnoseIncident(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

