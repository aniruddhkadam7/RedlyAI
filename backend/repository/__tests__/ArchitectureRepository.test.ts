import { createArchitectureRepository } from '../ArchitectureRepository';
import type { Enterprise } from '../Enterprise';

const makeEnterprise = (id: string, name: string): Enterprise => {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description: `${name} description`,
    elementType: 'Enterprise',
    layer: 'Business',
    lifecycleStatus: 'Active',
    lifecycleStartDate: now,
    ownerRole: 'Owner',
    ownerName: 'Test Owner',
    owningUnit: 'Test Unit',
    approvalStatus: 'Draft',
    lastReviewedAt: now,
    reviewCycleMonths: 12,
    createdAt: now,
    createdBy: 'test',
    lastModifiedAt: now,
    lastModifiedBy: 'test',
    parentEnterpriseId: null,
  };
};

describe('ArchitectureRepository (Enterprise cardinality)', () => {
  test('allows multiple Enterprise elements', () => {
    const repo = createArchitectureRepository();

    const first = makeEnterprise('ent-1', 'Enterprise One');
    const second = makeEnterprise('ent-2', 'Enterprise Two');

    expect(repo.addElement('enterprises', first).ok).toBe(true);
    expect(repo.addElement('enterprises', second).ok).toBe(true);

    const all = repo.getElementsByType('enterprises');
    expect(all).toHaveLength(2);
  });
});
