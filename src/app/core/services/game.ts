import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { defer, switchMap, throwError, timeout } from 'rxjs';
import { Auth } from './auth';

export type GameId = 'tumbang-preso' | 'jolens-blast';
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

  scores(game: GameId) {
    return this.http.get<GameScores>('/api/scores.php', { params: { game } }).pipe(timeout(8000));
  }

  tutorial(game: GameId) {
    return this.http.get<TutorialStatus>('/api/tutorial.php', { params: { game } }).pipe(timeout(8000));
  }

  markTutorialSeen(game: GameId) {
    return this.save<TutorialStatus>('tutorial', { game });
  }

  saveScore(game: GameId, points: number) {
    return this.save<GameScores>('scores', { game, points });
  }

  private save<T>(endpoint: 'scores' | 'tutorial', body: object) {
    return defer(() => {
      const accountId = this.auth.user()?.id;
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
