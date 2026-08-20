import { describe, expect, it } from 'vitest';
import { isReadableWebUrl } from '@/shared/tabMessaging';

describe('tabMessaging', () => {
  it('accepts normal web pages', () => {
    expect(isReadableWebUrl('https://www.gatesfoundation.org/form')).toBe(true);
    expect(isReadableWebUrl('http://localhost:3000/apply')).toBe(true);
  });

  it('rejects non-web tabs', () => {
    expect(isReadableWebUrl('chrome://extensions/')).toBe(false);
    expect(isReadableWebUrl('chrome-extension://abc/sidepanel/index.html')).toBe(false);
    expect(isReadableWebUrl(undefined)).toBe(false);
  });
});
