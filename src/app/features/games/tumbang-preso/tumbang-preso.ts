import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Energy } from '../../../core/services/energy';
import { PixelEffects } from './pixel-effects';
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
  private ctx!: CanvasRenderingContext2D;
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly effects = new PixelEffects();
  private lastFrameTime: number | null = null;
  private hitAge = 0;
  private trailFrame = 0;
  private readonly obstacleFlashes = new Map<Obstacle, number>();
  private readonly sprites = new Map<string, HTMLImageElement>();
  private readonly stoneAssets = [
    'assets/stones/stone_flat_brown.png',
    'assets/stones/stone_mossy.png',
    'assets/stones/stone_big_cracked.png',
    'assets/stones/stone_round_blue.png',
    'assets/stones/stone_small_gray.png',
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
    cancelAnimationFrame(this.animationFrameId);
    this.effects.clear();
    this.obstacleFlashes.clear();
  }

  // Game State
  currentScore = 0;
  energyLevel = 100;
  currentLevel = 1;
  shotBounces = 0;
  showTryAgain = false;
  showNiceShot = false;
  showOutOfJuice = false; // Reactive modal

  highScores: HighScore[] = [
    { username: 'JuanDelaCruz', points: 1500 },
    { username: 'SlipperMaster', points: 1200 },
    { username: 'Pambato01', points: 900 }
  ];

  ngOnInit() {
    // Watch energy level
    this.energyService.getEnergyLevel().subscribe(value => {
      this.energyLevel = value;
      this.showOutOfJuice = this.energyLevel <= 0; // Show modal automatically
    });
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
    this.effects.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    for (const path of [
      'assets/background/street_bg_clean.png',
      'assets/can/can_standing.png',
      'assets/can/can_fallen.png',
      'assets/slippers/slipper_pink.png',
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
    this.effects.burst(this.slipperPos.x, this.slipperPos.y + 12, ['#d6c5ab', '#a99b89', '#e4d9c5'], 12, 45);
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

    if (++this.trailFrame % 2 === 0 && Math.hypot(this.velocity.x, this.velocity.y) > 2) {
      this.effects.burst(this.slipperPos.x, this.slipperPos.y, ['#ed9db9', '#cf83a3', '#d6c5ab'], 1, 8);
    }
    const bounces = Number(result.wallBounce) + result.rockBounces.length;
    if (bounces > 0) {
      this.shotBounces += bounces;
      this.changeDetector.markForCheck();
    }
    if (result.wallBounce) {
      this.effects.burst(shot.x, shot.y, ['#d6c5ab', '#bcbdb3', '#ece7d9'], 8, 50);
    }
    for (const obstacle of result.rockBounces) {
      this.effects.burst(shot.x, shot.y, ['#c9c3b2', '#a4afa0', '#eee9d9'], 10, 65);
      if (!this.effects.reducedMotion) this.obstacleFlashes.set(obstacle, 0.16);
    }

    if (result.hit) {
      this.isLaunched = false;
      this.angularVelocity = 0;
      this.hitAge = 0.001;
      this.showNiceShot = this.effects.reducedMotion;
      this.effects.burst(this.canPos.x, this.canPos.y, ['#eef5fa', '#a9c2d2', '#88c9b0'], 28, 120);
      this.currentScore += 100;
      this.changeDetector.markForCheck();
      return;
    }

    if (result.missed) {
      this.isLaunched = false;
      this.angularVelocity = 0;
      this.showTryAgain = true;
      this.effects.burst(this.slipperPos.x, Math.min(this.CANVAS_HEIGHT - 8, Math.max(8, this.slipperPos.y)), ['#a99b89', '#d6c5ab'], 8, 35);
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
    if (this.energyLevel >= 20) {
      this.energyService.consumeEnergy(20);
      this.resetSlipper();
    }
    // No else needed; modal shows automatically when energy reaches 0
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
    this.trailFrame = 0;
    this.shotBounces = 0;
    this.effects.clear();
    this.obstacleFlashes.clear();
  }

  resetGame() {
    this.currentScore = 0;
    this.currentLevel = 1;
    this.resetSlipper();
    this.obstacles = generateLevel(1).obstacles;
  }

  goToShop() {
    this.showOutOfJuice = false;
    window.location.href = '/shop';
  }

  private render(timestamp = performance.now()) {
    const seconds = this.lastFrameTime === null ? 0 : Math.max(0, Math.min((timestamp - this.lastFrameTime) / 1000, 0.05));
    this.lastFrameTime = timestamp;
    if (this.isLaunched) this.updatePhysics();
    this.effects.update(seconds);
    for (const [obstacle, life] of this.obstacleFlashes) {
      if (life <= seconds) this.obstacleFlashes.delete(obstacle);
      else this.obstacleFlashes.set(obstacle, life - seconds);
    }
    if (this.hitAge > 0 && !this.showNiceShot) {
      this.hitAge += seconds;
      if (this.hitAge >= 0.45) {
        this.showNiceShot = true;
        this.changeDetector.markForCheck();
      }
    }
    this.ctx.clearRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
    this.drawSprite('assets/background/street_bg_clean.png', 0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
    this.drawObstacles();
    this.drawCan();
    this.drawSlipper();
    this.effects.draw(this.ctx);
    this.drawHitScore();

    if (this.isDragging) this.drawSlingshotLine();

    this.animationFrameId = requestAnimationFrame(time => this.render(time));
  }

  private drawSlipper() {
    this.ctx.save();
    this.ctx.translate(this.slipperPos.x, this.slipperPos.y);
    this.ctx.rotate(this.slipperAngle);
    if (!this.drawSprite('assets/slippers/slipper_pink.png',
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
    const hop = fallen && !this.effects.reducedMotion ? Math.sin(Math.min(this.hitAge / 0.45, 1) * Math.PI) * 18 : 0;
    const path = fallen ? 'assets/can/can_fallen.png' : 'assets/can/can_standing.png';
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
    if (this.hitAge <= 0 || this.showNiceShot || this.effects.reducedMotion) return;
    this.ctx.save();
    this.ctx.globalAlpha = Math.min(1, (0.5 - this.hitAge) * 5);
    this.ctx.font = 'bold 22px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#b7f3d0';
    this.ctx.fillText('+100', this.canPos.x, this.canPos.y - 38 - this.hitAge * 45);
    if (this.shotBounces > 1) {
      this.ctx.font = 'bold 14px monospace';
      this.ctx.fillText(`${this.shotBounces} BANK CHAIN!`, this.canPos.x, this.canPos.y - 64 - this.hitAge * 45);
    }
    this.ctx.restore();
  }

  private drawSlingshotLine() {
    this.ctx.beginPath();
    this.ctx.moveTo(this.dragStart.x, this.dragStart.y);
    this.ctx.lineTo(this.dragCurrent.x, this.dragCurrent.y);
    this.ctx.strokeStyle = '#fef08a';
    this.ctx.setLineDash([5, 5]);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }
}
