import type { EaRepository } from '@/pages/dependency-view/utils/eaRepository';
import type { EaRepositoryMetadata } from '@/repository/repositoryMetadata';
import { buildGovernanceDebt } from './governanceValidation';

export type StrictGovernanceViolation = {
  key: string;
  message: string;
  highlights: string[];
};

export const validateStrictGovernance = (
  repo: EaRepository,
  metadata: Pick<EaRepositoryMetadata, 'governanceMode' | 'lifecycleCoverage'>,
): { ok: true } | { ok: false; violation: StrictGovernanceViolation } => {
  if (metadata.governanceMode !== 'Strict') return { ok: true };

  // Single source of truth: build governance debt and block save on error-level issues.
  const debt = buildGovernanceDebt(repo, new Date(), {
    lifecycleCoverage: metadata.lifecycleCoverage,
    governanceMode: 'Strict',
  });

  const mandatoryErrorCount = (debt.repoReport.summary as any)?.bySeverity?.Error ?? 0;
  const mandatoryFindingCount = debt.repoReport.summary.total ?? 0;
  const invalidRelationshipInsertCount = debt.invalidRelationshipInserts.length;
  const relationshipErrorCount = debt.relationshipReport.summary.bySeverity.Error ?? 0;
  const lifecycleTagMissingCount = debt.lifecycleTagMissingIds.length;

  const blocked =
    mandatoryErrorCount > 0 ||
    relationshipErrorCount > 0 ||
    invalidRelationshipInsertCount > 0 ||
    lifecycleTagMissingCount > 0;

  if (!blocked) return { ok: true };

  const highlights: string[] = [];
  for (const f of debt.repoReport.findings.slice(0, 5)) highlights.push(f.message);
  for (const f of debt.relationshipReport.findings.slice(0, 3)) highlights.push(f.message);
  for (const s of debt.invalidRelationshipInserts.slice(0, 3)) highlights.push(`Relationship insert: ${s}`);
  for (const id of debt.lifecycleTagMissingIds.slice(0, 3)) highlights.push(`Lifecycle tag missing: ${id}`);

  const key = `${mandatoryErrorCount}|${mandatoryFindingCount}|${invalidRelationshipInsertCount}|${relationshipErrorCount}|${lifecycleTagMissingCount}`;

  return {
    ok: false,
    violation: {
      key,
      message: 'Blocked by governance (Strict mode). Fix validation errors to proceed.',
      highlights,
    },
  };
};
