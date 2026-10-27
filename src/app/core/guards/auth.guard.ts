import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { Auth } from '../services/auth';

export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const login = () => router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  return inject(Auth).loadSession().pipe(
    map(session => session.user ? true : login()),
    catchError(() => of(login())),
  );
};
