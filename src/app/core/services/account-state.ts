import { Injectable, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { AuthUser } from './auth';

@Injectable({ providedIn: 'root' })
export class AccountState {
  private readonly subject = new BehaviorSubject<AuthUser | null>(null);
  readonly changes$ = this.subject.asObservable();
  private readonly current = signal<AuthUser | null>(null);
  readonly user = this.current.asReadonly();

  set(user: AuthUser | null): void {
    const previous = this.current();
    if (user && previous?.id === user.id && (user.walletVersion ?? 0) < (previous.walletVersion ?? 0)) return;
    this.current.set(user);
    this.subject.next(user);
  }
}
