import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Game, GameScores } from '../../core/services/game';
import { Leaderboard } from './leaderboard';

const scores: GameScores = { game: 'tumbang-preso', highScores: [
  { userId: 1, username: 'Juan', points: 500 },
], personalBest: 500 };

function setup() {
  const service = { scores: vi.fn(() => of(scores)), saveScore: vi.fn(() => of(scores)) };
  TestBed.configureTestingModule({ providers: [{ provide: Game, useValue: service }] });
  const fixture = TestBed.createComponent(Leaderboard);
  fixture.componentRef.setInput('game', 'tumbang-preso');
  fixture.componentRef.setInput('score', 0);
  fixture.detectChanges();
  return { fixture, service, component: fixture.componentInstance };
}

describe('Leaderboard', () => {
  it('shows saved players and the current user best, then saves changed scores', () => {
    const { fixture, service } = setup();
    expect(fixture.nativeElement.textContent).toContain('Juan');
    expect(fixture.nativeElement.textContent).toContain('Your best: 500');
    expect(service.saveScore).not.toHaveBeenCalled();
    fixture.componentRef.setInput('score', 600);
    fixture.detectChanges();
    expect(service.saveScore).toHaveBeenCalledWith('tumbang-preso', 600);
    fixture.componentRef.setInput('score', 0);
    fixture.detectChanges();
    expect(service.saveScore).toHaveBeenCalledTimes(1);
  });

  it('keeps failed scores available for retry even after a new game starts', () => {
    const { fixture, service, component } = setup();
    service.saveScore.mockReturnValueOnce(throwError(() => new Error('offline')));
    fixture.componentRef.setInput('score', 600);
    fixture.detectChanges();
    expect(component.error()).toContain('could not be saved');
    fixture.componentRef.setInput('score', 0);
    fixture.detectChanges();
    component.refresh();
    expect(service.saveScore).toHaveBeenLastCalledWith('tumbang-preso', 600);
    expect(component.failedScore).toBe(0);
  });

  it('serializes score updates behind an outstanding save', () => {
    const { fixture, service } = setup();
    const pending = new Subject<GameScores>();
    service.saveScore.mockReturnValueOnce(pending);
    fixture.componentRef.setInput('score', 600);
    fixture.detectChanges();
    fixture.componentRef.setInput('score', 700);
    fixture.detectChanges();
    expect(service.saveScore).toHaveBeenCalledTimes(1);
    pending.next(scores);
    pending.complete();
    expect(service.saveScore).toHaveBeenLastCalledWith('tumbang-preso', 700);
  });
});
