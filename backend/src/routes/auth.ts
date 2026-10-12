import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { verifyPassword } from '../auth/crypto.js';
import { signAuthToken } from '../auth/jwt.js';
import { ROLE_MAP, isValidRole } from '../auth/roles.js';
import { checkLoginRateLimit } from '../auth/rateLimit.js';
import { requireAuth } from '../auth/middleware.js';
import { writeAuditEvent } from '../engine/gateway.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
});

/**
 * POST /api/auth/login - Issues 8h JWT for seeded users (P6: Requirement 1, 2, 3)
 */
authRouter.post('/login', (req: Request, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';

  // 1. Rate Limiting Check (10 attempts per minute per IP)
  if (!checkLoginRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'TOO_MANY_ATTEMPTS: Login rate limit exceeded (max 10 attempts per minute). Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid login payload',
      details: parsed.error.format()
    });
  }

  const { username, password } = parsed.data;
  const db = getDatabase();

  const userRow = db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?').get(username) as any;

  // 2. Credential Verification
  if (!userRow || !verifyPassword(password, userRow.password_hash)) {
    // Log failed login audit event
    try {
      writeAuditEvent({
        eventType: 'AUTH_LOGIN_FAILED',
        actorType: 'human',
        actorId: userRow ? userRow.id : 'unknown',
        agentId: null,
        agentOwner: null,
        policyId: null,
        policyVersion: null,
        resourceReference: null,
        decision: 'BLOCK',
        outcome: 'UNAUTHORIZED',
        requestId: null,
        incidentId: null,
        correctionId: null,
        safeDetails: { username, clientIp, reason: 'Invalid username or password' }
      }, db);
    } catch {
      // Non-blocking audit write failure
    }

    return res.status(401).json({
      error: 'Invalid username or password.',
      code: 'INVALID_CREDENTIALS'
    });
  }

  if (!isValidRole(userRow.role)) {
    return res.status(500).json({
      error: `User has corrupted role: ${userRow.role}`,
      code: 'INVALID_USER_ROLE'
    });
  }

  // 3. Issue Token (8 hours, user ID and role only)
  const token = signAuthToken({
    id: userRow.id,
    role: userRow.role
  });

  // 4. Log successful login audit event
  try {
    writeAuditEvent({
      eventType: 'AUTH_LOGIN_SUCCESS',
      actorType: 'human',
      actorId: userRow.id,
      agentId: null,
      agentOwner: null,
      policyId: null,
      policyVersion: null,
      resourceReference: null,
      decision: 'ALLOW',
      outcome: 'SUCCESS',
      requestId: null,
      incidentId: null,
      correctionId: null,
      safeDetails: { username: userRow.username, role: userRow.role, clientIp }
    }, db);
  } catch {
    // Non-blocking audit write failure
  }

  const roleDef = ROLE_MAP[userRow.role as keyof typeof ROLE_MAP] || ROLE_MAP.auditor;

  // 5. Response payload strictly strips password_hash
  return res.json({
    token,
    user: {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      label: roleDef.label,
      authority_level: roleDef.authority_level
    }
  });
});

/**
 * GET /api/auth/me - Returns authenticated user profile
 */
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  const db = getDatabase();
  const userRow = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!userRow) {
    return res.status(404).json({ error: 'User record not found.' });
  }

  const roleDef = ROLE_MAP[userRow.role as keyof typeof ROLE_MAP];
  res.json({
    user: {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      label: roleDef ? roleDef.label : userRow.role,
      authority_level: roleDef ? roleDef.authority_level : 0
    }
  });
});

/**
 * GET /api/auth/demo-users - Returns demo user credentials for UI quick switcher (DEMO_MODE only)
 */
authRouter.get('/demo-users', (req: Request, res: Response) => {
  if (process.env.DEMO_MODE !== 'true') {
    return res.status(403).json({ error: 'Demo users list is disabled outside DEMO_MODE.' });
  }

  const db = getDatabase();
  const users = db.prepare('SELECT id, username, role FROM users').all() as any[];

  res.json({
    demoMode: true,
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      label: u.id === 'usr-admin-2' ? 'Secondary Commander (2nd Authority)' : (ROLE_MAP[u.role as keyof typeof ROLE_MAP]?.label || u.role),
      authority_level: ROLE_MAP[u.role as keyof typeof ROLE_MAP]?.authority_level || 0,
      demoPassword: 'password123'
    }))
  });
});
