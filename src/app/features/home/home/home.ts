import { Component, OnDestroy, OnInit } from '@angular/core';
import { TimePipe } from '../../../shared/pipes/time-pipe';
import { CommonModule } from '@angular/common';
import { interval, map } from 'rxjs';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [CommonModule, TimePipe, RouterModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit, OnDestroy{

  currentTime: Date = new Date();
  interval: any;

  ngOnInit() {
    this.interval = setInterval(() => {
      this.currentTime = new Date(); // triggers pipe
    }, 1000);
  }

  ngOnDestroy() {
    clearInterval(this.interval);
  }

    // Emits a new Date every second
  currentTime$ = interval(1000).pipe(
    map(() => new Date())
  );

  //images
  heroImage = ''; // Example: 'assets/images/hero.jpg'
  aboutImage = ''; // Example: 'assets/images/about.jpg'
  ctaImage = ''; // Example: 'assets/images/cta.jpg'
  featureImages = ['', '', '']; // Example: ['assets/images/f1.jpg', 'assets/images/f2.jpg', 'assets/images/f3.jpg']


}
