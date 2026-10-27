import { Injectable, inject } from '@angular/core';
import { distinctUntilChanged, map } from 'rxjs';
import { AccountState } from './account-state';

@Injectable({ providedIn: 'root' })
export class Currency {
  private readonly account = inject(AccountState);
  readonly coins$ = this.account.changes$.pipe(map(user => user?.tansans ?? 0), distinctUntilChanged());
  getCoins(): number { return this.account.user()?.tansans ?? 0; }
}
