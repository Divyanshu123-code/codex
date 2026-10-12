import { Router, Request, Response } from 'express';
import { runDebugAgent, getDebugHistory } from '../engine/debugAgent.js';
import { getDatabase } from '../db/connection.js';

export const debugRouter = Router();

// POST /api/debug/:incidentId/run (Run bounded closed-loop Debug Agent v2)
debugRouter.post('/:incidentId/run', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const incident = db.prepare('SELECT id FROM incidents WHERE id = ?').get(req.params.incidentId);
    if (!incident) {
      return res.status(404).json({ error: `Incident ${req.params.incidentId} not found.` });
    }

    const actor = {
      type: (req.body?.actorType as 'human' | 'system') || 'human',
      id: req.body?.actorId || (req.headers['x-actor-id'] as string) || 'debug-operator'
    };

    const options = {
      forceLLM: !!req.body?.forceLLM
    };

    const result = await runDebugAgent(req.params.incidentId, actor, db, options);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/debug/:incidentId (Retrieve debug run telemetry and attempt history)
debugRouter.get('/:incidentId', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const incident = db.prepare('SELECT id FROM incidents WHERE id = ?').get(req.params.incidentId);
    if (!incident) {
      return res.status(404).json({ error: `Incident ${req.params.incidentId} not found.` });
    }

    const history = getDebugHistory(req.params.incidentId, db);
    res.json({
      incidentId: req.params.incidentId,
      runsCount: history.length,
      latestRun: history[0] || null,
      runs: history
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
