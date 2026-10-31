import { Component, DestroyRef, HostListener, effect, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, finalize, switchMap } from 'rxjs';
import { AccountState } from '../../../core/services/account-state';
import { User, SettingsChange } from '../../../core/services/user';
import { authErrorMessage } from '../../../core/services/auth';
import { Confirmation } from '../../../core/services/confirmation';
import { AudioSettingsPanel } from '../../../shared/audio-settings/audio-settings';
import { passwordValidator } from '../../../core/validators/password';

type Setting = SettingsChange['action'];
const matchesPassword: ValidatorFn = group => group.get('value')?.value === group.get('confirmPassword')?.value
  ? null : { mismatch: true };
function makeForm(validator: ValidatorFn, password = false) {
  return new FormGroup({
    value: new FormControl('', { nonNullable: true, validators: [Validators.required, validator] }),
    confirmPassword: new FormControl('', { nonNullable: true }),
    currentPassword: new FormControl('', { nonNullable: true, validators: Validators.required }),
  }, { validators: password ? matchesPassword : null });
}

@Component({
  selector: 'app-settings', imports: [ReactiveFormsModule, RouterLink, AudioSettingsPanel],
  templateUrl: './settings.html', styleUrls: ['../account.css', './settings.css'],
})
export class Settings {
  readonly soundPanel = viewChild(AudioSettingsPanel);
  readonly account = inject(AccountState);
  private readonly service = inject(User);
  private readonly confirmation = inject(Confirmation);
  private readonly destroyRef = inject(DestroyRef);
  readonly pending = signal<Setting | null>(null);
  readonly error = signal('');
  readonly message = signal('');
  readonly showPasswords = signal(false);
  readonly forms = {
    username: makeForm(Validators.pattern(/^[A-Za-z0-9_]{3,50}$/)),
    password: makeForm(passwordValidator, true),
  };
  readonly sections: { action: Setting; title: string; label: string; help: string }[] = [
    { action: 'username', title: 'Change username', label: 'New username', help: '3–50 letters, numbers or underscores. Use this username to sign in.' },
    { action: 'password', title: 'Change password', label: 'New password', help: 'Use 8–72 bytes. Symbols and spaces are welcome; some characters use more than one byte.' },
  ];
  private editingAccountId?: number;
  private saved = { username: '' };

  constructor() {
    effect(() => {
      const user = this.account.user();
      if (user?.id === this.editingAccountId) return;
      this.editingAccountId = user?.id;
      this.saved = { username: user?.username || '' };
      this.resetForms();
      this.message.set('');
      this.error.set('');
    });
  }

  get hasDraft(): boolean {
    return !!this.account.user() && (this.changed('username') ||
      Object.values(this.forms).some(form => !!form.controls.currentPassword.value) ||
      !!this.forms.password.controls.value.value || !!this.forms.password.controls.confirmPassword.value);
  }

  changed(action: Setting): boolean {
    return action === 'password' ? !!this.forms.password.controls.value.value
      : this.forms[action].controls.value.value !== this.saved[action];
  }

  save(action: Setting): void {
    const form = this.forms[action];
    form.markAllAsTouched();
    if (this.pending() || form.invalid || !this.changed(action)) return;
    const id = this.editingAccountId;
    const value = form.getRawValue();
    const change: SettingsChange = action === 'password'
      ? { action, currentPassword: value.currentPassword, newPassword: value.value, confirmPassword: value.confirmPassword }
      : { action, currentPassword: value.currentPassword, username: value.value.trim() };
    this.pending.set(action);
    this.error.set('');
    this.message.set('');
    const detail = action === 'password' ? 'Use your new password the next time you sign in.'
      : `Your sign-in ${action} will change to “${value.value.trim()}”.`;
    this.confirmation.ask({
      title: `Are you sure you want to change your ${action}?`,
      message: `${detail} Other sessions will be signed out. You will stay signed in here.`,
      confirmLabel: `Change ${action}`, cancelLabel: 'Keep editing',
    }).pipe(
      switchMap(confirmed => confirmed && this.account.user()?.id === id ? this.service.saveSettings(change) : EMPTY),
      takeUntilDestroyed(this.destroyRef), finalize(() => this.pending.set(null)),
    ).subscribe({
      next: result => {
        if (this.account.user()?.id !== id || result.user.id !== id) return;
        if (action !== 'password') this.saved[action] = result.user[action];
        form.reset({ value: action === 'password' ? '' : result.user[action], currentPassword: '', confirmPassword: '' });
        // Never retain previously verified passwords after changing sign-in details.
        Object.values(this.forms).forEach(other => other.controls.currentPassword.reset(''));
        this.showPasswords.set(false);
        this.message.set(`Your ${action} has been changed. Other sessions are signed out; you’re still signed in here.`);
      },
      error: error => {
        if (this.account.user()?.id !== id) return;
        form.controls.currentPassword.reset('');
        this.error.set(authErrorMessage(error));
      },
    });
  }

  discard(): void {
    if (this.pending() || !this.hasDraft) return;
    this.confirmation.ask({
      title: 'Are you sure you want to discard these changes?',
      message: 'Your unsaved sign-in details and entered passwords will be cleared.',
      confirmLabel: 'Discard changes', cancelLabel: 'Keep editing',
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(confirmed => {
      if (confirmed) { this.resetForms(); this.error.set(''); this.message.set(''); }
    });
  }

  private resetForms(): void {
    for (const action of ['username', 'password'] as const) {
      this.forms[action].reset({ value: action === 'password' ? '' : this.saved[action], currentPassword: '', confirmPassword: '' });
    }
    this.showPasswords.set(false);
  }

  confirmLeave() {
    const soundChanges = !!this.soundPanel()?.hasChanges();
    return !(this.hasDraft || soundChanges) || this.confirmation.ask({
      title: 'Are you sure you want to leave?',
      message: this.pending() ? 'Your account change is still processing and may complete after you leave.'
        : soundChanges
          ? this.hasDraft ? 'Your unsaved sound settings, sign-in changes, and entered passwords will be discarded.'
            : 'Your unsaved sound settings will be discarded. Your last saved levels will be kept.'
          : 'Your unsaved sign-in changes and entered passwords will be discarded.',
      confirmLabel: 'Leave page', cancelLabel: 'Keep editing',
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasDraft || this.soundPanel()?.hasChanges()) { event.preventDefault(); event.returnValue = ''; }
  }
}
