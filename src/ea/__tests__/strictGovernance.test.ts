import { EaRepository } from '@/pages/dependency-view/utils/eaRepository';
import { validateStrictGovernance } from '../strictGovernance';

describe('validateStrictGovernance', () => {
  test('Strict blocks unnamed live objects', () => {
    const repo = new EaRepository();
    repo.addObject({ id: 'app-1', type: 'Application', attributes: { name: '' } });

    const res = validateStrictGovernance(repo, { governanceMode: 'Strict', lifecycleCoverage: 'As-Is' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const text = res.violation.highlights.join('\n');
      expect(text).toContain('Application');
      expect(text).toContain('app-1');
      expect(text).toContain('has no name');
    }
  });

  test('Strict blocks missing owner', () => {
    const repo = new EaRepository();
    repo.addObject({ id: 'app-1', type: 'Application', attributes: { name: 'Payments App' } });

    const res = validateStrictGovernance(repo, { governanceMode: 'Strict', lifecycleCoverage: 'As-Is' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const text = res.violation.highlights.join('\n');
      expect(text).toContain('Application');
      expect(text).toContain('Payments App');
      expect(text).toContain('has no owner');
    }
  });

  test('Strict blocks Capability missing ApplicationService support', () => {
    const repo = new EaRepository();

    repo.addObject({ id: 'ent-1', type: 'Enterprise', attributes: { name: 'Enterprise', ownerId: 'ent-1' } });
    repo.addObject({ id: 'cap-1', type: 'Capability', attributes: { name: 'Payments', ownerId: 'ent-1' } });
    repo.addObject({ id: 'bs-1', type: 'BusinessService', attributes: { name: 'Payment Initiation', ownerId: 'ent-1' } });
    repo.addObject({ id: 'app-1', type: 'Application', attributes: { name: 'Payments App', ownerId: 'ent-1' } });
    repo.addObject({ id: 'as-1', type: 'ApplicationService', attributes: { name: 'Payment API', ownerId: 'ent-1' } });

    // Ownership requirements (governanceValidation rule #1)
    repo.addRelationship({ fromId: 'ent-1', toId: 'cap-1', type: 'OWNS', attributes: {} });
    repo.addRelationship({ fromId: 'ent-1', toId: 'app-1', type: 'OWNS', attributes: {} });

    // Capability -> BusinessService mapping (required for the support chain to exist)
    repo.addRelationship({ fromId: 'cap-1', toId: 'bs-1', type: 'REALIZED_BY', attributes: {} });

    // ApplicationService belongs to an Application (so only the Capability support rule fails)
    repo.addRelationship({ fromId: 'app-1', toId: 'as-1', type: 'PROVIDES', attributes: {} });

    const res = validateStrictGovernance(repo, { governanceMode: 'Strict', lifecycleCoverage: 'As-Is' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const text = res.violation.highlights.join('\n');
      expect(text).toContain('Capability');
      expect(text).toContain('Payments');
      expect(text).toContain('has no supporting Application Service');
    }
  });

  test('Strict blocks ApplicationService without exactly one Application provider', () => {
    const repo = new EaRepository();

    repo.addObject({ id: 'ent-1', type: 'Enterprise', attributes: { name: 'Enterprise', ownerId: 'ent-1' } });
    repo.addObject({ id: 'app-1', type: 'Application', attributes: { name: 'App One', ownerId: 'ent-1' } });
    repo.addObject({ id: 'as-1', type: 'ApplicationService', attributes: { name: 'Service One', ownerId: 'ent-1' } });

    // Ownership requirements (governanceValidation rule #1)
    repo.addRelationship({ fromId: 'ent-1', toId: 'app-1', type: 'OWNS', attributes: {} });

    // Intentionally omit PROVIDES to trigger the required relationship check.

    const res = validateStrictGovernance(repo, { governanceMode: 'Strict', lifecycleCoverage: 'As-Is' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const text = res.violation.highlights.join('\n');
      expect(text).toContain('Application Service');
      expect(text).toContain('Service One');
      expect(text).toContain('must belong to exactly one Application');
    }
  });

  test('Advisory does not block', () => {
    const repo = new EaRepository();
    repo.addObject({ id: 'app-1', type: 'Application', attributes: { name: '' } });

    const res = validateStrictGovernance(repo, { governanceMode: 'Advisory', lifecycleCoverage: 'As-Is' });
    expect(res.ok).toBe(true);
  });
});
