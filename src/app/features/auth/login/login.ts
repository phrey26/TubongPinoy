import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '../../../core/services/auth';

@Component({
  selector: 'app-login',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {

  showPassword = false;

  constructor(private auth: Auth) {}

  loginForm = new FormGroup({
    identity: new FormControl('', [Validators.required, Validators.minLength(3)]),
    password: new FormControl('', [Validators.required, Validators.minLength(6)]),
    rememberMe: new FormControl(false)
  });

  togglePassword() { this.showPassword = !this.showPassword; }

  onSubmit() {
    if (this.loginForm.valid) {
      const { identity, password } = this.loginForm.value;
      this.auth.login({ identity: identity!, password: password! })
        .subscribe({
          next: (res: any) => {
            alert(`🎮 Welcome back ${res.user.username}!`);
            this.auth.saveUser(res.user);
          },
          error: (err) => alert(err.error.message || 'Login failed')
        });
    } else {
      this.loginForm.markAllAsTouched();
    }
  }

  get f() { return this.loginForm.controls; }
}
