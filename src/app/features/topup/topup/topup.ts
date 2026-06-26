import { Component } from '@angular/core';
import { Currency } from '../../../core/services/currency';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-topup',
  imports: [RouterModule],
  templateUrl: './topup.html',
  styleUrl: './topup.css',
})
export class Topup {

  selectedTansans: number = 100;
  selectedPrice: number = 49;

  // Image (no ngIf needed)
  heroImage: string = 'assets/images/topup.jpg';
  // You can change this anytime

  constructor(public currency: Currency) {}

  selectPackage(tansans: number, price: number): void {
    this.selectedTansans = tansans;
    this.selectedPrice = price;
  }

  processPayment(): void {
    if (!this.selectedTansans || !this.selectedPrice) {
      alert('Please select a package first.');
      return;
    }

    setTimeout(() => {
      this.currency.add(this.selectedTansans);

      alert(`Payment successful! 🎉 You now have ${this.currency.getCoins()} Tansans.`);

      // Reset selection
      this.selectedTansans = 100;
      this.selectedPrice = 49;

    }, 1000);
  }

}
