import { MemoryRanked } from '../../../testing/ranked-stub';
import { inject } from '@angular/core';
import { signal } from '@angular/core';
import { TumbangAudio, DEFAULT_AUDIO } from '../../../core/services/tumbang-audio';
import { Confirmation } from '../../../core/services/confirmation';
import { AccountState } from '../../../core/services/account-state';
import { Game, RunResult } from '../../../core/services/game';
import { of, throwError } from 'rxjs';
import { MemoryEnergy } from '../../../testing/energy-stub';
import { Subject } from 'rxjs';
import { vi, afterEach } from 'vitest';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TumbangPreso } from './tumbang-preso';
import { generateLevel } from './level-generation';
import { Energy } from '../../../core/services/energy';

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
      providers: [{ provide: TumbangAudio, useFactory: () => ({
        settings: signal({ ...DEFAULT_AUDIO }), loading: signal(false), error: signal(''),
        start: vi.fn(), stop: vi.fn(), play: vi.fn(), activate: vi.fn(), setPaused: vi.fn(),
        resetAttempt: vi.fn(), toggleMute: vi.fn(),
      }) }, { provide: Game, useFactory: () => new MemoryRanked(inject(Energy) as unknown as MemoryEnergy) }, provideRouter([]), { provide: Energy, useClass: MemoryEnergy }],
      imports: [TumbangPreso],
    }).compileComponents();

    fixture = TestBed.createComponent(TumbangPreso);
    component = fixture.componentInstance;
    (TestBed.inject(Game) as unknown as MemoryRanked).client = component as unknown as MemoryRanked['client'];
    await fixture.whenStable();
    component.closeTutorial();
    component.startGame();
    await fixture.whenStable();
    component['lastFrameTime'] = 0;
  });

  it('skips automatic tutorials for a returning account but allows How to Play', async () => {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const service = TestBed.inject(Game);
    vi.spyOn(service, 'tutorial').mockReturnValue(of({ game: 'tumbang-preso', seen: true }));
    const save = vi.spyOn(service, 'markTutorialSeen');
    const returning = TestBed.createComponent(TumbangPreso);
    await returning.whenStable();
    const player = returning.componentInstance;
    expect(player.showIntroduction).toBe(false);
    expect(player.tutorialLoading()).toBe(false);
    player.openTutorial();
    expect(player.showIntroduction).toBe(true);
    player.closeTutorial();
    expect(player.showIntroduction).toBe(false);
    expect(save).not.toHaveBeenCalled();
    returning.destroy();
  });

  it('waits for tutorial preferences and remembers a first dismissal for this game', async () => {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const pending = new Subject<{ game: 'tumbang-preso'; seen: boolean }>();
    const service = TestBed.inject(Game);
    vi.spyOn(service, 'tutorial').mockReturnValue(pending);
    const save = vi.spyOn(service, 'markTutorialSeen');
    const fresh = TestBed.createComponent(TumbangPreso);
    await fresh.whenStable();
    const player = fresh.componentInstance;
    player.startGame();
    expect(player.hasStarted).toBe(false);
    expect(player.tutorialLoading()).toBe(true);
    pending.next({ game: 'tumbang-preso', seen: false });
    pending.complete();
    expect(player.showIntroduction).toBe(true);
    player.closeTutorial();
    expect(save).toHaveBeenCalledWith('tumbang-preso');
    player.openTutorial();
    player.closeTutorial();
    expect(save).toHaveBeenCalledTimes(1);
    fresh.destroy();
  });

  it('keeps tutorials usable if preferences fail and retries a failed save on dismissal', async () => {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const service = TestBed.inject(Game);
    vi.spyOn(service, 'tutorial').mockReturnValue(throwError(() => new Error('offline')));
    const save = vi.spyOn(service, 'markTutorialSeen')
      .mockReturnValueOnce(throwError(() => new Error('offline')));
    const fresh = TestBed.createComponent(TumbangPreso);
    await fresh.whenStable();
    const player = fresh.componentInstance;
    expect(player.showIntroduction).toBe(true);
    expect(player.tutorialLoading()).toBe(false);
    player.closeTutorial();
    expect(player.showIntroduction).toBe(false);
    expect(player.accountError()).toContain('may appear again');
    player.openTutorial();
    player.closeTutorial();
    expect(save).toHaveBeenCalledTimes(2);
    fresh.destroy();
  });

  it('confirms leaving an active game and retains progress when cancelled', () => {
    TestBed.inject(AccountState).set({ id: 1, username: 'Player', tansans: 0, juice: 100 });
    const confirmation = TestBed.inject(Confirmation);
    component.currentScore = 200;
    let leave: boolean | undefined;
    const answer = component.confirmLeave();
    expect(typeof answer).not.toBe('boolean');
    if (typeof answer !== 'boolean') answer.subscribe(value => leave = value);
    expect(confirmation.active()?.confirmLabel).toBe('Leave game');
    confirmation.respond(false);
    expect(leave).toBe(false);
    expect(component.currentScore).toBe(200);
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    component.onBeforeUnload(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it('draws the saved slipper color and restores the default for another account', () => {
    const state = TestBed.inject(AccountState);
    state.set({ id: 1, username: 'Juan', tansans: 0, juice: 100, ownedSkins: ['skin_1'],
      equippedSkins: { 'tumbang-preso': 'slipper_blue' } });
    component.resetSlipper();
    const draw = vi.spyOn(component as any, 'drawSprite').mockReturnValue(true);
    component['drawSlipper']();
    expect(draw).toHaveBeenCalledWith('assets/tumbang-preso-assets/slippers/slipper_blue.png', -12, -21, 24, 42);
    state.set({ id: 2, username: 'Maria', tansans: 0, juice: 100 });
    component.resetSlipper();
    component['drawSlipper']();
    expect(draw).toHaveBeenLastCalledWith('assets/tumbang-preso-assets/slippers/slipper_pink.png', -12, -21, 24, 42);
  });

  it.each([
    ['skin_4', 'guyabanos'], ['skin_3', 'sike'], ['skin_2', 'gatorz'], ['skin_1', 'aldugo'],
  ])('preloads and draws collection skin %s', (id, asset) => {
    TestBed.inject(AccountState).set({ id: 1, username: 'Juan', tansans: 0, juice: 100,
      ownedSkins: [id], equippedSkins: { 'tumbang-preso': id } });
    const path = `assets/tumbang-preso-skins-assets/slipper_${asset}.webp`;
    expect(component['sprites'].has(path)).toBe(true);
    component.resetSlipper();
    const draw = vi.spyOn(component as any, 'drawSprite').mockReturnValue(true);
    component['drawSlipper']();
    expect(draw).toHaveBeenCalledWith(path, -12, -21, 24, 42);
  });

  it('uses legendary launch effects only for Aldugo and clears them when switching skins', () => {
    const state = TestBed.inject(AccountState);
    const burst = vi.spyOn(component['aldugo'], 'burst');
    const clear = vi.spyOn(component['aldugo'], 'clear');
    state.set({ id: 1, username: 'Juan', tansans: 0, juice: 100, ownedSkins: ['skin_1'],
      equippedSkins: { 'tumbang-preso': 'skin_1' } });
    component.resetSlipper();
    component['isDragging'] = true;
    component.onMouseUp();
    expect(burst).toHaveBeenCalledWith(225, 680, 'launch');
    burst.mockClear();
    state.set({ id: 2, username: 'Maria', tansans: 0, juice: 100 });
    component.resetSlipper();
    expect(clear).toHaveBeenCalled();
    component['isDragging'] = true;
    component.onMouseUp();
    expect(burst).not.toHaveBeenCalled();
  });

  it.each([
    [['skin_1'], 'skin_1', 'aldugoLaunch'],
    [[], 'skin_1', 'throw'],
    [['skin_1'], 'slipper_pink', 'throw'],
  ])('selects launch audio from ownership and equipment', (ownedSkins, skin, expected) => {
    TestBed.inject(AccountState).set({ id: 1, username: 'Player', tansans: 0, juice: 100,
      ownedSkins, equippedSkins: { 'tumbang-preso': skin } });
    component.resetSlipper();
    component['isDragging'] = true;
    component.onMouseUp();
    expect(TestBed.inject(TumbangAudio).play).toHaveBeenCalledWith(expected, expect.any(Number));
  });

  it.each([
    [['skin_2'], 'skin_2', true],
    [[], 'skin_2', false],
    [['skin_2'], 'skin_3', false],
  ])('gates Gatorz effects by ownership and equipment without special audio', (ownedSkins, skin, enabled) => {
    TestBed.inject(AccountState).set({ id: 1, username: 'Player', tansans: 0, juice: 100,
      ownedSkins, equippedSkins: { 'tumbang-preso': skin } });
    const burst = vi.spyOn(component['gatorz'], 'burst');
    component.resetSlipper();
    component['isDragging'] = true;
    component.onMouseUp();
    expect(burst.mock.calls.length).toBe(enabled ? 1 : 0);
    expect(TestBed.inject(TumbangAudio).play).toHaveBeenCalledWith('throw', expect.any(Number));
    const clear = vi.spyOn(component['gatorz'], 'clear');
    component.resetSlipper();
    expect(clear).toHaveBeenCalled();
  });

  it('lets the winning jingle play before opening the verified win window', () => {
    component['slipperPos'] = { x: 225, y: 120 };
    component['velocity'] = { x: 0, y: 0 };
    component['updatePhysics']();
    expect(component.currentScore).toBe(100);
    expect(component.showNiceShot).toBe(false);
    component['lastFrameTime'] = 0;
    for (let time = 50; time <= 600; time += 50) component['render'](time);
    expect(component.showNiceShot).toBe(false);
    component['render'](650);
    expect(component.showNiceShot).toBe(true);
  });

  it('waits for server verification and corrects an optimistic local hit', () => {
    const pending = new Subject<RunResult>();
    const request = vi.spyOn(TestBed.inject(Game), 'runAction').mockReturnValueOnce(pending);
    component['slipperPos'] = { x: 225, y: 120 };
    component['velocity'] = { x: 0, y: 0 };
    component['updatePhysics']();
    expect(request).toHaveBeenCalledWith('tumbang-preso', 'shot', expect.any(Object), { vx: 0, vy: 0 });
    expect(component.currentScore).toBe(0);
    expect(component.savingJuice()).toBe(true);
    component['lastFrameTime'] = 0;
    for (let time = 50; time <= 1000; time += 50) component['render'](time);
    expect(component.showNiceShot).toBe(false);
    pending.next({ run: { ...component['rankedRun']!, status: 'miss', score: 0, sequence: 1 },
      user: { id: 1, username: 'Player', tansans: 0, juice: 100 } });
    pending.complete();
    expect(component.currentScore).toBe(0);
    expect(component.showNiceShot).toBe(false);
    expect(component.showTryAgain).toBe(true);
  });

  it('waits for a confirmed Juice deduction before granting a retry', () => {
    const pending = new Subject<never>();
    const energy = TestBed.inject(Energy) as unknown as MemoryEnergy;
    vi.spyOn(energy, 'consumeEnergy').mockReturnValue(pending);
    component.showTryAgain = true;
    component.tryAgain();
    component.tryAgain();
    expect(energy.consumeEnergy).toHaveBeenCalledTimes(1);
    expect(component.showTryAgain).toBe(true);
    expect(component.savingJuice()).toBe(true);
    pending.error(new Error('Connection lost'));
    expect(component.showTryAgain).toBe(true);
    expect(component.savingJuice()).toBe(false);
    expect(component.accountError()).toContain('could not reach');
  });

  it('can dismiss and reopen the tutorial while keeping Play as a separate step', () => {
    component.hasStarted = false;
    component.openTutorial();
    expect(component.showIntroduction).toBe(true);
    component.startGame();
    expect(component.hasStarted).toBe(false);
    component.closeTutorial();
    component.onMouseDown(new MouseEvent('mousedown', { clientX: 225, clientY: 680 }));
    expect(component['isDragging']).toBe(false);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ready to knock it down?');
    component.startGame();
    expect(component.hasStarted).toBe(true);
    component.currentScore = 100;
    component.openTutorial();
    component.closeTutorial();
    expect(component.hasStarted).toBe(true);
    expect(component.currentScore).toBe(100);
    expect(TestBed.inject(Energy).getEnergyLevelValue()).toBe(100);
  });

  it('lets the final 20 Juice buy a playable retry and only blocks the following retry', () => {
    const energy = TestBed.inject(Energy) as unknown as MemoryEnergy;
    energy.consumeEnergy(80);
    component.showTryAgain = true;
    component.tryAgain();
    expect(energy.getEnergyLevelValue()).toBe(0);
    expect(component.showOutOfJuice).toBe(false);
    expect(component.showTryAgain).toBe(false);
    const canvas = component.canvas.nativeElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 450, height: 800,
    } as DOMRect);
    component.onMouseDown(new MouseEvent('mousedown', { clientX: 225, clientY: 680 }));
    component.onMouseMove(new MouseEvent('mousemove', { clientX: 225, clientY: 760 }));
    component.onMouseUp();
    for (let frame = 0; frame < 100 && !component.showNiceShot; frame++) {
      component['render']((frame + 1) * (1000 / 60));
    }
    expect(component.currentScore).toBe(100);
    expect(component.showOutOfJuice).toBe(false);
    component.nextLevel();
    component.showTryAgain = true;
    component.tryAgain();
    expect(component.showOutOfJuice).toBe(true);
    expect(energy.getEnergyLevelValue()).toBe(0);
    energy.addEnergy(20);
    expect(component.showOutOfJuice).toBe(false);
  });

  it('charges once for a retry and rejects insufficient positive Juice', () => {
    const energy = TestBed.inject(Energy) as unknown as MemoryEnergy;
    component.showTryAgain = true;
    component.tryAgain();
    component.tryAgain();
    expect(energy.getEnergyLevelValue()).toBe(80);
    energy.consumeEnergy(61);
    component.showTryAgain = true;
    component.tryAgain();
    expect(component.showOutOfJuice).toBe(true);
    expect(component.showTryAgain).toBe(true);
    expect(energy.getEnergyLevelValue()).toBe(19);
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
      component['render']((frame + 1) * (1000 / 60));
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
    expect(panel.querySelector('[aria-label$="fullscreen"]')?.getAttribute('aria-label')).toBe('Exit fullscreen');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(panel.classList.contains('is-fullscreen')).toBe(false);
    expect(panel.querySelector('[aria-label$="fullscreen"]')?.getAttribute('aria-label')).toBe('Enter fullscreen');
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
      component['render']((frame + 1) * (1000 / 60));
    }

    expect(component.showNiceShot).toBe(true);
    expect(component.currentScore).toBe(100);
    const read = vi.spyOn(TestBed.inject(Game), 'scores');
    fixture.detectChanges();
    expect(read).toHaveBeenCalledWith('tumbang-preso');
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
      component['render']((frame + 1) * (1000 / 60));
    }
    const angles = rotate.mock.calls.map(([angle]) => angle);
    expect(angles[0]).toBeGreaterThan(0);
    expect(angles[9]).toBeGreaterThan(angles[8]);
    expect(angles[9] - angles[8]).toBeLessThan(angles[1] - angles[0]);

    component.resetSlipper();
    component['render'](200);
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
      component['render']((frame + 1) * (1000 / 60));
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
