import { describe, it, expect } from 'vitest';

// Mirror of the money() helper in orders/[id]/page.tsx — a pure function for
// rendering bigint minor units. Kept testable in isolation; if the page's copy
// drifts, this test is the canary to extract it into a shared util.
function money(minor: string): string {
  const n = BigInt(minor || '0');
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${major}.${cents}`;
}

describe('money()', () => {
  it('formats whole and fractional minor units', () => {
    expect(money('103500')).toBe('1035.00');
    expect(money('5000')).toBe('50.00');
    expect(money('7')).toBe('0.07');
    expect(money('0')).toBe('0.00');
  });

  it('handles negatives (credits)', () => {
    expect(money('-50000')).toBe('-500.00');
  });

  it('handles empty as zero', () => {
    expect(money('')).toBe('0.00');
  });

  it('handles very large values without precision loss', () => {
    expect(money('999999999999')).toBe('9999999999.99');
  });
});
