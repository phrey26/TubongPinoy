import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Energy } from '../../../core/services/energy';
import { Subscription } from 'rxjs';
import { ImpactEffects } from './impact-effects';
import { drawPixelText } from './pixel-text';
import { generateLevel } from './level-generation';
import { launchShot, Obstacle, stepShot } from './shot-physics';

interface HighScore {
  username: string;
  points: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-tumbang-preso',
  imports: [CommonModule, RouterModule],
  templateUrl: './tumbang-preso.html',
  styleUrl: './tumbang-preso.css',
})
export class TumbangPreso implements AfterViewInit, OnInit, OnDestroy {

  @ViewChild('gameCanvas') canvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('gamePanel') gamePanel!: ElementRef<HTMLDivElement>;
  isFullscreen = false;
  private animationFrameId = 0;
  private energySub?: Subscription;
  private ctx!: CanvasRenderingContext2D;
  private readonly changeDetector = inject(ChangeDetectorRef);
  private reducedMotion = false;
  private readonly impacts = new ImpactEffects();
  private lastFrameTime: number | null = null;
  private hitAge = 0;
  private readonly obstacleFlashes = new Map<Obstacle, number>();
  private bankPopups: { x: number; y: number; age: number }[] = [];
  private readonly sprites = new Map<string, HTMLImageElement>();
  private readonly stoneAssets = [
    'assets/tumbang-preso-assets/stones/stone_flat_brown.png',
    'assets/tumbang-preso-assets/stones/stone_mossy.png',
    'assets/tumbang-preso-assets/stones/stone_big_cracked.png',
    'assets/tumbang-preso-assets/stones/stone_round_blue.png',
    'assets/tumbang-preso-assets/stones/stone_small_gray.png',
  ];

  constructor(private energyService: Energy) {}

  async toggleFullscreen(): Promise<void> {
    if (this.isFullscreen) {
      if (document.fullscreenElement === this.gamePanel.nativeElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // Keep the exit control available if the browser refuses the request.
          return;
        }
      }
      this.isFullscreen = false;
    } else {
      try {
        await this.gamePanel.nativeElement.requestFullscreen();
      } catch {
        // Browsers without fullscreen support still get a viewport-filling view.
      }
      this.isFullscreen = true;
    }
    this.isDragging = false;
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

  ngOnDestroy(): void {
    this.energySub?.unsubscribe();
    cancelAnimationFrame(this.animationFrameId);
    this.impacts.clear();
    this.obstacleFlashes.clear();
    this.bankPopups = [];
  }

  // Game State
  currentScore = 0;
  energyLevel = 100;
  currentLevel = 1;
  shotBounces = 0;
  showTryAgain = false;
  showNiceShot = false;
  showOutOfJuice = false;

  highScores: HighScore[] = [
    { username: 'JuanDelaCruz', points: 1500 },
    { username: 'SlipperMaster', points: 1200 },
    { username: 'Pambato01', points: 900 }
  ];

  ngOnInit() {
    this.energySub = this.energyService.getEnergyLevel().subscribe(value => {
      this.energyLevel = value;
      // Spending the last Juice must not interrupt an attempt already purchased.
      if (value >= 20) this.showOutOfJuice = false;
    });
    this.showOutOfJuice = this.energyLevel <= 0;
  }

  private readonly CANVAS_WIDTH = 450;
  private readonly CANVAS_HEIGHT = 800;
  private readonly SLIPPER_HALF_WIDTH = 12;
  private readonly SLIPPER_HALF_HEIGHT = 21;
  private readonly PULL_LIMIT = 80;

  private isDragging = false;
  private isLaunched = false;
  private slipperPos = { x: 225, y: 680 };
  private dragStart = { x: 225, y: 680 };
  private dragCurrent = { x: 225, y: 680 };
  private velocity = { x: 0, y: 0 };
  private slipperAngle = 0;
  private angularVelocity = 0;
  private canPos = { x: 225, y: 120 };

  obstacles: Obstacle[] = generateLevel(1).obstacles;

