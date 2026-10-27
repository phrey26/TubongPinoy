import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AccountState } from './account-state';
import { Currency } from './currency';
import { Energy } from './energy';
import { Wallet } from './wallet';

describe('Per-account balances and inventory', () => {
  const alice = { id: 1, username: 'Alice', email: 'alice@example.com', tansans: 700, juice: 80,
    ownedSkins: ['skin_1'], walletVersion: 3, unlimitedJuiceUntil: 0 };
  const bob = { id: 2, username: 'Bob', email: 'bob@example.com', tansans: 1000, juice: 100,
    ownedSkins: [], walletVersion: 0, unlimitedJuiceUntil: 0 };
  let state: AccountState;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    state = TestBed.inject(AccountState);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('clears account A on logout and loads account B without carrying balances or skins across', () => {
    const coins = TestBed.inject(Currency);
    const energy = TestBed.inject(Energy);
    const observed: number[] = [];
    energy.getEnergyLevel().subscribe(value => observed.push(value));
    state.set(alice);
    expect(coins.getCoins()).toBe(700);
    expect(state.user()?.ownedSkins).toEqual(['skin_1']);
    state.set(null);
    expect(coins.getCoins()).toBe(0);
    expect(energy.getEnergyLevelValue()).toBe(0);
    state.set(bob);
    expect(coins.getCoins()).toBe(1000);
    expect(state.user()?.ownedSkins).toEqual([]);
    expect(observed).toEqual([0, 80, 0, 100]);
  });

  it('ignores old snapshots of the same account', () => {
    state.set(alice);
    state.set({ ...alice, tansans: 1000, ownedSkins: [], walletVersion: 2 });
    expect(state.user()).toEqual(alice);
  });

  it('does not change balances until the server confirms a fixed-price game action', () => {
    state.set(alice);
    TestBed.inject(Energy).consumeEnergy('tumbang_retry').subscribe();
    http.expectOne('/api/session.php').flush({ user: alice, csrfToken: 'token' });
    const request = http.expectOne('/api/wallet.php');
    expect(request.request.body.action).toBe('consume_juice');
    expect(request.request.body.item).toBe('tumbang_retry');
    expect(request.request.body.amount).toBeUndefined();
    expect(request.request.headers.get('X-CSRF-Token')).toBe('token');
    expect(state.user()?.juice).toBe(80);
    request.flush({ user: { ...alice, juice: 60, walletVersion: 4 } });
    expect(state.user()?.juice).toBe(60);
  });

  it('refreshes stale balances after insufficient-funds errors without granting ownership', () => {
    state.set(alice);
    TestBed.inject(Wallet).change('purchase', 'skin_2').subscribe({ error: () => {} });
    http.expectOne('/api/session.php').flush({ user: alice, csrfToken: 'token' });
    http.expectOne('/api/wallet.php').flush({ message: 'Not enough Tansans.',
      user: { ...alice, tansans: 0, walletVersion: 4 } }, { status: 409, statusText: 'Conflict' });
    expect(state.user()?.tansans).toBe(0);
    expect(state.user()?.ownedSkins).toEqual(['skin_1']);
  });

  it('discards an outstanding purchase response after the account changes', () => {
    state.set(alice);
    TestBed.inject(Wallet).change('purchase', 'skin_2').subscribe();
    http.expectOne('/api/session.php').flush({ user: alice, csrfToken: 'token' });
    const request = http.expectOne('/api/wallet.php');
    state.set(bob);
    request.flush({ user: { ...alice, tansans: 500, ownedSkins: ['skin_1', 'skin_2'], walletVersion: 4 } });
    expect(state.user()).toEqual(bob);
  });

  it('restores unlimited Juice from the account and respects its expiry', () => {
    const energy = TestBed.inject(Energy);
    state.set({ ...alice, unlimitedJuiceUntil: Date.now() + 60000 });
    expect(energy.hasUnlimited()).toBe(true);
    state.set({ ...alice, unlimitedJuiceUntil: Date.now() - 1 });
    expect(energy.hasUnlimited()).toBe(false);
  });
});
