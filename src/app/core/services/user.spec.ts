import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AccountState } from './account-state';
import { User } from './user';

describe('Account customization API', () => {
  const alice = { id: 1, username: 'Alice', email: 'a@example.com', tansans: 100, juice: 80, walletVersion: 1 };
  const bob = { ...alice, id: 2, username: 'Bob' };
  let service: User;
  let state: AccountState;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    state = TestBed.inject(AccountState);
    state.set(alice);
    service = TestBed.inject(User);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('posts settings with CSRF and accepts the updated sign-in details', () => {
    const change = { action: 'username' as const, username: 'AliceNew', currentPassword: 'current-password' };
    service.saveSettings(change).subscribe();
    http.expectOne('/api/session.php').flush({ user: alice, csrfToken: 'token' });
    const request = http.expectOne('/api/settings.php');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('token');
    expect(request.request.body).toEqual(change);
    request.flush({ user: { ...alice, username: 'AliceNew', walletVersion: 2 }, csrfToken: 'rotated' });
    expect(state.user()?.username).toBe('AliceNew');
    expect(state.user()).not.toHaveProperty('currentPassword');
  });

  it('keeps the session after an incorrect confirmation password', () => {
    let status = 0;
    service.saveSettings({ action: 'email', email: 'new@example.com', currentPassword: 'wrong' })
      .subscribe({ error: error => status = error.status });
    http.expectOne('/api/session.php').flush({ user: alice, csrfToken: 'token' });
    http.expectOne('/api/settings.php').flush({ message: 'Your current password is incorrect.' }, { status: 422, statusText: 'Invalid' });
    expect(status).toBe(422);
    expect(state.user()).toEqual(alice);
  });

  it('saves only profile choices with CSRF and accepts the confirmed account snapshot', () => {
    service.saveProfile('Alice Plays', 'lila').subscribe();
    http.expectOne('/api/session.php').flush({ user: alice, csrfToken: 'token' });
    const request = http.expectOne('/api/profile.php');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('token');
    expect(request.request.body).toEqual({ displayName: 'Alice Plays', avatarId: 'lila' });
    expect(state.user()?.displayName).toBeUndefined();
    request.flush({ user: { ...alice, displayName: 'Alice Plays', avatarId: 'lila', walletVersion: 2 } });
    expect(state.user()?.displayName).toBe('Alice Plays');
    expect(state.user()?.username).toBe('Alice');
  });

  it('waits for confirmed equipment and never overwrites a newer account snapshot', () => {
    service.equip('tumbang-preso', 'slipper_blue').subscribe();
    http.expectOne('/api/session.php').flush({ user: alice, csrfToken: 'token' });
    const request = http.expectOne('/api/inventory.php');
    expect(request.request.body).toEqual({ game: 'tumbang-preso', skinId: 'slipper_blue' });
    state.set({ ...alice, displayName: 'Newer name', walletVersion: 4 });
    request.flush({ user: { ...alice, equippedSkins: { 'tumbang-preso': 'slipper_blue' }, walletVersion: 2 } });
    expect(state.user()?.displayName).toBe('Newer name');
  });

  it('does not apply a delayed save to a different account', () => {
    service.saveProfile('Alice Plays', 'maya').subscribe();
    http.expectOne('/api/session.php').flush({ user: alice, csrfToken: 'token' });
    const request = http.expectOne('/api/profile.php');
    state.set(bob);
    request.flush({ user: { ...alice, displayName: 'Alice Plays', walletVersion: 2 } });
    expect(state.user()).toEqual(bob);
  });

  it('rejects a save if the session belongs to another account', () => {
    let status = 0;
    service.equip('jolens-blast', 'shooter_gold').subscribe({ error: error => status = error.status });
    http.expectOne('/api/session.php').flush({ user: bob, csrfToken: 'token' });
    http.expectNone('/api/inventory.php');
    expect(status).toBe(409);
  });

  it('does not restore identity after logout when inventory arrives late', () => {
    service.inventory().subscribe();
    const request = http.expectOne('/api/inventory.php');
    state.set(null);
    request.flush({ user: alice, items: [], collectibles: [] });
    expect(state.user()).toBeNull();
  });
});