  ngAfterViewInit() {
    this.ctx = this.canvas.nativeElement.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    for (const path of [
      'assets/tumbang-preso-assets/background/street_bg_clean.png',
      'assets/tumbang-preso-assets/can/can_standing.png',
      'assets/tumbang-preso-assets/can/can_fallen.png',
      'assets/tumbang-preso-assets/slippers/slipper_pink.png',
      'assets/tumbang-preso-assets/ui/aim_arrow.png',
      'assets/tumbang-preso-assets/ui/aim_dot.png',
      'assets/tumbang-preso-assets/effects/impact-sheet.png',
      ...this.stoneAssets,
    ]) {
      const image = new Image();
      image.src = path;
      this.sprites.set(path, image);
    }
    this.render();
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    if (
      this.isLaunched ||
      this.showTryAgain ||
      this.showNiceShot ||
      this.hitAge > 0 ||
      this.showOutOfJuice // Block gameplay when modal is visible
    ) return;

    const rect = this.canvas.nativeElement.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.CANVAS_WIDTH / rect.width);
    const y = (event.clientY - rect.top) * (this.CANVAS_HEIGHT / rect.height);

    if (Math.hypot(x - this.slipperPos.x, y - this.slipperPos.y) < 40) {
      this.isDragging = true;
    }
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;

