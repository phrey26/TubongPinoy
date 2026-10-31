import { BehaviorSubject, of } from 'rxjs';

/** Isolated game-physics tests do not make real account purchases. */
export class MemoryEnergy {
  private readonly energy = new BehaviorSubject(100);
  unlimited = false;
  getEnergyLevel() { return this.energy.asObservable(); }
  getEnergyLevelValue() { return this.energy.value; }
  hasUnlimited() { return this.unlimited; }
  consumeEnergy(reason: number | 'tumbang_retry' | 'jolens_round') {
    const amount = typeof reason === 'number' ? reason : 20;
    if (!this.unlimited) this.energy.next(Math.max(0, this.energy.value - amount));
    return of({ user: { id: 1, username: 'Player', tansans: 1000, juice: this.energy.value } });
  }
  addEnergy(amount: number) { this.energy.next(Math.min(100, this.energy.value + amount)); }
}
