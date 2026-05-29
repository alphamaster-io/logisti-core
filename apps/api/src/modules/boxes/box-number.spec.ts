import { generateBoxNumber } from './box-number';

describe('generateBoxNumber', () => {
  it('produces B-<16 chars> from the URL-safe alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const n = generateBoxNumber();
      expect(n).toHaveLength(18);
      expect(n).toMatch(/^B-[A-NP-Z2-9]{16}$/);
      seen.add(n);
    }
    expect(seen.size).toBe(200);
  });

  it('rarely collides over 5000 draws (smoke)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i += 1) seen.add(generateBoxNumber());
    expect(seen.size).toBe(5000);
  });
});
