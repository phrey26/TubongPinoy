import { Injectable, Injector, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { AccountState } from './account-state';
import { Wallet } from './wallet';

@Injectable({ providedIn: 'root' })
export class Energy {
  private readonly account = inject(AccountState);
  private readonly injector = inject(Injector);
  private serverTime = 0;
  private receivedAt = 0;
  constructor() {
    this.account.changes$.pipe(takeUntilDestroyed()).subscribe(user => {
      this.serverTime = user?.serverTime ?? 0;
      this.receivedAt = performance.now();
    });
  }
  getEnergyLevel() {
    return this.account.changes$.pipe(map(user => user?.juice ?? 0), distinctUntilChanged());
  }
  getEnergyLevelValue(): number { return this.account.user()?.juice ?? 0; }
  hasUnlimited(): boolean {
    const now = this.serverTime ? this.serverTime + performance.now() - this.receivedAt : Date.now();
    return this.account.user()?.permanentJuice === true || (this.account.user()?.unlimitedJuiceUntil ?? 0) > now;
  }
  consumeEnergy(reason: 'tumbang_retry' | 'jolens_round') {
    return this.injector.get(Wallet).change('consume_juice', reason);
  }
}
