import { afterNextRender, Component, Injector, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, skip } from 'rxjs';
import { JuiceRecovery } from './core/services/juice-recovery';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Header } from "./layout/header/header";
import { Footer } from "./layout/footer/footer";
import { ConfirmDialog } from './shared/confirm-dialog/confirm-dialog';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, ConfirmDialog],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly juiceRecovery = inject(JuiceRecovery);
  protected readonly title = signal('tubongpinoybeta2');

  constructor() {
    const document = inject(DOCUMENT);
    const injector = inject(Injector);
    inject(Router).events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      skip(1), takeUntilDestroyed(),
    ).subscribe(event => {
      afterNextRender(() => {
        if (!event.urlAfterRedirects.includes('#')) document.getElementById('main-content')?.focus({ preventScroll: true });
      }, { injector });
    });
  }
}
