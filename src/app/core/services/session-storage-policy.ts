import { InjectionToken } from '@angular/core';

/** Keep durable Remember Me tokens off itch.io's shared game origins. */
export function canRememberSession(hostname = window.location.hostname): boolean {
  return hostname !== 'html-classic.itch.zone' && hostname !== 'html.itch.zone';
}
export const REMEMBER_SESSION_ALLOWED = new InjectionToken<boolean>('Remember session allowed', {
  providedIn: 'root', factory: () => canRememberSession(),
});
