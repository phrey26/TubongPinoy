import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, ChangeDetectionStrategy, HostListener, ChangeDetectorRef } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { Energy } from '../../../core/services/energy';
import { Subscription } from 'rxjs';
import { stepMarbles } from './marble-physics';
import { scatterMarbles } from './marble-placement';
import { JOLENS_ASSETS, JOLENS_ASSET_PATHS } from './jolens-assets';
import { MarbleEffects } from './marble-effects';
import { drawPixelText } from '../../../shared/canvas/pixel-text';

interface Marble {
  sprite?: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  dx: number;
  dy: number;
  isMoving: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-jolens-blast',
  imports: [CommonModule, RouterModule],
  templateUrl: './jolens-blast.html',
  styleUrl: './jolens-blast.css',
})
export class JolensBlast implements AfterViewInit, OnDestroy {

  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private animationFrameId!: number;

  @ViewChild('gamePanel') gamePanel!: ElementRef<HTMLDivElement>;
  isFullscreen = false;
  private lastFrameTime: number | null = null;
  private frameAccumulator = 0;
  private shotFrames = 0;
  private shotInProgress = false;
  private pendingKnockouts: Marble[] = [];
  private outsideMarbles: Marble[] = [];
  private textPopups: { text: string; x: number; y: number; color: string; age: number }[] = [];
  selectedBet = 3;
  showBetSetup = false;
  hasStarted = false;
  showIntroduction = true;
  @ViewChild('introDialog') introDialog!: ElementRef<HTMLDialogElement>;

  openTutorial(): void {
    if (this.showIntroduction) return;
    this.isDragging = false;
    this.showIntroduction = true;
    this.introDialog.nativeElement.showModal?.();
  }

  closeTutorial(): void {
    this.isDragging = false;
    this.showIntroduction = false;
    this.introDialog.nativeElement.close?.();
  }

  play(): void {
    if (this.showIntroduction || this.hasStarted) return;
    this.hasStarted = true;
    this.showBetSetup = true;
    this.showOutOfJuice = this.energyLevel < 20;
  }

  changeBet(direction: number): void {
    if (direction !== -1 && direction !== 1) return;
    this.selectBet(this.selectedBet + direction);
  }


