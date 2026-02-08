export type ViewScope =
  | { readonly kind: 'EntireRepository' }
  | { readonly kind: 'ManualSelection'; readonly elementIds: readonly string[] };

export type ViewAnnotation = {
  id: string;
  kind: 'note' | 'callout' | 'highlight';
  text: string;
  targetElementId?: string;
  createdAt: string;
  createdBy?: string;
};

export type LayoutMetadata = {
  /** Preferred layout for this view. */
  layout?: 'hierarchical' | 'radial' | 'grid';
  /** View-only annotations (never persisted to repository). */
  annotations?: ViewAnnotation[];
  /** Additional metadata slots (forward-compatible). */
  [key: string]: unknown;
};

export type ViewStatus = 'DRAFT' | 'SAVED';

export type ViewInstance = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly viewpointId: string;
  readonly scope: ViewScope;
  readonly layoutMetadata: LayoutMetadata;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly status: ViewStatus;
  /**
   * Relationship IDs explicitly visible in this view.
   * Only relationships whose IDs appear here AND whose endpoints are both
   * present in `scope.elementIds` will be rendered on the view canvas.
   * This ensures complete view isolation — relationships never leak between views.
   */
  readonly visibleRelationshipIds?: readonly string[];
};
