import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';

export interface ConfirmLeave {
  confirmLeave?(): boolean | Observable<boolean>;
}

export const leaveGuard: CanDeactivateFn<ConfirmLeave> = component => component.confirmLeave?.() ?? true;
