/**
 * Strict Governance — REMOVED
 *
 * System operates in full access mode. No governance blocking.
 */

export type StrictGovernanceViolation = {
  key: string;
  message: string;
  highlights: string[];
};

/** Always returns ok — governance enforcement removed. */
export const validateStrictGovernance = (
  _repo: any,
  _metadata: any,
): { ok: true } => ({ ok: true });
