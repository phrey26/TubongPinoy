import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter, Router, TitleStrategy } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { PageMetadata } from './page-metadata';

describe('Public pages and route metadata', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [
    provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
    { provide: TitleStrategy, useClass: PageMetadata },
  ] }));

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('renders help and policy pages with distinct titles and descriptions without signing in', async () => {
    const harness = await RouterTestingHarness.create();
    const titles = new Set<string>();
    for (const path of ['/faq', '/privacy', '/terms']) {
      await harness.navigateByUrl(path);
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBeTruthy();
      const title = TestBed.inject(Title).getTitle();
      expect(title).toContain('Tubong Pinoy');
      titles.add(title);
      expect(TestBed.inject(Meta).getTag('name="description"')?.content.length).toBeGreaterThan(40);
      expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('index,follow');
      TestBed.inject(HttpTestingController).expectNone('/api/session.php');
    }
    expect(titles.size).toBe(3);
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
  });

  it('keeps unknown URLs on a real not-found screen and resets noindex when navigating away', async () => {
    const harness = await RouterTestingHarness.create('/missing-page?from=test');
    expect(TestBed.inject(Router).url).toBe('/missing-page?from=test');
    expect(harness.routeNativeElement?.textContent).toContain('404');
    expect(TestBed.inject(Title).getTitle()).toBe('Page Not Found | Tubong Pinoy');
    expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('noindex,follow');
    await harness.navigateByUrl('/faq');
    expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('index,follow');
    expect(harness.routeNativeElement?.querySelectorAll('details').length).toBeGreaterThan(5);
  });

  it('applies login metadata after a protected route redirects a guest', async () => {
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/account/profile');
    await new Promise(resolve => setTimeout(resolve, 0));
    TestBed.inject(HttpTestingController).expectOne('/api/session.php').flush({ user: null, csrfToken: 'token' });
    await navigation;
    expect(TestBed.inject(Title).getTitle()).toBe('Log In | Tubong Pinoy');
    expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('noindex,follow');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });
});
