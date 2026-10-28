import { Component, ChangeDetectionStrategy, DestroyRef, ElementRef, HostListener, ViewChild, effect, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterModule } from '@angular/router';
import { EMPTY, filter, finalize, switchMap } from 'rxjs';
import { Auth, authErrorMessage } from '../../core/services/auth';
import { Confirmation } from '../../core/services/confirmation';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-header',
  imports: [RouterModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header implements OnInit {
  readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly confirmation = inject(Confirmation);
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('accountArea', { static: true }) private accountArea!: ElementRef<HTMLElement>;
  @ViewChild('accountTrigger') private accountTrigger?: ElementRef<HTMLButtonElement>;
  readonly loggingOut = signal(false);
  readonly logoutError = signal('');
  readonly menuOpen = signal(false);
  readonly accountMenuOpen = signal(false);
  readonly accountOptions = [
    { id: 'edit-profile', label: 'Edit profile', icon: 'assets/icons/account.svg', available: false },
    // Future home for equippable skins and effects purchased with Tansans.
    { id: 'inventory', label: 'Inventory', icon: 'assets/icons/package.svg', available: false },
    { id: 'settings', label: 'Settings', icon: 'assets/icons/settings.svg', available: false },
    { id: 'logout', label: 'Logout', icon: 'assets/icons/logout.svg', available: true },
  ];

  constructor() {
    effect(() => { if (!this.auth.user()) this.accountMenuOpen.set(false); });
  }

  toggleMenu(): void {
    this.accountMenuOpen.set(false);
    this.menuOpen.update(open => !open);
  }

  toggleAccountMenu(): void {
    if (this.loggingOut()) return;
    this.menuOpen.set(false);
    this.accountMenuOpen.update(open => !open);
  }

  closeMenu(): void { this.menuOpen.set(false); this.accountMenuOpen.set(false); }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (this.accountMenuOpen()) {
      this.accountMenuOpen.set(false);
      this.accountTrigger?.nativeElement.focus();
      event.preventDefault();
    }
    this.menuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  @HostListener('document:focusin', ['$event'])
  onOutsideAccount(event: Event): void {
    if (this.accountMenuOpen() && event.target instanceof Node &&
        !this.accountArea.nativeElement.contains(event.target)) this.accountMenuOpen.set(false);
  }

  selectAccountOption(id: string): void {
    if (id === 'logout') this.logout();
  }

  ngOnInit(): void {
    // The public lobby stays available even if the account server is offline.
    this.auth.loadSession().subscribe({ error: () => {} });
    this.router.events.pipe(
      filter(event => event instanceof NavigationStart), takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.closeMenu());
  }

  logout(): void {
    this.closeMenu();
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.logoutError.set('');
    this.confirmation.ask({
      title: 'Are you sure you want to log out?',
      message: 'You will need to log in again to play. Any active game will end.',
      confirmLabel: 'Log out', cancelLabel: 'Stay logged in',
    }).pipe(
      switchMap(confirmed => confirmed ? this.auth.logout() : EMPTY),
      finalize(() => this.loggingOut.set(false)),
    ).subscribe({
      next: () => void this.router.navigateByUrl('/games'),
      error: (error: unknown) => this.logoutError.set(authErrorMessage(error)),
    });
  }
}
