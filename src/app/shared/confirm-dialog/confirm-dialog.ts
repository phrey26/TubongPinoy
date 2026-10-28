import { Component, ElementRef, afterRenderEffect, inject, viewChild } from '@angular/core';
import { Confirmation } from '../../core/services/confirmation';

@Component({
  selector: 'app-confirm-dialog',
  template: `
    <dialog #dialog aria-labelledby="confirmation-title" aria-describedby="confirmation-message"
      (cancel)="$event.preventDefault(); confirmation.respond(false)" (click)="onBackdrop($event)">
      @if (confirmation.active(); as request) {
        <h2 id="confirmation-title">{{ request.title }}</h2>
        <p id="confirmation-message">{{ request.message }}</p>
        <div class="actions">
          <button type="button" autofocus (click)="confirmation.respond(false)">{{ request.cancelLabel || 'Cancel' }}</button>
          <button type="button" class="confirm" (click)="confirmation.respond(true)">{{ request.confirmLabel }}</button>
        </div>
      }
    </dialog>
  `,
  styles: `
    dialog { margin: auto; width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 24px; border: 4px solid #c084fc; border-radius: 24px; background: #fff; color: #374151; box-shadow: 0 20px 60px #2e106566; }
    dialog::backdrop { background: #2e1065b3; backdrop-filter: blur(3px); }
    h2 { color: #6b21a8; font-size: 24px; font-weight: 800; line-height: 1.3; }
    p { margin-top: 12px; line-height: 1.65; }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-top: 24px; }
    button { min-height: 44px; padding: 10px 16px; border: 2px solid #c084fc; border-radius: 12px; color: #581c87; font-weight: 800; cursor: pointer; }
    button:hover { background: #faf5ff; }
    .confirm { background: #e9d5ff; border-color: #7e22ce; }
    .confirm:hover { background: #d8b4fe; }
  `,
})
export class ConfirmDialog {
  readonly confirmation = inject(Confirmation);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterRenderEffect(() => {
      const active = this.confirmation.active();
      const dialog = this.dialog().nativeElement;
      if (active && !dialog.open) dialog.showModal?.();
      if (!active && dialog.open) dialog.close?.();
    });
  }

  onBackdrop(event: MouseEvent): void {
    const dialog = this.dialog().nativeElement;
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom)) this.confirmation.respond(false);
  }
}
