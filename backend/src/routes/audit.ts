import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/connection.js';
import { verifyAuditChain, formatAuditEventsCsv } from '../engine/auditLedger.js';

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

// GET /api/audit/verify - Cryptographic Hash Chain Verification
auditRouter.get('/verify', (req: Request, res: Response) => {
  try {
    const result = verifyAuditChain();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      valid: false,
      error: err.message,
      message: 'Cryptographic chain verification execution failed.'
    });
  }
});

// POST /api/audit/corrupt-demo - Demo-Only Tamper Injection
auditRouter.post('/corrupt-demo', (req: Request, res: Response) => {
  if (process.env.DEMO_MODE !== 'true') {
    return res.status(403).json({
      error: 'DEMO_MODE_REQUIRED',
      message: 'Tamper simulation is strictly forbidden outside demo environments (DEMO_MODE=true required).'
    });
  }

  try {
    const db = getDatabase();
    // Select an event to corrupt: either specified eventId, or sequence #2 (or last event if <2)
    const targetEvent = req.body?.eventId
      ? (db.prepare('SELECT * FROM audit_events WHERE id = ?').get(req.body.eventId) as any)
      : (db.prepare('SELECT * FROM audit_events WHERE sequence > 1 ORDER BY sequence ASC LIMIT 1').get() as any)
        || (db.prepare('SELECT * FROM audit_events ORDER BY sequence DESC LIMIT 1').get() as any);

    if (!targetEvent) {
      return res.status(404).json({ error: 'No audit event available to corrupt.' });
    }

    const previousHash = targetEvent.hash;
    const artificialTamperHash = 'TAMPERED_HASH_0xDEADBEEF_' + Date.now();

    // Corrupt the hash directly in SQLite
    db.prepare('UPDATE audit_events SET hash = ? WHERE id = ?').run(artificialTamperHash, targetEvent.id);

    return res.json({
      success: true,
      message: `Audit event #${targetEvent.sequence} (${targetEvent.id}) corrupted for tamper verification demonstration.`,
      corruptedEventId: targetEvent.id,
      sequence: targetEvent.sequence,
      originalHash: previousHash,
      injectedHash: artificialTamperHash
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Helper for exporting audit events
function handleAuditExport(req: Request, res: Response, forcedFormat?: 'json' | 'csv') {
  try {
    const format = forcedFormat || (req.query.format === 'csv' ? 'csv' : 'json');
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM audit_events ORDER BY sequence ASC').all() as any[];

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'csv') {
      const csvData = formatAuditEventsCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="aegis_audit_ledger_${timestampStr}.csv"`);
      return res.send(csvData);
    } else {
      const formatted = rows.map((r) => ({
        ...r,
        safe_details: r.safe_details ? JSON.parse(r.safe_details) : {}
      }));
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="aegis_audit_ledger_${timestampStr}.json"`);
      return res.send(JSON.stringify(formatted, null, 2));
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// GET /api/audit/export?format=json|csv
auditRouter.get('/export', (req: Request, res: Response) => {
  handleAuditExport(req, res);
});

// GET /api/audit/export/json
auditRouter.get('/export/json', (req: Request, res: Response) => {
  handleAuditExport(req, res, 'json');
});

// GET /api/audit/export/csv
auditRouter.get('/export/csv', (req: Request, res: Response) => {
  handleAuditExport(req, res, 'csv');
});
