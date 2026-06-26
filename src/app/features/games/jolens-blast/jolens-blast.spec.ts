import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JolensBlast } from './jolens-blast';

describe('JolensBlast', () => {
  let component: JolensBlast;
  let fixture: ComponentFixture<JolensBlast>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JolensBlast],
    }).compileComponents();

    fixture = TestBed.createComponent(JolensBlast);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
