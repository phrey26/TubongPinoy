import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Energy } from '../../../core/services/energy';
import { Subscription } from 'rxjs';

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
  selector: 'app-jolens-blast',
  imports: [CommonModule, RouterModule],
  templateUrl: './jolens-blast.html',
  styleUrl: './jolens-blast.css',
})
export class JolensBlast implements AfterViewInit, OnDestroy {

  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private animationFrameId!: number;

  // ✅ Prevent duplicate starts
  private gameStarted = false;

  // Game State
  currentScore: number = 0;
  energyLevel: number = 100;
  currentLevel: number = 1;
  remainingMarbles: number = 20;

  // Overlays
  showLevelCleared = false;
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
  private canvasWidth = 600;
  private canvasHeight = 500;
  private playAreaRadius = 150;
  private marbleRadius = 20;

  // Drag
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private currentMouseX = 0;
  private currentMouseY = 0;
  private maxDragDistance = 150;

  private energySub!: Subscription;

  constructor(private energyService: Energy) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;

    // ✅ Energy-driven game lifecycle
    this.energySub = this.energyService.getEnergyLevel().subscribe(level => {
      this.energyLevel = level;

      if (level <= 0) {
        // 🚫 HARD STOP
        this.showOutOfJuice = true;
        this.showGameOver = false;
        this.showLevelCleared = false;

        cancelAnimationFrame(this.animationFrameId);
        this.gameStarted = false;
        return;
      }

      // ✅ Has juice again
      this.showOutOfJuice = false;

      // ▶️ Start game only once
      if (!this.gameStarted) {
        this.gameStarted = true;
        this.initLevel();
        this.gameLoop();
      }
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    if (this.energySub) this.energySub.unsubscribe();
  }

  initLevel() {
    this.marblesOnBoard = [];
    this.remainingMarbles = 20;
    this.showLevelCleared = false;
    this.showGameOver = false;
    this.currentScore = 0;

    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;

    for (let i = 0; i < 20; i++) {
      let x: number, y: number;
      let tries = 0;

      do {
        x = centerX + (Math.random() * 2 - 1) * this.playAreaRadius;
        y = centerY + (Math.random() * 2 - 1) * this.playAreaRadius;
        tries++;
      } while (
        (Math.hypot(x - centerX, y - centerY) > this.playAreaRadius - this.marbleRadius ||
        this.isOverlapping(x, y)) && tries < 100
      );

      this.marblesOnBoard.push({
        x, y,
        radius: this.marbleRadius,
        color: this.colors[Math.floor(Math.random() * this.colors.length)],
        dx: 0, dy: 0,
        isMoving: false
      });
    }

    this.spawnShooter();
  }

  isOverlapping(x: number, y: number): boolean {
    return this.marblesOnBoard.some(m =>
      Math.hypot(m.x - x, m.y - y) < this.marbleRadius * 2
    );
  }

  spawnShooter() {
    this.currentShooter = {
      x: this.canvasWidth / 2,
      y: this.canvasHeight - this.marbleRadius * 2,
      radius: this.marbleRadius,
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      dx: 0,
      dy: 0,
      isMoving: false
    };
  }

  onMouseDown(event: MouseEvent) {
    if (
      this.currentShooter.isMoving ||
      this.showLevelCleared ||
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

    if (this.energyLevel <= 0) {
      this.showOutOfJuice = true;
      return;
    }

    const dx = this.dragStartX - this.currentMouseX;
    const dy = this.dragStartY - this.currentMouseY;
    const dragDistance = Math.hypot(dx, dy);

    if (dragDistance > 10) {
      if (this.remainingMarbles <= 0) return;

      this.remainingMarbles--;

      this.currentShooter.dx = dx * 0.15;
      this.currentShooter.dy = dy * 0.15;
      this.currentShooter.isMoving = true;
    }
  }

  gameLoop() {
    this.updatePhysics();
    this.draw();
    this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
  }

  updatePhysics() {
    if (this.energyLevel <= 0) return;

    if (this.currentShooter.isMoving) {
      this.currentShooter.x += this.currentShooter.dx;
      this.currentShooter.y += this.currentShooter.dy;

      if (this.currentShooter.x - this.marbleRadius < 0 ||
          this.currentShooter.x + this.marbleRadius > this.canvasWidth) {
        this.currentShooter.dx *= -1;
      }

      if (this.currentShooter.y - this.marbleRadius < 0 ||
          this.currentShooter.y + this.marbleRadius > this.canvasHeight) {
        this.currentShooter.dy *= -1;
      }

      for (let i = 0; i < this.marblesOnBoard.length; i++) {
        const target = this.marblesOnBoard[i];
        const dist = Math.hypot(this.currentShooter.x - target.x, this.currentShooter.y - target.y);

        if (dist < this.marbleRadius * 2) {
          this.currentShooter.isMoving = false;

          if (this.currentShooter.color === target.color) {
            this.marblesOnBoard.splice(i, 1);
            this.currentScore += 50;
          } else {
            this.marblesOnBoard.push({ ...this.currentShooter });
          }

          this.spawnShooter();
          break;
        }
      }
    }

    if (this.marblesOnBoard.length === 0 && !this.showLevelCleared) {
      this.showLevelCleared = true;
    }

    if (this.remainingMarbles <= 0 && !this.showGameOver) {
      this.showGameOver = true;
    }
  }

  draw() {
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.ctx.fillStyle = '#eff6ff';
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    this.ctx.beginPath();
    this.ctx.arc(this.canvasWidth / 2, this.canvasHeight / 2, this.playAreaRadius, 0, Math.PI * 2);
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

  tryAgain() {
    if (this.energyLevel >= 20) {
      this.energyService.consumeEnergy(20);
      this.showGameOver = false;
      this.initLevel();
    } else {
      this.showOutOfJuice = true;
    }
  }

  resetGame() {
    this.energyService.addEnergy(100 - this.energyLevel);
    this.currentLevel = 1;
    this.showGameOver = false;
    this.showOutOfJuice = false;
    this.initLevel();
  }

  nextLevel() {
    this.currentLevel++;
    this.initLevel();
  }

  goToShop() {
    this.showOutOfJuice = false;
    window.location.href = '/shop';
  }
}
