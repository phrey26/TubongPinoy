import { DestroyRef, Injectable, inject } from '@angular/core';
import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { defer, map } from 'rxjs';
import { AccountState } from './account-state';
import { environment } from '../../../environments/environment';
import { canPersistSession } from './session-storage-policy';

const SESSION_KEY = 'tubong.session.v1';

/** Transport for the existing app contracts, now served entirely by Supabase. */
@Injectable({ providedIn: 'root' })
export class BackendApi {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly account = inject(AccountState);
  private readonly destroyRef = inject(DestroyRef);
  private readonly guestId = crypto.randomUUID();
  private memoryToken = '';
  private revision = 0;
  private readonly persistSession = canPersistSession();

  constructor() {
    const url = new URL(environment.supabaseUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') ||
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(environment.supabaseKey)) {
      throw new Error('Invalid public Supabase configuration.');
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_KEY && event.key !== null) return;
      this.revision++;
      this.memoryToken = '';
      this.account.set(null);
    };
    window.addEventListener('storage', onStorage);
    this.destroyRef.onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  private token(): string {
    if (!this.persistSession) return this.memoryToken;
    try { return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || this.memoryToken; }
    catch { return this.memoryToken; }
  }

  private store(token: string, remember: boolean): void {
    this.memoryToken = token;
    this.revision++;
    if (!this.persistSession) return;
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      if (token) (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, token);
    } catch { /* A blocked browser store keeps this login in memory for this page. */ }
  }

  request(endpoint: string, method: string, data: Record<string, unknown>, url: string) {
    return defer(() => {
      const token = this.token(), revision = this.revision;
      let remember = false;
      try { remember = this.persistSession && !!localStorage.getItem(SESSION_KEY); } catch { /* Memory-only session. */ }
      return this.http.post<Record<string, unknown>>(`${environment.supabaseUrl}/functions/v1/tubong-api`, {
        endpoint, method, data, guestId: this.guestId,
      }, {
        headers: { apikey: environment.supabaseKey, ...(token ? { 'X-Game-Session': token } : {}) },
        observe: 'response',
      }).pipe(map(response => {
        if (revision !== this.revision || token !== this.token()) {
          throw new HttpErrorResponse({ status: 409, error: { message: 'Your account changed. Please try again.' }, url });
        }
        const body = { ...response.body };
        if (typeof body['sessionToken'] === 'string') {
          this.store(body['sessionToken'], endpoint === 'login' ? data['rememberMe'] === true : remember);
        } else if (endpoint === 'logout' || (endpoint === 'session' && body['user'] === null)) {
          if (token) this.store('', false);
        }
        // Session tokens stay in the transport, never in component/account snapshots.
        delete body['sessionToken'];
        return new HttpResponse({ body, status: response.status, headers: response.headers, url });
      }));
    });
  }
}

export const supabaseApiInterceptor: HttpInterceptorFn = (request, next) => {
  const match = /^\/api\/([a-z-]+)\.php(?:\?(.*))?$/.exec(request.url);
  if (!match) return next(request);
  const data: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(match[2])) data[key] = value;
  for (const key of request.params.keys()) data[key] = request.params.get(key);
  if (request.method === 'POST' && request.body && typeof request.body === 'object') Object.assign(data, request.body);
  return inject(BackendApi).request(match[1], request.method, data, request.urlWithParams);
};
