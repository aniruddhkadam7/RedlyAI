import type { GovernanceEnforcementMode } from '../project/project';

/**
 * Governance enforcement — REMOVED.
 * Always returns Advisory (no blocking).
 */
export function getGovernanceEnforcementMode(): GovernanceEnforcementMode {
  return 'Advisory';
}

export function isGovernanceAdvisory(): boolean {
  return true;
}
