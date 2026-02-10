import { request } from 'umi';

import type { ImpactAnalysisRequest } from '../../../backend/analysis/ImpactAnalysisRequest';
import type { ImpactSummary } from '../../../backend/analysis/ImpactSummary';
import type { ImpactPath } from '../../../backend/analysis/ImpactPath';
import type { ImpactRankedElement } from '../../../backend/analysis/ImpactRanking';
import type { ImpactExplanationResult } from '../../../backend/analysis/ImpactExplanation';
import type { ImpactAnalysisAuditRecord } from '../../../backend/analysis/ImpactAudit';

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  errorMessage?: string;
};

export type ImpactAnalyzeResponse = {
  audit?: ImpactAnalysisAuditRecord | null;
  impactSummary: ImpactSummary;
  rankedImpacts: ImpactRankedElement[];
  impactPaths?: ImpactPath[];
};

export async function postImpactAnalyze(
  payload: ImpactAnalysisRequest,
  options?: {
    includePaths?: boolean;
  },
) {
  const includePaths = options?.includePaths ? 'true' : 'false';
  return request<ApiResponse<ImpactAnalyzeResponse>>(`/api/impact/analyze?includePaths=${includePaths}`, {
    method: 'POST',
    data: payload,
  });
}

export async function getImpactExplanation(params: {
  rootId: string;
  elementId: string;
  direction: ImpactAnalysisRequest['direction'];
  maxDepth: number;
  relationshipTypes: readonly string[];
}) {
  const relationshipTypes = (params.relationshipTypes ?? []).join(',');

  return request<ApiResponse<ImpactExplanationResult>>(
    `/api/impact/explanation/${encodeURIComponent(params.rootId)}/${encodeURIComponent(params.elementId)}`,
    {
      method: 'GET',
      params: {
        direction: params.direction,
        maxDepth: params.maxDepth,
        relationshipTypes,
      },
    },
  );
}
