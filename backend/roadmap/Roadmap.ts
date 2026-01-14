import type { Plateau } from './Plateau';

export type Roadmap = {
  readonly id: string;
  name: string;
  description?: string;
  /** Ordered sequence of plateau ids (time progression). */
  plateauIds: string[];
  /** Projection only; roadmaps do not own architecture elements. */
  readonly readOnly: true;
  createdAt: string;
  createdBy?: string;
};

export type RoadmapSnapshot = {
  roadmap: Roadmap;
  plateaus: readonly Plateau[];
};

export type RoadmapCreateRequest = {
  id?: string;
  name: string;
  description?: string;
  plateauIds: string[];
  createdBy?: string;
};
