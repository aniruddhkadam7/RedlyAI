import React from 'react';

import { type EaProject } from '@/services/ea/project';

export type EaProjectContextValue = {
  project: EaProject | null;
  loading: boolean;
  refreshProject: () => Promise<void>;
  createProject: (input: { name: string; description?: string }) => Promise<EaProject>;
};

const EaProjectContext = React.createContext<EaProjectContextValue | undefined>(undefined);

export const EaProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [project, setProject] = React.useState<EaProject | null>(null);
  const [loading, setLoading] = React.useState(false);

  const refreshProject = React.useCallback(async () => {
    // No-op since we're using default project
  }, []);

  const createProject = React.useCallback(async (input: { name: string; description?: string }) => {
    const newProject: EaProject = {
      id: `project-${Date.now()}`,
      name: input.name,
      description: input.description ?? '',
      createdAt: new Date().toISOString(),
    };
    setProject(newProject);
    return newProject;
  }, []);

  return (
    <EaProjectContext.Provider value={{ project, loading, refreshProject, createProject }}>
      {children}
    </EaProjectContext.Provider>
  );
};

export function useEaProject(): EaProjectContextValue {
  const ctx = React.useContext(EaProjectContext);
  if (!ctx) throw new Error('useEaProject must be used within EaProjectProvider');
  return ctx;
}
