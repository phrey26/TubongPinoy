import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Topup } from './topup';

describe('Topup', () => {
  let component: Topup;
  let fixture: ComponentFixture<Topup>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([])],
      imports: [Topup],
    }).compileComponents();

    fixture = TestBed.createComponent(Topup);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
