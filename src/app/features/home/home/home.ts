import { JuiceTimer } from '../../../shared/juice-timer/juice-timer';
import { ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { AccountState } from '../../../core/services/account-state';
import { JuiceRecovery } from '../../../core/services/juice-recovery';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TimePipe } from '../../../shared/pipes/time-pipe';
import { CommonModule } from '@angular/common';
import { interval, map, startWith } from 'rxjs';
import { RouterModule } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-home',
  imports: [JuiceTimer, CommonModule, TimePipe, RouterModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  readonly account = inject(AccountState);
  readonly recovery = inject(JuiceRecovery);
  readonly clockDetailsOpen = signal(false);
  @ViewChild('clockArea') private clockArea?: ElementRef<HTMLElement>;
  @ViewChild('clockTrigger') private clockTrigger?: ElementRef<HTMLButtonElement>;

  openClockDetails(): void { this.clockDetailsOpen.set(true); }

  onClockMouseLeave(): void {
    if (document.activeElement !== this.clockTrigger?.nativeElement) this.clockDetailsOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  closeClockDetails(): void { this.clockDetailsOpen.set(false); }

  @HostListener('document:click', ['$event'])
  onOutsideClock(event: Event): void {
    if (event.target instanceof Node && !this.clockArea?.nativeElement.contains(event.target)) this.closeClockDetails();
  }

  // Keep the live clock visible regardless of account or refill state.
  currentTime$ = interval(1000).pipe(
    map(() => new Date()), startWith(new Date())
  );

  //images
  heroImage = 'assets/images/tubong-pinoy-hero-branded.webp';
  aboutImage = 'assets/images/about-image-bw.webp';


}
