import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Game, GameScores } from '../../core/services/game';
import { Leaderboard } from './leaderboard';

const scores: GameScores = { game: 'tumbang-preso', highScores: [
  { userId: 1, username: 'Juan', points: 500 },
], personalBest: 500 };

function setup() {
  const service = { scores: vi.fn(() => of(scores)) };
  TestBed.configureTestingModule({ providers: [{ provide: Game, useValue: service }] });
  const fixture = TestBed.createComponent(Leaderboard);
  fixture.componentRef.setInput('game', 'tumbang-preso');
  fixture.componentRef.setInput('score', 0);
  fixture.detectChanges();
  return { fixture, service, component: fixture.componentInstance };
}

describe('Leaderboard', () => {
  it('shows saved players and the current user best, then refreshes after verified scores change', () => {
    const { fixture, service } = setup();
    expect(fixture.nativeElement.textContent).toContain('Juan');
    expect(fixture.nativeElement.textContent).toContain('Your best: 500');
    expect(service.scores).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('score', 600);
    fixture.detectChanges();
    expect(service.scores).toHaveBeenCalledWith('tumbang-preso');
    fixture.componentRef.setInput('score', 0);
    fixture.detectChanges();
    expect(service.scores).toHaveBeenCalledTimes(2);
  });

  it('allows retrying a failed leaderboard read', () => {
    const { fixture, service, component } = setup();
    service.scores.mockReturnValueOnce(throwError(() => new Error('offline')));
    fixture.componentRef.setInput('score', 600);
    fixture.detectChanges();
    expect(component.error()).toContain('could not be loaded');
    fixture.componentRef.setInput('score', 0);
    fixture.detectChanges();
    component.refresh();
    expect(service.scores).toHaveBeenLastCalledWith('tumbang-preso');
    expect(component.error()).toBe('');
  });

  it('serializes refreshes behind an outstanding read', () => {
    const { fixture, service } = setup();
    const pending = new Subject<GameScores>();
    service.scores.mockReturnValueOnce(pending);
    fixture.componentRef.setInput('score', 600);
    fixture.detectChanges();
    fixture.componentRef.setInput('score', 700);
    fixture.detectChanges();
    expect(service.scores).toHaveBeenCalledTimes(2);
    pending.next(scores);
    pending.complete();
    expect(service.scores).toHaveBeenLastCalledWith('tumbang-preso');
  });
});
