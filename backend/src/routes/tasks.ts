import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/connection.js';
import { allocateTask, escalateTask } from '../engine/allocation.js';

export const tasksRouter = Router();

// GET /api/tasks/types (or /api/task-types)
tasksRouter.get('/types', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM task_types ORDER BY name ASC').all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks
tasksRouter.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const handlerFilter = req.query.handler as string | undefined;

    let query = `
      SELECT t.*, a.name as assigned_agent_name
      FROM tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
    `;
    const params: any[] = [];

    if (handlerFilter) {
      query += ' WHERE t.handler = ?';
      params.push(handlerFilter);
    }

    query += ' ORDER BY t.created_at DESC';

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks (Intake and deterministic allocation)
tasksRouter.post('/', (req: Request, res: Response) => {
  try {
    const { title, task_type, description, payload, target_agent_id, requested_operation } = req.body;

    if (!title || !task_type) {
      return res.status(400).json({ error: 'Missing required fields: title, task_type' });
    }

    const actorId = (req.headers['x-actor-id'] as string) || 'operator-01';
    const actorType = (req.headers['x-actor-type'] as any) || 'human';

    const result = allocateTask(
      {
        title,
        task_type,
        description: description || '',
        payload,
        target_agent_id,
        requested_operation
      },
      { type: actorType, id: actorId }
    );

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/tasks/:id/escalate
tasksRouter.post('/:id/escalate', (req: Request, res: Response) => {
  try {
    const { reason, target_role } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Escalation reason is required' });
    }

    const actorId = (req.headers['x-actor-id'] as string) || 'operator-01';
    const actorType = (req.headers['x-actor-type'] as any) || 'human';

    escalateTask(
      req.params.id,
      reason,
      target_role || 'reviewer',
      { type: actorType, id: actorId }
    );

    res.json({ success: true, taskId: req.params.id, message: 'Task escalated successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
