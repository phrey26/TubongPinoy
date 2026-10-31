import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { AccountState } from './account-state';

export type AudioChannel = 'effects' | 'interface';
export type VolumeChannel = 'master' | AudioChannel;
export interface AudioSettings { master: number; effects: number; interface: number; muted: boolean; }
export const DEFAULT_AUDIO: Readonly<AudioSettings> = { master: 70, effects: 85, interface: 65, muted: false };
export const TUMBANG_SOUNDS = {
  aim: { files: ['aim.wav'], channel: 'effects' },
  throw: { files: ['throw.wav'], channel: 'effects' },
  wall: { files: ['wall.wav', 'wall-2.wav', 'wall-3.wav'], channel: 'effects' },
  rock: { files: ['rock.wav', 'rock-2.wav', 'rock-3.wav'], channel: 'effects' },
  can: { files: ['can-hit.wav', 'can-hit-2.wav', 'can-hit-3.wav'], channel: 'effects' },
  win: { files: ['win.wav'], channel: 'effects' },
  miss: { files: ['miss.wav'], channel: 'effects' },
  click: { files: ['click.wav'], channel: 'interface' },
  empty: { files: ['empty.wav'], channel: 'interface' },
} as const;
export type TumbangSound = keyof typeof TUMBANG_SOUNDS;

export function normalizeAudioSettings(value: unknown): AudioSettings {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const volume = (key: VolumeChannel) => typeof raw[key] === 'number' && Number.isFinite(raw[key])
    ? Math.round(Math.max(0, Math.min(100, raw[key]))) : DEFAULT_AUDIO[key];
  return { master: volume('master'), effects: volume('effects'), interface: volume('interface'), muted: raw['muted'] === true };
}

@Injectable({ providedIn: 'root' })
export class TumbangAudio {
  private readonly destroyRef = inject(DestroyRef);
  private readonly state = signal<AudioSettings>({ ...DEFAULT_AUDIO });
  readonly settings = this.state.asReadonly();
  readonly loading = signal(false);
  readonly error = signal('');
  readonly storageError = signal(false);
  private accountId: number | null | undefined;
  private context?: AudioContext;
  private master?: GainNode;
  private channels?: Record<AudioChannel, GainNode>;
  private readonly buffers = new Map<TumbangSound, AudioBuffer[]>();
  private loadingBank?: Promise<boolean>;
  private readonly voices = new Map<AudioBufferSourceNode, GainNode>();
  private readonly lastVariant = new Map<TumbangSound, number>();
  private readonly highPitch = new Map<TumbangSound, boolean>();
  private active = false;
  private paused = false;
  private generation = 0;
  private lastBounce = -Infinity;
  private previewSettings?: AudioSettings;

  private get mixSettings(): AudioSettings { return this.previewSettings ?? this.settings(); }

