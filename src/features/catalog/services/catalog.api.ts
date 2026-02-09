import { request } from '@umijs/max';
import type {
  CatalogDetail,
  CatalogDomain,
  CatalogElement,
  CatalogStats,
} from '../types/catalog.types';

export type CatalogApiResponse<T> = {
  success: boolean;
  data: T;
  errorMessage?: string;
};

export type CatalogPageResponse = CatalogApiResponse<CatalogElement[]> & {
  pagination?: { total: number; page: number; pageSize: number };
};

export const fetchCatalogPage = async (
  domain: CatalogDomain,
  params: Record<string, any>,
) =>
  request<CatalogPageResponse>(`/api/catalog/${encodeURIComponent(domain)}`, {
    method: 'GET',
    params,
  });

export const fetchCatalogStats = async (domain: CatalogDomain) =>
  request<CatalogApiResponse<CatalogStats>>(
    `/api/catalog/${encodeURIComponent(domain)}/stats`,
    {
      method: 'GET',
    },
  );

export const fetchCatalogDetail = async (domain: CatalogDomain, id: string) =>
  request<CatalogApiResponse<CatalogDetail>>(
    `/api/catalog/${encodeURIComponent(domain)}/${encodeURIComponent(id)}`,
    {
      method: 'GET',
    },
  );

export const deleteCatalogElement = async (
  domain: CatalogDomain,
  id: string,
  cascadeRelationships: boolean,
) =>
  request<CatalogApiResponse<CatalogDetail>>(
    `/api/catalog/${encodeURIComponent(domain)}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      params: { cascadeRelationships },
    },
  );

export const updateCatalogLifecycle = async (
  domain: CatalogDomain,
  id: string,
  lifecycleStatus: string,
) =>
  request<CatalogApiResponse<CatalogDetail>>(
    `/api/catalog/${encodeURIComponent(domain)}/${encodeURIComponent(id)}/lifecycle`,
    {
      method: 'PATCH',
      data: { lifecycleStatus },
    },
  );
