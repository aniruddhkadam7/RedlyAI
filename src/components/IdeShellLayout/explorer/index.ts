/**
 * Explorer module — enterprise-grade repository explorer tree.
 *
 * Public API:
 * - ExplorerTree: main React component (drop-in replacement)
 * - EXPLORER_KEYS: canonical tree key builder
 * - buildExplorerTree: pure function to build DataNode[] from repo state
 * - buildContextMenu: context menu factory
 * - explorerEventBus: typed event bus for cross-component communication
 * - explorerAuditLog: ring-buffer audit logger
 * - explorerPermissions: permission guard for explorer actions
 */

export { default as ExplorerTree } from './ExplorerTree';
export { EXPLORER_KEYS, getObjectTypesByCategory, getObjectTypesByMetamodelLayer, getRelationshipTypesByCategory, resolveArchitectureName, getDefaultExpandedKeys } from './explorerNodeRegistry';
export { buildExplorerTree, type ExplorerTreeInput, type ExplorerTreeResult } from './explorerTreeBuilder';
export { buildContextMenu, classifyNodeKey, type ExplorerMenuAction } from './explorerContextMenu';
export { emitExplorerEvent, onExplorerEvent, bridgeLegacyEvents, type ExplorerEvent } from './explorerEventBus';
export { writeAuditEntry, auditObjectMutation, queryAuditLog, getObjectAuditTrail, clearAuditLog, type AuditEntry, type AuditActionType } from './explorerAuditLog';
export { canPerform, assertCanPerform, filterMenuByPermission, type ExplorerAction } from './explorerPermissions';
