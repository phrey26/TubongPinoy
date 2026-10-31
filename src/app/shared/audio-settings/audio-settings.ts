import { Component, OnDestroy, inject } from '@angular/core';
import { AudioChannel, TumbangAudio, VolumeChannel } from '../../core/services/tumbang-audio';

@Component({
  selector: 'app-audio-settings',
  templateUrl: './audio-settings.html',
  styleUrl: './audio-settings.css',
})
export class AudioSettingsPanel implements OnDestroy {
  readonly audio = inject(TumbangAudio);
  readonly mixers: { id: AudioChannel; name: string; description: string; symbol: string }[] = [
    { id: 'effects', name: 'Game effects', description: 'Slipper throws, concrete thuds, rock clacks, and tin-can clatter.', symbol: '✦' },
    { id: 'interface', name: 'Interface', description: 'Button cues and the low-Juice alert.', symbol: '◉' },
  ];
  changeVolume(channel: VolumeChannel, event: Event): void {
    this.audio.setVolume(channel, Number((event.target as HTMLInputElement).value));
  }
  ngOnDestroy(): void { this.audio.stopPreview(); }
}
