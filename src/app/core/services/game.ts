import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { switchMap, throwError, timeout } from 'rxjs';
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
    return this.auth.loadSession().pipe(
      switchMap(session => session.user
        ? this.http.post<TutorialStatus>('/api/tutorial.php', { game }, {
          headers: { 'X-CSRF-Token': session.csrfToken },
        })
        : throwError(() => new HttpErrorResponse({ status: 401 }))),
      timeout(8000),
    );
  }

  saveScore(game: GameId, points: number) {
    return this.auth.loadSession().pipe(
      switchMap(session => session.user
        ? this.http.post<GameScores>('/api/scores.php', { game, points }, {
          headers: { 'X-CSRF-Token': session.csrfToken },
        })
        : throwError(() => new HttpErrorResponse({ status: 401 }))),
      timeout(8000),
    );
  }
}
