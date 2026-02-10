import { request } from 'umi';

export type EaProject = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  errorMessage?: string;
};

export async function getEaProject(options?: Record<string, any>) {
  return request<ApiResponse<EaProject | null>>('/api/project', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function createEaProject(
  body: { name: string; description?: string },
  options?: Record<string, any>,
) {
  return request<ApiResponse<EaProject>>('/api/project', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      name: body.name,
      description: body.description ?? '',
    },
    ...(options || {}),
  });
}
