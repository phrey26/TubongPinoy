import { MockPlatformLocation } from '@angular/common/testing';
import { StaticFileLocationStrategy } from './static-file-location-strategy';

describe('static file hash navigation', () => {
  it('retains the uploaded index file through navigation and replacement', () => {
    const platform = new MockPlatformLocation({ startUrl: 'https://html-classic.itch.zone/html/123/index.html' });
    const strategy = new StaticFileLocationStrategy(platform);
    strategy.pushState(null, '', '/games', '');
    expect(platform.pathname).toBe('/html/123/index.html');
    expect(platform.hash).toBe('#/games');
    strategy.replaceState(null, '', '/login', 'returnUrl=%2Fshop');
    expect(platform.pathname).toBe('/html/123/index.html');
    expect(platform.hash).toBe('#/login?returnUrl=%2Fshop');
  });

  it('preserves host query parameters outside the app route', () => {
    const platform = new MockPlatformLocation({ startUrl: 'https://html-classic.itch.zone/html/123/index.html?v=1' });
    const strategy = new StaticFileLocationStrategy(platform);
    expect(strategy.prepareExternalUrl('/games')).toBe('/html/123/index.html?v=1#/games');
  });
});
