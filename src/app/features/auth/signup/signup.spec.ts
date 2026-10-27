import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Signup } from './signup';

describe('Signup', () => {
  let component: Signup;
  let fixture: ComponentFixture<Signup>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ returnUrl: '/games/jolens-blast' }) } } }],
      imports: [Signup],
    }).compileComponents();

    fixture = TestBed.createComponent(Signup);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('creates an account and continues to the originally requested game', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpTestingController);
    component.signupForm.setValue({ username: 'Player', email: 'player@example.com',
      password: 'password123', confirmPassword: 'password123', terms: true });
    component.onSubmit();
    component.onSubmit();
    http.expectOne('/api/session.php').flush({ user: null, csrfToken: 'token' });
    const request = http.expectOne('/api/signup.php');
    expect(request.request.body.terms).toBe(true);
    request.flush({ user: { id: 1, username: 'Player' }, csrfToken: 'new' });
    expect(navigate).toHaveBeenCalledWith('/games/jolens-blast');
    expect(component.isSubmitting()).toBe(false);
  });

  it('rejects mismatched passwords without sending a request', () => {
    component.signupForm.setValue({ username: 'Player', email: 'player@example.com',
      password: 'password123', confirmPassword: 'different123', terms: true });
    component.onSubmit();
    expect(component.signupForm.hasError('passwordMismatch')).toBe(true);
    TestBed.inject(HttpTestingController).expectNone('/api/session.php');
  });
});
