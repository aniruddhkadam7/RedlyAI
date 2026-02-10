import { request } from 'umi';

import type { Application } from '../../../backend/repository/Application';
import type { BusinessProcess } from '../../../backend/repository/BusinessProcess';
import type { Capability } from '../../../backend/repository/Capability';
import type { Programme } from '../../../backend/repository/Programme';
import type { Technology } from '../../../backend/repository/Technology';

export type RepositoryApiResponse<T> = {
  success: boolean;
  data: T;
  errorMessage?: string;
};

export async function getRepositoryCapabilities(options?: Record<string, any>) {
  return request<RepositoryApiResponse<Capability[]>>('/api/repository/capabilities', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function getRepositoryProcesses(options?: Record<string, any>) {
  return request<RepositoryApiResponse<BusinessProcess[]>>('/api/repository/processes', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function getRepositoryApplications(options?: Record<string, any>) {
  return request<RepositoryApiResponse<Application[]>>('/api/repository/applications', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function getRepositoryTechnologies(options?: Record<string, any>) {
  return request<RepositoryApiResponse<Technology[]>>('/api/repository/technologies', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function getRepositoryProgrammes(options?: Record<string, any>) {
  return request<RepositoryApiResponse<Programme[]>>('/api/repository/programmes', {
    method: 'GET',
    ...(options || {}),
  });
}
