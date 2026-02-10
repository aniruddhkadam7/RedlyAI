import { validateStrictGovernance } from '../strictGovernance';

describe('validateStrictGovernance', () => {
  test('always returns ok (governance removed)', () => {
    const res = validateStrictGovernance(null as any, {} as any);
    expect(res.ok).toBe(true);
  });
});
