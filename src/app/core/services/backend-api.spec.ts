import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AccountState } from './account-state';
import { supabaseApiInterceptor } from './backend-api';
import { environment } from '../../../environments/environment';
import { REMEMBER_SESSION_ALLOWED } from './session-storage-policy';
import { vi } from 'vitest';

describe('Supabase API transport', () => {
  let http: HttpClient;
  let requests: HttpTestingController;
  let rememberAllowed: boolean;
  const edge = environment.supabaseUrl + '/functions/v1/tubong-api';
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    rememberAllowed = true;
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([supabaseApiInterceptor])), provideHttpClientTesting(),
      { provide: REMEMBER_SESSION_ALLOWED, useFactory: () => rememberAllowed },
    ] });
    http = TestBed.inject(HttpClient); requests = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { vi.restoreAllMocks(); requests.verify(); localStorage.clear(); sessionStorage.clear(); });

  it('restores a tab session after the application is bootstrapped again', () => {
    http.post('/api/login.php', { identity: 'Player', password: 'password', rememberMe: false }).subscribe();
    requests.expectOne(edge).flush({ user: { id: 1 }, sessionToken: 'c'.repeat(64) });
    expect(sessionStorage.getItem('tubong.session.v1')).toBe('c'.repeat(64));
    expect(localStorage.getItem('tubong.session.v1')).toBeNull();
    requests.verify(); TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([supabaseApiInterceptor])), provideHttpClientTesting(),
    ] });
    http = TestBed.inject(HttpClient); requests = TestBed.inject(HttpTestingController);
    http.get('/api/session.php').subscribe();
    const restore = requests.expectOne(edge);
    expect(restore.request.headers.get('X-Game-Session')).toBe('c'.repeat(64));
    restore.flush({ user: { id: 1 }, csrfToken: 'bearer-session' });
  });

  it('clears an expired or revoked tab session when the server rejects it', () => {
    sessionStorage.setItem('tubong.session.v1', 'c'.repeat(64));
    http.get('/api/session.php').subscribe();
    requests.expectOne(edge).flush({ user: null, csrfToken: 'bearer-session' });
    expect(sessionStorage.getItem('tubong.session.v1')).toBeNull();
  });

  it('clears a tab session on logout', () => {
    sessionStorage.setItem('tubong.session.v1', 'c'.repeat(64));
    http.post('/api/logout.php', {}).subscribe();
    requests.expectOne(edge).flush({ message: 'Logged out.' });
    expect(sessionStorage.getItem('tubong.session.v1')).toBeNull();
  });

  it('saves the itch.io tab session even when localStorage is blocked', () => {
    rememberAllowed = false;
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    http.post('/api/login.php', { identity: 'Player', password: 'password', rememberMe: false }).subscribe();
    requests.expectOne(edge).flush({ user: { id: 1 }, sessionToken: 'c'.repeat(64) });
    expect(sessionStorage.getItem('tubong.session.v1')).toBe('c'.repeat(64));
    http.get('/api/session.php').subscribe();
    const restore = requests.expectOne(edge);
    expect(restore.request.headers.get('X-Game-Session')).toBe('c'.repeat(64));
    restore.flush({ user: { id: 1 } });
  });

  it('ignores shared localStorage tokens and storage events on itch.io', () => {
    rememberAllowed = false;
    localStorage.setItem('tubong.session.v1', 'a'.repeat(64));
    http.post('/api/login.php', { identity: 'Player', password: 'password', rememberMe: false }).subscribe();
    const login = requests.expectOne(edge);
    expect(login.request.headers.has('X-Game-Session')).toBe(false);
    login.flush({ user: { id: 1 }, sessionToken: 'c'.repeat(64) });
    window.dispatchEvent(new StorageEvent('storage', { key: 'tubong.session.v1' }));
    http.get('/api/session.php').subscribe();
    const restore = requests.expectOne(edge);
    expect(restore.request.headers.get('X-Game-Session')).toBe('c'.repeat(64));
    restore.flush({ user: { id: 1 } });
  });

  it('routes protected API reads to the Edge Function with an explicit bearer session', () => {
    sessionStorage.setItem('tubong.session.v1', 'a'.repeat(64));
    http.get('/api/scores.php', { params: { game: 'jolens-blast' } }).subscribe();
    const request = requests.expectOne(edge);
    expect(request.request.body).toMatchObject({ endpoint: 'scores', method: 'GET', data: { game: 'jolens-blast' } });
    expect(request.request.headers.get('X-Game-Session')).toBe('a'.repeat(64));
    expect(request.request.withCredentials).toBe(false);
    request.flush({ game: 'jolens-blast', highScores: [], personalBest: 0 });
  });

  it('keeps tokens out of account responses and persists only remembered logins across browser sessions', () => {
    let body: unknown;
    http.post('/api/login.php', { identity: 'Player', password: 'password', rememberMe: true }).subscribe(result => body = result);
    requests.expectOne(edge).flush({ user: { id: 1 }, sessionToken: 'b'.repeat(64), csrfToken: 'bearer-session' });
    expect(localStorage.getItem('tubong.session.v1')).toBe('b'.repeat(64));
    expect(body).toEqual({ user: { id: 1 }, csrfToken: 'bearer-session' });
    http.post('/api/logout.php', {}).subscribe();
    requests.expectOne(edge).flush({ message: 'Logged out.' });
    expect(localStorage.getItem('tubong.session.v1')).toBeNull();
  });

  it('rejects late responses after the browser changes accounts', () => {
    sessionStorage.setItem('tubong.session.v1', 'a'.repeat(64));
    let status = 0;
    http.get('/api/session.php').subscribe({ error: error => status = error.status });
    const request = requests.expectOne(edge);
    sessionStorage.setItem('tubong.session.v1', 'b'.repeat(64));
    request.flush({ user: { id: 1 }, csrfToken: 'bearer-session' });
    expect(status).toBe(409);
    expect(TestBed.inject(AccountState).user()).toBeNull();
    expect(sessionStorage.getItem('tubong.session.v1')).toBe('b'.repeat(64));
  });
});
