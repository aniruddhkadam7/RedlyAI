import React from 'react';

import { useEaProject } from '@/ea/EaProjectContext';
import { useEaRepository } from '@/ea/EaRepositoryContext';

export type AppMode = 'STARTUP' | 'WORKSPACE';

export type AppModeState = {
  mode: AppMode;
  hasProject: boolean;
  hasRepository: boolean;
};

export const useAppMode = (): AppModeState => {
  const { project } = useEaProject();
  const { eaRepository, metadata } = useEaRepository();

  const hasProject = Boolean(project);
  const hasRepository = Boolean(eaRepository && metadata);

  return React.useMemo(
    () => ({
      mode: hasProject && hasRepository ? 'WORKSPACE' : 'STARTUP',
      hasProject,
      hasRepository,
    }),
    [hasProject, hasRepository],
  );
};
