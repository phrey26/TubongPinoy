import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Auth, safeReturnUrl } from './auth';

describe('Auth', () => {
  let service: Auth;
  let http: HttpTestingController;
  const user = { id: 1, username: 'Player', tansans: 1000, juice: 100 };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(Auth);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { http.verify(); localStorage.clear(); });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('ignores forged local storage and checks the server on each navigation', () => {
    localStorage.setItem('user', JSON.stringify(user));
    expect(service.user()).toBeNull();
    service.loadSession().subscribe();
    http.expectOne('/api/session.php').flush({ user, csrfToken: 'one' });
    expect(service.user()).toEqual(user);
    service.loadSession().subscribe();
    http.expectOne('/api/session.php').flush({ user: null, csrfToken: 'two' });
    expect(service.user()).toBeNull();
  });

  it('shares simultaneous session checks', () => {
    service.loadSession().subscribe();
    service.loadSession().subscribe();
    http.expectOne('/api/session.php').flush({ user: null, csrfToken: 'token' });
  });

  it('sends credentials with CSRF protection and clears identity after logout', () => {
    service.login({ identity: 'Player', password: 'test-password', rememberMe: true }).subscribe();
    http.expectOne('/api/session.php').flush({ user: null, csrfToken: 'before-login' });
    const login = http.expectOne('/api/login.php');
    expect(login.request.headers.get('X-CSRF-Token')).toBe('before-login');
    expect(login.request.body.rememberMe).toBe(true);
    login.flush({ user, csrfToken: 'after-login' });
    expect(service.user()).toEqual(user);
    service.logout().subscribe();
    http.expectOne('/api/session.php').flush({ user, csrfToken: 'after-login' });
    const logout = http.expectOne('/api/logout.php');
    expect(logout.request.headers.get('X-CSRF-Token')).toBe('after-login');
    logout.flush({ message: 'Logged out.' });
    expect(service.user()).toBeNull();
  });

  it('clears stale identity if the session server becomes unavailable', () => {
    service.loadSession().subscribe();
    http.expectOne('/api/session.php').flush({ user, csrfToken: 'token' });
    service.loadSession().subscribe({ error: () => {} });
    http.expectOne('/api/session.php').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(service.user()).toBeNull();
  });

  it.each(['https://example.com', '//example.com', '/\\example.com', '/login', null])(
    'rejects unsafe or looping return URLs: %s', value => expect(safeReturnUrl(value)).toBe('/games'),
  );

  it.each(['/shop', '/topup', '/games/tumbang-preso', '/games/jolens-blast?round=2', '/account/profile', '/account/inventory', '/account/settings']) (
    'preserves local destinations: %s', value => expect(safeReturnUrl(value)).toBe(value),
  );
});
