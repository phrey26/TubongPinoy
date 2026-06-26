import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Energy {

  private energySubject = new BehaviorSubject<number>(100);
  private maxEnergy = 100;

  getEnergyLevel(): Observable<number> {
    return this.energySubject.asObservable();
  }

  getEnergyLevelValue(): number {
    return this.energySubject.value;
  }

  consumeEnergy(amount: number) {
    const current = this.energySubject.value;
    if (current >= amount) {
      this.energySubject.next(current - amount);
    }
  }

  addEnergy(amount: number) {
    const current = this.energySubject.value;
    this.energySubject.next(Math.min(current + amount, this.maxEnergy));
  }
}
