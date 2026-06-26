import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Currency {

  private coinsSubject = new BehaviorSubject<number>(1000);

  // Observable for components to subscribe to
  coins$ = this.coinsSubject.asObservable();

  getCoins(): number {
    return this.coinsSubject.value;
  }

  add(amount: number): void {
    const current = this.coinsSubject.value;
    this.coinsSubject.next(current + amount);
  }

  spend(amount: number): boolean {
    const current = this.coinsSubject.value;

    if (current < amount) {
      return false;
    }

    this.coinsSubject.next(current - amount);
    return true;
  }
}
