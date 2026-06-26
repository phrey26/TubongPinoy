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

export const routes: Routes = [
  { path: '', component: Home },

  { path: 'login', component: Login },
  { path: 'signup', component: Signup },

  { path: 'games', component: Games },
  { path: 'games/tumbang-preso', component: TumbangPreso },
  { path: 'games/jolens-blast', component: JolensBlast },

  { path: 'shop', component: Shop },
  { path: 'topup', component: Topup },

  { path: 'contact', component: Contact },

  { path: '**', redirectTo: '' }
];
