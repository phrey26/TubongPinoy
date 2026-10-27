import { MemoryEnergy } from '../../../testing/energy-stub';
import { Subject } from 'rxjs';
import { vi, afterEach } from 'vitest';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JolensBlast } from './jolens-blast';
import { Energy } from '../../../core/services/energy';
import { JOLENS_ASSETS, JOLENS_ASSET_PATHS } from './jolens-assets';

describe('JolensBlast', () => {
  let component: JolensBlast;
  let fixture: ComponentFixture<JolensBlast>;

  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    const context = {
      clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(),
      arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), setLineDash: vi.fn(), drawImage: vi.fn(),
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    await TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Energy, useClass: MemoryEnergy }],
      imports: [JolensBlast],
    }).compileComponents();

    fixture = TestBed.createComponent(JolensBlast);
    component = fixture.componentInstance;
    await fixture.whenStable();
    component.closeTutorial();
    component.play();
    component.startRound();
  });

  it('keeps the tutorial, Play, and paid bet confirmation separate', () => {
    component.hasStarted = false;
    component.showBetSetup = false;
    const energy = TestBed.inject(Energy) as unknown as MemoryEnergy;
    const balance = energy.getEnergyLevelValue();
    component.openTutorial();
    component.play();
    expect(component.hasStarted).toBe(false);
    component.closeTutorial();
    component.play();
    expect(component.showBetSetup).toBe(true);
    expect(energy.getEnergyLevelValue()).toBe(balance);
    component.selectBet(1);
    component.changeBet(-1);
    expect(component.selectedBet).toBe(1);
    for (let i = 0; i < 8; i++) component.changeBet(1);
    expect(component.selectedBet).toBe(component.maxBet);
    component.marbleInventory = 3;
    component.selectBet(2);
    component.changeBet(1);
    expect(component.selectedBet).toBe(2);
    component.openTutorial();
    component.startRound();
    expect(energy.getEnergyLevelValue()).toBe(balance);
    component.closeTutorial();
    component.startRound();
    expect(energy.getEnergyLevelValue()).toBe(balance - 20);
    expect(component.marbleInventory).toBe(1);
  });

  it('settles marbles before showing the Juice prompt and preserves the settled score', () => {
    const energy = TestBed.inject(Energy) as unknown as MemoryEnergy;
    energy.consumeEnergy(80);
    component.hasCompletedShot = true;
    component.marbleInventory = 12;
    component.showRoundWon = true;
    component.chooseNextBet();
    expect(component.showCashOut).toBe(true);
    expect(component.showOutOfJuice).toBe(false);
    component.endSession();
    expect(component.currentScore).toBe(600);
    expect(component.showGameOver).toBe(true);
    expect(component.showCashOut).toBe(false);
    component.tryAgain();
    expect(component.showOutOfJuice).toBe(true);
    expect(component.currentScore).toBe(600);
    expect(component.marbleInventory).toBe(12);
    energy.addEnergy(20);
    component.tryAgain();
    expect(component.showOutOfJuice).toBe(false);
    expect(component.marbleInventory).toBe(10);
    expect(component.showBetSetup).toBe(true);
  });

  it('awards no points for ending before a completed shot, including after a new game', () => {
    component.marbleInventory = 10;
    component.endSession();
    expect(component.currentScore).toBe(0);
    component.tryAgain();
    component.hasCompletedShot = true;
    component.endSession();
    expect(component.currentScore).toBe(500);
    component.tryAgain();
    expect(component.hasCompletedShot).toBe(false);
    component.endSession();
    expect(component.currentScore).toBe(0);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it('does not stake marbles or start a round while the Juice payment is pending or fails', () => {
    const pending = new Subject<never>();
    const energy = TestBed.inject(Energy) as unknown as MemoryEnergy;
    vi.spyOn(energy, 'consumeEnergy').mockReturnValue(pending);
    component.showBetSetup = true;
    const inventory = component.marbleInventory;
    component.startRound();
    component.startRound();
    expect(energy.consumeEnergy).toHaveBeenCalledTimes(1);
    expect(component.marbleInventory).toBe(inventory);
    expect(component.showBetSetup).toBe(true);
    pending.error(new Error('Connection lost'));
    expect(component.marbleInventory).toBe(inventory);
    expect(component.showBetSetup).toBe(true);
    expect(component.savingJuice()).toBe(false);
  });

  it.each([0, 1, 7, 10, 16])('scores %s owned marbles only when the session ends', inventory => {
    component.hasCompletedShot = true;
    component.marbleInventory = inventory;
    expect(component.currentScore).toBe(0);
    component.endSession();
    expect(component.currentScore).toBe(inventory * 50);
    expect(component.showGameOver).toBe(true);
    expect(component.showBetSetup).toBe(false);
    expect(component.showRoundWon).toBe(false);
    component.marbleInventory++;
    component.endSession();
    expect(component.currentScore).toBe(inventory * 50);
  });

  it('waits for a shot to resolve before allowing the session to end', () => {
    component['shotInProgress'] = true;
    component.endSession();
    expect(component.showGameOver).toBe(false);
    expect(component.currentScore).toBe(0);
    component['shotInProgress'] = false;
    component.hasCompletedShot = true;
    component.endSession();
    expect(component.currentScore).toBe(component.marbleInventory * 50);
  });

  it.each([1, 2, 3, 4, 5])('stakes %s marbles and places twice that number in the circle', bet => {
    component.showBetSetup = true;
    component.marbleInventory = 10;
    component.selectBet(bet);
    component.startRound();
    expect(component.marbleInventory).toBe(10 - bet);
    expect(component['marblesOnBoard']).toHaveLength(bet * 2);
    const board = component['marblesOnBoard'];
    component.startRound();
    expect(component.marbleInventory).toBe(10 - bet);
    expect(component['marblesOnBoard']).toBe(board);
  });

  it('rejects invalid bets and always reserves a shooter', () => {
    component.showBetSetup = true;
    component.marbleInventory = 3;
    expect(component.maxBet).toBe(2);
    for (const bet of [0, -1, 3, 6, 1.5, NaN]) {
      component.selectedBet = bet;
      component.startRound();
      expect(component.showBetSetup).toBe(true);
      expect(component.marbleInventory).toBe(3);
    }
    component.selectBet(2);
    component.startRound();
    expect(component.marbleInventory).toBe(1);
    expect(component['marblesOnBoard']).toHaveLength(4);
  });

  it('reuses an outside shooter without spending a marble on every shot', () => {
    component['marblesOnBoard'] = [{
      x: 225, y: 300, radius: 20, color: '#ef4444', dx: 0, dy: 0, isMoving: false,
    }];
    component['shotInProgress'] = true;
    const inventory = component.marbleInventory;
    component.updatePhysics();
    expect(component.marbleInventory).toBe(inventory);
    expect(component.showGameOver).toBe(false);
    expect(component.showRoundWon).toBe(false);
  });

  it('matches the background’s 9:16 ratio and preloads every game asset', () => {
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([450, 800]);
    expect([...component['sprites'].keys()]).toEqual(JOLENS_ASSET_PATHS);
    expect(component['currentShooter'].sprite).toBe(JOLENS_ASSETS.shooters[0].path);
    expect(component['marblesOnBoard'].every(marble => JOLENS_ASSETS.marbles.includes(marble.sprite!))).toBe(true);
  });

  it('uses the default shooter and draws its loaded sprite', () => {
    component.showBetSetup = true;
    component.startRound();
    const shooter = component['currentShooter'];
    expect(shooter.sprite).toBe(JOLENS_ASSETS.shooters[0].path);
    const sprite = component['sprites'].get(shooter.sprite!)!;
    Object.defineProperty(sprite, 'complete', { value: true });
    Object.defineProperty(sprite, 'naturalWidth', { value: 16 });
    component.drawMarble(shooter);
    expect(component.canvasRef.nativeElement.getContext('2d')!.drawImage)
      .toHaveBeenCalledWith(sprite, 205, 580, 40, 40);
  });

  it('places nonoverlapping targets inside the ring even when randomness repeats', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    component['initRound']();
    const targets = component['marblesOnBoard'];
    expect(targets).toHaveLength(6);
    targets.forEach((target, index) => {
      expect(Math.hypot(target.x - 225, target.y - 300)).toBeLessThanOrEqual(130);
      targets.slice(index + 1).forEach(other => {
        expect(Math.hypot(target.x - other.x, target.y - other.y)).toBeGreaterThanOrEqual(40);
      });
    });
  });

  it('lets a winning final shot finish and keeps score when advancing', () => {
    const target = { x: 395, y: 300, radius: 20, color: '#ef4444', dx: 1, dy: 0, isMoving: true };
    component['marblesOnBoard'] = [target];
    component['currentShooter'] = { ...target, x: 225, y: 80, dx: 1, dy: 0, isMoving: true };
    component.marbleInventory = 1;
    component.updatePhysics();
    expect(component.currentScore).toBe(0);
    expect(component.showRoundWon).toBe(false);
    expect(component['pendingKnockouts']).toContain(target);
    expect(component.marbleInventory).toBe(1);
    const draw = vi.spyOn(component, 'drawMarble');
    component.draw();
    expect(draw).toHaveBeenCalledWith(target);
    for (let tick = 0; tick < 601; tick++) component.updatePhysics();
    expect(component.showRoundWon).toBe(true);
    expect(component.showGameOver).toBe(false);
    expect(component.currentScore).toBe(0);
    expect(component['outsideMarbles']).toHaveLength(0);
    expect(component['pendingKnockouts']).toHaveLength(0);
    expect(component.marbleInventory).toBe(2);
    component.updatePhysics();
    expect(component.marbleInventory).toBe(2);
    component.chooseNextBet();
    expect(component.showBetSetup).toBe(true);
    expect(component.currentScore).toBe(0);
  });

  it('returns knocked-out marbles to the middle and forfeits points when the shooter stays inside', () => {
    const target = { x: 396, y: 300, radius: 20, color: '#ef4444', dx: 0, dy: 0, isMoving: false };
    component['marblesOnBoard'] = [target];
    component['currentShooter'] = { ...target, x: 225, y: 300 };
    component['shotInProgress'] = true;
    component.marbleInventory = 1;
    component.currentScore = 0;
    const oldShooter = component['currentShooter'];
    component.updatePhysics();
    expect(component.currentScore).toBe(0);
    expect(component['marblesOnBoard']).toEqual([target]);
    expect(component['outsideMarbles']).toHaveLength(0);
    expect(component['pendingKnockouts']).toHaveLength(0);
    expect([target.x, target.y]).toEqual([225, 300]);
    expect(component.showRoundWon).toBe(false);
    expect(component.showGameOver).toBe(true);
    expect(component['currentShooter']).not.toBe(oldShooter);
    expect(component['textPopups'].some(popup => popup.text === '-1')).toBe(true);
  });

  it('returns multiple marbles without overlaps when the shooter touches the boundary', () => {
    const targets = [0, 1, 2].map(index => ({
      x: 410, y: 200 + index * 70, radius: 20, color: '#ef4444', dx: 0, dy: 0, isMoving: false,
    }));
    component['marblesOnBoard'] = targets;
    component['currentShooter'] = { ...targets[0], x: 225, y: 470 };
    component['shotInProgress'] = true;
    component.updatePhysics();
    expect(component.currentScore).toBe(0);
    expect(component['marblesOnBoard']).toHaveLength(3);
    component['marblesOnBoard'].forEach((marble, index, all) => {
      expect(Math.hypot(marble.x - 225, marble.y - 300) + marble.radius).toBeLessThanOrEqual(150);
      all.slice(index + 1).forEach(other => {
        expect(Math.hypot(marble.x - other.x, marble.y - other.y)).toBeGreaterThanOrEqual(40);
      });
    });
  });

  it('keeps decorative target colors independent from the shooter', () => {
    let roll = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (++roll % 5) / 5);
    component['initRound']();
    const colors = component['marblesOnBoard'].map(target => target.color);
    expect(new Set(colors).size).toBe(5);
    expect(component['currentShooter'].color).toBe('#f8fafc');
  });

  it('loses the last shooter inside the circle without charging again for a new game', () => {
    component['currentShooter'] = {
      x: 225, y: 300, radius: 20, color: '#f8fafc', dx: 0, dy: 0, isMoving: false,
    };
    component['shotInProgress'] = true;
    component['marblesOnBoard'] = [{
      x: 225, y: 200, radius: 20, color: '#ef4444', dx: 0, dy: 0, isMoving: false,
    }];
    component.marbleInventory = 1;
    component.updatePhysics();
    expect(component.showGameOver).toBe(true);
    expect(component.marbleInventory).toBe(0);
    component.tryAgain();
    expect(TestBed.inject(Energy).getEnergyLevelValue()).toBe(80);
    expect(component.showGameOver).toBe(false);
    expect(component.marbleInventory).toBe(10);
    expect(component.showBetSetup).toBe(true);
  });

  it('transfers momentum between different colors without scoring on contact', () => {
    const target = { x: 225, y: 300, radius: 20, color: '#ef4444', dx: 0, dy: 0, isMoving: false };
    component['marblesOnBoard'] = [target];
    component['currentShooter'] = { ...target, color: '#3b82f6', y: 340, dy: -10, isMoving: true };
    component.updatePhysics();
    expect(component['marblesOnBoard']).toHaveLength(1);
    expect(target.dy).toBeLessThan(0);
    expect(component.currentScore).toBe(0);
    expect(component['shotInProgress']).toBe(true);
  });

  it('lets a paid round continue at zero juice without charging for shots', () => {
    const energy = TestBed.inject(Energy) as unknown as MemoryEnergy;
    energy.consumeEnergy(80);
    expect(component.energyLevel).toBe(0);
    expect(component.showOutOfJuice).toBe(false);
    vi.spyOn(component.canvasRef.nativeElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 450, height: 800,
    } as DOMRect);
    component.onMouseDown(new MouseEvent('mousedown', { clientX: 225, clientY: 600 }));
    component.onMouseMove(new MouseEvent('mousemove', { clientX: 225, clientY: 750 }));
    component.onMouseUp();
    component.updatePhysics();
    expect(component['currentShooter'].isMoving).toBe(true);
    expect(energy.getEnergyLevelValue()).toBe(0);
  });

  it('requires 20 juice per bet and allows the last 20 to buy a complete round', () => {
    const energy = TestBed.inject(Energy) as unknown as MemoryEnergy;
    energy.consumeEnergy(61);
    component.showBetSetup = true;
    const inventory = component.marbleInventory;
    component.startRound();
    expect(component.showCashOut).toBe(true);
    expect(component.marbleInventory).toBe(inventory);
    expect(energy.getEnergyLevelValue()).toBe(19);
    energy.addEnergy(1);
    component.startRound();
    expect(energy.getEnergyLevelValue()).toBe(0);
    expect(component.showOutOfJuice).toBe(false);
    expect(component.showBetSetup).toBe(false);
    component.startRound();
    expect(energy.getEnergyLevelValue()).toBe(0);
    expect(component.marbleInventory).toBe(inventory - component.selectedBet);
  });

  it('supports fullscreen fallback, exit control, and Escape', async () => {
    const panel = fixture.nativeElement.querySelector('.game-panel') as HTMLDivElement;
    panel.requestFullscreen = vi.fn().mockRejectedValue(new Error('Unavailable'));
    await component.toggleFullscreen();
    fixture.detectChanges();
    expect(panel.classList.contains('is-fullscreen')).toBe(true);
    expect(panel.querySelector('[aria-label$="fullscreen"]')?.getAttribute('aria-pressed')).toBe('true');
    await component.toggleFullscreen();
    expect(component.isFullscreen).toBe(false);
    await component.toggleFullscreen();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.isFullscreen).toBe(false);
  });

  it('maps scaled canvas input correctly and cancels an interrupted drag', () => {
    vi.spyOn(component.canvasRef.nativeElement, 'getBoundingClientRect').mockReturnValue({
      left: 10, top: 20, width: 225, height: 400,
    } as DOMRect);
    component.onMouseDown(new MouseEvent('mousedown', { clientX: 122.5, clientY: 320 }));
    component.onMouseMove(new MouseEvent('mousemove', { clientX: 122.5, clientY: 395 }));
    component.onPointerCancel();
    component.onMouseUp();
    expect(component.marbleInventory).toBe(7);
    component.onMouseDown(new MouseEvent('mousedown', { clientX: 122.5, clientY: 320 }));
    component.onMouseMove(new MouseEvent('mousemove', { clientX: 122.5, clientY: 395 }));
    component.onMouseUp();
    expect(component.marbleInventory).toBe(7);
    expect(component['currentShooter'].dy).toBeLessThan(0);
    expect(component['currentShooter'].dy).toBe(-22.5);
  });

  it('collects outside marbles as soon as the next shooter is placed', () => {
    const target = { x: 396, y: 300, radius: 20, color: '#ef4444', dx: 0, dy: 0, isMoving: false };
    const inside = { ...target, x: 225, y: 300 };
    component['marblesOnBoard'] = [target, inside];
    component['shotInProgress'] = true;
    const previousShooter = component['currentShooter'];
    const inventory = component.marbleInventory;
    component.updatePhysics();
    expect(component['currentShooter']).not.toBe(previousShooter);
    expect(component['currentShooter'].isMoving).toBe(false);
    expect(component['outsideMarbles']).toHaveLength(0);
    expect(component['pendingKnockouts']).toHaveLength(0);
    expect(component['marblesOnBoard']).toEqual([inside]);
    expect(component.marbleInventory).toBe(inventory + 1);
    expect(component.showRoundWon).toBe(false);
    const draw = vi.spyOn(component, 'drawMarble');
    component.draw();
    expect(draw).not.toHaveBeenCalledWith(target);
    expect(draw).toHaveBeenCalledWith(inside);
  });

  it('leaves room for a full pull inside every edge and keeps targets above the shooter', () => {
    const shooter = component['currentShooter'];
    const pull = component['maxDragDistance'];
    expect(shooter.y + pull).toBeLessThanOrEqual(750);
    expect(shooter.x - pull).toBeGreaterThan(0);
    expect(shooter.x + pull).toBeLessThan(450);
    expect(component['targetCenter'].y + component['playAreaRadius']).toBeLessThan(shooter.y);
  });
});
