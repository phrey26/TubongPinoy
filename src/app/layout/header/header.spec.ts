import { AccountState } from '../../core/services/account-state';
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

  function signIn(): HTMLButtonElement {
    TestBed.inject(AccountState).set({ id: 1, username: 'Juan', email: 'juan@example.com', tansans: 0, juice: 100 });
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.account-trigger');
  }

  it('opens profile and inventory options, keeps settings disabled, and confirms logout', () => {
    const trigger = signIn();
    expect(fixture.nativeElement.querySelector('.account-popover')).toBeNull();
    expect(trigger.textContent).toContain('Juan');
    expect(trigger.textContent).not.toContain('Logout');
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const options = [...fixture.nativeElement.querySelectorAll('.account-option')] as HTMLButtonElement[];
    expect(options).toHaveLength(4);
    expect(options[0].textContent).toContain('Edit profile');
    expect(options[1].textContent).toContain('Inventory');
    expect(options[2].textContent).toContain('Settings');
    expect(options[0].disabled).toBe(false);
    expect(options[1].disabled).toBe(false);
    expect(options[2].disabled && options[2].textContent?.includes('Coming soon')).toBe(true);
    expect(options[3].disabled).toBe(false);
    options[3].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.account-popover')).toBeNull();
    expect(TestBed.inject(Confirmation).active()?.confirmLabel).toBe('Log out');
    TestBed.inject(Confirmation).respond(false);
    expect(component.auth.user()?.username).toBe('Juan');
  });

  it('dismisses the miniwindow on Escape, outside click, or moving focus out', () => {
    const trigger = signIn();
    const focus = vi.spyOn(trigger, 'focus');
    trigger.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(component.accountMenuOpen()).toBe(false);
    expect(focus).toHaveBeenCalled();
    trigger.click();
    fixture.detectChanges();
    document.body.click();
    expect(component.accountMenuOpen()).toBe(false);
    trigger.click();
    fixture.detectChanges();
    document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(component.accountMenuOpen()).toBe(false);
  });

  it('opens only one header panel at a time and clears account options on sign-out', () => {
    const trigger = signIn();
    component.toggleMenu();
    trigger.click();
    fixture.detectChanges();
    expect(component.menuOpen()).toBe(false);
    expect(component.accountMenuOpen()).toBe(true);
    component.toggleMenu();
    expect(component.menuOpen()).toBe(true);
    expect(component.accountMenuOpen()).toBe(false);
    trigger.click();
    fixture.detectChanges();
    TestBed.inject(AccountState).set(null);
    fixture.detectChanges();
    expect(component.accountMenuOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('.account-trigger')).toBeNull();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the saved identity and opens the requested account page', () => {
    signIn();
    TestBed.inject(AccountState).set({ ...component.auth.user()!, displayName: 'Juan Plays', avatarId: 'miko' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.header-username').textContent).toContain('Juan Plays');
    expect(fixture.nativeElement.querySelector('.account-avatar').getAttribute('src')).toBe('assets/avatars/miko.png');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component.selectAccountOption('edit-profile');
    expect(navigate).toHaveBeenLastCalledWith('/account/profile');
    component.selectAccountOption('inventory');
    expect(navigate).toHaveBeenLastCalledWith('/account/inventory');
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
