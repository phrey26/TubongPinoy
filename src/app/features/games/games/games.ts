import { JuiceTimer } from '../../../shared/juice-timer/juice-timer';
import { AccountState } from '../../../core/services/account-state';
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { Energy } from '../../../core/services/energy';
import { RouterModule } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-games',
  imports: [JuiceTimer, CommonModule, RouterModule],
  templateUrl: './games.html',
  styleUrl: './games.css',
})
export class Games {

  private energyService = inject(Energy);
  readonly account = inject(AccountState);
  get unlimitedJuice(): boolean { return this.energyService.hasUnlimited(); }

  // Observable for energy level
  energyLevel$: Observable<number> = this.energyService.getEnergyLevel();

  // Game images
  tumbangPresoImage = 'assets/thumbnails/tumbang_preso_thumbnail.webp';
  marbleMatchImage = 'assets/thumbnails/jolens_blast_thumbnail.webp';

  // Show warning message when energy is insufficient
  showNoEnergyMessage = false;

}
