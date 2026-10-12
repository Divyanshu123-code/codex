import crypto from 'node:crypto';

/**
 * Hashes a plaintext password using node:crypto scrypt with a per-user salt (P6: Requirement 2)
 * Stored format: <salt_hex>:<derived_key_hex>
 */
export function hashPassword(password: string, customSalt?: string): string {
  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

/**
 * Verifies a password against a stored scrypt hash in timing-safe constant time.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) {
      return false;
    }
    const [salt, expectedKeyHex] = parts;
    const derivedKeyHex = crypto.scryptSync(password, salt, 64).toString('hex');
    const expectedBuffer = Buffer.from(expectedKeyHex, 'hex');
    const actualBuffer = Buffer.from(derivedKeyHex, 'hex');
    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch {
    return false;
  }
}
