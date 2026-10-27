import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Shop } from './shop';
import { AccountState } from '../../../core/services/account-state';

describe('Shop', () => {
  let component: Shop;
  let fixture: ComponentFixture<Shop>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      imports: [Shop],
    }).compileComponents();

    fixture = TestBed.createComponent(Shop);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/catalog.php').flush({ skins: [], demoTopupsEnabled: true });
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('saves a skin once and updates ownership only after the server confirms it', () => {
    const state = TestBed.inject(AccountState);
    const http = TestBed.inject(HttpTestingController);
    const user = { id: 1, username: 'Player', email: 'player@example.com', tansans: 1000, juice: 100,
      ownedSkins: [], walletVersion: 0 };
    state.set(user);
    component.buyCosmetic('skin_1');
    component.buyCosmetic('skin_1');
    http.expectOne('/api/session.php').flush({ user, csrfToken: 'token' });
    const request = http.expectOne('/api/wallet.php');
    expect(component.owns('skin_1')).toBe(false);
    request.flush({ user: { ...user, tansans: 700, ownedSkins: ['skin_1'], walletVersion: 1 } });
    expect(component.userCoins).toBe(700);
    expect(component.owns('skin_1')).toBe(true);
    component.buyCosmetic('skin_1');
    http.expectNone('/api/session.php');
  });

  it('replaces the displayed inventory when another account signs in', () => {
    const state = TestBed.inject(AccountState);
    state.set({ id: 1, username: 'A', email: 'a@example.com', tansans: 700, juice: 80, ownedSkins: ['skin_1'] });
    expect(component.owns('skin_1')).toBe(true);
    state.set({ id: 2, username: 'B', email: 'b@example.com', tansans: 1000, juice: 100, ownedSkins: [] });
    expect(component.owns('skin_1')).toBe(false);
    expect(component.userCoins).toBe(1000);
  });
});
