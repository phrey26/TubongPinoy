import { Component, ChangeDetectionStrategy, HostListener, inject, OnInit, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { EMPTY, finalize, switchMap } from 'rxjs';
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
  readonly loggingOut = signal(false);
  readonly logoutError = signal('');
  readonly menuOpen = signal(false);

  toggleMenu(): void { this.menuOpen.update(open => !open); }
  @HostListener('document:keydown.escape')
  closeMenu(): void { this.menuOpen.set(false); }

  ngOnInit(): void {
    // The public lobby stays available even if the account server is offline.
    this.auth.loadSession().subscribe({ error: () => {} });
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
