import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Login } from './login';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ returnUrl: '/shop' }) } } }],
      imports: [Login],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('returns to the requested page after login and prevents duplicate submissions', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpTestingController);
    component.loginForm.setValue({ identity: 'Player', password: 'password123', rememberMe: false });
    component.onSubmit();
    component.onSubmit();
    expect(component.isSubmitting()).toBe(true);
    http.expectOne('/api/session.php').flush({ user: null, csrfToken: 'token' });
    http.expectOne('/api/login.php').flush({ user: { id: 1, username: 'Player' }, csrfToken: 'new' });
    expect(navigate).toHaveBeenCalledWith('/shop');
    expect(component.isSubmitting()).toBe(false);
  });

  it('shows a failed login inline and allows another attempt', () => {
    const http = TestBed.inject(HttpTestingController);
    component.loginForm.setValue({ identity: 'Player', password: 'incorrect', rememberMe: false });
    component.onSubmit();
    http.expectOne('/api/session.php').flush({ user: null, csrfToken: 'token' });
    http.expectOne('/api/login.php').flush({ message: 'Incorrect username/email or password.' },
      { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Incorrect');
    expect(component.isSubmitting()).toBe(false);
  });
});
