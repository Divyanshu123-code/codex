export type UserRole = 'admin' | 'reviewer' | 'auditor';

export interface RoleDefinition {
  role: UserRole;
  label: string;
  authority_level: number;
  description: string;
}

/**
 * Central Role Map (P6: Section 3.1 & RBAC Engine)
 * Defines internal role values, display labels, and authority levels.
 * authority_level:
 *   auditor: 0 (Read-only inspection and audit trail analysis)
 *   reviewer: 1 (Approval and rejection authority for gated requests)
 *   admin: 2 (Full administrative control, agent lifecycle, correction application, and disaster recovery)
 */
export const ROLE_MAP: Record<UserRole, RoleDefinition> = {
  auditor: {
    role: 'auditor',
    label: 'Inspector',
    authority_level: 0,
    description: 'Read-only inspection, telemetry, and audit trail analysis'
  },
  reviewer: {
    role: 'reviewer',
    label: 'Duty Officer',
    authority_level: 1,
    description: 'Human-on-the-loop clearance authority for gated operations up to Tier 1'
  },
  admin: {
    role: 'admin',
    label: 'Commander / System Authority',
    authority_level: 2,
    description: 'System-wide command authority, agent lifecycle, correction application, and recovery'
  }
};

export function isValidRole(role: string): role is UserRole {
  return role === 'admin' || role === 'reviewer' || role === 'auditor';
}
