import { JuiceTimer } from '../../../shared/juice-timer/juice-timer';
import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { EMPTY, finalize, switchMap } from 'rxjs';
import { AccountState } from '../../../core/services/account-state';
import { authErrorMessage } from '../../../core/services/auth';
import { Skin, Wallet } from '../../../core/services/wallet';
import { Confirmation } from '../../../core/services/confirmation';
import { JuiceRecovery } from '../../../core/services/juice-recovery';

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
  private readonly recovery = inject(JuiceRecovery);
  readonly cosmeticSkins = signal<Skin[]>([]);
  // Copy follows permanent IDs, so returning collections keep their own identity.
  readonly skinThemes: Record<string, { description: string; heading: string; fx?: string; sound?: string }> = {
    skin_4: { description: 'A fresh Guyabanos look for your neighborhood rounds.', heading: 'Fresh local flavor' },
    skin_3: { description: 'Bring a playful twist to your next slipper shot.', heading: 'A little mischief' },
    skin_2: { description: 'Golden style with a bright amber finish on every throw.', heading: 'Leave a golden trail', fx: 'Amber trails & gold impact flecks' },
    skin_1: { description: 'Turn your throws into a colorful crystal spectacle.', heading: 'Unleash the crystal glow', fx: 'Prismatic trails & crystal bursts', sound: 'Crystal strikes with a shimmering echo' },
    shooter_8ball: { description: 'Classic pool-table style, ready for the marble ring.', heading: 'Line up your next shot' },
    shooter_golf: { description: 'Bring a touch of the fairway to your marble game.', heading: 'From fairway to ring' },
    shooter_jupiter: { description: 'A miniature gas giant with a warm planetary glow.', heading: 'Put your shots in orbit', fx: 'Orbiting moons, storm dust & impact rings' },
    shooter_steel_ball: { description: 'Charge the ring with green lightning and thunder.', heading: 'Start a lightning chain', fx: 'Electric trails & collision-chain lightning', sound: 'Electric cracks & thunder impacts' },
  };
  skinTheme(skin: Skin) {
    return this.skinThemes[skin.id] ?? { description: 'A new look for your next round.', heading: 'Make it your own', fx: 'Signature trails & impacts', sound: 'Signature skin sounds' };
  }
  readonly skinSections = [
    { game: 'tumbang-preso', title: 'Tumbang Preso Skins', item: 'slipper' },
    { game: 'jolens-blast', title: 'Jolens Blast Shooter Skins', item: 'shooter' },
  ] as const;
  skinsFor(game: string): Skin[] {
    return this.cosmeticSkins().filter(skin => (skin.game ?? 'tumbang-preso') === game);
  }
  ownedFor(game: string): number { return this.skinsFor(game).filter(skin => this.owns(skin.id)).length; }
  readonly pending = signal(false);
  readonly pendingItem = signal<string | null>(null);
  readonly loadingSkins = signal(true);
  readonly catalogError = signal(false);
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
  get unlimitedActive(): boolean { return this.permanentJuice || this.recovery.unlimitedSecondsRemaining() > 0; }

  ngOnInit(): void {
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
    if (this.pendingItem() === skin.id) return 'Saving…';
    if (this.owns(skin.id)) return 'In your collection';
    return this.userCoins < skin.price ? 'Not enough Tansans' : 'Buy skin';
  }
  owns(id: string): boolean { return this.account.user()?.ownedSkins?.includes(id) ?? false; }
  buyItem(id: string): void {
    const item = this.refills.find(refill => refill.id === id);
    if (item && !this.refillUnavailable(item)) this.purchase(id);
  }
  buyCosmetic(id: string): void { if (!this.owns(id)) this.purchase(id); }

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
        if (this.account.user()?.id !== accountId || result.user.id !== accountId) return;
        if (id.startsWith('energy_')) {
          const message = id === 'energy_unli'
            ? 'Unlimited Juice is active for one hour. Enjoy your games!'
            : `Your Juice is now ${result.user.juice} / 100. You’re ready to play!`;
          this.message.set(message);
          this.confirmation.ask({
            title: 'Purchase Success',
            message: `${item.name} purchased successfully! ${message}`,
            confirmLabel: 'Got it', acknowledgeOnly: true,
          }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
        } else {
          const skin = this.cosmeticSkins().find(skin => skin.id === id);
          const name = skin?.name ?? 'Skin';
          const gameName = skin?.game === 'jolens-blast' ? 'Jolens Blast' : 'Tumbang Preso';
          this.message.set(`${name} successfully bought! Equip it in your inventory.`);
          this.confirmation.ask({
            title: 'Successfully bought!',
            message: `${name} is now in your collection. Open Inventory to equip it for ${gameName}.`,
            confirmLabel: 'Got it', acknowledgeOnly: true,
          }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
        }
      },
      error: (error: unknown) => this.errorMessage.set(authErrorMessage(error)),
    });
  }
}
