import { Router, Request, Response } from 'express';
import { getLeadershipDashboard } from '../engine/dashboard.js';

export const dashboardRouter = Router();

// GET /api/dashboard/overview
dashboardRouter.get('/overview', (req: Request, res: Response) => {
  try {
    const fromTime = req.query.from ? parseInt(req.query.from as string, 10) : undefined;
    const toTime = req.query.to ? parseInt(req.query.to as string, 10) : undefined;

    const data = getLeadershipDashboard(fromTime, toTime);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
