import { JuiceTimer } from '../../../shared/juice-timer/juice-timer';
import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { EMPTY, finalize, interval, switchMap } from 'rxjs';
import { AccountState } from '../../../core/services/account-state';
import { authErrorMessage } from '../../../core/services/auth';
import { Skin, Wallet } from '../../../core/services/wallet';
import { Confirmation } from '../../../core/services/confirmation';

interface Refill {
  id: string;
  name: string;
  price: number;
  icon: string;
  benefit: string;
  description: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-shop',
  imports: [JuiceTimer, CommonModule, RouterModule],
  templateUrl: './shop.html',
  styleUrl: './shop.css',
})
export class Shop implements OnInit {
  private readonly wallet = inject(Wallet);
  private readonly account = inject(AccountState);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmation = inject(Confirmation);
  readonly cosmeticSkins = signal<Skin[]>([]);
  readonly skinsAvailable = false;
  readonly pending = signal(false);
  readonly pendingItem = signal<string | null>(null);
  readonly loadingSkins = signal(true);
  readonly catalogError = signal(false);
  private readonly now = signal(Date.now());
  readonly errorMessage = signal('');
  readonly message = signal('');
  readonly refills: readonly Refill[] = [
    { id: 'energy_small', name: 'Quick Snack', price: 50, icon: 'assets/icons/juice.svg',
      benefit: '+20 Juice', description: 'A quick refresh for your next attempt.' },
    { id: 'energy_med', name: 'Full Meal', price: 100, icon: 'assets/icons/burger.svg',
      benefit: '+50 Juice', description: 'A bigger boost to keep the games going.' },
    { id: 'energy_unli', name: 'Unlimited Feast', price: 500, icon: 'assets/icons/unlimited.svg',
      benefit: '1 hour of unlimited Juice', description: 'Play without spending Juice for one hour.' },
  ];
  get userCoins(): number { return this.account.user()?.tansans ?? 0; }
  get userEnergy(): number { return this.account.user()?.juice ?? 0; }
  get unlimitedUntil(): number { return this.account.user()?.unlimitedJuiceUntil ?? 0; }
  get permanentJuice(): boolean { return this.account.user()?.permanentJuice === true; }
  get unlimitedActive(): boolean { return this.permanentJuice || this.unlimitedUntil > this.now(); }
  get ownedCount(): number { return this.account.user()?.ownedSkins?.length ?? 0; }

  ngOnInit(): void {
    interval(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.now.set(Date.now()));
    this.loadCatalog();
  }

  loadCatalog(): void {
    this.loadingSkins.set(true);
    this.catalogError.set(false);
    this.wallet.catalog().pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loadingSkins.set(false)),
    ).subscribe({
      next: catalog => this.cosmeticSkins.set(catalog.skins),
      error: () => this.catalogError.set(true),
    });
  }

  dismissMessage(): void { this.errorMessage.set(''); this.message.set(''); }
  refillUnavailable(item: Refill): boolean {
    return this.pending() || this.unlimitedActive || this.userCoins < item.price ||
      (item.id !== 'energy_unli' && this.userEnergy >= 100);
  }
  refillButtonLabel(item: Refill): string {
    if (this.pendingItem() === item.id) return 'Saving…';
    if (this.unlimitedActive) return 'Unlimited active';
    if (item.id !== 'energy_unli' && this.userEnergy >= 100) return 'Juice is full';
    return this.userCoins < item.price ? 'Not enough Tansans' : 'Buy refill';
  }
  skinButtonLabel(skin: Skin): string {
    if (!this.skinsAvailable) return 'Coming soon';
    if (this.pendingItem() === skin.id) return 'Saving…';
    if (this.owns(skin.id)) return 'In your collection';
    return this.userCoins < skin.price ? 'Not enough Tansans' : 'Buy skin';
  }
  owns(id: string): boolean { return this.account.user()?.ownedSkins?.includes(id) ?? false; }
  buyItem(id: string): void {
    const item = this.refills.find(refill => refill.id === id);
    if (item && !this.refillUnavailable(item)) this.purchase(id);
  }
  buyCosmetic(id: string): void { if (this.skinsAvailable && !this.owns(id)) this.purchase(id); }

  private purchase(id: string): void {
    if (this.pending()) return;
    const item = this.refills.find(refill => refill.id === id) ?? this.cosmeticSkins().find(skin => skin.id === id);
    if (!item || this.userCoins < item.price) return;
    const accountId = this.account.user()?.id;
    this.pending.set(true);
    this.message.set('');
    this.errorMessage.set('');
    this.confirmation.ask({
      title: 'Are you sure you want to buy this?',
      message: `Buy ${item.name} for ${item.price.toLocaleString()} Tansans? This amount will be deducted from your balance.`,
      confirmLabel: 'Buy item', cancelLabel: 'Keep browsing',
    }).pipe(
      switchMap(confirmed => {
        if (!confirmed || this.account.user()?.id !== accountId) return EMPTY;
        this.pendingItem.set(id);
        return this.wallet.change('purchase', id);
      }),
      takeUntilDestroyed(this.destroyRef), finalize(() => { this.pending.set(false); this.pendingItem.set(null); }),
    ).subscribe({
      next: result => {
        if (id === 'energy_unli') this.message.set('Unlimited Juice is active for one hour. Enjoy your games!');
        else if (id.startsWith('energy_')) this.message.set(`Your Juice is now ${result.user.juice} / 100. You’re ready to play!`);
        else this.message.set(`${this.cosmeticSkins().find(skin => skin.id === id)?.name ?? 'Skin'} added to your collection.`);
      },
      error: (error: unknown) => this.errorMessage.set(authErrorMessage(error)),
    });
  }
}
