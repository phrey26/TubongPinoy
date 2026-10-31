import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, defer, switchMap, tap, throwError, timeout } from 'rxjs';
import { AccountState } from './account-state';
import { Auth, AuthUser } from './auth';
import { GameId } from './game';
import { Collectible, GameSkin } from './customization';

export type SettingsChange =
  | { action: 'username'; username: string; currentPassword: string }
  | { action: 'password'; newPassword: string; confirmPassword: string; currentPassword: string };

@Injectable({
  providedIn: 'root',
})
export class User {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly account = inject(AccountState);
  private readonly router = inject(Router);

  inventory() {
    return defer(() => {
      const id = this.account.user()?.id;
      return this.http.get<{ items: GameSkin[]; collectibles: Collectible[]; user: AuthUser }>('/api/inventory.php').pipe(
        timeout(8000), tap(result => this.accept(result.user, id)),
        catchError(error => this.handleError(error, id)),
      );
    });
  }

  saveProfile(displayName: string, avatarId: string) {
    return this.save('profile', { displayName, avatarId });
  }

  equip(game: GameId, skinId: string) { return this.save('inventory', { game, skinId }); }

  saveSettings(change: SettingsChange) { return this.save('settings', change); }

  private save(endpoint: 'profile' | 'inventory' | 'settings', body: object) {
    return defer(() => {
      const id = this.account.user()?.id;
      return this.auth.loadSession().pipe(
        switchMap(session => {
          if (!session.user || !id) return throwError(() => new HttpErrorResponse({ status: 401 }));
          if (session.user.id !== id || this.account.user()?.id !== id) {
            return throwError(() => new HttpErrorResponse({ status: 409,
              error: { message: 'Your account changed. Please reload this page before saving.' } }));
          }
          return this.http.post<{ user: AuthUser }>(`/api/${endpoint}.php`, body, {
            headers: { 'X-CSRF-Token': session.csrfToken },
          });
        }),
        timeout(8000), tap(result => this.accept(result.user, id)),
        catchError(error => this.handleError(error, id)),
      );
    });
  }

  private accept(user: AuthUser, id: number | undefined): void {
    if (id && this.account.user()?.id === id && user.id === id) this.account.set(user);
  }

  private handleError(error: HttpErrorResponse, id: number | undefined) {
    if (error.status === 401 && this.account.user()?.id === id) {
      this.account.set(null);
      void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
    }
    return throwError(() => error);
  }
}
