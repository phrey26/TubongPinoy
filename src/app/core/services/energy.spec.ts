import { TestBed } from '@angular/core/testing';

import { Energy } from './energy';

describe('Energy', () => {
  let service: Energy;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Energy);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
