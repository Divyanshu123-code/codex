import crypto from 'node:crypto';

// In-memory synthetic protected environment state
export interface SyntheticStorageState {
  documents: Map<string, string>;
  reports: Map<string, string>;
  archive: Map<string, string>;
}

const syntheticState: SyntheticStorageState = {
  documents: new Map<string, string>([
    ['synthetic://documents/defense_intel_brief_2026.txt', 'CONFIDENTIAL SYNTHETIC INTEL: Regional satellite monitoring report v2.1'],
    ['synthetic://documents/sample_brief.txt', 'Standard synthetic briefing memo for evaluation.']
  ]),
  reports: new Map<string, string>(),
  archive: new Map<string, string>()
};

export function getSyntheticStorageState(): { documents: Record<string, string>; reports: Record<string, string>; archive: Record<string, string> } {
  return {
    documents: Object.fromEntries(syntheticState.documents),
    reports: Object.fromEntries(syntheticState.reports),
    archive: Object.fromEntries(syntheticState.archive)
  };
}

export function resetSyntheticStorage(): void {
  syntheticState.documents = new Map<string, string>([
    ['synthetic://documents/defense_intel_brief_2026.txt', 'CONFIDENTIAL SYNTHETIC INTEL: Regional satellite monitoring report v2.1'],
    ['synthetic://documents/sample_brief.txt', 'Standard synthetic briefing memo for evaluation.']
  ]);
  syntheticState.reports.clear();
  syntheticState.archive.clear();
}

// PRIVATE TOOLS - NEVER EXPORTED DIRECTLY (No bypass invariant)
function _toolReadFile(resource: string): { content: string; byteCount: number } {
  const content = syntheticState.documents.get(resource);
  if (!content) {
    throw new Error(`Synthetic document not found: ${resource}`);
  }
  return { content, byteCount: Buffer.byteLength(content) };
}

function _toolWriteSummary(resource: string, params: any): { writtenResource: string; summaryLength: number } {
  const summary = `Generated Summary for ${resource}: Analysis completed at ${new Date().toISOString()}`;
  syntheticState.reports.set(resource, summary);
  return { writtenResource: resource, summaryLength: summary.length };
}

function _toolArchiveFile(resource: string): { archivedResource: string; status: string } {
  const content = syntheticState.documents.get(resource);
  if (!content) {
    throw new Error(`Synthetic document to archive not found: ${resource}`);
  }
  syntheticState.archive.set(resource, content);
  return { archivedResource: resource, status: 'ARCHIVED' };
}

function _toolDeleteFile(resource: string): { deletedResource: string; status: string } {
  const exists = syntheticState.documents.has(resource);
  if (!exists) {
    throw new Error(`Target document not found for deletion: ${resource}`);
  }
  syntheticState.documents.delete(resource);
  return { deletedResource: resource, status: 'DELETED' };
}

export function generateExecutionToken(requestId: string, operation: string, resource: string, secret: string): string {
  return crypto.createHmac('sha256', secret)
    .update(`${requestId}:${operation}:${resource}`)
    .digest('hex');
}

export function verifyExecutionToken(token: string, requestId: string, operation: string, resource: string, secret: string): boolean {
  const expected = generateExecutionToken(requestId, operation, resource, secret);
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

/**
 * THE ONLY EXPORTED EXECUTION FUNCTION.
 * Protected by signed execution tokens issued exclusively by the gateway.
 */
export function executeProtectedTool(
  token: string,
  requestId: string,
  operation: string,
  resource: string,
  params: any = {},
  gatewaySecret: string
): { success: boolean; result: any; durationMs: number } {
  const start = Date.now();

  // Enforce signed execution token
  try {
    if (!verifyExecutionToken(token, requestId, operation, resource, gatewaySecret)) {
      throw new Error('INVALID_EXECUTION_TOKEN: Unauthorized bypass attempt detected.');
    }
  } catch (err: any) {
    throw new Error(`UNAUTHORIZED_TOOL_INVOCATION: ${err.message}`);
  }

  let result: any;
  switch (operation) {
    case 'read_file':
      result = _toolReadFile(resource);
      break;
    case 'write_summary':
      result = _toolWriteSummary(resource, params);
      break;
    case 'archive_file':
      result = _toolArchiveFile(resource);
      break;
    case 'delete_file':
      result = _toolDeleteFile(resource);
      break;
    case 'export_dataset':
      result = { exportedResource: resource, recordsCount: 1, exportedAt: new Date().toISOString() };
      break;
    default:
      throw new Error(`Unknown protected operation: ${operation}`);
  }

  return {
    success: true,
    result,
    durationMs: Date.now() - start
  };
}
