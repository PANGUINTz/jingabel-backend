import { describeDevice } from './device.js';

describe('describeDevice', () => {
  it('names the browser and system', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      ),
    ).toEqual({ deviceName: 'Chrome บน macOS', deviceType: 'desktop' });
  });

  it('prefers Edge over the Chrome it also claims', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      ).deviceName,
    ).toBe('Edge บน Windows');
  });

  it('detects phones and tablets', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ deviceName: 'Safari บน iOS', deviceType: 'mobile' });
    expect(
      describeDevice(
        'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ).deviceType,
    ).toBe('tablet');
  });

  it('falls back when the user agent is missing or unknown', () => {
    expect(describeDevice(undefined)).toEqual({
      deviceName: 'เบราว์เซอร์ไม่ทราบชื่อ บน อุปกรณ์ไม่ทราบชื่อ',
      deviceType: 'desktop',
    });
  });
});
