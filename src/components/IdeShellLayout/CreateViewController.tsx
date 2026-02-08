import React from 'react';
import { useModel } from '@umijs/max';

import { useEaRepository } from '@/ea/EaRepositoryContext';
import { ENABLE_RBAC, hasRepositoryPermission, type RepositoryRole } from '@/repository/accessControl';
import { ViewpointRegistry } from '@/diagram-studio/viewpoints/ViewpointRegistry';
import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';

const CreateViewController: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const { metadata } = useEaRepository();

  const userRole: RepositoryRole = React.useMemo(() => {
    if (!ENABLE_RBAC) return 'Owner';
    const access = initialState?.currentUser?.access;
    if (access === 'admin') return 'Owner';
    if (access === 'architect' || access === 'user') return 'Architect';
    return 'Viewer';
  }, [initialState?.currentUser?.access]);

  const governanceStrict = (metadata as any)?.governanceMode === 'Strict';
  const canEditView = hasRepositoryPermission(userRole, 'editView');
  const viewReadOnly = governanceStrict && !canEditView;

  const generateWorkingViewId = React.useCallback(() => {
    try {
      if (typeof globalThis.crypto?.randomUUID === 'function') return `working-view-${globalThis.crypto.randomUUID()}`;
    } catch {
      // fall through
    }
    return `working-view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }, []);

  React.useEffect(() => {
    const onStudioViewCreate = () => {
      const now = new Date().toISOString();
      const defaultViewpointId = ViewpointRegistry.list()[0]?.id ?? 'application-landscape';
      const draft: ViewInstance = {
        id: generateWorkingViewId(),
        name: 'Untitled View',
        description: '',
        viewpointId: defaultViewpointId,
        scope: { kind: 'ManualSelection', elementIds: [] },
        layoutMetadata: { workingView: true, positions: {}, visibleElementIds: [], freeShapes: [], freeConnectors: [] },
        createdAt: now,
        createdBy: initialState?.currentUser?.name || initialState?.currentUser?.userid || 'studio',
        status: 'DRAFT',
      };

      try {
        window.dispatchEvent(
          new CustomEvent('ea:studio.view.open', {
            detail: { viewId: draft.id, view: draft, readOnly: viewReadOnly, working: true, openMode: 'new' },
          }),
        );
      } catch (err) {
        console.error('[CreateViewController] Failed to open working view in Studio.', err);
      }
    };

    window.addEventListener('ea:studio.view.create', onStudioViewCreate as EventListener);
    return () => window.removeEventListener('ea:studio.view.create', onStudioViewCreate as EventListener);
  }, [generateWorkingViewId, initialState?.currentUser?.name, initialState?.currentUser?.userid, viewReadOnly]);

  return null;
};

export default CreateViewController;
