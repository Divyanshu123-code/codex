import { Request, Response, NextFunction } from 'express';
import { verifyAuthToken } from './jwt.js';
import { UserRole, ROLE_MAP } from './roles.js';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Validates JWT token from Authorization header and binds user identity to req.user.
 * Also enforces the read-only restriction for the 'auditor' role (P6: Requirement 4 & 5).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHENTICATED: Authentication required. Bearer token missing or malformed.',
      code: 'AUTH_REQUIRED'
    });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({
      error: 'UNAUTHENTICATED: Empty bearer token provided.',
      code: 'AUTH_REQUIRED'
    });
  }

  try {
    const payload = verifyAuthToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role
    };

    // Requirement 5: Auditor is strictly read-only (GET, HEAD, OPTIONS only)
    if (req.user.role === 'auditor' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return res.status(403).json({
        error: 'AUDITOR_READ_ONLY: Auditors have read-only access and cannot perform mutating actions.',
        code: 'FORBIDDEN_AUDITOR_MUTATION'
      });
    }

    next();
  } catch (err: any) {
    return res.status(401).json({
      error: 'INVALID_TOKEN: Token verification failed or expired.',
      details: err.message,
      code: 'TOKEN_INVALID'
    });
  }
}

/**
 * Enforces role authorization by authority level or specific allowed roles.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED: User identity not established.',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `FORBIDDEN: Operation requires one of [${allowedRoles.join(', ')}]. Current role: '${req.user.role}'.`,
        code: 'INSUFFICIENT_ROLE_AUTHORITY'
      });
    }

    next();
  };
}

export const requireAdmin = requireRole(['admin']);
export const requireReviewerOrAdmin = requireRole(['admin', 'reviewer']);
