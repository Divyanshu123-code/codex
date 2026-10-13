import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeSchema } from '../src/db/schema.js';
import { seedDatabase } from '../src/db/seed.js';

describe('AegisOS 60-Second Agent Polling Load & Latency Test', () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    const db = getDatabase();
    initializeSchema(db);
    seedDatabase(db);

    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    closeDatabase();
  });

  it(
    '4 simulated agents polling for 60 seconds get no failed requests and p95 latency under 200 ms',
    async () => {
      const agents = [
        'procurement-agent-01',
        'maint-planner-01',
        'cyber-monitor-01',
        'records-agent-01'
      ];

      const apiKey = 'mock-aegis-api-key';
      const latencies: number[] = [];
      let failedRequests = 0;
      let totalRequests = 0;

      const DURATION_MS = 60_000;
      const startTime = Date.now();
      const endTime = startTime + DURATION_MS;

      // Helper function to execute an HTTP request and measure latency
      const makeRequest = async (urlPath: string, options: RequestInit = {}): Promise<void> => {
        const start = performance.now();
        try {
          const res = await fetch(`${baseUrl}${urlPath}`, {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              'x-aegis-api-key': apiKey,
              ...(options.headers || {})
            }
          });

          const durationMs = performance.now() - start;
          latencies.push(durationMs);
          totalRequests++;

          if (!res.ok) {
            failedRequests++;
            console.error(`Request failed: ${options.method || 'GET'} ${urlPath} -> HTTP ${res.status}`);
          }
        } catch (err: any) {
          const durationMs = performance.now() - start;
          latencies.push(durationMs);
          totalRequests++;
          failedRequests++;
          console.error(`Request threw error: ${options.method || 'GET'} ${urlPath} -> ${err.message}`);
        }
      };

      // Define polling loop for a single agent
      const runAgentLoop = async (agentId: string) => {
        let lastControlPoll = 0;
        let lastHeartbeat = 0;
        let lastStatusPoll = 0;
        let lastAuthorize = 0;

        while (Date.now() < endTime) {
          const now = Date.now();

          // 1. Control poll every 5 s (5000ms)
          if (now - lastControlPoll >= 5000) {
            await makeRequest(`/api/control/agents/${agentId}`);
            lastControlPoll = Date.now();
          }

          // 2. Heartbeat every 10 s (10000ms)
          if (now - lastHeartbeat >= 10000) {
            await makeRequest('/api/control/heartbeat', {
              method: 'POST',
              body: JSON.stringify({
                agentId,
                status: 'ACTIVE',
                configVersion: 'v1.0.0'
              })
            });
            lastHeartbeat = Date.now();
          }

          // 3. Request status poll every 3 s (3000ms)
          if (now - lastStatusPoll >= 3000) {
            await makeRequest('/api/governance/status/req-1791842831714-f38b7ac6');
            lastStatusPoll = Date.now();
          }

          // 4. Authorization requests periodically
          if (now - lastAuthorize >= 4000) {
            await makeRequest('/api/governance/authorize', {
              method: 'POST',
              body: JSON.stringify({
                agentId,
                operation: 'place_order',
                resource: 'default',
                parameters: { part_id: 'PRT-7701', qty: 2, amount: 250 }
              })
            });
            lastAuthorize = Date.now();
          }

          // Sleep briefly (200ms) before checking next due interval
          await new Promise((r) => setTimeout(r, 200));
        }
      };

      // Launch all 4 simulated agents concurrently
      await Promise.all(agents.map((agentId) => runAgentLoop(agentId)));

      const elapsedMs = Date.now() - startTime;
      console.log(`\n=== 60-Second Agent Polling Load Summary ===`);
      console.log(`Total Requests: ${totalRequests}`);
      console.log(`Failed Requests: ${failedRequests}`);
      console.log(`Duration Elapsed: ${(elapsedMs / 1000).toFixed(2)}s`);

      // Assertions
      expect(failedRequests).toBe(0);
      expect(totalRequests).toBeGreaterThanOrEqual(40);

      // Calculate p95 latency
      latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(latencies.length * 0.95);
      const p95Latency = latencies[p95Index];
      const p50Latency = latencies[Math.floor(latencies.length * 0.5)];
      const maxLatency = latencies[latencies.length - 1];

      console.log(`p50 Latency: ${p50Latency.toFixed(2)}ms`);
      console.log(`p95 Latency: ${p95Latency.toFixed(2)}ms`);
      console.log(`Max Latency: ${maxLatency.toFixed(2)}ms`);

      expect(p95Latency).toBeLessThan(200);
    },
    75000 // Test timeout in milliseconds
  );
});
