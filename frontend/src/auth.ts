import type { AuthUser } from './types';

const TOKEN_KEY = 'aegis_auth_token';
const USER_KEY = 'aegis_auth_user';

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(token: string, user: AuthUser): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.warn('Failed to save auth session to sessionStorage', err);
  }
}

export function clearStoredSession(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch (err) {
    console.warn('Failed to clear auth session', err);
  }
}

/**
 * Configure global fetch interceptor to attach Bearer token and handle 401s
 */
let interceptorInstalled = false;

export function setupFetchInterceptor(onUnauthorized?: () => void): void {
  if (interceptorInstalled) return;
  interceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Attach token to /api endpoints except health and login
    const isApi = url.startsWith('/api') || url.includes('/api/');
    const isPublic = url.startsWith('/api/health') || url.startsWith('/api/auth/login');

    if (isApi && !isPublic) {
      const token = getStoredToken();
      if (token) {
        const headers = new Headers(init.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        init = { ...init, headers };
      }
    }

    try {
      const response = await originalFetch(input, init);

      // Automatic logout on 401 (excluding login attempts)
      if (response.status === 401 && !url.includes('/api/auth/login')) {
        clearStoredSession();
        if (onUnauthorized) {
          onUnauthorized();
        }
        window.dispatchEvent(new CustomEvent('aegis:auth_expired'));
      }

      return response;
    } catch (error) {
      throw error;
    }
  };
}
