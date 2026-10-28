import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { JuiceRecovery } from './core/services/juice-recovery';
import { RouterOutlet } from '@angular/router';
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
}
