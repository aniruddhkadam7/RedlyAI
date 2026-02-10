import { request } from 'umi';

import type { ArchitectureAssuranceReport } from '../../../backend/assurance/ArchitectureAssurance';

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  errorMessage?: string;
};

export async function getRepositoryAssurance(options?: Record<string, any>) {
  return request<ApiResponse<ArchitectureAssuranceReport>>('/api/repository/assurance', {
    method: 'GET',
    ...(options || {}),
  });
}
