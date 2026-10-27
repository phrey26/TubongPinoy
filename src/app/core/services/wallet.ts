import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, defer, retry, switchMap, tap, throwError, timeout, timer } from 'rxjs';
import { AccountState } from './account-state';
import { Auth, AuthUser } from './auth';

export interface Skin {
  id: string;
  name: string;
  type: string;
  price: number;
  imageUrl: string;
}
export interface ShopCatalog { skins: Skin[]; demoTopupsEnabled: boolean; }

@Injectable({ providedIn: 'root' })
export class Wallet {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly state = inject(AccountState);
  private readonly router = inject(Router);

  catalog() { return this.http.get<ShopCatalog>('/api/catalog.php').pipe(timeout(8000)); }

  change(action: 'consume_juice' | 'purchase' | 'demo_topup', item: string) {
    // The same ID is reused after a lost response, so the server charges only once.
    return defer(() => {
      const requestId = crypto.randomUUID();
      return this.auth.loadSession().pipe(switchMap(session => {
        if (!session.user) return throwError(() => new HttpErrorResponse({ status: 401 }));
        const accountId = session.user.id;
        return this.http.post<{ user: AuthUser }>('/api/wallet.php', { action, item, requestId }, {
          headers: { 'X-CSRF-Token': session.csrfToken },
        }).pipe(
          timeout(8000),
          retry({ count: 1, delay: error => error.status === 0 || error.name === 'TimeoutError'
            ? timer(300) : throwError(() => error) }),
          tap(result => {
            if (this.state.user()?.id === accountId) this.state.set(result.user);
          }),
          catchError((error: HttpErrorResponse) => {
            if (this.state.user()?.id === accountId && error.error?.user?.id === accountId) this.state.set(error.error.user);
            return throwError(() => error);
          }),
        );
      }), catchError(error => {
        if (error.status === 401) {
          this.state.set(null);
          void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
        }
        return throwError(() => error);
      }));
    });
  }
}
