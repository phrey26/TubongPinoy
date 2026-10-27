import { Component, ChangeDetectionStrategy, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Currency } from '../../../core/services/currency';
import { Wallet } from '../../../core/services/wallet';
import { authErrorMessage } from '../../../core/services/auth';
import { RouterModule } from '@angular/router';
import { finalize } from 'rxjs';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-topup',
  imports: [RouterModule],
  templateUrl: './topup.html',
  styleUrl: './topup.css',
})
export class Topup implements OnInit {
  readonly currency = inject(Currency);
  private readonly wallet = inject(Wallet);
  private readonly destroyRef = inject(DestroyRef);
  selectedTansans = 100;
  selectedPrice = 49;
  private selectedPackage = 'starter';
  readonly pending = signal(false);
  readonly enabled = signal(false);
  readonly errorMessage = signal('');
  readonly message = signal('');
  heroImage = 'assets/images/tubong-pinoy-cta.png';

  ngOnInit(): void {
    this.wallet.catalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: catalog => this.enabled.set(catalog.demoTopupsEnabled),
      error: (error: unknown) => this.errorMessage.set(authErrorMessage(error)),
    });
  }

  selectPackage(tansans: number, price: number): void {
    if (this.pending()) return;
    const id = tansans === 100 ? 'starter' : tansans === 500 ? 'special' : tansans === 1500 ? 'piyesta' : null;
    if (!id) return;
    this.selectedPackage = id;
    this.selectedTansans = tansans;
    this.selectedPrice = price;
  }

  processPayment(): void {
    if (this.pending() || !this.enabled()) return;
    this.pending.set(true);
    this.errorMessage.set('');
    this.message.set('');
    this.wallet.change('demo_topup', this.selectedPackage).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.pending.set(false)),
    ).subscribe({
      next: () => this.message.set('Simulated top-up saved to your account. No payment was taken.'),
      error: (error: unknown) => this.errorMessage.set(authErrorMessage(error)),
    });
  }
}
