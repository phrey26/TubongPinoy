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
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/signup-challenge.php').flush({ id: 'challenge', question: 'What is 2 + 3?', expiresAt: Date.now() + 300000 });
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('creates an account and continues to the originally requested game', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpTestingController);
    component.signupForm.setValue({ username: 'Player', 
      password: 'password123', confirmPassword: 'password123', terms: true, challengeAnswer: '5', website: '' });
    component.onSubmit();
    component.onSubmit();
    http.expectOne('/api/session.php').flush({ user: null, csrfToken: 'token' });
    const request = http.expectOne('/api/signup.php');
    expect(request.request.body.terms).toBe(true);
    expect(request.request.body).not.toHaveProperty('email');
    expect(request.request.body.challengeId).toBe('challenge');
    expect(request.request.body.challengeAnswer).toBe('5');
    request.flush({ user: { id: 1, username: 'Player' }, csrfToken: 'new' });
    expect(navigate).toHaveBeenCalledWith('/games/jolens-blast');
    expect(component.isSubmitting()).toBe(false);
  });

  it('rejects mismatched passwords without sending a request', () => {
    component.signupForm.setValue({ username: 'Player', 
      password: 'password123', confirmPassword: 'different123', terms: true, challengeAnswer: '5', website: '' });
    component.onSubmit();
    expect(component.signupForm.hasError('passwordMismatch')).toBe(true);
    TestBed.inject(HttpTestingController).expectNone('/api/session.php');
  });

  it.each(['short', 'é'.repeat(37), 'password\0'])('rejects passwords that PHP cannot accept', password => {
    component.signupForm.setValue({ username: 'Player', password,
      confirmPassword: password, terms: true, challengeAnswer: '5', website: '' });
    component.onSubmit();
    expect(component.f.password.invalid).toBe(true);
    TestBed.inject(HttpTestingController).expectNone('/api/session.php');
  });

  it('accepts a Unicode password at the byte boundary and requires policy agreement', () => {
    const password = 'é'.repeat(36);
    component.signupForm.setValue({ username: 'Player', password,
      confirmPassword: password, terms: false, challengeAnswer: '5', website: '' });
    expect(component.f.password.valid).toBe(true);
    component.onSubmit();
    TestBed.inject(HttpTestingController).expectNone('/api/session.php');
    expect(component.f.terms.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('a[href="/privacy"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/terms"]')).toBeTruthy();
  });
  it('shows Username is taken next to the field and refreshes the single-use challenge', () => {
    const http = TestBed.inject(HttpTestingController);
    component.signupForm.setValue({ username: 'Player', password: 'password123', confirmPassword: 'password123',
      terms: true, challengeAnswer: '5', website: '' });
    component.onSubmit(); http.expectOne('/api/session.php').flush({ user: null, csrfToken: 'token' });
    http.expectOne('/api/signup.php').flush({ message: 'Username is taken.' }, { status: 409, statusText: 'Conflict' });
    http.expectOne('/api/signup-challenge.php').flush({ id: 'new', question: 'What is 4 + 3?', expiresAt: Date.now() + 300000 });
    fixture.detectChanges();
    expect(component.usernameTaken()).toBe(true);
    expect(fixture.nativeElement.querySelector('#signup-username-taken').textContent).toContain('Username is taken');
    expect(fixture.nativeElement.querySelector('#signup-email')).toBeNull();
    expect(component.f.challengeAnswer.value).toBe('');
    component.f.username.setValue('Different'); expect(component.usernameTaken()).toBe(false);
  });

  it('blocks signup when the human check is missing or unavailable and supports retry', () => {
    const http = TestBed.inject(HttpTestingController);
    component.refreshChallenge();
    http.expectOne('/api/signup-challenge.php').flush({}, { status: 503, statusText: 'Unavailable' });
    component.onSubmit(); expect(component.challengeError()).toContain('could not load');
    http.expectNone('/api/signup.php');
    component.refreshChallenge();
    http.expectOne('/api/signup-challenge.php').flush({ id: 'retry', question: 'What is 4 + 3?', expiresAt: Date.now() + 300000 });
    expect(component.challenge()?.id).toBe('retry');
  });

});
