import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { Auth, authErrorMessage, safeReturnUrl } from '../../../core/services/auth';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-login',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {

  showPassword = false;
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));

  constructor(private auth: Auth) {}

  loginForm = new FormGroup({
    identity: new FormControl('', [Validators.required, Validators.maxLength(254)]),
    password: new FormControl('', [Validators.required]),
    rememberMe: new FormControl(false)
  });

  togglePassword() { this.showPassword = !this.showPassword; }

  onSubmit() {
    if (this.isSubmitting()) return;
    this.errorMessage.set('');
    if (this.loginForm.valid) {
      const { identity, password, rememberMe } = this.loginForm.getRawValue();
      this.isSubmitting.set(true);
      this.auth.login({ identity: identity!.trim(), password: password!, rememberMe: !!rememberMe })
        .pipe(finalize(() => this.isSubmitting.set(false)))
        .subscribe({
          next: () => void this.router.navigateByUrl(this.returnUrl),
          error: (error: unknown) => this.errorMessage.set(authErrorMessage(error)),
        });
    } else {
      this.loginForm.markAllAsTouched();
    }
  }

  get f() { return this.loginForm.controls; }
}
