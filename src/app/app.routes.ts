import { Routes } from '@angular/router';
import { Home } from './features/home/home/home';
import { authGuard } from './core/guards/auth.guard';
import { leaveGuard } from './core/guards/leave.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: Home, title: 'Tubong Pinoy — Filipino Games in Your Browser',
    data: { description: 'Rediscover Filipino playground games with Tumbang Preso and Jolens Blast. Explore the games, create your player profile, and start playing in your browser.' } },

  { path: 'login', title: 'Log In | Tubong Pinoy', data: { noindex: true, description: 'Log in to your Tubong Pinoy account to play, restore your progress, and manage your collection.' },
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login) },
  { path: 'signup', title: 'Create an Account | Tubong Pinoy', data: { noindex: true, description: 'Create your Tubong Pinoy player account and get started with 100 Juice, free starter skins, and Filipino browser games.' },
    loadComponent: () => import('./features/auth/signup/signup').then(m => m.Signup) },

  { path: 'games', children: [
    { path: '', pathMatch: 'full', title: 'Explore Filipino Games | Tubong Pinoy',
      data: { description: 'Choose Tumbang Preso or Jolens Blast. Learn the rules and Juice costs, then log in to play these Filipino playground-inspired games.' },
      loadComponent: () => import('./features/games/games/games').then(m => m.Games) },
    // Add future playable games here to inherit the login requirement.
    { path: '', canActivateChild: [authGuard], children: [
      { path: 'tumbang-preso', title: 'Play Tumbang Preso | Tubong Pinoy',
        data: { noindex: true, description: 'Aim your slipper, bounce past the rocks, and knock down the can in Tumbang Preso.' },
        loadComponent: () => import('./features/games/tumbang-preso/tumbang-preso').then(m => m.TumbangPreso), canDeactivate: [leaveGuard] },
      { path: 'jolens-blast', title: 'Play Jolens Blast | Tubong Pinoy',
        data: { noindex: true, description: 'Aim your shooter, knock marbles out of the circle, and grow your collection in Jolens Blast.' },
        loadComponent: () => import('./features/games/jolens-blast/jolens-blast').then(m => m.JolensBlast), canDeactivate: [leaveGuard] },
    ] },
  ] },

  { path: 'shop', title: 'Sari-Sari Store | Tubong Pinoy', data: { noindex: true, description: 'Use your account Tansans for Juice refills and store collectibles.' },
    loadComponent: () => import('./features/shop/shop/shop').then(m => m.Shop), canActivate: [authGuard] },
  { path: 'topup', title: 'Top-Ups — Coming Soon | Tubong Pinoy', data: { noindex: true, description: 'Preview planned Tansan packages. Real-money top-ups are not available yet.' },
    loadComponent: () => import('./features/topup/topup/topup').then(m => m.Topup), canActivate: [authGuard] },

  { path: 'account/profile', title: 'Edit Profile | Tubong Pinoy', data: { noindex: true, description: 'Choose your Tubong Pinoy display name and player icon.' }, canActivate: [authGuard], canDeactivate: [leaveGuard],
    loadComponent: () => import('./features/account/profile/profile').then(module => module.Profile) },
  { path: 'account/inventory', title: 'Your Inventory | Tubong Pinoy', data: { noindex: true, description: 'Equip free starter skins and view the collectibles saved to your account.' }, canActivate: [authGuard], canDeactivate: [leaveGuard],
    loadComponent: () => import('./features/account/inventory/inventory').then(module => module.Inventory) },
  { path: 'account/settings', title: 'Account Settings | Tubong Pinoy', data: { noindex: true, description: 'Manage your Tubong Pinoy username, email address, and password.' }, canActivate: [authGuard], canDeactivate: [leaveGuard],
    loadComponent: () => import('./features/account/settings/settings').then(module => module.Settings) },

  { path: 'contact', title: 'Contact & Feedback | Tubong Pinoy', data: { description: 'Meet HH productions and preview your feedback for Tubong Pinoy. Message delivery is coming soon.' },
    loadComponent: () => import('./features/contact/contact/contact').then(m => m.Contact), canDeactivate: [leaveGuard] },

  { path: 'faq', title: 'Frequently Asked Questions | Tubong Pinoy',
    data: { page: 'faq', heading: 'A little help before you play', description: 'Find answers about Tubong Pinoy accounts, Juice recovery, Tansans, game rules, scores, and starter skins.' },
    loadComponent: () => import('./features/info/info').then(m => m.Info) },
  { path: 'privacy', title: 'Privacy Policy | Tubong Pinoy',
    data: { page: 'privacy', heading: 'Privacy Policy', description: 'Read how Tubong Pinoy handles account details, game progress, essential session cookies, and optional Google Maps content.' },
    loadComponent: () => import('./features/info/info').then(m => m.Info) },
  { path: 'terms', title: 'Terms of Use | Tubong Pinoy',
    data: { page: 'terms', heading: 'Terms of Use', description: 'Read the Tubong Pinoy rules for accounts, fair play, virtual items, and the current development version.' },
    loadComponent: () => import('./features/info/info').then(m => m.Info) },

  { path: '**', title: 'Page Not Found | Tubong Pinoy',
    data: { page: 'not-found', heading: 'This page wandered off the playground', noindex: true, description: 'This Tubong Pinoy page could not be found. Return home or browse the available games.' },
    loadComponent: () => import('./features/info/info').then(m => m.Info) }
];
