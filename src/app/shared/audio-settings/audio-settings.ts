import { Component, DestroyRef, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AccountState } from '../../core/services/account-state';
import { Confirmation } from '../../core/services/confirmation';
import { AudioChannel, AudioSettings, DEFAULT_AUDIO, TumbangAudio, VolumeChannel } from '../../core/services/tumbang-audio';

@Component({
  selector: 'app-audio-settings',
  templateUrl: './audio-settings.html',
  styleUrl: './audio-settings.css',
})
export class AudioSettingsPanel implements OnDestroy {
  readonly audio = inject(TumbangAudio);
  private readonly account = inject(AccountState);
  private readonly confirmation = inject(Confirmation);
  private readonly destroyRef = inject(DestroyRef);
  private readonly accountId = computed(() => this.account.user()?.id ?? null);
  private editingAccountId: number | null | undefined;
  readonly draft = signal<AudioSettings>({ ...this.audio.settings() });
  readonly pending = signal(false);
  readonly message = signal('');
  readonly saveError = signal('');
  readonly hasChanges = computed(() => {
    const draft = this.draft(), saved = this.audio.settings();
    return draft.master !== saved.master || draft.effects !== saved.effects ||
      draft.interface !== saved.interface || draft.muted !== saved.muted;
  });
  private revision = 0;
  readonly mixers: { id: AudioChannel; name: string; description: string; symbol: string }[] = [
    { id: 'effects', name: 'Game effects', description: 'Slipper throws, can hits, glass-marble clinks, and game jingles.', symbol: '✦' },
    { id: 'interface', name: 'Interface', description: 'Button cues and the low-Juice alert.', symbol: '◉' },
  ];

  constructor() {
    effect(() => {
      const accountId = this.accountId();
      const saved = this.audio.settings();
      untracked(() => {
        this.revision++;
        this.audio.stopPreview();
        this.draft.set({ ...saved });
        this.saveError.set('');
        if (this.editingAccountId !== accountId) this.message.set('');
        this.editingAccountId = accountId;
      });
    });
  }

  private edit(settings: AudioSettings): void {
    if (this.pending()) return;
    this.audio.stopPreview();
    this.draft.set(settings);
    this.message.set(''); this.saveError.set('');
  }
  changeVolume(channel: VolumeChannel, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    this.edit({ ...this.draft(), [channel]: Math.round(Math.max(0, Math.min(100, value))) });
  }
  toggleMute(): void { this.edit({ ...this.draft(), muted: !this.draft().muted }); }
  restoreDefaults(): void { this.edit({ ...DEFAULT_AUDIO }); }
  preview(channel: AudioChannel): void { void this.audio.preview(channel, this.draft()); }
  previewMarbles(): void { void this.audio.preview('effects', this.draft(), 'jolens'); }

  save(): void {
    if (this.pending() || !this.hasChanges()) return;
    const accountId = this.account.user()?.id, revision = this.revision;
    const settings = { ...this.draft() };
    this.pending.set(true); this.audio.stopPreview(); this.saveError.set(''); this.message.set('');
    this.confirmation.ask({
      title: 'Are you sure you want to save these sound settings?',
      message: `Master ${settings.master}%, game effects ${settings.effects}%, interface ${settings.interface}%. ${settings.muted ? 'All sounds will be muted.' : !settings.master ? 'Master volume is zero, so all sounds will be silent.' : 'Sound will be on.'} These preferences will be saved for your account on this browser.`,
      confirmLabel: 'Save sound settings', cancelLabel: 'Keep editing',
    }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.pending.set(false))).subscribe(confirmed => {
      if (!confirmed || this.account.user()?.id !== accountId || this.revision !== revision) return;
      if (this.audio.saveSettings(settings)) {
        this.message.set('Sound settings saved.');
      } else {
        this.saveError.set('Your browser could not save these settings. Your changes are still here. Try saving again.');
      }
    });
  }
  discard(): void {
    if (this.pending() || !this.hasChanges()) return;
    const accountId = this.account.user()?.id, revision = this.revision;
    this.pending.set(true); this.audio.stopPreview();
    this.confirmation.ask({
      title: 'Are you sure you want to discard your sound changes?',
      message: 'Your volume and mute settings will return to the last saved levels.',
      confirmLabel: 'Discard sound changes', cancelLabel: 'Keep editing',
    }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.pending.set(false))).subscribe(confirmed => {
      if (confirmed && this.account.user()?.id === accountId && this.revision === revision) {
        this.draft.set({ ...this.audio.settings() }); this.saveError.set(''); this.message.set('');
      }
    });
  }
  ngOnDestroy(): void { this.audio.stopPreview(); }
}
