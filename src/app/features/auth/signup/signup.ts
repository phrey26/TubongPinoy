import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { Auth, authErrorMessage, safeReturnUrl } from '../../../core/services/auth';
import { passwordValidator } from '../../../core/validators/password';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-signup',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './signup.html',
  styleUrl: './signup.css',
})
export class Signup {

  showPassword = false;
  showConfirmPassword = false;
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
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
    email: new FormControl('', [Validators.required, Validators.email, Validators.maxLength(254)]),
    password: new FormControl('', [Validators.required, passwordValidator]),
    confirmPassword: new FormControl('', [Validators.required]),
    terms: new FormControl(false, [Validators.requiredTrue])
  }, { validators: this.passwordMatchValidator });

  togglePassword() { this.showPassword = !this.showPassword; }
  toggleConfirmPassword() { this.showConfirmPassword = !this.showConfirmPassword; }

  onSubmit() {
    if (this.isSubmitting()) return;
    this.errorMessage.set('');
    if (this.signupForm.valid) {
      const { username, email, password, terms } = this.signupForm.getRawValue();
      this.isSubmitting.set(true);
      this.auth.signup({ username: username!.trim(), email: email!.trim(), password: password!, terms: !!terms })
        .pipe(finalize(() => this.isSubmitting.set(false)))
        .subscribe({
          next: () => void this.router.navigateByUrl(this.returnUrl),
          error: (error: unknown) => this.errorMessage.set(authErrorMessage(error)),
        });
    } else {
      this.signupForm.markAllAsTouched();
    }
  }

  get f() { return this.signupForm.controls; }
}
