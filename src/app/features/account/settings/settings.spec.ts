import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { afterEach } from 'vitest';
import { TumbangAudio, DEFAULT_AUDIO } from '../../../core/services/tumbang-audio';
import { Settings } from './settings';
import { User } from '../../../core/services/user';
import { AccountState } from '../../../core/services/account-state';
import { Confirmation } from '../../../core/services/confirmation';
import { AuthUser } from '../../../core/services/auth';

describe('Account settings', () => {
  afterEach(() => localStorage.clear());
  const player: AuthUser = { id: 1, username: 'Juan', tansans: 0, juice: 100 };
  function setup() {
    const service = { saveSettings: vi.fn(() => of({ user: player })) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: User, useValue: service }] });
    const state = TestBed.inject(AccountState);
    state.set(player);
    const fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, service, state, confirmation: TestBed.inject(Confirmation) };
  }

  function editSound(fixture: ReturnType<typeof setup>['fixture'], channel = 'master', value = '42') {
    const slider = fixture.nativeElement.querySelector(`#audio-${channel}`) as HTMLInputElement;
    expect(fixture.nativeElement.querySelector(`label[for="audio-${channel}"]`)).toBeTruthy();
    slider.value = value; slider.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(slider.getAttribute('aria-valuetext')).toBe(`${value} percent`);
  }

  it('keeps sound changes in a draft until the user confirms Save', () => {
    const { fixture, component, service, confirmation } = setup();
    const audio = TestBed.inject(TumbangAudio), panel = component.soundPanel()!;
    for (const channel of ['master', 'effects', 'interface']) editSound(fixture, channel);
    expect(audio.settings()).toEqual(DEFAULT_AUDIO);
    expect(localStorage.getItem('tubong.audio.v1.1')).toBeNull();
    expect(component.hasDraft).toBe(false); expect(panel.hasChanges()).toBe(true);
    panel.save(); panel.save();
    expect(confirmation.active()?.title).toContain('Are you sure');
    expect(confirmation.active()?.message).toContain('Master 42%');
    confirmation.respond(false);
    expect(panel.hasChanges()).toBe(true); expect(audio.settings()).toEqual(DEFAULT_AUDIO);
    panel.save(); confirmation.respond(true); fixture.detectChanges();
    expect(audio.settings()).toEqual({ master: 42, effects: 42, interface: 42, muted: false });
    expect(JSON.parse(localStorage.getItem('tubong.audio.v1.1')!).effects).toBe(42);
    expect(panel.hasChanges()).toBe(false); expect(panel.message()).toContain('saved');
    expect(service.saveSettings).not.toHaveBeenCalled(); expect(component.confirmLeave()).toBe(true);
  });

  it('previews draft levels without saving and confirms discarding defaults or mute edits', () => {
    const { fixture, component, confirmation } = setup(); const panel = component.soundPanel()!;
    const audio = TestBed.inject(TumbangAudio), preview = vi.spyOn(audio, 'preview').mockResolvedValue();
    editSound(fixture, 'effects', '35');
    const button = fixture.nativeElement.querySelector('[aria-label="Preview Game effects"]') as HTMLButtonElement;
    button.click(); expect(preview).toHaveBeenCalledWith('effects', { ...DEFAULT_AUDIO, effects: 35 });
    panel.toggleMute(); fixture.detectChanges(); expect(button.disabled).toBe(true); expect(audio.settings().muted).toBe(false);
    panel.discard(); confirmation.respond(false); expect(panel.draft().muted).toBe(true);
    panel.discard(); confirmation.respond(true); fixture.detectChanges();
    expect(panel.draft()).toEqual(DEFAULT_AUDIO); expect(button.disabled).toBe(false); expect(panel.hasChanges()).toBe(false);
    audio.setVolume('effects', 25); fixture.detectChanges();
    panel.restoreDefaults(); expect(panel.hasChanges()).toBe(true); expect(audio.settings().effects).toBe(25);
    const stop = vi.spyOn(audio, 'stopPreview'); fixture.destroy(); expect(stop).toHaveBeenCalled();
  });

  it('warns for sound-only and combined drafts on navigation and browser tab close', () => {
    const { fixture, component, confirmation } = setup(); editSound(fixture);
    const unload = new Event('beforeunload', { cancelable: true });
    component.onBeforeUnload(unload as BeforeUnloadEvent); expect(unload.defaultPrevented).toBe(true);
    const answer = component.confirmLeave(); let leave: boolean | undefined;
    if (typeof answer !== 'boolean') answer.subscribe(value => leave = value);
    expect(confirmation.active()?.message).toContain('sound settings'); confirmation.respond(false);
    expect(leave).toBe(false); expect(component.soundPanel()!.draft().master).toBe(42);
    component.forms.username.patchValue({ value: 'NewName', currentPassword: 'old-password' });
    const combined = component.confirmLeave();
    if (typeof combined !== 'boolean') combined.subscribe(value => leave = value);
    expect(confirmation.active()?.message).toContain('sign-in changes'); confirmation.respond(true); expect(leave).toBe(true);
    fixture.destroy(); expect(TestBed.inject(TumbangAudio).settings()).toEqual(DEFAULT_AUDIO);
    expect(localStorage.getItem('tubong.audio.v1.1')).toBeNull();
  });

  it('clears tab-close protection after saving or discarding the sound draft', () => {
    const { fixture, component, confirmation } = setup(); const panel = component.soundPanel()!;
    editSound(fixture); panel.save(); confirmation.respond(true); fixture.detectChanges();
    const savedUnload = new Event('beforeunload', { cancelable: true });
    component.onBeforeUnload(savedUnload as BeforeUnloadEvent); expect(savedUnload.defaultPrevented).toBe(false);
    editSound(fixture, 'master', '58'); panel.discard(); confirmation.respond(true); fixture.detectChanges();
    expect(panel.draft().master).toBe(42); expect(component.confirmLeave()).toBe(true);
  });

  it('keeps unsaved levels and leave protection if browser storage rejects a save', () => {
    const { fixture, component, confirmation } = setup(); const panel = component.soundPanel()!;
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    try {
      editSound(fixture); panel.save(); confirmation.respond(true); fixture.detectChanges();
      expect(panel.saveError()).toContain('could not save'); expect(panel.draft().master).toBe(42);
      expect(panel.hasChanges()).toBe(true); expect(TestBed.inject(TumbangAudio).settings()).toEqual(DEFAULT_AUDIO);
      expect(localStorage.getItem('tubong.audio.v1.1')).toBeNull();
    } finally { storage.mockRestore(); }
    panel.save(); confirmation.respond(true); fixture.detectChanges(); expect(panel.hasChanges()).toBe(false);
  });

  it('retains sound edits during same-account updates, but rejects stale confirmations after an account switch', () => {
    const { fixture, component, confirmation, state } = setup(); const panel = component.soundPanel()!;
    editSound(fixture); state.set({ ...player, username: 'JuanNew' }); fixture.detectChanges();
    expect(panel.draft().master).toBe(42);
    panel.save(); state.set({ ...player, id: 2 }); fixture.detectChanges(); confirmation.respond(true);
    expect(TestBed.inject(TumbangAudio).settings()).toEqual(DEFAULT_AUDIO);
    expect(panel.draft()).toEqual(DEFAULT_AUDIO); expect(panel.hasChanges()).toBe(false);
    expect(localStorage.getItem('tubong.audio.v1.1')).toBeNull(); expect(localStorage.getItem('tubong.audio.v1.2')).toBeNull();
  });

  it.each(['username', 'password'] as const)('requires confirmation before changing %s', action => {
    const { component, service, confirmation } = setup();
    const value = action === 'username' ? 'JuanNew' : 'new-password-123';
    component.forms[action].setValue({ value, currentPassword: 'old-password', confirmPassword: value });
    component.save(action);
    expect(service.saveSettings).not.toHaveBeenCalled();
    expect(confirmation.active()?.title).toContain('Are you sure');
    expect(confirmation.active()?.message).not.toContain('old-password');
    if (action === 'password') expect(confirmation.active()?.message).not.toContain(value);
    confirmation.respond(false);
    expect(component.pending()).toBeNull();
    expect(component.forms[action].controls.value.value).toBe(value);
    expect(service.saveSettings).not.toHaveBeenCalled();
    service.saveSettings.mockReturnValue(of({ user: { ...player, ...(action !== 'password' ? { [action]: value } : {}) } }));
    component.save(action);
    confirmation.respond(true);
    expect(service.saveSettings).toHaveBeenCalledWith(action === 'password'
      ? { action, currentPassword: 'old-password', newPassword: value, confirmPassword: value }
      : { action, currentPassword: 'old-password', [action]: value });
    expect(component.hasDraft).toBe(false);
    expect(component.message()).toContain('has been changed');
    expect(component.forms[action].controls.currentPassword.value).toBe('');
  });

  it('rejects missing current passwords, invalid credentials and password mismatches', () => {
    const { component, service, confirmation } = setup();
    for (const [action, value, confirmPassword, currentPassword] of [
      ['username', 'NewName', '', ''], ['username', 'bad username', '', 'old-password'],
['password', 'short', 'short', 'old-password'],
      ['password', 'new-password', 'mismatch', 'old-password'],
      ['password', 'é'.repeat(37), 'é'.repeat(37), 'old-password'],
      ['password', 'password\0', 'password\0', 'old-password'],
    ] as const) {
      component.forms[action].setValue({ value, confirmPassword, currentPassword });
      component.save(action);
      expect(component.forms[action].invalid).toBe(true);
      expect(confirmation.active()).toBeNull();
    }
    expect(service.saveSettings).not.toHaveBeenCalled();
  });

  it('keeps rejected username edits for retry, clears the password, and preserves the session', () => {
    const { component, service, confirmation, state } = setup();
    service.saveSettings.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { message: 'Your current password is incorrect.' } })));
    component.forms.username.setValue({ value: 'JuanNew', currentPassword: 'wrong-password', confirmPassword: '' });
    component.save('username'); confirmation.respond(true);
    expect(component.error()).toContain('current password is incorrect');
    expect(component.forms.username.controls.value.value).toBe('JuanNew');
    expect(component.forms.username.controls.currentPassword.value).toBe('');
    expect(state.user()).toEqual(player);
    expect(component.pending()).toBeNull();
  });

  it('blocks duplicate submissions and clears all entered current passwords after success', () => {
    const { component, service, confirmation } = setup();
    const request = new Subject<{ user: AuthUser }>();
    service.saveSettings.mockReturnValue(request);
    component.forms.username.patchValue({ value: 'NewName', currentPassword: 'old-password' });
    component.forms.password.controls.currentPassword.setValue('old-password');
    component.save('username'); component.save('username');
    confirmation.respond(true);
    component.save('username');
    expect(service.saveSettings).toHaveBeenCalledTimes(1);
    request.next({ user: { ...player, username: 'NewName' } }); request.complete();
    expect(component.forms.password.controls.currentPassword.value).toBe('');
    expect(component.hasDraft).toBe(false);
  });

  it('confirms discarding and leaving, retaining drafts when cancelled', () => {
    const { component, confirmation } = setup();
    expect(component.confirmLeave()).toBe(true);
    component.forms.username.patchValue({ value: 'NewName', currentPassword: 'old-password' });
    component.discard(); confirmation.respond(false);
    expect(component.hasDraft).toBe(true);
    const answer = component.confirmLeave();
    let leave: boolean | undefined;
    if (typeof answer !== 'boolean') answer.subscribe(value => leave = value);
    confirmation.respond(false);
    expect(leave).toBe(false);
    const unload = new Event('beforeunload', { cancelable: true });
    component.onBeforeUnload(unload as BeforeUnloadEvent);
    expect(unload.defaultPrevented).toBe(true);
    component.discard(); confirmation.respond(true);
    expect(component.hasDraft).toBe(false);
    expect(component.forms.username.controls.value.value).toBe('Juan');
  });

  it('clears drafts when the account changes and never submits the old account confirmation', () => {
    const { component, confirmation, state, fixture, service } = setup();
    component.forms.username.patchValue({ value: 'NewName', currentPassword: 'old-password' });
    component.save('username');
    state.set({ ...player, id: 2, username: 'Maria' });
    fixture.detectChanges();
    confirmation.respond(true);
    expect(service.saveSettings).not.toHaveBeenCalled();
    expect(component.forms.username.controls.value.value).toBe('Maria');
    expect(component.hasDraft).toBe(false);
  });
});
