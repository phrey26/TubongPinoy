import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { Auth, SignupChallenge, authErrorMessage, safeReturnUrl } from '../../../core/services/auth';
import { passwordValidator } from '../../../core/validators/password';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-signup',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './signup.html',
  styleUrl: './signup.css',
})
export class Signup implements OnInit {

  showPassword = false;
  showConfirmPassword = false;
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly usernameTaken = signal(false);
  readonly challenge = signal<SignupChallenge | null>(null);
  readonly challengeLoading = signal(false);
  readonly challengeError = signal('');
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));

  constructor(private auth: Auth) {}

  passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');
    return password && confirmPassword && password.value !== confirmPassword.value
      ? { passwordMismatch: true }
      : null;
  };

  signupForm = new FormGroup({
    username: new FormControl('', [Validators.required, Validators.pattern(/^[A-Za-z0-9_]{3,50}$/)]),
    password: new FormControl('', [Validators.required, passwordValidator]),
    confirmPassword: new FormControl('', [Validators.required]),
    challengeAnswer: new FormControl('', [Validators.required, Validators.pattern(/^[0-9]{1,2}$/)]),
    website: new FormControl('', { nonNullable: true }),
    terms: new FormControl(false, [Validators.requiredTrue])
  }, { validators: this.passwordMatchValidator });

  togglePassword() { this.showPassword = !this.showPassword; }
  toggleConfirmPassword() { this.showConfirmPassword = !this.showConfirmPassword; }

  ngOnInit(): void {
    this.refreshChallenge();
    this.f.username.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.usernameTaken()) { this.usernameTaken.set(false); this.errorMessage.set(''); }
    });
  }

  refreshChallenge(): void {
    if (this.challengeLoading()) return;
    this.challenge.set(null); this.challengeError.set(''); this.f.challengeAnswer.reset('');
    this.challengeLoading.set(true);
    this.auth.signupChallenge().pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.challengeLoading.set(false)),
    ).subscribe({
      next: challenge => this.challenge.set(challenge),
      error: () => this.challengeError.set('The human check could not load. Please try again.'),
    });
  }

  onSubmit() {
    if (this.isSubmitting()) return;
    this.errorMessage.set('');
    if (this.signupForm.valid && this.challenge() && !this.challengeLoading()) {
      const { username, password, terms, challengeAnswer, website } = this.signupForm.getRawValue();
      this.isSubmitting.set(true);
      this.auth.signup({ username: username!.trim(), password: password!, terms: !!terms,
        challengeId: this.challenge()!.id, challengeAnswer: challengeAnswer!.trim(), website })
        .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.isSubmitting.set(false)))
        .subscribe({
          next: () => void this.router.navigateByUrl(this.returnUrl),
          error: (error: unknown) => {
            this.usernameTaken.set(error instanceof HttpErrorResponse && error.status === 409);
            this.errorMessage.set(this.usernameTaken() ? 'Username is taken.' : authErrorMessage(error));
            this.refreshChallenge();
          },
        });
    } else {
      this.signupForm.markAllAsTouched();
    }
  }

  get f() { return this.signupForm.controls; }
}
