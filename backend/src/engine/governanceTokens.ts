import crypto from 'node:crypto';

export interface TokenClaims {
  sub: string;       // agentId
  req: string;       // requestId
  op: string;        // operation
  res: string;       // resource
  ph: string;        // sha256 hex of canonical parameters
  nonce: string;     // unique single-use nonce
  iat: number;       // issued at (epoch ms)
  exp: number;       // expires at (epoch ms)
  iss: string;       // issuer (e.g. 'AegisOS')
}

export function canonicalJson(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`);
  return '{' + pairs.join(',') + '}';
}

export function computeParamsHash(params: any): string {
  const canonical = canonicalJson(params ?? {});
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function generateGovernanceToken(claims: TokenClaims, secret: string): string {
  const payloadStr = JSON.stringify(claims);
  const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  return `${payloadB64}.${signature}`;
}

export interface VerificationResult {
  valid: boolean;
  claims?: TokenClaims;
  error?: string;
}

export function parseAndVerifyGovernanceToken(token: string, secret: string): VerificationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'MISSING_OR_INVALID_TOKEN' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'MALFORMED_TOKEN_STRUCTURE' };
  }

  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  if (signature.length !== expectedSig.length) {
    return { valid: false, error: 'SIGNATURE_MISMATCH' };
  }
  const sigMatch = crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSig, 'utf8'));
  if (!sigMatch) {
    return { valid: false, error: 'SIGNATURE_MISMATCH' };
  }

  try {
    const jsonStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const claims: TokenClaims = JSON.parse(jsonStr);
    return { valid: true, claims };
  } catch {
    return { valid: false, error: 'INVALID_TOKEN_PAYLOAD' };
  }
}
