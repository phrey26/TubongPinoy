import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';

@Component({ template: 'Page' })
class Page {}

// Exercise the real route tree and guards without starting canvas render loops.
function testRoutes(source: Routes): Routes {
  return source.map(route => ({ ...route,
    ...(route.component || route.loadComponent ? { component: Page, loadComponent: undefined } : {}),
    ...(route.children ? { children: testRoutes(route.children) } : {}),
  }));
}

describe('Account access routes', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter(testRoutes(routes)), provideHttpClient(), provideHttpClientTesting(),
    ] });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  it.each(['/', '/games', '/contact', '/login', '/signup'])('keeps %s public', async path => {
    await harness.navigateByUrl(path);
    expect(TestBed.inject(Router).url).toBe(path);
    http.expectNone('/api/session.php');
  });

  it.each(['/games/tumbang-preso', '/games/jolens-blast', '/shop', '/topup', '/account/profile', '/account/inventory', '/account/settings'])(
    'redirects guests from %s and remembers the destination', async path => {
      const navigation = harness.navigateByUrl(path);
      // Router navigation reaches the asynchronous guard on the next task.
      await new Promise(resolve => setTimeout(resolve, 0));
      http.expectOne('/api/session.php').flush({ user: null, csrfToken: 'token' });
      await navigation;
      const url = TestBed.inject(Router).parseUrl(TestBed.inject(Router).url);
      expect(url.root.children['primary'].segments[0].path).toBe('login');
      expect(url.queryParams['returnUrl']).toBe(path);
    },
  );

  it('allows a verified session and checks again when switching games', async () => {
    for (const path of ['/games/tumbang-preso', '/games/jolens-blast', '/shop']) {
      const navigation = harness.navigateByUrl(path);
      await new Promise(resolve => setTimeout(resolve, 0));
      http.expectOne('/api/session.php').flush({ user: { id: 1, username: 'Player' }, csrfToken: 'token' });
      await navigation;
      expect(TestBed.inject(Router).url).toBe(path);
    }
  });

  it('blocks a protected page if the account service is unavailable', async () => {
    const navigation = harness.navigateByUrl('/shop');
    await new Promise(resolve => setTimeout(resolve, 0));
    http.expectOne('/api/session.php').flush({}, { status: 503, statusText: 'Unavailable' });
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fshop');
  });
});
