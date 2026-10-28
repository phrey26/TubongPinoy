import { Confirmation } from '../../core/services/confirmation';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Header } from './header';

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      imports: [Header],
    }).compileComponents();

    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/session.php').flush({ user: null, csrfToken: 'test' });
    await fixture.whenStable();
  });

  it('keeps the session when logout is cancelled and sends logout only after confirmation', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const confirmation = TestBed.inject(Confirmation);
    const http = TestBed.inject(HttpTestingController);
    component.logout();
    http.expectNone('/api/session.php');
    confirmation.respond(false);
    expect(component.loggingOut()).toBe(false);
    http.expectNone('/api/logout.php');
    component.logout();
    confirmation.respond(true);
    http.expectOne('/api/session.php').flush({ user: { id: 1 }, csrfToken: 'token' });
    http.expectOne('/api/logout.php').flush({ message: 'Logged out.' });
    expect(component.loggingOut()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/games');
    http.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens navigation and closes it with Escape or after choosing a destination', () => {
    const button = fixture.nativeElement.querySelector('.menu-button') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('.primary-nav').classList.contains('is-open')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.nav-home') as HTMLAnchorElement).click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
