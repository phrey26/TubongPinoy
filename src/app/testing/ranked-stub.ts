import { defer, map, of } from 'rxjs';
import { GameId, RankedRun, RunAction } from '../core/services/game';
import { MemoryEnergy } from './energy-stub';
import { generateLevel } from '../features/games/tumbang-preso/level-generation';
import { scatterMarbles } from '../features/games/jolens-blast/marble-placement';

/** UI transport double only. PHP integration and parity fixtures test actual verification. */
export class MemoryRanked {
  client?: { currentScore: number; currentLevel?: number; marbleInventory?: number;
    hasCompletedShot?: boolean; hitAge?: number; showRoundWon?: boolean;
    marblesOnBoard?: RankedRun['targets'] };
  constructor(private energy: MemoryEnergy) {}
  tutorial() { return of({ seen: false }); }
  markTutorialSeen() { return of({ seen: true }); }
  scores() { return of({ highScores: [], personalBest: 0 }); }
  runAction(game: GameId, action: RunAction, prior?: RankedRun, input: { bet?: number } = {}) {
    return defer(() => {
      const cost = action === 'round' || action === 'retry'
        ? this.energy.consumeEnergy(action === 'round' ? 'jolens_round' : 'tumbang_retry')
        : of({ user: { id: 1, username: 'Player', tansans: 1000, juice: this.energy.getEnergyLevelValue() } });
      return cost.pipe(map(result => {
        const ui = this.client!;
        const level = action === 'start' ? 1 : (ui.currentLevel ?? 1) + Number(action === 'next');
        const run: RankedRun = { id: 'test-run', game, sequence: (prior?.sequence ?? -1) + 1,
          expiresAt: Date.now() + 7200000, status: 'ready', score: ui.currentScore,
          inventory: ui.marbleInventory ?? 10, level, completed: ui.hasCompletedShot ?? false,
          obstacles: game === 'tumbang-preso' ? generateLevel(level).obstacles : [], targets: ui.marblesOnBoard ?? [] };
        if (action === 'start') { run.score = 0; run.inventory = 10; run.completed = false; run.status = game === 'jolens-blast' ? 'bet' : 'ready'; }
        if (action === 'shot') {
          run.completed = true;
          if (game === 'tumbang-preso') { run.status = ui.hitAge ? 'hit' : 'miss'; run.score += ui.hitAge ? 100 : 0; }
          else run.status = run.inventory <= 0 ? 'finished' : ui.showRoundWon ? 'won' : 'playing';
        }
        if (action === 'round') {
          run.inventory -= input.bet!; run.status = 'playing';
          run.targets = scatterMarbles(input.bet! * 2, { x: 225, y: 300 }, 150, 20)
            .map(p => ({ ...p, radius: 20, dx: 0, dy: 0 }));
        }
        if (action === 'finish') { run.status = 'finished'; run.score = run.completed ? run.inventory * 50 : 0; }
        return { ...result, run };
      }));
    });
  }
}
