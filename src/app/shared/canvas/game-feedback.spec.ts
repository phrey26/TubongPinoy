import { vi } from 'vitest';
import { FEEDBACK_COLORS, GameFeedback } from './game-feedback';

describe('Game feedback', () => {
  it('bounds effects during sustained collisions and expires every effect and camera nudge', () => {
    const feedback = new GameFeedback();
    for (let i = 0; i < 200; i++) {
      feedback.update(1 / 60);
      feedback.impact(225, 300, 1, FEEDBACK_COLORS.glass);
      feedback.celebrate(225, 300);
      feedback.trail(225, 600, 20, '#ffffff');
      expect(feedback.count).toBeLessThanOrEqual(164);
    }
    expect(feedback.count).toBeGreaterThan(0);
    expect(feedback.canvasTransform).not.toBe('');
    feedback.update(1);
    expect(feedback.count).toBe(0);
    expect(feedback.canvasTransform).toBe('');
  });

  it('coalesces dense collision contacts instead of multiplying bursts within a frame', () => {
    const feedback = new GameFeedback();
    feedback.impact(100, 200, 1, FEEDBACK_COLORS.glass);
    const count = feedback.count;
    for (let i = 0; i < 100; i++) feedback.impact(100, 200, 1, FEEDBACK_COLORS.glass);
    expect(feedback.count).toBe(count);
    feedback.update(0.05);
    feedback.impact(100, 200, 1, FEEDBACK_COLORS.glass);
    expect(feedback.count).toBeGreaterThan(count);
  });

  it('clears existing motion immediately when the preference changes but retains power feedback', () => {
    const feedback = new GameFeedback();
    feedback.impact(225, 120, 1, FEEDBACK_COLORS.tin);
    feedback.reducedMotion = true;
    feedback.launch(225, 680, 0, -18);
    feedback.celebrate(225, 120);
    feedback.trail(225, 600, 18, '#ffffff');
    feedback.impact(225, 120, 1, FEEDBACK_COLORS.tin);
    expect(feedback.count).toBe(0);
    expect(feedback.canvasTransform).toBe('');
    const ctx = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    feedback.drawPower(ctx, 225, 720, 1);
    expect(ctx.fillRect).toHaveBeenCalled();
    feedback.reducedMotion = false;
    feedback.launch(225, 680, 0, -18);
    expect(feedback.count).toBeGreaterThan(0);
    feedback.clear();
    expect(feedback.count).toBe(0);
    expect(feedback.canvasTransform).toBe('');
  });

  it('ages effects by elapsed time and leaves them frozen when a dialog pauses play', () => {
    const feedback = new GameFeedback();
    feedback.launch(225, 680, 0, -18);
    const ctx = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    feedback.draw(ctx);
    const initial = vi.mocked(ctx.fillRect).mock.calls.slice();
    vi.mocked(ctx.fillRect).mockClear();
    feedback.update(0);
    feedback.draw(ctx);
    expect(vi.mocked(ctx.fillRect).mock.calls).toEqual(initial);
    feedback.update(0.2);
    vi.mocked(ctx.fillRect).mockClear();
    feedback.draw(ctx);
    expect(vi.mocked(ctx.fillRect).mock.calls).not.toEqual(initial);
  });
});