  constructor() {
    inject(AccountState).changes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => {
      const id = user?.id ?? null;
      if (id === this.accountId) return;
      this.stop(); this.accountId = id; this.readSettings();
    });
    fromEvent(document, 'visibilitychange').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (document.hidden) { this.generation++; this.silence(); }
    });
    fromEvent<StorageEvent>(window, 'storage').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event.key === this.storageKey || event.key === null) this.readSettings();
    });
    this.destroyRef.onDestroy(() => { this.stop(); void this.context?.close().catch(() => {}); });
  }

  private get storageKey(): string { return `tubong.audio.v1.${this.accountId ?? 'guest'}`; }
  private readSettings(): void {
    try {
      this.state.set(normalizeAudioSettings(JSON.parse(localStorage.getItem(this.storageKey) || 'null')));
      this.storageError.set(false);
    } catch { this.state.set({ ...DEFAULT_AUDIO }); this.storageError.set(true); }
    this.applyMix();
  }
  setVolume(channel: VolumeChannel, value: number): void {
    if (!Number.isFinite(value)) return;
    this.save({ ...this.settings(), [channel]: Math.round(Math.max(0, Math.min(100, value))) });
  }
  toggleMute(): void {
    this.save({ ...this.settings(), muted: !this.settings().muted });
    if (!this.settings().muted && this.active) void this.activate();
  }
  reset(): void { this.save({ ...DEFAULT_AUDIO }); }
  /** Commit an explicit Settings save; keep the saved levels unchanged on failure. */
  saveSettings(value: AudioSettings): boolean {
    const settings = normalizeAudioSettings(value);
    try { localStorage.setItem(this.storageKey, JSON.stringify(settings)); }
    catch { this.storageError.set(true); return false; }
    this.storageError.set(false);
    this.state.set(settings);
    this.stopPreview();
    this.applyMix();
    return true;
  }
  private save(settings: AudioSettings): void {
    this.state.set(settings);
    try { localStorage.setItem(this.storageKey, JSON.stringify(settings)); this.storageError.set(false); }
    catch { this.storageError.set(true); }
    this.applyMix();
  }
  private applyMix(): void {
    const settings = this.mixSettings;
    if (this.context && this.master && this.channels) {
      this.master.gain.setTargetAtTime(settings.muted ? 0 : settings.master / 100, this.context.currentTime, .015);
      for (const channel of ['effects', 'interface'] as const) {
        this.channels[channel].gain.setTargetAtTime(settings[channel] / 100, this.context.currentTime, .015);
      }
    }
    if (settings.muted || settings.master === 0) { this.generation++; this.silence(); }
  }
  start(): void { this.stop(); this.active = true; this.paused = false; void this.activate(true); }
  async activate(click = false): Promise<void> {
    const generation = this.generation;
    if (this.settings().muted || this.settings().master === 0) return;
    if (!await this.prepare() || generation !== this.generation || !this.canPlay) return;
    if (click) this.play('click');
  }
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) { this.generation++; this.silence(); }
  }
  stop(): void {
    this.active = false; this.generation++; this.lastBounce = -Infinity;
    this.previewSettings = undefined; this.silence(); this.applyMix();
  }
  stopPreview(): void {
    if (!this.active) {
      this.generation++; this.silence(); this.previewSettings = undefined; this.applyMix();
    }
  }
  resetAttempt(): void { this.silence(); this.lastBounce = -Infinity; }
  private get canPlay(): boolean {
    return this.active && !this.paused && !document.hidden && !this.settings().muted && this.settings().master > 0;
  }
  play(sound: TumbangSound, strength = 1, delay = 0): void {
    if (!this.canPlay || this.context?.state !== 'running') return;
    if (sound === 'wall' || sound === 'rock') {
      if (this.context.currentTime - this.lastBounce < .055) return;
      this.lastBounce = this.context.currentTime;
    }
    this.spawn(sound, Math.max(.2, Math.min(1, strength)), delay);
  }
  async preview(channel: AudioChannel, draft?: AudioSettings): Promise<void> {
    if (this.active) return;
    this.stopPreview();
    const generation = this.generation;
    const settings = normalizeAudioSettings(draft ?? this.settings());
    if (settings.muted || !settings.master || !settings[channel]) return;
    this.previewSettings = settings;
    this.applyMix();
    if (!await this.prepare() || generation !== this.generation || document.hidden) return;
    this.spawn(channel === 'effects' ? 'can' : 'click', 1);
  }
  private async prepare(): Promise<boolean> {
    this.error.set('');
    try {
      if (!this.context) {
        if (!window.AudioContext) throw new Error('Audio unavailable');
        const context = this.context = new AudioContext();
        this.master = context.createGain();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -8; limiter.knee.value = 12; limiter.ratio.value = 8;
        limiter.attack.value = .003; limiter.release.value = .15;
        this.master.connect(limiter); limiter.connect(context.destination);
        this.channels = { effects: context.createGain(), interface: context.createGain() };
        for (const gain of Object.values(this.channels)) gain.connect(this.master);
        this.applyMix();
      }
      if (this.context.state !== 'running') await this.context.resume();
      if (this.context.state !== 'running') throw new Error('Audio suspended');
      if (this.buffers.size === Object.keys(TUMBANG_SOUNDS).length) return true;
      if (!this.loadingBank) {
        const context = this.context;
        this.loading.set(true);
        this.loadingBank = Promise.all(Object.entries(TUMBANG_SOUNDS).map(async ([name, sound]) => {
          const buffers = await Promise.all(sound.files.map(async file => {
            const response = await fetch(`assets/tumbang-preso-assets/audio/${file}`, { signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error('Sound download failed');
            return context.decodeAudioData(await response.arrayBuffer());
          }));
          return [name as TumbangSound, buffers] as const;
        })).then(entries => {
          for (const [name, buffers] of entries) this.buffers.set(name, buffers);
          return true;
        }).catch(() => { this.error.set('Sounds could not load. Use Retry sound to try again.'); return false; })
          .finally(() => { this.loading.set(false); this.loadingBank = undefined; });
      }
      return await this.loadingBank;
    } catch {
      this.error.set('Sound is unavailable. Use Retry sound or check your browser’s audio permissions.');
      return false;
    }
  }
  private spawn(sound: TumbangSound, strength: number, delay = 0): void {
    const context = this.context;
    const buffers = this.buffers.get(sound);
    const channel = TUMBANG_SOUNDS[sound].channel;
    if (!context || context.state !== 'running' || !buffers?.length || !this.channels ||
        this.mixSettings.muted || !this.mixSettings.master || !this.mixSettings[channel]) return;
    if (this.voices.size >= 12) {
      const oldest = this.voices.keys().next().value;
      if (oldest) this.release(oldest);
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    const last = this.lastVariant.get(sound);
    const variant = buffers.length === 1 ? 0 : last === undefined ? Math.floor(Math.random() * buffers.length)
      : (last + 1 + Math.floor(Math.random() * (buffers.length - 1))) % buffers.length;
    this.lastVariant.set(sound, variant);
    source.buffer = buffers[variant];
    const jingle = sound === 'win' || sound === 'miss' || sound === 'empty';
    if (!jingle) {
      const high = !this.highPitch.get(sound);
      this.highPitch.set(sound, high);
      source.playbackRate.value = 1 + (high ? 1 : -1) * (.018 + Math.random() * .032);
    }
    gain.gain.value = strength * (jingle ? 1 : .94 + Math.random() * .06);
    source.connect(gain); gain.connect(this.channels[channel]); this.voices.set(source, gain);
    source.onended = () => this.release(source, false);
    source.start(context.currentTime + delay);
  }
  private release(source: AudioBufferSourceNode, stop = true): void {
    source.onended = null;
    if (stop) { try { source.stop(); } catch { /* Already ended. */ } }
    source.disconnect(); this.voices.get(source)?.disconnect(); this.voices.delete(source);
  }
  private silence(): void { for (const source of this.voices.keys()) this.release(source); }
}
