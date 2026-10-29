import { Routes } from '@angular/router';
import { Home } from './features/home/home/home';
import { Login } from './features/auth/login/login';
import { Signup } from './features/auth/signup/signup';
import { Games } from './features/games/games/games';
import { TumbangPreso } from './features/games/tumbang-preso/tumbang-preso';
import { JolensBlast } from './features/games/jolens-blast/jolens-blast';
import { Shop } from './features/shop/shop/shop';
import { Topup } from './features/topup/topup/topup';
import { Contact } from './features/contact/contact/contact';
import { authGuard } from './core/guards/auth.guard';
import { leaveGuard } from './core/guards/leave.guard';

export const routes: Routes = [
  { path: '', component: Home },

  { path: 'login', component: Login },
  { path: 'signup', component: Signup },

  { path: 'games', children: [
    { path: '', pathMatch: 'full', component: Games },
    // Add future playable games here to inherit the login requirement.
    { path: '', canActivateChild: [authGuard], children: [
      { path: 'tumbang-preso', component: TumbangPreso, canDeactivate: [leaveGuard] },
      { path: 'jolens-blast', component: JolensBlast, canDeactivate: [leaveGuard] },
    ] },
  ] },

  { path: 'shop', component: Shop, canActivate: [authGuard] },
  { path: 'topup', component: Topup, canActivate: [authGuard] },

  { path: 'account/profile', canActivate: [authGuard], canDeactivate: [leaveGuard],
    loadComponent: () => import('./features/account/profile/profile').then(module => module.Profile) },
  { path: 'account/inventory', canActivate: [authGuard], canDeactivate: [leaveGuard],
    loadComponent: () => import('./features/account/inventory/inventory').then(module => module.Inventory) },
  { path: 'account/settings', canActivate: [authGuard], canDeactivate: [leaveGuard],
    loadComponent: () => import('./features/account/settings/settings').then(module => module.Settings) },

  { path: 'contact', component: Contact, canDeactivate: [leaveGuard] },

  { path: '**', redirectTo: '' }
];
