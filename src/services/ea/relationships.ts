import { request } from 'umi';

import type { BaseArchitectureRelationship } from '../../../backend/repository/BaseArchitectureRelationship';

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  errorMessage?: string;
};

export async function getAllRelationships(options?: Record<string, any>) {
  return request<ApiResponse<BaseArchitectureRelationship[]>>('/api/relationships', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function getRelationshipsByElement(elementId: string, options?: Record<string, any>) {
  return request<ApiResponse<BaseArchitectureRelationship[]>>(`/api/relationships/by-element/${encodeURIComponent(elementId)}`, {
    method: 'GET',
    ...(options || {}),
  });
}

export async function getRelationshipsByType(relationshipType: string, options?: Record<string, any>) {
  return request<ApiResponse<BaseArchitectureRelationship[]>>(`/api/relationships/by-type/${encodeURIComponent(relationshipType)}`, {
    method: 'GET',
    ...(options || {}),
  });
}
