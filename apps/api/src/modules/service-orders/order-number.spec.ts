import { generateOrderNumber } from './order-number';

describe('generateOrderNumber', () => {
  it('produces 16 chars from the safe alphabet', () => {
    const n = generateOrderNumber();
    expect(n).toHaveLength(16);
    expect(n).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
  });

  it('rarely collides over 5000 draws (smoke)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i += 1) seen.add(generateOrderNumber());
    expect(seen.size).toBe(5000);
  });
});
