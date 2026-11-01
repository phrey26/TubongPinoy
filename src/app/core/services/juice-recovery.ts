import { DestroyRef, Injectable, Injector, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, fromEvent, interval, timeout } from 'rxjs';
import { AccountState } from './account-state';
import type { AuthUser } from './auth';

@Injectable({ providedIn: 'root' })
export class JuiceRecovery {
  private readonly account = inject(AccountState);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly now = signal(Date.now());
  private readonly clockOffset = signal(0);
  private readonly syncing = signal(false);
  private readonly syncError = signal(false);
  private retryAt = 0;
  private accountId?: number;

  readonly secondsRemaining = computed(() => {
    const next = this.account.user()?.nextJuiceAt ?? 0;
    return next > 0 ? Math.max(0, Math.ceil((next - this.now() - this.clockOffset()) / 1000)) : 0;
  });
  readonly unlimitedSecondsRemaining = computed(() => {
    const until = this.account.user()?.unlimitedJuiceUntil ?? 0;
    return Math.max(0, Math.ceil((until - this.now() - this.clockOffset()) / 1000));
  });
  readonly unlimitedExpiresAt = computed(() =>
    this.unlimitedSecondsRemaining() > 0 ? this.account.user()?.unlimitedJuiceUntil : null);
  readonly fullRefillAt = computed(() => {
    const user = this.account.user();
    if (!user || user.juice >= 100 || !user.nextJuiceAt) return null;
    // The next point includes the partially elapsed interval; only later points
    // need a complete 144-second interval each.
    return user.nextJuiceAt + (99 - user.juice) * 144000;
  });
  readonly status = computed(() => {
    const user = this.account.user();
    if (!user) return '';
    if (user.permanentJuice) return 'Unlimited Juice active';
    const unlimitedSeconds = this.unlimitedSecondsRemaining();
    if (unlimitedSeconds > 0) {
      const minutes = Math.floor(unlimitedSeconds / 60);
      return `Unlimited Juice: ${minutes}:${String(unlimitedSeconds % 60).padStart(2, '0')} remaining`;
    }
    if (user.juice >= 100) return 'Juice is full';
    if (this.syncError()) return 'Reconnecting to refill Juice…';
    if (!user.nextJuiceAt || this.syncing() || this.secondsRemaining() === 0) return 'Updating Juice…';
    const seconds = this.secondsRemaining();
    return `Next Juice in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  constructor() {
    effect(() => {
      const user = this.account.user();
      if (user?.id !== this.accountId) {
        this.accountId = user?.id;
        this.retryAt = 0;
        this.syncError.set(false);
      }
      // The display follows server time, even when the device clock is wrong.
      const receivedAt = Date.now();
      this.now.set(receivedAt);
      this.clockOffset.set(user?.serverTime ? user.serverTime - receivedAt : 0);
    });
    interval(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.tick());
    fromEvent(document, 'visibilitychange').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!document.hidden) this.tick();
    });
  }

  private tick(): void {
    this.now.set(Date.now());
    const user = this.account.user();
    if (!user || user.juice >= 100 || !user.nextJuiceAt || this.secondsRemaining() > 0 ||
        this.syncing() || Date.now() < this.retryAt) return;
    const accountId = user.id;
    this.syncing.set(true);
    // Only server-confirmed balances are displayed or used to buy attempts.
    this.injector.get(HttpClient).get<{ user: AuthUser }>('/api/me.php').pipe(
      timeout(8000), takeUntilDestroyed(this.destroyRef), finalize(() => this.syncing.set(false)),
    ).subscribe({
      next: result => {
        if (this.account.user()?.id !== accountId || result.user.id !== accountId) return;
        this.account.set(result.user);
        this.syncError.set(false);
      },
      error: (error: HttpErrorResponse) => {
        if (this.account.user()?.id !== accountId) return;
        this.syncError.set(true);
        this.retryAt = Date.now() + 15000;
        if (error.status === 401) this.account.set(null);
      },
    });
  }
}
