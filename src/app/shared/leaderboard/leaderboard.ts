import { Component, Input, OnChanges, OnInit, SimpleChanges, DestroyRef, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, concatMap, finalize, tap } from 'rxjs';
import { Game, GameId, GameScores } from '../../core/services/game';

@Component({
  selector: 'app-leaderboard',
  imports: [DecimalPipe],
  template: `
    <section class="bg-white p-4 rounded-3xl shadow-lg border-4 border-purple-300" aria-label="Game high scores">
      <h2 class="text-xl font-extrabold text-purple-700 mb-3">Leaderboard</h2>
      <p class="text-sm font-bold mb-3">Your best: {{ personalBest() | number }}</p>
      @if (loading()) { <p role="status">Updating scores…</p> }
      @if (error()) { <p role="alert" class="text-sm text-red-700 mb-3">{{ error() }}</p> }
      @if (!loading() && !error() && highScores().length === 0) {
        <p class="text-sm mb-3">No scores yet. Be the first to play!</p>
      }
      <ol class="space-y-3">
        @for (score of highScores(); track score.userId; let i = $index) {
          <li class="flex justify-between gap-3 p-3 rounded-xl bg-purple-50 border-2 border-purple-100">
            <span class="font-bold break-all">{{ i + 1 }}. {{ score.username }}</span>
            <span class="font-black text-purple-700 shrink-0">{{ score.points | number }}</span>
          </li>
        }
      </ol>
      <button type="button" class="mt-3 min-h-11 px-3 border-2 border-purple-300 rounded-xl font-bold text-purple-700"
        [disabled]="loading()" (click)="refresh()">{{ failedScore ? 'Retry saving score' : 'Refresh scores' }}</button>
    </section>
  `,
})
export class Leaderboard implements OnInit, OnChanges {
  @Input({ required: true }) game!: GameId;
  @Input() score = 0;
  private readonly service = inject(Game);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<number>();
  readonly highScores = signal<GameScores['highScores']>([]);
  readonly personalBest = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  failedScore = 0;

  ngOnInit(): void {
    // Serialize reads and writes so an earlier response cannot replace newer scores.
    this.requests.pipe(concatMap(points => {
      this.loading.set(true);
      this.error.set('');
      return (points > 0 ? this.service.saveScore(this.game, points) : this.service.scores(this.game)).pipe(
        tap(result => {
          this.highScores.set(result.highScores);
          this.personalBest.set(result.personalBest);
          if (points >= this.failedScore) this.failedScore = 0;
        }),
        catchError(() => {
          this.failedScore = Math.max(this.failedScore, points);
          this.error.set(points > 0 ? 'Your score could not be saved. Please retry.' : 'Scores could not be loaded. Please retry.');
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      );
    }), takeUntilDestroyed(this.destroyRef)).subscribe();
    this.requests.next(this.score);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['score'] && !changes['score'].firstChange && this.score > 0) {
      this.requests.next(Math.max(this.score, this.failedScore));
    }
  }

  refresh(): void { this.requests.next(this.failedScore); }
}
