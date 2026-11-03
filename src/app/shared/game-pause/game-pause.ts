import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, input, output } from '@angular/core';

@Component({
  selector: 'app-game-pause',
  template: `
    <dialog #dialog [class.blue]="theme() === 'blue'" aria-labelledby="game-pause-title"
      aria-describedby="game-pause-message" (cancel)="$event.preventDefault()">
      <span class="pause-icon" aria-hidden="true">Ⅱ</span>
      <h2 id="game-pause-title">Game paused</h2>
      <p id="game-pause-message">We paused while you were away. Ready to keep playing?</p>
      <button type="button" autofocus class="ui-button" [class.ui-button-blue]="theme() === 'blue'"
        (click)="resume.emit()">
        <img src="assets/icons/play.svg" alt="" aria-hidden="true" class="app-icon" /> Resume
      </button>
    </dialog>
  `,
  styles: `
    dialog { margin: auto; width: min(400px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; padding: clamp(20px, 5vw, 32px); border: 4px solid #c084fc; border-radius: 24px; background: #fff; color: #374151; text-align: center; box-shadow: 0 20px 60px #2e106566; }
    dialog::backdrop { background: #2e1065b3; backdrop-filter: blur(4px); }
    .pause-icon { display: inline-grid; place-items: center; width: 56px; height: 56px; border-radius: 18px; background: #f3e8ff; color: #7e22ce; font-size: 32px; font-weight: 900; }
    h2 { margin-top: 16px; color: #7e22ce; font-size: 28px; font-weight: 900; line-height: 1.2; }
    p { margin: 12px 0 24px; font-size: 15px; line-height: 1.6; }
    button { width: 100%; min-height: 48px; }
    .blue { border-color: #60a5fa; }
    .blue h2, .blue .pause-icon { color: #1d4ed8; }
    .blue .pause-icon { background: #dbeafe; }
    .blue::backdrop { background: #172554b3; }
  `,
})
export class GamePause implements AfterViewInit, OnDestroy {
  readonly theme = input<'purple' | 'blue'>('purple');
  readonly resume = output<void>();
  @ViewChild('dialog') private dialog!: ElementRef<HTMLDialogElement>;

  ngAfterViewInit(): void { this.dialog.nativeElement.showModal?.(); }
  ngOnDestroy(): void { this.dialog.nativeElement.close?.(); }
}
