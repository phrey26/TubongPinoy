import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Game } from './game';

describe('Game scores API', () => {
  let service: Game;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(Game);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads only the requested game rankings', () => {
    service.scores('tumbang-preso').subscribe();
    const request = http.expectOne('/api/scores.php?game=tumbang-preso');
    expect(request.request.method).toBe('GET');
    request.flush({ game: 'tumbang-preso', highScores: [], personalBest: 0 });
  });

  it('submits the score with session CSRF protection and no client identity', () => {
    service.saveScore('jolens-blast', 600).subscribe();
    http.expectOne('/api/session.php').flush({ user: { id: 1 }, csrfToken: 'token' });
    const request = http.expectOne('/api/scores.php');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('token');
    expect(request.request.body).toEqual({ game: 'jolens-blast', points: 600 });
    request.flush({ game: 'jolens-blast', highScores: [], personalBest: 600 });
  });

  it('reads the tutorial status for the selected game', () => {
    service.tutorial('tumbang-preso').subscribe();
    http.expectOne('/api/tutorial.php?game=tumbang-preso').flush({ game: 'tumbang-preso', seen: false });
  });

  it('marks a tutorial seen using a server session and CSRF token', () => {
    service.markTutorialSeen('jolens-blast').subscribe();
    http.expectOne('/api/session.php').flush({ user: { id: 1 }, csrfToken: 'token' });
    const request = http.expectOne('/api/tutorial.php');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('token');
    expect(request.request.body).toEqual({ game: 'jolens-blast' });
    request.flush({ game: 'jolens-blast', seen: true });
  });

  it('does not submit a guest score', () => {
    let status = 0;
    service.saveScore('tumbang-preso', 100).subscribe({ error: error => status = error.status });
    http.expectOne('/api/session.php').flush({ user: null, csrfToken: 'token' });
    http.expectNone('/api/scores.php');
    expect(status).toBe(401);
  });
});
