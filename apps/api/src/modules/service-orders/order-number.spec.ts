import { generateOrderNumber } from './order-number';

describe('generateOrderNumber', () => {
  it('produces 16 chars from the URL-safe alphabet (A-Z minus O, plus 2-9)', () => {
    // Run many draws so we cover the full alphabet space — single draws may not
    // contain rarer letters like Q or X.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const n = generateOrderNumber();
      expect(n).toHaveLength(16);
      expect(n).toMatch(/^[A-NP-Z2-9]{16}$/);
      seen.add(n);
    }
    expect(seen.size).toBe(200);
  });

  it('rarely collides over 5000 draws (smoke)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i += 1) seen.add(generateOrderNumber());
    expect(seen.size).toBe(5000);
  });
});
