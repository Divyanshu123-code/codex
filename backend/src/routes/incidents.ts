import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/connection.js';
import { diagnoseIncident } from '../engine/diagnostics.js';
import { generateIncidentReport, incidentReportToMarkdown } from '../engine/incidentReport.js';

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

// Handler for running deterministic signature triage / diagnostics
function handleIncidentDiagnostics(req: Request, res: Response) {
  try {
    const result = diagnoseIncident(req.params.id);
    const recommendedAction = typeof result.proposedCorrection === 'object' && result.proposedCorrection?.description
      ? result.proposedCorrection.description
      : (typeof result.proposedCorrection === 'string' ? result.proposedCorrection : 'Submit patch confining execution scope and verify in sandbox.');

    res.json({
      ...result,
      signature_id: result.signatureId,
      root_cause: result.explanation || result.causeCategory,
      recommended_action: recommendedAction
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

// POST /api/incidents/:id/diagnose (Run bounded diagnostics)
incidentsRouter.post('/:id/diagnose', handleIncidentDiagnostics);

// POST /api/incidents/:id/triage (Closed diagnostic signature triage)
incidentsRouter.post('/:id/triage', handleIncidentDiagnostics);

// Helper for exporting After-Action Reports
function handleIncidentExport(req: Request, res: Response, forcedFormat?: 'markdown' | 'json') {
  try {
    const format = forcedFormat || (req.query.format === 'json' ? 'json' : 'markdown');
    const report = generateIncidentReport(req.params.id);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="AAR-${req.params.id}.json"`);
      return res.send(JSON.stringify(report, null, 2));
    } else {
      const md = incidentReportToMarkdown(report);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="AAR-${req.params.id}.md"`);
      return res.send(md);
    }
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
}

// GET /api/incidents/:id/export?format=markdown|json
incidentsRouter.get('/:id/export', (req: Request, res: Response) => {
  handleIncidentExport(req, res);
});

// GET /api/incidents/:id/export/markdown
incidentsRouter.get('/:id/export/markdown', (req: Request, res: Response) => {
  handleIncidentExport(req, res, 'markdown');
});

// GET /api/incidents/:id/export/json
incidentsRouter.get('/:id/export/json', (req: Request, res: Response) => {
  handleIncidentExport(req, res, 'json');
});

