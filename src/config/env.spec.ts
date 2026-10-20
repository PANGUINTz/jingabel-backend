import 'reflect-metadata';
import { validateEnv } from './env.js';

const required = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it.each([
    ['true', true],
    ['false', false],
    [undefined, undefined],
  ])('parses SWAGGER_ENABLED=%s as %s', (raw, expected) => {
    expect(
      validateEnv({ ...required, SWAGGER_ENABLED: raw }).SWAGGER_ENABLED,
    ).toBe(expected);
  });

  it('rejects a SWAGGER_ENABLED value that is not true/false', () => {
    expect(() =>
      validateEnv({ ...required, SWAGGER_ENABLED: 'yes' }),
    ).toThrow();
  });

  it('converts numeric variables', () => {
    expect(validateEnv({ ...required, PORT: '8080' }).PORT).toBe(8080);
  });
});
