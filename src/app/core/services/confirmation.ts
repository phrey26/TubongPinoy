import { Injectable, signal } from '@angular/core';
import { Subject, defer, finalize, of, take } from 'rxjs';

export interface ConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
}

@Injectable({ providedIn: 'root' })
export class Confirmation {
  readonly active = signal<ConfirmationRequest | null>(null);
  private answer?: Subject<boolean>;

  ask(request: ConfirmationRequest) {
    return defer(() => {
      if (this.active()) return of(false);
      const answer = new Subject<boolean>();
      this.answer = answer;
      this.active.set(request);
      return answer.pipe(take(1), finalize(() => {
        if (this.answer === answer) {
          this.answer = undefined;
          this.active.set(null);
        }
      }));
    });
  }

  respond(confirmed: boolean): void {
    const answer = this.answer;
    this.answer = undefined;
    this.active.set(null);
    answer?.next(confirmed);
    answer?.complete();
  }
}
