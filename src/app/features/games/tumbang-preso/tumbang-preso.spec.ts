import { vi, afterEach } from 'vitest';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TumbangPreso } from './tumbang-preso';
import { generateLevel } from './level-generation';

describe('TumbangPreso', () => {
  let component: TumbangPreso;
  let fixture: ComponentFixture<TumbangPreso>;

  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    const context = {
      clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(),
      arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), setLineDash: vi.fn(), fillText: vi.fn(),
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    await TestBed.configureTestingModule({
      providers: [provideRouter([])],
      imports: [TumbangPreso],
    }).compileComponents();

    fixture = TestBed.createComponent(TumbangPreso);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it.each([3, 8, 20, 100])('can beat generated level %s through the actual mouse controls', (level) => {
    const generated = generateLevel(level, () => 0.5);
    component.currentLevel = level;
    component.obstacles = generated.obstacles;
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 450, height: 800,
    } as DOMRect);
    const radians = generated.solution.angle * Math.PI / 180;
    const distance = generated.solution.power * 80;
    component.onMouseDown(new MouseEvent('mousedown', { clientX: 225, clientY: 680 }));
    component.onMouseMove(new MouseEvent('mousemove', {
      clientX: 225 - Math.sin(radians) * distance,
      clientY: 680 + Math.cos(radians) * distance,
    }));
    component.onMouseUp();
    for (let frame = 0; frame < 420 && !component.showNiceShot; frame++) {
      vi.mocked(window.requestAnimationFrame).mock.lastCall![0](frame * 16);
    }
    expect(component.showNiceShot).toBe(true);
    expect(component.currentScore).toBe(100);
  });

  it.each([0, 0.5, 0.999999])('keeps entire obstacles inside the road when random is %s', (random) => {
    vi.spyOn(Math, 'random').mockReturnValue(random);
    for (let level = 0; level < 20; level++) component.nextLevel();

    for (const obstacle of component.obstacles) {
      expect(obstacle.x).toBeGreaterThanOrEqual(34);
      expect(obstacle.x + obstacle.width).toBeLessThanOrEqual(416);
    }
  });

  it('provides an expanded view when native fullscreen is unavailable and exits with Escape', async () => {
    const panel = component.gamePanel.nativeElement;
    panel.requestFullscreen = vi.fn().mockRejectedValue(new Error('Fullscreen unavailable'));

    await component.toggleFullscreen();
    fixture.detectChanges();
    expect(panel.classList.contains('is-fullscreen')).toBe(true);
    expect(panel.querySelector('button')?.getAttribute('aria-label')).toBe('Exit fullscreen');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(panel.classList.contains('is-fullscreen')).toBe(false);
    expect(panel.querySelector('button')?.getAttribute('aria-label')).toBe('Enter fullscreen');
  });

  it('hits the can above the slipper after pulling downward on the portrait canvas', () => {
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(450);
    expect(canvas.height).toBe(800);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 450, height: 800,
    } as DOMRect);

    component.onMouseDown(new MouseEvent('mousedown', { clientX: 225, clientY: 680 }));
    component.onMouseMove(new MouseEvent('mousemove', { clientX: 225, clientY: 760 }));
    component.onMouseUp();

    for (let frame = 0; frame < 100 && !component.showNiceShot; frame++) {
      const callback = vi.mocked(window.requestAnimationFrame).mock.lastCall![0];
      callback(frame * 16);
    }

    expect(component.showNiceShot).toBe(true);
    expect(component.currentScore).toBe(100);
    expect(component.showTryAgain).toBe(false);
  });

  it('spins after launch, slows its rotation, and resets upright', () => {
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 450, height: 800,
    } as DOMRect);
    const rotate = vi.mocked(canvas.getContext('2d')!.rotate);
    rotate.mockClear();
    component.onMouseDown(new MouseEvent('mousedown', { clientX: 225, clientY: 680 }));
    component.onMouseMove(new MouseEvent('mousemove', { clientX: 225, clientY: 760 }));
    component.onMouseUp();
    for (let frame = 0; frame < 10; frame++) {
      vi.mocked(window.requestAnimationFrame).mock.lastCall![0](frame * 16);
    }
    const angles = rotate.mock.calls.map(([angle]) => angle);
    expect(angles[0]).toBeGreaterThan(0);
    expect(angles[9]).toBeGreaterThan(angles[8]);
    expect(angles[9] - angles[8]).toBeLessThan(angles[1] - angles[0]);

    component.resetSlipper();
    vi.mocked(window.requestAnimationFrame).mock.lastCall![0](160);
    expect(rotate.mock.lastCall![0]).toBe(0);
  });

  it.each([
    { direction: 'left', pullX: 305 },
    { direction: 'right', pullX: 145 },
  ])('bounces off the $direction sidewalk without drawing the slipper over it', ({ pullX }) => {
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 450, height: 800,
    } as DOMRect);
    const context = canvas.getContext('2d')!;
    const translate = vi.mocked(context.translate);
    const rotate = vi.mocked(context.rotate);
    translate.mockClear();
    rotate.mockClear();

    component.onMouseDown(new MouseEvent('mousedown', { clientX: 225, clientY: 680 }));
    component.onMouseMove(new MouseEvent('mousemove', { clientX: pullX, clientY: 680 }));
    component.onMouseUp();
    for (let frame = 0; frame < 45; frame++) {
      vi.mocked(window.requestAnimationFrame).mock.lastCall![0](frame * 16);
    }

    const positions = translate.mock.calls.map(([x]) => x);
    const bounceFrame = positions.findIndex((x, i) => i > 0 &&
      (pullX > 225 ? x > positions[i - 1] : x < positions[i - 1]));
    expect(bounceFrame).toBeGreaterThan(0);
    translate.mock.calls.forEach(([x], frame) => {
      const angle = rotate.mock.calls[frame][0];
      const halfWidth = Math.abs(Math.cos(angle)) * 12 + Math.abs(Math.sin(angle)) * 21;
      expect(x - halfWidth).toBeGreaterThanOrEqual(34);
      expect(x + halfWidth).toBeLessThanOrEqual(416);
    });
  });
});
