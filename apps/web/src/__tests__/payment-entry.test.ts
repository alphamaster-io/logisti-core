import { describe, expect, it } from 'vitest';
import { parseMajorToMinor } from '@/components/orders/payment-entry-dialog';

describe('parseMajorToMinor', () => {
  it('handles whole numbers', () => {
    expect(parseMajorToMinor('50')).toBe('5000');
  });
  it('handles 2 decimals', () => {
    expect(parseMajorToMinor('1035.00')).toBe('103500');
    expect(parseMajorToMinor('12.34')).toBe('1234');
  });
  it('handles 1 decimal', () => {
    expect(parseMajorToMinor('12.5')).toBe('1250');
  });
  it('handles negatives (discounts)', () => {
    expect(parseMajorToMinor('-120')).toBe('-12000');
  });
  it('returns null on empty / invalid', () => {
    expect(parseMajorToMinor('')).toBeNull();
    expect(parseMajorToMinor('abc')).toBeNull();
    expect(parseMajorToMinor('1.234')).toBeNull();
  });
});
