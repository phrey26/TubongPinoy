import { Confirmation } from '../../../core/services/confirmation';
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
    TestBed.inject(HttpTestingController).expectOne('/api/catalog.php').flush({ skins: [{ id: 'skin_1', name: 'Dragon Armor', type: 'Legendary Skin', price: 300, imageUrl: 'assets/icons/customization.svg' }], demoTopupsEnabled: true });
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('keeps upcoming skins disabled even with enough Tansans and never starts a purchase', () => {
    TestBed.inject(AccountState).set({ id: 1, username: 'Player', tansans: 1000, juice: 40 });
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.skin-grid button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Coming soon');
    button.click();
    component.buyCosmetic('skin_1');
    expect(TestBed.inject(Confirmation).active()).toBeNull();
    expect(component.userCoins).toBe(1000);
    TestBed.inject(HttpTestingController).expectNone('/api/session.php');
    TestBed.inject(HttpTestingController).expectNone('/api/wallet.php');
  });

  it('saves a refill once and updates the balance only after the server confirms it', () => {
    const state = TestBed.inject(AccountState);
    const http = TestBed.inject(HttpTestingController);
    const user = { id: 1, username: 'Player', tansans: 1000, juice: 80,
      ownedSkins: [], walletVersion: 0 };
    state.set(user);
    component.buyItem('energy_small');
    component.buyItem('energy_small');
    expect(TestBed.inject(Confirmation).active()?.message).toContain('50 Tansans');
    http.expectNone('/api/session.php');
    TestBed.inject(Confirmation).respond(true);
    http.expectOne('/api/session.php').flush({ user, csrfToken: 'token' });
    const request = http.expectOne('/api/wallet.php');
    expect(component.userEnergy).toBe(80);
    request.flush({ user: { ...user, tansans: 950, juice: 100, walletVersion: 1 } });
    expect(component.userCoins).toBe(950);
    expect(component.userEnergy).toBe(100);
    component.buyItem('energy_small');
    http.expectNone('/api/session.php');
  });

  it('cancels a purchase without making requests or spending Tansans', () => {
    const state = TestBed.inject(AccountState);
    state.set({ id: 1, username: 'A', tansans: 700, juice: 80 });
    component.buyItem('energy_small');
    TestBed.inject(Confirmation).respond(false);
    expect(component.pending()).toBe(false);
    expect(component.userCoins).toBe(700);
    TestBed.inject(HttpTestingController).expectNone('/api/session.php');
    TestBed.inject(HttpTestingController).expectNone('/api/wallet.php');
  });

  it('replaces the displayed inventory when another account signs in', () => {
    const state = TestBed.inject(AccountState);
    state.set({ id: 1, username: 'A', tansans: 700, juice: 80, ownedSkins: ['skin_1'] });
    expect(component.owns('skin_1')).toBe(true);
    state.set({ id: 2, username: 'B', tansans: 1000, juice: 100, ownedSkins: [] });
    expect(component.owns('skin_1')).toBe(false);
    expect(component.userCoins).toBe(1000);
  });

  it('groups permanent Juice status with the balance and prevents unnecessary refills', () => {
    TestBed.inject(AccountState).set({ id: 1, username: 'Tester', 
      tansans: 999999, juice: 100, permanentJuice: true });
    fixture.detectChanges();
    const wallet = fixture.nativeElement.querySelector('.shop-wallet') as HTMLElement;
    expect(wallet.textContent).toContain('Unlimited');
    expect(wallet.textContent).toContain('No expiry');
    const buttons = [...fixture.nativeElement.querySelectorAll('.refill-grid button')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(3);
    expect(buttons.every(button => button.disabled && button.textContent?.includes('Unlimited active'))).toBe(true);
    component.buyItem('energy_small');
    TestBed.inject(HttpTestingController).expectNone('/api/session.php');
  });

  it('explains unavailable purchases and enables refills when Juice and balances allow them', () => {
    const state = TestBed.inject(AccountState);
    const user = { id: 1, username: 'Player', tansans: 0, juice: 40 };
    state.set(user);
    fixture.detectChanges();
    const buttons = () => [...fixture.nativeElement.querySelectorAll('.refill-grid button')] as HTMLButtonElement[];
    expect(buttons().every(button => button.disabled && button.textContent?.includes('Not enough Tansans'))).toBe(true);
    state.set({ ...user, tansans: 1000, juice: 100 });
    fixture.detectChanges();
    expect(buttons()[0].textContent).toContain('Juice is full');
    expect(buttons()[0].disabled).toBe(true);
    expect(buttons()[2].disabled).toBe(false);
    state.set({ ...user, tansans: 1000, juice: 40 });
    fixture.detectChanges();
    expect(buttons().every(button => !button.disabled)).toBe(true);
  });

  it('lets the user retry a failed catalog request', () => {
    const http = TestBed.inject(HttpTestingController);
    component.loadCatalog();
    http.expectOne('/api/catalog.php').flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    const retry = fixture.nativeElement.querySelector('.shop-empty button') as HTMLButtonElement;
    expect(retry.textContent).toContain('Try again');
    retry.click();
    http.expectOne('/api/catalog.php').flush({ skins: [
      { id: 'skin_1', name: 'Dragon Armor', type: 'Legendary Skin', price: 300, imageUrl: 'assets/icons/customization.svg' },
    ], demoTopupsEnabled: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.skin-grid').textContent).toContain('Dragon Armor');
    expect(fixture.nativeElement.querySelector('.shop-empty')).toBeNull();
  });
});
