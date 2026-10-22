import geoip from 'geoip-lite';

// "Bangkok, TH" — for Thai IPs the GeoLite city is the province. Looked up in
// geoip-lite's bundled database, so no IP leaves the server. Falls back to the
// country alone, or null for private/loopback addresses (local development).
export function locateIp(ipAddress: string | undefined): string | null {
  if (!ipAddress) return null;
  // Express reports IPv4 clients on a dual-stack socket as "::ffff:1.2.3.4".
  const found = geoip.lookup(ipAddress.replace(/^::ffff:/, ''));
  if (!found?.country) return null;
  return found.city ? `${found.city}, ${found.country}` : found.country;
}
