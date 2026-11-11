import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AccountState } from './account-state';
import { supabaseApiInterceptor } from './backend-api';
import { environment } from '../../../environments/environment';

describe('Supabase API transport', () => {
  let http: HttpClient;
  let requests: HttpTestingController;
  const edge = environment.supabaseUrl + '/functions/v1/tubong-api';
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([supabaseApiInterceptor])), provideHttpClientTesting(),
    ] });
    http = TestBed.inject(HttpClient); requests = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { requests.verify(); localStorage.clear(); sessionStorage.clear(); });

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
