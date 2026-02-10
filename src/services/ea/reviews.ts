import { request } from 'umi';

import type {
  ArchitectureReviewRecord,
  ArchitectureReviewUpsertInput,
  ReviewSubjectKind,
} from '../../../backend/review/ArchitectureReview';

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  errorMessage?: string;
};

export async function getArchitectureReview(subjectKind: ReviewSubjectKind, subjectId: string) {
  return request<ApiResponse<ArchitectureReviewRecord | null>>(
    `/api/reviews/${encodeURIComponent(subjectKind)}/${encodeURIComponent(subjectId)}`,
    {
      method: 'GET',
    },
  );
}

export async function putArchitectureReview(
  subjectKind: ReviewSubjectKind,
  subjectId: string,
  input: ArchitectureReviewUpsertInput,
) {
  return request<ApiResponse<ArchitectureReviewRecord | null>>(
    `/api/reviews/${encodeURIComponent(subjectKind)}/${encodeURIComponent(subjectId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: input,
    },
  );
}
