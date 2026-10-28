import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Confirmation } from '../../core/services/confirmation';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('shows an accessible dialog, cancels with Escape, and confirms only from its action button', async () => {
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = vi.fn(() => { dialog.open = true; });
    dialog.close = vi.fn(() => { dialog.open = false; });
    const service = TestBed.inject(Confirmation);
    const request = { title: 'Are you sure?', message: 'Your game will end.', confirmLabel: 'Leave game' };
    let answer: boolean | undefined;
    service.ask(request).subscribe(value => answer = value);
    await fixture.whenStable();
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe('confirmation-title');
    expect(dialog.querySelector('[autofocus]')?.textContent).toContain('Cancel');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await fixture.whenStable();
    expect(answer).toBe(false);
    expect(dialog.open).toBe(false);
    service.ask(request).subscribe(value => answer = value);
    await fixture.whenStable();
    (dialog.querySelector('.confirm') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(answer).toBe(true);
    expect(dialog.open).toBe(false);
  });
});
