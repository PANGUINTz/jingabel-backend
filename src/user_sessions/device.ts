export type DeviceType = 'desktop' | 'mobile' | 'tablet';

export interface DeviceInfo {
  deviceName: string;
  deviceType: DeviceType;
}

// Checked in order — Edge, Opera and Samsung Internet also claim "Chrome", and
// Chrome also claims "Safari", so the more specific names come first.
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

// A label for the active-sessions list, e.g. "Chrome บน macOS".
export function describeDevice(userAgent: string | undefined): DeviceInfo {
  const ua = userAgent ?? '';
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];

  return {
    deviceName: `${browser ?? 'เบราว์เซอร์ไม่ทราบชื่อ'} บน ${system ?? 'อุปกรณ์ไม่ทราบชื่อ'}`,
    deviceType: /iPad|Tablet/.test(ua)
      ? 'tablet'
      : /Mobi|iPhone|Android/.test(ua)
        ? 'mobile'
        : 'desktop',
  };
}
