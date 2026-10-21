import { generateString } from './generate-string.js';

describe('generateString', () => {
  it('returns only a-z, A-Z and 0-9 at the requested length', () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateString(10)).toMatch(/^[A-Za-z0-9]{10}$/);
    }
  });

  it('uses the whole alphabet', () => {
    const seen = new Set(generateString(20_000));
    expect(seen.size).toBe(62);
  });
});