    const rect = this.canvas.nativeElement.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) * (this.CANVAS_WIDTH / rect.width);
    const mouseY = (event.clientY - rect.top) * (this.CANVAS_HEIGHT / rect.height);

    const angle = Math.atan2(mouseY - this.dragStart.y, mouseX - this.dragStart.x);
    const distance = Math.min(
      Math.hypot(mouseX - this.dragStart.x, mouseY - this.dragStart.y),
      this.PULL_LIMIT
    );

    this.dragCurrent.x = this.dragStart.x + Math.cos(angle) * distance;
    this.dragCurrent.y = this.dragStart.y + Math.sin(angle) * distance;
  }

  @HostListener('mouseup')
  onMouseUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.velocity.x = (this.dragStart.x - this.dragCurrent.x) * 0.22;
    this.velocity.y = (this.dragStart.y - this.dragCurrent.y) * 0.22;
    this.angularVelocity = launchShot(this.velocity.x, this.velocity.y).spin;
    if (!this.reducedMotion) this.impacts.play(this.slipperPos.x, this.slipperPos.y + 12, 'dust');
    this.isLaunched = true;
  }

  private updatePhysics() {
    const shot = {
      x: this.slipperPos.x, y: this.slipperPos.y,
      vx: this.velocity.x, vy: this.velocity.y,
      angle: this.slipperAngle, spin: this.angularVelocity,
    };
    const result = stepShot(shot, this.obstacles);
    this.slipperPos = { x: shot.x, y: shot.y };
    this.velocity = { x: shot.vx, y: shot.vy };
    this.slipperAngle = shot.angle;
    this.angularVelocity = shot.spin;

    const bounces = Number(result.wallBounce) + result.rockBounces.length;
    if (bounces > 0) {
      this.shotBounces += bounces;
      for (let bounce = 0; bounce < bounces; bounce++) {
        this.bankPopups.push({ x: shot.x, y: shot.y, age: 0 });
      }
      this.changeDetector.markForCheck();
    }
    if (result.wallBounce) {
      if (!this.reducedMotion) this.impacts.play(shot.x, shot.y, 'dust');
    }
    for (const obstacle of result.rockBounces) {
      if (!this.reducedMotion) this.impacts.play(shot.x, shot.y, 'dust');
      if (!this.reducedMotion) this.obstacleFlashes.set(obstacle, 0.16);
    }

    if (result.hit) {
      this.isLaunched = false;
      this.angularVelocity = 0;
      this.hitAge = 0.001;
      if (!this.reducedMotion) this.impacts.play(this.canPos.x, this.canPos.y, 'spark');
      this.showNiceShot = this.reducedMotion;
      this.currentScore += 100;
      this.changeDetector.markForCheck();
      return;
    }

    if (result.missed) {
      this.isLaunched = false;
      this.angularVelocity = 0;
      this.showTryAgain = true;
      if (!this.reducedMotion) this.impacts.play(shot.x, Math.max(24, Math.min(this.CANVAS_HEIGHT - 24, shot.y)), 'dust');
      this.changeDetector.markForCheck();
    }
  }

  nextLevel() {
    this.currentLevel++;
    this.resetSlipper();
    this.showNiceShot = false;

    this.obstacles = generateLevel(this.currentLevel).obstacles;
  }

  tryAgain() {
    if (!this.showTryAgain) return;
    if (this.energyLevel < 20) {
      this.showOutOfJuice = true;
      return;
    }
    this.resetSlipper();
    this.showOutOfJuice = false;
    this.energyService.consumeEnergy(20);
  }

  resetSlipper() {
    this.isLaunched = false;
    this.showTryAgain = false;
    this.showNiceShot = false;
    this.slipperPos = { x: 225, y: 680 };
    this.dragCurrent = { x: 225, y: 680 };
    this.velocity = { x: 0, y: 0 };
    this.slipperAngle = 0;
    this.angularVelocity = 0;
    this.hitAge = 0;
    this.shotBounces = 0;
    this.bankPopups = [];
    this.impacts.clear();
    this.obstacleFlashes.clear();
  }

  goToShop() {
    this.showOutOfJuice = false;
    window.location.href = '/shop';
  }

  private render(timestamp = performance.now()) {
    const seconds = this.lastFrameTime === null ? 0 : Math.max(0, Math.min((timestamp - this.lastFrameTime) / 1000, 0.05));
    this.lastFrameTime = timestamp;
    if (this.isLaunched) this.updatePhysics();
    for (const popup of this.bankPopups) popup.age += seconds;
    this.bankPopups = this.bankPopups.filter(popup => popup.age < 0.6);
    this.impacts.update(seconds);
    for (const [obstacle, life] of this.obstacleFlashes) {
      if (life <= seconds) this.obstacleFlashes.delete(obstacle);
      else this.obstacleFlashes.set(obstacle, life - seconds);
    }
    if (this.hitAge > 0 && !this.showNiceShot) {
      this.hitAge += seconds;
      if (this.hitAge >= 0.65) {
        this.showNiceShot = true;
        this.changeDetector.markForCheck();
      }
    }
    this.ctx.clearRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
    this.drawSprite('assets/tumbang-preso-assets/background/street_bg_clean.png', 0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
    this.drawObstacles();
    this.drawCan();
    this.drawSlipper();
    this.impacts.draw(this.ctx, this.sprites.get('assets/tumbang-preso-assets/effects/impact-sheet.png'));
    this.drawBankPopups();
    this.drawHitScore();

    if (this.isDragging) this.drawSlingshotLine();

    this.animationFrameId = requestAnimationFrame(time => this.render(time));
  }

  private drawSlipper() {
    this.ctx.save();
    this.ctx.translate(this.slipperPos.x, this.slipperPos.y);
    this.ctx.rotate(this.slipperAngle);
    if (!this.drawSprite('assets/tumbang-preso-assets/slippers/slipper_pink.png',
      -this.SLIPPER_HALF_WIDTH, -this.SLIPPER_HALF_HEIGHT,
      this.SLIPPER_HALF_WIDTH * 2, this.SLIPPER_HALF_HEIGHT * 2)) {
      this.ctx.fillStyle = '#ec4899';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, this.SLIPPER_HALF_WIDTH, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = '#be185d';
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private drawCan() {
    const fallen = this.hitAge > 0 || this.showNiceShot;
    const width = fallen ? 52 : 32;
    const height = fallen ? 32 : 52;
    const hop = fallen && !this.reducedMotion ? Math.sin(Math.min(this.hitAge / 0.45, 1) * Math.PI) * 18 : 0;
    const path = fallen ? 'assets/tumbang-preso-assets/can/can_fallen.png' : 'assets/tumbang-preso-assets/can/can_standing.png';
    if (this.drawSprite(path, this.canPos.x - width / 2, this.canPos.y - height / 2 - hop, width, height)) return;

    this.ctx.fillStyle = '#64748b';
    this.ctx.fillRect(this.canPos.x - 15, this.canPos.y - 25, 30, 50);
  }

  private drawObstacles() {
    for (const [index, obstacle] of this.obstacles.entries()) {
      const rotated = Boolean(obstacle.rotation);
      let obs = obstacle;
      if (rotated) {
        this.ctx.save();
        this.ctx.translate(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2);
        this.ctx.rotate(obstacle.rotation!);
        obs = { ...obstacle, x: -obstacle.width / 2, y: -obstacle.height / 2 };
      }
      // Use larger rocks while keeping their artwork inside the collision area.
      const count = Math.max(1, Math.floor(obs.width / obs.height));
      const cellWidth = obs.width / count;
      for (let stone = 0; stone < count; stone++) {
        const path = this.stoneAssets[(index + stone) % this.stoneAssets.length];
        const image = this.sprites.get(path);
        if (image?.complete && image.naturalWidth > 0) {
          // Overlap the bank's stones slightly so its reflecting face is readable.
          const availableWidth = rotated ? cellWidth + 8 : cellWidth - 6;
          const scale = Math.min(availableWidth / image.naturalWidth, (obs.height - (rotated ? 4 : 6)) / image.naturalHeight);
          const width = image.naturalWidth * scale;
          const height = image.naturalHeight * scale;
          this.ctx.save();
          this.ctx.filter = `brightness(${this.obstacleFlashes.has(obstacle) ? 1.9 : 1.5}) saturate(1.25)`;
          const x = Math.max(obs.x + 2, Math.min(obs.x + obs.width - width - 2,
            obs.x + stone * cellWidth + (cellWidth - width) / 2));
          this.drawSprite(path, x, obs.y + (obs.height - height) / 2, width, height);
          this.ctx.restore();
        } else {
          this.ctx.fillStyle = obs.color;
          this.ctx.fillRect(obs.x + stone * cellWidth, obs.y, cellWidth, obs.height);
        }
      }
      if (rotated) this.ctx.restore();
    }
  }

  private drawSprite(path: string, x: number, y: number, width: number, height: number): boolean {
    const image = this.sprites.get(path);
    if (!image?.complete || image.naturalWidth === 0) return false;
    this.ctx.drawImage(image, Math.round(x), Math.round(y), Math.round(width), Math.round(height));
    return true;
  }

  private drawHitScore(): void {
    if (this.hitAge <= 0 || this.showNiceShot || this.reducedMotion) return;
    this.ctx.save();
    this.ctx.globalAlpha = Math.min(1, (0.5 - this.hitAge) * 5);
    this.ctx.fillStyle = '#b7f3d0';
    drawPixelText(this.ctx, '+100', this.canPos.x, this.canPos.y - 38 - this.hitAge * 45);
    this.ctx.restore();
  }

  private drawBankPopups(): void {
    this.ctx.save();
    this.ctx.fillStyle = '#fef08a';
    for (const popup of this.bankPopups) {
      this.ctx.globalAlpha = Math.min(1, (0.6 - popup.age) / 0.2);
      const rise = this.reducedMotion ? 0 : popup.age * 35;
      drawPixelText(this.ctx, 'BANK!', Math.max(45, Math.min(this.CANVAS_WIDTH - 45, popup.x)),
        Math.max(28, popup.y - 24 - rise));
    }
    this.ctx.restore();
  }

  private drawSlingshotLine() {
    // Match Jolens Blast's pixel aiming UI; this indicates direction, not a solved path.
    const dx = this.dragStart.x - this.dragCurrent.x;
    const dy = this.dragStart.y - this.dragCurrent.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 4) {
      const length = Math.min(150, distance * 2);
      for (let step = 20; step < length; step += 20) {
        this.drawSprite('assets/tumbang-preso-assets/ui/aim_dot.png',
          this.slipperPos.x + dx / distance * step - 4,
          this.slipperPos.y + dy / distance * step - 4, 8, 8);
      }
      this.ctx.save();
      this.ctx.translate(this.slipperPos.x + dx / distance * length,
        this.slipperPos.y + dy / distance * length);
      this.ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
      this.drawSprite('assets/tumbang-preso-assets/ui/aim_arrow.png', -12, -12, 24, 24);
      this.ctx.restore();
    }
  }
}
