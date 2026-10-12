import jwt from 'jsonwebtoken';
import { UserRole, isValidRole } from './roles.js';

const DEV_FALLBACK_AUTH_TOKEN_SECRET = 'dev_ephemeral_insecure_auth_token_credential_demo_mode_only';

/**
 * Resolves JWT secret strictly from environment, failing fast with a clear error
 * outside DEMO_MODE or test environments (P6: Requirement 2)
 */
export function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.trim().length > 0) {
    return envSecret;
  }
  if (process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'test') {
    return DEV_FALLBACK_AUTH_TOKEN_SECRET;
  }
  throw new Error('JWT_SECRET must be configured in environment outside DEMO_MODE');
}

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Issues an 8-hour JWT containing user ID and role only (P6: Requirement 3)
 */
export function signAuthToken(user: { id: string; role: UserRole }): string {
  const secret = getJwtSecret();
  return jwt.sign(
    {
      sub: user.id,
      role: user.role
    },
    secret,
    {
      expiresIn: '8h'
    }
  );
}

/**
 * Validates and decodes the JWT, ensuring role integrity.
 */
export function verifyAuthToken(token: string): AuthTokenPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret) as any;
  if (!decoded || typeof decoded.sub !== 'string' || !isValidRole(decoded.role)) {
    throw new Error('Malformed token payload: sub and valid role required');
  }
  return {
    sub: decoded.sub,
    role: decoded.role,
    iat: decoded.iat,
    exp: decoded.exp
  };
}
