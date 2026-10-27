import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Topup } from './topup';
import { AccountState } from '../../../core/services/account-state';

describe('Topup', () => {
  let component: Topup;
  let fixture: ComponentFixture<Topup>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      imports: [Topup],
    }).compileComponents();

    fixture = TestBed.createComponent(Topup);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/catalog.php').flush({ skins: [], demoTopupsEnabled: true });
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('submits a fixed demo package once and saves the returned balance', () => {
    const http = TestBed.inject(HttpTestingController);
    const user = { id: 1, username: 'Player', email: 'player@example.com', tansans: 1000, juice: 100 };
    TestBed.inject(AccountState).set(user);
    component.selectPackage(500, 199);
    component.processPayment();
    component.processPayment();
    component.selectPackage(1500, 499);
    http.expectOne('/api/session.php').flush({ user, csrfToken: 'token' });
    const request = http.expectOne('/api/wallet.php');
    expect(request.request.body.item).toBe('special');
    expect(request.request.body.amount).toBeUndefined();
    request.flush({ user: { ...user, tansans: 1500, walletVersion: 1 } });
    expect(component.currency.getCoins()).toBe(1500);
    expect(component.pending()).toBe(false);
    expect(component.message()).toContain('No payment was taken');
  });
});
