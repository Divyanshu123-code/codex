interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();
const MAX_LOGIN_ATTEMPTS_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Checks and records login attempt for rate limiting (P6: Requirement 3)
 * Returns true if allowed, false if rate limit exceeded.
 */
export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS
    });
    return true;
  }

  if (entry.count >= MAX_LOGIN_ATTEMPTS_PER_MINUTE) {
    return false;
  }

  entry.count += 1;
  return true;
}

export function resetLoginRateLimits(): void {
  loginAttempts.clear();
}
