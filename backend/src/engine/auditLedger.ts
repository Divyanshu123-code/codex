import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';

export interface AuditEventRow {
  id: string;
  sequence: number;
  event_type: string;
  actor_type: string;
  actor_id: string;
  agent_id: string | null;
  agent_owner_at_time?: string | null;
  policy_id?: string | null;
  policy_version?: string | null;
  resource_reference?: string | null;
  decision?: string | null;
  outcome?: string | null;
  request_id?: string | null;
  incident_id?: string | null;
  correction_id?: string | null;
  safe_details?: string | null;
  prev_hash: string | null;
  hash: string;
  timestamp: number;
}

/**
 * Deterministically compute the SHA-256 cryptographic hash of an audit event.
 * Matches canonical format: { eventId, sequence, eventType, actorType, actorId, agentId, prevHash, timestamp }
 */
export function computeAuditEventHash(event: {
  id: string;
  sequence: number;
  event_type: string;
  actor_type: string;
  actor_id: string;
  agent_id: string | null;
  prev_hash: string | null;
  timestamp: number;
}): string {
  const hashPayload = JSON.stringify({
    eventId: event.id,
    sequence: event.sequence,
    eventType: event.event_type,
    actorType: event.actor_type,
    actorId: event.actor_id,
    agentId: event.agent_id,
    prevHash: event.prev_hash,
    timestamp: event.timestamp
  });

  return crypto.createHash('sha256').update(hashPayload).digest('hex');
}

export interface ChainVerificationResult {
  valid: boolean;
  totalEvents: number;
  brokenIndex?: number;
  brokenEventId?: string;
  error?: string;
  message: string;
}

/**
 * Verify cryptographic hash-chain integrity of the audit ledger.
 * Validates sequence monotonicity, prev_hash link pointers, and payload SHA-256 integrity.
 */
export function verifyAuditChain(db?: DatabaseSync): ChainVerificationResult {
  const targetDb = db || getDatabase();
  const events = targetDb.prepare('SELECT * FROM audit_events ORDER BY sequence ASC').all() as any[];

  if (events.length === 0) {
    return {
      valid: true,
      totalEvents: 0,
      message: 'Audit log ledger is empty; chain is trivially intact.'
    };
  }

  for (let i = 0; i < events.length; i++) {
    const current = events[i];

    // Check 1: Sequence monotonicity & Genesis validation
    if (i === 0) {
      if (current.sequence !== 1) {
        return {
          valid: false,
          totalEvents: events.length,
          brokenIndex: 0,
          brokenEventId: current.id,
          error: `Genesis sequence discontinuity: expected 1, found ${current.sequence}`,
          message: `Verification failed at genesis event #${current.sequence} (${current.id})`
        };
      }
      if (current.prev_hash !== null) {
        return {
          valid: false,
          totalEvents: events.length,
          brokenIndex: 0,
          brokenEventId: current.id,
          error: `Genesis event prev_hash must be null, found "${current.prev_hash}"`,
          message: `Verification failed at genesis event #${current.sequence} (${current.id})`
        };
      }
    } else {
      const prev = events[i - 1];
      if (current.sequence !== prev.sequence + 1) {
        return {
          valid: false,
          totalEvents: events.length,
          brokenIndex: i,
          brokenEventId: current.id,
          error: `Sequence discontinuity: expected ${prev.sequence + 1}, found ${current.sequence}`,
          message: `Verification failed at event #${current.sequence} (${current.id})`
        };
      }
      if (current.prev_hash !== prev.hash) {
        return {
          valid: false,
          totalEvents: events.length,
          brokenIndex: i,
          brokenEventId: current.id,
          error: `Broken hash link: prev_hash does not match previous block hash. Expected "${prev.hash}", found "${current.prev_hash}"`,
          message: `Chain link broken at event #${current.sequence} (${current.id})`
        };
      }
    }

    // Check 2: Payload SHA-256 integrity check
    const recomputedHash = computeAuditEventHash({
      id: current.id,
      sequence: current.sequence,
      event_type: current.event_type,
      actor_type: current.actor_type,
      actor_id: current.actor_id,
      agent_id: current.agent_id || null,
      prev_hash: current.prev_hash,
      timestamp: current.timestamp
    });

    if (current.hash !== recomputedHash) {
      return {
        valid: false,
        totalEvents: events.length,
        brokenIndex: i,
        brokenEventId: current.id,
        error: `Cryptographic payload hash mismatch (tampering detected): recorded "${current.hash}", recomputed "${recomputedHash}"`,
        message: `Tamper detected at event #${current.sequence} (${current.id})`
      };
    }
  }

  return {
    valid: true,
    totalEvents: events.length,
    message: `All ${events.length} cryptographic chain links verified intact.`
  };
}

/**
 * Format audit events as standard CSV string.
 */
export function formatAuditEventsCsv(events: any[]): string {
  const headers = [
    'sequence',
    'id',
    'timestamp_iso',
    'event_type',
    'actor_type',
    'actor_id',
    'agent_id',
    'policy_id',
    'decision',
    'outcome',
    'prev_hash',
    'hash'
  ];

  const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = events.map((e) => {
    return [
      escapeCsv(e.sequence),
      escapeCsv(e.id),
      escapeCsv(new Date(e.timestamp).toISOString()),
      escapeCsv(e.event_type),
      escapeCsv(e.actor_type),
      escapeCsv(e.actor_id),
      escapeCsv(e.agent_id),
      escapeCsv(e.policy_id),
      escapeCsv(e.decision),
      escapeCsv(e.outcome),
      escapeCsv(e.prev_hash),
      escapeCsv(e.hash)
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
