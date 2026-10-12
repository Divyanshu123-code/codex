import { Router, Request, Response } from 'express';
import { runLiveAgent } from '../engine/liveAgent.js';
import { getDatabase } from '../db/connection.js';

export const liveAgentRouter = Router();

export const MAX_INSTRUCTION_LENGTH = 1000;
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 20; // 20 requests per minute per IP

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function resetLiveAgentRateLimit(): void {
  rateLimitStore.clear();
}

/**
 * POST /api/live-agent/run (Spec P5)
 * Takes { instruction, agentId }
 * Executes bounded live agent runner through the AegisOS gateway routeAction boundary.
 * Abuse protections:
 * - 1,000 char instruction length cap
 * - 20 req/min rate limit
 * - Token cap (512 tokens per call)
 */
liveAgentRouter.post('/run', async (req: Request, res: Response) => {
  try {
    const { instruction, agentId } = req.body;

    if (!instruction || typeof instruction !== 'string' || instruction.trim() === '') {
      return res.status(400).json({ error: 'Valid string instruction is required.' });
    }

    if (instruction.length > MAX_INSTRUCTION_LENGTH) {
      return res.status(400).json({
        error: `Instruction exceeds maximum length of ${MAX_INSTRUCTION_LENGTH} characters.`
      });
    }

    // In-memory sliding rate limiting by client IP
    const clientKey = req.ip || req.socket?.remoteAddress || 'client-default';
    const now = Date.now();
    const entry = rateLimitStore.get(clientKey);

    if (entry && now < entry.resetAt) {
      if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json({
          error: `Rate limit exceeded: maximum ${RATE_LIMIT_MAX_REQUESTS} requests per minute.`,
          retryAfterSeconds: retryAfter
        });
      }
      entry.count++;
    } else {
      rateLimitStore.set(clientKey, {
        count: 1,
        resetAt: now + RATE_LIMIT_WINDOW_MS
      });
    }

    const targetAgentId = typeof agentId === 'string' && agentId.trim() !== ''
      ? agentId.trim()
      : 'agent-finance-refund-04';

    const db = getDatabase();
    const result = await runLiveAgent(instruction.trim(), targetAgentId, db);

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Live agent run failed.' });
  }
});
