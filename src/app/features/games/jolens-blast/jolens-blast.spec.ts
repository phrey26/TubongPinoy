import { vi, afterEach } from 'vitest';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JolensBlast } from './jolens-blast';
import { Energy } from '../../../core/services/energy';

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
    component.startRound();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it.each([0, 1, 7, 10, 16])('scores %s owned marbles only when the session ends', inventory => {
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

  it('uses the future background’s 9:16 ratio without loading assets', () => {
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([450, 800]);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
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
    for (let tick = 0; tick < 601; tick++) component.updatePhysics();
    expect(component.showRoundWon).toBe(true);
    expect(component.showGameOver).toBe(false);
    expect(component.currentScore).toBe(0);
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
    expect([target.x, target.y]).toEqual([225, 300]);
    expect(component.showRoundWon).toBe(false);
    expect(component.showGameOver).toBe(true);
    expect(component['currentShooter']).not.toBe(oldShooter);
    expect(component.shotMessage).toContain('Knocked-out marbles returned');
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

  it('loses the last shooter inside the circle and charges energy for a new game', () => {
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

  it('pauses at zero energy and resumes the same board after a refill', () => {
    const targets = component['marblesOnBoard'];
    const energy = TestBed.inject(Energy);
    energy.consumeEnergy(100);
    expect(component.showOutOfJuice).toBe(true);
    component.updatePhysics();
    energy.addEnergy(20);
    expect(component.showOutOfJuice).toBe(false);
    expect(component['marblesOnBoard']).toBe(targets);
  });

  it('supports fullscreen fallback, exit control, and Escape', async () => {
    const panel = fixture.nativeElement.querySelector('.game-panel') as HTMLDivElement;
    panel.requestFullscreen = vi.fn().mockRejectedValue(new Error('Unavailable'));
    await component.toggleFullscreen();
    fixture.detectChanges();
    expect(panel.classList.contains('is-fullscreen')).toBe(true);
    expect(panel.querySelector('.fullscreen-button')?.getAttribute('aria-pressed')).toBe('true');
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

  it('leaves room for a full pull inside every edge and keeps targets above the shooter', () => {
    const shooter = component['currentShooter'];
    const pull = component['maxDragDistance'];
    expect(shooter.y + pull).toBeLessThanOrEqual(750);
    expect(shooter.x - pull).toBeGreaterThan(0);
    expect(shooter.x + pull).toBeLessThan(450);
    expect(component['targetCenter'].y + component['playAreaRadius']).toBeLessThan(shooter.y);
  });
});
