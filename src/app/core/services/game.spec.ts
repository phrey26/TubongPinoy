import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Game } from './game';
import { AccountState } from './account-state';

describe('Game scores API', () => {
  let service: Game;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(Game);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); vi.useRealTimers(); });

  it('loads only the requested game rankings', () => {
    service.scores('tumbang-preso').subscribe();
    const request = http.expectOne('/api/scores.php?game=tumbang-preso');
    expect(request.request.method).toBe('GET');
    request.flush({ game: 'tumbang-preso', highScores: [], personalBest: 0 });
  });

  it('starts a server-owned run with CSRF protection and no claimed points', () => {
    TestBed.inject(AccountState).set({ id: 1, username: 'Alice', tansans: 0, juice: 100 });
    service.runAction('jolens-blast', 'start').subscribe();
    http.expectOne('/api/session.php').flush({ user: { id: 1 }, csrfToken: 'token' });
    const request = http.expectOne('/api/game-run.php');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('token');
    expect(request.request.body).toEqual({ game: 'jolens-blast', action: 'start', requestId: expect.any(String) });
    expect(request.request.body.points).toBeUndefined();
    request.flush({ run: { id: 'test' }, user: { id: 1 } });
  });

  it('reuses the same operation ID and sequence after a lost response', async () => {
    vi.useFakeTimers();
    const user = { id: 1, username: 'Alice', tansans: 0, juice: 100 };
    TestBed.inject(AccountState).set(user);
    service.runAction('tumbang-preso', 'start').subscribe();
    http.expectOne('/api/session.php').flush({ user, csrfToken: 'one' });
    const original = http.expectOne('/api/game-run.php');
    const payload = original.request.body;
    original.error(new ProgressEvent('error'));
    await vi.advanceTimersByTimeAsync(500);
    http.expectOne('/api/session.php').flush({ user, csrfToken: 'two' });
    const retry = http.expectOne('/api/game-run.php');
    expect(retry.request.body).toEqual(payload);
    expect(retry.request.headers.get('X-CSRF-Token')).toBe('two');
    retry.flush({ user, run: { id: 'server-run', sequence: 0 } });
  });

  it('reads the tutorial status for the selected game', () => {
    service.tutorial('tumbang-preso').subscribe();
    http.expectOne('/api/tutorial.php?game=tumbang-preso').flush({ game: 'tumbang-preso', seen: false });
  });

  it('marks a tutorial seen using a server session and CSRF token', () => {
    TestBed.inject(AccountState).set({ id: 1, username: 'Alice', tansans: 0, juice: 100 });
    service.markTutorialSeen('jolens-blast').subscribe();
    http.expectOne('/api/session.php').flush({ user: { id: 1 }, csrfToken: 'token' });
    const request = http.expectOne('/api/tutorial.php');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('token');
    expect(request.request.body).toEqual({ game: 'jolens-blast' });
    request.flush({ game: 'jolens-blast', seen: true });
  });

  it('does not submit a guest score', () => {
    let status = 0;
    service.runAction('tumbang-preso', 'start').subscribe({ error: error => status = error.status });
    http.expectOne('/api/session.php').flush({ user: null, csrfToken: 'token' });
    http.expectNone('/api/game-run.php');
    expect(status).toBe(401);
  });

  it('does not save another player’s score after an account switch', () => {
    TestBed.inject(AccountState).set({ id: 1, username: 'Alice', tansans: 0, juice: 100 });
    let status = 0;
    service.runAction('tumbang-preso', 'start').subscribe({ error: error => status = error.status });
    http.expectOne('/api/session.php').flush({ user: { id: 2 }, csrfToken: 'other-account' });
    http.expectNone('/api/game-run.php');
    expect(status).toBe(409);
  });
});
