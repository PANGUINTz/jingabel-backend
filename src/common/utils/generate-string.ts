import { randomInt } from 'node:crypto';

const ALPHANUMERIC =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Cryptographically random, uniformly distributed over a-z, A-Z, 0-9.
export function generateString(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += ALPHANUMERIC[randomInt(ALPHANUMERIC.length)];
  }
  return result;
}
