import { vi, afterEach } from 'vitest';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JolensBlast } from './jolens-blast';

describe('JolensBlast', () => {
  let component: JolensBlast;
  let fixture: ComponentFixture<JolensBlast>;

  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    const context = {
      clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(),
      arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), setLineDash: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    await TestBed.configureTestingModule({
      providers: [provideRouter([])],
      imports: [JolensBlast],
    }).compileComponents();

    fixture = TestBed.createComponent(JolensBlast);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });
});
