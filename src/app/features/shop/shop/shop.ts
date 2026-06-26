import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Currency } from '../../../core/services/currency';
import { Energy } from '../../../core/services/energy';

interface Skin {
  id: string;
  name: string;
  type: string;
  price: number;
  imageUrl: string;
}

@Component({
  selector: 'app-shop',
  imports: [CommonModule, RouterModule],
  templateUrl: './shop.html',
  styleUrl: './shop.css',
})
export class Shop {

  userCoins: number = 0;
  userEnergy: number = 0;

  cosmeticSkins: Skin[] = [
    {
      id: 'skin_1',
      name: 'Dragon Armor',
      type: 'Legendary Skin',
      price: 300,
      imageUrl: 'assets/skins/dragon.png'
    },
    {
      id: 'skin_2',
      name: 'Shadow Ninja',
      type: 'Epic Skin',
      price: 200,
      imageUrl: 'assets/skins/ninja.png'
    },
    {
      id: 'skin_3',
      name: 'Cyber Suit',
      type: 'Rare Skin',
      price: 150,
      imageUrl: 'assets/skins/cyber.png'
    },
    {
      id: 'skin_4',
      name: 'Classic Outfit',
      type: 'Common Skin',
      price: 50,
      imageUrl: 'assets/skins/classic.png'
    }
  ];

  constructor(
    private currency: Currency,
    private energy: Energy
  ) {}

  ngOnInit() {
    // ✅ reactive juice (updates UI automatically)
    this.energy.getEnergyLevel().subscribe(value => {
      this.userEnergy = value;
    });

    // ✅ initial coins
    this.userCoins = this.currency.getCoins();
  }

  buyItem(type: string) {
    switch (type) {
      case 'energy_small':
        this.purchase(50, () => this.energy.addEnergy(20));
        break;

      case 'energy_med':
        this.purchase(100, () => this.energy.addEnergy(50));
        break;

      case 'energy_unli':
        this.purchase(500, () => {
          alert('Unlimited juice for 1 hour!');
        });
        break;
    }
  }

  buyCosmetic(id: string) {
    const skin = this.cosmeticSkins.find(s => s.id === id);
    if (!skin) return;

    this.purchase(skin.price, () => {
      alert(`You bought ${skin.name}!`);
    });
  }

  private purchase(cost: number, success: () => void) {
    if (!this.currency.spend(cost)) {
      alert('Not enough coins!');
      return;
    }

    // refresh coins in UI
    this.userCoins = this.currency.getCoins();

    success();
  }
}
