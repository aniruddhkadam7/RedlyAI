import React from 'react';
import { ViewStore } from '@/diagram-studio/view-runtime/ViewStore';
import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import type { EaRelationship } from '@/pages/dependency-view/utils/eaRepository';
import { useCatalog } from './hooks/useCatalog';
import type {
  CatalogDomain,
  CatalogElement,
  CatalogQueryState,
} from './types/catalog.types';

type UpdateFieldArgs = {
  id: string;
  field: 'name' | 'owner' | 'lifecycle' | 'status';
  value: string;
};

export const useCatalogController = (
  domain: CatalogDomain,
  queryState: CatalogQueryState,
) => {
  const { eaRepository } = useEaRepository();
  const { rows, total, updateElementAttributes, removeElements } = useCatalog(
    domain,
    queryState,
  );

  const updateField = React.useCallback(
    ({ id, field, value }: UpdateFieldArgs) => {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        lastModifiedAt: now,
        lastModifiedBy: 'catalog',
      };

      const trimmed = value.trim();
      if (field === 'name') patch.name = trimmed;
      if (field === 'owner') patch.ownerName = trimmed;
      if (field === 'lifecycle') {
        patch.lifecycleState = trimmed;
        patch.lifecycleStatus = trimmed;
      }
      if (field === 'status') {
        patch.approvalStatus = trimmed;
        patch.status = trimmed;
      }

      updateElementAttributes(id, patch);
    },
    [updateElementAttributes],
  );

  const bulkUpdateLifecycle = React.useCallback(
    (elementIds: string[], lifecycle: string) => {
      elementIds.forEach((id) => {
        updateField({ id, field: 'lifecycle', value: lifecycle });
      });
    },
    [updateField],
  );

  const getInspectorRelationships = React.useCallback(
    (elementId: string): EaRelationship[] => {
      if (!eaRepository) return [];
      return eaRepository.relationships.filter(
        (rel) => rel.fromId === elementId || rel.toId === elementId,
      );
    },
    [eaRepository],
  );

  const getInspectorViews = React.useCallback(
    (elementId: string): ViewInstance[] => {
      return ViewStore.list().filter((view) => {
        if (view.scope.kind === 'EntireRepository') return true;
        return (view.scope.elementIds ?? []).includes(elementId);
      });
    },
    [],
  );

  const findInspectorElement = React.useCallback(
    (elementId: string | null): CatalogElement | null => {
      if (!elementId) return null;
      return rows.find((row) => row.id === elementId) ?? null;
    },
    [rows],
  );

  return {
    rows,
    total,
    updateField,
    bulkUpdateLifecycle,
    removeElements,
    findInspectorElement,
    getInspectorRelationships,
    getInspectorViews,
  };
};
