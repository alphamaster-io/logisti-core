import { randomBytes } from 'node:crypto';

// URL-safe opaque order number, ≥80 bits of entropy per the
// service-orders spec. Format: 16 chars of base32 alphabet (no padding).
// 16 chars × 5 bits = 80 bits.

const ALPHABET = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789'; // 32 chars, ambiguous chars (0OI1L) dropped

export function generateOrderNumber(): string {
  const bytes = randomBytes(10); // 80 bits
  let bits = 0;
  let bitCount = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bits = (bits << 8) | bytes[i]!;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      const idx = (bits >> bitCount) & 0x1f;
      out += ALPHABET[idx];
    }
  }
  return out; // 16 chars
}
