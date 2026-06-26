import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TumbangPreso } from './tumbang-preso';

describe('TumbangPreso', () => {
  let component: TumbangPreso;
  let fixture: ComponentFixture<TumbangPreso>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TumbangPreso],
    }).compileComponents();

    fixture = TestBed.createComponent(TumbangPreso);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
