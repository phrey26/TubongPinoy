import { Component, DestroyRef, HostListener, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, finalize, switchMap } from 'rxjs';
import { AccountState } from '../../../core/services/account-state';
import { User } from '../../../core/services/user';
import { authErrorMessage } from '../../../core/services/auth';
import { Confirmation } from '../../../core/services/confirmation';
import { PROFILE_AVATARS, avatarUrl } from '../../../core/services/customization';

const displayNameValidator: ValidatorFn = control => {
  const value = String(control.value ?? '').trim();
  return [...value].length >= 2 && [...value].length <= 30 &&
    /^[\p{L}\p{M}\p{N} ._'’\-]+$/u.test(value) && /[\p{L}\p{N}]/u.test(value)
    ? null : { displayName: true };
};

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './profile.html',
  styleUrl: '../account.css',
})
export class Profile {
  readonly account = inject(AccountState);
  private readonly service = inject(User);
  private readonly confirmation = inject(Confirmation);
  private readonly destroyRef = inject(DestroyRef);
  readonly avatars = PROFILE_AVATARS;
  readonly avatarUrl = avatarUrl;
  readonly pending = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly form = new FormGroup({
    displayName: new FormControl('', { nonNullable: true, validators: displayNameValidator }),
    avatarId: new FormControl('sunny', { nonNullable: true }),
  });
  private editingAccountId?: number;
  private saved = { displayName: '', avatarId: 'sunny' };

  constructor() {
    effect(() => {
      const user = this.account.user();
      if (user?.id === this.editingAccountId) return;
      this.editingAccountId = user?.id;
      this.saved = { displayName: user?.displayName || user?.username || '', avatarId: user?.avatarId || 'sunny' };
      this.form.reset(this.saved);
      this.message.set('');
      this.error.set('');
    });
  }

  get hasChanges(): boolean {
    return !!this.account.user() && (this.form.controls.displayName.value !== this.saved.displayName ||
      this.form.controls.avatarId.value !== this.saved.avatarId);
  }

  discard(): void {
    if (this.pending() || !this.hasChanges) return;
    this.confirmation.ask({
      title: 'Are you sure you want to discard these changes?',
      message: 'Your name and icon will return to your saved profile.',
      confirmLabel: 'Discard changes', cancelLabel: 'Keep editing',
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(confirmed => {
      if (!confirmed) return;
      this.form.reset(this.saved);
      this.error.set('');
      this.message.set('');
    });
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.pending() || this.form.invalid || !this.hasChanges) return;
    const id = this.editingAccountId;
    const value = this.form.getRawValue();
    this.pending.set(true);
    this.message.set('');
    this.error.set('');
    this.confirmation.ask({
      title: 'Are you sure you want to save your profile?',
      message: `Use “${value.displayName.trim()}” and your selected icon in your profile and leaderboards?`,
      confirmLabel: 'Save profile', cancelLabel: 'Keep editing',
    }).pipe(
      switchMap(confirmed => confirmed && this.account.user()?.id === id
        ? this.service.saveProfile(value.displayName.trim(), value.avatarId) : EMPTY),
      takeUntilDestroyed(this.destroyRef), finalize(() => this.pending.set(false)),
    ).subscribe({
      next: result => {
        if (this.account.user()?.id !== id || result.user.id !== id) return;
        this.saved = { displayName: result.user.displayName || result.user.username, avatarId: result.user.avatarId || 'sunny' };
        this.form.reset(this.saved);
        this.message.set('Profile saved. See you on the leaderboard!');
      },
      error: error => { if (this.account.user()?.id === id) this.error.set(authErrorMessage(error)); },
    });
  }

  confirmLeave() {
    return !this.hasChanges || this.confirmation.ask({
      title: 'Are you sure you want to leave?',
      message: this.pending() ? 'Your profile is still saving. The change may complete after you leave.'
        : 'Your unsaved name and icon changes will be discarded.',
      confirmLabel: 'Leave page', cancelLabel: 'Keep editing',
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasChanges) { event.preventDefault(); event.returnValue = ''; }
  }
}
