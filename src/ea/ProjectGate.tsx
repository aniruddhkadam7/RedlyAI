import React from 'react';

import { useEaProject } from '@/ea/EaProjectContext';

export type ProjectGateProps = {
  /** Rendered when there is no project yet. */
  children?: React.ReactNode;

  /** Rendered when a project exists. */
  shell: React.ReactNode;
};

/**
 * Structural gate for controlling access to project-enabled UI.
 *
 * - loading: renders nothing
 * - no project: renders children
 * - project exists: renders shell
 */
const ProjectGate: React.FC<ProjectGateProps> = ({ shell, children }) => {
  const { project, loading } = useEaProject();

  if (loading) return null;
  if (!project) return <>{children ?? null}</>;
  return <>{shell}</>;
};

export default ProjectGate;
