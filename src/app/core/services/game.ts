import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { defer, retry, switchMap, tap, throwError, timeout, timer } from 'rxjs';
import { AccountState } from './account-state';
import type { AuthUser } from './auth';
import type { Obstacle } from '../../features/games/tumbang-preso/shot-physics';
import { Auth } from './auth';

export type GameId = 'tumbang-preso' | 'jolens-blast';
export interface RankedRun {
  id: string; game: GameId; sequence: number; expiresAt: number;
  status: 'ready' | 'hit' | 'miss' | 'bet' | 'playing' | 'won' | 'finished';
  score: number; level: number; inventory: number; completed: boolean;
  obstacles: Obstacle[];
  targets: { x: number; y: number; radius: number; dx: number; dy: number }[];
}
export interface RunResult { run: RankedRun; user: AuthUser; }
export type RunAction = 'start' | 'shot' | 'next' | 'retry' | 'round' | 'finish';
export interface TutorialStatus { game: GameId; seen: boolean; }
export interface GameScores {
  game: GameId;
  highScores: { userId: number; username: string; displayName?: string; avatarId?: string; points: number }[];
  personalBest: number;
}

@Injectable({
  providedIn: 'root',
})
export class Game {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly account = inject(AccountState);

  scores(game: GameId) {
    return this.http.get<GameScores>('/api/scores.php', { params: { game } }).pipe(timeout(8000));
  }

  tutorial(game: GameId) {
    return this.http.get<TutorialStatus>('/api/tutorial.php', { params: { game } }).pipe(timeout(8000));
  }

  markTutorialSeen(game: GameId) {
    return this.save<TutorialStatus>('tutorial', { game });
  }

  runAction(game: GameId, action: RunAction, run?: RankedRun, input: { vx?: number; vy?: number; bet?: number } = {}) {
    // Captured once per operation, including retries after a lost response.
    const requestId = crypto.randomUUID();
    const accountId = this.auth.user()?.id;
    const body = { game, action, requestId, ...(run ? { runId: run.id, sequence: run.sequence } : {}), ...input };
    return this.save<RunResult>('game-run', body).pipe(
      retry({ count: 2, delay: error => error.status === 0 || error.status === 425 || error.name === 'TimeoutError'
        ? timer(500) : throwError(() => error) }),
      tap(result => {
        if (this.account.user()?.id !== accountId || result.user.id !== accountId) {
          throw new HttpErrorResponse({ status: 409, error: { message: 'Your account changed. Start a new game.' } });
        }
        this.account.set(result.user);
      }),
    );
  }

  private save<T>(endpoint: 'game-run' | 'tutorial', body: object) {
    const accountId = this.auth.user()?.id;
    return defer(() => {
      return this.auth.loadSession().pipe(
        switchMap(session => {
          if (!session.user || !accountId) return throwError(() => new HttpErrorResponse({ status: 401 }));
          if (session.user.id !== accountId || this.auth.user()?.id !== accountId) {
            return throwError(() => new HttpErrorResponse({ status: 409,
              error: { message: 'Your account changed. Please reload the game before continuing.' } }));
          }
          return this.http.post<T>(`/api/${endpoint}.php`, body, {
            headers: { 'X-CSRF-Token': session.csrfToken },
          });
        }),
        timeout(8000),
      );
    });
  }
}
