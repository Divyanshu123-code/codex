import request from 'supertest';
import { signAuthToken } from '../../src/auth/jwt.js';
import { UserRole } from '../../src/auth/roles.js';

/**
 * Returns a signed JWT token directly for unit testing (P6: Requirement 8)
 */
export function getAuthToken(role: UserRole = 'admin', userId?: string): string {
  const id = userId || (role === 'admin' ? 'usr-admin' : role === 'reviewer' ? 'usr-reviewer' : 'usr-auditor');
  return signAuthToken({ id, role });
}

/**
 * Returns the HTTP Authorization header object with a valid Bearer token
 */
export function authHeader(role: UserRole = 'admin', userId?: string): { Authorization: string } {
  return { Authorization: `Bearer ${getAuthToken(role, userId)}` };
}

/**
 * Logs in as a seeded demo user through the real POST /api/auth/login endpoint
 * and returns the issued JWT string.
 */
export async function loginAs(
  app: any,
  username: 'admin' | 'reviewer' | 'auditor' = 'admin',
  password = 'password123'
): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });

  if (res.status !== 200 || !res.body.token) {
    throw new Error(`Failed to login as ${username}: status ${res.status} body: ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

/**
 * Creates a Supertest agent pre-authenticated with a signed JWT token
 */
export function createAuthedAgent(app: any, role: UserRole = 'admin', userId?: string) {
  const agent = request.agent(app);
  agent.set(authHeader(role, userId));
  return agent;
}

/**
 * Creates an intelligent authed request wrapper that dynamically attaches
 * valid JWT tokens for the role/user being tested (P6: Requirement 8)
 */
export function createDynamicAuthedRequest(appInstance: any) {
  const reqObj: any = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    reqObj[method] = (url: string) => {
      const call = request(appInstance)[method](url);
      const originalSend = call.send.bind(call);

      // Default header for GET / parameterless requests
      call.set(authHeader('admin', 'usr-admin'));

      call.send = (body: any) => {
        let role: UserRole = 'admin';
        let userId = 'usr-admin';
        if (body && typeof body === 'object') {
          if (body.actor && body.actor.id) {
            userId = body.actor.id;
            role = body.actor.role || 'admin';
          } else if (body.approverId) {
            userId = body.approverId;
            role = body.approverRole || (userId.includes('admin') ? 'admin' : 'reviewer');
          } else if (body.userId) {
            userId = body.userId;
            role = (userId.includes('admin') ? 'admin' : 'reviewer');
          }
        }
        call.set(authHeader(role, userId));
        return originalSend(body);
      };

      return call;
    };
  }
  return reqObj;
}
