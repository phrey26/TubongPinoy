import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { vi } from 'vitest';
import { AccountState } from './account-state';
import { JuiceRecovery } from './juice-recovery';

describe('Passive Juice recovery', () => {
  const now = 1800000000000;
  const user = { id: 1, username: 'Juan', tansans: 0, juice: 80,
    nextJuiceAt: now + 144000, serverTime: now, walletVersion: 1 };
  let state: AccountState;
  let recovery: JuiceRecovery;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    state = TestBed.inject(AccountState);
    recovery = TestBed.inject(JuiceRecovery);
    http = TestBed.inject(HttpTestingController);
    state.set(user);
    TestBed.tick();
  });
  afterEach(() => { http.verify(); vi.useRealTimers(); });

  it('counts down and waits for server confirmation before awarding free Juice', () => {
    expect(recovery.status()).toBe('Next Juice in 2:24');
    vi.advanceTimersByTime(143000);
    expect(recovery.status()).toBe('Next Juice in 0:01');
    http.expectNone('/api/me.php');
    vi.advanceTimersByTime(1000);
    const request = http.expectOne('/api/me.php');
    expect(state.user()?.juice).toBe(80);
    request.flush({ user: { ...user, juice: 81, walletVersion: 2,
      serverTime: now + 144000, nextJuiceAt: now + 288000 } });
    TestBed.tick();
    expect(state.user()?.juice).toBe(81);
    expect(recovery.status()).toBe('Next Juice in 2:24');
  });

  it('uses server time even when the device clock is an hour ahead', () => {
    vi.setSystemTime(now + 3600000);
    state.set({ ...user });
    TestBed.tick();
    vi.advanceTimersByTime(1000);
    expect(recovery.secondsRemaining()).toBe(143);
    http.expectNone('/api/me.php');
  });

  it('starts a new countdown at exactly 2:24 when a response arrives between timer ticks', () => {
    vi.setSystemTime(now + 500);
    state.set({ ...user, serverTime: now + 500, nextJuiceAt: now + 144500 });
    TestBed.tick();
    expect(recovery.status()).toBe('Next Juice in 2:24');
  });

  it('computes the full refill time from the remaining partial interval and missing points', () => {
    state.set({ ...user, nextJuiceAt: now + 44000 });
    TestBed.tick();
    const fullAt = now + 44000 + 19 * 144000;
    expect(recovery.fullRefillAt()).toBe(fullAt);
    state.set({ ...user, juice: 81, walletVersion: 2, nextJuiceAt: now + 188000 });
    TestBed.tick();
    expect(recovery.fullRefillAt()).toBe(fullAt);
    state.set({ ...user, juice: 99, walletVersion: 3, nextJuiceAt: now + 44000 });
    TestBed.tick();
    expect(recovery.fullRefillAt()).toBe(now + 44000);
    state.set({ ...user, juice: 100, walletVersion: 4, nextJuiceAt: 0 });
    TestBed.tick();
    expect(recovery.fullRefillAt()).toBeNull();
  });

  it('does not mix a delayed recovery response into a different account', () => {
    vi.advanceTimersByTime(144000);
    const request = http.expectOne('/api/me.php');
    state.set({ ...user, id: 2, username: 'Maria', juice: 100, nextJuiceAt: 0 });
    TestBed.tick();
    request.flush({ user: { ...user, juice: 81, walletVersion: 2 } });
    expect(state.user()?.id).toBe(2);
    expect(state.user()?.juice).toBe(100);
  });

  it('retries network failures without granting local Juice or flooding requests', () => {
    vi.advanceTimersByTime(144000);
    http.expectOne('/api/me.php').error(new ProgressEvent('error'));
    expect(recovery.status()).toContain('Reconnecting');
    expect(state.user()?.juice).toBe(80);
    vi.advanceTimersByTime(14000);
    http.expectNone('/api/me.php');
    vi.advanceTimersByTime(1000);
    http.expectOne('/api/me.php').flush({ user: { ...user, juice: 81, walletVersion: 2,
      serverTime: now + 159000, nextJuiceAt: now + 288000 } });
    TestBed.tick();
    expect(recovery.status()).toBe('Next Juice in 2:09');
  });

  it('stops refill requests when full or logged out and labels unlimited Juice', () => {
    state.set({ ...user, juice: 100, nextJuiceAt: 0 });
    TestBed.tick();
    expect(recovery.status()).toBe('Juice is full');
    vi.advanceTimersByTime(300000);
    http.expectNone('/api/me.php');
    state.set({ ...user, juice: 100, nextJuiceAt: 0, permanentJuice: true });
    TestBed.tick();
    expect(recovery.status()).toBe('Unlimited Juice active');
    state.set(null);
    TestBed.tick();
    vi.advanceTimersByTime(300000);
    expect(recovery.status()).toBe('');
    http.expectNone('/api/me.php');
  });
});
