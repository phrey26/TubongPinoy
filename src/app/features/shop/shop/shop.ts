import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { finalize } from 'rxjs';
import { AccountState } from '../../../core/services/account-state';
import { authErrorMessage } from '../../../core/services/auth';
import { Skin, Wallet } from '../../../core/services/wallet';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-shop',
  imports: [CommonModule, RouterModule],
  templateUrl: './shop.html',
  styleUrl: './shop.css',
})
export class Shop implements OnInit {
  private readonly wallet = inject(Wallet);
  private readonly account = inject(AccountState);
  private readonly destroyRef = inject(DestroyRef);
  readonly cosmeticSkins = signal<Skin[]>([]);
  readonly pending = signal(false);
  readonly errorMessage = signal('');
  readonly message = signal('');
  get userCoins(): number { return this.account.user()?.tansans ?? 0; }
  get userEnergy(): number { return this.account.user()?.juice ?? 0; }
  get unlimitedUntil(): number { return this.account.user()?.unlimitedJuiceUntil ?? 0; }

  ngOnInit(): void {
    this.wallet.catalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: catalog => this.cosmeticSkins.set(catalog.skins),
      error: (error: unknown) => this.errorMessage.set(authErrorMessage(error)),
    });
  }

  owns(id: string): boolean { return this.account.user()?.ownedSkins?.includes(id) ?? false; }
  buyItem(id: string): void { this.purchase(id); }
  buyCosmetic(id: string): void { if (!this.owns(id)) this.purchase(id); }

  private purchase(id: string): void {
    if (this.pending()) return;
    this.pending.set(true);
    this.message.set('');
    this.errorMessage.set('');
    this.wallet.change('purchase', id).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.pending.set(false)),
    ).subscribe({
      next: () => this.message.set('Purchase saved to your account.'),
      error: (error: unknown) => this.errorMessage.set(authErrorMessage(error)),
    });
  }
}
