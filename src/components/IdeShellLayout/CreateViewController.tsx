import { useModel } from '@umijs/max';
import React from 'react';
import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';
import { ViewpointRegistry } from '@/diagram-studio/viewpoints/ViewpointRegistry';

const CreateViewController: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const viewReadOnly = false;

  const generateWorkingViewId = React.useCallback(() => {
    try {
      if (typeof globalThis.crypto?.randomUUID === 'function')
        return `working-view-${globalThis.crypto.randomUUID()}`;
    } catch {
      // fall through
    }
    return `working-view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }, []);

  React.useEffect(() => {
    const onStudioViewCreate = () => {
      const now = new Date().toISOString();
      const defaultViewpointId =
        ViewpointRegistry.list()[0]?.id ?? 'application-landscape';
      const draft: ViewInstance = {
        id: generateWorkingViewId(),
        name: 'Untitled View',
        description: '',
        viewpointId: defaultViewpointId,
        scope: { kind: 'ManualSelection', elementIds: [] },
        layoutMetadata: {
          workingView: true,
          positions: {},
          visibleElementIds: [],
          freeShapes: [],
          freeConnectors: [],
        },
        createdAt: now,
        createdBy:
          initialState?.currentUser?.name ||
          initialState?.currentUser?.userid ||
          'studio',
        status: 'DRAFT',
      };

      try {
        window.dispatchEvent(
          new CustomEvent('ea:studio.view.open', {
            detail: {
              viewId: draft.id,
              view: draft,
              readOnly: viewReadOnly,
              working: true,
              openMode: 'new',
            },
          }),
        );
      } catch (err) {
        console.error(
          '[CreateViewController] Failed to open working view in Studio.',
          err,
        );
      }
    };

    window.addEventListener(
      'ea:studio.view.create',
      onStudioViewCreate as EventListener,
    );
    return () =>
      window.removeEventListener(
        'ea:studio.view.create',
        onStudioViewCreate as EventListener,
      );
  }, [
    generateWorkingViewId,
    initialState?.currentUser?.name,
    initialState?.currentUser?.userid,
    viewReadOnly,
  ]);

  return null;
};

export default CreateViewController;