  async toggleFullscreen(): Promise<void> {
    this.isDragging = false;
    if (this.isFullscreen) {
      if (document.fullscreenElement === this.gamePanel.nativeElement) {
        try { await document.exitFullscreen(); } catch { return; }
      }
      this.isFullscreen = false;
    } else {
      try { await this.gamePanel.nativeElement.requestFullscreen(); } catch {
        // Use the same viewport-filling fallback as Tumbang Preso.
      }
      this.isFullscreen = true;
    }
    this.changeDetector.markForCheck();
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.isFullscreen = document.fullscreenElement === this.gamePanel.nativeElement;
    this.isDragging = false;
    this.changeDetector.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!document.fullscreenElement) {
      this.isFullscreen = false;
      this.isDragging = false;
      this.changeDetector.markForCheck();
    }
  }

  onPointerDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    this.onMouseDown(event);
    if (this.isDragging) this.canvasRef.nativeElement.setPointerCapture?.(event.pointerId);
  }

  onPointerCancel(): void { this.isDragging = false; }

  // Game State
  currentScore: number = 0;
  energyLevel: number = 100;
  marbleInventory = 10;

  // Overlays
  showRoundWon = false;
  showGameOver = false;
  showOutOfJuice = false;

  // Leaderboard
  highScores = [
    { username: 'JuanDelaCruz', points: 4500 },
    { username: 'MariaClara', points: 3200 },
    { username: 'JoseRizal', points: 2800 },
    { username: 'Luzviminda', points: 2100 }
  ];

  // Game Data
  private colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
  private marblesOnBoard: Marble[] = [];
  private currentShooter!: Marble;
  readonly assets = JOLENS_ASSETS;
  private readonly sprites = new Map<string, HTMLImageElement>();
  private readonly effects = new MarbleEffects();

  // Canvas
  private canvasWidth = 450;
  private canvasHeight = 800;
  private playAreaRadius = 150;
  private marbleRadius = 20;

  // Drag
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private currentMouseX = 0;
  private currentMouseY = 0;
  private maxDragDistance = 150;
  private readonly targetCenter = { x: 225, y: 300 };
  // Reserve the lower quarter for dragging: a full pull ends at y=750,
  // leaving 50 canvas pixels before the bottom edge.
  private readonly shooterHome = { x: 225, y: 600 };

  private energySub!: Subscription;

  constructor(private energyService: Energy, private changeDetector: ChangeDetectorRef, private router: Router) {}

  ngAfterViewInit(): void {
    this.introDialog.nativeElement.showModal?.();
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;

    this.ctx.imageSmoothingEnabled = false;
    this.effects.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    for (const path of JOLENS_ASSET_PATHS) {
      const image = new Image();
      image.src = path;
      this.sprites.set(path, image);
    }
    this.spawnShooter();
    this.energySub = this.energyService.getEnergyLevel().subscribe(level => {
      this.energyLevel = level;
      this.showOutOfJuice = this.showBetSetup && level < 20 && !this.showGameOver;
      this.changeDetector.markForCheck();
    });
    this.gameLoop();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    this.effects.clear();
    if (this.energySub) this.energySub.unsubscribe();
  }

  get maxBet(): number { return Math.max(0, Math.min(5, this.marbleInventory - 1)); }

  selectBet(bet: number): void {
    if (!this.showIntroduction && this.showBetSetup && Number.isInteger(bet) && bet >= 1 && bet <= this.maxBet) this.selectedBet = bet;
  }

  startRound(): void {
    if (this.showIntroduction || !this.hasStarted || this.showGameOver || !this.showBetSetup || !Number.isInteger(this.selectedBet) ||
        this.selectedBet < 1 || this.selectedBet > this.maxBet) return;
    if (this.energyLevel < 20) {
      this.showOutOfJuice = true;
      return;
    }
    this.marbleInventory -= this.selectedBet;
    this.showBetSetup = false;
    this.energyService.consumeEnergy(20);
    this.showOutOfJuice = false;
    this.initRound();
  }

  private initRound() {
    this.effects.clear();
    this.outsideMarbles = [];
    this.marblesOnBoard = [];
    this.showRoundWon = false;
    this.showGameOver = false;
    this.isDragging = false;
    this.shotFrames = 0;
    this.shotInProgress = false;
    this.pendingKnockouts = [];
    this.textPopups = [];

    const positions = scatterMarbles(this.selectedBet * 2, this.targetCenter,
      this.playAreaRadius, this.marbleRadius);
    this.marblesOnBoard = positions.slice(0, this.selectedBet * 2).map(position => ({
      ...position, radius: this.marbleRadius,
      sprite: JOLENS_ASSETS.marbles[Math.floor(Math.random() * JOLENS_ASSETS.marbles.length)],
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      dx: 0, dy: 0, isMoving: false,
    }));

    this.spawnShooter();
  }

  spawnShooter() {
    // A new shooter marks the next turn; the previous winnings are collected.
    this.outsideMarbles = [];
    this.currentShooter = {
      x: this.shooterHome.x,
      y: this.shooterHome.y,
      radius: this.marbleRadius,
      color: '#f8fafc',
      sprite: JOLENS_ASSETS.shooters[0].path,
      dx: 0,
      dy: 0,
      isMoving: false
    };
  }

  onMouseDown(event: MouseEvent) {
    if (
      this.showIntroduction ||
      !this.hasStarted ||
      this.showBetSetup ||
      this.marbleInventory < 1 ||
      !this.currentShooter ||
      this.currentShooter.isMoving ||
      this.shotInProgress ||
      this.showOutOfJuice ||
      this.showRoundWon ||
      this.showGameOver
    ) {
      return;
    }

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) * (this.canvasWidth / rect.width);
    const mouseY = (event.clientY - rect.top) * (this.canvasHeight / rect.height);

    if (Math.hypot(mouseX - this.currentShooter.x, mouseY - this.currentShooter.y) < this.marbleRadius * 2) {
      this.isDragging = true;
      this.dragStartX = mouseX;
      this.dragStartY = mouseY;
      this.currentMouseX = mouseX;
      this.currentMouseY = mouseY;
    }
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.currentMouseX = (event.clientX - rect.left) * (this.canvasWidth / rect.width);
    this.currentMouseY = (event.clientY - rect.top) * (this.canvasHeight / rect.height);

    const dx = this.currentMouseX - this.dragStartX;
    const dy = this.currentMouseY - this.dragStartY;
    const dist = Math.hypot(dx, dy);

    if (dist > this.maxDragDistance) {
      const angle = Math.atan2(dy, dx);
      this.currentMouseX = this.dragStartX + Math.cos(angle) * this.maxDragDistance;
      this.currentMouseY = this.dragStartY + Math.sin(angle) * this.maxDragDistance;
    }
  }

  onMouseUp() {
    if (!this.isDragging) return;
    this.isDragging = false;

    if (this.showIntroduction || !this.hasStarted || this.showOutOfJuice || this.showGameOver || this.showRoundWon || this.showBetSetup) {
      return;
    }

    const dx = this.dragStartX - this.currentMouseX;
    const dy = this.dragStartY - this.currentMouseY;
    const dragDistance = Math.hypot(dx, dy);

    if (dragDistance > 10) {
      if (this.marbleInventory < 1) return;
      this.shotFrames = 0;
      this.shotInProgress = true;
      this.pendingKnockouts = [];
      this.textPopups = [];

      this.currentShooter.dx = dx * 0.15;
      this.currentShooter.dy = dy * 0.15;
      this.currentShooter.isMoving = true;
      this.effects.play(this.currentShooter.x, this.currentShooter.y + 12, 'dust');
    }
  }

  gameLoop(timestamp = performance.now()) {
    const elapsed = this.lastFrameTime === null ? 0 : Math.min(50, Math.max(0, timestamp - this.lastFrameTime));
    this.lastFrameTime = timestamp;
    this.frameAccumulator += elapsed;
    while (this.frameAccumulator >= 1000 / 60) {
      this.updatePhysics();
      this.frameAccumulator -= 1000 / 60;
    }
    this.effects.update(elapsed / 1000);
    for (const popup of this.textPopups) popup.age += elapsed / 1000;
    this.textPopups = this.textPopups.filter(popup => popup.age < 0.9);
    this.draw();
    this.animationFrameId = requestAnimationFrame(time => this.gameLoop(time));
  }

  updatePhysics() {
    if (this.showIntroduction || !this.hasStarted || this.showOutOfJuice || this.showGameOver || this.showRoundWon || this.showBetSetup) return;
    if (!this.shotInProgress && !this.currentShooter.isMoving &&
        !this.marblesOnBoard.some(marble => marble.isMoving)) return;
    this.shotInProgress = true;
    this.shotFrames++;
    const knockedOut = stepMarbles(this.currentShooter, this.marblesOnBoard,
      { ...this.targetCenter, radius: this.playAreaRadius },
      { width: this.canvasWidth, height: this.canvasHeight },
      (x, y) => this.effects.play(x, y, 'sparks'),
      [...this.pendingKnockouts, ...this.outsideMarbles]);
    for (const marble of knockedOut) {
      this.effects.play(marble.x, marble.y, 'dust');
      this.popText('OUT!', marble.x, marble.y, '#fef08a');
    }
    this.pendingKnockouts.push(...this.marblesOnBoard.filter(marble => knockedOut.has(marble)));
    this.marblesOnBoard = this.marblesOnBoard.filter(marble => !knockedOut.has(marble));
    const allTargets = [...this.marblesOnBoard, ...this.pendingKnockouts, ...this.outsideMarbles];
    const moving = this.currentShooter.isMoving || allTargets.some(marble => marble.isMoving);
    if (!moving || this.shotFrames >= 600) {
      for (const marble of allTargets) {
        marble.dx = marble.dy = 0;
        marble.isMoving = false;
      }
      this.shotInProgress = false;
      // Collisions can send a provisional knockout back into the ring.
      const reentered = this.pendingKnockouts.filter(marble =>
        Math.hypot(marble.x - this.targetCenter.x, marble.y - this.targetCenter.y) - marble.radius <= this.playAreaRadius);
      this.marblesOnBoard.push(...reentered);
      this.pendingKnockouts = this.pendingKnockouts.filter(marble => !reentered.includes(marble));
      const shooterOutside = Math.hypot(this.currentShooter.x - this.targetCenter.x,
        this.currentShooter.y - this.targetCenter.y) - this.currentShooter.radius > this.playAreaRadius;
      if (shooterOutside) {
        const won = this.pendingKnockouts.length;
        this.marbleInventory += this.pendingKnockouts.length;
        this.outsideMarbles.push(...this.pendingKnockouts);
        this.popText(won ? `+${won}` : 'MISS!', this.currentShooter.x, this.currentShooter.y, won ? '#b7f3d0' : '#fef08a');
      } else {
        this.marbleInventory--;
        this.returnKnockouts();
        this.popText('-1', this.currentShooter.x, this.currentShooter.y, '#fca5a5');
      }
      this.pendingKnockouts = [];
      this.spawnShooter();
      this.showRoundWon = this.marblesOnBoard.length === 0;
      if (this.showRoundWon) this.outsideMarbles = [];
      if (this.marbleInventory <= 0) this.endSession();
    }
    this.changeDetector.markForCheck();
  }

  private returnKnockouts(): void {
    const spots: { x: number; y: number }[] = [];
    const spacing = this.marbleRadius * 2 + 2;
    for (let row = -3; row <= 3; row++) {
      for (let column = -3; column <= 3; column++) {
        if (Math.hypot(column * spacing, row * spacing) <= this.playAreaRadius - this.marbleRadius) {
          spots.push({ x: this.targetCenter.x + column * spacing, y: this.targetCenter.y + row * spacing });
        }
      }
    }
    spots.sort((a, b) => Math.hypot(a.x - this.targetCenter.x, a.y - this.targetCenter.y) -
      Math.hypot(b.x - this.targetCenter.x, b.y - this.targetCenter.y));
    for (const marble of this.pendingKnockouts) {
      const spot = spots.find(point => this.marblesOnBoard.every(other =>
        Math.hypot(point.x - other.x, point.y - other.y) >= marble.radius + other.radius));
      if (!spot) {
        // A fragmented board may have no free central slot. Repack safely inside the ring.
        const all = [...this.pendingKnockouts, ...this.marblesOnBoard.filter(other => !this.pendingKnockouts.includes(other))];
        all.forEach((other, index) => Object.assign(other, spots[index], { dx: 0, dy: 0, isMoving: false }));
        this.marblesOnBoard = all;
        return;
      }
      Object.assign(marble, spot, { dx: 0, dy: 0, isMoving: false });
      this.marblesOnBoard.push(marble);
    }
  }

  draw() {
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    if (!this.drawSprite(JOLENS_ASSETS.background, 0, 0, this.canvasWidth, this.canvasHeight)) {
      this.ctx.fillStyle = '#b99564';
      this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    this.ctx.beginPath();
    this.ctx.arc(this.targetCenter.x, this.targetCenter.y, this.playAreaRadius, 0, Math.PI * 2);
    this.ctx.lineWidth = 4;
    this.ctx.strokeStyle = '#68421f';
    this.ctx.stroke();

    this.marblesOnBoard.forEach(m => this.drawMarble(m));
    // Keep exits visible while the shot is judged and after they are collected.
    // Collected marbles still collide, but cannot be counted twice.
    this.outsideMarbles.forEach(m => this.drawMarble(m));
    this.pendingKnockouts.forEach(m => this.drawMarble(m));
    this.drawMarble(this.currentShooter);

    this.effects.draw((...args) => this.drawSprite(...args));
    this.drawTextPopups();
    if (this.isDragging) {
      const dx = this.dragStartX - this.currentMouseX;
      const dy = this.dragStartY - this.currentMouseY;
      const distance = Math.hypot(dx, dy);
      if (distance > 4) {
        const length = distance * 1.25;
        for (let step = 18; step < length; step += 18) {
          this.drawSprite(JOLENS_ASSETS.dot, this.currentShooter.x + dx / distance * step - 4,
            this.currentShooter.y + dy / distance * step - 4, 8, 8);
        }
        this.ctx.save();
        this.ctx.translate(this.currentShooter.x + dx / distance * length,
          this.currentShooter.y + dy / distance * length);
        this.ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
        this.drawSprite(JOLENS_ASSETS.arrow, -12, -12, 24, 24);
        this.ctx.restore();
      }
    }
  }

  private popText(text: string, x: number, y: number, color: string): void {
    this.textPopups.push({ text, x, y, color, age: 0 });
    this.textPopups = this.textPopups.slice(-16);
  }

  private drawTextPopups(): void {
    this.ctx.save();
    for (const popup of this.textPopups) {
      this.ctx.fillStyle = popup.color;
      this.ctx.globalAlpha = Math.min(1, (0.9 - popup.age) / 0.25);
      const rise = this.effects.reducedMotion ? 0 : popup.age * 30;
      const halfWidth = (popup.text.length * 6 - 1) * 3 / 2;
      drawPixelText(this.ctx, popup.text,
        Math.max(halfWidth + 4, Math.min(this.canvasWidth - halfWidth - 4, popup.x)),
        Math.max(25, Math.min(this.canvasHeight - 8, popup.y - 25 - rise)));
    }
    this.ctx.restore();
  }

  private drawSprite(path: string, x: number, y: number, width: number, height: number): boolean {
    const image = this.sprites.get(path);
    if (!image?.complete || !image.naturalWidth) return false;
    this.ctx.drawImage(image, Math.round(x), Math.round(y), Math.round(width), Math.round(height));
    return true;
  }

  drawMarble(marble: Marble) {
    this.drawSprite(JOLENS_ASSETS.shadow, marble.x - marble.radius, marble.y + marble.radius - 5,
      marble.radius * 2, 10);
    if (marble.sprite && this.drawSprite(marble.sprite, marble.x - marble.radius,
      marble.y - marble.radius, marble.radius * 2, marble.radius * 2)) return;
    this.ctx.beginPath();
    this.ctx.arc(marble.x, marble.y, marble.radius, 0, Math.PI * 2);
    this.ctx.fillStyle = marble.color;
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(marble.x - 5, marble.y - 5, marble.radius / 3, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
    this.ctx.fill();
  }

  get canEndSession(): boolean {
    return this.hasStarted && !this.showIntroduction && !this.showGameOver && !this.shotInProgress && !this.isDragging;
  }

  endSession(): void {
    if (!this.canEndSession) return;
    this.currentScore = this.marbleInventory * 50;
    this.showGameOver = true;
    this.showBetSetup = false;
    this.showRoundWon = false;
    this.showOutOfJuice = false;
    this.outsideMarbles = [];
  }

  tryAgain() {
    if (!this.showGameOver) return;
    this.currentScore = 0;
    this.marbleInventory = 10;
    this.outsideMarbles = [];
    this.showGameOver = false;
    this.showOutOfJuice = this.energyLevel < 20;
    this.showRoundWon = false;
    this.showBetSetup = true;
    this.selectedBet = 3;
    this.marblesOnBoard = [];
    this.pendingKnockouts = [];
    this.shotInProgress = false;
    this.textPopups = [];
    this.spawnShooter();
  }

  chooseNextBet(): void {
    if (!this.showRoundWon) return;
    this.showRoundWon = false;
    this.showBetSetup = this.maxBet >= 1;
    this.showOutOfJuice = this.showBetSetup && this.energyLevel < 20;
    if (!this.showBetSetup) this.endSession();
    this.selectedBet = Math.min(this.selectedBet, this.maxBet);
    this.marblesOnBoard = [];
    this.outsideMarbles = [];
    this.textPopups = [];
  }

  goToShop() {
    void this.router.navigate(['/shop']);
  }
}
