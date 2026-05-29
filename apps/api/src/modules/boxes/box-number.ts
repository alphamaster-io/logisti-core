import { randomBytes } from 'node:crypto';

// "B-" prefix + 16 chars of base32. Same alphabet as service-order numbers
// (A-Z minus O, plus 2-9). The prefix lets eyes and logs distinguish a box
// number from a service-order number at a glance.

const ALPHABET = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';

export function generateBoxNumber(): string {
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
  return `B-${out}`; // 18 chars total
}
