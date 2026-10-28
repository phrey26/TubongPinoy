import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Home } from './home';
import { AccountState } from '../../../core/services/account-state';
import { DatePipe } from '@angular/common';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([])],
      imports: [Home],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the clock visible and shows next-point and exact full-refill details on hover', () => {
    const now = Date.now();
    const fullAt = now + 44000 + 19 * 144000;
    TestBed.inject(AccountState).set({ id: 1, username: 'Juan', email: 'juan@example.com',
      tansans: 0, juice: 80, serverTime: now, nextJuiceAt: now + 44000 });
    fixture.detectChanges();
    const clock = fixture.nativeElement.querySelector('.home-clock') as HTMLButtonElement;
    expect(clock.textContent).toMatch(/\d{2}:\d{2}:\d{2} (AM|PM)/);
    expect(clock.textContent).not.toContain('Next Juice');
    expect(fixture.nativeElement.querySelector('[role="tooltip"]')).toBeNull();
    fixture.nativeElement.querySelector('.home-clock-group').dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const popup = fixture.nativeElement.querySelector('[role="tooltip"]') as HTMLElement;
    expect(popup.textContent).toContain('Next Juice in');
    expect(popup.textContent).toContain(new DatePipe('en-US').transform(fullAt, 'h:mm:ss a'));
    fixture.nativeElement.querySelector('.home-clock-group').dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('opens details on focus or tap and closes them on Escape or an outside click', () => {
    TestBed.inject(AccountState).set({ id: 1, username: 'Juan', email: 'juan@example.com', tansans: 0, juice: 100 });
    fixture.detectChanges();
    const clock = fixture.nativeElement.querySelector('.home-clock') as HTMLButtonElement;
    clock.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(clock.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('.juice-clock-full').textContent).toContain('Already full');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(clock.getAttribute('aria-expanded')).toBe('false');
    clock.click();
    fixture.detectChanges();
    expect(clock.getAttribute('aria-expanded')).toBe('true');
    document.body.click();
    fixture.detectChanges();
    expect(clock.getAttribute('aria-expanded')).toBe('false');
  });
});
