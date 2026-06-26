import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { Energy } from '../../../core/services/energy';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-games',
  imports: [CommonModule, RouterModule],
  templateUrl: './games.html',
  styleUrl: './games.css',
})
export class Games {

  private energyService = inject(Energy);

  // Observable for energy level
  energyLevel$: Observable<number> = this.energyService.getEnergyLevel();

  // Game images
  tumbangPresoImage = 'assets/tumbang-preso.png';
  marbleMatchImage = 'assets/marble-match.png';

  // Show warning message when energy is insufficient
  showNoEnergyMessage = false;

  /**
   * Play a game and consume energy if cost > 0
   * Currently not used since Tumbang Preso & Jolens Blast don't cost energy
   */
  playGame(cost: number = 20): void {
    const currentEnergy = this.energyService.getEnergyLevelValue();
    if (currentEnergy >= cost) {
      if (cost > 0) this.energyService.consumeEnergy(cost);
      this.showNoEnergyMessage = false;
    } else {
      this.showNoEnergyMessage = true;
      setTimeout(() => (this.showNoEnergyMessage = false), 3000);
    }
  }

  /**
   * Safely check if energy is enough to play
   */
  isEnergyEnough(energy: number | null | undefined, cost: number = 20): boolean {
    return !!energy && energy >= cost;
  }
}
