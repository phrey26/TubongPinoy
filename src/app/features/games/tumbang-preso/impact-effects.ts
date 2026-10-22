/** Four-frame dust and tin-can impacts, arranged in two rows of an atlas. */
export class ImpactEffects {
  private impacts: { x: number; y: number; row: number; age: number }[] = [];

  play(x: number, y: number, kind: 'dust' | 'spark'): void {
    this.impacts.push({ x, y, row: kind === 'dust' ? 0 : 1, age: 0 });
    this.impacts = this.impacts.slice(-24);
  }

  update(seconds: number): void {
    for (const impact of this.impacts) impact.age += seconds;
    this.impacts = this.impacts.filter(impact => impact.age < 0.56);
  }

  draw(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement | undefined): void {
    if (!atlas?.complete || !atlas.naturalWidth) return;
    const width = atlas.naturalWidth / 4;
    const height = atlas.naturalHeight / 2;
    for (const impact of this.impacts) {
      const size = impact.row === 0 ? 100 : 128;
      ctx.drawImage(atlas, Math.min(3, Math.floor(impact.age / 0.14)) * width,
        impact.row * height, width, height,
        Math.round(impact.x - size / 2), Math.round(impact.y - size / 2), size, size);
    }
  }

  clear(): void { this.impacts = []; }
}
