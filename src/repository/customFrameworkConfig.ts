import { isValidObjectType, type ObjectType } from '@/pages/dependency-view/utils/eaMetaModel';
import type { FrameworkConfig, ReferenceFramework } from './repositoryMetadata';

export type CustomMetaModelConfig = {
  /**
   * In Custom framework, element types must be explicitly enabled before modeling is allowed.
   * Empty list means "modeling disabled".
   */
  enabledObjectTypes: readonly ObjectType[];
};

export const DEFAULT_CUSTOM_META_MODEL_CONFIG: CustomMetaModelConfig = {
  enabledObjectTypes: [],
};

export const normalizeCustomMetaModelConfig = (value: unknown): CustomMetaModelConfig => {
  const v = value as any;
  const raw = Array.isArray(v?.enabledObjectTypes) ? (v.enabledObjectTypes as unknown[]) : [];

  const out: ObjectType[] = [];
  for (const t of raw) {
    if (!isValidObjectType(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  out.sort((a, b) => a.localeCompare(b));

  return { enabledObjectTypes: out };
};

export const getCustomMetaModelConfig = (frameworkConfig: FrameworkConfig | null | undefined): CustomMetaModelConfig => {
  if (!frameworkConfig?.custom) return DEFAULT_CUSTOM_META_MODEL_CONFIG;
  return normalizeCustomMetaModelConfig(frameworkConfig.custom);
};

export const isCustomFrameworkModelingEnabled = (
  referenceFramework: ReferenceFramework | null | undefined,
  frameworkConfig: FrameworkConfig | null | undefined,
): boolean => {
  if (referenceFramework !== 'Custom') return true;
  return getCustomMetaModelConfig(frameworkConfig).enabledObjectTypes.length > 0;
};

export const isObjectTypeEnabledForFramework = (
  referenceFramework: ReferenceFramework | null | undefined,
  frameworkConfig: FrameworkConfig | null | undefined,
  objectType: ObjectType,
): boolean => {
  if (referenceFramework !== 'Custom') return true;
  const enabled = getCustomMetaModelConfig(frameworkConfig).enabledObjectTypes;
  return enabled.includes(objectType);
};
