import {
  getCustomMetaModelConfig,
  isCustomFrameworkModelingEnabled,
  isObjectTypeEnabledForFramework,
  normalizeCustomMetaModelConfig,
} from '../customFrameworkConfig';

describe('Custom framework config', () => {
  test('normalizes enabledObjectTypes (dedupe + sort + filter invalid)', () => {
    const cfg = normalizeCustomMetaModelConfig({ enabledObjectTypes: ['Application', 'BadType', 'Capability', 'Application'] });
    expect(cfg.enabledObjectTypes).toEqual(['Application', 'Capability']);
  });

  test('getCustomMetaModelConfig defaults to empty', () => {
    expect(getCustomMetaModelConfig(undefined).enabledObjectTypes).toEqual([]);
    expect(getCustomMetaModelConfig(null).enabledObjectTypes).toEqual([]);
  });

  test('Custom modeling disabled until at least one type enabled', () => {
    expect(isCustomFrameworkModelingEnabled('Custom', { custom: { enabledObjectTypes: [] } })).toBe(false);
    expect(isCustomFrameworkModelingEnabled('Custom', { custom: { enabledObjectTypes: ['Application'] } })).toBe(true);
  });

  test('object type enablement is enforced only for Custom', () => {
    expect(isObjectTypeEnabledForFramework('Custom', { custom: { enabledObjectTypes: ['Application'] } }, 'Application')).toBe(true);
    expect(isObjectTypeEnabledForFramework('Custom', { custom: { enabledObjectTypes: ['Application'] } }, 'Capability')).toBe(false);

    // Non-Custom frameworks should behave as "no restriction".
    expect(isObjectTypeEnabledForFramework('ArchiMate', null, 'Capability')).toBe(true);
    expect(isCustomFrameworkModelingEnabled('ArchiMate', null)).toBe(true);
  });
});
