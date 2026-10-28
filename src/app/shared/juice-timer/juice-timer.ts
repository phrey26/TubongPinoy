import { Component, inject } from '@angular/core';
import { JuiceRecovery } from '../../core/services/juice-recovery';

@Component({
  selector: 'app-juice-timer',
  template: `
    @if (recovery.status()) {
      <span role="timer" aria-live="off" title="Free refill: 1 Juice every 2 minutes and 24 seconds, up to 100.">
        <img src="assets/icons/clock.svg" alt="" aria-hidden="true" />{{ recovery.status() }}
      </span>
    }
  `,
  styles: `
    :host { display: inline-flex; max-width: 100%; }
    span { display: inline-flex; align-items: center; gap: 6px; color: #6b21a8; font-size: 12px; font-weight: 700; line-height: 1.5; font-variant-numeric: tabular-nums; }
    img { width: 16px; height: 16px; flex: none; }
  `,
})
export class JuiceTimer {
  readonly recovery = inject(JuiceRecovery);
}
