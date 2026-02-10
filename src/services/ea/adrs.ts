import { request } from 'umi';

import type {
  ArchitectureDecisionRecord,
  ArchitectureDecisionRecordUpsertInput,
} from '../../../backend/adr/ArchitectureDecisionRecord';

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  errorMessage?: string;
};

export async function listAdrs() {
  return request<ApiResponse<ArchitectureDecisionRecord[]>>('/api/adrs', {
    method: 'GET',
  });
}

export async function getAdrById(adrId: string) {
  return request<ApiResponse<ArchitectureDecisionRecord>>(`/api/adrs/${encodeURIComponent(adrId)}`, {
    method: 'GET',
  });
}

export async function createAdr(input: ArchitectureDecisionRecordUpsertInput) {
  return request<ApiResponse<ArchitectureDecisionRecord>>('/api/adrs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: input,
  });
}

export async function updateAdr(adrId: string, input: ArchitectureDecisionRecordUpsertInput) {
  return request<ApiResponse<ArchitectureDecisionRecord>>(`/api/adrs/${encodeURIComponent(adrId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: input,
  });
}

export async function deleteAdrById(adrId: string) {
  return request<ApiResponse<boolean>>(`/api/adrs/${encodeURIComponent(adrId)}`, {
    method: 'DELETE',
  });
}
