import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Energy } from '../../../core/services/energy';

interface HighScore {
  username: string;
  points: number;
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

@Component({
  selector: 'app-tumbang-preso',
  imports: [CommonModule, RouterModule],
  templateUrl: './tumbang-preso.html',
  styleUrl: './tumbang-preso.css',
})
export class TumbangPreso implements AfterViewInit,OnInit {

  @ViewChild('gameCanvas') canvas!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;

  constructor(private energyService: Energy) {}

  // Game State
  currentScore = 0;
  energyLevel = 100;
  currentLevel = 1;
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

  private readonly CANVAS_WIDTH = 800;
  private readonly CANVAS_HEIGHT = 450;
  private readonly PULL_LIMIT = 80;
  private readonly FRICTION = 0.985;
  private readonly BOUNCE_FAC = 0.7;

  private isDragging = false;
  private isLaunched = false;
  private slipperPos = { x: 120, y: 225 };
  private dragStart = { x: 120, y: 225 };
  private dragCurrent = { x: 120, y: 225 };
  private velocity = { x: 0, y: 0 };
  private canPos = { x: 680, y: 225 };

  obstacles: Obstacle[] = [
    { x: 380, y: 100, width: 25, height: 100, color: '#fb923c' },
    { x: 420, y: 250, width: 25, height: 100, color: '#fb923c' }
  ];

  ngAfterViewInit() {
    this.ctx = this.canvas.nativeElement.getContext('2d')!;
    this.render();
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    if (
      this.isLaunched ||
      this.showTryAgain ||
      this.showNiceShot ||
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
    this.isLaunched = true;
  }

  private updatePhysics() {
    this.slipperPos.x += this.velocity.x;
    this.slipperPos.y += this.velocity.y;
    this.velocity.x *= this.FRICTION;
    this.velocity.y *= this.FRICTION;

    this.checkBoundaries();
    this.checkObstacleBounce();

    if (Math.hypot(this.slipperPos.x - this.canPos.x, this.slipperPos.y - this.canPos.y) < 35) {
      this.isLaunched = false;
      this.showNiceShot = true;
      this.currentScore += 100;
      return;
    }

    const stopped = Math.abs(this.velocity.x) < 0.2 && Math.abs(this.velocity.y) < 0.2;
    const outOfBoundsX = this.slipperPos.x < 0 || this.slipperPos.x > this.CANVAS_WIDTH;

    if (this.isLaunched && (stopped || outOfBoundsX)) {
      this.isLaunched = false;
      this.showTryAgain = true;
    }
  }

  private checkBoundaries() {
    if (this.slipperPos.y < 15 || this.slipperPos.y > this.CANVAS_HEIGHT - 15) {
      this.velocity.y *= -this.BOUNCE_FAC;
      this.slipperPos.y = this.slipperPos.y < 15 ? 15 : this.CANVAS_HEIGHT - 15;
    }
  }

  private checkObstacleBounce() {
    for (const obs of this.obstacles) {
      if (
        this.slipperPos.x > obs.x &&
        this.slipperPos.x < obs.x + obs.width &&
        this.slipperPos.y > obs.y &&
        this.slipperPos.y < obs.y + obs.height
      ) {
        this.velocity.x *= -1.2;
        this.slipperPos.x += this.velocity.x * 2;
      }
    }
  }

  nextLevel() {
    this.currentLevel++;
    this.resetSlipper();
    this.showNiceShot = false;

    this.obstacles.push({
      x: 250 + Math.random() * 300,
      y: Math.random() * 300,
      width: 20,
      height: 60,
      color: '#fb923c'
    });
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
    this.slipperPos = { x: 120, y: 225 };
    this.dragCurrent = { x: 120, y: 225 };
    this.velocity = { x: 0, y: 0 };
  }

  resetGame() {
    this.currentScore = 0;
    this.currentLevel = 1;
    this.resetSlipper();
  }

  goToShop() {
    this.showOutOfJuice = false;
    window.location.href = '/shop';
  }

  private render() {
    this.ctx.clearRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
    this.drawObstacles();
    this.drawCan();
    this.drawSlipper();

    if (this.isDragging) this.drawSlingshotLine();
    if (this.isLaunched) this.updatePhysics();

    requestAnimationFrame(() => this.render());
  }

  private drawSlipper() {
    this.ctx.fillStyle = '#ec4899';
    this.ctx.beginPath();
    this.ctx.arc(this.slipperPos.x, this.slipperPos.y, 15, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = '#be185d';
    this.ctx.stroke();
  }

  private drawCan() {
    this.ctx.fillStyle = '#64748b';
    this.ctx.fillRect(this.canPos.x - 15, this.canPos.y - 25, 30, 50);
  }

  private drawObstacles() {
    for (const obs of this.obstacles) {
      this.ctx.fillStyle = obs.color;
      this.ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    }
  }

  private drawSlingshotLine() {
    this.ctx.beginPath();
    this.ctx.moveTo(this.dragStart.x, this.dragStart.y);
    this.ctx.lineTo(this.dragCurrent.x, this.dragCurrent.y);
    this.ctx.strokeStyle = '#a855f7';
    this.ctx.setLineDash([5, 5]);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }
}
