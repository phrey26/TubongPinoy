import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountState } from './account-state';
import { DEFAULT_AUDIO, TumbangAudio, normalizeAudioSettings } from './tumbang-audio';

const parameter = () => ({ value: 1, setTargetAtTime: vi.fn() });
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
const bufferSource = () => ({ ...node(), buffer: null, loop: false, playbackRate: { value: 1 }, onended: null, start: vi.fn(), stop: vi.fn() });
class FakeContext {
  static instances: FakeContext[] = [];
  state = 'suspended'; currentTime = 10; destination = node();
  sources: ReturnType<typeof bufferSource>[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async () => ({ duration: 1 }));
  constructor() { FakeContext.instances.push(this); }
  createGain() { return { ...node(), gain: parameter() }; }
  createDynamicsCompressor() {
    return { ...node(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter() };
  }
  createBufferSource() { const source = bufferSource(); this.sources.push(source); return source; }
}

describe('Tumbang audio', () => {
  beforeEach(() => {
    localStorage.clear(); FakeContext.instances = [];
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
  async function start() {
    const audio = TestBed.inject(TumbangAudio); audio.start();
    await vi.waitFor(() => expect(FakeContext.instances[0].sources).toHaveLength(1));
    return audio;
  }
  it('loads exactly the 15 finite cues only after a user gesture, with no music', async () => {
    TestBed.inject(TumbangAudio);
    expect(FakeContext.instances).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
    const audio = await start();
    expect(fetch).toHaveBeenCalledTimes(15);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('playground'))).toBe(false);
    audio.play('win', .85, .14);
    expect(FakeContext.instances[0].sources.at(-1)?.start).toHaveBeenCalledWith(10.14);
    expect(FakeContext.instances[0].sources.every(source => !source.loop)).toBe(true);
  });
  it('routes independent effects/interface gains through the master and respects mute', async () => {
    const audio = await start(); const context = FakeContext.instances[0];
    audio.setVolume('master', 40); audio.setVolume('effects', 20);
    expect(audio['master']!.gain.setTargetAtTime).toHaveBeenLastCalledWith(.4, 10, .015);
    expect(audio['channels']!.effects.gain.setTargetAtTime).toHaveBeenLastCalledWith(.2, 10, .015);
    audio.setVolume('effects', 0); audio.play('can'); expect(context.sources).toHaveLength(1);
    audio.play('click'); expect(context.sources).toHaveLength(2);
    audio.toggleMute(); expect(audio['voices'].size).toBe(0);
    audio.play('click'); expect(context.sources).toHaveLength(2);
  });
  it('never repeats an impact take or pitch immediately, but preserves result jingle tuning', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    const audio = await start(); const context = FakeContext.instances[0];
    for (const sound of ['wall', 'rock', 'can'] as const) {
      let previous: ReturnType<typeof bufferSource> | undefined;
      for (let i = 0; i < 8; i++) {
        context.currentTime += .1; audio.play(sound);
        const source = context.sources.at(-1)!;
        expect(source.playbackRate.value).toBeGreaterThanOrEqual(.95);
        expect(source.playbackRate.value).toBeLessThanOrEqual(1.05);
        if (previous) {
          expect(source.buffer).not.toBe(previous.buffer);
          expect(source.playbackRate.value).not.toBe(previous.playbackRate.value);
        }
        previous = source;
      }
    }
    for (const sound of ['win', 'miss', 'empty', 'win', 'miss', 'empty'] as const) {
      audio.play(sound); expect(context.sources.at(-1)!.playbackRate.value).toBe(1);
    }
  });
  it('restores separate account preferences and safely validates old or blocked storage', () => {
    const state = TestBed.inject(AccountState);
    const user = { id: 1, username: 'one', email: 'one@example.test', tansans: 0, juice: 100 };
    state.set(user); const audio = TestBed.inject(TumbangAudio);
    audio.setVolume('master', 32); audio.toggleMute();
    state.set({ ...user, id: 2 }); expect(audio.settings()).toEqual(DEFAULT_AUDIO);
    state.set(user); expect(audio.settings().master).toBe(32); expect(audio.settings().muted).toBe(true);
    expect(normalizeAudioSettings({ music: 20, master: 999, effects: NaN, interface: -10, muted: 'yes' }))
      .toEqual({ ...DEFAULT_AUDIO, master: 100, interface: 0 });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    audio.setVolume('effects', 42); expect(audio.settings().effects).toBe(42); expect(audio.storageError()).toBe(true);
  });
  it('bounds voices and stops effects on attempt reset, pause, hidden tab, and leave', async () => {
    const audio = await start(); const context = FakeContext.instances[0];
    for (let i = 0; i < 100; i++) audio.play('rock'); expect(context.sources).toHaveLength(2);
    for (let i = 0; i < 30; i++) audio.play('can'); expect(audio['voices'].size).toBe(12);
    audio.resetAttempt(); expect(audio['voices'].size).toBe(0);
    audio.play('can'); audio.setPaused(true); expect(audio['voices'].size).toBe(0);
    audio.play('can'); expect(audio['voices'].size).toBe(0);
    audio.setPaused(false); audio.play('can'); expect(audio['voices'].size).toBe(1);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange')); expect(audio['voices'].size).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange')); expect(audio['voices'].size).toBe(0);
    audio.play('can'); audio.stop(); expect(audio['voices'].size).toBe(0); expect(audio['active']).toBe(false);
  });
  it('does not play previews that finish downloading after leaving', async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    const audio = TestBed.inject(TumbangAudio); const preview = audio.preview('effects');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled()); audio.stopPreview();
    resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response);
    await preview; expect(FakeContext.instances[0].sources).toHaveLength(0);
  });
  it('allows failed downloads to retry without blocking the game', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Offline'));
    const audio = TestBed.inject(TumbangAudio); await audio.preview('effects');
    expect(audio.error()).toContain('could not load'); expect(audio.loading()).toBe(false);
    vi.mocked(fetch).mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response);
    await audio.preview('effects'); expect(audio.error()).toBe(''); expect(audio['voices'].size).toBe(1);
    audio.stopPreview(); expect(audio['voices'].size).toBe(0);
  });
  it('tolerates unavailable audio and rejected browser permissions', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const audio = TestBed.inject(TumbangAudio); await audio.activate(); expect(audio.error()).toContain('unavailable');
    vi.stubGlobal('AudioContext', FakeContext); await audio.preview('effects');
    FakeContext.instances[0].state = 'suspended'; FakeContext.instances[0].resume.mockRejectedValue(new Error('Denied'));
    await audio.activate(); expect(audio.error()).toContain('unavailable');
  });
});
