import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AccountState } from '../../../core/services/account-state';
import { User } from '../../../core/services/user';
import { authErrorMessage } from '../../../core/services/auth';
import { Collectible, DEFAULT_GAME_SKINS, GameSkin, gameSkinUrl } from '../../../core/services/customization';
import { GameId } from '../../../core/services/game';

@Component({
  selector: 'app-inventory', imports: [RouterLink],
  templateUrl: './inventory.html', styleUrl: '../account.css',
})
export class Inventory {
  readonly account = inject(AccountState);
  private readonly service = inject(User);
  private readonly destroyRef = inject(DestroyRef);
  readonly game = signal<GameId>('tumbang-preso');
  readonly items = signal<GameSkin[]>([]);
  readonly collectibles = signal<Collectible[]>([]);
  readonly loading = signal(false);
  readonly pending = signal<string | null>(null);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly message = signal('');
  readonly visibleItems = computed(() => this.items().filter(item => item.game === this.game()));
  readonly equippedId = computed(() => this.account.user()?.equippedSkins?.[this.game()] || DEFAULT_GAME_SKINS[this.game()]);
  readonly equipped = computed(() => this.items().find(item => item.id === this.equippedId()));
  readonly gameSkinUrl = gameSkinUrl;

  constructor() { this.load(); }

  load(): void {
    if (this.loading()) return;
    const id = this.account.user()?.id;
    this.loading.set(true);
    this.loadError.set('');
    this.service.inventory().pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)),
    ).subscribe({
      next: result => {
        if (this.account.user()?.id !== id || result.user.id !== id) return;
        this.items.set(result.items);
        this.collectibles.set(result.collectibles);
      },
      error: error => this.loadError.set(authErrorMessage(error)),
    });
  }

  selectGame(game: GameId): void {
    this.game.set(game);
    this.error.set('');
    this.message.set('');
  }

  equip(item: GameSkin): void {
    if (this.pending() || item.id === this.equippedId() || !this.items().includes(item)) return;
    const id = this.account.user()?.id;
    this.pending.set(item.id);
    this.error.set('');
    this.message.set('');
    this.service.equip(item.game, item.id).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.pending.set(null)),
    ).subscribe({
      next: result => {
        if (this.account.user()?.id === id && result.user.id === id) this.message.set(`${item.name} equipped. Ready for your next game!`);
      },
      error: error => { if (this.account.user()?.id === id) this.error.set(authErrorMessage(error)); },
    });
  }
}
