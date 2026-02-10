import { request } from 'umi';

import type { InteroperabilityReadinessResult } from '../../../backend/interoperability';
import type { ExportScope } from '../../../backend/interoperability/ExportScope';

export type ReadinessApiResponse<T> = {
  success: boolean;
  data: T;
  errorMessage?: string;
};

export type ReadinessCheckRequest = {
  scope?: ExportScope;
  includeGovernanceChecks?: boolean;
  nowIso?: string;
};

export async function runInteroperabilityReadinessCheck(
  body: ReadinessCheckRequest,
  options?: Record<string, any>,
) {
  return request<ReadinessApiResponse<InteroperabilityReadinessResult>>('/api/interoperability/readiness/check', {
    method: 'POST',
    data: body,
    ...(options || {}),
  });
}
