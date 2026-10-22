import { locateIp } from './location.js';

// These depend on geoip-lite's bundled database; update the IPs if a data
// refresh moves them.
describe('locateIp', () => {
  it('returns the province and country', () => {
    expect(locateIp('110.168.20.1')).toBe('Bangkok, TH');
    expect(locateIp('171.96.10.5')).toBe('Chiang Mai, TH');
  });

  it('reads IPv4-mapped IPv6 addresses', () => {
    expect(locateIp('::ffff:110.168.20.1')).toBe('Bangkok, TH');
  });

  it('falls back to the country when the province is unknown', () => {
    expect(locateIp('58.8.10.1')).toBe('TH');
  });

  it('returns null for missing, private and loopback addresses', () => {
    expect(locateIp(undefined)).toBeNull();
    expect(locateIp('127.0.0.1')).toBeNull();
    expect(locateIp('::1')).toBeNull();
    expect(locateIp('192.168.1.10')).toBeNull();
  });
});
