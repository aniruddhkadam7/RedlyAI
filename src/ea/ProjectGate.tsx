import React from 'react';

export type ProjectGateProps = {
  /** Rendered when there is no project yet. */
  children?: React.ReactNode;

  /** Rendered when a project exists. */
  shell: React.ReactNode;
};

/**
 * Structural gate for controlling access to repository-enabled UI.
 *
 * - Always renders shell (project gate bypassed)
 */
const ProjectGate: React.FC<ProjectGateProps> = ({ shell }) => {
  return <>{shell}</>;
};

export default ProjectGate;
