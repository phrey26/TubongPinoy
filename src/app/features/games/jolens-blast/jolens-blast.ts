import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, ChangeDetectionStrategy, HostListener, ChangeDetectorRef } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { Energy } from '../../../core/services/energy';
import { Subscription } from 'rxjs';
import { stepMarbles } from './marble-physics';

interface Marble {
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
  shotMessage = '';
  selectedBet = 3;
  readonly betOptions = [1, 2, 3, 4, 5];
  showBetSetup = true;

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
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;

    this.ctx.imageSmoothingEnabled = false;
    this.spawnShooter();
    this.energySub = this.energyService.getEnergyLevel().subscribe(level => {
      this.energyLevel = level;
      this.showOutOfJuice = level <= 0 && !this.showGameOver;
      if (level <= 0) this.isDragging = false;
      this.changeDetector.markForCheck();
    });
    this.gameLoop();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    if (this.energySub) this.energySub.unsubscribe();
  }

  get maxBet(): number { return Math.max(0, Math.min(5, this.marbleInventory - 1)); }

  selectBet(bet: number): void {
    if (this.showBetSetup && Number.isInteger(bet) && bet >= 1 && bet <= this.maxBet) this.selectedBet = bet;
  }

  startRound(): void {
    if (this.showGameOver || !this.showBetSetup || this.energyLevel <= 0 || !Number.isInteger(this.selectedBet) ||
        this.selectedBet < 1 || this.selectedBet > this.maxBet) return;
    this.marbleInventory -= this.selectedBet;
    this.showBetSetup = false;
    this.initRound();
  }

  private initRound() {
    this.marblesOnBoard = [];
    this.showRoundWon = false;
    this.showGameOver = false;
    this.isDragging = false;
    this.shotFrames = 0;
    this.shotInProgress = false;
    this.pendingKnockouts = [];
    this.shotMessage = '';

    const { x: centerX, y: centerY } = this.targetCenter;

    // A shuffled, spaced grid stays inside the ring even with unlucky random values.
    const positions: { x: number; y: number }[] = [];
    for (let row = -2; row <= 2; row++) {
      for (let column = -2; column <= 2; column++) {
        const x = centerX + column * 44, y = centerY + row * 44;
        if (Math.hypot(x - centerX, y - centerY) <= this.playAreaRadius - this.marbleRadius) {
          positions.push({ x, y });
        }
      }
    }
    for (let i = positions.length - 1; i > 0; i--) {
      const other = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[other]] = [positions[other], positions[i]];
    }
    this.marblesOnBoard = positions.slice(0, this.selectedBet * 2).map(position => ({
      ...position, radius: this.marbleRadius,
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      dx: 0, dy: 0, isMoving: false,
    }));

    this.spawnShooter();
  }

  spawnShooter() {
    this.currentShooter = {
      x: this.shooterHome.x,
      y: this.shooterHome.y,
      radius: this.marbleRadius,
      color: '#f8fafc',
      dx: 0,
      dy: 0,
      isMoving: false
    };
  }

  onMouseDown(event: MouseEvent) {
    if (
      this.showBetSetup ||
      this.marbleInventory < 1 ||
      !this.currentShooter ||
      this.currentShooter.isMoving ||
      this.shotInProgress ||
      this.showOutOfJuice ||
      this.showRoundWon ||
      this.showGameOver ||
      this.energyLevel <= 0
    ) {
      if (this.energyLevel <= 0) this.showOutOfJuice = true;
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

    if (this.energyLevel <= 0 || this.showOutOfJuice || this.showGameOver || this.showRoundWon || this.showBetSetup) {
      this.showOutOfJuice = this.energyLevel <= 0;
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
      this.shotMessage = '';

      this.currentShooter.dx = dx * 0.15;
      this.currentShooter.dy = dy * 0.15;
      this.currentShooter.isMoving = true;
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
    this.draw();
    this.animationFrameId = requestAnimationFrame(time => this.gameLoop(time));
  }

  updatePhysics() {
    if (this.energyLevel <= 0 || this.showOutOfJuice || this.showGameOver || this.showRoundWon || this.showBetSetup) return;
    if (!this.shotInProgress && !this.currentShooter.isMoving &&
        !this.marblesOnBoard.some(marble => marble.isMoving)) return;
    this.shotInProgress = true;
    this.shotFrames++;
    const knockedOut = stepMarbles(this.currentShooter, this.marblesOnBoard,
      { ...this.targetCenter, radius: this.playAreaRadius },
      { width: this.canvasWidth, height: this.canvasHeight });
    this.pendingKnockouts.push(...this.marblesOnBoard.filter(marble => knockedOut.has(marble)));
    this.marblesOnBoard = this.marblesOnBoard.filter(marble => !knockedOut.has(marble));
    const moving = this.currentShooter.isMoving || this.marblesOnBoard.some(marble => marble.isMoving);
    if (!moving || this.shotFrames >= 600) {
      for (const marble of this.marblesOnBoard) {
        marble.dx = marble.dy = 0;
        marble.isMoving = false;
      }
      this.shotInProgress = false;
      const shooterOutside = Math.hypot(this.currentShooter.x - this.targetCenter.x,
        this.currentShooter.y - this.targetCenter.y) - this.currentShooter.radius > this.playAreaRadius;
      if (shooterOutside) {
        const won = this.pendingKnockouts.length;
        this.marbleInventory += this.pendingKnockouts.length;
        this.shotMessage = won ? `Won ${won} marble${won === 1 ? '' : 's'}! Shooter finished outside.` : 'No marbles knocked out. Try another angle.';
      } else {
        this.marbleInventory--;
        this.returnKnockouts();
        this.shotMessage = 'Shooter lost inside the circle. Knocked-out marbles returned.';
      }
      this.pendingKnockouts = [];
      this.spawnShooter();
      this.showRoundWon = this.marblesOnBoard.length === 0;
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
    this.ctx.fillStyle = '#eff6ff';
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    this.ctx.beginPath();
    this.ctx.arc(this.targetCenter.x, this.targetCenter.y, this.playAreaRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = '#eff6ff';
    this.ctx.fill();
    this.ctx.lineWidth = 4;
    this.ctx.strokeStyle = '#bfdbfe';
    this.ctx.stroke();

    this.marblesOnBoard.forEach(m => this.drawMarble(m));
    this.drawMarble(this.currentShooter);

    if (this.isDragging) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.currentShooter.x, this.currentShooter.y);

      const dx = this.dragStartX - this.currentMouseX;
      const dy = this.dragStartY - this.currentMouseY;

      this.ctx.lineTo(this.currentShooter.x + dx, this.currentShooter.y + dy);
      this.ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      this.ctx.lineWidth = 4;
      this.ctx.setLineDash([10, 10]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  drawMarble(marble: Marble) {
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
    return !this.showGameOver && !this.shotInProgress && !this.isDragging;
  }

  endSession(): void {
    if (!this.canEndSession) return;
    this.currentScore = this.marbleInventory * 50;
    this.showGameOver = true;
    this.showBetSetup = false;
    this.showRoundWon = false;
    this.showOutOfJuice = false;
  }

  tryAgain() {
    if (!this.showGameOver) return;
    if (this.energyLevel < 20) {
      this.showOutOfJuice = true;
      return;
    }
    this.energyService.consumeEnergy(20);
    this.currentScore = 0;
    this.marbleInventory = 10;
    this.showGameOver = false;
    this.showOutOfJuice = this.energyLevel <= 0;
    this.showRoundWon = false;
    this.showBetSetup = true;
    this.selectedBet = 3;
    this.marblesOnBoard = [];
    this.pendingKnockouts = [];
    this.shotInProgress = false;
    this.shotMessage = '';
    this.spawnShooter();
  }

  chooseNextBet(): void {
    if (!this.showRoundWon) return;
    this.showRoundWon = false;
    this.showBetSetup = this.maxBet >= 1;
    if (!this.showBetSetup) this.endSession();
    this.selectedBet = Math.min(this.selectedBet, this.maxBet);
    this.marblesOnBoard = [];
    this.shotMessage = '';
  }

  goToShop() {
    void this.router.navigate(['/shop']);
  }
}
