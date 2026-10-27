import { Injectable, Injector, inject } from '@angular/core';
import { distinctUntilChanged, map } from 'rxjs';
import { AccountState } from './account-state';
import { Wallet } from './wallet';

@Injectable({ providedIn: 'root' })
export class Energy {
  private readonly account = inject(AccountState);
  private readonly injector = inject(Injector);
  getEnergyLevel() {
    return this.account.changes$.pipe(map(user => user?.juice ?? 0), distinctUntilChanged());
  }
  getEnergyLevelValue(): number { return this.account.user()?.juice ?? 0; }
  hasUnlimited(): boolean { return (this.account.user()?.unlimitedJuiceUntil ?? 0) > Date.now(); }
  consumeEnergy(reason: 'tumbang_retry' | 'jolens_round') {
    return this.injector.get(Wallet).change('consume_juice', reason);
  }
}
