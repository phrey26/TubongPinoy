import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, finalize, shareReplay, switchMap, tap, throwError, timeout } from 'rxjs';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  tansans: number;
  juice: number;
}

export interface AuthSession {
  user: AuthUser | null;
  csrfToken: string;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly currentUser = signal<AuthUser | null>(null);
  readonly user = this.currentUser.asReadonly();
  private sessionRequest?: Observable<AuthSession>;

  constructor(private http: HttpClient) {}

  // The server cookie establishes identity; browser storage is never trusted.
  loadSession(): Observable<AuthSession> {
    if (!this.sessionRequest) {
      this.sessionRequest = this.http.get<AuthSession>('/api/session.php').pipe(
        timeout(8000),
        tap(session => this.currentUser.set(session.user)),
        catchError(error => {
          this.currentUser.set(null);
          return throwError(() => error);
        }),
        finalize(() => this.sessionRequest = undefined),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.sessionRequest;
  }

  signup(data: { username: string; email: string; password: string; terms: boolean }): Observable<AuthSession> {
    return this.authenticate('signup', data);
  }

  login(data: { identity: string; password: string; rememberMe: boolean }): Observable<AuthSession> {
    return this.authenticate('login', data);
  }

  logout(): Observable<{ message: string }> {
    return this.loadSession().pipe(
      switchMap(session => this.http.post<{ message: string }>('/api/logout.php', {}, {
        headers: { 'X-CSRF-Token': session.csrfToken },
      })),
      timeout(8000),
      tap(() => this.currentUser.set(null)),
    );
  }

  private authenticate(action: 'login' | 'signup', data: object): Observable<AuthSession> {
    return this.loadSession().pipe(
      switchMap(session => this.http.post<AuthSession>(`/api/${action}.php`, data, {
        headers: { 'X-CSRF-Token': session.csrfToken },
      })),
      timeout(8000),
      tap(session => this.currentUser.set(session.user)),
    );
  }
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500 &&
      typeof error.error?.message === 'string') return error.error.message;
  return 'We could not reach the account service. Please try again shortly.';
}

export function safeReturnUrl(value: string | null): string {
  return value && !/[\\\u0000-\u001f]/.test(value) &&
    /^\/(?:games(?:\/[a-z0-9-]+)*|shop|topup)(?:[?#].*)?$/.test(value) ? value : '/games';
}
