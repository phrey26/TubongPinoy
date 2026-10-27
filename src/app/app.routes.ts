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

export const routes: Routes = [
  { path: '', component: Home },

  { path: 'login', component: Login },
  { path: 'signup', component: Signup },

  { path: 'games', children: [
    { path: '', pathMatch: 'full', component: Games },
    // Add future playable games here to inherit the login requirement.
    { path: '', canActivateChild: [authGuard], children: [
      { path: 'tumbang-preso', component: TumbangPreso },
      { path: 'jolens-blast', component: JolensBlast },
    ] },
  ] },

  { path: 'shop', component: Shop, canActivate: [authGuard] },
  { path: 'topup', component: Topup, canActivate: [authGuard] },

  { path: 'contact', component: Contact },

  { path: '**', redirectTo: '' }
];
